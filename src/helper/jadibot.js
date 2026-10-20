/**
 * jadibot — clone bot ke nomor lain via pairing code.
 *
 * Clone berjalan di PROSES TERPISAH (src/clone-runner.js) agar TIDAK MATI
 * saat bot utama restart/update.
 *
 * Komunikasi via file:
 *   sessions/clones/.cmd/<nomor>.json       -> perintah ke clone-runner
 *   sessions/clones/.cmd/<nomor>.code.json  -> pairing code dari clone-runner
 *   sessions/clones/.status/<nomor>.json    -> status clone
 */

import fs from 'fs';
import path from 'path';

const cleanNum = n => {
	let id = String(n).replace(/[^0-9]/g, '');
	// Perbaikan aman dari snippet user: 08xxx -> 62xxx (format WA).
	if (id.startsWith('08')) id = '62' + id.slice(1);
	else if (id.startsWith('0')) id = '62' + id.slice(1);
	return id;
};
const CMD_DIR = path.join(process.cwd(), 'sessions', 'clones', '.cmd');
const STATUS_DIR = path.join(process.cwd(), 'sessions', 'clones', '.status');

/**
 * Runner menulis status tiap ≤10 detik. Kalau file sudah lama tidak diperbarui,
 * runner mati/hang -> jangan tampilkan 'ready' palsu.
 */
function effectiveStatus(d) {
	if (d?.updatedAt && Date.now() - d.updatedAt > 45000) return 'offline';
	return d?.status || 'unknown';
}

function ensureDirs() {
	fs.mkdirSync(CMD_DIR, { recursive: true });
	fs.mkdirSync(STATUS_DIR, { recursive: true });
}

/** Tunggu pairing code dari clone-runner (max 60 detik) */
async function waitForCode(botId, timeoutMs = 60000) {
	const codeFile = path.join(CMD_DIR, `${botId}.code.json`);
	const start = Date.now();
	while (Date.now() - start < timeoutMs) {
		try {
			if (fs.existsSync(codeFile)) {
				const data = JSON.parse(fs.readFileSync(codeFile, 'utf-8'));
				fs.unlinkSync(codeFile);
				// Cek apakah session sudah terdaftar (tidak perlu kode)
				if (!data.code) return null;
				return data.code;
			}
		} catch {}
		// Cek juga apakah clone sudah connect (session lama)
		const st = getClone(botId);
		if (st && (st.status === 'open' || st.status === 'ready')) return null;
		await new Promise(r => setTimeout(r, 1000));
	}
	throw new Error('Timeout menunggu pairing code dari clone-runner.');
}

export async function startClone(number, onCode) {
	const id = cleanNum(number);
	if (!id || id.length < 8) throw new Error('Nomor tidak valid.');
	ensureDirs();

	// Buang kode lama yang basi supaya tidak terbaca sebagai kode baru
	try { fs.unlinkSync(path.join(CMD_DIR, `${id}.code.json`)); } catch {}

	// Kirim perintah START ke clone-runner
	fs.writeFileSync(
		path.join(CMD_DIR, `${id}.json`),
		JSON.stringify({ action: 'start', botId: id, at: Date.now() })
	);

	// Tunggu kode atau konfirmasi connect
	const code = await waitForCode(id);
	if (onCode) await onCode(code);
	return { number: id, status: code ? 'waiting_code' : 'open' };
}

export async function stopClone(number) {
	const id = cleanNum(number);
	ensureDirs();
	const st = getClone(id);
	if (!st) throw new Error('Clone tidak ditemukan.');
	fs.writeFileSync(
		path.join(CMD_DIR, `${id}.json`),
		JSON.stringify({ action: 'stop', botId: id, at: Date.now() })
	);
	// Tunggu sebentar agar diproses
	await new Promise(r => setTimeout(r, 2000));
	return true;
}

export function listClones() {
	ensureDirs();
	let files = [];
	try {
		files = fs.readdirSync(STATUS_DIR).filter(f => f.endsWith('.json'));
	} catch { return []; }
	return files.map(f => {
		try {
			const d = JSON.parse(fs.readFileSync(path.join(STATUS_DIR, f), 'utf-8'));
			return { number: d.botId, status: effectiveStatus(d) };
		} catch { return null; }
	}).filter(Boolean).filter(c => {
		// FIX pile-up: .status tanpa folder sesi = phantom, jangan tampilkan.
		// Hapus sekalian file basinya.
		try {
			return fs.statSync(path.join(process.cwd(), 'sessions', 'clones', c.number)).isDirectory();
		} catch {
			try { fs.unlinkSync(path.join(STATUS_DIR, `${c.number}.json`)); } catch {}
			return false;
		}
	});
}

export function getClone(number) {
	const id = cleanNum(number);
	ensureDirs();
	// FIX pile-up: kalau folder sesi sudah tidak ada, .status-nya basi.
	try {
		if (!fs.statSync(path.join(process.cwd(), 'sessions', 'clones', id)).isDirectory()) {
			try { fs.unlinkSync(path.join(STATUS_DIR, `${id}.json`)); } catch {}
			return null;
		}
	} catch {
		try { fs.unlinkSync(path.join(STATUS_DIR, `${id}.json`)); } catch {}
		return null;
	}
	try {
		const d = JSON.parse(fs.readFileSync(path.join(STATUS_DIR, `${id}.json`), 'utf-8'));
		return { number: id, status: effectiveStatus(d), info: d };
	} catch {
		return null;
	}
}

export async function restoreClones() {
	// Clone-runner menangani restore sendiri saat start.
	// Fungsi ini hanya untuk kompatibilitas.
	return listClones().map(c => c.number);
}

export function getCloneDebug(number) {
	const id = cleanNum(number);
	const s = getClone(id);
	if (!s) return null;
	const info = s.info || {};
	const h = info.handlers || {};
	const on = v => (v ? 'ON' : 'OFF');
	return {
		sessionId: `bot_${id}`,
		status: s.status === 'ready' || s.status === 'open' ? 'ONLINE' : String(s.status).toUpperCase(),
		runner: 'separate-process',
		pid: info.pid,
		messageHandler: on(h.message),
		commandHandler: on(h.command),
		eventHandler: on(h.event),
		middleware: on(h.middleware),
		features: on(h.features),
		commands: info.commands || 0,
		plugins: info.plugins || 0,
	};
}
