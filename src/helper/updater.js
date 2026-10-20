'use strict';
/**
 * Auto-update readsw — aman, tanpa git, tanpa merusak data lokal.
 *
 * Cara kerja:
 *   1. Ambil SHA commit terbaru dari GitHub (UPDATE_REPO / UPDATE_BRANCH).
 *   2. Kalau berbeda dengan versi terpasang -> unduh tarball commit itu ke folder temp.
 *   3. VALIDASI dulu: package.json valid, src/index.js ada, semua file .js lolos `node --check`.
 *      Kalau gagal -> tidak ada satu file pun yang disentuh.
 *   4. Backup file yang akan ditimpa ke .update-backup/<waktu>/, lalu terapkan per file (atomik).
 *   5. Kalau dependensi di package.json berubah -> `npm install`. Gagal -> ROLLBACK otomatis.
 *   6. Simpan versi terpasang di .update-state.json, restart lewat supervisor (run.sh).
 *
 * Yang TIDAK pernah disentuh: .env, sessions/, node_modules/, *.json data (react.json, gc.json,
 * autoreply.json, dst.), assets/, log. Hanya path di UPDATE_PATHS yang disinkronkan.
 *
 * Konfigurasi (.env):
 *   UPDATE_REPO              wajib, format "pemilik/repo"  (mis. iyannsysu/readsw)
 *   UPDATE_BRANCH            default "main"
 *   GITHUB_TOKEN             opsional — repo private / menghindari rate limit
 *   AUTO_UPDATE              default "true" (cek berkala; butuh UPDATE_REPO)
 *   AUTO_UPDATE_INTERVAL_MIN default 60 (minimal 10)
 *   UPDATE_PATHS             default "src,package.json,package-lock.json,run.sh,README.md,LICENSE,.env.example"
 *   UPDATE_SKIP_NPM          "true" = jangan jalankan npm install
 *   UPDATE_API_BASE / UPDATE_CODELOAD_BASE  untuk mirror / pengujian
 */

import fs from 'fs';
import os from 'os';
import path from 'path';
import util from 'util';
import { execFile } from 'child_process';
import { fileURLToPath } from 'url';
import { Readable, Transform } from 'stream';
import { pipeline } from 'stream/promises';

const execFileAsync = util.promisify(execFile);

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const STATE_FILE = path.join(ROOT, '.update-state.json');
const LOCK_FILE = path.join(ROOT, '.update.lock');
const BACKUP_DIR = path.join(ROOT, '.update-backup');

/** Kode keluar yang diartikan run.sh sebagai "restart karena update" (tunggu lebih singkat). */
export const RESTART_EXIT_CODE = 75;

const MAX_TARBALL_BYTES = 150 * 1024 * 1024;
const KEEP_BACKUPS = 3;
const LOCK_STALE_MS = 15 * 60 * 1000;
const FAILED_SKIP_MS = 6 * 60 * 60 * 1000;
const DEFAULT_PATHS = 'src,package.json,package-lock.json,run.sh,README.md,LICENSE,.env.example';

export class UpdateError extends Error {
	constructor(code, message) {
		super(message);
		this.name = 'UpdateError';
		this.code = code;
	}
}

const log = (msg, color = 36) => console.log(`\x1b[${color}m[update] ${msg}\x1b[39m`);
const warn = msg => console.warn(`\x1b[33m[update] ${msg}\x1b[39m`);

// ───────────────────────── konfigurasi & state ─────────────────────────

export function getConfig() {
	const env = process.env;
	let repo = String(env.UPDATE_REPO || '')
		.trim()
		.replace(/^https?:\/\/github\.com\//i, '')
		.replace(/\.git$/i, '')
		.replace(/^\/+|\/+$/g, '');
	const repoValid = /^[\w.-]+\/[\w.-]+$/.test(repo);
	if (!repoValid) repo = '';

	let branch = String(env.UPDATE_BRANCH || 'main').trim();
	if (!/^[\w./-]+$/.test(branch) || branch.includes('..')) branch = 'main';

	const paths = String(env.UPDATE_PATHS || DEFAULT_PATHS)
		.split(',')
		.map(p => p.trim().replace(/^\/+|\/+$/g, ''))
		.filter(p => p && !p.includes('..') && !path.isAbsolute(p));

	const interval = Number(env.AUTO_UPDATE_INTERVAL_MIN);
	return {
		repo,
		repoRaw: String(env.UPDATE_REPO || '').trim(),
		branch,
		token: String(env.GITHUB_TOKEN || env.UPDATE_TOKEN || '').trim(),
		paths,
		intervalMin: Number.isFinite(interval) && interval >= 10 ? interval : 60,
		autoDefault: String(env.AUTO_UPDATE ?? 'true').toLowerCase() !== 'false',
		skipNpm: String(env.UPDATE_SKIP_NPM || '').toLowerCase() === 'true',
		apiBase: String(env.UPDATE_API_BASE || 'https://api.github.com').replace(/\/+$/, ''),
		codeloadBase: String(env.UPDATE_CODELOAD_BASE || 'https://codeload.github.com').replace(/\/+$/, ''),
	};
}

export function readState() {
	try {
		const j = JSON.parse(fs.readFileSync(STATE_FILE, 'utf8'));
		return j && typeof j === 'object' ? j : {};
	} catch {
		return {};
	}
}

function writeState(state) {
	const tmp = `${STATE_FILE}.tmp`;
	fs.writeFileSync(tmp, JSON.stringify(state, null, 2));
	fs.renameSync(tmp, STATE_FILE);
}

export function patchState(patch) {
	const next = { ...readState(), ...patch };
	for (const k of Object.keys(next)) if (next[k] === undefined) delete next[k];
	writeState(next);
	return next;
}

export function isAutoEnabled(cfg = getConfig(), state = readState()) {
	if (!cfg.repo) return false;
	return typeof state.auto === 'boolean' ? state.auto : cfg.autoDefault;
}

export const shortSha = s => (s ? String(s).slice(0, 7) : '-');

export function localVersion() {
	try {
		return JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8')).version || '-';
	} catch {
		return '-';
	}
}

function assertConfigured(cfg) {
	if (!cfg.repo) {
		throw new UpdateError(
			'not-configured',
			cfg.repoRaw
				? `UPDATE_REPO "${cfg.repoRaw}" tidak valid. Pakai format pemilik/repo, mis. iyannsysu/readsw.`
				: 'UPDATE_REPO belum diisi di .env (format: pemilik/repo).'
		);
	}
}

// ───────────────────────── jaringan ─────────────────────────

function authHeaders(cfg) {
	return cfg.token ? { Authorization: `Bearer ${cfg.token}` } : {};
}

async function request(url, { headers = {}, timeoutMs = 20000 } = {}) {
	const ctrl = new AbortController();
	const timer = setTimeout(() => ctrl.abort(), timeoutMs);
	try {
		return await fetch(url, {
			headers: { 'User-Agent': 'readsw-updater', ...headers },
			signal: ctrl.signal,
			redirect: 'follow',
		});
	} catch (e) {
		const why = e?.name === 'AbortError' ? 'waktu habis' : e?.cause?.code || e?.message || String(e);
		throw new UpdateError('network', `Tidak bisa terhubung ke server update (${why}).`);
	} finally {
		clearTimeout(timer);
	}
}

function httpError(res, cfg) {
	if (res.status === 404) {
		return new UpdateError(
			'notfound',
			`Repo/branch tidak ditemukan: ${cfg.repo}@${cfg.branch}. Kalau repo private, isi GITHUB_TOKEN di .env.`
		);
	}
	if (res.status === 401) return new UpdateError('auth', 'GITHUB_TOKEN ditolak (401). Periksa token di .env.');
	if (res.status === 403 || res.status === 429) {
		const reset = Number(res.headers.get('x-ratelimit-reset'));
		const when = reset ? ` Coba lagi sekitar ${new Date(reset * 1000).toLocaleTimeString('id-ID')}.` : '';
		return new UpdateError('ratelimit', `Kena batas permintaan GitHub.${when} Isi GITHUB_TOKEN agar limit lebih longgar.`);
	}
	return new UpdateError('http', `Server update membalas HTTP ${res.status}.`);
}

/** SHA commit terbaru di branch. */
export async function fetchRemoteSha(cfg = getConfig()) {
	assertConfigured(cfg);
	const ref = cfg.branch.split('/').map(encodeURIComponent).join('/');
	const url = `${cfg.apiBase}/repos/${cfg.repo}/commits/${ref}`;
	const res = await request(url, { headers: { Accept: 'application/vnd.github.sha', ...authHeaders(cfg) } });
	if (!res.ok) throw httpError(res, cfg);
	const sha = (await res.text()).trim();
	if (!/^[0-9a-f]{40}$/i.test(sha)) throw new UpdateError('http', 'Balasan server update tidak dikenali (SHA tidak valid).');
	return sha.toLowerCase();
}

async function downloadTarball(cfg, sha, dest) {
	const url = cfg.token
		? `${cfg.apiBase}/repos/${cfg.repo}/tarball/${sha}`
		: `${cfg.codeloadBase}/${cfg.repo}/tar.gz/${sha}`;
	const res = await request(url, { headers: authHeaders(cfg), timeoutMs: 180000 });
	if (!res.ok) throw httpError(res, cfg);
	if (!res.body) throw new UpdateError('http', 'Unduhan kosong.');

	let bytes = 0;
	const limiter = new Transform({
		transform(chunk, _enc, cb) {
			bytes += chunk.length;
			if (bytes > MAX_TARBALL_BYTES) return cb(new UpdateError('toobig', 'Unduhan update terlalu besar (>150 MB), dibatalkan.'));
			cb(null, chunk);
		},
	});
	try {
		await pipeline(Readable.fromWeb(res.body), limiter, fs.createWriteStream(dest), { signal: AbortSignal.timeout(180000) });
	} catch (e) {
		if (e instanceof UpdateError) throw e;
		throw new UpdateError('network', `Unduhan terputus (${e?.cause?.code || e?.message || e}).`);
	}
	if (bytes < 100) throw new UpdateError('http', 'File update yang diunduh tidak lengkap.');
}

async function extractTarball(file, dir) {
	try {
		await execFileAsync('tar', ['-xzf', file, '-C', dir, '--strip-components=1'], { timeout: 120000 });
	} catch (e) {
		if (e?.code === 'ENOENT') throw new UpdateError('tar', 'Perintah "tar" tidak ada di sistem. Install dulu (mis. pkg install tar / apt install tar).');
		throw new UpdateError('extract', `Gagal membuka file update: ${String(e?.stderr || e?.message || e).split('\n')[0]}`);
	}
}

// ───────────────────────── file util ─────────────────────────

const toPosix = p => p.split(path.sep).join('/');
const SKIP_DIRS = new Set(['node_modules', '.git']);

function safeJoin(base, rel) {
	if (!rel || path.isAbsolute(rel) || rel.split(/[\\/]/).includes('..')) throw new UpdateError('unsafe', `Path tidak aman: ${rel}`);
	const full = path.resolve(base, rel);
	if (full !== base && !full.startsWith(base + path.sep)) throw new UpdateError('unsafe', `Path di luar proyek: ${rel}`);
	return full;
}

function isAllowedRel(cfg, rel) {
	return cfg.paths.some(p => rel === p || rel.startsWith(p + '/'));
}

/** Daftar file (path relatif posix) di bawah root, hanya untuk path yang di-whitelist. */
function listFiles(root, cfg) {
	const out = [];
	const walk = (abs, rel) => {
		let st;
		try { st = fs.lstatSync(abs); } catch { return; }
		if (st.isSymbolicLink()) return;
		if (st.isDirectory()) {
			if (SKIP_DIRS.has(path.basename(abs))) return;
			for (const name of fs.readdirSync(abs)) walk(path.join(abs, name), rel ? `${rel}/${name}` : name);
		} else if (st.isFile()) {
			if (rel.endsWith('.bak') || rel.endsWith('.upd-tmp')) return;
			out.push(rel);
		}
	};
	for (const p of cfg.paths) walk(path.join(root, p), p);
	return out.sort();
}

function atomicCopy(src, dest) {
	fs.mkdirSync(path.dirname(dest), { recursive: true });
	const tmp = `${dest}.upd-tmp`;
	fs.copyFileSync(src, tmp);
	try { fs.chmodSync(tmp, fs.statSync(src).mode & 0o777 || 0o644); } catch { /* abaikan */ }
	fs.renameSync(tmp, dest);
}

// ───────────────────────── validasi ─────────────────────────

async function validateTree(dir, cfg) {
	const pkgPath = path.join(dir, 'package.json');
	if (!fs.existsSync(pkgPath)) throw new UpdateError('invalid', 'Update ditolak: package.json tidak ada di repo.');
	try {
		JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
	} catch {
		throw new UpdateError('invalid', 'Update ditolak: package.json di repo rusak (JSON tidak valid).');
	}
	if (!fs.existsSync(path.join(dir, 'src', 'index.js'))) throw new UpdateError('invalid', 'Update ditolak: src/index.js tidak ada di repo.');

	const jsFiles = listFiles(dir, cfg).filter(f => f.endsWith('.js'));
	const failures = [];
	let i = 0;
	const worker = async () => {
		while (i < jsFiles.length) {
			const rel = jsFiles[i++];
			try {
				await execFileAsync(process.execPath, ['--check', path.join(dir, rel)], { timeout: 30000 });
			} catch (e) {
				const line = String(e?.stderr || e?.message || '').split('\n').find(l => /Error/.test(l)) || 'syntax error';
				failures.push(`${rel}: ${line.trim()}`);
			}
		}
	};
	await Promise.all(Array.from({ length: 6 }, worker));
	if (failures.length) {
		throw new UpdateError(
			'invalid',
			`Update ditolak, ${failures.length} file punya error syntax (file lokal tidak diubah):\n` +
				failures.slice(0, 3).map(f => `• ${f}`).join('\n')
		);
	}
	return jsFiles.length;
}

// ───────────────────────── sinkronisasi + backup + rollback ─────────────────────────

function planSync(newRoot, cfg, state) {
	const newFiles = listFiles(newRoot, cfg);
	const newSet = new Set(newFiles);
	const toWrite = [];
	for (const rel of newFiles) {
		const local = safeJoin(ROOT, rel);
		let same = false;
		try {
			same = fs.existsSync(local) && fs.readFileSync(local).equals(fs.readFileSync(path.join(newRoot, rel)));
		} catch { same = false; }
		if (!same) toWrite.push(rel);
	}
	// Hapus hanya file yang dulu dipasang updater tapi sudah tidak ada di repo.
	// Plugin buatan sendiri (tidak ada di manifest) tidak akan pernah dihapus.
	const toDelete = (Array.isArray(state.files) ? state.files : []).filter(rel => {
		try {
			return typeof rel === 'string' && !newSet.has(rel) && isAllowedRel(cfg, rel) && fs.existsSync(safeJoin(ROOT, rel));
		} catch {
			return false; // entri manifest aneh/tidak aman -> abaikan
		}
	});
	return { newFiles, toWrite, toDelete };
}

function makeBackup(plan, meta) {
	const id = new Date().toISOString().replace(/[:.]/g, '-');
	const dir = path.join(BACKUP_DIR, id);
	const filesDir = path.join(dir, 'files');
	fs.mkdirSync(filesDir, { recursive: true });
	const restore = [];
	const created = [];
	for (const rel of [...plan.toWrite, ...plan.toDelete]) {
		const local = safeJoin(ROOT, rel);
		if (fs.existsSync(local)) {
			const dest = path.join(filesDir, rel);
			fs.mkdirSync(path.dirname(dest), { recursive: true });
			fs.copyFileSync(local, dest);
			restore.push(rel);
		} else {
			created.push(rel);
		}
	}
	fs.writeFileSync(path.join(dir, 'meta.json'), JSON.stringify({ id, createdAt: Date.now(), restore, created, ...meta }, null, 2));
	return { id, dir };
}

function restoreBackup(dir) {
	const meta = JSON.parse(fs.readFileSync(path.join(dir, 'meta.json'), 'utf8'));
	for (const rel of meta.restore || []) {
		atomicCopy(path.join(dir, 'files', rel), safeJoin(ROOT, rel));
	}
	for (const rel of meta.created || []) {
		try { fs.unlinkSync(safeJoin(ROOT, rel)); } catch { /* sudah tidak ada */ }
	}
	return meta;
}

function pruneBackups() {
	try {
		const dirs = fs.readdirSync(BACKUP_DIR).filter(d => fs.existsSync(path.join(BACKUP_DIR, d, 'meta.json'))).sort();
		for (const d of dirs.slice(0, Math.max(0, dirs.length - KEEP_BACKUPS))) {
			fs.rmSync(path.join(BACKUP_DIR, d), { recursive: true, force: true });
		}
	} catch { /* belum ada backup */ }
}

function latestBackupDir() {
	try {
		const dirs = fs.readdirSync(BACKUP_DIR).filter(d => fs.existsSync(path.join(BACKUP_DIR, d, 'meta.json'))).sort();
		return dirs.length ? path.join(BACKUP_DIR, dirs[dirs.length - 1]) : null;
	} catch {
		return null;
	}
}

const depsOf = pkg => JSON.stringify(Object.entries(pkg?.dependencies || {}).sort(([a], [b]) => a.localeCompare(b)));

function readPkg(file) {
	try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch { return null; }
}

async function npmInstall() {
	const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm';
	try {
		await execFileAsync(npm, ['install', '--omit=dev', '--no-audit', '--no-fund', '--loglevel=error'], {
			cwd: ROOT,
			timeout: 10 * 60 * 1000,
			maxBuffer: 10 * 1024 * 1024,
		});
	} catch (e) {
		if (e?.code === 'ENOENT') throw new UpdateError('npm', 'npm tidak ditemukan. Install Node.js/npm atau set UPDATE_SKIP_NPM=true.');
		const detail = String(e?.stderr || e?.message || e).split('\n').filter(Boolean).slice(0, 2).join(' ').slice(0, 200);
		throw new UpdateError('npm', `npm install gagal: ${detail}`);
	}
}

// ───────────────────────── lock ─────────────────────────

function acquireLock() {
	try {
		const st = fs.statSync(LOCK_FILE);
		if (Date.now() - st.mtimeMs > LOCK_STALE_MS) fs.rmSync(LOCK_FILE, { force: true });
	} catch { /* tidak ada lock */ }
	try {
		fs.writeFileSync(LOCK_FILE, JSON.stringify({ pid: process.pid, at: Date.now() }), { flag: 'wx' });
	} catch (e) {
		if (e?.code === 'EEXIST') throw new UpdateError('busy', 'Update lain sedang berjalan, coba lagi sebentar.');
		throw e;
	}
}

function releaseLock() {
	try { fs.rmSync(LOCK_FILE, { force: true }); } catch { /* abaikan */ }
}

// ───────────────────────── API publik ─────────────────────────

/**
 * Cek saja (tidak mengubah apa pun).
 * @returns {{status: 'up-to-date'|'update-available'|'baseline-missing', local?: string, remote: string}}
 */
export async function checkForUpdate() {
	const cfg = getConfig();
	assertConfigured(cfg);
	const remote = await fetchRemoteSha(cfg);
	const state = readState();
	if (!state.sha) return { status: 'baseline-missing', remote };
	if (state.sha === remote) return { status: 'up-to-date', local: state.sha, remote };
	return { status: 'update-available', local: state.sha, remote };
}

/**
 * Unduh + validasi + terapkan update terbaru.
 * @param {{force?: boolean, notifyJid?: string}} opts force = terapkan walau SHA sama / belum ada versi acuan
 * @returns {Promise<{status: 'updated'|'up-to-date'|'no-changes', from?: string, to: string, changed?: string[], removed?: string[], npm?: boolean}>}
 */
export async function applyUpdate(opts = {}) {
	const cfg = getConfig();
	assertConfigured(cfg);
	acquireLock();
	let tmp = '';
	let remote = '';
	try {
		remote = await fetchRemoteSha(cfg);
		const state = readState();
		if (!opts.force && state.sha === remote) return { status: 'up-to-date', from: state.sha, to: remote };

		tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'readsw-upd-'));
		const tgz = path.join(tmp, 'update.tgz');
		const tree = path.join(tmp, 'tree');
		fs.mkdirSync(tree);

		log(`mengunduh ${cfg.repo}@${shortSha(remote)}...`);
		await downloadTarball(cfg, remote, tgz);
		await extractTarball(tgz, tree);
		const checked = await validateTree(tree, cfg);
		log(`validasi OK (${checked} file .js lolos syntax check)`);

		const plan = planSync(tree, cfg, state);
		if (!plan.toWrite.length && !plan.toDelete.length) {
			patchState({ sha: remote, repo: cfg.repo, branch: cfg.branch, checkedAt: Date.now(), failedSha: undefined, failedAt: undefined, lastError: undefined });
			return { status: 'no-changes', from: state.sha, to: remote };
		}

		const oldPkg = readPkg(path.join(ROOT, 'package.json'));
		const newPkg = readPkg(path.join(tree, 'package.json'));
		const backup = makeBackup(plan, { fromSha: state.sha || null, toSha: remote });
		let npmRan = false;

		try {
			for (const rel of plan.toWrite) atomicCopy(path.join(tree, rel), safeJoin(ROOT, rel));
			for (const rel of plan.toDelete) fs.unlinkSync(safeJoin(ROOT, rel));

			const needNpm = !cfg.skipNpm && depsOf(oldPkg) !== depsOf(newPkg);
			if (needNpm) {
				log('dependensi berubah, menjalankan npm install...');
				await npmInstall();
			}
			npmRan = needNpm;
		} catch (e) {
			warn(`gagal menerapkan update (${e?.message || e}), rollback...`);
			try {
				restoreBackup(backup.dir);
				fs.rmSync(backup.dir, { recursive: true, force: true }); // backup sudah terpakai
			} catch (re) {
				warn(`rollback juga gagal: ${re?.message || re}`); // backup dibiarkan agar bisa dipulihkan manual
			}
			throw e instanceof UpdateError ? e : new UpdateError('apply', `Gagal menerapkan update: ${e?.message || e}`);
		}

		patchState({
			sha: remote,
			repo: cfg.repo,
			branch: cfg.branch,
			updatedAt: Date.now(),
			previousSha: state.sha,
			files: plan.newFiles,
			skipSha: undefined,
			failedSha: undefined,
			failedAt: undefined,
			lastError: undefined,
			pendingNotify: opts.notifyJid
				? { jid: opts.notifyJid, text: `✅ *Update selesai*\nVersi sekarang: \`${shortSha(remote)}\` (${plan.toWrite.length} file diperbarui)` }
				: undefined,
		});
		pruneBackups();
		log(`update ${shortSha(state.sha)} -> ${shortSha(remote)} selesai (${plan.toWrite.length} file, ${plan.toDelete.length} dihapus)`, 32);
		return { status: 'updated', from: state.sha, to: remote, changed: plan.toWrite, removed: plan.toDelete, npm: !!npmRan };
	} catch (e) {
		if (remote && !(e instanceof UpdateError && ['busy', 'not-configured'].includes(e.code))) {
			try { patchState({ failedSha: remote, failedAt: Date.now(), lastError: String(e?.message || e).split('\n')[0].slice(0, 300) }); } catch { /* abaikan */ }
		}
		throw e;
	} finally {
		releaseLock();
		if (tmp) { try { fs.rmSync(tmp, { recursive: true, force: true }); } catch { /* abaikan */ } }
	}
}

/** Kembalikan file ke kondisi sebelum update terakhir. */
export function rollbackLastUpdate() {
	const dir = latestBackupDir();
	if (!dir) throw new UpdateError('nobackup', 'Belum ada backup update untuk dikembalikan.');
	acquireLock();
	try {
		const meta = restoreBackup(dir);
		fs.rmSync(dir, { recursive: true, force: true });
		patchState({
			sha: meta.fromSha || undefined,
			skipSha: meta.toSha, // jangan auto-update ke versi yang barusan di-rollback
			files: undefined,
			pendingNotify: undefined,
		});
		return { from: meta.toSha, to: meta.fromSha, files: (meta.restore?.length || 0) + (meta.created?.length || 0) };
	} finally {
		releaseLock();
	}
}

// ───────────────────────── restart & aktivitas ─────────────────────────

let activeTasks = 0;
let restartTimer = null;

/** Tandai ada command yang sedang berjalan (restart otomatis menunggu sampai selesai). */
export function beginTask() { activeTasks++; }
export function endTask() { activeTasks = Math.max(0, activeTasks - 1); }

/** true kalau bot dijalankan lewat run.sh (supervisor akan menghidupkan lagi setelah keluar). */
export function isSupervised() {
	return process.env.READSW_SUPERVISED === '1';
}

/**
 * Keluar dengan kode 75 supaya run.sh menghidupkan bot lagi dengan kode baru.
 * Menunggu command yang sedang berjalan (download dll.) selesai, maksimal maxWaitMs.
 * Tanpa supervisor, tidak keluar (agar bot tidak mati) — user restart manual.
 */
export function scheduleRestart({ maxWaitMs = 30 * 60 * 1000 } = {}) {
	if (!isSupervised()) return { scheduled: false, reason: 'not-supervised' };
	if (restartTimer) return { scheduled: true };
	const started = Date.now();
	const tick = () => {
		if (activeTasks > 0 && Date.now() - started < maxWaitMs) {
			restartTimer = setTimeout(tick, 5000);
			return;
		}
		log('restart untuk memuat versi baru...', 33);
		process.exit(RESTART_EXIT_CODE);
	};
	restartTimer = setTimeout(tick, 2500);
	return { scheduled: true };
}

// ───────────────────────── auto update berkala ─────────────────────────

let autoTimer = null;
let ticking = false;

function ownerJid() {
	const n = String(process.env.BOT_NUMBER_OWNER || '').split(',').map(x => x.trim()).filter(Boolean)[0];
	return n ? `${n.replace(/[^0-9]/g, '')}@s.whatsapp.net` : '';
}

async function autoTick() {
	if (ticking) return;
	ticking = true;
	try {
		const cfg = getConfig();
		const state = readState();
		if (!isAutoEnabled(cfg, state)) return;

		const chk = await checkForUpdate();
		if (chk.status === 'baseline-missing') {
			// Pertama kali: anggap versi lokal = versi repo saat ini, jangan menimpa apa pun.
			patchState({ sha: chk.remote, repo: cfg.repo, branch: cfg.branch, baselineAt: Date.now() });
			log(`versi acuan diset ke ${shortSha(chk.remote)} (tidak ada file yang diubah)`);
			return;
		}
		if (chk.status !== 'update-available') return;
		if (state.skipSha === chk.remote) return;
		if (state.failedSha === chk.remote && Date.now() - (state.failedAt || 0) < FAILED_SKIP_MS) return;

		log(`versi baru ${shortSha(chk.remote)} tersedia, memperbarui...`);
		const res = await applyUpdate({ notifyJid: ownerJid() });
		if (res.status === 'updated') {
			const r = scheduleRestart();
			if (!r.scheduled) warn('update terpasang, tapi bot tidak dijalankan lewat run.sh — restart manual untuk memakai versi baru.');
		}
	} catch (e) {
		warn(`auto update dilewati: ${e?.message || e}`);
	} finally {
		ticking = false;
	}
}

/** Dipanggil setiap koneksi WA terbuka: kirim notifikasi pasca-update + mulai pengecekan berkala. */
export async function onConnectionOpen(hisoka) {
	try {
		const st = readState();
		if (st.pendingNotify?.jid && st.pendingNotify?.text) {
			patchState({ pendingNotify: undefined }); // hapus dulu agar tidak terkirim berulang
			try { await hisoka.sendMessage(st.pendingNotify.jid, { text: st.pendingNotify.text }); } catch (e) { warn(`notifikasi gagal: ${e?.message || e}`); }
		}
	} catch { /* abaikan */ }

	if (autoTimer) return;
	const cfg = getConfig();
	if (!cfg.repo) {
		if (cfg.repoRaw) warn(`UPDATE_REPO "${cfg.repoRaw}" tidak valid — auto update nonaktif.`);
		return;
	}
	const first = setTimeout(autoTick, 60 * 1000);
	first.unref?.();
	autoTimer = setInterval(autoTick, cfg.intervalMin * 60 * 1000);
	autoTimer.unref?.();
	log(`auto update ${isAutoEnabled(cfg) ? 'aktif' : 'nonaktif'} • ${cfg.repo}@${cfg.branch} • tiap ${cfg.intervalMin} menit`);
}
