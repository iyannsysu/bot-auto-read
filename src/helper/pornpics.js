'use strict';
// PornPics search helper — foto dewasa dari pornpics.com (masih bisa diakses 2026-10-06).

import fs from 'fs';
import os from 'os';
import path from 'path';

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36';

// Kamus Indonesia -> Inggris (situsnya cuma ngerti bahasa Inggris).
const ID_EN = {
	'eropa': 'european',
	'asia': 'asian',
	'indonesia': 'indonesian',
	'indo': 'indonesian',
	'jepang': 'japanese',
	'korea': 'korean',
	'cina': 'chinese',
	'thailand': 'thai',
	'pirang': 'blonde',
	'blonde': 'blonde',
	'berambut pirang': 'blonde',
	'coklat': 'brunette',
	'brunet': 'brunette',
	'berambut coklat': 'brunette',
	'hitam': 'black hair',
	'berambut hitam': 'black hair',
	'merah': 'redhead',
	'berambut merah': 'redhead',
	'montok': 'curvy',
	'seksi': 'sexy',
	'cantik': 'beautiful',
	// 'muda' SENGAJA tidak dimapping — query usia ambigu/minor ditolak (lihat BLOCKED).
	'dewasa': 'mature',
	'milf': 'milf',
	'payudara besar': 'big tits',
	'tetek besar': 'big tits',
	'bokong besar': 'big ass',
	'pantat besar': 'big ass',
	'lesbi': 'lesbian',
	'lesbian': 'lesbian',
	'anal': 'anal',
	'threesome': 'threesome',
	'berjilbab': 'hijab',
	'hijab': 'hijab',
	'jilbab': 'hijab',
};

/**
 * Terjemahkan kata kunci Indonesia ke Inggris kata per kata/frasa.
 */
export function translateKeyword(keyword) {
	let q = (keyword || '').toLowerCase().trim();
	// Coba cocokkan frasa utuh dulu.
	if (ID_EN[q]) return ID_EN[q];
	// Lalu kata per kata.
	const words = q.split(/\s+/).map(w => ID_EN[w] || w);
	return words.join(' ');
}

// Kata kunci yang mengarah ke minor / usia ambigu — SELALU ditolak.
// Berlaku untuk .ppic (dan helper lain yang memakai isBlockedQuery).
const BLOCKED_RE = /\b(muda|bocil|bocah|anak|remaja|abg|teen|teens|teenage|young|youth|loli|lolita|schoolgirl|school|child|kid|kids|minor|underage|preteen)\b/i;

/**
 * true jika query mengandung istilah minor / usia ambigu.
 */
export function isBlockedQuery(keyword) {
	return BLOCKED_RE.test(keyword || '');
}

/**
 * Cari foto di pornpics.com. Mengembalikan array URL gambar HD (1280px).
 * @param {string} query kata kunci
 * @param {number} max maksimal hasil
 */
export async function searchPornPics(query, max = 10) {
	const translated = translateKeyword(query);
	const q = encodeURIComponent(translated.trim());
	if (!q) return [];
	const url = `https://www.pornpics.com/search/srch.php?q=${q}`;
	const res = await fetch(url, { headers: { 'User-Agent': UA } });
	if (!res.ok) throw new Error('PornPics HTTP ' + res.status);
	const html = await res.text();
	// Ambil URL cdni .../460/... lalu upgrade ke 1280 untuk HD.
	const found = [...html.matchAll(/https:\/\/cdni\.pornpics\.com\/460(\/[^"'\s]+\.jpg)/g)]
		.map(m => 'https://cdni.pornpics.com/1280' + m[1]);
	// Dedup, pertahankan urutan.
	const uniq = [...new Set(found)];
	return uniq.slice(0, max);
}

/**
 * Download beberapa URL gambar ke direktori temp.
 * @param {string[]} urls
 * @returns {{files: string[], tmpDir: string}}
 */
export async function downloadPornPics(urls) {
	const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ppic-'));
	const files = [];
	try {
		await Promise.all(
			urls.map(async (u, i) => {
				const res = await fetch(u, { headers: { 'User-Agent': UA, Referer: 'https://www.pornpics.com/' } });
				if (!res.ok) return;
				const buf = Buffer.from(await res.arrayBuffer());
				if (buf.length < 5000) return; // skip file rusak/kecil
				const fp = path.join(tmpDir, `ppic_${i}.jpg`);
				fs.writeFileSync(fp, buf);
				files.push(fp);
			})
		);
		if (!files.length) throw new Error('Semua download gagal.');
		// Urutkan sesuai index agar album rapi.
		files.sort();
		return { files, tmpDir };
	} catch (err) {
		fs.rmSync(tmpDir, { recursive: true, force: true });
		throw err;
	}
}

export function cleanupPornPics(tmpDir) {
	if (tmpDir) fs.rmSync(tmpDir, { recursive: true, force: true });
}
