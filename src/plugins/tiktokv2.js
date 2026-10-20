'use strict';
// Auto-generated dari message.js — command: tiktokv2 (aliases: tt2)
// Kategori: other

import * as shared from './_shared.js';

	const {
		isJidGroup, jidNormalizedUser, jidDecode, generateWAMessageFromContent,
		exec, execFile, fileURLToPath, util, fs, path, os,
		glitch, msToTime,
		downloadTikTok, cleanupTikTok,
		downloadYouTubeAudio, cleanupYouTubeAudio,
		searchPinterest, downloadPinterestPin, cleanupPinterest,
		searchPixiv, downloadPixivArtwork, cleanupPixiv,
		searchHentaidad, downloadHentaidadGallery, cleanupHentaidad,
		searchHanime, getHanimeStreams, pickHanimeStream, downloadHanimeStream, shortNum,
		getStickerPack, downloadStickerPack, cleanupStickerPack,
		getTelegramPack, downloadTelegramPack, cleanupTelegramPack,
		readSwConfig, writeSwConfig, extractEmojis,
		loadStoryCfg, saveStoryCfg, downloadTikTokHD, postToStatus,
		handleBusyReply, loadBusyCfg, saveBusyCfg,
		telegram, execFileAsync,
		PROJECT_ROOT, MENU_BANNER, GC_JSON,
		hanimeSearchCache, bokepSearchCache, cosplay18SearchCache,
		manhwaSearchCache, manhwaChapterCache,
		readGcLink, handleTikTokDownload, sendAlbum, handleSticker,
	} = shared;

export default {
	name: 'tiktokv2',
	aliases: ['tt2'],
	category: 'other',
	desc: '',
	async run(ctx) {
	const { hisoka, m, query, text, quoted, message, messagesType } = ctx;
					{
						const url = (query || m.text || '').trim();
						if (!/tiktok\.com/i.test(url)) {
							await m.reply('Kirim link TikTok. Contoh: `.tiktokv2 https://vt.tiktok.com/xxx/`');
							return;
						}
						await m.reply('⬇️ Mengunduh TikTok (v2)...');
						try {
							const { getTikTokV2 } = await import('../helper/tiktokv2.js');
							const { downloadUrl } = await import('../helper/tiktok.js');
							const info = await getTikTokV2(url);
							const buf = await downloadUrl(info.videoUrl, 100);
							const caption = `🎵 *${info.title}*\n👤 ${info.author}\n🔧 via ${info.source}`;
							await hisoka.sendMessage(m.from, { video: buf, caption }, { quoted: m });
						} catch (err) {
							await m.reply('❌ ' + (err?.message || 'Gagal mengunduh.'));
						}
					}
					return;
	},
};
