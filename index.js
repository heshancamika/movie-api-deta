const express = require('express');
const axios = require('axios');
const cheerio = require('cheerio');
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

app.get('/api/movie', async (req, res) => {
    const movieUrl = req.query.url;
    const movieName = req.query.name;

    // 🎯 1. ක්‍රමය: නමෙන් සෙවීම (Sinhalasub අභ්‍යන්තර Live Search API එක භාවිතයෙන්)
    if (movieName) {
        try {
            console.log(`Searching for movie via Live Search API: ${movieName}`);
            
            // සයිට් එකේ ඇතුළෙන්ම සර්ච් ඩේටා ගන්නා නිල API එකට රික්වෙස්ට් එකක් යවනවා
            const searchApiUrl = `https://sinhalasub.lk/wp-json/dooplay/search/?keyword=${encodeURIComponent(movieName)}`;
            
            const apiResponse = await axios.get(searchApiUrl, { 
                headers: {
                    ...HEADERS,
                    "Accept": "application/json, text/javascript, */*; q=0.01"
                }, 
                timeout: 10000 
            });

            let firstMovieUrl = null;

            // සයිට් එකේ API එකෙන් ලැබෙන JSON data වලින් පළමු චිත්‍රපටයේ URL එක ගන්නවා
            if (apiResponse.data && typeof apiResponse.data === 'object') {
                const keys = Object.keys(apiResponse.data);
                if (keys.length > 0 && apiResponse.data[keys[0]]) {
                    firstMovieUrl = apiResponse.data[keys[0]].url;
                }
            }

            // Fallback: යම් හෙයකින් API එක වැඩ නොකලොත් පරණ HTML සර්ච් ක්‍රමය ක්‍රියාත්මක වෙනවා
            if (!firstMovieUrl) {
                console.log("Live API failed, trying HTML search fallback...");
                const searchHtmlUrl = `https://sinhalasub.lk/?s=${encodeURIComponent(movieName)}`;
                const htmlRes = await axios.get(searchHtmlUrl, { headers: HEADERS, timeout: 10000 });
                const $ = cheerio.load(htmlRes.data);
                
                $('.result-item article, article, .movies-list article').each((_, element) => {
                    if (!firstMovieUrl) {
                        const href = $(element).find('a').attr('href');
                        if (href && href.includes('/movies/')) {
                            firstMovieUrl = href;
                        }
                    }
                });
            }

            if (!firstMovieUrl) {
                return res.status(404).json({ status: false, owner: "@KingPoddaModz", error: "No movies found." });
            }

            console.log(`Found Movie URL: ${firstMovieUrl}. Resolving CDN links...`);
            const movieResult = await scrapePageDetails(firstMovieUrl);
            return res.json({ status: true, owner: "@KingPoddaModz", result: movieResult });

        } catch (error) {
            return res.status(500).json({ status: false, owner: "@KingPoddaModz", error: "Search error: " + error.message });
        }
    }

    // 2. ක්‍රමය: URL එකෙන් කෙලින්ම සෙවීම
    if (movieUrl) {
        const movieResult = await scrapePageDetails(movieUrl);
        return res.json({ status: true, owner: "@KingPoddaModz", result: movieResult });
    }

    return res.status(400).json({ status: false, owner: "@KingPoddaModz", error: "Missing parameters." });
});

app.set('json spaces', 2); 

app.listen(PORT, () => {
    console.log(`🚀 Perfect Live-Search Auto-Download API running on port ${PORT}`);
});

