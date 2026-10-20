'use strict';

import fs from 'fs';
import path from 'path';
import { jidNormalizedUser, toNumber, jidDecode, proto, isPnUser } from 'baileys';

import { telegram } from '../helper/index.js';
import { injectMessage } from '../helper/inject.js';
import { isNumber } from '../helper/text.js';
import { readSwConfig, pickEmoji } from '../helper/swconfig.js';

/**
 * @param {import('../../index').WAMessageExtra} m
 * @param {import('../../index').WASocketExtra} hisoka
 */
export default async function (m, hisoka) {
	try {
		// Log the message details
		if (process.env.BOT_LOG_MESSAGE === 'true' && m.type !== 'protocolMessage' && !m.isBot) {
			console.log(`\x1b[32m${'—'.repeat(50)}\x1b[39m`);
			console.log(
				`\x1b[36mReceived message from ${
					m.isGroup ? `"${m.pushName}" in "${hisoka.getName(m.from)}"` : m.pushName
				} (${m.type})\x1b[39m`
			);
			const maxLogLength = 200;
			const displayText = m.text.length > maxLogLength ? m.text.slice(0, maxLogLength) + '...' : m.text;
			console.log(`\x1b[36mText: ${displayText}\x1b[39m`);
		}

		// Hanlde Expiration Contextinfo
		if (m.content && m.content.contextInfo && isNumber(m.content.contextInfo.expiration) && isPnUser(m.from)) {
			const expiration = m.content.contextInfo.expiration;
			const ephemeralSettingTimestamp = toNumber(m.content.contextInfo.ephemeralSettingTimestamp);
			const contact = hisoka.contacts.read(m.from) || {};
			hisoka.contacts.write(m.from, { ...contact, ephemeralSettingTimestamp, ephemeralDuration: expiration });
		}

		// Auto-download media yang masuk (opsional via env BOT_AUTODL_MEDIA)
		if (process.env.BOT_AUTODL_MEDIA === 'true' && m.isMedia && !m.status && !m.isBot && !m.key.fromMe) {
			try {
				const buf = await m.downloadMedia();
				const mime = (m.content?.mimetype || '').split(';')[0].trim();
				const extMap = {
					'image/jpeg': 'jpg',
					'image/png': 'png',
					'image/webp': 'webp',
					'image/gif': 'gif',
					'video/mp4': 'mp4',
					'video/3gpp': '3gp',
					'audio/mpeg': 'mp3',
					'audio/ogg': 'ogg',
					'audio/mp4': 'm4a',
					'application/pdf': 'pdf',
				};
				const ext = extMap[mime] || 'bin';
				const d = new Date();
				const pad = n => String(n).padStart(2, '0');
				const stamp = `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}_${pad(
					d.getHours()
				)}${pad(d.getMinutes())}${pad(d.getSeconds())}`;
				const senderNum = (m.sender || 'unknown').replace(/[^0-9]/g, '') || 'unknown';
				const dir = path.join(process.cwd(), 'downloads');
				fs.mkdirSync(dir, { recursive: true });
				fs.writeFileSync(path.join(dir, `${stamp}_${senderNum}_${m.key.id}.${ext}`), buf);
			} catch (err) {
				console.error('\x1b[31mAuto-download media gagal:\x1b[39m', err?.message || err);
			}
		}

		// Handle protocol messages
		if (m.message.protocolMessage) {
			const protocolMessage = m.message.protocolMessage;
			const key = protocolMessage.key;
			const type = protocolMessage.type;

			switch (type) {
				case proto.Message.ProtocolMessage.Type.EPHEMERAL_SETTING:
				case proto.Message.ProtocolMessage.Type.EPHEMERAL_SYNC_RESPONSE:
					{
						const id = await hisoka.resolveLidToPN(key);
						const contact = hisoka.contacts.read(id) || {};
						hisoka.contacts.write(id, {
							...contact,
							ephemeralSettingTimestamp: toNumber(
								protocolMessage.ephemeralSettingTimestamp || m.message.messageTimestamp
							),
							ephemeralDuration: protocolMessage.ephemeralExpiration,
						});
					}
					break;

				case proto.Message.ProtocolMessage.Type.REVOKE:
					{
						// Anti-delete: teruskan pesan / status yang dihapus ke Telegram SAJA.
						// (2026-10-17: kirim ke WA sendiri tidak jalan, dan kalau send WA
						// gagal, error-nya menghentikan pengiriman ke Telegram. Jadi WA
						// dihapus total dari jalur ini.)
						// Detail: nama kontak, nomor, dan isi (foto/pesan/video)
						const revokedId = key?.id;
						const orig = revokedId ? hisoka.cacheMsg.get(revokedId) : null;

						if (orig && !orig.key.fromMe) {
							try {
								const om = await injectMessage(hisoka, orig);
								const sender = await hisoka.resolveLidToPN(orig.key);
								const name = hisoka.getName(sender, true);
								const number = String(sender || '').split('@')[0].replace(/[^0-9]/g, '') || '-';
								const ts = Number(orig.messageTimestamp) || Date.now() / 1000;
								const when = new Date(ts * 1000).toLocaleString('id-ID', { timeZone: 'Asia/Jakarta' });
								const isStatus = (key?.remoteJid === 'status@broadcast') || (orig?.key?.remoteJid === 'status@broadcast');
								const label = om.isGroupStatus ? 'SW grup dihapus' : isStatus ? 'Status dihapus' : 'Pesan dihapus';
								const tgCaption = `🗑️ <b>${label}</b>\n👤 ${name}\n📱 ${number}\n🕐 ${when}`;

								if (om.isMedia) {
									const media = await hisoka.downloadMediaMessage(orig);
									const waType = (om.type || '').replace('Message', '');

									// Teruskan ke Telegram (permintaan user 2026-10-09; 2026-10-17: WA dihapus)
									if (process.env.TELEGRAM_CHAT_ID && process.env.TELEGRAM_TOKEN) {
										try {
											const tgType = waType.toLowerCase();
											await telegram.send(process.env.TELEGRAM_CHAT_ID, media, {
												caption: tgCaption,
												type: ['image', 'video', 'audio', 'sticker'].includes(tgType) ? tgType : 'document',
												parse_mode: 'HTML',
											});
										} catch (e) {
											console.error('\x1b[31mTeruskan hapus-pesan ke Telegram gagal:\x1b[39m', e?.message || e);
										}
									}
								} else {
									// Teruskan ke Telegram (permintaan user 2026-10-09; 2026-10-17: WA dihapus)
									if (process.env.TELEGRAM_CHAT_ID && process.env.TELEGRAM_TOKEN) {
										try {
											await telegram.send(process.env.TELEGRAM_CHAT_ID,
												`${tgCaption}\n\n${om.text || ''}`.trim(),
												{ type: 'text', parse_mode: 'HTML' });
										} catch (e) {
											console.error('\x1b[31mTeruskan hapus-pesan ke Telegram gagal:\x1b[39m', e?.message || e);
										}
									}
								}
							} catch (err) {
								console.error(
									'\x1b[31mGagal meneruskan pesan yang dihapus:\x1b[39m',
									err?.message || err
								);
							}
						}
					}
					break;
			}
		}

		// Handle read receipts and send read status to Telegram
		// Skip reactionMessage: react balasan bot bisa datang kembali sebagai "status"
		// dan memicu infinite loop spam react.
		// FIX clone: di bot utama "owner" = bot itu sendiri, jadi status owner memang dilewati.
		// Di CLONE (jadibot), owner adalah nomor LAIN -> status owner HARUS tetap dibaca &
		// di-react. Yang dilewati hanya status milik clone itu sendiri (fromMe).
		const skipStatusOwner = hisoka._isClone ? !!m.key.fromMe : !!m.isOwner;
		// SW grup (m.isGroupStatus) ikut diproses di blok status yang sama:
		// auto-read, saver, react, reply, forward Telegram. Blok ini jalan dari
		// event handler (dipanggil SEBELUM guard anti-grup di message.js), jadi
		// chat grup biasa tetap diam total — hanya SW grup yang lewat sini.
		const isAnyStatus = m.status || m.isGroupStatus;
		if (!skipStatusOwner && isAnyStatus && m.content.type !== 0 && m.type !== 'reactionMessage') {
			const statusFrom = jidNormalizedUser(m.participant || m.sender);
			// Target react: SW pribadi -> 'status@broadcast' + statusJidList.
			// SW grup -> JID grup langsung, react grup biasa (tanpa statusJidList).
			const reactTarget = m.isGroupStatus ? m.from : 'status@broadcast';
			const reactOpts = m.isGroupStatus
				? {}
				: { statusJidList: [jidNormalizedUser(hisoka.user.id), jidNormalizedUser(m.sender)] };
			const groupLabel = m.isGroupStatus ? hisoka.getName(m.from) : '';
			// Simpan ke log status harian (untuk ringkasan jam 23:59)
			try {
				const entries = hisoka.statusLog?.read('entries') || [];
				entries.push({
					from: statusFrom,
					name: hisoka.getName(statusFrom, true),
					time: new Date().toISOString(),
					caption: (m.text || '').slice(0, 200),
					hasMedia: !!m.isMedia,
					kind: m.isGroupStatus ? 'group' : 'personal',
					...(m.isGroupStatus ? { group: groupLabel } : {}),
				});
				hisoka.statusLog?.write('entries', entries.slice(-500));
			} catch (err) {
				console.error('\x1b[31mGagal menyimpan status log:\x1b[39m', err?.message || err);
			}

			const privacySettings = hisoka.settings.read('privacy') || {};
			const readType = privacySettings.readreceipts === 'all' ? 'read' : 'read-self';

			// Config status: baca otomatis & react otomatis (bisa on/off via .swread / .swreact)
			const sw = readSwConfig(hisoka);

			// Auto-read status (tandai "dibaca")
			if (sw.autoread) {
				await hisoka.sendReceipts([m.key], readType);
			}

			// Status saver: simpan foto/video status ke downloads/status/
			if (m.isMedia && process.env.BOT_SAVE_STATUS !== 'false') {
				try {
					const buf = await m.downloadMedia();
					const mime = (m.content?.mimetype || '').split(';')[0].trim();
					const extMap = {
						'image/jpeg': 'jpg',
						'image/png': 'png',
						'image/webp': 'webp',
						'image/gif': 'gif',
						'video/mp4': 'mp4',
						'video/3gpp': '3gp',
					};
					const ext = extMap[mime] || 'bin';
					const d = new Date();
					const pad = n => String(n).padStart(2, '0');
					const stamp = `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}_${pad(
						d.getHours()
					)}${pad(d.getMinutes())}${pad(d.getSeconds())}`;
					const senderNum = jidDecode(statusFrom).user.replace(/[^0-9]/g, '') || 'unknown';
					const dir = path.join(process.cwd(), 'downloads', 'status');
					fs.mkdirSync(dir, { recursive: true });
					fs.writeFileSync(path.join(dir, `${stamp}_${senderNum}_${m.key.id}.${ext}`), buf);
				} catch (err) {
					console.error('\x1b[31mStatus saver gagal:\x1b[39m', err?.message || err);
				}
			}

			// Auto-react status: custom per kontak (react.json), teks custom (.swreacttext),
			// atau acak dari pool. Toggle: .swreact on/off | mode acak: .swrandom on/off
			if (sw.autoreact) {
				try {
					const reactedIds = hisoka.statusLog?.read('reacted') || [];
					if (!reactedIds.includes(m.key.id)) {
						const senderNum = jidDecode(statusFrom).user.replace(/[^0-9]/g, '');
						// React khusus per nomor (tanpa mengganggu react acak/sequence).
						// Format react.json: {"628xxxx":"teks custom"}
						let specialReact = '';
						try {
							const rc = JSON.parse(fs.readFileSync(path.join(process.cwd(), 'react.json'), 'utf-8') || '{}');
							specialReact = rc[senderNum] || '';
						} catch {}
						if (specialReact) {
							try {
								await hisoka.sendMessage(
									reactTarget,
									{ react: { key: m.key, text: specialReact } },
									reactOpts
								);
							} catch (err) {
								console.error('\x1b[31mGagal mengirim react khusus:\x1b[39m', err?.message || err);
							}
							reactedIds.push(m.key.id);
							hisoka.statusLog?.write('reacted', reactedIds.slice(-1000));
							return;
						}
						// MODE ACAK (.swrandom on): 1 emoji random dari pool, tanpa sequence teks.
						if (sw.random_emoji) {
							const emoji = pickEmoji(senderNum, sw);
							if (emoji) {
								try {
									await hisoka.sendMessage(
										reactTarget,
										{ react: { key: m.key, text: emoji } },
										reactOpts
									);
								} catch (err) {
									console.error('\x1b[31mGagal mengirim react acak:\x1b[39m', err?.message || err);
								}
								reactedIds.push(m.key.id);
								hisoka.statusLog?.write('reacted', reactedIds.slice(-1000));
							}
							return;
						}
						// react_text diisi -> react pakai tulisan, bukan emoji.
						// Sanitasi: WA server nolak react multi-baris (error 500), jadi
						// jadikan satu baris dan batasi 30 karakter.
						// Kalau ada | berarti beberapa opsi -> pilih acak.
						const rawOpts = (sw.react_text || '').split('|').map(s => s.replace(/[\r\n\t]+/g, ' ').trim()).filter(Boolean);
						// Countdown 1-10 + 5 teks: kirim berurutan (tidak acak), jeda 1 detik.
						const totalSteps = Math.min(rawOpts.length, 15);
						for (let i = 0; i < totalSteps; i++) {
							const rawText = rawOpts[i] || '';
							const reactText = (rawText || pickEmoji(senderNum, sw));
							if (reactText) {
								await hisoka.sendMessage(
									reactTarget,
									{ react: { key: m.key, text: reactText } },
									reactOpts
								);
							}
							if (i < totalSteps - 1) await new Promise(r => setTimeout(r, 1000));
						}
						if (totalSteps > 0) {
							reactedIds.push(m.key.id);
							hisoka.statusLog?.write('reacted', reactedIds.slice(-1000));
						}
					}
				} catch (err) {
					console.error('\x1b[31mGagal mengirim react status:\x1b[39m', err?.message || err);
				}
			}

			// Auto-reply status dengan TEKS (mode "bacaan", via .swreply on/off).
			// Bot kirim pesan teks ke DM yang bikin status, sekaligus tandai dibaca.
			if (sw.autoreply && sw.reply_text) {
				try {
					const repliedIds = hisoka.statusLog?.read('replied') || [];
					if (!repliedIds.includes(m.key.id)) {
						// SW grup tidak bisa di-quote ke DM (key-nya milik grup),
						// jadi auto-reply SW grup dikirim tanpa quote.
						await hisoka.sendMessage(statusFrom, { text: sw.reply_text }, m.isGroupStatus ? {} : { quoted: m });
						// tandai status dibaca juga
						await hisoka.sendReceipts([m.key], readType);
						repliedIds.push(m.key.id);
						hisoka.statusLog?.write('replied', repliedIds.slice(-1000));
					}
				} catch (err) {
					console.error('\x1b[31mGagal auto-reply status:\x1b[39m', err?.message || err);
				}
			}

			// Teruskan status ke WA sendiri (chat pribadi owner) — MATI secara default
			// (2026-10-09: user minta story full ke Telegram saja, jangan ke pribadi
			// karena numpuk). Nyalakan lagi via .env BOT_FORWARD_STATUS_WA=true
			// DEDUP: cegah forward berkali-kali untuk status yang sama
			if (process.env.BOT_FORWARD_STATUS_WA === 'true') {
				try {
					const forwardedIds = hisoka.statusLog?.read('forwarded') || [];
					if (!forwardedIds.includes(m.key.id)) {
						forwardedIds.push(m.key.id);
						hisoka.statusLog?.write('forwarded', forwardedIds.slice(-1000));

						const ownerNumber = (process.env.BOT_NUMBER_OWNER || '')
							.split(',')
							.map(x => x.trim())
							.filter(Boolean)[0];
						if (ownerNumber) {
							const name = hisoka.getName(statusFrom, true);
							const caption =
								`👁️ Status dari ${name}\n📅 ${new Date(toNumber(m.messageTimestamp) * 1000).toLocaleString(
									'id-ID',
									{ timeZone: 'Asia/Jakarta' }
								)}${m.text ? `\n\n${m.text}` : ''}`.trim();
							const ownerJid = `${ownerNumber}@s.whatsapp.net`;
							if (m.isMedia) {
								const media = await m.downloadMedia();
								const waType = (m.type || '').replace('Message', '');
								const content = {};
								if (waType === 'image') content.image = media;
								else if (waType === 'video') content.video = media;
								else if (waType === 'audio') content.audio = media;
								else if (waType === 'sticker') content.sticker = media;
								else content.document = media;
								if (waType !== 'sticker') content.caption = caption;
								await hisoka.sendMessage(ownerJid, content);
							} else {
								await hisoka.sendMessage(ownerJid, { text: caption });
							}
						}
					}
				} catch (err) {
					console.error('\x1b[31mForward status ke WA gagal:\x1b[39m', err?.message || err);
				}
			}

			// Send read status to Telegram (DEDUP: cegah kirim berkali-kali)
			if (process.env.TELEGRAM_CHAT_ID && process.env.TELEGRAM_TOKEN) {
				try {
					const tgSentIds = hisoka.statusLog?.read('tg_forwarded') || [];
					if (!tgSentIds.includes(m.key.id)) {
						tgSentIds.push(m.key.id);
						hisoka.statusLog?.write('tg_forwarded', tgSentIds.slice(-1000));

						const name = hisoka.getName(statusFrom, true);
						const text = `<b>From :</b> <a href="https://wa.me/${jidDecode(statusFrom).user}">@${name}</a>
${m.isGroupStatus ? `<b>Jenis :</b> SW Grup (${groupLabel})\n` : ''}<b>Date :</b> ${new Date(toNumber(m.messageTimestamp) * 1000).toLocaleString('en-US', { timeZone: 'Asia/Jakarta' })}
${m.text ? `<b>Caption :</b>\n\n${m.text}` : ''}`.trim();

						if (m.isMedia) {
							const media = await m.downloadMedia();

							await telegram.send(process.env.TELEGRAM_CHAT_ID, media, {
								caption: text,
								type: m.type.replace('Message', ''),
								parse_mode: 'HTML',
							});
						} else {
							await telegram.send(process.env.TELEGRAM_CHAT_ID, text, { type: 'text', parse_mode: 'HTML' });
						}
					}
				} catch (err) {
					console.error('\x1b[31mForward status ke Telegram gagal:\x1b[39m', err?.message || err);
				}
			}
		}
	} catch (e) {
		console.error(`\x1b[31mError in event handler:\x1b[39m\n`, e);
	}
}
