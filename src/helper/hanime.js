'use strict';

import { execFile } from 'child_process';
import { fileURLToPath } from 'url';
import path from 'path';

const HELPER_DIR = path.dirname(fileURLToPath(import.meta.url));
import { PYTHON as PY } from './paths.js';
const HV_DL = path.join(HELPER_DIR, 'hv-dl.py');

const UA =
	'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36';
const SEARCH_API = 'https://guest.freeanimehentai.net/api/v11/search_hvs';
const VIDEO_API = 'https://hanime-scraper.sapis.workers.dev/api/video';

/**
 * Cari video di hanime.tv berdasarkan kata kunci.
 * @param {string} query kata kunci
 * @param {number} limit jumlah hasil (max 10)
 * @returns {Promise<Array<{name, slug, views, likes, tags, poster}>>}
 */
export async function searchHanime(query, limit = 8) {
	limit = Math.max(1, Math.min(10, limit || 8));
	const url =
		`${SEARCH_API}?search_text=${encodeURIComponent(query)}` +
		`&orientation=straight&order_by=likes&ordering=desc`;
	const res = await fetch(url, {
		headers: { 'User-Agent': UA, Accept: 'application/json' },
	});
	if (!res.ok) throw new Error('Gagal mencari di Hanime. Coba lagi.');
	const json = await res.json();
	const data = Array.isArray(json.data) ? json.data : [];
	if (!data.length) throw new Error('Tidak ketemu videonya, coba kata kunci lain.');
	return data.slice(0, limit).map(v => ({
		name: v.name || v.slug,
		slug: v.slug,
		views: v.views || 0,
		likes: v.likes || 0,
		tags: (v.tags || []).slice(0, 5),
		poster: v.poster_url || '',
	}));
}

/**
 * Ambil daftar stream (720p/480p/360p) untuk sebuah video.
 * @param {string} slug slug video hanime.tv
 * @returns {Promise<{title: string, streams: Array<{quality, url}>}>}
 */
export async function getHanimeStreams(slug) {
	const res = await fetch(`${VIDEO_API}/${slug}`, {
		headers: { 'User-Agent': UA, Accept: 'application/json', Referer: 'https://hanime.tv/' },
	});
	if (!res.ok) throw new Error('Gagal mengambil info video. Coba lagi.');
	const json = await res.json();
	const streams = Array.isArray(json.streams) ? json.streams : [];
	if (!streams.length) throw new Error('Stream video tidak tersedia.');
	return {
		title: (json.video && json.video.name) || slug,
		streams: streams.map(s => ({ quality: s.quality, url: s.url })),
	};
}

/**
 * Pilih stream terbaik untuk WhatsApp (480p > 360p > 720p).
 * 480p dipilih sebagai default: cukup jernih, ukuran masuk akal.
 */
export function pickHanimeStream(streams) {
	const order = ['480p', '360p', '720p'];
	for (const q of order) {
		const s = streams.find(x => x.quality === q);
		if (s) return s;
	}
	return streams[0];
}

/**
 * Unduh HLS stream (AES-128) jadi file MP4.
 * Via hv-dl.py (Python): unduh per-segmen dengan retry — jauh lebih stabil
 * daripada ffmpeg langsung karena koneksi persisten ffmpeg sering putus
 * lewat proxy worker.
 * @param {string} url URL playlist m3u8
 * @param {string} outPath path file output .mp4
 * @returns {Promise<string>} outPath
 */
export function downloadHanimeStream(url, outPath) {
	return new Promise((resolve, reject) => {
		execFile(
			PY,
			[HV_DL, url, outPath],
			{ timeout: 30 * 60 * 1000, maxBuffer: 64 * 1024 * 1024 },
			err => {
				if (err) reject(new Error('Gagal mengunduh video. Coba lagi nanti.'));
				else resolve(outPath);
			}
		);
	});
}

/** Format angka views/likes jadi ringkas (1.2jt, 340rb). */
export function shortNum(n) {
	n = Number(n) || 0;
	if (n >= 1e6) return (n / 1e6).toFixed(1).replace('.', ',') + 'jt';
	if (n >= 1e3) return (n / 1e3).toFixed(0) + 'rb';
	return String(n);
}
