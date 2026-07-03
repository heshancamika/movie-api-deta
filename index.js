const express = require('express');
const axios = require('axios');
const cheerio = require('cheerio');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());

app.get('/', (req, res) => {
    res.json({
        status: true,
        message: '🎬 SinhalaSub Movie API is running!'
    });
});

app.get('/api/movie', async (req, res) => {
    const movieUrl = req.query.url;

    if (!movieUrl) {
        return res.status(400).json({
            status: false,
            error: 'Missing "url" parameter.'
        });
    }

    console.log(`📥 Fetching: ${movieUrl}`);

    try {
        const response = await axios.get(movieUrl, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
            },
            timeout: 15000
        });

        const $ = cheerio.load(response.data);
        const downloadLinks = [];

        // All links with cdn.sinhalasub.net
        $('a[href*="cdn.sinhalasub.net"]').each((i, el) => {
            const href = $(el).attr('href');
            const text = $(el).text().trim();
            
            let quality = 'Unknown';
            let size = 'Unknown';
            
            // Check parent elements for quality/size
            let parent = $(el).parent();
            for (let j = 0; j < 5; j++) {
                const parentText = parent.text().trim();
                const qualityMatch = parentText.match(/(FHD\s*1080p|HD\s*720p|SD\s*480p|1080p|720p|480p)/i);
                if (qualityMatch) {
                    quality = qualityMatch[0];
                }
                const sizeMatch = parentText.match(/([\d.]+)\s*(GB|MB)/i);
                if (sizeMatch) {
                    size = `${sizeMatch[1]} ${sizeMatch[2]}`;
                }
                if (quality !== 'Unknown' && size !== 'Unknown') break;
                parent = parent.parent();
            }
            
            downloadLinks.push({
                quality: quality,
                size: size,
                download_url: href
            });
        });

        // If no links found, check all links
        if (downloadLinks.length === 0) {
            $('a').each((i, el) => {
                const href = $(el).attr('href');
                if (href && (href.includes('download') || href.includes('cdn'))) {
                    downloadLinks.push({
                        quality: 'Unknown',
                        size: 'Unknown',
                        download_url: href
                    });
                }
            });
        }

        // Remove duplicates
        const uniqueLinks = [];
        const seenUrls = new Set();
        downloadLinks.forEach(item => {
            if (item.download_url && !seenUrls.has(item.download_url)) {
                seenUrls.add(item.download_url);
                uniqueLinks.push(item);
            }
        });

        res.json({
            status: true,
            owner: '@KingPoddaModz',
            movie: {
                title: $('h1.entry-title').text().trim() || 'Unknown Title',
                url: movieUrl
            },
            result: uniqueLinks.length > 0 ? uniqueLinks : [
                {
                    quality: 'N/A',
                    size: 'N/A',
                    download_url: 'No download links found.'
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

app.listen(PORT, '0.0.0.0', () => {
    console.log(`🚀 Movie API running on http://0.0.0.0:${PORT}`);
});
