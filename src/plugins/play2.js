'use strict';

// Command: play2 — Download audio dari Spotify
// Usage: .play2 <judul lagu atau link Spotify>

import * as shared from './_shared.js';

const {
    isJidGroup, jidNormalizedUser, jidDecode, generateWAMessageFromContent,
    exec, execFile, fileURLToPath, util, fs, path, os,
    glitch, msToTime,
    downloadYouTubeAudio, cleanupYouTubeAudio,
    readSwConfig, writeSwConfig, extractEmojis,
    loadStoryCfg, saveStoryCfg, 
    handleBusyReply, loadBusyCfg, saveBusyCfg,
    execFileAsync,
    PROJECT_ROOT, MENU_BANNER, GC_JSON,
    sendAlbum, handleSticker,
} = shared;

// Spotify search & download utilities
const SPOTIFY_CLIENT_ID = process.env.SPOTIFY_CLIENT_ID || '';
const SPOTIFY_CLIENT_SECRET = process.env.SPOTIFY_CLIENT_SECRET || '';

// Get Spotify access token — return null (bukan throw) kalau gagal,
// supaya command bisa fallback ke mode tanpa login Spotify.
async function trySpotifyToken() {
    if (!SPOTIFY_CLIENT_ID || !SPOTIFY_CLIENT_SECRET) return null;
    try {
        const response = await fetch('https://accounts.spotify.com/api/token', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded',
                'Authorization': `Basic ${Buffer.from(`${SPOTIFY_CLIENT_ID}:${SPOTIFY_CLIENT_SECRET}`).toString('base64')}`
            },
            body: 'grant_type=client_credentials',
            signal: AbortSignal.timeout(15000),
        });
        const data = await response.json();
        if (data.error || !data.access_token) return null;
        return data.access_token;
    } catch {
        return null;
    }
}

// Resolve judul lagu dari link Spotify TANPA login, via oEmbed publik.
// Return { name, artists } minimal — cukup untuk cari audionya di YouTube.
async function resolveViaOEmbed(spotifyUrl) {
    const url = spotifyUrl.startsWith('http') ? spotifyUrl : 'https://' + spotifyUrl;
    const r = await fetch('https://open.spotify.com/oembed?url=' + encodeURIComponent(url), {
        headers: { 'User-Agent': 'Mozilla/5.0' },
        signal: AbortSignal.timeout(15000),
    });
    if (!r.ok) throw new Error('oEmbed HTTP ' + r.status);
    const d = await r.json();
    const title = (d.title || '').replace(/^Spotify Embed:\s*/i, '').trim();
    if (!title) throw new Error('oEmbed: judul tidak ketemu');
    return { name: title, artists: '', album: '', spotifyUrl: url, viaOEmbed: true };
}

// Search track di Spotify
async function searchSpotifyTrack(query, token) {
    const response = await fetch(`https://api.spotify.com/v1/search?q=${encodeURIComponent(query)}&type=track&limit=5`, {
        headers: { 'Authorization': `Bearer ${token}` }
    });
    
    const data = await response.json();
    if (data.tracks?.items?.length === 0) throw new Error('❌ Lagu tidak ditemukan di Spotify');
    return data.tracks.items;
}

// Get track details
async function getSpotifyTrack(trackId, token) {
    const response = await fetch(`https://api.spotify.com/v1/tracks/${trackId}`, {
        headers: { 'Authorization': `Bearer ${token}` }
    });
    
    const data = await response.json();
    if (data.error) throw new Error(`❌ Track tidak ditemukan: ${data.error.message}`);
    return data;
}

// Format durasi
function formatDuration(ms) {
    const minutes = Math.floor(ms / 60000);
    const seconds = ((ms % 60000) / 1000).toFixed(0);
    return `${minutes}:${seconds.toString().padStart(2, '0')}`;
}

// Format popularity bar
function formatPopularity(popularity) {
    const bars = Math.round(popularity / 10);
    return '█'.repeat(bars) + '░'.repeat(10 - bars);
}

// Download audio via YouTube (sebagai proxy karena Spotify tidak bisa langsung didownload)
async function downloadFromYouTube(title, artist) {
    const query = `${title} ${artist} audio`;
    try {
        const result = await downloadYouTubeAudio(query);
        return result;
    } catch (err) {
        throw new Error(`❌ Gagal download: ${err.message}`);
    }
}

export default {
    name: 'play2',
    aliases: ['spotify', 'playsp'],
    category: 'downloader',
    desc: '🎵 Download lagu dari Spotify\n\n⚡ *Usage:*\n• .play2 <judul lagu>\n• .play2 <link Spotify>\n• .play2 search <judul>\n\n📌 *Contoh:*\n• .play2 Lathi\n• .play2 https://open.spotify.com/track/xxx\n• .play2 search Tak Segampang Itu',
    
    async run(ctx) {
        const { hisoka, m, query, text, quoted, message, messagesType } = ctx;
        
        // Parse query
        const q = (query || '').trim();
        if (!q) {
            const helpText = `
╭─────────────────────────╮
│    🎵 *SPOTIFY DOWNLOADER* 🎵    │
╰─────────────────────────╯

📌 *Cara Penggunaan:*

  1️⃣  *By Judul*
     └ .play2 <judul lagu>
     └ Contoh: .play2 Lathi

  2️⃣  *By Link Spotify*
     └ .play2 <link spotify>
     └ Contoh: .play2 https://open.spotify.com/track/xxx

  3️⃣  *Search & Pilih*
     └ .play2 search <judul>
     └ Contoh: .play2 search Tak Segampang Itu

╭─────────────────────────╮
│  ⚡ Fitur:                      │
│  • Audio MP3 High Quality      │
│  • Info lengkap lagu           │
│  • Auto-rename file           │
│  • Progress download          │
╰─────────────────────────╯
`.trim();
            
            await m.reply(helpText);
            return;
        }
        
        // Loading animation
        const { startLoading: slPlay2 } = await import('../helper/loading.js');
        const playLoad = await slPlay2(hisoka, m, '🔍 Mencari di Spotify...');
        
        try {
            let trackData = null;
            let searchResults = null;
            let ytFallbackQuery = null; // diisi kalau Spotify API mati -> cari langsung di YouTube
            
            // Coba token Spotify (boleh null -> fallback).
            const token = await trySpotifyToken();
            
            // Cek apakah input adalah link Spotify
            const spotifyUrlMatch = q.match(/open\.spotify\.com\/track\/([a-zA-Z0-9]+)/);
            
            if (spotifyUrlMatch) {
                // Input adalah link Spotify
                const trackId = spotifyUrlMatch[1];
                const fullUrl = spotifyUrlMatch[0].startsWith('http') ? spotifyUrlMatch[0] : 'https://' + spotifyUrlMatch[0];
                let linkErr = null;
                if (token) {
                    try {
                        trackData = await getSpotifyTrack(trackId, token);
                    } catch (e) {
                        linkErr = e;
                        try { trackData = await resolveViaOEmbed(fullUrl); }
                        catch (e2) { linkErr = e2; }
                    }
                } else {
                    // Tanpa kredensial: resolve judul via oEmbed publik.
                    try { trackData = await resolveViaOEmbed(fullUrl); }
                    catch (e) { linkErr = e; }
                }
                if (!trackData) {
                    // Spotify (API + oEmbed) tidak bisa dijangkau dari server —
                    // jangan tampilkan error mentah, arahkan user ke mode judul.
                    await playLoad.stop();
                    await m.reply(
                        '❌ *Link Spotify-nya nggak bisa dibaca dari serverku* (Spotify ngeblok koneksi server).\n\n' +
                        '💡 Kirim *judul lagunya* aja, tetap bisa download:\n' +
                        '`.play2 Blinding Lights`\n`.play2 Lathi - Weird Genius`'
                    );
                    return;
                }
            } else if (q.toLowerCase().startsWith('search ')) {
                // Mode search - tampilkan hasil dan minta pilih (butuh API Spotify)
                if (!token) {
                    await playLoad.stop();
                    await m.reply('❌ Mode *search* butuh login Spotify yang aktif.\n\n💡 Sementara pakai langsung aja: `.play2 <judul lagu>` — tetap bisa download tanpa login.');
                    return;
                }
                // Mode search - tampilkan hasil dan minta pilih
                const searchQuery = q.slice(7).trim();
                searchResults = await searchSpotifyTrack(searchQuery, token);
                
                // Format hasil search
                let searchText = `
╭─────────────────────────╮
│    🔍 *HASIL PENCARIAN* 🔍    │
╰─────────────────────────╯

`;
                searchResults.forEach((track, index) => {
                    const num = index + 1;
                    const artists = track.artists.map(a => a.name).join(', ');
                    const duration = formatDuration(track.duration_ms);
                    const popularity = formatPopularity(track.popularity);
                    
                    searchText += `
╭─ *${num}. ${track.name}*
│  👤 ${artists}
│  💿 ${track.album.name}
│  ⏱️  ${duration}  │  ${popularity} ${track.popularity}%
╰─────────────────────────╯
`;
                });
                
                searchText += `\n💡 *Balas dengan nomor (1-5) untuk download*`;
                
                await playLoad.stop();
                await m.reply(searchText);
                
                // Simpan hasil search untuk handler reply
                if (!hisoka.spotifSearch) hisoka.spotifSearch = new Map();
                hisoka.spotifSearch.set(m.sender, {
                    results: searchResults,
                    timestamp: Date.now()
                });
                
                // Auto cleanup setelah 5 menit
                setTimeout(() => {
                    if (hisoka.spotifSearch?.has(m.sender)) {
                        hisoka.spotifSearch.delete(m.sender);
                    }
                }, 5 * 60 * 1000);
                
                return;
                
            } else {
                // Input adalah judul lagu
                if (token) {
                    const results = await searchSpotifyTrack(q, token);
                    trackData = results[0]; // Ambil hasil pertama
                } else {
                    // Fallback: tanpa Spotify API, cari & download langsung via YouTube.
                    ytFallbackQuery = q;
                }
            }
            
            // Update loading
            playLoad.update('📥 Mendownload audio...');
            
            // Mode fallback: download langsung dari YouTube tanpa metadata Spotify.
            if (ytFallbackQuery) {
                const downloadResult = await downloadFromYouTube(ytFallbackQuery, '');
                const audioBuffer = fs.readFileSync(downloadResult.file);
                if (downloadResult.file) {
                    cleanupYouTubeAudio(downloadResult.file).catch(() => {});
                }
                const safeFileName = ytFallbackQuery.replace(/[\/\\:*?"<>|]/g, '').slice(0, 80);
                await playLoad.stop();
                await hisoka.sendMessage(m.chat, {
                    audio: audioBuffer,
                    mimetype: 'audio/mpeg',
                    fileName: `${safeFileName}.mp3`,
                    ptt: false,
                }, { quoted: message });
                await m.reply('✅ *Download selesai!* 🎉\n\nℹ️ _Mode tanpa login Spotify — info artis/album tidak tersedia._');
                return;
            }
            
            // Prepare track info
            const trackName = trackData.name;
            const artists = (trackData.artists || []).map(a => a.name || a).join(', ');
            const album = trackData.album?.name || '-';
            const releaseDate = trackData.album?.release_date || '-';
            const duration = trackData.duration_ms ? formatDuration(trackData.duration_ms) : '-';
            const popularity = trackData.popularity ?? '-';
            const spotifyUrl = trackData.external_urls?.spotify || trackData.spotifyUrl || '';
            const noMeta = !!trackData.viaOEmbed;
            
            // Download audio dari YouTube sebagai proxy
            const downloadResult = await downloadFromYouTube(trackName, artists);
            const audioBuffer = fs.readFileSync(downloadResult.file);
            
            // Cleanup file temporary
            if (downloadResult.file) {
                cleanupYouTubeAudio(downloadResult.file).catch(() => {});
            }
            
            // Format nama file yang aman
            const safeFileName = `${trackName} - ${artists}`
                .replace(/[\/\\:*?"<>|]/g, '')
                .slice(0, 80);
            
            // Update loading
            playLoad.update('📤 Mengirim audio...');
            
            // Buat caption yang keren
            const metaLine = noMeta
                ? `│  ℹ️ _Info lengkap tidak tersedia (mode tanpa login Spotify)_\n`
                : `│  💿 *Album:* ${album}\n│  📅 *Rilis:* ${releaseDate}\n│  ⏱️  *Durasi:* ${duration}\n│  🔥 *Populer:* ${popularity}%\n`;
            const popBar = (!noMeta && typeof popularity === 'number')
                ? `\n╭─ 📊 *Popularity*\n│  ${formatPopularity(popularity)}\n╰─────────────────────────╯\n` : '';
            const caption = `
╭─────────────────────────╮
│    🎵 *SPOTIFY PLAYER* 🎵    │
╰─────────────────────────╯

╭─ 🎤 *${trackName}*
${artists ? `│  👤 *Artis:* ${artists}\n` : ''}${metaLine}╰─────────────────────────╯
${popBar}
🔗 ${spotifyUrl}

╭─────────────────────────╯
│  ⚡ Powered by Hisoka-Morou
╰─────────────────────────╯
`.trim();
            
            // Kirim audio
            await playLoad.stop();
            
            if (audioBuffer.length > 100 * 1024 * 1024) {
                // Kirim sebagai document jika > 100MB
                await hisoka.sendMessage(m.chat, {
                    document: audioBuffer,
                    fileName: `${safeFileName}.mp3`,
                    mimetype: 'audio/mpeg',
                    caption: caption
                }, { quoted: message });
            } else {
                // Kirim sebagai audio
                await hisoka.sendMessage(m.chat, {
                    audio: audioBuffer,
                    mimetype: 'audio/mpeg',
                    fileName: `${safeFileName}.mp3`,
                    ptt: false,
                    caption: caption
                }, { quoted: message });
            }
            
            // Kirim info tambahan sebagai reply
            await m.reply('✅ *Download selesai!* 🎉\n\n💡 *Tips:* Gunakan `.play2 search <judul>` untuk pilih dari beberapa hasil');
            
        } catch (err) {
            await playLoad.stop();
            
            // Error handling yang informative
            let errorMsg = err.message;
            
            if (errorMsg.includes('Gagal download')) {
                errorMsg = `❌ *Gagal mendownload*\n\n${errorMsg}\n\n💡 Coba dengan judul yang lebih spesifik`;
            } else if (errorMsg.includes('tidak ditemukan')) {
                errorMsg = `❌ *Lagu tidak ditemukan*\n\nCoba dengan:\n• Judul yang lebih spesifik\n• Tambahkan nama artis\n• Gunakan link Spotify langsung`;
            } else {
                errorMsg = `❌ *Error:* ${errorMsg}`;
            }
            
            await m.reply(errorMsg);
        }
    }
};

// Handler untuk reply nomor (untuk mode search)
export async function handleSpotifySearchReply(ctx) {
    const { hisoka, m, text } = ctx;
    
    if (!hisoka.spotifSearch?.has(m.sender)) return false;
    
    const searchSession = hisoka.spotifSearch.get(m.sender);
    const choice = parseInt(text);
    
    if (isNaN(choice) || choice < 1 || choice > searchSession.results.length) return false;
    
    // Hapus session
    hisoka.spotifSearch.delete(m.sender);
    
    // Jalankan download dengan track yang dipilih
    const track = searchSession.results[choice - 1];
    const trackUrl = track.external_urls.spotify;
    
    // Panggil ulang command dengan URL
    ctx.query = trackUrl;
    await ctx.command.run(ctx);
    
    return true;
}