'use strict';
// Auto-generated dari message.js — command: storylist
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
	name: 'storylist',
	aliases: [],
	category: 'other',
	desc: '',
	async run(ctx) {
	const { hisoka, m, query, text, quoted, message, messagesType } = ctx;
					{
						const cfg = loadStoryCfg();
						const lines = cfg.queue.map((q, i) => `${i + 1}. ${q.url}`).join('\n') || '(kosong)';
						await m.reply(
							`📋 *JADWAL STORY*\n\n` +
							`Status: ${cfg.enabled ? 'ON ✅' : 'OFF ❌'}\n` +
							`Jam (WIB): ${cfg.times.join(', ') || '-'}\n` +
							`Caption: ${cfg.caption || '(judul video)'}\n` +
							(cfg.lastError ? `⚠️ Error terakhir: ${cfg.lastError}\n` : '') +
							`\n🎬 *Antrian (${cfg.queue.length}):*\n${lines}`
						);
					}
					return;
	},
};
