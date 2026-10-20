'use strict';
// Auto-generated dari message.js — command: uptimebio
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
	name: 'uptimebio',
	aliases: [],
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
							const sw = readSwConfig();
							await m.reply(
								`⏱️ Bio uptime saat ini: *${sw.uptimebio ? 'ON ✅' : 'OFF ❌'}*\n\n` +
									`_Pakai: .uptimebio on  atau  .uptimebio off_\n` +
									`_Kalau ON, bio WA otomatis jadi "🟢 Iyan x m • Online ⏱️ 3j 25m" (update tiap 1 menit)_`
							);
							return;
						}
						writeSwConfig({ uptimebio: val });
						// langsung update bio saat dinyalakan
						if (val) {
							try {
								const s = Math.floor(process.uptime());
								const h = Math.floor(s / 3600);
								const mnt = Math.floor((s % 3600) / 60);
								const up = h > 0 ? `${h}j ${mnt}m` : `${mnt}m`;
								const bio = `🟢 Iyan x m • Online ⏱️ ${up}`;
								await hisoka.updateProfileStatus(bio);
								console.log(`\x1b[36m[uptimebio] Bio diupdate via command: ${bio}\x1b[39m`);
							} catch (err) {
								console.error('\x1b[31m[uptimebio] Gagal via command:\x1b[39m', err?.message || err);
								await m.reply(`⚠️ Gagal update bio: ${err?.message || err}`);
							}
						}
						await m.reply(`⏱️ Bio uptime sekarang *${val ? 'ON ✅' : 'OFF ❌'}*`);
					}
					return;
	},
};
