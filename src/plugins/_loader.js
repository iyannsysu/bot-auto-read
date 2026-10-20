'use strict';

// Plugin loader: scan src/plugins/*.js (kecuali _*.js), validasi, dan
// bangun map command -> plugin. Dipakai oleh dispatcher di handler/message.js.
// Adaptasi snippet user (PluginLoader CJS) ke ESM + API yang sudah ada:
// - detectCategory dari daftar nama user, tapi hasil disesuaikan ke key
//   kategori menu.js (DOWNLOADER, STATUS, STIKER, dst) biar menu/fitur tetap rapi.
// - default cooldown/ownerOnly/groupOnly/adminOnly/description per plugin.
// - watchPlugins() opt-in (hot-reload) — tidak auto-jalan, biar bot stabil.

import fs from 'fs';
import path from 'path';
import { pathToFileURL } from 'url';

// Registry hasil load terakhir. Dipakai plugin lain (mis. menu, fitur) supaya daftar
// command selalu sesuai plugin yang benar-benar termuat — tanpa daftar manual.
// `failed`: plugin yang GAGAL load (dipakai .fitur untuk tanda ✗).
let registry = { map: new Map(), list: [], failed: [] };

/** @returns {{map: Map<string, object>, list: object[], failed: object[]}} hasil loadPlugins terakhir */
export function getPluginRegistry() {
	return registry;
}

/**
 * Tebak kategori dari nama file plugin (adaptasi detectCategory snippet user).
 * Dipakai hanya kalau plugin tidak punya category, atau category-nya generik
 * ('other'/'owner'/'downloader') — category eksplisit di file plugin tetap menang.
 */
export function detectCategory(name) {
	const n = String(name || '').toLowerCase();
	if (['sw', 'swread', 'swemoji', 'swreacttext', 'swreplytext', 'storyadd', 'storycap', 'storyclear', 'storydel', 'storylist', 'storynow', 'storyon', 'storytime', 'react'].includes(n)) return 'STATUS';
	if (['play', 'play2', 'ytsearch', 'tt', 'tiktokv2', 'pin', 'pixiv', 'sfile', 'ssweb', 'cosplay', 'hentai', 'ppcouple'].includes(n)) return 'DOWNLOADER';
	if (['s', 'spack', 'tpack', 'brat', 'emojimix', 'nulis'].includes(n)) return 'STIKER';
	if (['groups', 'setgc', 'hidetag', 'contacts'].includes(n)) return 'GRUP & KONTAK';
	if (['menfess', 'balasmenfess', 'tolakmenfess', 'khodam', 'artinama', 'ramalanjodoh', 'zodiak', 'alay', 'meme', 'waifu', 'hacker'].includes(n)) return 'FUN';
	if (['tebakgambar', 'math', 'nyerah'].includes(n)) return 'GAME';
	if (['jadwalsholat', 'doaharian'].includes(n)) return 'ISLAMI & PRIMBON';
	if (['update', 'op-eval', 'op-exec', 'debug', 'jadibot', 'busyreply', 'uptimebio', 'versi'].includes(n)) return 'OWNER & SISTEM';
	if (['tts', 'translate', 'readmore', 'p', 'q', 'cuaca'].includes(n)) return 'TOOLS';
	return 'LAINNYA';
}

/**
 * @returns {Promise<{map: Map<string, object>, list: object[], failed: object[]}>}
 */
export async function loadPlugins(pluginsDir) {
	const map = new Map();
	const list = [];
	const failed = [];
	let files = [];
	try {
		files = fs.readdirSync(pluginsDir).filter(f => f.endsWith('.js') && !f.startsWith('_'));
	} catch (e) {
		console.error('\x1b[31m[plugin] gagal baca direktori:\x1b[39m', e?.message || e);
		return { map, list };
	}
	for (const f of files.sort()) {
		try {
			const mod = await import(pathToFileURL(path.join(pluginsDir, f)).href);
			const p = mod.default;
			if (!p || typeof p.name !== 'string' || typeof p.run !== 'function') {
				console.warn(`\x1b[33m[plugin] skip ${f}: format tidak valid (butuh { name, run })\x1b[39m`);
				failed.push({ file: f, name: f.replace(/\.js$/, ''), reason: 'format tidak valid' });
				continue;
			}
			const base = f.replace(/\.js$/, '').toLowerCase();
			p.aliases = Array.isArray(p.aliases) ? p.aliases : [];
			// Kategori: eksplisit menang, generik -> tebak dari nama (snippet user).
			if (!p.category || ['other', 'owner', 'downloader'].includes(String(p.category).toLowerCase())) {
				p.category = detectCategory(base);
			}
			p.desc = p.desc || '';
			p.description = p.description || p.desc || `Fitur ${base}`;
			// Default dari snippet user (dispatcher pakai cooldown/ownerOnly/groupOnly).
			p.cooldown = Number(p.cooldown) || 3;
			p.ownerOnly = Boolean(p.ownerOnly || p.owner);
			p.groupOnly = Boolean(p.groupOnly || p.group);
			p.adminOnly = Boolean(p.adminOnly || p.admin);
			p.file = f;
			list.push(p);
			for (const alias of [p.name, ...p.aliases]) {
				const key = String(alias).toLowerCase();
				if (map.has(key)) {
					console.warn(`\x1b[33m[plugin] duplikat command "${key}" di ${f} (sudah ada)\x1b[39m`);
					continue;
				}
				map.set(key, p);
			}
		} catch (e) {
			console.error(`\x1b[31m[plugin] gagal load ${f}:\x1b[39m`, e?.message || e);
			failed.push({ file: f, name: f.replace(/\.js$/, ''), reason: String(e?.message || e).slice(0, 120) });
		}
	}
	registry = { map, list, failed };
	console.log(`[LOADER] Berhasil memuat ${list.length} plugin (${map.size} total command/alias).`);
	return { map, list, failed };
}

// Hot-reload opt-in (adaptasi watch() snippet user). Tidak auto-jalan —
// panggil manual kalau mau live-reload saat develop. Debounce 300ms.
let _watcher = null;
export function watchPlugins(pluginsDir, onReload) {
	if (_watcher) return _watcher;
	let timer = null;
	_watcher = fs.watch(pluginsDir, (eventType, filename) => {
		if (!filename || !filename.endsWith('.js') || filename.startsWith('_')) return;
		clearTimeout(timer);
		timer = setTimeout(async () => {
			console.log(`[HOT-RELOAD] Memperbarui plugin: ${filename}`);
			const res = await loadPlugins(pluginsDir);
			if (typeof onReload === 'function') {
				try { onReload(res); } catch {}
			}
		}, 300);
	});
	return _watcher;
}
