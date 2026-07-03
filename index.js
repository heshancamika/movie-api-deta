const express = require('express');
const axios = require('axios');
const cheerio = require('cheerio');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());

// Root endpoint
app.get('/', (req, res) => {
    res.json({
        status: true,
        message: '🎬 SinhalaSub Movie API is running!',
        usage: 'GET /api/movie?url=https://sinhalasub.lk/movies/...'
    });
});

// ✅ Movie API Endpoint - URL එකෙන් වැඩ කරනවා
app.get('/api/movie', async (req, res) => {
    const movieUrl = req.query.url;

    if (!movieUrl) {
        return res.status(400).json({
            status: false,
            error: 'Missing "url" parameter. Example: /api/movie?url=https://sinhalasub.lk/movies/spider-man-no-way-home-2021-sinhala-subtitles/'
        });
    }

    // URL එක හරිද කියලා check කරන්න
    if (!movieUrl.includes('sinhalasub.lk/movies/')) {
        return res.status(400).json({
            status: false,
            error: 'Invalid URL. Must be a sinhalasub.lk movie page.'
        });
    }

    console.log(`📥 Fetching: ${movieUrl}`);

    try {
        // Movie page එකට request එකක් යවන්න
        const response = await axios.get(movieUrl, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
                'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8'
            },
            timeout: 15000
        });

        const $ = cheerio.load(response.data);

        // Movie title එක ගන්න
        const title = $('h1.entry-title').text().trim() || $('h1').first().text().trim() || 'Unknown Title';

        // 🔥 Download links හොයාගන්න - ඔබ දුන් page එකට හරියටම ගැලපෙන විදියට
        const downloadLinks = [];

        // 1. "Links" table එකෙන් data ගන්න (ඔබ දුන් page එකේ තියෙන table එක)
        $('table').each((i, table) => {
            const rows = $(table).find('tr');
            rows.each((j, row) => {
                const cols = $(row).find('td');
                if (cols.length >= 3) {
                    const quality = $(cols[0]).text().trim();
                    const size = $(cols[1]).text().trim();
                    // Clicks එක තමයි 3rd column එක
                    
                    // මෙම row එකට අදාළ download link එක හොයන්න
                    // බොහෝ විට link එක තියෙන්නේ quality column එකේ <a> tag එකක් විදියට
                    const link = $(cols[0]).find('a').attr('href') || 
                                 $(cols[1]).find('a').attr('href') ||
                                 $(row).find('a').attr('href');
                    
                    if (link && (link.includes('cdn.sinhalasub.net') || link.includes('download'))) {
                        downloadLinks.push({
                            quality: quality || 'Unknown',
                            size: size || 'Unknown',
                            download_url: link
                        });
                    }
                }
            });
        });

        // 2. ඉහතින් නොලැබුනොත්, all links වලින් download links හොයන්න
        if (downloadLinks.length === 0) {
            $('a[href*="cdn.sinhalasub.net"]').each((i, el) => {
                const url = $(el).attr('href');
                const text = $(el).text().trim();
                
                // Quality and size extract කරන්න
                const qualityMatch = text.match(/(FHD 1080p|HD 720p|SD 480p|1080p|720p|480p|FHD|HD|SD)/i);
                const sizeMatch = text.match(/([\d.]+)\s*(GB|MB)/i);
                
                downloadLinks.push({
                    quality: qualityMatch ? qualityMatch[0] : 'Unknown',
                    size: sizeMatch ? `${sizeMatch[1]} ${sizeMatch[2]}` : 'Unknown',
                    download_url: url
                });
            });
        }

        // 3. තවමත් නොලැබුනොත්, all links check කරන්න
        if (downloadLinks.length === 0) {
            $('a').each((i, el) => {
                const href = $(el).attr('href');
                if (href && (href.includes('cdn.sinhalasub.net') || href.includes('/download/'))) {
                    downloadLinks.push({
                        quality: 'Unknown',
                        size: 'Unknown',
                        download_url: href
                    });
                }
            });
        }

        // ✅ Success response එක
        res.json({
            status: true,
            owner: '@KingPoddaModz',
            movie: {
                title: title,
                url: movieUrl
            },
            result: downloadLinks.length > 0 ? downloadLinks : [
                {
                    quality: 'N/A',
                    size: 'N/A',
                    download_url: 'No download links found. The page structure may have changed.'
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
    console.log(`📌 Example: http://localhost:${PORT}/api/movie?url=https://sinhalasub.lk/movies/spider-man-no-way-home-2021-sinhala-subtitles/`);
});
