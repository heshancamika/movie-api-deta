const express = require('express');
const puppeteer = require('puppeteer');

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
            error: 'Missing "url" parameter. Example: /api/movie?url=https://sinhalasub.lk/movies/spider-man-no-way-home-2021-sinhala-subtitles/'
        });
    }

    if (!movieUrl.includes('sinhalasub.lk/movies/')) {
        return res.status(400).json({
            status: false,
            error: 'Invalid URL. Must be a sinhalasub.lk movie page.'
        });
    }

    console.log(`📥 Fetching: ${movieUrl}`);

    let browser = null;
    try {
        // Puppeteer browser එක start කරන්න
        browser = await puppeteer.launch({
            headless: true,
            args: ['--no-sandbox', '--disable-setuid-sandbox']
        });

        const page = await browser.newPage();
        
        // User-Agent set කරන්න
        await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');
        
        // Movie page එකට යන්න
        await page.goto(movieUrl, { 
            waitUntil: 'networkidle2',
            timeout: 30000 
        });

        // 📌 Movie Title එක ගන්න
        const title = await page.$eval('h1.entry-title', el => el.textContent.trim())
            .catch(() => 'Unknown Title');

        // 🔥 JavaScript execute කරලා download links හොයාගන්න
        const downloadLinks = await page.evaluate(() => {
            const links = [];
            
            // 1. cdn.sinhalasub.net links හොයන්න
            document.querySelectorAll('a[href*="cdn.sinhalasub.net"]').forEach(el => {
                const href = el.href;
                const text = el.textContent.trim();
                
                // Quality එක හොයාගන්න
                let quality = 'Unknown';
                let size = 'Unknown';
                
                // Parent elements වලින් quality/size හොයන්න
                let parent = el.parentElement;
                while (parent) {
                    const parentText = parent.textContent.trim();
                    const qualityMatch = parentText.match(/(FHD\s*1080p|HD\s*720p|SD\s*480p|1080p|720p|480p)/i);
                    if (qualityMatch) {
                        quality = qualityMatch[0];
                    }
                    const sizeMatch = parentText.match(/([\d.]+)\s*(GB|MB)/i);
                    if (sizeMatch) {
                        size = `${sizeMatch[1]} ${sizeMatch[2]}`;
                    }
                    if (quality !== 'Unknown' && size !== 'Unknown') break;
                    parent = parent.parentElement;
                }
                
                links.push({
                    quality: quality,
                    size: size,
                    download_url: href
                });
            });
            
            // 2. තවමත් links නැත්නම්, table එකෙන් හොයන්න
            if (links.length === 0) {
                document.querySelectorAll('table').forEach(table => {
                    const rows = table.querySelectorAll('tr');
                    rows.forEach(row => {
                        const cols = row.querySelectorAll('td');
                        if (cols.length >= 2) {
                            const quality = cols[0].textContent.trim();
                            const size = cols[1].textContent.trim();
                            
                            // Check if this row has a link
                            const link = row.querySelector('a[href*="cdn.sinhalasub.net"]');
                            if (link) {
                                links.push({
                                    quality: quality || 'Unknown',
                                    size: size || 'Unknown',
                                    download_url: link.href
                                });
                            }
                        }
                    });
                });
            }
            
            return links;
        });

        // Duplicate links ඉවත් කරන්න
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
                url: movieUrl
            },
            result: uniqueLinks.length > 0 ? uniqueLinks : [
                {
                    quality: 'N/A',
                    size: 'N/A',
                    download_url: 'No download links found. The page may require login or have anti-scraping measures.'
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
    } finally {
        if (browser) {
            await browser.close();
        }
    }
});

app.listen(PORT, '0.0.0.0', () => {
    console.log(`🚀 Movie API running on http://0.0.0.0:${PORT}`);
    console.log(`📌 Example: http://localhost:${PORT}/api/movie?url=https://sinhalasub.lk/movies/spider-man-no-way-home-2021-sinhala-subtitles/`);
});
