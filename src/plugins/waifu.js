'use strict';
// Command: waifu — kirim gambar anime random (SFW).
//   .waifu            -> gambar acak
//   .waifu neko       -> kategori tertentu
//   .waifu list       -> daftar kategori
// Sumber: nekos.best (gratis, tanpa API key).
// Kategori: FUN

import * as shared from './_shared.js';

const CATEGORIES = ['waifu', 'neko', 'husbando', 'kitsune'];

async function fetchWaifuImage(category) {
	const res = await fetch(`https://nekos.best/api/v2/${category}?amount=1`, {
		signal: AbortSignal.timeout(20000),
	});
	if (!res.ok) throw new Error('HTTP ' + res.status);
	const data = await res.json();
	const url = data?.results?.[0]?.url;
	if (!url) throw new Error('API tidak mengembalikan gambar');
	const img = await fetch(url, { signal: AbortSignal.timeout(30000) });
	if (!img.ok) throw new Error('Gagal mengunduh gambar');
	return Buffer.from(await img.arrayBuffer());
}

export default {
	name: 'waifu',
	aliases: ['animegirl', 'wfu'],
	category: 'FUN',
	desc: 'Kirim gambar anime random. .waifu | .waifu neko | .waifu list',
	async run(ctx) {
		const { hisoka, m, query } = ctx;
		const raw = (query || '').trim().toLowerCase();

		if (raw === 'list') {
			await m.reply(
				'🎴 *Kategori:*\n' + CATEGORIES.join(', ') +
				'\n\nContoh: `.waifu neko`'
			);
			return;
		}

		let category = raw;
		if (!category) {
			category = CATEGORIES[Math.floor(Math.random() * CATEGORIES.length)];
		} else if (!CATEGORIES.includes(category)) {
			await m.reply(`❌ Kategori *${raw}* tidak ada.\nLihat daftar: \`.waifu list\``);
			return;
		}

		await m.reply(`🎴 Mengambil *${category}*...`);
		try {
			const buf = await fetchWaifuImage(category);
			await hisoka.sendMessage(m.from, {
				image: buf,
				caption: `🎴 *${category}*`,
			}, { quoted: m });
		} catch (err) {
			await m.reply('❌ Gagal mengambil gambar: ' + (err?.message || 'error'));
		}
	},
};
