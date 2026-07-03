const express = require('express');
const axios = require('axios');
const cheerio = require('cheerio');
require('dotenv').config();

const app = express();
const PORT = 3005; 

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

// 🎯 පිටුව ඇතුළේ තියෙන ඇත්තම ලින්ක් එක අරන්, ඒක "කෙලින්ම ඩවුන්ලෝඩ් වන" ලින්ක් එකක් බවට හරවන Function එක
async function getDirectDownloadUrl(redirectUrl) {
    try {
        if (!redirectUrl.includes('/links/')) return redirectUrl;

        const res = await axios.get(redirectUrl, { headers: HEADERS, timeout: 6000 });
        const $ = cheerio.load(res.data);
        
        let finalUrl = null;
        
        $('a').each((_, el) => {
            const href = $(el).attr('href');
            if (href && !href.includes('sinhalasub.lk') && (href.includes('pixeldrain') || href.includes('file') || href.includes('drive') || href.includes('http'))) {
                finalUrl = href;
            }
        });

        if (finalUrl) {
            // 🎯 Pixeldrain පිටුවට නොගොස් කෙලින්ම ඩවුන්ලෝඩ් වීම ආරම්භ කිරීමට ලින්ක් එක වෙනස් කිරීම
            if (finalUrl.includes('pixeldrain.com/u/')) {
                finalUrl = finalUrl.replace('pixeldrain.com/u/', 'pixeldrain.com/api/file/') + '?download';
            }
            return finalUrl;
        }

        return redirectUrl;
    } catch (e) {
        return redirectUrl;
    }
}

async function scrapePageDetails(targetUrl) {
    try {
        const response = await axios.get(targetUrl, { headers: HEADERS, timeout: 10000 });
        const $ = cheerio.load(response.data);

        let title = "N/A";
        let rawTitle = $('title').text().trim();
        if (rawTitle) {
            title = rawTitle.split(' - ')[0].trim();
        }

        let image = "N/A";
        if ($('meta[property="og:image"]').length > 0) {
            image = $('meta[property="og:image"]').attr('content').trim();
        } else if ($('.poster img').length > 0) {
            image = $('.poster img').attr('src') || $('.poster img').attr('data-src');
        }

        const downloadLinksRaw = [];
        $('a[href]').each((_, element) => {
            const href = $(element).attr('href');
            const text = $(element).text().trim();
            const textLower = text.toLowerCase();

            if (href && href !== "#" && !href.startsWith('#') && !href.includes('/account/')) {
                if (
                    ['download', 'ඩවුන්ලෝඩ්', 'direct', 'gdrive', 'පිවිසෙන්න', 'links', 'payout', 'pixeldrain', 'server'].some(x => textLower.includes(x)) ||
                    ['download', 'go.sinhalasub', 'links', 'drive'].some(y => href.toLowerCase().includes(y))
                ) {
                    if (!['facebook', 'twitter', 'whatsapp', 'telegram'].some(z => href.toLowerCase().includes(z))) {
                        downloadLinksRaw.push({
                            label: text || "Download Link",
                            link: href
                        });
                    }
                }
            }
        });

        const finalDownloadLinks = [];
        console.log(`Resolving ${downloadLinksRaw.length} links to Direct Downloads...`);
        
        for (const item of downloadLinksRaw) {
            const directLink = await getDirectDownloadUrl(item.link);
            finalDownloadLinks.push({
                label: item.label,
                link: directLink
            });
        }

        return {
            title: title,
            image: image,
            url: targetUrl,
            download_links: finalDownloadLinks
        };
    } catch (err) {
        console.error(`Scraping failed: ${err.message}`);
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
                return res.status(404).json({ status: false, owner: "@KingPoddaModz", error: "No movies found." });
            }

            const movieDetails = await scrapePageDetails(firstMovieUrl);
            return res.json({ status: true, owner: "@KingPoddaModz", result: [movieDetails] });

        } catch (error) {
            return res.status(500).json({ status: false, owner: "@KingPoddaModz", error: error.message });
        }
    }

    if (movieUrl) {
        const movieDetails = await scrapePageDetails(movieUrl);
        return res.json({ status: true, owner: "@KingPoddaModz", result: [movieDetails] });
    }

    return res.status(400).json({ status: false, owner: "@KingPoddaModz", error: "Missing parameters." });
});

app.listen(PORT, () => {
    console.log(`🚀 API Server running on port ${PORT}`);
});

