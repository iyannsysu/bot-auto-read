'use strict';
// Auto-generated dari message.js — command: sw
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
		getStickerPack, downloadStickerPack, cleanupStickerPack,
		getTelegramPack, downloadTelegramPack, cleanupTelegramPack,
		readSwConfig, writeSwConfig, extractEmojis,
		loadStoryCfg, saveStoryCfg, downloadTikTokHD, postToStatus,
		handleBusyReply, loadBusyCfg, saveBusyCfg,
		telegram, execFileAsync,
		PROJECT_ROOT, MENU_BANNER, GC_JSON,
		manhwaSearchCache, manhwaChapterCache,
		readGcLink, handleTikTokDownload, sendAlbum, handleSticker,
	} = shared;

export default {
	name: 'sw',
	aliases: [],
	category: 'STATUS',
	desc: '',
	async run(ctx) {
	const { hisoka, m, query, text, quoted, message, messagesType } = ctx;
					{
						const sw = readSwConfig();
						const on = v => (v ? 'ON ✅' : 'OFF ❌');
						const reactParts = String(sw.react_text || '').split('|').map(s => s.trim()).filter(Boolean);
						const reactList = reactParts.length
							? reactParts.slice(0, 15).map((t, i) => `${i + 1}. ${t}`).join('\n')
							: '-';
						const emojiPool = (sw.emoji_pool || []).join(' ') || '-';
						await m.reply(
							`👁️ *STATUS MONITOR*\n` +
							`━━━━━━━━━━━━━━\n` +
							`🌐 Cakupan    : SW pribadi + SW grup\n` +
							`📖 Auto-read  : ${on(sw.autoread)}\n` +
							`💬 Auto-react : ${on(sw.autoreact)}\n` +
							`↩️ Auto-reply  : ${on(sw.autoreply)}${sw.autoreply ? ` ("${sw.reply_text || ''}")` : ''}\n` +
							`🎲 Mode acak  : ${on(sw.random_emoji)}\n` +
							`⏱️ Bio uptime  : ${on(sw.uptimebio)}\n` +
							`━━━━━━━━━━━━━━\n` +
							`📝 *React teks (${reactParts.length}):*\n` +
							reactList + `\n` +
							`━━━━━━━━━━━━━━\n` +
							`😍 *Emoji pool (${(sw.emoji_pool || []).length}):*\n` +
							emojiPool + `\n` +
							`━━━━━━━━━━━━━━\n` +
							`⚙️ *Contoh command:*\n` +
							`.swread on - auto-lihat status\n` +
							`.swreact on / off - auto-react status\n` +
							`.swreply on - auto-balas ke DM\n` +
							`.swreplytext makasih yaa - atur teks balasan\n` +
							`.swreacttext halo | keren - atur react teks (pisah pakai |, tiap max 30 huruf)\n` +
							`.swreacttext off - matiin react teks\n` +
							`.swrandom on / off - react emoji acak\n` +
							`.swemoji 😍🔥 - ganti pool emoji\n` +
							`.uptimebio on / off - bio uptime otomatis`
						);
					}
					return;
	},
};
