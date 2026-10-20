'use strict';
// Auto-generated dari message.js — command: storyadd
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
	name: 'storyadd',
	aliases: [],
	category: 'other',
	desc: '',
	async run(ctx) {
	const { hisoka, m, query, text, quoted, message, messagesType } = ctx;
					{
						const raw = (query || '').trim();
						if (!raw || !/tiktok\.com/i.test(raw)) {
							await m.reply('Kirim link TikTok-nya. Contoh: .storyadd https://www.tiktok.com/@user/video/123');
							return;
						}
						const cfg = loadStoryCfg();
						if (cfg.queue.some(q => q.url === raw)) {
							await m.reply('Link itu udah ada di antrian.');
							return;
						}
						cfg.queue.push({ url: raw, addedAt: new Date().toISOString() });
						saveStoryCfg(cfg);
						await m.reply(`✅ Ditambahkan ke antrian story (no. ${cfg.queue.length}).\nTotal antrian: ${cfg.queue.length} video.`);
					}
					return;
	},
};
