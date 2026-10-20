'use strict';
// Auto-generated dari message.js — command: swread (aliases: swreact, swrandom, swreply)
// Kategori: STATUS

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
	name: 'swread',
	aliases: ['swreact', 'swrandom', 'swreply'],
	category: 'STATUS',
	desc: '',
	async run(ctx) {
	const { hisoka, m, query, text, quoted, message, messagesType } = ctx;
					{
						const v = (query || '').trim().toLowerCase();
						const val =
							['on', '1', 'true', 'nyala', 'ya'].includes(v) ? true
							: ['off', '0', 'false', 'mati', 'tidak'].includes(v) ? false
							: null;
						if (val === null) {
							await m.reply(`Pakai: .${m.command} on  atau  .${m.command} off`);
							return;
						}
						const keyMap = { swread: 'autoread', swreact: 'autoreact', swreply: 'autoreply', swrandom: 'random_emoji' };
						const labelMap = { swread: 'Auto-read', swreact: 'Auto-react', swreply: 'Auto-reply teks', swrandom: 'Mode acak' };
						const key = keyMap[m.command];
						const label = labelMap[m.command];
						const sw = writeSwConfig({ [key]: val });
						await m.reply(
							`${label} sekarang *${val ? 'ON ✅' : 'OFF ❌'}*` +
								(key === 'random_emoji' && val
									? `\n_React status akan acak dari: ${sw.emoji_pool.join(' ')}_`
									: '') +
								(key === 'autoreply' && val
									? `\n_Balas status dengan teks: "${sw.reply_text}"_\n_Ubah: .swreplytext <teks>_`
									: '')
						);
					}
					return;
	},
};
