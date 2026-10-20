#!/usr/bin/env node
/**
 * clone-runner.js — proses TERPISAH untuk menjalankan clone/jadibot.
 *
 * Kenapa terpisah? Agar clone TIDAK MATI saat bot utama restart/update.
 * Proses ini:
 * - Restore semua clone yang sudah terdaftar saat start
 * - Menangani perintah via file (sessions/clones/.cmd/)
 * - Auto-reconnect per clone
 *
 * Komunikasi dengan bot utama via file JSON:
 *   sessions/clones/.cmd/<nomor>.json  -> { action: 'start'|'stop', ... }
 *   sessions/clones/.status/<nomor>.json -> { status, ... }
 */

import fs from 'fs';
import path from 'path';

// FIX: runner adalah proses terpisah, jadi .env TIDAK otomatis termuat seperti di
// bot utama. Tanpa ini BOT_NUMBER_OWNER, HTTPS_PROXY, config owner/mode, dll kosong
// dan handler pesan bisa mengabaikan semua perintah. Harus dimuat SEBELUM
// session-manager di-import (ia membaca env saat modul dimuat).
try { await import('dotenv/config'); } catch {}

// Satu error tak tertangani tidak boleh mematikan SEMUA clone.
process.on('unhandledRejection', e => console.error('[clone-runner] unhandledRejection:', e?.stack || e));
process.on('uncaughtException', e => console.error('[clone-runner] uncaughtException:', e?.stack || e));

const { sessionManager, sessionLog } = await import('./helper/session-manager.js');

const CMD_DIR = path.join(process.cwd(), 'sessions', 'clones', '.cmd');
const STATUS_DIR = path.join(process.cwd(), 'sessions', 'clones', '.status');

function ensureDirs() {
	fs.mkdirSync(CMD_DIR, { recursive: true });
	fs.mkdirSync(STATUS_DIR, { recursive: true });
}

function writeStatus(botId, data) {
	try {
		fs.writeFileSync(
			path.join(STATUS_DIR, `${botId}.json`),
			JSON.stringify({ botId, pid: process.pid, ...data, updatedAt: Date.now() })
		);
	} catch {}
}

function clearStatus(botId) {
	try { fs.unlinkSync(path.join(STATUS_DIR, `${botId}.json`)); } catch {}
}

/** Proses file perintah dari bot utama */
async function processCommands() {
	let files = [];
	try { files = fs.readdirSync(CMD_DIR).filter(f => f.endsWith('.json')); } catch { return; }

	for (const f of files) {
		const fp = path.join(CMD_DIR, f);
		try {
			const cmd = JSON.parse(fs.readFileSync(fp, 'utf-8'));
			fs.unlinkSync(fp); // hapus setelah dibaca

			const botId = (cmd.botId || '').replace(/[^0-9]/g, '');
			if (!botId) continue;

			if (cmd.action === 'start') {
				sessionLog(botId, 'perintah START dari bot utama');
				try {
					const ctx = await sessionManager.initializeBotSession(botId, {
						onCode: async code => {
							// Tulis kode ke file agar bot utama bisa baca
							if (code) {
								fs.writeFileSync(
									path.join(CMD_DIR, `${botId}.code.json`),
									JSON.stringify({ botId, code, at: Date.now() })
								);
							}
						},
					});
					writeStatus(botId, { status: ctx.status, ...sessionManager.snapshot(ctx) });
				} catch (err) {
					sessionLog(botId, 'start gagal:', err?.message);
					writeStatus(botId, { status: 'error', error: err?.message });
				}
			} else if (cmd.action === 'stop') {
				sessionLog(botId, 'perintah STOP dari bot utama');
				await sessionManager.destroy(botId).catch(() => {});
				clearStatus(botId);
			}
		} catch (err) {
			console.error('[clone-runner] cmd error:', err?.message);
		}
	}
}

async function main() {
	console.log('[clone-runner] mulai...');
	ensureDirs();

	// Status ditulis tiap kali berubah (connecting/open/ready/close/replaced).
	sessionManager.onStatus = (id, status, info) => writeStatus(id, { status, ...info });

	// Restore semua clone yang sudah terdaftar.
	// FIX: dulu status langsung ditulis 'open' padahal socket belum tentu konek.
	const restored = await sessionManager.restoreAll();
	console.log(`[clone-runner] ${restored.length} clone direstore`);

	// Poll perintah setiap 3 detik
	setInterval(processCommands, 3000);

	// Update status berkala
	setInterval(() => {
		for (const s of sessionManager.list()) {
			writeStatus(s.botId, { status: s.status, handlers: s.handlers, commands: s.commands, plugins: s.plugins });
		}
	}, 10000);

	// Graceful shutdown
	for (const sig of ['SIGTERM', 'SIGINT']) {
		process.on(sig, async () => {
			console.log(`[clone-runner] ${sig}, shutdown...`);
			await sessionManager.shutdown().catch(() => {});
			process.exit(0);
		});
	}
}

main().catch(err => {
	console.error('[clone-runner] fatal:', err);
	process.exit(1);
});
