const express = require('express');
const axios = require('axios');
const cheerio = require('cheerio');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const compression = require('compression');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(helmet());
app.use(compression());
app.use(cors());
app.use(morgan('combined'));
app.use(express.json());

// Root endpoint
app.get('/', (req, res) => {
    res.json({
        status: true,
        message: '🎬 SinhalaSub Movie API is running!',
        version: '1.0.0',
        endpoints: {
            movie: 'GET /api/movie?url=https://sinhalasub.lk/movies/...'
        }
    });
});

// Movie API endpoint
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

    console.log(`📥 [${new Date().toISOString()}] Fetching: ${movieUrl}`);

    try {
        const response = await axios.get(movieUrl, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
                'Accept-Language': 'en-US,en;q=0.9',
                'Referer': 'https://sinhalasub.lk/'
            },
            timeout: 15000
        });

        const $ = cheerio.load(response.data);
        const downloadLinks = [];

        // 🎯 Movie Title
        const title = $('h1.entry-title').text().trim() || 
                      $('h1').first().text().trim() || 
                      'Unknown Title';

        console.log(`📌 Title: ${title}`);

        // 🔥 ක්‍රමය 1: "Links" section එක හොයාගෙන ඊට පස්සේ tables parse කරන්න
        // "Links" කියන heading එක හොයාගන්න
        let linksSection = null;
        $('h2, h3, h4, strong, b').each((i, el) => {
            const text = $(el).text().trim();
            if (text.toLowerCase().includes('links') || text.includes('Options')) {
                linksSection = $(el).parent();
                return false;
            }
        });

        if (linksSection) {
            console.log('🔍 Found Links section');
            // Links section එකේ තියෙන tables හොයන්න
            linksSection.find('table').each((i, table) => {
                const rows = $(table).find('tr');
                rows.each((j, row) => {
                    const cols = $(row).find('td');
                    if (cols.length >= 2) {
                        const quality = $(cols[0]).text().trim();
                        const size = $(cols[1]).text().trim();
                        
                        // Quality එකේ FHD/HD/SD තියෙනවද check කරන්න
                        if (quality.match(/(FHD|HD|SD|1080p|720p|480p)/i)) {
                            // අපිට ඕනෙ මෙම row එකට අදාළ download link එක
                            // sinhalasub.lk එකේ download links තියෙන්නේ JavaScript onclick events වල
                            // ඒ නිසා අපිට ඒවා direct එකට ගන්න බැහැ
                            // නමුත් අපිට ඒවායේ quality සහ size විතරක් ගන්න පුළුවන්
                            downloadLinks.push({
                                quality: quality,
                                size: size,
                                download_url: '⚠️ Download link is hidden. Please visit the page directly.'
                            });
                        }
                    }
                });
            });
        }

        // 🔥 ක්‍රමය 2: cdn.sinhalasub.net links හොයන්න (direct links)
        if (downloadLinks.length === 0) {
            console.log('🔍 Searching for cdn.sinhalasub.net links...');
            $('a[href*="cdn.sinhalasub.net"]').each((i, el) => {
                const href = $(el).attr('href');
                let quality = 'Unknown';
                let size = 'Unknown';
                
                // Parent elements වලින් quality/size හොයන්න
                let parent = $(el).parent();
                for (let j = 0; j < 5; j++) {
                    if (parent.length === 0) break;
                    const parentText = parent.text().trim();
                    
                    const qualityMatch = parentText.match(/(FHD\s*1080p|HD\s*720p|SD\s*480p|1080p|720p|480p|FHD|HD|SD)/i);
                    if (qualityMatch) {
                        quality = qualityMatch[0].trim();
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
        }

        // 🔥 ක්‍රමය 3: onclick events වලින් links හොයන්න
        if (downloadLinks.length === 0) {
            console.log('🔍 Searching for onclick events...');
            $('a[onclick]').each((i, el) => {
                const onclick = $(el).attr('onclick');
                if (onclick && onclick.includes('download')) {
                    // Extract URL from onclick
                    const urlMatch = onclick.match(/https?:\/\/[^\s\'"]+/);
                    if (urlMatch) {
                        downloadLinks.push({
                            quality: 'Unknown',
                            size: 'Unknown',
                            download_url: urlMatch[0]
                        });
                    }
                }
            });
        }

        // 🔥 ක්‍රමය 4: window.location හෝ window.open links හොයන්න (script එකේ)
        if (downloadLinks.length === 0) {
            console.log('🔍 Searching in scripts...');
            $('script').each((i, el) => {
                const scriptContent = $(el).html();
                if (scriptContent) {
                    // Look for download URLs in script
                    const urlMatches = scriptContent.match(/https?:\/\/cdn\.sinhalasub\.net\/[^\s\'"]+/g);
                    if (urlMatches) {
                        urlMatches.forEach(url => {
                            downloadLinks.push({
                                quality: 'Unknown',
                                size: 'Unknown',
                                download_url: url
                            });
                        });
                    }
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

        console.log(`✅ Found ${uniqueLinks.length} download links`);

        // ✅ Response
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
                    download_url: '⚠️ No download links found. The download links are hidden behind JavaScript.'
                }
            ]
        });

    } catch (error) {
        console.error(`❌ [${new Date().toISOString()}] Error:`, error.message);
        res.status(500).json({
            status: false,
            error: 'Failed to fetch movie data',
            details: error.message
        });
    }
});

// 404 Handler
app.use((req, res) => {
    res.status(404).json({
        status: false,
        error: 'Endpoint not found'
    });
});

// Server start
app.listen(PORT, '0.0.0.0', () => {
    console.log(`🚀 Movie API running on http://0.0.0.0:${PORT}`);
    console.log(`📌 Example: http://localhost:${PORT}/api/movie?url=https://sinhalasub.lk/movies/spider-man-no-way-home-2021-sinhala-subtitles/`);
});
