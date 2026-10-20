'use strict';

// Shared module untuk semua plugin: re-export + state + helper functions.

import { isJidGroup, jidNormalizedUser, jidDecode, generateWAMessageFromContent } from 'baileys';
import { exec, execFile } from 'child_process';
import { fileURLToPath } from 'url';
import util from 'util';
import fs from 'fs';
import path from 'path';
import os from 'os';

import { glitch } from '../helper/text.js';

import { msToTime } from '../helper/utils.js';
import { downloadTikTok, cleanupTikTok } from '../helper/tiktok.js';
import { downloadYouTubeAudio, downloadYouTubeAudioById, downloadYouTubeVideo, searchYouTube, cleanupYouTubeAudio } from '../helper/youtube.js';
import { searchPinterest, downloadPinterestPin, cleanupPinterest } from '../helper/pinterest.js';
import { searchPixiv, downloadPixivArtwork, cleanupPixiv } from '../helper/pixiv.js';
import { searchHentaidad, downloadHentaidadGallery, cleanupHentaidad } from '../helper/hentaidad.js';
import { searchHanime, getHanimeStreams, pickHanimeStream, downloadHanimeStream, shortNum } from '../helper/hanime.js';
import { getStickerPack, downloadStickerPack, cleanupStickerPack } from '../helper/stickerpack.js';
import { getTelegramPack, downloadTelegramPack, cleanupTelegramPack } from '../helper/tgsticker.js';
import { readSwConfig, writeSwConfig, extractEmojis } from '../helper/swconfig.js';
import { loadStoryCfg, saveStoryCfg, downloadTikTokHD, postToStatus } from '../helper/schedstory.js';
import { handleBusyReply, loadBusyCfg, saveBusyCfg } from '../helper/busyreply.js';
import { telegram } from '../helper/index.js';

const execFileAsync = util.promisify(execFile);

/** Cache hasil pencarian .hanime per pengirim: sender -> Array hasil searchHanime */
const hanimeSearchCache = new Map();
const bokepSearchCache = new Map();
const cosplay18SearchCache = new Map();
const manhwaSearchCache = new Map(); // sender -> hasil search
const manhwaChapterCache = new Map(); // sender -> { manga, chapters }

const PROJECT_ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '../..');
const MENU_BANNER = path.join(PROJECT_ROOT, 'assets/menu-adawong.jpg');
const GC_JSON = path.join(PROJECT_ROOT, 'gc.json');

/** Baca link invite grup WA untuk menu (diset via .setgc). */
function readGcLink() {
	try {
		const j = JSON.parse(fs.readFileSync(GC_JSON, 'utf8'));
		if (j && typeof j.invite === 'string' && /chat\.whatsapp\.com\//i.test(j.invite)) return j.invite.trim();
	} catch { /* belum diset */ }
	return '';
}

/**
 * Unduh video TikTok dari URL lalu kirim ke chat.
 * @param {import('../../index').WASocketExtra} hisoka
 * @param {import('../../index').WAMessageExtra} m
 * @param {string} text teks yang mengandung URL TikTok
 */
async function handleTikTokDownload(hisoka, m, text) {
	const match = (text || '').match(/https?:\/\/[^\s]*tiktok\.com[^\s]*/i);
	if (!match) {
		await m.reply('Kirim link TikTok yang valid. Contoh: .tt <link>');
		return;
	}

	const { startLoading } = await import('../helper/loading.js');
	const ttLoad = await startLoading(hisoka, m, 'Mengambil TikTok');

	const { getTikTok, downloadUrl, downloadTikTok: ytFallback } = await import('../helper/tiktok.js');
	let info = null;
	try {
		info = await getTikTok(match[0]);
	} catch (err) {
		await ttLoad.fail('❌ ' + (err?.message || 'Gagal.') + '\n_Coba lagi sebentar..._');
		return;
	}

	const caption = `🎵 *${info.title || 'TikTok'}*\n👤 ${info.author}`;

	// FOTO SLIDESHOW -> kirim sebagai album
	if (info.type === 'images') {
		await ttLoad.stop();
		try {
			const bufs = await Promise.all(info.images.map(u => downloadUrl(u, 20)));
			const tmpFiles = bufs.map((b, i) => {
				const fp = `/tmp/tt_img_${Date.now()}_${i}.jpg`;
				fs.writeFileSync(fp, b);
				return fp;
			});
			// caption di foto pertama via sendAlbum modif: kirim manual
			await sendAlbum(hisoka, m.from, tmpFiles);
			await m.reply(caption);
			for (const f of tmpFiles) { try { fs.unlinkSync(f); } catch {} }
		} catch (err) {
			await ttLoad.fail('❌ ' + (err?.message || 'Gagal mengunduh foto.'));
		}
		return;
	}

	// VIDEO: utamakan sumber HD 1080p (tikdownloader.io — permintaan owner
	// 2026-10-20: setiap link TikTok yang dikirim langsung diunduh versi
	// HD-nya). Gagal di sana -> turun ke videoUrl tikwm, lalu yt-dlp.
	await ttLoad.stop();
	let hdCaption = caption;
	try {
		let data = null;
		try {
			const { getTikTokHD, downloadBuffer } = await import('../helper/tikdownloader.js');
			const hd = await getTikTokHD(match[0]);
			const hdUrl = hd.hdUrl || hd.mp4Url;
			if (hdUrl) {
				data = await downloadBuffer(hdUrl, 100);
				if (hd.hdUrl) hdCaption = caption + '\n📺 HD 1080p';
			}
		} catch { data = null; }
		if (!data) data = await downloadUrl(info.videoUrl, 100);
		if (data.length > 100 * 1024 * 1024) {
			await hisoka.sendMessage(m.from, { document: data, fileName: 'tiktok_hd.mp4', caption: hdCaption }, { quoted: m });
		} else {
			await hisoka.sendMessage(m.from, { video: data, caption: hdCaption }, { quoted: m });
		}
	} catch (err) {
		// fallback ke yt-dlp
		await m.reply('⚠️ Coba cara lain...');
		let file = '';
		try {
			const { downloadTikTok, cleanupTikTok } = await import('../helper/tiktok.js');
			file = await downloadTikTok(match[0]);
			const size = fs.statSync(file).size;
			const data = fs.readFileSync(file);
			if (size > 100 * 1024 * 1024) {
				await hisoka.sendMessage(m.from, { document: data, fileName: path.basename(file), caption }, { quoted: m });
			} else {
				await hisoka.sendMessage(m.from, { video: data, caption }, { quoted: m });
			}
			cleanupTikTok(file);
		} catch (err2) {
			if (file) { try { fs.unlinkSync(file); } catch {} }
			await ttLoad.fail('❌ ' + (err2?.message || 'Gagal mengunduh video.'));
		}
	}
}

/**
 * Kirim beberapa gambar sebagai SATU album WhatsApp.
 * Caranya: kirim dulu pesan albumMessage (pengumuman: "N gambar akan datang"),
 * baru kirim semua gambar berbarengan. Client WA lalu menampilkannya
 * sebagai satu grup album, bukan pesan satu-satu.
 * @param {import('../../index').WASocketExtra} hisoka
 * @param {string} jid tujuan
 * @param {string[]} files path file gambar
 */
async function sendAlbum(hisoka, jid, files) {
	const n = files.length;
	if (!n) return;
	if (n === 1) {
		await hisoka.sendMessage(jid, { image: fs.readFileSync(files[0]) });
		return;
	}

	// 1. Pengumuman album
	try {
		const albumMsg = generateWAMessageFromContent(
			jid,
			{ albumMessage: { expectedImageCount: n, expectedVideoCount: 0 } },
			{}
		);
		await hisoka.relayMessage(jid, albumMsg.message, { messageId: albumMsg.key.id });
	} catch (err) {
		console.error('\x1b[33mPengumuman album gagal, lanjut kirim biasa:\x1b[39m', err?.message || err);
	}

	// 2. Semua gambar berbarengan
	const results = await Promise.allSettled(
		files.map(f => hisoka.sendMessage(jid, { image: fs.readFileSync(f) }))
	);
	const failed = results.filter(r => r.status === 'rejected').length;
	if (failed) {
		console.error(`\x1b[33msendAlbum: ${failed}/${n} gambar gagal terkirim\x1b[39m`);
	}
}

/**
 * Buat stiker webp 512x512 dari pesan quoted (gambar / video pendek).
 * @param {import('../../index').WASocketExtra} hisoka
 * @param {import('../../index').WAMessageExtra} m
 */
async function handleSticker(hisoka, m) {
	if (!m.isQuoted || !m.quoted?.isMedia) {
		await m.reply('Balas (reply) pesan berisi gambar atau video dulu.');
		return;
	}

	let media;
	try {
		media = await m.quoted.downloadMedia();
	} catch {
		await m.reply('Gagal mengunduh media.');
		return;
	}

	const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'st-'));
	const input = path.join(tmpDir, 'input');
	const output = path.join(tmpDir, 'sticker.webp');
	fs.writeFileSync(input, media);

	try {
		await execFileAsync(
			'/usr/bin/ffmpeg',
			[
				'-y',
				'-i',
				input,
				'-vf',
				'scale=512:512:force_original_aspect_ratio=decrease,pad=512:512:(ow-iw)/2:(oh-ih)/2:color=0x00000000',
				'-vcodec',
				'libwebp',
				'-qscale',
				'75',
				'-preset',
				'default',
				'-loop',
				'0',
				'-an',
				'-vsync',
				'0',
				output,
			],
			{ timeout: 120000 }
		);

		await hisoka.sendMessage(m.from, { sticker: fs.readFileSync(output) }, { quoted: m });
	} catch {
		await m.reply('Gagal membuat stiker.');
	} finally {
		fs.rmSync(tmpDir, { recursive: true, force: true });
	}
}

// ---- Re-export agar plugin bisa destructure dari './_shared.js' ----
export {
	isJidGroup, jidNormalizedUser, jidDecode, generateWAMessageFromContent,
	exec, execFile, fileURLToPath, util, fs, path, os,
	glitch, msToTime,
	downloadTikTok, cleanupTikTok,
	downloadYouTubeAudio, downloadYouTubeAudioById, downloadYouTubeVideo, searchYouTube, cleanupYouTubeAudio,
	searchPinterest, downloadPinterestPin, cleanupPinterest,
	searchPixiv, downloadPixivArtwork, cleanupPixiv,
	searchHentaidad, downloadHentaidadGallery, cleanupHentaidad,
	searchHanime, getHanimeStreams, pickHanimeStream, downloadHanimeStream, shortNum,
	getStickerPack, downloadStickerPack, cleanupStickerPack,
	getTelegramPack, downloadTelegramPack, cleanupTelegramPack,
	readSwConfig, writeSwConfig, extractEmojis,
	loadStoryCfg, saveStoryCfg, downloadTikTokHD, postToStatus,
	handleBusyReply, loadBusyCfg, saveBusyCfg,
	telegram,
	execFileAsync,
	PROJECT_ROOT, MENU_BANNER, GC_JSON,
	hanimeSearchCache, bokepSearchCache, cosplay18SearchCache,
	manhwaSearchCache, manhwaChapterCache,
	readGcLink, handleTikTokDownload, sendAlbum, handleSticker,
};
