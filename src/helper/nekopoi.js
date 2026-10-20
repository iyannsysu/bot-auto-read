'use strict';

import fs from 'fs';
import path from 'path';

const BASE = 'https://nekopoi.care';
const LIST_URL = BASE + '/hentai-list/';
const INDEX_FILE = path.join(process.cwd(), 'nekopoi_index.json');
const INDEX_TTL = 24 * 60 * 60 * 1000; // 24 jam
const UA =
	'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36';

function readIndex() {
	try {
		const d = JSON.parse(fs.readFileSync(INDEX_FILE, 'utf-8') || '{}');
		if (Array.isArray(d.items) && d.items.length && Date.now() - (d.updated || 0) < INDEX_TTL) {
			return d.items;
		}
	} catch {}
	return null;
}

async function buildIndex() {
	const res = await fetch(LIST_URL, {
		headers: { 'User-Agent': UA, 'Accept-Language': 'id-ID,id;q=0.9,en;q=0.8' },
		signal: AbortSignal.timeout(60000),
	});
	if (!res.ok) throw new Error('gagal mengambil daftar');
	const html = await res.text();

	const items = [];
	const re = /href="(https:\/\/nekopoi\.care\/hentai\/([^"\/]+)\/)"[^>]*original-title='<div class=&quot;nk-tooltip-card&quot;>\s*<h2>(.*?)<\/h2>/gis;
	let m;
	while ((m = re.exec(html)) !== null) {
		const slug = m[2];
		if (items.some(x => x.slug === slug)) continue;
		items.push({
			slug,
			title: m[3].trim().slice(0, 90),
			url: m[1],
		});
	}
	if (!items.length) throw new Error('daftar kosong');

	fs.writeFileSync(
		INDEX_FILE,
		JSON.stringify({ updated: Date.now(), items }, null, 1) + '\n'
	);
	console.log(`\x1b[36mNekopoi: index dibangun (${items.length} judul)\x1b[39m`);
	return items;
}

/**
 * Cari judul di Nekopoi. Index di-cache 24 jam di nekopoi_index.json.
 * @param {string} keyword
 * @param {number} limit
 */
export async function searchNekopoi(keyword, limit = 8) {
	const words = keyword
		.toLowerCase()
		.split(/\s+/)
		.filter(w => w.length > 1);
	if (!words.length) return [];

	let items = readIndex();
	if (!items) items = await buildIndex();

	const scored = [];
	for (const it of items) {
		const hay = (it.title + ' ' + it.slug.replace(/-/g, ' ')).toLowerCase();
		let score = 0;
		for (const w of words) {
			if (hay.includes(w)) {
				score += w.length;
				// bonus kalau kata muncul di judul, bukan cuma slug
				if (it.title.toLowerCase().includes(w)) score += 2;
			}
		}
		if (score > 0) scored.push({ ...it, score });
	}
	scored.sort((a, b) => b.score - a.score);
	return scored.slice(0, limit);
}
