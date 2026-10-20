'use strict';
// Command: jadibot — clone bot ke nomor lain via pairing code (owner only)
// .jadibot <nomor>   -> minta pairing code untuk nomor tersebut
// .jadibot list      -> lihat clone yang aktif
// .jadibot stop <nomor> -> matikan clone

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
	name: 'jadibot',
	aliases: ['clonebot'],
	category: 'owner',
	desc: 'Clone bot ke nomor lain',
	async run(ctx) {
	const { hisoka, m, query, text, quoted, message, messagesType } = ctx;
		// Blokir jadibot di dalam clone (hindari loop)
		if (hisoka._isClone) {
			await m.reply('❌ Fitur jadibot tidak tersedia di clone bot.');
			return;
		}
		const arg = (query || '').trim();
		const { startClone, stopClone, listClones } = await import('../helper/jadibot.js');

		if (!arg) {
			await m.reply(
				`🤖 *Jadibot — Clone Bot*\n\n` +
				`• .jadibot <nomor> — jadi bot di nomor lain\n` +
				`  Contoh: .jadibot 628123456789\n\n` +
				`• .jadibot list — lihat clone aktif\n` +
				`• .jadibot stop <nomor> — matikan clone`
			);
			return;
		}

		if (arg.toLowerCase() === 'list') {
			const clones = listClones();
			if (!clones.length) {
				await m.reply('📭 Belum ada clone bot yang aktif.');
				return;
			}
			const list = clones.map(c => `• ${c.number} — ${c.status}`).join('\n');
			await m.reply(`🤖 *Clone aktif:*\n${list}`);
			return;
		}

		if (arg.toLowerCase().startsWith('stop ')) {
			const num = arg.slice(5).trim();
			try {
				await stopClone(num);
				await m.reply(`✅ Clone ${num} dimatikan.`);
			} catch (err) {
				await m.reply('❌ ' + (err?.message || 'Gagal.'));
			}
			return;
		}

		// .jadibot <nomor> — mulai pairing
		const num = arg.replace(/[^0-9]/g, '');
		if (!num || num.length < 10) {
			await m.reply('❌ Nomor tidak valid. Contoh: .jadibot 628123456789');
			return;
		}

		await m.reply(`🔄 Meminta pairing code untuk ${num}...\nTunggu sebentar...`);
		try {
			await startClone(num, async (code) => {
				if (!code) {
					// Sudah terdaftar sebelumnya, langsung coba hubungkan
					await m.reply(`✅ Nomor ${num} sudah terdaftar. Menghubungkan ulang...`);
					return;
				}
				const sentMsg = await hisoka.sendMessage(m.from, {
					text:
						`🤖 *JADIBOT CLONE*\n\n` +
						`Masukkan kode di bawah ini untuk menjadikan *${num}* sebagai bot clone:\n\n` +
						`1. Buka WhatsApp di nomor ${num} > Perangkat Tertaut\n` +
						`2. Tautkan perangkat > Tautkan dengan nomor telepon\n` +
						`3. Masukkan kode di bawah ini\n\n` +
						`*${code}*\n\n` +
						`⏳ _Kode berlaku ±2 menit_`
				}, { quoted: m });

				// Setelah 2 menit, cek apakah clone sudah terhubung.
				// Kalau belum, edit pesan jadi KEDALUWARSA.
				setTimeout(async () => {
					try {
						const { getClone } = await import('../helper/jadibot.js');
						const clone = getClone(num);
						// FIX: status sukses bisa 'open' ATAU 'ready' (markReady langsung mengubahnya ke 'ready')
						if (clone?.status === 'open' || clone?.status === 'ready') return; // sudah terhubung, biarkan
						await hisoka.sendMessage(m.from, {
							text:
								`📱 *Pairing Code untuk ${num}:*\n\n` +
								`*${code}*\n\n` +
								`❌ *KEDALUWARSA*\n` +
								`Kode sudah tidak berlaku. Ketik *.jadibot ${num}* untuk minta kode baru.`,
							edit: sentMsg.key,
						});
					} catch {}
				}, 2 * 60 * 1000).unref?.();

				// Polling: kabari owner begitu clone benar-benar terhubung.
				// (max ~3 menit; clone-runner update status via file)
				(async () => {
					const { getClone } = await import('../helper/jadibot.js');
					for (let i = 0; i < 36; i++) {
						await new Promise(r => setTimeout(r, 5000));
						try {
							const st = getClone(num);
							if (st && (st.status === 'open' || st.status === 'ready')) {
								await m.reply(
									`✅ *[ KONEK SUKSES ]*\n\n` +
									`Clone *${num}* sudah terhubung dan aktif!\n` +
									`Ketik *.jadibot stop ${num}* untuk mematikan.`
								);
								break;
							}
						} catch {}
					}
				})();
			});
		} catch (err) {
			await m.reply('❌ ' + (err?.message || 'Gagal membuat clone.'));
		}
		return;
	},
};
