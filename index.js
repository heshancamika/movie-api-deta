const express = require('express');
const axios = require('axios');
const cheerio = require('cheerio');
const https = require('https');
const compression = require('compression');
const NodeCache = require('node-cache');
require('dotenv').config();

const app = express();
app.use(compression());
app.set('json spaces', 2);

const PORT = process.env.PORT || 3005;

// -------------------- CACHE (TTL 10 minutes) --------------------
const cache = new NodeCache({ 
    stdTTL: 600,        // විනාඩි 10
    checkperiod: 120,
    useClones: false
});

// -------------------- COOKIES --------------------
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

const highSpeedAgent = new https.Agent({ 
    keepAlive: true, 
    maxSockets: 100, 
    keepAliveMsecs: 3000,
    freeSocketTimeout: 30000 
});

// -------------------- Concurrency (එකවර 10 බැගින්) --------------------
async function asyncPool(concurrency, items, handler) {
    const results = [];
    let index = 0;
    let active = 0;
    
    return new Promise((resolve) => {
        const next = async () => {
            if (index >= items.length && active === 0) {
                resolve(results);
                return;
            }
            while (active < concurrency && index < items.length) {
                const i = index++;
                active++;
                (async () => {
                    try {
                        results[i] = await handler(items[i]);
                    } catch {
                        results[i] = null;
                    } finally {
                        active--;
                        next();
                    }
                })();
            }
        };
        next();
    });
}

// -------------------- හරිම වේගවත් getCdnLink (timeout 5000, retry නැහැ) --------------------
async function getCdnLink(redirectUrl) {
    try {
        if (!redirectUrl || !redirectUrl.includes('/links/')) return null;
        
        const res = await axios.get(redirectUrl, { 
            headers: HEADERS, 
            timeout: 5000,        // 🎯 8s -> 5s
            httpsAgent: highSpeedAgent 
        });
        const $ = cheerio.load(res.data);
        
        let cdnUrl = null;
        $('a[href*="cdn.sinhalasub.net"]').each((_, el) => {
            const href = $(el).attr('href');
            if (href) {
                cdnUrl = href;
                return false; // break
            }
        });
        return cdnUrl;
    } catch (e) {
        return null; // retry නැහැ, වේගයට
    }
}

function extractSize(url) {
    if (!url) return "N/A";
    const decoded = decodeURIComponent(url);
    const match = decoded.match(/(\d+(?:\.\d+)?)\s*(GB|MB)/i);
    if (match) return `${match[1]} ${match[2].toUpperCase()}`;
    if (url.includes('1080p')) return "2.5 - 3.5 GB";
    if (url.includes('720p')) return "1.2 - 1.8 GB";
    if (url.includes('480p')) return "500 - 900 MB";
    return "N/A";
}

// -------------------- Scrape (වේගවත්ම) --------------------
async function scrapePageDetails(targetUrl) {
    const cacheKey = `movie_${targetUrl}`;
    const cached = cache.get(cacheKey);
    if (cached) {
        console.log(`🔄 Cache: ${targetUrl}`);
        return cached;
    }

    try {
        console.log(`⏳ Scraping: ${targetUrl}`);
        const response = await axios.get(targetUrl, { 
            headers: HEADERS, 
            timeout: 12000, 
            httpsAgent: highSpeedAgent 
        });
        const $ = cheerio.load(response.data);

        // 🎯 DLServer-01 තියෙන links විතරක් ගන්න (අනිත් ඒවා මග හරින්න)
        const rawLinks = [];
        $('a[href*="/links/"]').each((_, el) => {
            const href = $(el).attr('href');
            const text = $(el).text().toLowerCase();
            if (href && (text.includes('dlserver-01') || text.includes('server-01'))) {
                rawLinks.push(href);
            }
        });

        // DLServer නැතිනම්, පළමු 5 links විතරක් ගන්න
        if (rawLinks.length === 0) {
            $('a[href*="/links/"]').each((_, el) => {
                const href = $(el).attr('href');
                if (href && rawLinks.length < 5) {
                    rawLinks.push(href);
                }
            });
        }

        if (rawLinks.length === 0) return [];

        console.log(`⏳ Resolving ${rawLinks.length} links (concurrent)...`);
        
        // 🎯 එකවර 10 බැගින්
        const cdnLinks = await asyncPool(10, rawLinks, getCdnLink);

        const results = [];
        for (const cdn of cdnLinks) {
            if (cdn && !results.some(r => r.download_url === cdn)) {
                let quality = "HD";
                if (cdn.includes('1080p')) quality = "FHD 1080p";
                else if (cdn.includes('720p')) quality = "HD 720p";
                else if (cdn.includes('480p')) quality = "SD 480p";
                
                results.push({
                    quality,
                    size: extractSize(cdn),
                    download_url: cdn
                });
            }
        }

        results.sort((a, b) => {
            if (a.quality.includes('1080p')) return -1;
            if (b.quality.includes('1080p')) return 1;
            if (a.quality.includes('720p')) return -1;
            return 0;
        });

        if (results.length > 0) {
            cache.set(cacheKey, results);
            console.log(`💾 Cached: ${results.length} links`);
        }

        return results;

    } catch (err) {
        console.error(`❌ Error: ${err.message}`);
        return [];
    }
}

// -------------------- Search (වේගවත්) --------------------
async function searchMovie(movieName) {
    const cacheKey = `search_${movieName.toLowerCase().trim()}`;
    const cached = cache.get(cacheKey);
    if (cached) return cached;

    try {
        let query = movieName.trim();
        if (query.toLowerCase() === 'spiderman') query = 'spider-man';
        
        const url = `https://sinhalasub.lk/?s=${encodeURIComponent(query)}`;
        const response = await axios.get(url, { 
            headers: HEADERS, 
            timeout: 8000,
            httpsAgent: highSpeedAgent 
        });
        const $ = cheerio.load(response.data);
        
        let movieUrl = null;
        $('a[href*="/movies/"]').each((_, el) => {
            const href = $(el).attr('href');
            if (href && href !== "https://sinhalasub.lk/movies/") {
                movieUrl = href;
                return false;
            }
        });

        if (movieUrl) {
            cache.set(cacheKey, movieUrl);
            console.log(`💾 Search cached: ${movieName}`);
        }
        return movieUrl;

    } catch (err) {
        console.error(`❌ Search error: ${err.message}`);
        return null;
    }
}

// -------------------- API Route --------------------
app.get('/api/movie', async (req, res) => {
    const start = Date.now();
    const movieUrl = req.query.url;
    const movieName = req.query.text || req.query.name;

    const send = (data, status = 200) => {
        const time = Date.now() - start;
        console.log(`⏱️ Response time: ${time}ms`);
        res.status(status).json({
            status: status === 200,
            owner: "@KingPoddaModz",
            ...data,
            responseTime: `${time}ms`
        });
    };

    if (movieName) {
        try {
            const found = await searchMovie(movieName);
            if (!found) return send({ error: "Movie not found" }, 404);
            
            const result = await scrapePageDetails(found);
            if (!result || result.length === 0) {
                return send({ error: "No download links found" }, 404);
            }
            return send({ result });
        } catch (err) {
            return send({ error: err.message }, 500);
        }
    }

    if (movieUrl) {
        const result = await scrapePageDetails(movieUrl);
        if (!result || result.length === 0) {
            return send({ error: "No download links found" }, 404);
        }
        return send({ result });
    }

    send({ error: "Use ?text=MovieName or ?url=..." }, 400);
});

// -------------------- Cache Stats --------------------
app.get('/api/cache/stats', (req, res) => {
    res.json({
        keys: cache.keys(),
        size: cache.keys().length,
        stats: cache.getStats()
    });
});

// -------------------- Start --------------------
app.listen(PORT, () => {
    console.log(`🚀 API running on port ${PORT}`);
    console.log(`💾 Cache TTL: 10 minutes`);
});
