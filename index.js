const express = require('express');
const axios = require('axios');
const cheerio = require('cheerio');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());

app.get('/', (req, res) => {
    res.json({
        status: true,
        message: '🎬 SinhalaSub Movie API is running!',
        usage: 'GET /api/movie?url=https://sinhalasub.lk/movies/...'
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
        // 1. Movie page එකේ HTML එක ගන්න
        const response = await axios.get(movieUrl, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
            }
        });

        const $ = cheerio.load(response.data);
        
        // 2. Movie ID එක හොයාගන්න (URL එකෙන්)
        const movieId = movieUrl.match(/\/movies\/([^\/]+)/)?.[1] || '';
        console.log(`📌 Movie ID: ${movieId}`);

        // 3. Title එක ගන්න
        const title = $('h1.entry-title').text().trim() || 'Unknown Title';

        // 4. 🔥 නිවැරදිව Download Links හොයාගන්න - නව ක්‍රමය
        const downloadLinks = [];

        // මෙම page එකේ තියෙන සියලුම <a> tags check කරන්න
        $('a').each((i, el) => {
            const href = $(el).attr('href');
            const text = $(el).text().trim();
            
            // cdn.sinhalasub.net links හොයන්න
            if (href && href.includes('cdn.sinhalasub.net')) {
                // Quality එක හොයාගන්න (text එකෙන් හෝ parent element එකෙන්)
                let quality = 'Unknown';
                let size = 'Unknown';
                
                // Check if there's a parent td with quality/size
                const parentTd = $(el).closest('td');
                if (parentTd.length > 0) {
                    const siblings = parentTd.siblings();
                    siblings.each((j, sibling) => {
                        const text = $(sibling).text().trim();
                        if (text.match(/(FHD|HD|SD|1080p|720p|480p)/i)) {
                            quality = text;
                        }
                        if (text.match(/([\d.]+)\s*(GB|MB)/i)) {
                            size = text;
                        }
                    });
                }
                
                downloadLinks.push({
                    quality: quality,
                    size: size,
                    download_url: href
                });
            }
        });

        // 5. තවමත් links නැතිනම්, API එකෙන් ගන්න උත්සාහ කරන්න
        if (downloadLinks.length === 0) {
            console.log('⚠️ No direct links found, trying API method...');
            
            // sinhalasub.lk එකේ internal API එක use කරන්න උත්සාහ කරන්න
            const apiUrl = `https://sinhalasub.lk/wp-json/movie/v1/get-downloads?id=${movieId}`;
            try {
                const apiResponse = await axios.get(apiUrl, {
                    headers: {
                        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
                        'Referer': movieUrl
                    }
                });
                
                if (apiResponse.data && apiResponse.data.downloads) {
                    apiResponse.data.downloads.forEach(item => {
                        downloadLinks.push({
                            quality: item.quality || 'Unknown',
                            size: item.size || 'Unknown',
                            download_url: item.url || item.link || ''
                        });
                    });
                }
            } catch (apiError) {
                console.log('⚠️ API method failed:', apiError.message);
            }
        }

        // 6. තවමත් links නැතිනම්, fallback ක්‍රමයක්
        if (downloadLinks.length === 0) {
            // Check if there are any links in the page that might be downloads
            $('a[href*="download"]').each((i, el) => {
                const href = $(el).attr('href');
                if (href) {
                    downloadLinks.push({
                        quality: 'Unknown',
                        size: 'Unknown',
                        download_url: href
                    });
                }
            });
        }

        // 7. Duplicate links ඉවත් කරන්න
        const uniqueLinks = [];
        const seenUrls = new Set();
        downloadLinks.forEach(item => {
            if (item.download_url && !seenUrls.has(item.download_url)) {
                seenUrls.add(item.download_url);
                uniqueLinks.push(item);
            }
        });

        // ✅ Response එක
        res.json({
            status: true,
            owner: '@KingPoddaModz',
            movie: {
                title: title,
                url: movieUrl,
                id: movieId
            },
            result: uniqueLinks.length > 0 ? uniqueLinks : [
                {
                    quality: 'N/A',
                    size: 'N/A',
                    download_url: '⚠️ Download links are hidden. Please check the page directly.'
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
    console.log(`📌 Example: http://localhost:${PORT}/api/movie?url=https://sinhalasub.lk/movies/spider-man-no-way-home-2021-sinhala-subtitles/`);
});
