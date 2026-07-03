const { SinhalaSub } = require('@sl-code-lords/movie-api');
const mrnima = require('mrnima-moviedl');
const ominduApi = require('@omindudissanayaka/movie-api');

// Terminal එකෙන් URL එක ගන්න (උදා: node index.js "https://sinhalasub.lk/movies/...")
const movieUrl = process.argv[2];

if (!movieUrl) {
    console.error('❌ කරුණාකර Movie URL එක දාන්න!');
    console.log('📌 උදාහරණය: node index.js "https://sinhalasub.lk/movies/spider-man-no-way-home-2021-sinhala-subtitles/"');
    process.exit(1);
}

console.log(`\n🔍 URL එක: ${movieUrl}`);
console.log('⏳ දත්ත ගන්න උත්සහ කරමින්...\n');

// ----- විකල්පය 1: @sl-code-lords/movie-api -----
async function fetchWithSlCode() {
    try {
        console.log('[1/3] @sl-code-lords/movie-api උත්සහ කරමින්...');
        const data = await SinhalaSub.movie(movieUrl);
        return { source: '@sl-code-lords/movie-api', data };
    } catch (error) {
        console.log(`   ❌ අසාර්ථකයි: ${error.message}`);
        return null;
    }
}

// ----- විකල්පය 2: mrnima-moviedl -----
async function fetchWithMrnima() {
    try {
        console.log('[2/3] mrnima-moviedl උත්සහ කරමින්...');
        // mrnima API එකේ function එක (සාමාන්‍යයෙන් getMovie හෝ download)
        const data = await mrnima.getMovie(movieUrl); 
        return { source: 'mrnima-moviedl', data };
    } catch (error) {
        console.log(`   ❌ අසාර්ථකයි: ${error.message}`);
        return null;
    }
}

// ----- විකල්පය 3: @omindudissanayaka/movie-api -----
async function fetchWithOmindu() {
    try {
        console.log('[3/3] @omindudissanayaka/movie-api උත්සහ කරමින්...');
        // මෙම පැකේජයේ function එක (සාමාන්‍යයෙන් fetchMovie හෝ getDetails)
        const data = await ominduApi.fetchMovie(movieUrl);
        return { source: '@omindudissanayaka/movie-api', data };
    } catch (error) {
        console.log(`   ❌ අසාර්ථකයි: ${error.message}`);
        return null;
    }
}

// ----- ප්‍රධාන කාර්යය (Main Function) -----
async function main() {
    // සියලුම ක්‍රම parallel එකට Run කරන්න (ඉක්මනට එන්න එක)
    const results = await Promise.all([
        fetchWithSlCode(),
        fetchWithMrnima(),
        fetchWithOmindu()
    ]);

    // සාර්ථක වූ පළමු එක හොයන්න
    const success = results.find(r => r !== null);

    if (success) {
        console.log(`\n✅ සාර්ථකයි! (${success.source})`);
        console.log('📦 ප්‍රතිඵලය:');
        console.log(JSON.stringify(success.data, null, 2));

        // ඩවුන්ලෝඩ් URLs විතරක් වෙන් කරලා පෙන්වන්න (ඔබගේ JSON structure එක අනුව)
        if (success.data && success.data.result) {
            console.log('\n🎬 ඩවුන්ලෝඩ් විකල්ප:');
            success.data.result.forEach((item, index) => {
                console.log(`   ${index+1}. [${item.quality}] ${item.size} -> ${item.download_url}`);
            });
        } else if (success.data && success.data.downloadLinks) {
            console.log('\n🎬 ඩවුන්ලෝඩ් විකල්ප:');
            success.data.downloadLinks.forEach((item, index) => {
                console.log(`   ${index+1}. [${item.quality}] ${item.size} -> ${item.url}`);
            });
        }
    } else {
        console.log('\n❌ සියලුම ක්‍රම අසාර්ථක විය.');
        console.log('💡 හේතු:');
        console.log('   1. sinhalasub.lk වෙබ් අඩවියේ ව්‍යුහය වෙනස් වී ඇත.')
        console.log('   2. ඔබගේ Internet සම්බන්ධතාවය පරීක්ෂා කරන්න.');
        console.log('   3. මෙම පැකේජ යාවත්කාලීන කර බලන්න: npm update');
    }
}

// Run කරන්න
main();
