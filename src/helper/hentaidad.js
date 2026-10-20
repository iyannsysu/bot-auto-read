'use strict';

import fs from 'fs';
import path from 'path';
import os from 'os';

const BASE = 'https://hentaidad.com';
const UA =
	'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36';

/**
 * Cari galeri di hentaidad.com berdasarkan kata kunci,
 * unduh N gambar pertama dari galeri teratas.
 * @param {string} query kata kunci
 * @param {number} count jumlah gambar (1-20)
 * @returns {Promise<{files: string[], tmpDir: string, title: string, total: number}>}
 */
export async function searchHentaidad(query, count = 10) {
	count = Math.max(1, Math.min(20, count || 10));
	const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'hd-'));

	try {
		// 1. Cari galeri
		const searchHtml = await getHtml(`${BASE}/search?q=${encodeURIComponent(query)}`);
		const slugs = [...searchHtml.matchAll(/class="archive-card-link"[^>]*href="(\/[a-z0-9-]+)"/gi)]
			.map(m => m[1])
			.filter((v, i, a) => a.indexOf(v) === i);
		if (!slugs.length) {
			throw new Error('Tidak ketemu galerinya, coba kata kunci lain.');
		}
		// Pilih galeri yang slug-nya paling cocok dengan kata kunci
		const words = query.toLowerCase().split(/\s+/).filter(Boolean);
		slugs.sort((a, b) => {
			const score = s => words.reduce((n, w) => n + (s.includes(w) ? 1 : 0), 0);
			return score(b) - score(a);
		});

		// 2. Buka galeri teratas
		const gallery = await getGallery(BASE + slugs[0]);

		// 3. Unduh N gambar pertama
		const files = await downloadImages(gallery.images.slice(0, count), tmpDir);
		if (!files.length) {
			throw new Error('Gagal mengunduh gambar galeri.');
		}
		return { files, tmpDir, title: gallery.title, total: gallery.images.length };
	} catch (err) {
		fs.rmSync(tmpDir, { recursive: true, force: true });
		if (err && /^(Tidak ketemu|Gagal)/.test(err.message)) throw err;
		throw new Error('Gagal mengambil dari Hentaidad. Coba lagi.');
	}
}

/**
 * Unduh N gambar pertama dari URL galeri hentaidad langsung.
 * @param {string} url URL galeri
 * @param {number} count jumlah gambar (1-20)
 */
export async function downloadHentaidadGallery(url, count = 10) {
	count = Math.max(1, Math.min(20, count || 10));
	const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'hd-'));
	try {
		const gallery = await getGallery(url);
		const files = await downloadImages(gallery.images.slice(0, count), tmpDir);
		if (!files.length) {
			throw new Error('Gagal mengunduh gambar galeri.');
		}
		return { files, tmpDir, title: gallery.title, total: gallery.images.length };
	} catch (err) {
		fs.rmSync(tmpDir, { recursive: true, force: true });
		if (err && err.message === 'Gagal mengunduh gambar galeri.') throw err;
		throw new Error('Gagal membuka galeri. Pastikan link valid.');
	}
}

/** Ambil HTML halaman. */
async function getHtml(url) {
	const res = await fetch(url, {
		headers: { 'User-Agent': UA, 'Accept-Language': 'en-US,en;q=0.9' },
		signal: AbortSignal.timeout(30000),
	});
	if (!res.ok) throw new Error('fetch gagal');
	return await res.text();
}

/** Parse halaman galeri: judul + daftar URL gambar full-size. */
async function getGallery(url) {
	const html = await getHtml(url);
	const titleMatch = html.match(/<h1[^>]*>([^<]+)/i);
	const title = titleMatch ? titleMatch[1].trim() : 'Galeri';
	const all = html.match(/https:\/\/hentaidad\.com\/content\/images\/[^"]+?\.(?:webp|jpg|jpeg|png)/gi) || [];
	const images = [...new Set(all.filter(u => !u.includes('-thumb.')))].sort();
	if (!images.length) throw new Error('Gagal mengunduh gambar galeri.');
	return { title, images };
}

/** Unduh daftar URL gambar secara paralel. */
async function downloadImages(urls, tmpDir) {
	const jobs = urls.map(async (url, idx) => {
		try {
			const res = await fetch(url, {
				headers: { 'User-Agent': UA, Referer: BASE + '/' },
				signal: AbortSignal.timeout(120000),
			});
			if (!res.ok || !res.body) return null;
			const buf = Buffer.from(await res.arrayBuffer());
			if (buf.length < 1024) return null;
			const ext = (url.split('.').pop() || 'webp').split(/[?#]/)[0].slice(0, 4);
			const dest = path.join(tmpDir, `${String(idx).padStart(2, '0')}.${ext}`);
			fs.writeFileSync(dest, buf);
			return dest;
		} catch {
			return null;
		}
	});
	const results = await Promise.all(jobs);
	return results.filter(Boolean);
}

/**
 * Hapus direktori temp hasil download.
 * @param {string} tmpDir
 */
export function cleanupHentaidad(tmpDir) {
	try {
		fs.rmSync(tmpDir, { recursive: true, force: true });
	} catch {
		// abaikan
	}
}
