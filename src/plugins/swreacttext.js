'use strict';
// Auto-generated dari message.js — command: swreacttext
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
	name: 'swreacttext',
	aliases: ['ubahreact'],
	category: 'STATUS',
	desc: '',
	async run(ctx) {
	const { hisoka, m, query, text, quoted, message, messagesType } = ctx;
					{
						const sw = readSwConfig(hisoka);
						const teks = (query || '').trim().toLowerCase();
						if (teks === 'off' || teks === 'kosong') {
							writeSwConfig({ react_text: '' }, hisoka);
							await m.reply(`🔤 React teks dimatikan, balik pakai emoji.`);
							return;
						}
						const input = (query || '').trim();
						if (!input) {
							await m.reply(
								`🔤 React teks saat ini: "${sw.react_text || '-'}"\n\n_Pakai: .swreacttext <tulisan>_\n_Acak beberapa: .swreacttext teks1 | teks2 | teks3_\n_Matikan: .swreacttext off_`
							);
							return;
						}
						// Pisahkan pakai | untuk mode acak, tiap opsi max 30 char
						const opts = input.split('|').map(s => s.trim().slice(0, 30)).filter(Boolean);
						if (!opts.length) {
							await m.reply('Tulisannya kosong.');
							return;
						}
						writeSwConfig({ react_text: opts.join(' | ') }, hisoka);
						await m.reply(
							opts.length > 1
								? `🔤 React status sekarang ACAK dari ${opts.length} tulisan:\n${opts.map((o, i) => `${i + 1}. "${o}"`).join('\n')}`
								: `🔤 React status sekarang pakai tulisan: "${opts[0]}"`
						);
					}
					return;
	},
};
