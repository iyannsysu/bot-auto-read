'use strict';

// MangaDex — manhwa 18+ Korea dengan terjemahan Indonesia.
// API publik gratis, tanpa Cloudflare.
// .manhwa <keyword> -> cari
// .manhwa <nomor>   -> daftar chapter (dari cache pencarian)
// .manhwa baca <nomor> <chapter> -> kirim halaman chapter

const API = 'https://api.mangadex.org';
const UA = 'readsw-bot/1.0';

async function api(path) {
	const res = await fetch(API + path, {
		headers: { 'User-Agent': UA },
		signal: AbortSignal.timeout(30000),
	});
	if (!res.ok) throw new Error(`MangaDex HTTP ${res.status}`);
	return res.json();
}

function pickTitle(t) {
	return t.en || t.id || Object.values(t)[0] || '?';
}

/** Cari manhwa 18+ Korea yang ada terjemahan Indonesianya.
 *  Keyword kosong -> daftar terpopuler (order followedCount). */
export async function searchManhwa(keyword, limit = 8) {
	return searchManga(keyword, limit, ['ko'], null);
}

/** Cari manhua 18+ China yang ada terjemahan Indonesianya. */
export async function searchManhua(keyword, limit = 8) {
	return searchManga(keyword, limit, ['zh'], null);
}

/** Search generik MangaDex 18+ dengan filter bahasa & tag opsional. */
async function searchManga(keyword, limit = 8, languages = ['ko'], includeTag = null) {
	let out = [];
	for (const rating of ['pornographic', 'erotica']) {
		try {
			const p = new URLSearchParams({
				limit: String(limit),
				'contentRating[]': rating,
				'availableTranslatedLanguage[]': 'id',
				'includes[]': 'cover_art',
				'order[followedCount]': 'desc',
			});
			for (const lang of languages) p.append('originalLanguage[]', lang);
			if (includeTag) p.append('includedTags[]', includeTag);
			if (keyword) p.set('title', keyword);
			const d = await api('/manga?' + p);
			for (const m of d.data || []) {
				if (out.some(x => x.id === m.id)) continue;
				out.push({ id: m.id, title: pickTitle(m.attributes.title) });
				if (out.length >= limit) break;
			}
		} catch {}
		if (out.length >= limit) break;
	}
	return out;
}

/** Daftar chapter bahasa Indonesia, urut menaik. */
export async function getIdChapters(mangaId) {
	const all = [];
	let offset = 0;
	for (let i = 0; i < 5; i++) {
		const p = new URLSearchParams({
			'translatedLanguage[]': 'id',
			limit: '100',
			offset: String(offset),
			'order[chapter]': 'asc',
		});
		const d = await api(`/manga/${mangaId}/feed?` + p);
		const items = (d.data || []).filter(c => c.attributes.pages > 0);
		all.push(...items.map(c => ({
			id: c.id,
			chapter: c.attributes.chapter || '?',
			title: c.attributes.title || '',
			pages: c.attributes.pages,
		})));
		if ((d.data || []).length < 100) break;
		offset += 100;
	}
	return all;
}

/** URL halaman-halaman sebuah chapter. */
export async function getChapterPages(chapterId) {
	const d = await api(`/at-home/server/${chapterId}`);
	if (!d.chapter || !d.chapter.data) throw new Error('chapter tidak tersedia');
	const base = d.baseUrl;
	const hash = d.chapter.hash;
	return d.chapter.data.map(f => `${base}/data/${hash}/${f}`);
}

/** Daftar kurasi manhwa 18+ KO sub Indo (hasil scan, verified ada chapter ID). */
export async function loadManhwaList() {
	try {
		const fs = await import('fs');
		const path = await import('path');
		const fp = path.join(process.cwd(), 'manhwa_id_list.json');
		const d = JSON.parse(fs.readFileSync(fp, 'utf-8'));
		return Array.isArray(d.items) ? d.items : [];
	} catch {
		return [];
	}
}

/** Unduh satu halaman jadi buffer. */
export async function downloadPage(url) {
	const res = await fetch(url, {
		headers: { 'User-Agent': UA, Referer: 'https://mangadex.org/' },
		signal: AbortSignal.timeout(60000),
	});
	if (!res.ok) throw new Error(`HTTP ${res.status}`);
	const buf = Buffer.from(await res.arrayBuffer());
	if (buf.length < 5000) throw new Error('gambar rusak');
	return buf;
}
