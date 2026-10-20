'use strict';
// Command: meme — kirim meme random dari Reddit.
//   .meme              -> meme acak
//   .meme dankmemes    -> dari subreddit tertentu
// Sumber: meme-api.com (gratis, tanpa API key). NSFW otomatis dilewati.
// Kategori: FUN

import * as shared from './_shared.js';

async function fetchMeme(subreddit) {
	const apiUrl = subreddit
		? `https://meme-api.com/gimme/${encodeURIComponent(subreddit)}/5`
		: 'https://meme-api.com/gimme/5';
	const res = await fetch(apiUrl, { signal: AbortSignal.timeout(20000) });
	if (!res.ok) throw new Error('HTTP ' + res.status);
	const data = await res.json();
	const memes = (data.memes || [data]).filter((m) => m && m.url && !m.nsfw && !m.spoiler);
	if (!memes.length) throw new Error('Tidak ada meme SFW ditemukan');
	return memes[Math.floor(Math.random() * memes.length)];
}

export default {
	name: 'meme',
	aliases: ['memes', 'dankmeme'],
	category: 'FUN',
	desc: 'Kirim meme random dari Reddit. .meme | .meme dankmemes',
	async run(ctx) {
		const { hisoka, m, query } = ctx;
		const sub = (query || '').trim().toLowerCase().replace(/^r\//, '');

		await m.reply(`🤣 Mengambil meme${sub ? ` dari r/${sub}` : ''}...`);
		try {
			const meme = await fetchMeme(sub || null);
			const imgRes = await fetch(meme.url, { signal: AbortSignal.timeout(30000) });
			if (!imgRes.ok) throw new Error('Gagal mengunduh gambar');
			const buf = Buffer.from(await imgRes.arrayBuffer());
			const caption =
				`🤣 *${meme.title}*\n` +
				`📍 r/${meme.subreddit} • ⬆️ ${meme.ups ?? '?'} • u/${meme.author ?? '?'}`;
			const isGif = /\.gif(\?|$)/i.test(meme.url);
			if (isGif) {
				await hisoka.sendMessage(m.from,
					{ video: buf, gifPlayback: true, caption },
					{ quoted: m });
			} else {
				await hisoka.sendMessage(m.from,
					{ image: buf, caption },
					{ quoted: m });
			}
		} catch (err) {
			await m.reply('❌ Gagal mengambil meme: ' + (err?.message || 'error'));
		}
	},
};
