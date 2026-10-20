'use strict';

// Kolektor galeri lokal .cewe — bisa dijalankan standalone:
//   node src/helper/cewe-collect.js [jumlah]
// Mengisi ~/workspace/readsw/cewe_lib/ dengan gambar X-rated dari Civitai.

import fs from 'fs';
import path from 'path';

const API = 'https://civitai.com/api/v1/images';
const UA = 'readsw-bot/1.0';
const LIB = path.join(process.cwd(), 'cewe_lib');
const VIDLIB = path.join(process.cwd(), 'cewe_vid_lib');
const TARGET = 300;
const VIDTARGET = 25;
const SENT_FILE = path.join(process.cwd(), 'cewe_sent.json');

const QUERIES = [
	{ cat: 'sexy', q: 'sexy woman' },
	{ cat: 'nude', q: 'beautiful nude woman' },
	{ cat: 'sensual', q: 'sensual woman' },
	{ cat: 'hot', q: 'hot girl' },
	{ cat: 'lingerie', q: 'lingerie woman' },
	{ cat: 'bedroom', q: 'bedroom woman' },
	{ cat: 'curvy', q: 'curvy woman' },
	{ cat: 'blonde', q: 'blonde beauty' },
	{ cat: 'petite', q: 'petite woman' },
	{ cat: 'mature', q: 'mature woman' },
	{ cat: 'redhead', q: 'redhead beauty' },
	{ cat: 'brunette', q: 'brunette woman' },
	{ cat: 'bikini', q: 'bikini woman' },
	{ cat: 'beach', q: 'beach woman' },
	{ cat: 'realistis', q: 'photorealistic nude' },
	{ cat: 'shower', q: 'shower woman' },
	{ cat: 'asian', q: 'asian woman' },
	{ cat: 'latina', q: 'latina woman' },
	{ cat: 'ebony', q: 'ebony woman' },
	{ cat: 'cosplay', q: 'cosplay woman' },
	{ cat: 'goth', q: 'goth woman' },
	{ cat: 'milf', q: 'milf woman' },
	{ cat: 'anime', q: 'anime girl' },
	{ cat: 'fantasi', q: 'fantasy woman' },
	{ cat: 'cyberpunk', q: 'cyberpunk woman' },
	{ cat: 'render3d', q: '3d render woman' },
];

// Sumber tambahan khusus anime: Yandere (library anime 18+ besar)
const YANDERE_TAGS = ['rating:e', 'rating:e solo', 'rating:e 1girl'];
const YANDERE_PAGES = 3;

const VIDQUERIES = ['sexy woman dancing', 'sexy woman', 'lingerie woman', 'hot girl'];

export const CATEGORIES = QUERIES.map(x => x.cat);

if (!fs.existsSync(LIB)) fs.mkdirSync(LIB, { recursive: true });
if (!fs.existsSync(VIDLIB)) fs.mkdirSync(VIDLIB, { recursive: true });

function libKeys() {
	// key unik = "cat_id", dari format cewe_{cat}_{id}.jpg
	return new Set(
		fs.readdirSync(LIB)
			.map(f => {
				const m = f.match(/^cewe_(.+)_(\d+)\.jpg$/);
				return m ? `${m[1]}_${m[2]}` : null;
			})
			.filter(Boolean)
	);
}

async function fetchImagesPaged(query, sort, maxPages = 3, period = 'AllTime', types = null) {
	const all = [];
	let url =
		API +
		'?' +
		new URLSearchParams({
			query, nsfw: 'true', sort, period, limit: '100', ...(types ? { types } : {}),
		});
	for (let p = 0; p < maxPages && url; p++) {
		let data = null;
		for (let a = 0; a < 3; a++) {
			try {
				const res = await fetch(url, {
					headers: { 'User-Agent': UA },
					signal: AbortSignal.timeout(30000),
				});
				if (res.ok) {
					data = await res.json();
					break;
				}
				if (res.status === 429 || res.status >= 500) {
					await new Promise(r => setTimeout(r, 3000 * (a + 1)));
					continue;
				}
				break;
			} catch {
				await new Promise(r => setTimeout(r, 3000 * (a + 1)));
			}
		}
		if (!data) break;
		all.push(...(data.items || []));
		url = data.metadata && data.metadata.nextPage ? data.metadata.nextPage : null;
		await new Promise(r => setTimeout(r, 1500));
	}
	return all;
}

async function fetchYandere(tags, pages = 3) {
	const all = [];
	for (let p = 1; p <= pages; p++) {
		try {
			const url = `https://yande.re/post.json?limit=100&page=${p}&tags=${encodeURIComponent(tags)}`;
			const res = await fetch(url, {
				headers: { 'User-Agent': UA },
				signal: AbortSignal.timeout(30000),
			});
			if (!res.ok) break;
			const data = await res.json();
			if (!Array.isArray(data) || !data.length) break;
			all.push(...data);
			await new Promise(r => setTimeout(r, 1500));
		} catch {
			break;
		}
	}
	return all;
}

async function main() {
	const want = parseInt(process.argv[2] || '24', 10);
	const have = libKeys();
	console.log(`Galeri: ${have.size} gambar, target tambah ${want}`);

	let added = 0;
	const SORTS = ['Most Reactions', 'Newest', 'Most Comments'];
	let si = Math.floor(Math.random() * SORTS.length);
	// Bagi rata per kategori biar kategori di akhir (anime, fantasi, dll) kebagian
	const perCat = Math.max(1, Math.ceil(want / QUERIES.length));

	// --- Sumber anime: Yandere duluan, kuota max 1/3 dari target ---
	const yanQuota = Math.max(1, Math.floor(want / 3));
	for (const tags of YANDERE_TAGS) {
		if (added >= yanQuota) break;
		const posts = await fetchYandere(tags, YANDERE_PAGES);
		const fresh = posts.filter(
			p => p.file_url && p.id && !have.has(`anime_${p.id}`)
		);
		console.log(`yandere "${tags}": ${fresh.length} baru`);
		for (const p of fresh) {
			if (added >= yanQuota) break;
			try {
				const res = await fetch(p.file_url, {
					headers: { 'User-Agent': UA },
					signal: AbortSignal.timeout(60000),
				});
				if (!res.ok) continue;
				const buf = Buffer.from(await res.arrayBuffer());
				if (buf.length < 20000) continue;
				const fp = path.join(LIB, `cewe_anime_${p.id}.jpg`);
				fs.writeFileSync(fp, buf);
				have.add(`anime_${p.id}`);
				added++;
			} catch {}
		}
		await new Promise(r => setTimeout(r, 2000));
	}
	for (const { cat, q } of QUERIES) {
		if (added >= want) break;
		const sort = SORTS[si % SORTS.length];
		si++;
		const items = await fetchImagesPaged(q, sort, 3);
		const fresh = items.filter(
			x => x.type === 'image' && x.url && x.nsfwLevel === 'X' && !have.has(`${cat}_${x.id}`)
		);
		console.log(`"${q}": ${fresh.length} baru`);
		let catAdded = 0;
		for (const it of fresh) {
			if (added >= want || catAdded >= perCat) break;
			try {
				const url = it.url.replace('/original=true/', '/width=1600/');
				const res = await fetch(url, {
					headers: { 'User-Agent': UA },
					signal: AbortSignal.timeout(60000),
				});
				if (!res.ok) continue;
				const buf = Buffer.from(await res.arrayBuffer());
				if (buf.length < 20000) continue;
				const fp = path.join(LIB, `cewe_${cat}_${it.id}.jpg`);
				fs.writeFileSync(fp, buf);
				have.add(`${cat}_${it.id}`);
				added++;
				catAdded++;
			} catch {}
		}
		// jeda sopan antar query
		await new Promise(r => setTimeout(r, 2000));
	}

	// rapikan: kalau lebih dari TARGET, hapus yang terlama
	const files = fs.readdirSync(LIB)
		.map(f => ({ f, t: fs.statSync(path.join(LIB, f)).mtimeMs }))
		.sort((a, b) => a.t - b.t);
	while (files.length > TARGET) {
		const old = files.shift();
		try { fs.unlinkSync(path.join(LIB, old.f)); } catch {}
	}
	console.log(`Gambar: +${added}, total ${fs.readdirSync(LIB).length}`);

	// --- Koleksi video ---
	const vidWant = Math.max(0, Math.min(parseInt(process.argv[3] || '8', 10), 20));
	const vidHave = new Set(
		fs.readdirSync(VIDLIB)
			.map(f => {
				const m = f.match(/^cewevid_(.+)_(\d+)\.mp4$/);
				return m ? `${m[1]}_${m[2]}` : null;
			})
			.filter(Boolean)
	);
	console.log(`Video: ${vidHave.size} tersimpan, target tambah ${vidWant}`);
	let vidAdded = 0;
	for (const q of VIDQUERIES) {
		if (vidAdded >= vidWant) break;
		const items = await fetchImagesPaged(q, 'Most Reactions', 2, 'Day', 'Video');
		const fresh = items.filter(
			x => x.type === 'video' && x.url && x.nsfwLevel === 'X' && !vidHave.has(`vid_${x.id}`)
		);
		console.log(`"${q}": ${fresh.length} video baru`);
		for (const it of fresh) {
			if (vidAdded >= vidWant) break;
			try {
				const res = await fetch(it.url, {
					headers: { 'User-Agent': UA },
					signal: AbortSignal.timeout(120000),
				});
				if (!res.ok) continue;
				const buf = Buffer.from(await res.arrayBuffer());
				if (buf.length < 500000 || buf.length > 60000000) continue; // 0.5MB - 60MB
				const fp = path.join(VIDLIB, `cewevid_vid_${it.id}.mp4`);
				fs.writeFileSync(fp, buf);
				vidHave.add(`vid_${it.id}`);
				vidAdded++;
			} catch {}
		}
		await new Promise(r => setTimeout(r, 2000));
	}
	const vfiles = fs.readdirSync(VIDLIB)
		.map(f => ({ f, t: fs.statSync(path.join(VIDLIB, f)).mtimeMs }))
		.sort((a, b) => a.t - b.t);
	while (vfiles.length > VIDTARGET) {
		const old = vfiles.shift();
		try { fs.unlinkSync(path.join(VIDLIB, old.f)); } catch {}
	}
	console.log(`Selesai: +${vidAdded} video, total ${fs.readdirSync(VIDLIB).length}`);
}

main();
