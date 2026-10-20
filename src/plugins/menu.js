'use strict';
// Menu utama (command: menu, aliases: help, ?, btnmenu)
//
// Daftar command DIBANGUN OTOMATIS dari plugin yang benar-benar termuat
// (lihat getPluginRegistry di _loader.js), jadi menu tidak pernah lagi
// menampilkan command yang tidak ada, dan command baru langsung muncul
// tanpa edit file ini.
//
//   .menu            -> animasi loading RE4 + menu lengkap (GIF Ada Wong / kartu)
//   .menu 3          -> detail kategori nomor 3 (lengkap dengan deskripsi)
//   .menu downloader -> detail kategori lewat nama
//   .menu kategori   -> daftar kategori ringkas
//
// Gaya tampilan lewat .env:
//   BOT_MENU_STYLE=gif (default) | card | image | text
//   BOT_MENU_LOADING=true (default) | false (matikan efek loading)

import fs from 'fs';
import os from 'os';
import path from 'path';
import util from 'util';
import { execFile } from 'child_process';

import * as shared from './_shared.js';
import { getPluginRegistry } from './_loader.js';

const { readGcLink, MENU_BANNER } = shared;
const execFileAsync = util.promisify(execFile);

const ASSETS_DIR = MENU_BANNER ? path.dirname(MENU_BANNER) : path.resolve('assets');
const LOCAL_MP4 = path.join(ASSETS_DIR, 'menu-adawong.mp4');
const LOCAL_GIF = path.join(ASSETS_DIR, 'menu-adawong.gif');

const BANNER_URL = 'https://raw.githubusercontent.com/iyannsysu/iyan-x-m/main/assets/menu-adawong.jpg';
// URL animasi GIF/MP4 Ada Wong RE4 (bisa diganti lewat .env BOT_MENU_GIF_URL)
const BANNER_GIF_URL =
	process.env.BOT_MENU_GIF_URL ||
	'https://media.tenor.com/2f5i9t8sK8UAAAPo/ada-wong-resident-evil-4.mp4';

const TZ = 'Asia/Jakarta';

// Urutan & ikon kategori. Kategori yang tidak ada di sini tetap tampil (di bawah).
const CATEGORY_META = [
	{ key: 'DOWNLOADER', icon: '📥' },
	{ key: 'STIKER', icon: '🎨' },
	{ key: 'STATUS', icon: '👁️' },
	{ key: 'FUN', icon: '😂' },
	{ key: 'GAME', icon: '🎮' },
	{ key: 'TOOLS', icon: '🔧' },
	{ key: 'GRUP & KONTAK', icon: '👥' },
	{ key: 'ISLAMI & PRIMBON', icon: '🕌' },
	{ key: 'OWNER & SISTEM', icon: '🔐' },
];
const FALLBACK_CATEGORY = 'LAINNYA';

// Plugin yang field category-nya masih 'other'/'owner'/'downloader' dipetakan di sini.
const CATEGORY_OF = {
	play: 'DOWNLOADER', play2: 'DOWNLOADER', ytsearch: 'DOWNLOADER', sfile: 'DOWNLOADER',
	tt: 'DOWNLOADER', tiktokv2: 'DOWNLOADER', pin: 'DOWNLOADER', ppcouple: 'DOWNLOADER',
	cosplay: 'DOWNLOADER', pixiv: 'DOWNLOADER',
	react: 'STATUS', swreplytext: 'STATUS',
	storyadd: 'STATUS', storycap: 'STATUS', storyclear: 'STATUS', storydel: 'STATUS',
	storylist: 'STATUS', storynow: 'STATUS', storyon: 'STATUS', storytime: 'STATUS',
	balasmenfess: 'FUN', tolakmenfess: 'FUN',
	p: 'TOOLS', q: 'TOOLS',
	hidetag: 'GRUP & KONTAK', groups: 'GRUP & KONTAK', contacts: 'GRUP & KONTAK', setgc: 'GRUP & KONTAK',
	jadibot: 'OWNER & SISTEM', busyreply: 'OWNER & SISTEM', update: 'OWNER & SISTEM',
	debug: 'OWNER & SISTEM', '>': 'OWNER & SISTEM', $: 'OWNER & SISTEM',
	menu: 'MENU',
};

// Plugin yang alias-nya adalah command terpisah (mis. tiap game punya nama sendiri):
// di menu utama semua alias ikut ditampilkan sebagai command sendiri.
const EXPAND_ALIASES = new Set(['tebakgambar', 'swread']);

const QUOTES = [
	'Jangan menunggu sempurna, buat momenmu sempurna.',
	'Berani mencoba adalah awal kesuksesan.',
	'Hari ini lelah, besok bangga.',
	'Fokus proses, hasil mengikuti.',
	'Mimpi tanpa aksi hanyalah angan.',
	'Maju sedikit tiap hari itu cukup.',
	'Gagal itu guru, asal mau belajar.',
	'Jadilah versi terbaik dirimu.',
	'Waktu terbaik mulai adalah sekarang.',
	'Kerja keras kalahkan bakat malas.',
	'Pelan tak apa, asal jangan diam.',
	'Hal besar mulai dari langkah kecil.',
];

// ───────────────────────── util ─────────────────────────

const isWord = s => /^[a-z0-9]/i.test(String(s));
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

// Nama tampilan khusus untuk command yang namanya terlalu pendek / ambigu.
const DISPLAY_AS = { p: 'ping', q: 'quoted' };

/** Nama yang enak dibaca: command seperti '>' atau '$' ditampilkan lewat alias hurufnya. */
function displayName(p) {
	if (DISPLAY_AS[p.name] && (p.name === DISPLAY_AS[p.name] || p.aliases.includes(DISPLAY_AS[p.name]))) return DISPLAY_AS[p.name];
	if (isWord(p.name)) return p.name;
	return p.aliases.find(isWord) || p.name;
}

/**
 * Prefix yang tampil di menu: "." (sesuai permintaan rimuru: "prefix nya menggunakan .").
 * BOT_PREFIX di .env bisa berupa regex kompleks seperti (?:[°•π... . ...]) — kalau
 * diambil karakter pertamanya mentah-mentah, hasilnya "(" dan menu tampil salah.
 * Jadi: kalau "." ada di dalam character class, pakai "."; kalau pola [..]/ (?:[..]),
 * pakai karakter pertama di dalam class; kalau bukan pola, pakai karakter pertama.
 */
function displayPrefix() {
	const raw = String(process.env.BOT_PREFIX || '.').trim();
	if (!raw) return '.';
	// Pola regex dengan character class: [..] atau (?:[..]) atau (?:..)
	const cls = raw.match(/\[([^\]]+)\]/);
	if (cls) {
		const inner = cls[1].replace(/\\(.)/g, '$1');
		if (inner.includes('.')) return '.';
		return inner[0] || '.';
	}
	return raw.replace(/\\(.)/g, '$1')[0] || '.';
}

function categoryOf(p) {
	const mapped = CATEGORY_OF[p.name] ?? CATEGORY_OF[displayName(p)];
	if (mapped) return mapped;
	const c = String(p.category || '').trim();
	if (!c || ['other', 'owner', 'downloader'].includes(c.toLowerCase())) {
		return c.toLowerCase() === 'downloader' ? 'DOWNLOADER' : FALLBACK_CATEGORY;
	}
	return c;
}

/** Kelompokkan plugin ke kategori terurut: [{ key, icon, plugins: [...] }] */
function buildCategories() {
	const { list } = getPluginRegistry();
	const groups = new Map();
	for (const p of list) {
		const key = categoryOf(p);
		if (key === 'MENU') continue;
		if (!groups.has(key)) groups.set(key, []);
		groups.get(key).push(p);
	}
	const order = CATEGORY_META.map(c => c.key);
	const keys = [...groups.keys()].sort((a, b) => {
		const ia = order.indexOf(a), ib = order.indexOf(b);
		if (ia === -1 && ib === -1) return a.localeCompare(b);
		if (ia === -1) return 1;
		if (ib === -1) return -1;
		return ia - ib;
	});
	return keys.map(key => ({
		key,
		icon: CATEGORY_META.find(c => c.key === key)?.icon || '📦',
		plugins: groups.get(key).sort((a, b) => displayName(a).localeCompare(displayName(b))),
	}));
}

/** Nama command yang ditampilkan di menu utama untuk satu plugin. */
function listedNames(p) {
	if (EXPAND_ALIASES.has(p.name)) return [p.name, ...p.aliases].filter(isWord);
	return [displayName(p)];
}

function sapaan() {
	const jam =
		Number(new Intl.DateTimeFormat('en-GB', { hour: '2-digit', hour12: false, timeZone: TZ }).format(new Date())) % 24;
	if (jam >= 4 && jam < 11) return { teks: 'Selamat pagi', emoji: '🌅' };
	if (jam >= 11 && jam < 15) return { teks: 'Selamat siang', emoji: '☀️' };
	if (jam >= 15 && jam < 18) return { teks: 'Selamat sore', emoji: '🌇' };
	return { teks: 'Selamat malam', emoji: '🌙' };
}

function uptimeText() {
	const up = Math.floor(process.uptime());
	const d = Math.floor(up / 86400);
	const h = Math.floor((up % 86400) / 3600);
	const mnt = Math.floor((up % 3600) / 60);
	return d > 0 ? `${d}h ${h}j ${mnt}m` : h > 0 ? `${h}j ${mnt}m` : `${mnt}m`;
}

// ───────────────────────── teks menu (Tema Ada Wong RE4) ─────────────────────────

const BOT_NAME = process.env.BOT_NAME || 'ADAWONG BOT';
const FRAME_TOP = '┏━━━━━━━━━━━━━━━━━━━━━━━━━━┓';
const FRAME_MID = '┣━━━━━━━━━━━━━━━━━━━━━━━━━━┫';
const FRAME_BOT = '┗━━━━━━━━━━━━━━━━━━━━━━━━━━┛';
const NUM_ICON = ['❶', '❷', '❸', '❹', '❺', '❻', '❼', '❽', '❾', '❿'];
const numIcon = i => NUM_ICON[i - 1] || `(${i})`;
const CHIP_SEP = '  ';
const LINE_MAX = 32;

/** Huruf tebal gaya modern (Mathematical Sans-Serif Bold) untuk judul & header. */
function fancy(str) {
	return [...String(str)].map(ch => {
		const c = ch.codePointAt(0);
		if (c >= 65 && c <= 90) return String.fromCodePoint(0x1d5d4 + c - 65);
		if (c >= 97 && c <= 122) return String.fromCodePoint(0x1d5ee + c - 97);
		if (c >= 48 && c <= 57) return String.fromCodePoint(0x1d7ec + c - 48);
		return ch;
	}).join('');
}

/** Header bingkai untuk tiap blok/kategori. */
function boxHeader(title) {
	return `┏━━〘 ${title} 〙━━┓`;
}

/** Panjang tampilan kira-kira (abaikan tanda bintang bold WA, emoji dihitung 2). */
const visLen = str => [...String(str).replace(/\*/g, '').replace(/\p{Extended_Pictographic}/gu, 'xx')].length;

/** Bungkus daftar command tebal jadi baris-baris rapi di dalam bingkai. */
function wrapChips(chips, max = LINE_MAX) {
	const lines = [];
	let cur = '';
	for (const c of chips) {
		const item = `◈ ${c}`;
		const next = cur ? cur + CHIP_SEP + item : item;
		if (cur && visLen(next) > max) {
			lines.push(cur);
			cur = item;
		} else {
			cur = next;
		}
	}
	if (cur) lines.push(cur);
	return lines;
}

const badgeOf = p => (p.ownerOnly ? '👑' : p.groupOnly ? '👥' : '');

/** Prefix yang benar per kategori. */
const prefixFor = (cat, px) => px;

// ───────────────────────── animasi loading RE4 ─────────────────────────

const LOADING_FRAMES = [
	{
		bar: '███░░░░░░░',
		pct: '25%',
		status: 'Membuka akses Red Butterfly...',
		icon: '🦋',
	},
	{
		bar: '██████░░░░',
		pct: '60%',
		status: 'Menyiapkan persenjataan & modul...',
		icon: '☣️',
	},
	{
		bar: '██████████',
		pct: '100%',
		status: 'Verifikasi selesai. Selamat datang!',
		icon: '🥀',
	},
];

function renderLoadingFrame(frame, who) {
	return (
		`${boxHeader(`☣️ *${fancy('CRIMSON OS v4.0')}*`)}\n` +
		`┃ 🦋 *${fancy('AGENT')}*  : *${who}*\n` +
		`┃ 📡 *${fancy('STATUS')}* : _${frame.status}_\n` +
		`┃ ${frame.icon} *${fancy('PROSES')}* : *[${frame.bar}] ${frame.pct}*\n` +
		`${FRAME_BOT}`
	);
}

/**
 * Jalankan animasi loading bar bergerak di 1 bubble pesan sebelum menu utama tampil.
 * Mengembalikan key pesan loading (agar bisa diedit/dihapus bila perlu).
 */
async function playAdaWongLoading(hisoka, m, who) {
	const enabled = String(process.env.BOT_MENU_LOADING ?? 'true').toLowerCase() !== 'false';
	if (!enabled) return null;

	// Beri reaksi emoji kupu-kupu merah khas Ada Wong
	try {
		await hisoka.sendMessage(m.from, { react: { text: '🦋', key: m.key } });
	} catch {}

	let sentKey = null;
	try {
		const firstText = renderLoadingFrame(LOADING_FRAMES[0], who);
		const sent = await hisoka.sendMessage(m.from, { text: firstText }, { quoted: m });
		sentKey = sent?.key || null;
	} catch {
		return null;
	}

	if (!sentKey) return null;

	for (let i = 1; i < LOADING_FRAMES.length; i++) {
		await sleep(420);
		try {
			await hisoka.sendMessage(m.from, {
				text: renderLoadingFrame(LOADING_FRAMES[i], who),
				edit: sentKey,
			});
		} catch {
			break;
		}
	}

	await sleep(300);
	return sentKey;
}

// ───────────────────────── penyusun teks menu ─────────────────────────

function buildMenu({ who, ownerName, gcLink, cats, isClone = false }) {
	const px = displayPrefix();
	const now = new Date();
	const tanggal = now.toLocaleDateString('id-ID', {
		weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', timeZone: TZ,
	});
	const jam = now.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit', timeZone: TZ }).replace(':', '.');
	const { map } = getPluginRegistry();
	const total = cats.reduce((n, c) => n + c.plugins.length, 0);
	const { teks, emoji } = sapaan();
	const quote = QUOTES[Math.floor(Math.random() * QUOTES.length)];

	const head =
		`${FRAME_TOP}\n` +
		`┃   ╭─── 🦋 ⋅ ☣️ ⋅ 🦋 ───╮\n` +
		`┃   🥀 𓆩 *${fancy(BOT_NAME)}* 𓆪 🥀\n` +
		`┃   ╰─── ❖ ⋅ ⌖ ⋅ ❖ ───╯\n` +
		`${FRAME_MID}\n` +
		`┃ ${emoji} *${teks}, ${who}!*\n` +
		`┃ _“${quote}”_\n` +
		`${FRAME_BOT}\n\n` +
		`${boxHeader(`☣️ *${fancy('SYSTEM INFO')}*`)}\n` +
		`┃ 👑 *Owner*   : *${ownerName}*\n` +
		`┃ ⚡ *Uptime*  : *${uptimeText()}*\n` +
		`┃ 🗓️ *Tanggal* : *${tanggal}*\n` +
		`┃ 🕒 *Waktu*   : *${jam} WIB*\n` +
		`┃ 📚 *Total*   : *${total} Fitur • ${map.size} Cmd*\n` +
		`┃ 🔣 *Prefix*  : *[ ${px} ]*\n` +
		`┃ 🤖 *Mode*    : *${isClone ? 'Clone Bot' : 'Bot Utama'}*\n` +
		`${FRAME_BOT}\n`;

	const body = cats
		.map((c, i) => {
			const cp = prefixFor(c, px);
			const chips = c.plugins.flatMap(p => listedNames(p).map(n => `*${cp}${n}*${badgeOf(p)}`));
			return (
				`\n${boxHeader(`${numIcon(i + 1)}${c.icon} *${fancy(c.key)}* ‹*${chips.length}*›`)}\n` +
				wrapChips(chips).map(l => `┃ ${l}`).join('\n') +
				`\n${FRAME_BOT}`
			);
		})
		.join('\n');

	const foot =
		`\n\n${boxHeader(`💡 *${fancy('PANDUAN MENU')}*`)}\n` +
		`┃ ▸ *${px}menu 1* — *Detail & deskripsi*\n` +
		`┃ ▸ *${px}menu downloader* — *Cari nama*\n` +
		`┃ ▸ *${px}menu kategori* — *Daftar ringkas*\n` +
		`${FRAME_MID}\n` +
		`┃ 👑 *Khusus Owner*  •  👥 *Khusus Grup*\n` +
		`${FRAME_BOT}\n\n` +
		(gcLink
			? `${boxHeader(`👥 *${fancy('GRUP OFFICIAL')}*`)}\n┃ 🔗 ${gcLink}\n${FRAME_BOT}\n\n`
			: '') +
		`╭─── 🦋 *${fancy(BOT_NAME)}* 🦋 ───╮\n` +
		`╰─── 🥀 *by ${ownerName}* 🥀 ───╯`;

	return { text: head + body + foot, total };
}

/** Daftar kategori ringkas (.menu kategori). */
function buildCategoryIndex(cats) {
	const px = displayPrefix();
	const rows = cats.map((c, i) => {
		const n = c.plugins.flatMap(p => listedNames(p)).length;
		return `┃ ${numIcon(i + 1)} ${c.icon} *${fancy(c.key)}* — ‹*${n} Cmd*›`;
	});
	return (
		`${boxHeader(`🗂️ *${fancy('DAFTAR KATEGORI')}*`)}\n` +
		rows.join('\n') +
		`\n${FRAME_MID}\n` +
		`┃ 💡 *Ketik:* *${px}menu 1* atau *${px}menu downloader*\n` +
		`${FRAME_BOT}`
	);
}

function buildCategoryDetail(cat, index) {
	const px = displayPrefix();
	const cp = prefixFor(cat, px);
	const lines = cat.plugins.map(p => {
		const aliases = p.aliases.filter(a => isWord(a) && a !== displayName(p));
		const alias = aliases.length ? ` _(${aliases.map(a => `*${cp}${a}*`).join(', ')})_` : '';
		const desc = p.desc ? `\n┃    ╰ 📌 *${p.desc.split('\n')[0].slice(0, 120)}*` : '';
		return `┃ ◈ *${cp}${displayName(p)}* ${badgeOf(p)}${alias}${desc}`;
	});
	return (
		`${boxHeader(`${numIcon(index)}${cat.icon} *${fancy(cat.key)}* ‹*${cat.plugins.length}*›`)}\n` +
		`┃\n` +
		lines.join('\n┃\n') +
		`\n${FRAME_MID}\n` +
		`┃ 👑 *Owner*  •  👥 *Grup*\n` +
		`┃ 💡 *Kembali ke menu utama:* *${px}menu*\n` +
		`${FRAME_BOT}`
	);
}

/** Cari kategori dari argumen: nomor ("3") atau nama ("downloader", "18"). */
function findCategory(cats, arg) {
	const a = String(arg || '').trim().toLowerCase();
	if (!a) return null;
	if (/^\d+$/.test(a)) {
		const i = parseInt(a, 10) - 1;
		if (cats[i]) return { cat: cats[i], index: i + 1 };
	}
	const i = cats.findIndex(c => c.key.toLowerCase() === a || c.key.toLowerCase().startsWith(a) || c.key.toLowerCase().includes(a));
	return i >= 0 ? { cat: cats[i], index: i + 1 } : null;
}

// ───────────────────────── animasi GIF/MP4 & thumbnail ─────────────────────────

let thumbCache = { buf: null, at: 0 };
let animCache = { buf: null, at: 0 };
const CACHE_RETRY_MS = 10 * 60 * 1000;

async function runFfmpeg(args, timeout = 25000) {
	for (const bin of [process.env.FFMPEG_PATH, 'ffmpeg', '/usr/bin/ffmpeg'].filter(Boolean)) {
		try {
			await execFileAsync(bin, args, { timeout });
			return true;
		} catch { /* coba binary berikutnya */ }
	}
	return false;
}

async function shrinkJpeg(buf) {
	const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'menu-img-'));
	const input = path.join(dir, 'in');
	const output = path.join(dir, 'out.jpg');
	try {
		fs.writeFileSync(input, buf);
		const ok = await runFfmpeg(['-y', '-i', input, '-vf', 'scale=480:-2', '-frames:v', '1', '-q:v', '6', output]);
		return ok && fs.existsSync(output) ? fs.readFileSync(output) : null;
	} finally {
		fs.rmSync(dir, { recursive: true, force: true });
	}
}

/**
 * Konversi GIF atau MP4 ke MP4 H.264 (yuv420p, tanpa audio) agar gifPlayback WhatsApp
 * dijamin berputar otomatis di Android, iOS, dan WhatsApp Web.
 * FIX: gambar statis (JPEG/PNG, termasuk file .gif yang isinya JPEG) harus di-loop
 * dengan `-loop 1` supaya jadi video 6 detik (90 frame), bukan 1 frame 0.066 detik
 * yang ditolak / tidak tampil sebagai GIF di WhatsApp.
 */
async function toWhatsAppGifMp4(buf, ext = 'mp4') {
	const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'menu-gif-'));
	const input = path.join(dir, `in.${ext}`);
	const output = path.join(dir, 'out.mp4');
	try {
		fs.writeFileSync(input, buf);
		// Deteksi gambar statis dari magic bytes (tahan terhadap file salah ekstensi,
		// mis. .gif yang isinya JPEG): JPEG FF D8 FF, PNG 89 50 4E 47.
		const isStaticImage =
			(buf[0] === 0xFF && buf[1] === 0xD8 && buf[2] === 0xFF) ||
			(buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4E && buf[3] === 0x47) ||
			['jpg', 'jpeg', 'png', 'webp'].includes(String(ext).toLowerCase());
		const args = [
			'-y',
			...(isStaticImage ? ['-loop', '1'] : []),
			'-i', input,
			'-an',
			'-vf', 'scale=480:-2:flags=lanczos,fps=15',
			'-c:v', 'libx264',
			'-pix_fmt', 'yuv420p',
			'-profile:v', 'baseline',
			'-level', '3.0',
			'-preset', 'ultrafast',
			'-crf', '28',
			'-movflags', '+faststart',
			'-t', '6',
			output,
		];
		const ok = await runFfmpeg(args, 30000);
		return ok && fs.existsSync(output) ? fs.readFileSync(output) : null;
	} finally {
		fs.rmSync(dir, { recursive: true, force: true });
	}
}

/**
 * Ambil animasi Ada Wong RE4 (Buffer MP4 siap gifPlayback).
 * Urutan:
 *   1. File lokal: assets/menu-adawong.mp4 atau assets/menu-adawong.gif
 *   2. Unduh dari BANNER_GIF_URL (.env BOT_MENU_GIF_URL atau link default)
 */
async function getAnimatedAdaWong() {
	if (animCache.buf) return animCache.buf;
	if (animCache.at && Date.now() - animCache.at < CACHE_RETRY_MS) return null;
	animCache.at = Date.now();

	let rawBuf = null;
	let ext = 'mp4';

	if (fs.existsSync(LOCAL_MP4)) {
		try { rawBuf = fs.readFileSync(LOCAL_MP4); ext = 'mp4'; } catch {}
	} else if (fs.existsSync(LOCAL_GIF)) {
		try { rawBuf = fs.readFileSync(LOCAL_GIF); ext = 'gif'; } catch {}
	}

	if (!rawBuf && BANNER_GIF_URL) {
		try {
			const ctrl = new AbortController();
			const timer = setTimeout(() => ctrl.abort(), 10000);
			try {
				const res = await fetch(BANNER_GIF_URL, { signal: ctrl.signal });
				if (res.ok) {
					rawBuf = Buffer.from(await res.arrayBuffer());
					if (BANNER_GIF_URL.toLowerCase().endsWith('.gif')) ext = 'gif';
				}
			} finally {
				clearTimeout(timer);
			}
		} catch { /* offline / gagal unduh */ }
	}

	if (!rawBuf) return null;

	const converted = await toWhatsAppGifMp4(rawBuf, ext);
	const finalBuf = converted || (ext === 'mp4' ? rawBuf : null);
	if (finalBuf) {
		animCache = { buf: finalBuf, at: Date.now() };
	}
	return animCache.buf;
}

/** Thumbnail gambar statis untuk kartu / cadangan bila animasi tidak tersedia. */
async function getThumbnail() {
	if (thumbCache.buf) return thumbCache.buf;
	if (thumbCache.at && Date.now() - thumbCache.at < CACHE_RETRY_MS) return null;
	thumbCache.at = Date.now();

	let buf = null;
	try { buf = fs.readFileSync(MENU_BANNER); } catch { /* assets/ tidak ada */ }

	if (!buf) {
		try {
			const ctrl = new AbortController();
			const timer = setTimeout(() => ctrl.abort(), 8000);
			try {
				const res = await fetch(BANNER_URL, { signal: ctrl.signal });
				if (res.ok) buf = Buffer.from(await res.arrayBuffer());
			} finally {
				clearTimeout(timer);
			}
		} catch { /* offline / diblokir -> null */ }
	}

	if (buf && buf.length > 100 * 1024) buf = (await shrinkJpeg(buf)) || buf;
	if (buf && buf.length <= 300 * 1024) thumbCache = { buf, at: Date.now() };
	return thumbCache.buf;
}

// ───────────────────────── plugin ─────────────────────────

export default {
	name: 'menu',
	aliases: ['help', '?', 'btnmenu'],
	category: 'other',
	desc: 'Menampilkan daftar menu. Contoh: ?menu | ?menu 1 | ?menu downloader | ?menu kategori',
	async run(ctx) {
		const { hisoka, m, query } = ctx;
		const ownerName = process.env.BOT_OWNER_NAME || 'Iyan';
		const who = m.pushName || ownerName;
		const gcLink = readGcLink();
		const cats = buildCategories();

		if (!cats.length) {
			await m.reply('⚠️ *Belum ada plugin yang termuat.*');
			return;
		}

		// ── Detail satu kategori ──
		const arg = (query || '').trim();
		if (/^(kategori|category|list|daftar|index)$/i.test(arg)) {
			await m.reply(buildCategoryIndex(cats));
			return;
		}
		if (arg) {
			const found = findCategory(cats, arg);
			if (!found) {
				const px = displayPrefix();
				await m.reply(
					`${boxHeader(`❌ *${fancy('TIDAK DITEMUKAN')}*`)}\n` +
					`┃ Kategori *${arg}* tidak tersedia.\n` +
					`${FRAME_MID}\n` +
					cats.map((c, i) => `┃ ${numIcon(i + 1)} ${c.icon} *${fancy(c.key)}*`).join('\n') +
					`\n${FRAME_MID}\n` +
					`┃ 💡 *Contoh:* *${px}menu 1*\n` +
					`${FRAME_BOT}`
				);
				return;
			}
			await m.reply(buildCategoryDetail(found.cat, found.index));
			return;
		}

		// ── Jalankan Animasi Loading RE4 paralel sambil menyiapkan media ──
		const { text, total } = buildMenu({ who, ownerName, gcLink, cats, isClone: !!hisoka._isClone });
		const style = (process.env.BOT_MENU_STYLE || 'gif').toLowerCase();
		const ownerNum = (process.env.BOT_NUMBER_OWNER || '').split(',')[0].trim();

		const [loadingKey] = await Promise.all([
			playAdaWongLoading(hisoka, m, who),
			// Pre-warm cache paralel supaya begitu loading 100% langsung terkirim
			['gif', 'animasi', 'video'].includes(style) ? getAnimatedAdaWong() : getThumbnail(),
		]);

		// Ubah reaksi jadi mawar merah saat menu siap dikirim
		try {
			await hisoka.sendMessage(m.from, { react: { text: '🥀', key: m.key } });
		} catch {}

		// Kalau style=text dan ada pesan loading, langsung timpa pesan loading-nya jadi menu
		if (style === 'text') {
			if (loadingKey) {
				try {
					await hisoka.sendMessage(m.from, { text, edit: loadingKey });
					return;
				} catch {}
			}
			await m.reply(text);
			return;
		}

		// Hapus bubble loading tepat sebelum mengirim media GIF/Kartu agar chat tetap bersih
		const cleanupLoading = async () => {
			if (!loadingKey) return;
			try {
				await hisoka.sendMessage(m.from, { delete: loadingKey });
			} catch {}
		};

		// 1. Gaya Animasi Ada Wong RE4 (Default: 'gif' / 'animasi' / 'video')
		if (['gif', 'animasi', 'video'].includes(style)) {
			try {
				const animBuf = await getAnimatedAdaWong();
				if (animBuf) {
					await cleanupLoading();
					// FIX utama: caption video WhatsApp max ~1024 karakter, sedangkan
					// teks menu penuh ~2700 karakter (4431 byte) → kirim video + caption
					// penuh DITOLAK / tidak tampil. Pola sama seperti gaya gambar:
					// kalau teks >1000 byte, kirim video tanpa caption lalu teks terpisah.
					const adReply = {
						title: `🥀 𓆩 ${fancy(BOT_NAME)} 𓆪 🦋`,
						body: `👑 ${ownerName} • ⚡ ${uptimeText()} • 📚 ${total} Fitur`,
						mediaType: 1,
						renderLargerThumbnail: false,
						showAdAttribution: false,
						thumbnailUrl: BANNER_URL,
						sourceUrl: gcLink || (ownerNum ? `https://wa.me/${ownerNum}` : BANNER_URL),
					};
					if (Buffer.byteLength(text, 'utf8') > 1000) {
						await hisoka.sendMessage(
							m.from,
							{
								video: animBuf,
								gifPlayback: true,
								contextInfo: { externalAdReply: adReply },
							},
							{ quoted: m }
						);
						await m.reply(text);
					} else {
						await hisoka.sendMessage(
							m.from,
							{
								video: animBuf,
								gifPlayback: true,
								caption: text,
								contextInfo: { externalAdReply: adReply },
							},
							{ quoted: m }
						);
					}
					return;
				}
			} catch (e) {
				console.warn('[menu] animasi Ada Wong gagal, beralih ke kartu:', e?.message || e);
			}
		}

		// 2. Gaya Kartu: satu pesan dengan thumbnail besar (atau fallback jika GIF gagal)
		if (style !== 'image') {
			try {
				const thumbnail = await getThumbnail();
				await cleanupLoading();
				await hisoka.sendMessage(
					m.from,
					{
						text,
						contextInfo: {
							externalAdReply: {
								title: `🥀 𓆩 ${fancy(BOT_NAME)} 𓆪 🦋`,
								body: `👑 ${ownerName} • ⚡ ${uptimeText()} • 📚 ${total} Fitur`,
								mediaType: 1,
								renderLargerThumbnail: true,
								showAdAttribution: false,
								...(thumbnail ? { thumbnail } : { thumbnailUrl: BANNER_URL }),
								sourceUrl: gcLink || (ownerNum ? `https://wa.me/${ownerNum}` : BANNER_URL),
							},
						},
					},
					{ quoted: m }
				);
				return;
			} catch (e) {
				console.warn('[menu] gaya kartu gagal, pakai gambar:', e?.message || e);
			}
		}

		// 3. Gaya Gambar / Cadangan Terakhir
		try {
			const thumb = await getThumbnail();
			let banner = thumb;
			if (!banner) {
				try { banner = fs.readFileSync(MENU_BANNER); } catch { /* tidak ada */ }
			}
			const image = banner ? { image: banner } : { image: { url: BANNER_URL } };
			await cleanupLoading();
			await hisoka.sendMessage(m.from, { ...image, caption: text }, { quoted: m });
		} catch (e) {
			console.warn('[menu] gambar gagal, kirim teks:', e?.message || e);
			if (loadingKey) {
				try {
					await hisoka.sendMessage(m.from, { text, edit: loadingKey });
					return;
				} catch {}
			}
			await m.reply(text);
		}
	},
};

// Diekspor untuk test / dipakai plugin lain bila perlu.
export { buildCategories, buildMenu, buildCategoryDetail, buildCategoryIndex, findCategory };
