'use strict';
// Auto-generated dari message.js — command: storynow
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
	name: 'storynow',
	aliases: [],
	category: 'other',
	desc: '',
	async run(ctx) {
	const { hisoka, m, query, text, quoted, message, messagesType } = ctx;
					{
						const cfg = loadStoryCfg();
						if (!cfg.queue.length) {
							await m.reply('Antrian kosong. Tambah dulu: .storyadd <link tiktok>');
							return;
						}
						const item = cfg.queue[cfg.index % cfg.queue.length];
						const { startLoading: slStory } = await import('../helper/loading.js');
						const storyLoad = await slStory(hisoka, m, 'Posting story');
						try {
							const dl = await downloadTikTokHD(item.url);
							const caption = cfg.caption || `🎬 ${dl.title}\n👤 @${dl.uploader}`;
							await postToStatus(hisoka, dl.file, caption);
							cfg.index = (cfg.index + 1) % cfg.queue.length;
							saveStoryCfg(cfg);
							await storyLoad.done('✅ Story terkirim!');
							try { fs.unlinkSync(dl.file); } catch {}
						} catch (e) {
							await storyLoad.fail('❌ Gagal: ' + (e?.message || e));
						}
					}
					return;
	},
};
