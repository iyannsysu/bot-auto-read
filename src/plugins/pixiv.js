'use strict';
// Command: pixiv (aliases: px)
// Kategori: downloader

import fs from 'fs';
import os from 'os';
import path from 'path';
import * as shared from './_shared.js';

const { sendAlbum } = shared;

// Danbooru adalah mirror publik yang mengindeks artwork Pixiv (field pixiv_id)
// dan menyajikannya lewat CDN sendiri (cdn.donmai.us) — tidak diblokir seperti
// pixiv.net / i.pximg.net dari IP Cloud/VPS. Jadi search Pixiv lewat Danbooru:
// cari post dengan pixiv_id (sumber Pixiv), unduh dari file_url Danbooru.
const DANBOORU_API = 'https://danbooru.donmai.us/posts.json';
const DANBOORU_UA = 'readsw-bot/1.0 (Pixiv search via Danbooru mirror)';

function danbooruTag(keyword) {
	return String(keyword || '')
		.trim()
		.toLowerCase()
		.replace(/[^a-z0-9_\s-]/g, '')
		.replace(/[\s-]+/g, '_')
		.replace(/_+/g, '_')
		.replace(/^_|_$/g, '');
}

async function fetchDanbooruPosts(tagQuery, limit = 10) {
	const url = `${DANBOORU_API}?tags=${encodeURIComponent(tagQuery)}&limit=${Math.max(1, Math.min(50, limit))}`;
	const res = await fetch(url, {
		headers: {
			'User-Agent': DANBOORU_UA,
			'Accept': 'application/json',
		},
	});
	if (!res.ok) throw new Error(`Danbooru merespons ${res.status}.`);
	const data = await res.json();
	return Array.isArray(data) ? data : [];
}

/**
 * Unduh file Danbooru ke tmpDir, kembalikan path file atau null kalau gagal.
 * Pakai large_file_url dulu (versi resize max 850px, jauh lebih kecil dari original
 * yang bisa 14MB+) supaya kirim WA cepat & hemat kuota; fallback ke file_url.
 */
async function downloadDanbooruFile(post, tmpDir, index) {
	const fileUrl = post.large_file_url || post.file_url;
	if (!fileUrl) return null;
	const ext = (String(post.file_ext || '').replace(/[^a-z0-9]/gi, '') || 'jpg').toLowerCase();
	const filePath = path.join(tmpDir, `pixiv_${index}.${ext}`);
	const res = await fetch(fileUrl, { headers: { 'User-Agent': DANBOORU_UA } });
	if (!res.ok) return null;
	const buffer = Buffer.from(await res.arrayBuffer());
	if (!buffer.length) return null;
	fs.writeFileSync(filePath, buffer);
	return filePath;
}

/**
 * Cari artwork Pixiv via Danbooru (hanya post dengan pixiv_id = sumber Pixiv).
 * Kalau tag persis kosong, coba wildcard tag* ; kalau tetap kosong, pakai post apa pun
 * (tetap artwork, walau bukan dari Pixiv) supaya tidak selalu gagal untuk keyword umum.
 */
async function searchPixivViaDanbooru(keyword, limit = 5) {
	const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pixiv-'));
	const files = [];
	try {
		const tag = danbooruTag(keyword);
		if (!tag) throw new Error('Kata kunci tidak valid untuk pencarian.');

		// Ambil 3x lipat supaya setelah filter pixiv_id masih cukup.
		let posts = await fetchDanbooruPosts(tag, limit * 3);
		let pixivPosts = posts.filter(p => p?.pixiv_id && (p.file_url || p.large_file_url));

		if (!pixivPosts.length) {
			// Coba wildcard: mis. "miku" -> "miku*" (cocok hatsune_miku, dll).
			posts = await fetchDanbooruPosts(`${tag}*`, limit * 3);
			pixivPosts = posts.filter(p => p?.pixiv_id && (p.file_url || p.large_file_url));
		}

		// Fallback terakhir: pakai post apa pun (bukan Pixiv) daripada gagal total.
		const chosen = pixivPosts.length ? pixivPosts : posts.filter(p => p.file_url || p.large_file_url);
		if (!chosen.length) {
			throw new Error(`Tidak ditemukan hasil untuk kata kunci "${keyword}". Coba kata kunci lain (mis. nama karakter / tag, contoh: hatsune_miku).`);
		}

		let index = 0;
		for (const post of chosen) {
			if (files.length >= limit) break;
			const fp = await downloadDanbooruFile(post, tmpDir, ++index).catch(() => null);
			if (fp) files.push(fp);
		}

		if (!files.length) throw new Error('Gagal mengunduh gambar dari hasil pencarian.');
		return { tmpDir, files };
	} catch (e) {
		try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch {}
		throw new Error(e?.message || 'Pencarian Pixiv gagal.');
	}
}

/** Unduh artwork Pixiv per ID via Danbooru (tags=pixiv_id:<id>). */
async function downloadPixivArtworkViaDanbooru(artworkId) {
	const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pixiv-'));
	const files = [];
	try {
		const posts = await fetchDanbooruPosts(`pixiv_id:${artworkId}`, 10);
		const usable = posts.filter(p => p.file_url || p.large_file_url);
		if (!usable.length) throw new Error(`Artwork Pixiv ${artworkId} tidak ditemukan di mirror Danbooru.`);
		let index = 0;
		for (const post of usable) {
			const fp = await downloadDanbooruFile(post, tmpDir, ++index).catch(() => null);
			if (fp) files.push(fp);
		}
		if (!files.length) throw new Error('Gagal mengunduh artwork dari mirror Danbooru.');
		return { tmpDir, files };
	} catch (e) {
		try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch {}
		throw new Error(e?.message || 'Unduh artwork Pixiv gagal.');
	}
}

export default {
	name: 'pixiv',
	aliases: ['px'],
	category: 'downloader',
	desc: 'Mencari artwork Pixiv (via mirror Danbooru, bebas blokir IP). Contoh: .pixiv hatsune_miku 5 | .pixiv 23326989',
	async run(ctx) {
		const { hisoka, m, query } = ctx;
		const raw = (query || '').trim();

		if (!raw) {
			await m.reply('⚠️ Masukkan kata kunci pencarian Pixiv.\nContoh: `.pixiv hatsune_miku 5` atau `.pixiv 23326989`');
			return;
		}

		let tmpDir = '';
		try {
			// Link / ID artwork langsung -> unduh via Danbooru (pixiv_id).
			const artMatch = raw.match(/pixiv\.net\/(?:en\/)?artworks\/(\d+)/i) || raw.match(/^(\d{6,})$/);
			if (artMatch) {
				await m.reply('🎨 Mengunduh artwork...');
				const res = await downloadPixivArtworkViaDanbooru(artMatch[1]);
				tmpDir = res.tmpDir;
				await sendAlbum(hisoka, m.from, res.files);
				return;
			}

			let count = 5;
			let keyword = raw;
			const numMatch = raw.match(/\s+(\d{1,2})$/);

			if (numMatch) {
				count = Math.max(1, Math.min(10, parseInt(numMatch[1], 10)));
				keyword = raw.slice(0, numMatch.index).trim();
			}

			if (!keyword) {
				await m.reply('⚠️ Masukkan kata kunci yang valid. Contoh: `.pixiv hatsune_miku`');
				return;
			}

			await m.reply(`🔎 *Mencari "${keyword}" di Pixiv (Maks. ${count} gambar)...*`);

			const res = await searchPixivViaDanbooru(keyword, count);
			tmpDir = res.tmpDir;

			await m.reply(`🎨 *Ketemu ${res.files.length} gambar, mengirim ke chat...*`);
			await sendAlbum(hisoka, m.from, res.files);

		} catch (err) {
			console.error('[pixiv error]:', err);
			await m.reply('❌ ' + (err?.message || 'Gagal mengambil data dari Pixiv.'));
		} finally {
			if (tmpDir) {
				try {
					fs.rmSync(tmpDir, { recursive: true, force: true });
				} catch {}
			}
		}
	},
};
