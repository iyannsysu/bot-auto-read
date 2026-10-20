'use strict';
// Command: adawong — ngobrol dengan Muse (adawong) lewat bot.
//   .adawong <pesan>   -> kirim pesan ke adawong, jawabannya dikirim balik
//   .adawong           -> status antrean
//
// Cara kerja: pesan dimasukkan ke .adawong-queue.json; cron adawong-queue-worker
// memproses antrean tiap 15 detik; jawaban ditulis ke .adawong-replies.json dan
// dikirim INSTAN oleh fs.watch di bawah (fallback polling 10 detik).
// Mode cepat (default ON): tanpa simulasi "mengetik...", balasan langsung dikirim.
// bootAdawong() dipanggil index.js saat koneksi terbuka supaya balasan tertunda
// tetap terkirim setelah restart. Khusus owner.

import * as shared from './_shared.js';

const { fs, path, os } = shared;

const QUEUE_FILE = path.join(os.homedir(), 'workspace', 'readsw', '.adawong-queue.json');
const REPLIES_FILE = path.join(os.homedir(), 'workspace', 'readsw', '.adawong-replies.json');
const MODE_FILE = path.join(os.homedir(), 'workspace', 'readsw', '.adawong-mode.json');

const ADAWONG_PREFIX = '💬 *adawong:*';

let sock = null; // ditangkap saat run() pertama
let watcherStarted = false;

function readJson(file) {
	try {
		if (!fs.existsSync(file)) return [];
		const d = JSON.parse(fs.readFileSync(file, 'utf8'));
		return Array.isArray(d) ? d : [];
	} catch {
		return [];
	}
}

function readJsonObj(file) {
	try {
		if (!fs.existsSync(file)) return {};
		const d = JSON.parse(fs.readFileSync(file, 'utf8'));
		return (d && typeof d === 'object' && !Array.isArray(d)) ? d : {};
	} catch {
		return {};
	}
}

function writeJsonAtomic(file, data) {
	const tmp = file + '.tmp';
	fs.writeFileSync(tmp, JSON.stringify(data));
	fs.renameSync(tmp, file);
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** Pecah teks panjang jadi beberapa bubble chat ala orang ngetik. */
function splitBubbles(text) {
	if (text.length <= 400) return [text];
	const parts = text.split(/(?<=[.!?])\s+/);
	const bubbles = [];
	let cur = '';
	for (const p of parts) {
		if ((cur + ' ' + p).trim().length > 400 && cur) {
			bubbles.push(cur.trim());
			cur = p;
		} else {
			cur = (cur + ' ' + p).trim();
		}
	}
	if (cur.trim()) bubbles.push(cur.trim());
	return bubbles.length ? bubbles : [text];
}

/** Kirim satu bubble. Mode cepat (default ON): langsung kirim tanpa jeda
 *  simulasi ngetik; jeda 1 detik antar bubble tetap dijaga biar aman rate-limit. */
async function sendLikeHuman(to, text) {
	const bubbles = splitBubbles(text);
	const fast = isFastMode();
	for (const b of bubbles) {
		if (!fast) {
			try {
				await sock.sendPresenceUpdate('composing', to);
			} catch {}
			// simulasi kecepatan ngetik: ~40 karakter/detik, min 1.5s max 7s
			const typingMs = Math.min(7000, Math.max(1500, (b.length / 40) * 1000));
			await sleep(typingMs);
		}
		try {
			await sock.sendMessage(to, { text: b });
		} catch {
			try { await sock.sendPresenceUpdate('paused', to); } catch {}
			throw new Error('gagal kirim');
		}
		try {
			await sock.sendPresenceUpdate('paused', to);
		} catch {}
		await sleep(fast ? 1000 : 800); // jeda antar bubble
	}
}

/** Kirim media (foto/video/vn) — download dari Pollinations bila worker hanya memberi prompt,
 *  atau kirim file yang sudah dibuat worker (video dari media pipeline, vn dari TTS). */
async function sendMediaLikeHuman(to, reply) {
	let filePath = reply.media && reply.media.path;
	const mediaPrompt = reply.media_prompt;
	const isVideo = (reply.media && reply.media.type === 'video');
	const isVoiceNote = (reply.media && reply.media.type === 'vn');

	// Worker hanya menulis prompt gambar -> bot yang download dari Pollinations
	if (!filePath && mediaPrompt) {
		const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'adwimg-'));
		filePath = path.join(tmpDir, 'img.jpg');
		try {
			const url = `https://image.pollinations.ai/prompt/${encodeURIComponent(mediaPrompt)}?width=768&height=768&nologo=true&model=flux`;
			const res = await fetch(url, { signal: AbortSignal.timeout(120000) });
			if (!res.ok) throw new Error('HTTP ' + res.status);
			const buf = Buffer.from(await res.arrayBuffer());
			if (buf.length < 10000) throw new Error('gambar tidak valid');
			fs.writeFileSync(filePath, buf);
		} catch (err) {
			fs.rmSync(tmpDir, { recursive: true, force: true });
			// fallback: kirim teks saja
			await sendLikeHuman(to, `🎨 Maaf sayang, gambarnya gagal dibuat (${err?.message || 'error'}).`);
			return;
		}
	}

	if (!filePath || !fs.existsSync(filePath)) return;
	const caption = (reply.media && reply.media.caption) || '';
	if (!isFastMode()) {
		try {
			await sock.sendPresenceUpdate('composing', to);
		} catch {}
		await sleep(2500); // jeda "menyiapkan" media
	}
	try {
		if (isVoiceNote) {
			await sock.sendPresenceUpdate('recording', to);
			await sleep(1500);
			// Convert ke OGG Opus biar bisa diputar sebagai VN WhatsApp
			let vnPath = filePath;
			if (filePath.endsWith('.mp3')) {
				const oggPath = filePath.replace(/\.mp3$/, '.ogg');
				try {
					const { execSync } = await import('child_process');
					execSync(`ffmpeg -y -i "${filePath}" -c:a libopus -b:a 64k -ar 48000 "${oggPath}"`, { stdio: 'pipe', timeout: 30000 });
					if (fs.existsSync(oggPath) && fs.statSync(oggPath).size > 1000) vnPath = oggPath;
				} catch {}
			}
			await sock.sendMessage(to, {
				audio: fs.readFileSync(vnPath),
				mimetype: 'audio/ogg; codecs=opus',
				ptt: true,
			});
		} else if (isVideo) {
			await sock.sendMessage(to, {
				video: fs.readFileSync(filePath),
				caption,
				gifPlayback: false,
			});
		} else {
			await sock.sendMessage(to, {
				image: fs.readFileSync(filePath),
				caption,
			});
		}
	} finally {
		try { await sock.sendPresenceUpdate('paused', to); } catch {}
		try { fs.unlinkSync(filePath); } catch {}
	}
}

/** Kirim balasan yang sudah siap ke chat masing-masing. */
async function deliverReplies() {
	if (!sock) return;
	const replies = readJson(REPLIES_FILE);
	if (!replies.length) return;
	const remaining = [];
	for (const r of replies) {
		try {
			if (r.media_prompt || r.video_prompt || (r.media && r.media.path)) {
				await sendMediaLikeHuman(r.to, r);
			}
			if (r.text) {
				await sendLikeHuman(r.to, `${ADAWONG_PREFIX}\n${r.text}`);
			}
		} catch {
			remaining.push(r); // gagal -> coba lagi nanti
		}
	}
	writeJsonAtomic(REPLIES_FILE, remaining);
}

function startWatcher() {
	if (watcherStarted) return;
	watcherStarted = true;
	// Mode cepat: kirim INSTAN begitu file balasan berubah (fs.watch),
	// tanpa nunggu polling. Polling 10 detik tetap jalan sebagai fallback.
	try {
		const watchTarget = fs.existsSync(REPLIES_FILE) ? REPLIES_FILE : path.dirname(REPLIES_FILE);
		fs.watch(watchTarget, { persistent: false }, (evt, fname) => {
			if (fname && path.basename(REPLIES_FILE) !== path.basename(fname) && watchTarget !== REPLIES_FILE) return;
			clearTimeout(startWatcher._t);
			startWatcher._t = setTimeout(() => deliverReplies().catch(() => {}), 400);
		});
	} catch {}
	const iv = setInterval(() => {
		deliverReplies().catch(() => {});
	}, 10000);
	if (iv.unref) iv.unref();
}

/** Mode cepat: tanpa simulasi "mengetik...", balasan langsung dikirim.
 *  Default ON (permintaan user 2026-10-19: chat otomatis no delay). */
export function isFastMode() {
	const d = readJsonObj(MODE_FILE);
	return d.fast !== false;
}

function setFastMode(on) {
	const d = readJsonObj(MODE_FILE);
	d.fast = !!on;
	writeJsonAtomic(MODE_FILE, d);
}

/** Dipanggil sekali saat koneksi WA terbuka (boot): tangkap socket lebih awal
 *  supaya balasan yang tertunda di .adawong-replies.json tetap terkirim meski
 *  bot sempat restart sebelum ada command/message baru. */
export function bootAdawong(hisoka) {
	if (hisoka) sock = hisoka;
	startWatcher();
	deliverReplies().catch(() => {});
}

/** Mode otomatis per chat: true = tiap pesan owner langsung dibalas tanpa command. */
export function isAutoChat(jid) {
	const d = readJsonObj(MODE_FILE);
	return !!(d.chats && d.chats[jid]);
}

function setAutoChat(jid, on) {
	const d = readJsonObj(MODE_FILE);
	if (!d.chats || typeof d.chats !== 'object') d.chats = {};
	if (on) d.chats[jid] = true;
	else delete d.chats[jid];
	writeJsonAtomic(MODE_FILE, d);
}

/** Masukkan pesan ke antrean (dipakai command & mode otomatis). */
export function queueAdawongMessage(to, sender, text) {
	const queue = readJson(QUEUE_FILE);
	const pendingCount = queue.filter((x) => x.status === 'pending').length;
	if (pendingCount >= 5) return false;
	queue.push({
		id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
		to,
		sender,
		text: text.slice(0, 2000),
		ts: Date.now(),
		status: 'pending',
	});
	writeJsonAtomic(QUEUE_FILE, queue.slice(-50));
	return true;
}

/** Dipanggil message.js untuk pesan biasa (bukan command) saat mode otomatis aktif. */
export async function handleAutoMessage(hisoka, m) {
	if (!m.isOwner || m.command) return false;
	const text = (m.text || '').trim();
	if (!text || text.startsWith(ADAWONG_PREFIX)) return false;
	if (!isAutoChat(m.from)) return false;
	sock = hisoka;
	startWatcher();
	await deliverReplies().catch(() => {});
	const ok = queueAdawongMessage(m.from, m.sender, text);
	if (ok) {
		try { await hisoka.sendPresenceUpdate('composing', m.from); } catch {}
	}
	return ok;
}

export default {
	name: 'adawong',
	aliases: ['tanyaadawong'],
	category: 'TOOLS',
	desc: 'Ngobrol dengan adawong. Contoh: .adawong halo',
	async run(ctx) {
		const { hisoka, m, query } = ctx;
		if (!m.isOwner) return;
		sock = hisoka;
		startWatcher();
		// sekalian cek balasan yang mungkin menunggu
		await deliverReplies().catch(() => {});

		const text = (query || '').trim();
		const low = text.toLowerCase();

		// .adawong on / off — mode otomatis tanpa command
		if (low === 'on' || low === 'aktif') {
			setAutoChat(m.from, true);
			await m.reply('✅ *Mode otomatis AKTIF* di chat ini.\nTiap pesan kamu langsung kubalas tanpa perlu `.adawong`.\nMatikan: `.adawong off`');
			return;
		}
		if (low === 'off' || low === 'mati') {
			setAutoChat(m.from, false);
			await m.reply('✅ *Mode otomatis MATI*.\nBalik ke mode command: `.adawong <pesan>`');
			return;
		}

		// .adawong fast on / off — mode cepat tanpa jeda simulasi ngetik
		if (low === 'fast on' || low === 'cepat on' || low === 'fast aktif') {
			setFastMode(true);
			await m.reply('⚡ *Mode cepat AKTIF*.\nBalasan langsung dikirim tanpa jeda "mengetik...".\nMatikan: `.adawong fast off`');
			return;
		}
		if (low === 'fast off' || low === 'cepat off' || low === 'fast mati') {
			setFastMode(false);
			await m.reply('🐢 *Mode cepat MATI*.\nBalasan dikirim dengan simulasi "mengetik..." seperti biasa.\nNyalakan: `.adawong fast on`');
			return;
		}

		if (!text) {
			const q = readJson(QUEUE_FILE);
			const pending = q.filter((x) => x.status === 'pending').length;
			const auto = isAutoChat(m.from) ? 'AKTIF ✅' : 'mati';
			const fast = isFastMode() ? 'AKTIF ⚡' : 'mati';
			await m.reply(
				'💬 *ADAWONG*\n\n' +
				`• Mode otomatis: ${auto} (\`.adawong on/off\`)\n` +
				`• Mode cepat: ${fast} (\`.adawong fast on/off\`)\n` +
				'• `.adawong <pesan>` — tanya sesuatu\n' +
				`• Antrean saat ini: ${pending} pesan`
			);
			return;
		}
		if (text.length > 2000) {
			await m.reply('❌ Pesan maksimal 2000 karakter.');
			return;
		}

		const ok = queueAdawongMessage(m.from, m.sender, text);
		if (!ok) {
			await m.reply('⏳ Antrean penuh (5). Tunggu jawaban sebelumnya dulu ya.');
			return;
		}
		// langsung tampilkan "mengetik..." saja, tanpa teks "tunggu dulu"
		try { await hisoka.sendPresenceUpdate('composing', m.from); } catch {}
	},
};
