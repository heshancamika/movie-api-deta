const express = require('express');
const axios = require('axios');
const cheerio = require('cheerio');
require('dotenv').config();

const app = express();
const PORT = 3005; 

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

// 🎯 සයිට් එකේ /links/ පිටුව ඇතුළට ගිහින් ඇත්තම ලින්ක් එක අරන්, ඒක "Direct Download" ලින්ක් එකක් කරන කොටස
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
            // Pixeldrain පිටුවට නොගොස් කෙලින්ම ඩවුන්ලෝඩ් වීමට සකස් කිරීම
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

// ලේබල් එක හෝ ලින්ක් එක අනුව Quality එක (480p, 720p, 1080p) වෙන් කරගන්නා හැටි
function detectQuality(text, link) {
    const fullText = (text + " " + link).toLowerCase();
    if (fullText.includes('1080p') || fullText.includes('1080')) return '1080p';
    if (fullText.includes('720p') || fullText.includes('720')) return '720p';
    if (fullText.includes('480p') || fullText.includes('480')) return '480p';
    return 'HD / Other';
}

// තනි චිත්‍රපට පිටුවක විස්තර ලස්සනට ව්‍යුහගත (Structure) කරන කොටස
async function scrapePageDetails(targetUrl) {
    try {
        const response = await axios.get(targetUrl, { headers: HEADERS, timeout: 10000 });
        const $ = cheerio.load(response.data);

        // Title එක ගැනීම
        let title = "N/A";
        let rawTitle = $('title').text().trim();
        if (rawTitle) {
            title = rawTitle.split(' - ')[0].trim();
        }

        // Image එක ගැනීම
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
                    ['download', 'ඩවුන්ලෝඩ්', 'direct', 'gdrive', 'links', 'payout', 'pixeldrain', 'server'].some(x => textLower.includes(x)) ||
                    ['download', 'go.sinhalasub', 'links', 'drive'].some(y => href.toLowerCase().includes(y))
                ) {
                    if (!['facebook', 'twitter', 'whatsapp'].some(z => href.toLowerCase().includes(z))) {
                        downloadLinksRaw.push({
                            label: text || "Download Link",
                            link: href
                        });
                    }
                }
            }
        });

        const direct_downloads = [];
        const telegram_links = [];
        let subtitle_link = "N/A";

        console.log(`Structuring ${downloadLinksRaw.length} links into categories...`);
        
        for (const item of downloadLinksRaw) {
            // ටෙලිග්‍රෑම් ලින්ක්ස් වෙන් කිරීම
            if (item.link.includes('t.me') || item.label.toLowerCase().includes('telegram') || item.label.toLowerCase().includes('telagram')) {
                telegram_links.push({
                    server: item.label,
                    link: item.link
                });
                continue;
            }

            // සබ්ටයිටල් ලින්ක් එක වෙන් කිරීම
            if (item.label.toLowerCase().includes('subtitle') || item.link.includes('.zip')) {
                subtitle_link = item.link;
                continue;
            }

            // සාමාන්‍ย ඩවුන්ලෝඩ් ලින්ක්ස් ටික ඩිරෙක්ට් කර Quality එක සෙවීම
            const directLink = await getDirectDownloadUrl(item.link);
            const quality = detectQuality(item.label, directLink);

            direct_downloads.push({
                server: item.label,
                quality: quality,
                link: directLink
            });
        }

        return {
            title: title,
            image: image,
            url: targetUrl,
            direct_downloads: direct_downloads,
            telegram_links: telegram_links,
            subtitle: subtitle_link
        };
    } catch (err) {
        console.error(`Scraping failed: ${err.message}`);
        return null;
    }
}

app.get('/api/movie', async (req, res) => {
    const movieUrl = req.query.url;
    const movieName = req.query.name;

    // 1. ක්‍රමය: ?name= මඟින් සෙවීම
    if (movieName) {
        try {
            const searchUrl = `https://sinhalasub.lk/?s=${encodeURIComponent(movieName)}`;
            console.log(`Searching for movie: ${movieName}`);
            
            const response = await axios.get(searchUrl, { headers: HEADERS, timeout: 10000 });
            const $ = cheerio.load(response.data);
            
            let firstMovieUrl = null;

            // සර්ච් පිටුවේ ඇති පළමු චිත්‍රපටයේ ලින්ක් එක සොයා ගැනීම
            $('.result-item article, article, .movies-list article').each((_, element) => {
                if (!firstMovieUrl) {
                    const href = $(element).find('a').attr('href');
                    if (href && href.includes('/movies/')) {
                        firstMovieUrl = href;
                    }
                }
            });

            // Fallback (සර්ච් ලිස්ට් එකේ නැතිනම් ඕනෑම තැනක ඇති පළමු /movies/ ලින්ක් එක ගැනීම)
            if (!firstMovieUrl) {
                $('a[href*="/movies/"]').each((_, el) => {
                    if (!firstMovieUrl) {
                        const href = $(el).attr('href');
                        if (href && href !== "https://sinhalasub.lk/movies/") {
                            firstMovieUrl = href;
                        }
                    }
                });
            }

            if (!firstMovieUrl) {
                return res.status(404).json({ status: false, owner: "@KingPoddaModz", error: "No movies found." });
            }

            console.log(`Found URL: ${firstMovieUrl}. Extracting data...`);
            const movieDetails = await scrapePageDetails(firstMovieUrl);
            return res.json({ status: true, owner: "@KingPoddaModz", result: movieDetails });

        } catch (error) {
            return res.status(500).json({ status: false, owner: "@KingPoddaModz", error: error.message });
        }
    }

    // 2. ක්‍රමය: ?url= මඟින් කෙලින්ම සෙවීම
    if (movieUrl) {
        const movieDetails = await scrapePageDetails(movieUrl);
        if (!movieDetails) {
            return res.status(500).json({ status: false, owner: "@KingPoddaModz", error: "Failed to extract URL details." });
        }
        return res.json({ status: true, owner: "@KingPoddaModz", result: movieDetails });
    }

    return res.status(400).json({ status: false, owner: "@KingPoddaModz", error: "Missing parameters. Use ?name= or ?url=" });
});

// 🎯 JSON Response එක පේළියෙන් පේළියට ලස්සනට (Pretty Print) බ්‍රවුසර් එකේ පෙන්වීමට:
app.set('json spaces', 2); 

app.listen(PORT, () => {
    console.log(`🚀 API Server is fully active on port ${PORT}`);
});

