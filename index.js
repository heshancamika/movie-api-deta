const express = require('express');
const axios = require('axios');
const cheerio = require('cheerio');
const NodeCache = require('node-cache');
const https = require('https');
require('dotenv').config();

const app = express();
const PORT = 3005;
const cache = new NodeCache({ stdTTL: 3600 });

// ✅ HTTP Keep-Alive Agent
const agent = new https.Agent({
    keepAlive: true,
    maxSockets: 15,
    maxFreeSockets: 5,
    timeout: 30000
});

const COOKIES = { /* ... ඔබගේ cookies ... */ };
const cookieString = Object.entries(COOKIES)
    .filter(([_, val]) => val)
    .map(([key, val]) => `${key}=${val}`)
    .join('; ');

const HEADERS = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9",
    "Accept-Language": "en-US,en;q=0.5",
    "Connection": "keep-alive",
    "Cookie": cookieString
};

const TIMEOUT = 5000;

// ✅ Parallel CDN Link Resolver
async function getCdnLink(redirectUrl) {
    try {
        if (!redirectUrl.includes('/links/')) return null;
        const res = await axios.get(redirectUrl, { 
            headers: HEADERS, 
            timeout: TIMEOUT,
            httpsAgent: agent
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
        return null;
    }
}

function extractSize(url) {
    const decodedUrl = decodeURIComponent(url);
    const matches = decodedUrl.match(/(?:_|\s|-)(\d+(?:\.\d+)?\s*(?:GB|MB|gb|mb))/);
    if (matches) return matches[1].toUpperCase();
    if (url.includes('1080p')) return "2.5 GB - 3.5 GB";
    if (url.includes('720p')) return "1.2 GB - 1.8 GB";
    if (url.includes('480p')) return "500 MB - 900 MB";
    return "N/A";
}

// ✅ Parallel Scraping
async function scrapePageDetails(targetUrl) {
    try {
        const response = await axios.get(targetUrl, { 
            headers: HEADERS, 
            timeout: 8000,
            httpsAgent: agent
        });
        const $ = cheerio.load(response.data);

        const rawLinks = [];
        $('a[href*="/links/"]').each((_, element) => {
            const href = $(element).attr('href');
            const text = $(element).text().trim();
            if (href && (text.includes('DLServer-01') || text.toLowerCase().includes('server-01'))) {
                rawLinks.push(href);
            }
        });

        if (rawLinks.length === 0) {
            $('a[href*="/links/"]').each((_, element) => {
                const href = $(element).attr('href');
                if (href) rawLinks.push(href);
            });
        }

        console.log(`⚡ Resolving ${rawLinks.length} links in parallel...`);

        // ✅ Parallel Requests
        const cdnResults = await Promise.all(
            rawLinks.map(link => getCdnLink(link))
        );

        const results = [];
        cdnResults.forEach((cdnLink) => {
            if (cdnLink) {
                let quality = "HD / Other";
                if (cdnLink.toLowerCase().includes('1080p')) quality = "FHD 1080p";
                else if (cdnLink.toLowerCase().includes('720p')) quality = "HD 720p";
                else if (cdnLink.toLowerCase().includes('480p')) quality = "SD 480p";

                const size = extractSize(cdnLink);
                if (!results.some(r => r.download_url === cdnLink)) {
                    results.push({ quality, size, download_url: cdnLink });
                }
            }
        });

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

// ✅ Main Endpoint with Cache
app.get('/api/movie', async (req, res) => {
    const movieUrl = req.query.url;
    const movieName = req.query.text || req.query.name;

    const cacheKey = movieName || movieUrl;
    const cached = cache.get(cacheKey);
    if (cached) {
        console.log(`✅ Cache hit: ${cacheKey}`);
        return res.json({ status: true, owner: "@KingPoddaModz", result: cached });
    }

    try {
        let result = [];

        if (movieName) {
            console.log(`🔍 Searching: ${movieName}`);
            const searchUrl = `https://sinhalasub.lk/?s=${encodeURIComponent(movieName)}`;
            const response = await axios.get(searchUrl, { 
                headers: HEADERS, 
                timeout: 8000,
                httpsAgent: agent
            });
            const $ = cheerio.load(response.data);
            let firstMovieUrl = null;

            $('a[href*="/movies/"]').each((_, el) => {
                if (!firstMovieUrl) {
                    const href = $(el).attr('href');
                    if (href && href !== "https://sinhalasub.lk/movies/") {
                        firstMovieUrl = href;
                    }
                }
            });

            if (!firstMovieUrl) {
                return res.status(404).json({ status: false, owner: "@KingPoddaModz", error: "No movies found." });
            }

            console.log(`✅ Found: ${firstMovieUrl}`);
            result = await scrapePageDetails(firstMovieUrl);
        } else if (movieUrl) {
            result = await scrapePageDetails(movieUrl);
        } else {
            return res.status(400).json({ status: false, owner: "@KingPoddaModz", error: "Missing parameters. Use ?text= or ?url=" });
        }

        // ✅ Cache එකට දාන්න
        if (result.length > 0) {
            cache.set(cacheKey, result);
        }

        res.json({ status: true, owner: "@KingPoddaModz", result: result });
    } catch (error) {
        res.status(500).json({ status: false, owner: "@KingPoddaModz", error: error.message });
    }
});

app.listen(PORT, () => {
    console.log(`🚀 Optimized API Server running on port ${PORT}`);
});
