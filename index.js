const express = require('express');
const axios = require('axios');
const cheerio = require('cheerio');
require('dotenv').config();

const app = express();
const PORT = 3000;

// .env එකෙන් කුකීස් කියවීම
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

// එක පිටුවක විස්තර සූරාගන්නා පොදු Function එක
async function scrapePageDetails(targetUrl) {
    try {
        const response = await axios.get(targetUrl, { headers: HEADERS, timeout: 10000 });
        const $ = cheerio.load(response.data);

        const title = $('h1').text().trim() || "N/A";
        
        let image = "N/A";
        const imgTag = $('.poster img') || $('.wp-post-image') || $('meta[property="og:image"]');
        if (imgTag.length > 0) {
            image = imgTag.attr('src') || imgTag.attr('data-src') || imgTag.attr('content') || "N/A";
        }

        const downloadLinks = [];
        $('a[href]').each((_, element) => {
            const href = $(element).attr('href');
            const text = $(element).text().trim().toLowerCase();

            if (
                ['download', 'ඩවුන්ලෝඩ්', 'direct', 'gdrive', 'පිවිසෙන්න'].some(x => text.includes(x)) ||
                ['download', 'go.sinhalasub', 'links', 'drive'].some(y => href.toLowerCase().includes(y))
            ) {
                if (!['telegram', 'facebook', 'twitter', 'whatsapp'].some(z => href.toLowerCase().includes(z))) {
                    downloadLinks.push({
                        label: $(element).text().trim() || "Download Link",
                        link: href
                    });
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

    // 1. ක්‍රමය: ?name= දුන්නොත් සර්ච් කරලා පළවෙනි එක විතරක් ගන්නවා
    if (movieName) {
        try {
            const searchUrl = `https://sinhalasub.lk/?s=${encodeURIComponent(movieName)}`;
            const response = await axios.get(searchUrl, { headers: HEADERS, timeout: 10000 });
            const $ = cheerio.load(response.data);
            
            let firstMovieUrl = null;

            // සර්ච් රිසල්ට්ස් වලින් පළවෙනිම චිත්‍රපට ලින්ක් එක විතරක් හොයාගන්නවා
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

            // ඒ හොයාගත්ත පළවෙනි Original ලින්ක් එක ඇතුළට ගිහින් ඩේටා ටික ගන්නවා
            console.log(`Found first link: ${firstMovieUrl}. Fetching details...`);
            const movieDetails = await scrapePageDetails(firstMovieUrl);

            if (!movieDetails) {
                return res.status(500).json({ status: false, owner: "@KingPoddaModz", error: "Failed to fetch original movie details." });
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

    // 2. ක්‍රමය: ?url= දුන්නොත් කෙලින්ම ඒ පිටුවේ විස්තර ගන්නවා
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
    console.log(`🚀 API Server is running on http://localhost:${PORT}`);
});
