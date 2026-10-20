'use strict';
// Command: tiktokhd (aliases: tthd, tikhd)
// Kategori: downloader
//
// Download TikTok kualitas HD 1080p via tikdownloader.io (permintaan owner
// 2026-10-20: hasil unduhan dari situs itu "HD banget" — terverifikasi
// 1080x1920, dibanding .tt/tikwm yang mentok ~576px).

import { getTikTokHD, downloadBuffer } from '../helper/tikdownloader.js';

export default {
	name: 'tiktokhd',
	aliases: ['tthd', 'tikhd'],
	category: 'downloader',
	desc: 'Download TikTok HD 1080p via tikdownloader.io. Contoh: .tiktokhd <link>',
	async run(ctx) {
		const { hisoka, m, query } = ctx;
		const raw = (query || '').trim();

		if (!raw || !/tiktok\.com/i.test(raw)) {
			await m.reply('⚠️ Kirim link TikTok-nya ya.\nContoh: `.tiktokhd https://www.tiktok.com/@user/video/123`');
			return;
		}

		const { startLoading } = await import('../helper/loading.js');
		const load = await startLoading(hisoka, m, 'Mengunduh TikTok HD');
		try {
			const info = await getTikTokHD(raw);
			const videoUrl = info.hdUrl || info.mp4Url;
			const isHD = !!info.hdUrl;
			const buf = await downloadBuffer(videoUrl, 100);
			const sizeMB = (buf.length / 1024 / 1024).toFixed(1);
			const caption =
				`🎬 *TikTok ${isHD ? 'HD 1080p' : 'MP4'}*${info.title ? `\n${info.title}` : ''}\n📦 ${sizeMB} MB • via tikdownloader.io`;
			// Video di atas ~64MB rawan gagal sebagai video -> kirim sebagai dokumen.
			if (buf.length > 64 * 1024 * 1024) {
				await hisoka.sendMessage(m.from, { document: buf, mimetype: 'video/mp4', fileName: 'tiktok-hd.mp4', caption }, { quoted: m });
			} else {
				await hisoka.sendMessage(m.from, { video: buf, caption }, { quoted: m });
			}
			await load.done('✅ Selesai!');
		} catch (err) {
			await load.fail('❌ ' + (err?.message || 'Gagal mengunduh.'));
		}
	},
};
