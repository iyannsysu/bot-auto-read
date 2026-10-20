'use strict';

// Penjadwal posting Status WhatsApp otomatis dari link TikTok (kualitas HD).
// Config: data/schedstory.json
// Dipanggil tiap 60 detik dari index.js via storyTick(sock).

import fs from 'fs';
import path from 'path';
import { execFile } from 'child_process';
import { promisify } from 'util';

const execFileAsync = promisify(execFile);
import { YTDLP } from './paths.js';
const DATA_DIR = path.join(process.cwd(), 'data');
const CFG_PATH = path.join(DATA_DIR, 'schedstory.json');
const DL_DIR = path.join(process.cwd(), 'downloads', 'schedstory');

const DEFAULTS = {
	enabled: false,
	times: ['07:00', '12:00', '18:00'], // WIB
	queue: [],          // [{ url, addedAt }]
	index: 0,           // posisi rotasi
	caption: '',        // caption default, kosong = judul video
	posted: {},         // { 'YYYY-MM-DD': ['07:00', ...] } anti double-post
	lastError: '',
};

function wibNow() {
	const f = new Intl.DateTimeFormat('en-GB', {
		timeZone: 'Asia/Jakarta', hour: '2-digit', minute: '2-digit', hour12: false,
	});
	return f.format(new Date());
}
function wibDate() {
	const f = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Jakarta' });
	return f.format(new Date()); // YYYY-MM-DD
}

export function loadStoryCfg() {
	try {
		if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
		if (!fs.existsSync(CFG_PATH)) {
			fs.writeFileSync(CFG_PATH, JSON.stringify(DEFAULTS, null, 2));
			return { ...DEFAULTS };
		}
		const raw = JSON.parse(fs.readFileSync(CFG_PATH, 'utf8'));
		return { ...DEFAULTS, ...raw };
	} catch {
		return { ...DEFAULTS };
	}
}

export function saveStoryCfg(cfg) {
	try {
		if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
		fs.writeFileSync(CFG_PATH, JSON.stringify(cfg, null, 2));
	} catch (e) {
		console.error('Gagal simpan schedstory:', e?.message || e);
	}
}

/** Download TikTok kualitas terbaik (HD, tanpa watermark) ke file lokal. */
export async function downloadTikTokHD(url) {
	if (!fs.existsSync(DL_DIR)) fs.mkdirSync(DL_DIR, { recursive: true });
	const outTpl = path.join(DL_DIR, '%(id)s.%(ext)s');
	const args = [
		'--no-warnings', '--no-playlist',
		'--extractor-args', 'tiktok:api_hostname=api16-normal-c-useast1a.tiktokv.us',
		'-f', 'best[ext=mp4]/best/bestvideo+bestaudio',
		'--merge-output-format', 'mp4',
		'--print', '%(id)s\n%(title)s\n%(uploader)s',
		'-o', outTpl,
		url,
	];
	const { stdout } = await execFileAsync(YTDLP, args, { timeout: 180000, maxBuffer: 16 * 1024 * 1024 });
	const lines = stdout.trim().split('\n');
	const [id, title, uploader] = lines;
	// Cari file hasil download
	const files = fs.readdirSync(DL_DIR).filter(f => f.startsWith(id + '.'));
	if (!files.length) throw new Error('File hasil download tidak ketemu.');
	const file = path.join(DL_DIR, files[0]);
	const stat = fs.statSync(file);
	if (stat.size < 50 * 1024) throw new Error('File terlalu kecil, kemungkinan gagal.');
	return { file, title: (title || '').slice(0, 150), uploader: uploader || 'TikTok', size: stat.size };
}

/** Posting 1 video ke Status WA. */
export async function postToStatus(sock, filePath, caption) {
	const stat = fs.statSync(filePath);
	if (stat.size > 100 * 1024 * 1024) throw new Error('Video >100MB, kebesaran untuk status.');
	await sock.sendMessage('status@broadcast', {
		video: fs.readFileSync(filePath),
		caption: caption || '',
		mimetype: 'video/mp4',
	});
}

/** Ambil item berikutnya dari antrian (rotasi). */
function nextItem(cfg) {
	if (!cfg.queue.length) return null;
	const item = cfg.queue[cfg.index % cfg.queue.length];
	cfg.index = (cfg.index + 1) % cfg.queue.length;
	return item;
}

/** Dipanggil tiap 60 detik. Posting kalau jam WIB cocok dengan jadwal & belum diposting slot ini hari ini. */
let storyBusy = false;
export async function storyTick(sock) {
	if (storyBusy) return;
	storyBusy = true;
	try {
		return await storyTickInner(sock);
	} finally {
		storyBusy = false;
	}
}

async function storyTickInner(sock) {
	const cfg = loadStoryCfg();
	if (!cfg.enabled || !cfg.times.length || !cfg.queue.length) return;
	const now = wibNow();
	if (!cfg.times.includes(now)) return;
	const today = wibDate();
	cfg.posted[today] = cfg.posted[today] || [];
	if (cfg.posted[today].includes(now)) return; // sudah diposting slot ini

	const item = nextItem(cfg);
	if (!item) return;
	try {
		console.info(`\x1b[36m[story] Posting terjadwal ${now} WIB: ${item.url}\x1b[39m`);
		const dl = await downloadTikTokHD(item.url);
		const caption = cfg.caption || `🎬 ${dl.title}\n👤 @${dl.uploader}`;
		await postToStatus(sock, dl.file, caption);
		cfg.posted[today].push(now);
		cfg.lastError = '';
		console.info('\x1b[32m[story] Status terkirim.\x1b[39m');
		// Bersihkan file download biar hemat storage
		try { fs.unlinkSync(dl.file); } catch {}
		// Pangkas histori posted > 7 hari
		for (const d of Object.keys(cfg.posted)) {
			if (d < today) {
				const diff = (new Date(today) - new Date(d)) / 86400000;
				if (diff > 7) delete cfg.posted[d];
			}
		}
	} catch (e) {
		cfg.lastError = `${now}: ${e?.message || e}`;
		console.error('\x1b[31m[story] Gagal posting:\x1b[39m', cfg.lastError);
	}
	saveStoryCfg(cfg);
}
