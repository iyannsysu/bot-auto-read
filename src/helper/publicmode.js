'use strict';

// Rate limiting untuk public mode — batasi command per user per jam.
import fs from 'fs';
import path from 'path';

const CONFIG_PATH = path.join(process.cwd(), 'publicmode.json');

// { senderJid: [timestamp, timestamp, ...] }
const usage = new Map();

function loadConfig() {
	try {
		const raw = fs.readFileSync(CONFIG_PATH, 'utf-8');
		return JSON.parse(raw || '{}');
	} catch {
		return { enabled: false, whitelist: [], ratelimit_per_hour: 10 };
	}
}

export function isPublicModeEnabled() {
	return loadConfig().enabled === true;
}

export function isPublicCommand(cmd) {
	if (!cmd) return false;
	const cfg = loadConfig();
	const list = (cfg.whitelist || []).map(c => String(c).toLowerCase());
	return list.includes(String(cmd).toLowerCase());
}

export function getPublicWelcome() {
	const cfg = loadConfig();
	if (!cfg.welcome_message) return null;
	const cmds = (cfg.whitelist || []).join(', ');
	return `🤖 *Halo! Aku bot publik.*\n\nCommand yang bisa dipakai:\n${cmds}\n\nKetik command dengan awalan . atau / ya!`;
}

/**
 * Cek rate limit. Return { allowed: bool, remaining: number, resetIn: string }
 */
export function checkRateLimit(senderJid) {
	const cfg = loadConfig();
	const limit = cfg.ratelimit_per_hour || 10;
	const now = Date.now();
	const hourAgo = now - 3600 * 1000;

	let times = usage.get(senderJid) || [];
	times = times.filter(t => t > hourAgo);

	if (times.length >= limit) {
		const oldest = Math.min(...times);
		const resetMs = oldest + 3600 * 1000 - now;
		const resetMin = Math.ceil(resetMs / 60000);
		return { allowed: false, remaining: 0, resetIn: `${resetMin} menit` };
	}

	times.push(now);
	usage.set(senderJid, times);
	return { allowed: true, remaining: limit - times.length, resetIn: null };
}

// Bersihkan memory tiap jam (hindari memory leak)
setInterval(() => {
	const hourAgo = Date.now() - 3600 * 1000;
	for (const [jid, times] of usage) {
		const fresh = times.filter(t => t > hourAgo);
		if (fresh.length) usage.set(jid, fresh);
		else usage.delete(jid);
	}
}, 3600 * 1000).unref?.();
