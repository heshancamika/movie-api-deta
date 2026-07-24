const express = require('express');
const axios = require('axios');
const cheerio = require('cheerio');
const https = require('https');
const compression = require('compression');
const pLimit = require('p-limit');
require('dotenv').config();

const app = express();
app.use(compression()); // 🚀 Response එක compress කරලා bandwidth ඉතිරි කරනවා
app.set('json spaces', 2);

// 🎯 Heroku වලදී නිවැරදි Port එක ගන්න
const PORT = process.env.PORT || 3005;

// -------------------- COOKIES සහ HEADERS --------------------
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

// 🚀 උපරිම වේගය සඳහා High-Speed Agent (Keep-Alive + Multiple Sockets)
const highSpeedAgent = new https.Agent({ 
    keepAlive: true, 
    maxSockets: 100, 
    keepAliveMsecs: 3000,
    freeSocketTimeout: 30000 
});

// 🎯 එකවර Request 5 බැගින් (Sinhalasub Block නොවී වේගවත් වෙන්න)
const limit = pLimit(5);

// -------------------- Helper Functions --------------------
async function getCdnLink(redirectUrl) {
    try {
        if (!redirectUrl || !redirectUrl.includes('/links/')) return null;

        const res = await axios.get(redirectUrl, { 
            headers: HEADERS, 
            timeout: 8000, // 6s -> 8s (මදක් වැඩි කලා)
            httpsAgent: highSpeedAgent 
        });
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
        return null; // වැටුණත් අනෙක් links වැඩ කරයි
    }
}

function extractSize(url) {
    if (!url) return "N/A";
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

// -------------------- ප්‍රධාන Scrape Function (Cache නැති, ඉක්මන්) --------------------
async function scrapePageDetails(targetUrl) {
    try {
        // 🟢 ප්‍රධාන පිටුව Load කරන්න
        const response = await axios.get(targetUrl, { 
            headers: HEADERS, 
            timeout: 10000, 
            httpsAgent: highSpeedAgent 
        });
        const $ = cheerio.load(response.data);

        // 🟢 'DLServer-01' තියෙන Links හොයන්න
        const rawLinks = [];
        $('a[href]').each((_, element) => {
            const href = $(element).attr('href');
            const text = $(element).text().trim();
            if (href && href.includes('/links/') && 
                (text.includes('DLServer-01') || text.toLowerCase().includes('server-01'))) {
                rawLinks.push(href);
            }
        });

        // උඩින් නොලැබුනොත් හැම /links/ එකම ගන්න
        if (rawLinks.length === 0) {
            $('a[href*="/links/"]').each((_, element) => {
                const href = $(element).attr('href');
                if (href) rawLinks.push(href);
            });
        }

        if (rawLinks.length === 0) {
            return [];
        }

        console.log(`⏳ Resolving ${rawLinks.length} links concurrently (max 5 at a time)...`);

        // 🚀 **මෙයින් තමයි වේගය වැඩි වෙන්නේ**
        // පෙර තිබුණු for loop එක ඉවත් කර, එකවර request යවනවා
        const promises = rawLinks.map(link => limit(() => getCdnLink(link)));
        const cdnLinks = await Promise.all(promises);

        // 🟢 ප්‍රතිඵල හොඳට පෙළගස්වන්න
        const results = [];
        for (const cdnLink of cdnLinks) {
            if (cdnLink) {
                let quality = "HD / Other";
                if (cdnLink.toLowerCase().includes('1080p')) quality = "FHD 1080p";
                else if (cdnLink.toLowerCase().includes('720p')) quality = "HD 720p";
                else if (cdnLink.toLowerCase().includes('480p')) quality = "SD 480p";

                const size = extractSize(cdnLink);

                // Duplicate links ඉවත් කරන්න
                if (!results.some(r => r.download_url === cdnLink)) {
                    results.push({
                        quality: quality,
                        size: size,
                        download_url: cdnLink
                    });
                }
            }
        }

        // 1080p පළමුව, පසුව 720p ලෙස sort කරන්න
        results.sort((a, b) => {
            if (a.quality.includes('1080p')) return -1;
            if (b.quality.includes('1080p')) return 1;
            if (a.quality.includes('720p')) return -1;
            return 0;
        });

        console.log(`✅ Found ${results.length} direct links.`);
        return results;

    } catch (err) {
        console.error(`❌ Scraping failed: ${err.message}`);
        return [];
    }
}

// -------------------- API Route එක --------------------
app.get('/api/movie', async (req, res) => {
    const movieUrl = req.query.url;
    const movieName = req.query.text || req.query.name; 

    // ප්‍රතිචාරය හැමවිටම JSON එකක්
    const sendResponse = (movieResult) => {
        if (!movieResult || movieResult.length === 0) {
            return res.status(404).json({ 
                status: false, 
                owner: "@KingPoddaModz", 
                error: "No direct download links found." 
            });
        }
        return res.json({ 
            status: true, 
            owner: "@KingPoddaModz", 
            result: movieResult 
        });
    };

    // 🟢 1. Text එකක් ආවොත් (Search)
    if (movieName) {
        try {
            let searchQuery = movieName.trim();
            if (searchQuery.toLowerCase() === 'spiderman') searchQuery = 'spider-man';

            console.log(`🔍 Searching for: ${searchQuery}`);
            const searchUrl = `https://sinhalasub.lk/?s=${encodeURIComponent(searchQuery)}`;
            
            const response = await axios.get(searchUrl, { 
                headers: HEADERS, 
                timeout: 10000, 
                httpsAgent: highSpeedAgent 
            });
            const $ = cheerio.load(response.data);
            let firstMovieUrl = null;

            // Search results එකෙන් පළමු movie එකේ link එක ගන්න
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
                return res.status(404).json({ 
                    status: false, 
                    owner: "@KingPoddaModz", 
                    error: "No movies found for your search." 
                });
            }

            console.log(`📄 Found URL: ${firstMovieUrl}. Extracting links...`);
            const movieResult = await scrapePageDetails(firstMovieUrl);
            return sendResponse(movieResult);

        } catch (error) {
            return res.status(500).json({ 
                status: false, 
                owner: "@KingPoddaModz", 
                error: error.message 
            });
        }
    }

    // 🟢 2. URL එකක් ආවොත් (සෘජුවම)
    if (movieUrl) {
        const movieResult = await scrapePageDetails(movieUrl);
        return sendResponse(movieResult);
    }

    // 🟢 3. දෙකම නැතිනම්
    return res.status(400).json({ 
        status: false, 
        owner: "@KingPoddaModz", 
        error: "Missing parameters. Use ?text=MovieName OR ?url=sinhalasub.lk/movies/..." 
    });
});

// -------------------- Server එක Start කරන්න --------------------
app.listen(PORT, () => {
    console.log(`🚀 Original JSON Movie API Server running on port ${PORT}`);
});
