'use strict';
// Helper: scrape Web Komik Dewasa (webkomikdewasa.top) — jaringan yang sama dengan
// komikdewasa.art tapi TANPA proteksi Cloudflare, jadi bisa diakses langsung.
// - Search:   https://webkomikdewasa.top/?s={keyword} -> /series/{slug}/
// - Series:   /series/{slug}/ -> daftar chapter {slug}-chapter-{N}/
// - Chapter:  <div id="readerarea"> -> <img> (hanya CDN warungkomikcdn.icu)

const BASE = 'https://webkomikdewasa.top';
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36';

async function kdGet(url) {
	const res = await fetch(url, {
		headers: { 'User-Agent': UA, 'Referer': BASE + '/', 'Accept-Language': 'id-ID,id;q=0.9' },
		signal: AbortSignal.timeout(25000),
	});
	if (!res.ok) throw new Error('HTTP ' + res.status);
	return res.text();
}

function clean(s) {
	return (s || '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
}

/** Cari komik: [{ title, url, latest }] */
export async function searchKomikdewasa(keyword) {
	const html = await kdGet(`${BASE}/?s=${encodeURIComponent(keyword)}`);
	const blocks = html.match(/class="listupd"[\s\S]*?(?=class="listupd"|$)/g) || [];
	const out = [];
	for (const seg of blocks) {
		const items = seg.matchAll(/<a href="(https:\/\/webkomikdewasa\.top\/series\/[^"]+\/)"[^>]*>([\s\S]*?)<\/a>/g);
		for (const m of items) {
			const inner = m[2];
			const t = inner.match(/<div class="tt">\s*([\s\S]*?)\s*<\/div>/);
			const e = inner.match(/<div class="epxs">\s*([\s\S]*?)\s*<\/div>/);
			const title = clean(t?.[1]);
			if (!title) continue;
			if (out.some(x => x.url === m[1])) continue;
			out.push({ title, url: m[1], latest: clean(e?.[1]) });
			if (out.length >= 15) break;
		}
	}
	return out;
}

/** Daftar chapter dari halaman series: [{ label, url }] (terbaru dulu) */
export async function getKomikChapters(seriesUrl) {
	const html = await kdGet(seriesUrl);
	const titleM = html.match(/<title>([^<]+)/);
	const title = clean(titleM?.[1]).replace(/\s*-\s*Web Komik Dewasa.*$/, '');
	const links = html.matchAll(/href="(https:\/\/webkomikdewasa\.top\/[^"]*?chapter[^"]*\/?)"/g);
	const out = [];
	for (const m of links) {
		const url = m[1];
		if (out.some(x => x.url === url)) continue;
		// label dari slug: "{slug}-chapter-27" -> "Chapter 27"
		const slug = url.replace(BASE + '/', '').replace(/\/$/, '');
		const cm = slug.match(/-chapter-(.+)$/);
		let label = cm ? 'Chapter ' + cm[1].replace(/-/g, ' ').toUpperCase() : slug;
		out.push({ label, url });
	}
	return { title, chapters: out };
}

/** URL gambar isi chapter (hanya dari CDN, iklan dibuang) */
export async function getChapterImages(chapterUrl) {
	const html = await kdGet(chapterUrl);
	const area = html.match(/id="readerarea"([\s\S]*?)<\/div>\s*<\/div>/)?.[1] || html;
	const imgs = area.matchAll(/<img[^>]+src="([^"]+)"/g);
	const out = [];
	for (const m of imgs) {
		const u = m[1];
		if (!u.includes('warungkomikcdn.icu')) continue; // buang iklan/banner
		if (out.includes(u)) continue;
		out.push(u);
	}
	return out;
}

/** Download satu gambar chapter -> Buffer */
export async function downloadKomikImage(url) {
	const res = await fetch(url, {
		headers: { 'User-Agent': UA, 'Referer': BASE + '/' },
		signal: AbortSignal.timeout(30000),
	});
	if (!res.ok) throw new Error('HTTP ' + res.status);
	return Buffer.from(await res.arrayBuffer());
}
