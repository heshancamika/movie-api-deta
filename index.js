const express = require('express');
const axios = require('axios');
const cheerio = require('cheerio');
require('dotenv').config();

const app = express();
const PORT = 3005; // කලින් බ්ලොක් වුණු නිසා 3005 දැම්මා. ඕන නම් 3000 කරන්න.

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

async function scrapePageDetails(targetUrl) {
    try {
        const response = await axios.get(targetUrl, { headers: HEADERS, timeout: 10000 });
        const $ = cheerio.load(response.data);

        // 🎯 Title එක හරියටම ගන්න ක්‍රම කිහිපයක් (Fallbacks)
        let title = "N/A";
        if ($('.sheader .data h1').length > 0) {
            title = $('.sheader .data h1').text().trim();
        } else if ($('h1.entry-title').length > 0) {
            title = $('h1.entry-title').text().trim();
        } else if ($('h1').length > 0) {
            title = $('h1').first().text().trim();
        } else if ($('meta[property="og:title"]').length > 0) {
            title = $('meta[property="og:title"]').attr('content');
        }

        // 🎯 Image එක හරියටම ගන්න ක්‍රම කිහිපයක්
        let image = "N/A";
        if ($('.poster img').length > 0) {
            image = $('.poster img').attr('src') || $('.poster img').attr('data-src');
        } else if ($('.wp-post-image').length > 0) {
            image = $('.wp-post-image').attr('src') || $('.wp-post-image').attr('data-src');
        } else if ($('meta[property="og:image"]').length > 0) {
            image = $('meta[property="og:image"]').attr('content');
        }

        const downloadLinks = [];
        $('a[href]').each((_, element) => {
            const href = $(element).attr('href');
            const text = $(element).text().trim();
            const textLower = text.toLowerCase();

            // අනවශ්‍ය /account/ වගේ ලින්ක්ස් සහ හිස් ලින්ක්ස් (#) අයින් කරමු
            if (href && href !== "#" && !href.includes('/account/')) {
                if (
                    ['download', 'ඩවුන්ලෝඩ්', 'direct', 'gdrive', 'පිවිසෙන්න', 'links', 'payout', 'pixeldrain', 'server'].some(x => textLower.includes(x)) ||
                    ['download', 'go.sinhalasub', 'links', 'drive'].some(y => href.toLowerCase().includes(y))
                ) {
                    // ෆේස්බුක්, වට්සැප් වගේ අනවශ්‍ය ලින්ක්ස් අයින් කිරීම
                    if (!['facebook', 'twitter', 'whatsapp'].some(z => href.toLowerCase().includes(z))) {
                        downloadLinks.push({
                            label: text || "Download Link",
                            link: href
                        });
                    }
                }
            }
        });

        return {
            title: title,
            image: image,
            url: targetUrl,
            download_links: downloadLinks
        };
    } catch (err) {
        console.error(`Scraping failed for ${targetUrl}: ${err.message}`);
        return null;
    }
}

app.get('/api/movie', async (req, res) => {
    const movieUrl = req.query.url;
    const movieName = req.query.name;

    if (movieName) {
        try {
            const searchUrl = `https://sinhalasub.lk/?s=${encodeURIComponent(movieName)}`;
            const response = await axios.get(searchUrl, { headers: HEADERS, timeout: 10000 });
            const $ = cheerio.load(response.data);
            
            let firstMovieUrl = null;

            $('article, .result-item article').each((_, element) => {
                if (!firstMovieUrl) {
                    const titleTag = $(element).find('.details .title a') || $(element).find('h2 a') || $(element).find('a');
                    const href = titleTag.attr('href');
                    if (href && href.includes('/movies/')) {
                        firstMovieUrl = href;
                    }
                }
            });

            if (!firstMovieUrl) {
                return res.status(404).json({ status: false, owner: "@KingPoddaModz", error: "No movies found for this name." });
            }

            const movieDetails = await scrapePageDetails(firstMovieUrl);
            if (!movieDetails) {
                return res.status(500).json({ status: false, owner: "@KingPoddaModz", error: "Failed to fetch movie details." });
            }

            return res.json({
                status: true,
                owner: "@KingPoddaModz",
                result: [movieDetails]
            });

        } catch (error) {
            return res.status(500).json({ status: false, owner: "@KingPoddaModz", error: "Search failed: " + error.message });
        }
    }

    if (movieUrl) {
        const movieDetails = await scrapePageDetails(movieUrl);
        if (!movieDetails) {
            return res.status(500).json({ status: false, owner: "@KingPoddaModz", error: "Failed to fetch URL details." });
        }

        return res.json({
            status: true,
            owner: "@KingPoddaModz",
            result: [movieDetails]
        });
    }

    return res.status(400).json({
        status: false,
        owner: "@KingPoddaModz",
        error: "Please provide either 'url' or 'name' parameter."
    });
});

app.listen(PORT, () => {
    console.log(`🚀 API Server is running on port ${PORT}`);
});

