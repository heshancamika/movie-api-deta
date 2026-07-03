const express = require('express');
const axios = require('axios');
const cheerio = require('cheerio');
// 🎯 FIX: Baileys එකේ තියෙන සුපිරිම internal download engine එක require කරගන්නවා
const { downloadContentFromMessage } = require('@whiskeysockets/baileys');
require('dotenv').config();

const app = express();
const PORT = 3005; 

const COOKIES = {
    "_ga_03W6RSCJV1": process.env._GA_03W6RSCJV1,
    "s9ifs0idfjlwfie32dekl": process.env.S9IFS0IDFJLVFIE32DEKL,
    "_ga": process.env._GA,
    "_gat": process.env._GAT,
    "_gid": process.env._GID,
    "dom3ic8zudi28v8lr6fgphwffqoz0j6c": process.env.DOM3IC8ZUDI28V8LR6FGPHWFFQOZ0J6C,
    "hu8935j4i9fq3hpuj9q39": process.env.HU8935J4I9FQ3HPUJ9Q39,
    "pp_idelay_1a10afe5fd8dc8069939f8a49fccbc26": process.env.PP_IDELAY_1A10AFE5FD8DC8069939F8A49FCCBC26,
    "starstruck_8c9b99985687fb6ab1d030c04b088ebb": process.env.STARSTRUCK
};

const cookieString = Object.entries(COOKIES)
    .filter(([_, val]) => val)
    .map(([key, val]) => `${key}=${val}`)
    .join('; ');

const HEADERS = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
    "Accept-Language": "en-US,en;q=0.5",
    "Connection": "keep-alive",
    "Cookie": cookieString
};

// රීඩිරෙක්ට් ලින්ක් එක ඇතුළට ගිහින් ඇත්තම cdn.sinhalasub.net ලින්ක් එක විතරක් ගන්නා හැටි
async function getCdnLink(redirectUrl) {
    try {
        if (!redirectUrl.includes('/links/')) return null;

        const res = await axios.get(redirectUrl, { headers: HEADERS, timeout: 6000 });
        const $ = cheerio.load(res.data);
        
        let cdnUrl = null;
        $('a').each((_, el) => {
            const href = $(el).attr('href');
            if (href && href.includes('cdn.sinhalasub.net')) {
                cdnUrl = href;
            }
        });
        return cdnUrl;
    } catch (e) {
        return null;
    }
}

// ෆයිල් සයිස් එක කපා ගන්නා ක්‍රමය
function extractSize(url) {
    const decodedUrl = decodeURIComponent(url);
    const matches = decodedUrl.match(/(?:_|\s|-)(\d+(?:\.\d+)?\s*(?:GB|MB|gb|mb))/);
    if (matches) {
        return matches[1].toUpperCase();
    }
    if (url.includes('1080p')) return "2.5 GB - 3.5 GB";
    if (url.includes('720p')) return "1.2 GB - 1.8 GB";
    if (url.includes('480p')) return "500 MB - 900 MB";
    return "N/A";
}

// තනි පිටුවක ඇති DLServer-01 ලින්ක්ස් ටික විතරක් පෙරලා ගැනීම
async function scrapePageDetails(targetUrl) {
    try {
        const response = await axios.get(targetUrl, { headers: HEADERS, timeout: 10000 });
        const $ = cheerio.load(response.data);

        const rawLinks = [];
        $('a[href]').each((_, element) => {
            const href = $(element).attr('href');
            const text = $(element).text().trim();

            if (href && href.includes('/links/') && (text.includes('DLServer-01') || text.toLowerCase().includes('server-01'))) {
                rawLinks.push(href);
            }
        });

        if (rawLinks.length === 0) {
            $('a[href*="/links/"]').each((_, element) => {
                const href = $(element).attr('href');
                if (href) rawLinks.push(href);
            });
        }

        const results = [];
        console.log(`Resolving ${rawLinks.length} potential direct download links...`);

        for (const link of rawLinks) {
            const cdnLink = await getCdnLink(link);
            
            if (cdnLink) {
                let quality = "HD / Other";
                if (cdnLink.toLowerCase().includes('1080p')) quality = "FHD 1080p";
                else if (cdnLink.toLowerCase().includes('720p')) quality = "HD 720p";
                else if (cdnLink.toLowerCase().includes('480p')) quality = "SD 480p";

                const size = extractSize(cdnLink);

                if (!results.some(r => r.download_url === cdnLink)) {
                    results.push({
                        quality: quality,
                        size: size,
                        download_url: cdnLink
                    });
                }
            }
        }

        results.sort((a, b) => {
            if (a.quality.includes('1080p')) return -1;
            if (b.quality.includes('1080p')) return 1;
            if (a.quality.includes('720p')) return -1;
            return 0;
        });

        return results;
    } catch (err) {
        console.error(`Scraping failed: ${err.message}`);
        return [];
    }
}

// 🎯 ප්‍රධාන Endpoint එක (Baileys Engine එකෙන් Speed කරපු එක)
app.get('/api/movie', async (req, res) => {
    const movieUrl = req.query.url;
    const movieName = req.query.text || req.query.name; 

    // 🎯 Baileys එකේ internal downloader එක හරහා full speed එකෙන් stream එක බොට් එකට දෙන ශ්‍රිතය
    const streamWithBaileysSpeed = async (movieResult) => {
        if (!movieResult || movieResult.length === 0) {
            return res.status(404).json({ status: false, owner: "@KingPoddaModz", error: "No direct download links found." });
        }

        let selectedMovie = movieResult.find(m => m.quality.includes('480p') || m.quality.toLowerCase().includes('sd'));
        if (!selectedMovie) {
            selectedMovie = movieResult[movieResult.length - 1]; 
        }

        console.log(`⚡ Downloading via Baileys Speed Engine from: ${selectedMovie.download_url}`);

        try {
            // 🎯 Axios වෙනුවට Baileys එකේ optimized fetch/stream ක්‍රමය පාවිච්චි කිරීම
            // මේකෙන් සිනහලsub එකේ ඉඳන් අපේ API එකට එන වේගය උපරිම වෙනවා
            const stream = await downloadContentFromMessage(
                { url: selectedMovie.download_url },
                'document' // document ටයිප් එකක් විදිහට stream එක direct ගන්නවා
            );

            // Response Headers ටික නිවැරදිව සෙට් කිරීම
            res.setHeader('Content-Type', 'video/mp4');
            res.setHeader('Accept-Ranges', 'bytes');

            // Baileys stream එක කෙලින්ම අපේ API response එකට pipe (තල්ලු) කිරීම
            stream.pipe(res);

        } catch (downloadErr) {
            console.error('Baileys Engine Speed Download Failed:', downloadErr.message);
            // බේලීස් එක අවුල් වුණොත් විතරක් Fallback එකක් විදිහට 302 Redirect එකක් දෙනවා
            return res.redirect(302, selectedMovie.download_url);
        }
    };

    if (movieName) {
        try {
            let searchQuery = movieName;
            if (searchQuery.toLowerCase() === 'spiderman') searchQuery = 'spider-man';

            console.log(`Searching for movie: ${searchQuery}`);
            const searchUrl = `https://sinhalasub.lk/?s=${encodeURIComponent(searchQuery)}`;
            
            const response = await axios.get(searchUrl, { headers: HEADERS, timeout: 10000 });
            const $ = cheerio.load(response.data);
            let firstMovieUrl = null;

            $('.result-item article, article, .movies-list article, .search-results article').each((_, element) => {
                if (!firstMovieUrl) {
                    const href = $(element).find('a').attr('href');
                    if (href && href.includes('/movies/') && href !== "https://sinhalasub.lk/movies/") {
                        firstMovieUrl = href;
                    }
                }
            });

            if (!firstMovieUrl) {
                $('a[href*="/movies/"]').each((_, el) => {
                    if (!firstMovieUrl) {
                        const href = $(el).attr('href');
                        if (href && href !== "https://sinhalasub.lk/movies/") {
                            firstMovieUrl = href;
                        }
                    }
                });
            }

            if (!firstMovieUrl) {
                return res.status(404).json({ status: false, owner: "@KingPoddaModz", error: "No movies found." });
            }

            console.log(`Found URL: ${firstMovieUrl}. Extracting direct links...`);
            const movieResult = await scrapePageDetails(firstMovieUrl);
            
            // 🎯 Baileys ස්පීඩ් එකෙන් stream එක රන් කරවනවා
            return await streamWithBaileysSpeed(movieResult);

        } catch (error) {
            return res.status(500).json({ status: false, owner: "@KingPoddaModz", error: error.message });
        }
    }

    if (movieUrl) {
        const movieResult = await scrapePageDetails(movieUrl);
        return await streamWithBaileysSpeed(movieResult);
    }

    return res.status(400).json({ status: false, owner: "@KingPoddaModz", error: "Missing parameters. Use ?text= or ?url=" });
});

app.set('json spaces', 2); 

app.listen(PORT, () => {
    console.log(`🚀 Ultimate Baileys-Speed API Server running on port ${PORT}`);
});

