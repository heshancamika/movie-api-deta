const axios = require('axios');
const cheerio = require('cheerio');
const fs = require('fs');
require('dotenv').config();

const BASE_URL = "https://sinhalasub.lk";
const MOVIES_URL = `${BASE_URL}/movies/`;

// .env ෆයිල් එකෙන් ඔක්කොම කුකීස් ටික හරියටම කියවීම
const COOKIES = {
    "_ga_03W6RSCJV1": process.env._GA_03W6RSCJV1,
    "s9ifs0idfjlwfie32dekl": process.env.S9IFS0IDFJLVFIE32DEKL, // මෙතන තිත හැදිලා තිබ්බේ, දැන් හරි!
    "_ga": process.env._GA,
    "_gat": process.env._GAT,
    "_gid": process.env._GID,
    "dom3ic8zudi28v8lr6fgphwffqoz0j6c": process.env.DOM3IC8ZUDI28V8LR6FGPHWFFQOZ0J6C,
    "hu8935j4i9fq3hpuj9q39": process.env.HU8935J4I9FQ3HPUJ9Q39,
    "pp_idelay_1a10afe5fd8dc8069939f8a49fccbc26": process.env.PP_IDELAY_1A10AFE5FD8DC8069939F8A49FCCBC26,
    "starstruck_8c9b99985687fb6ab1d030c04b088ebb": process.env.STARSTRUCK
};

// Cookies ටික String එකක් බවට පတ် කිරීම
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

async function getSoup(url) {
    try {
        const response = await axios.get(url, { headers: HEADERS, timeout: 15000 });
        return cheerio.load(response.data);
    } catch (error) {
        console.error(`Error fetching ${url}: ${error.message}`);
        return null;
    }
}

async function extractMovieLinks(pageUrl) {
    const $ = await getSoup(pageUrl);
    if (!$) return [];

    const links = [];
    
    // සයිට් එකේ තියෙන ඔක්කොම ලින්ක්ස් (<a> tags) පරික්ෂා කිරීම (වඩාත්ම ආරක්ෂිත ක්‍රමය)
    $('a').each((_, element) => {
        const href = $(element).attr('href');
        
        if (href && href.startsWith(BASE_URL) && href.includes('/movies/')) {
            // අනවශ්‍ය /page/ හෝ /category/ ලින්ක්ස් අයින් කිරීම
            if (!['/page/', '/category/', '/genre/', '/release/'].some(x => href.includes(x))) {
                // මුල් පිටුවේ ලින්ක් එකම නැවත එකතු වීම වැළැක්වීම
                if (href.replace(/\/$/, '') !== MOVIES_URL.replace(/\/$/, '')) {
                    if (!links.includes(href)) {
                        links.push(href);
                    }
                }
            }
        }
    });
    return links;
}

async function scrapeMovieDetails(url) {
    const $ = await getSoup(url);
    if (!$) return null;

    const data = {
        url: url,
        title: "N/A",
        imdb_rating: "N/A",
        download_links: []
    };

    data.title = $('h1').text().trim() || "N/A";

    const imdbText = $('.imdb-rating, .rating, .num, .imdbRating').text().trim();
    if (imdbText) {
        data.imdb_rating = imdbText;
    } else {
        const bodyText = $('body').text();
        const match = bodyText.match(/IMDb[:\s]+([\d.]+)/i);
        if (match) data.imdb_rating = match[1];
    }

    $('a[href]').each((_, element) => {
        const href = $(element).attr('href');
        const text = $(element).text().trim().toLowerCase();

        if (
            ['download', 'ඩවුන්ලෝඩ්', 'direct', 'gdrive', 'පිවිසෙන්න'].some(x => text.includes(x)) ||
            ['download', 'go.sinhalasub', 'links', 'drive'].some(y => href.toLowerCase().includes(y))
        ) {
            if (!['telegram', 'facebook', 'twitter', 'whatsapp'].some(z => href.toLowerCase().includes(z))) {
                data.download_links.push({
                    label: $(element).text().trim() || "Download Link",
                    link: href
                });
            }
        }
    });

    return data;
}

async function main() {
    console.log("Scraping Sinhalasub movies using Node.js...");
    const links = await extractMovieLinks(MOVIES_URL);
    console.log(`Found ${links.length} movie links.`);

    if (links.length === 0) {
        console.log("⚠️ No links found. Your Cloudflare cookies might be expired! Please update .env file.");
        return;
    }

    const allData = [];
    // මුල් ෆිල්ම්ස් 5 ස්ක්‍රේප් කරමු
    for (const link of links.slice(0, 5)) { 
        console.log(`Scraping: ${link}`);
        const details = await scrapeMovieDetails(link);
        if (details) allData.push(details);
        await new Promise(resolve => setTimeout(resolve, 2000)); // සයිට් එකට බරක් නොවෙන්න තත්පර 2ක Delay එකක්
    }

    fs.writeFileSync('sinhalasub_data.json', JSON.stringify(allData, null, 4), 'utf-8');
    console.log("Done! Saved to sinhalasub_data.json");
}

main();
