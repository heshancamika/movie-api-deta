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

    try {
        const response = await axios.get(movieUrl, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
                'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8'
            },
            timeout: 15000
        });

        const $ = cheerio.load(response.data);
        const downloadLinks = [];

        // ✅ හරියටම Movie Title එක ගන්න
        const title = $('h1.entry-title').text().trim() || 
                      $('h1').first().text().trim() || 
                      'Unknown Title';

        // 🔥 නිවැරදිව Table එකෙන් Download Links ගන්න
        // "Links" කියන heading එකට පස්සේ තියෙන tables හොයන්න
        let foundLinks = false;

        // සියලුම tables හරහා යන්න
        $('table').each((i, table) => {
            const rows = $(table).find('tr');
            
            rows.each((j, row) => {
                const cols = $(row).find('td');
                
                // අවම වශයෙන් columns 2ක් තියෙන rows විතරක් ගන්න
                if (cols.length >= 2) {
                    const quality = $(cols[0]).text().trim();
                    const size = $(cols[1]).text().trim();
                    
                    // Quality එකේ "FHD", "HD", "SD", "1080p", "720p", "480p" වගේ keywords තියෙනවද check කරන්න
                    const qualityMatch = quality.match(/(FHD|HD|SD|1080p|720p|480p)/i);
                    
                    if (qualityMatch && size) {
                        // මෙම row එකට අදාළ download link එක හොයන්න
                        // Link එක තියෙන්නේ මුල් column එකේ <a> tag එකක් විදියට හෝ මුලු row එකම clickable එකක් විදියට
                        let downloadUrl = null;
                        
                        // Check if there's an <a> tag in the quality column
                        const linkInQuality = $(cols[0]).find('a').attr('href');
                        if (linkInQuality && linkInQuality.includes('cdn.sinhalasub.net')) {
                            downloadUrl = linkInQuality;
                        }
                        
                        // Check if there's an <a> tag in the size column
                        if (!downloadUrl) {
                            const linkInSize = $(cols[1]).find('a').attr('href');
                            if (linkInSize && linkInSize.includes('cdn.sinhalasub.net')) {
                                downloadUrl = linkInSize;
                            }
                        }
                        
                        // Check if the entire row has an <a> tag
                        if (!downloadUrl) {
                            const rowLink = $(row).find('a').attr('href');
                            if (rowLink && rowLink.includes('cdn.sinhalasub.net')) {
                                downloadUrl = rowLink;
                            }
                        }
                        
                        // If we found a download URL, add it to the list
                        if (downloadUrl) {
                            downloadLinks.push({
                                quality: quality || 'Unknown',
                                size: size || 'Unknown',
                                download_url: downloadUrl
                            });
                            foundLinks = true;
                        }
                    }
                }
            });
        });

        // ඉහතින් නොලැබුනොත්, global search එකක් කරන්න
        if (!foundLinks) {
            console.log('⚠️ Table parsing failed, trying global search...');
            
            // All links with cdn.sinhalasub.net
            $('a[href*="cdn.sinhalasub.net"]').each((i, el) => {
                const url = $(el).attr('href');
                const text = $(el).text().trim();
                
                // Try to extract quality and size from the text
                const qualityMatch = text.match(/(FHD|HD|SD|1080p|720p|480p)/i);
                const sizeMatch = text.match(/([\d.]+)\s*(GB|MB)/i);
                
                // Check if this link is in a table context
                const parent = $(el).closest('td');
                if (parent.length > 0) {
                    const siblings = parent.siblings();
                    let quality = qualityMatch ? qualityMatch[0] : 'Unknown';
                    let size = 'Unknown';
                    
                    // Try to get size from adjacent cells
                    siblings.each((k, sibling) => {
                        const text = $(sibling).text().trim();
                        if (text.match(/([\d.]+)\s*(GB|MB)/i)) {
                            size = text;
                        }
                    });
                    
                    downloadLinks.push({
                        quality: quality,
                        size: size,
                        download_url: url
                    });
                } else {
                    // Not in a table, just add as is
                    downloadLinks.push({
                        quality: qualityMatch ? qualityMatch[0] : 'Unknown',
                        size: sizeMatch ? `${sizeMatch[1]} ${sizeMatch[2]}` : 'Unknown',
                        download_url: url
                    });
                }
            });
        }

        // Remove duplicates (same download URL)
        const uniqueLinks = [];
        const seenUrls = new Set();
        downloadLinks.forEach(item => {
            if (!seenUrls.has(item.download_url)) {
                seenUrls.add(item.download_url);
                uniqueLinks.push(item);
            }
        });

        // ✅ Success response
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

app.listen(PORT, '0.0.0.0', () => {
    console.log(`🚀 Movie API running on http://0.0.0.0:${PORT}`);
    console.log(`📌 Example: http://localhost:${PORT}/api/movie?url=https://sinhalasub.lk/movies/spider-man-no-way-home-2021-sinhala-subtitles/`);
});
