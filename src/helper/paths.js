'use strict';
// Lokasi binary & folder data terpusat. Menggantikan path hardcode /home/hatch/...
//
// Urutan pencarian binary: env (YTDLP_PATH, PYTHON_PATH, PINTEREST_SCRAPER_PATH)
// -> lokasi lama (kalau masih ada, jadi mesin lama tetap jalan) -> venv proyek -> nama di PATH.
// Folder data: BOT_DATA_DIR -> lokasi lama (kalau ada) -> <proyek>/data.

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

const LEGACY_VENV = '/home/hatch/workspace/tiktokbot/venv/bin';
const LEGACY_DATA = '/home/hatch/workspace/readsw/data';

const exists = p => {
	try { return fs.existsSync(p); } catch { return false; }
};

export function resolveBin(name, envVar, legacy = []) {
	const fromEnv = envVar && process.env[envVar];
	if (fromEnv) return fromEnv;
	for (const p of legacy) if (exists(p)) return p;
	for (const rel of [`.venv/bin/${name}`, `venv/bin/${name}`]) {
		const p = path.join(ROOT, rel);
		if (exists(p)) return p;
	}
	return name; // biar execFile mencari lewat PATH
}

export const YTDLP = resolveBin('yt-dlp', 'YTDLP_PATH', [`${LEGACY_VENV}/yt-dlp`]);
export const PYTHON = resolveBin('python3', 'PYTHON_PATH', [`${LEGACY_VENV}/python`]);
export const PIN_SCRAPER = resolveBin('pinterest-scraper', 'PINTEREST_SCRAPER_PATH', [`${LEGACY_VENV}/pinterest-scraper`]);

export const DATA_DIR = process.env.BOT_DATA_DIR || (exists(LEGACY_DATA) ? LEGACY_DATA : path.join(ROOT, 'data'));
