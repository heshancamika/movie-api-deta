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

// 🎯 රීඩිරෙක්ට් ලින්ක් එක ඇතුළට ගිහින් ඇත්තම cdn.sinhalasub.net ලින්ක් එක විතරක් ගන්නා Function එක
async function getCdnLink(redirectUrl) {
    try {
        if (!redirectUrl.includes('/links/')) return null;

        const res = await axios.get(redirectUrl, { headers: HEADERS, timeout: 6000 });
        const $ = cheerio.load(res.data);
        
        let cdnUrl = null;
        $('a').each((_, el) => {
            const href = $(el).attr('href');
            // 🎯 අපිට ඕනෙ cdn.sinhalasub.net කියන ඩිරෙක්ට් ඩවුන්ලෝඩ් සර්වර් ලින්ක් එක විතරයි!
            if (href && href.includes('cdn.sinhalasub.net')) {
                cdnUrl = href;
            }
        });
        return cdnUrl;
    } catch (e) {
        return null;
    }
}

// 🎯 ලින්ක් එකේ නම ඇතුළෙන් ෆයිල් සයිස් එක (3.54 GB වගේ) කපා ගන්නා ක්‍රමය
function extractSize(url) {
    // සාමාන්‍යයෙන් ලින්ක් එක අග තියෙන ෆයිල් නම කියවා ගන්නවා
    const decodedUrl = decodeURIComponent(url);
    const matches = decodedUrl.match(/(?:_|\s|-)(\d+(?:\.\d+)?\s*(?:GB|MB|gb|mb))/);
    if (matches) {
        return matches[1].toUpperCase();
    }
    
    // හොයාගන්න බැරි වුණොත් Default අගයන් දෙනවා (සාමාන්‍ය ෆිල්ම් වල හැටියට)
    if (url.includes('1080p')) return "2.5 GB - 3.5 GB";
    if (url.includes('720p')) return "1.2 GB - 1.8 GB";
    if (url.includes('480p')) return "500 MB - 900 MB";
    return "N/A";
}

async function scrapePageDetails(targetUrl) {
    try {
        const response = await axios.get(targetUrl, { headers: HEADERS, timeout: 10000 });
        const $ = cheerio.load(response.data);

        const rawLinks = [];
        $('a[href]').each((_, element) => {
            const href = $(element).attr('href');
            const text = $(element).text().trim();

            // DLServer-01 හෝ ඩිරෙක්ට් සර්වර් ලින්ක්ස් විතරක් මුලින්ම අල්ලනවා
            if (href && href.includes('/links/') && (text.includes('DLServer-01') || text.toLowerCase().includes('server-01'))) {
                rawLinks.push(href);
            }
        });

        // ලින්ක්ස් ටික නැත්නම්, ඕනෑම /links/ එකක් චෙක් කරලා cdn ලින්ක්ස් තියෙනවද බලනවා
        if (rawLinks.length === 0) {
            $('a[href*="/links/"]').each((_, element) => {
                const href = $(element).attr('href');
                if (href) rawLinks.push(href);
            });
        }

        const results = [];
        console.log(`Filtering and resolving ${rawLinks.length} potential direct download links...`);

        for (const link of rawLinks) {
            const cdnLink = await getCdnLink(link);
            
            if (cdnLink) {
                let quality = "HD / Other";
                if (cdnLink.toLowerCase().includes('1080p')) quality = "FHD 1080p";
                else if (cdnLink.toLowerCase().includes('720p')) quality = "HD 720p";
                else if (cdnLink.toLowerCase().includes('480p')) quality = "SD 480p";

                const size = extractSize(cdnLink);

                // 🎯 ඩියුප්ලිකේට් ලින්ක්ස් වැටෙන එක නතර කරන්න
                if (!results.some(r => r.download_url === cdnLink)) {
                    results.push({
                        quality: quality,
                        size: size,
                        download_url: cdnLink
                    });
                }
            }
        }

        // Quality එක අනුව පිළිවෙලකට සකස් කිරීම (1080p -> 720p -> 480p)
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

    if (movieName) {
        try {
            const searchUrl = `https://sinhalasub.lk/?s=${encodeURIComponent(movieName)}`;
            const response = await axios.get(searchUrl, { headers: HEADERS, timeout: 10000 });
            const $ = cheerio.load(response.data);
            
            let firstMovieUrl = null;

            $('.result-item article, article, .movies-list article').each((_, element) => {
                if (!firstMovieUrl) {
                    const href = $(element).find('a').attr('href');
                    if (href && href.includes('/movies/')) {
                        firstMovieUrl = href;
                    }
                }
            });

            if (!firstMovieUrl) {
                return res.status(404).json({ status: false, owner: "@KingPoddaModz", error: "No movies found." });
            }

            const movieResult = await scrapePageDetails(firstMovieUrl);
            return res.json({ status: true, owner: "@KingPoddaModz", result: movieResult });

        } catch (error) {
            return res.status(500).json({ status: false, owner: "@KingPoddaModz", error: error.message });
        }
    }

    if (movieUrl) {
        const movieResult = await scrapePageDetails(movieUrl);
        return res.json({ status: true, owner: "@KingPoddaModz", result: movieResult });
    }

    return res.status(400).json({ status: false, owner: "@KingPoddaModz", error: "Missing parameters." });
});

app.set('json spaces', 2); 

app.listen(PORT, () => {
    console.log(`🚀 Perfect Direct Auto-Download API running on port ${PORT}`);
});

