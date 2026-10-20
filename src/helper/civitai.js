'use strict';

import fs from 'fs';
import os from 'os';
import path from 'path';

const API = 'https://civitai.com/api/v1/images';
const UA = 'readsw-bot/1.0';

/**
 * Cari gambar AI di Civitai (termasuk NSFW).
 * @param {string} query kata kunci
 * @param {number} count jumlah maksimal
 * @returns {Promise<{id:number, url:string, prompt:string}[]>}
 */
export async function searchCivitai(query, count = 5) {
	const params = new URLSearchParams({
		query: query || 'sexy beautiful woman',
		nsfw: 'true',
		sort: 'Most Reactions',
		period: 'AllTime',
		limit: String(Math.min(Math.max(count * 3, 10), 60)),
	});
	let res;
	let lastStatus = 0;
	for (let attempt = 0; attempt < 3; attempt++) {
		try {
			res = await fetch(`${API}?${params}`, {
				headers: { 'User-Agent': UA },
				signal: AbortSignal.timeout(30000),
			});
			lastStatus = res.status;
			if (res.ok) break;
			// 429/5xx -> tunggu lalu coba lagi
			if (res.status === 429 || res.status >= 500) {
				await new Promise(r => setTimeout(r, 2000 * (attempt + 1)));
				continue;
			}
			break;
		} catch (err) {
			if (attempt === 2) throw new Error('Civitai tidak merespons (' + (err?.message || 'timeout') + ')');
			await new Promise(r => setTimeout(r, 2000 * (attempt + 1)));
		}
	}
	if (!res || !res.ok) throw new Error(`Civitai API gagal (HTTP ${lastStatus || '??'})`);
	const data = await res.json();
	let pool = (data.items || []).filter(x => x.type === 'image' && x.url);
	// Mode bypass: hanya level X (paling eksplisit) yang lolos
	const explicit = pool.filter(x => x.nsfwLevel === 'X');
	if (explicit.length) pool = explicit;
	const items = pool
		.map(x => ({
			id: x.id,
			// resize ke width 1600 biar tajam tapi tetap ringan
			url: x.url.replace('/original=true/', '/width=1600/'),
			prompt: (x.meta && x.meta.prompt ? String(x.meta.prompt) : '').slice(0, 100),
		}));
	if (!items.length) throw new Error('tidak ada hasil');
	// acak biar tidak selalu gambar yang sama
	for (let i = items.length - 1; i > 0; i--) {
		const j = Math.floor(Math.random() * (i + 1));
		[items[i], items[j]] = [items[j], items[i]];
	}
	return items.slice(0, count);
}

/**
 * Cari gambar karakter 18+ secara AKURAT via Models API:
 * 1. Cari LoRA karakter -> 2. Ambil gambar dari modelVersionId-nya.
 * Dijamin sesuai karakter (tidak seperti query langsung yang ngaco).
 * @param {string} name nama karakter
 * @param {number} count jumlah maksimal
 * @returns {Promise<{id:number, url:string}[]>}
 */
export async function searchCharacter(name, count = 5) {
	const words = name.toLowerCase().split(/\s+/).filter(w => w.length > 1);
	if (!words.length) throw new Error('nama karakter kosong');

	async function getJSON(url) {
		for (let a = 0; a < 3; a++) {
			try {
				const res = await fetch(url, {
					headers: { 'User-Agent': UA },
					signal: AbortSignal.timeout(30000),
				});
				if (res.ok) return await res.json();
				if (res.status === 429 || res.status >= 500) {
					await new Promise(r => setTimeout(r, 2500 * (a + 1)));
					continue;
				}
				throw new Error(`HTTP ${res.status}`);
			} catch (err) {
				if (a === 2) throw err;
				await new Promise(r => setTimeout(r, 2500 * (a + 1)));
			}
		}
		throw new Error('gagal mengambil data');
	}

	// 1. Cari model karakter (nama harus mengandung semua kata kunci)
	const mParams = new URLSearchParams({ query: name, limit: '10' });
	const mData = await getJSON(`${API.replace('/images', '/models')}?${mParams}`);
	const models = (mData.items || []).filter(m => {
		const n = (m.name || '').toLowerCase();
		return words.every(w => n.includes(w));
	});
	if (!models.length) throw new Error(`karakter "${name}" tidak ditemukan`);

	// 2. Kumpulkan version IDs dari 3 model teratas
	const vids = [];
	for (const m of models.slice(0, 3)) {
		for (const v of m.modelVersions || []) {
			if (v.id && !vids.includes(v.id)) vids.push(v.id);
			if (vids.length >= 6) break;
		}
		if (vids.length >= 6) break;
	}

	// 3. Ambil gambar X-rated dari tiap version
	const found = [];
	const seen = new Set();
	for (const vid of vids) {
		if (found.length >= count * 3) break;
		try {
			const iParams = new URLSearchParams({
				modelVersionId: String(vid), nsfw: 'true', limit: '40',
			});
			const iData = await getJSON(`${API}?${iParams}`);
			for (const x of iData.items || []) {
				if (x.type !== 'image' || !x.url || x.nsfwLevel !== 'X') continue;
				if (seen.has(x.id)) continue;
				seen.add(x.id);
				found.push({
					id: x.id,
					url: x.url.replace('/original=true/', '/width=1600/'),
				});
			}
		} catch {}
		await new Promise(r => setTimeout(r, 800));
	}
	if (!found.length) throw new Error('tidak ada gambar 18+ untuk karakter ini');
	return found.slice(0, count);
}

/**
 * Cari VIDEO AI di Civitai (khusus X-rated).
 * @param {string} query kata kunci
 * @param {number} count jumlah maksimal
 * @returns {Promise<{id:number, url:string}[]>}
 */
export async function searchCivitaiVideos(query, count = 3) {
	const params = new URLSearchParams({
		query: query || 'sexy woman',
		nsfw: 'true',
		sort: 'Most Reactions',
		period: 'AllTime',
		limit: String(Math.min(Math.max(count * 5, 15), 80)),
	});
	let res;
	let lastStatus = 0;
	for (let attempt = 0; attempt < 3; attempt++) {
		try {
			res = await fetch(`${API}?${params}`, {
				headers: { 'User-Agent': UA },
				signal: AbortSignal.timeout(30000),
			});
			lastStatus = res.status;
			if (res.ok) break;
			if (res.status === 429 || res.status >= 500) {
				await new Promise(r => setTimeout(r, 2000 * (attempt + 1)));
				continue;
			}
			break;
		} catch (err) {
			if (attempt === 2) throw new Error('Civitai tidak merespons (' + (err?.message || 'timeout') + ')');
			await new Promise(r => setTimeout(r, 2000 * (attempt + 1)));
		}
	}
	if (!res || !res.ok) throw new Error(`Civitai API gagal (HTTP ${lastStatus || '??'})`);
	const data = await res.json();
	const items = (data.items || [])
		.filter(x => x.type === 'video' && x.url && x.nsfwLevel === 'X')
		.map(x => ({ id: x.id, url: x.url }));
	if (!items.length) throw new Error('tidak ada video');
	return items.slice(0, count);
}

/**
 * Unduh beberapa gambar ke direktori temporer.
 * @returns {Promise<{files:string[], tmpDir:string}>}
 */
export async function downloadCivitai(items) {
	const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cewe-'));
	const files = [];
	await Promise.allSettled(
		items.map(async (it, i) => {
			const res = await fetch(it.url, {
				headers: { 'User-Agent': UA },
				signal: AbortSignal.timeout(60000),
			});
			if (!res.ok) throw new Error('unduh gagal');
			const buf = Buffer.from(await res.arrayBuffer());
			if (buf.length < 10000) throw new Error('file terlalu kecil');
			const fp = path.join(tmpDir, `cewe_${i}_${it.id}.jpg`);
			fs.writeFileSync(fp, buf);
			files.push(fp);
		})
	);
	if (!files.length) {
		fs.rmSync(tmpDir, { recursive: true, force: true });
		throw new Error('semua unduhan gagal');
	}
	return { files, tmpDir };
}

export function cleanupCivitai(tmpDir) {
	try {
		fs.rmSync(tmpDir, { recursive: true, force: true });
	} catch {}
}
