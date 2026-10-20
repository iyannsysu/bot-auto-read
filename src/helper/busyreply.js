'use strict';

// Auto-reply "sibuk" berjenjang untuk chat pribadi dari non-owner:
// chat ke-1 -> pesan sibuk, ke-2 & ke-3 -> pantun ga on, ke-4+ -> diam (anti ban).
// Counter reset tiap hari (WIB). Config: data/busyreply.json

import fs from 'fs';
import path from 'path';

const DATA_DIR = path.join(process.cwd(), 'data');
const CFG_PATH = path.join(DATA_DIR, 'busyreply.json');

const DEFAULTS = { enabled: true, counts: {} };

function wibDate() {
	return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Jakarta' }).format(new Date());
}

export function loadBusyCfg() {
	try {
		if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
		if (!fs.existsSync(CFG_PATH)) {
			fs.writeFileSync(CFG_PATH, JSON.stringify(DEFAULTS, null, 2));
			return { ...DEFAULTS };
		}
		return { ...DEFAULTS, ...JSON.parse(fs.readFileSync(CFG_PATH, 'utf8')) };
	} catch {
		return { ...DEFAULTS };
	}
}

export function saveBusyCfg(cfg) {
	try {
		fs.writeFileSync(CFG_PATH, JSON.stringify(cfg, null, 2));
	} catch (e) {
		console.error('Gagal simpan busyreply:', e?.message || e);
	}
}

const PANTUN_GA_ON = [
	'🪁 *Main layangan putus benangnya*\n*Layangannya jatuh ke kali*\n*Aku lagi nggak pegang HP-nya*\n*Nanti kubalas, jangan sebel hati* 😄',
	'🍜 *Pergi ke warung beli mie ayam*\n*Pulangnya mampir beli es teh*\n*Maaf ya aku lagi nggak on*\n*Chat kamu pasti kubalas deh* ✨',
	'🐦 *Burung nuri terbang ke awan*\n*Hinggap sebentar di pohon jati*\n*HP-ku lagi ditinggal tuan*\n*Sabar ya, nanti pasti dibalas lagi* 🙏',
];

// VN "lagi sibuk" suara Rumi — dikirim pas chat pertama dari seseorang
const BUSY_VN_PATH = path.join(DATA_DIR, 'busy-vn.ogg');

// Teks pendamping VN — dipilih random 1 dari 2
const BUSY_TEXT_RANDOM = [
	'bentar ya, Riyan aku lagi sibuk 🙏',
	'tunggu bentar ya, lagi sibuk nih hehe',
];

/** Kembalikan teks balasan untuk chat ke-n (1-based), atau null kalau harus diam. */
export function busyReplyFor(count) {
	if (count === 1) {
		return 'Maaf, mungkin orangnya lagi sibuk 🙏\nIni pesan otomatis dari *AI pribadi Iyan* 🤖';
	}
	if (count === 2 || count === 3) {
		return PANTUN_GA_ON[(count - 2) % PANTUN_GA_ON.length];
	}
	return null; // ke-4 dan seterusnya: diam total
}

/**
 * Proses 1 pesan masuk. Kembalikan true kalau sudah dibalas (biar caller bisa return).
 * Hanya untuk: non-owner, bukan fromMe, chat pribadi, bukan status/bot, ada teks.
 */
export async function handleBusyReply(m) {
	if (m.isOwner || m.key?.fromMe || !m.isPrivate || m.status || m.isBot || !m.text) return false;
	const cfg = loadBusyCfg();
	if (!cfg.enabled) return false;
	const today = wibDate();
	const sender = m.sender;
	let entry = cfg.counts[sender];
	if (!entry || entry.date !== today) entry = { count: 0, date: today };
	entry.count += 1;
	cfg.counts[sender] = entry;
	// Bersihkan entri lama (>2 hari) biar file tidak bengkak
	for (const jid of Object.keys(cfg.counts)) {
		if (cfg.counts[jid].date !== today) {
			const diff = (new Date(today) - new Date(cfg.counts[jid].date)) / 86400000;
			if (diff > 2) delete cfg.counts[jid];
		}
	}
	saveBusyCfg(cfg);
	// Chat pertama: kirim VN suara Rumi saja (tanpa teks)
	if (entry.count === 1) {
		try {
			if (fs.existsSync(BUSY_VN_PATH)) {
				await m.reply({
					audio: fs.readFileSync(BUSY_VN_PATH),
					mimetype: 'audio/ogg; codecs=opus',
					ptt: true,
				});
			}
		} catch (e) {
			console.error('Busyreply VN gagal:', e?.message || e);
		}
		return true;
	}
	const reply = busyReplyFor(entry.count);
	if (!reply) return false; // diam di chat ke-4+
	try {
		await m.reply(reply);
	} catch (e) {
		console.error('Busyreply gagal:', e?.message || e);
	}
	return true;
}
