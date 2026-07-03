const express = require('express');
const axios = require('axios');
const cheerio = require('cheerio');

const app = express();
const PORT = process.env.PORT || 3000;

// JSON responses සඳහා
app.use(express.json());

// Root endpoint
app.get('/', (req, res) => {
    res.json({
        status: true,
        message: '🎬 SinhalaSub Movie API is running!',
        usage: 'GET /api/movie?name=avatar'
    });
});

// ✅ Movie API Endpoint - මෙතනට තමයි request එක එන්නේ
app.get('/api/movie', async (req, res) => {
    const movieName = req.query.name;

    if (!movieName) {
        return res.status(400).json({
            status: false,
            error: 'Missing "name" parameter. Example: /api/movie?name=avatar'
        });
    }

    console.log(`📥 Searching for: ${movieName}`);

    try {
        // 1. sinhalasub.lk එකේ search page එකට go කරන්න
        const searchUrl = `https://sinhalasub.lk/?s=${encodeURIComponent(movieName)}&post_type=post`;
        const searchResp = await axios.get(searchUrl, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
            }
        });

        const $ = cheerio.load(searchResp.data);

        // 2. පළමු movie link එක හොයාගන්න
        let movieLink = null;
        $('article a').each((i, el) => {
            const href = $(el).attr('href');
            if (href && href.includes('/movies/')) {
                movieLink = href;
                return false; // break loop
            }
        });

        if (!movieLink) {
            return res.status(404).json({
                status: false,
                error: `Movie "${movieName}" not found on sinhalasub.lk`
            });
        }

        console.log(`🔗 Movie page: ${movieLink}`);

        // 3. Movie page එකට go කරලා download links ගන්න
        const movieResp = await axios.get(movieLink, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
            }
        });

        const $$ = cheerio.load(movieResp.data);

        // 4. Movie details extract කරන්න
        const title = $$('h1.entry-title').text().trim() || movieName;

        // 5. Download links හොයාගන්න
        const downloadLinks = [];
        
        // Method 1: 'Download Links' හෝ 'Links Options' කියන div/table එක හොයන්න
        $$('a[href*="cdn.sinhalasub.net"]').each((i, el) => {
            const url = $$(el).attr('href');
            const text = $$(el).text().trim();
            
            // Quality and size extract කරන්න (උදා: "FHD 1080p | 3.54 GB")
            const qualityMatch = text.match(/(FHD 1080p|HD 720p|SD 480p|1080p|720p|480p)/i);
            const sizeMatch = text.match(/([\d.]+)\s*(GB|MB)/i);
            
            downloadLinks.push({
                quality: qualityMatch ? qualityMatch[0] : 'Unknown',
                size: sizeMatch ? `${sizeMatch[1]} ${sizeMatch[2]}` : 'Unknown',
                download_url: url
            });
        });

        // Method 2: ඉහතින් නොලැබුනොත්, all links වලින් download links හොයන්න
        if (downloadLinks.length === 0) {
            $$('a').each((i, el) => {
                const href = $$(el).attr('href');
                if (href && (href.includes('download') || href.includes('cdn'))) {
                    downloadLinks.push({
                        quality: 'Unknown',
                        size: 'Unknown',
                        download_url: href
                    });
                }
            });
        }

        // 6. Response එක send කරන්න
        res.json({
            status: true,
            owner: '@KingPoddaModz',
            movie: {
                title: title,
                url: movieLink
            },
            result: downloadLinks.length > 0 ? downloadLinks : [
                {
                    quality: 'N/A',
                    size: 'N/A',
                    download_url: 'No download links found on this page'
                }
            ]
        });

    } catch (error) {
        console.error('❌ Error:', error.message);
        res.status(500).json({
            status: false,
            error: 'Failed to fetch movie data',
            details: error.message
        });
    }
});

// Start server
app.listen(PORT, '0.0.0.0', () => {
    console.log(`🚀 Movie API running on http://0.0.0.0:${PORT}`);
    console.log(`📌 Example: http://localhost:${PORT}/api/movie?name=avatar`);
});
