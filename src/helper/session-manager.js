/**
 * BotSessionManager — arsitektur multi-session yang aman dan terisolasi.
 *
 * Pola inisialisasi per session (WAJIB untuk semua session):
 *   initializeBotSession(session)
 *   ├── createClient(session)
 *   ├── initializeClient(session)
 *   ├── registerMessageHandler(session)
 *   ├── registerCommandHandler(session)
 *   ├── registerEventHandler(session)
 *   ├── registerMiddleware(session)
 *   ├── registerAllFeatures(session)
 *   ├── connect(session)
 *   └── ready/online
 *
 * Struktur folder:
 *   sessions/
 *   ├── <main>/          (bot utama, TIDAK PERNAH disentuh manager clone)
 *   └── clones/
 *       ├── <nomor1>/
 *       └── <nomor2>/
 *
 * Setiap session punya context sendiri:
 *   { sessionId, client, config, database, handlers, status }
 */

import fs from 'fs';
import path from 'path';
import makeWASocket, {
	useMultiFileAuthState,
	DisconnectReason,
	fetchLatestBaileysVersion,
	makeCacheableSignalKeyStore,
	Browsers,
} from 'baileys';
import pino from 'pino';
import { JSONDB } from '../db/json.js';
import { Boom } from '@hapi/boom';
import { HttpsProxyAgent } from 'https-proxy-agent';

const logger = pino({ level: 'silent' });
const delay = ms => new Promise(r => setTimeout(r, ms));

// Proxy (sama seperti bot utama)
let wsAgent;
try {
	const proxyUrl = process.env.HTTPS_PROXY || process.env.https_proxy;
	if (proxyUrl) wsAgent = new HttpsProxyAgent(proxyUrl);
} catch {}

// Session ID bot utama — TIDAK BOLEH dipakai/disentuh oleh clone.
const MAIN_SESSION_ID = process.env.BOT_SESSION_NAME || 'iyan';

function sessionsRoot() {
	return path.join(process.cwd(), 'sessions');
}

function sessionPath(botId) {
	return path.join(sessionsRoot(), 'clones', botId);
}

function lockPath(botId) {
	return path.join(sessionPath(botId), '.session.lock');
}

/** Logging per-session: [bot_xxxxx] */
export function sessionLog(botId, ...args) {
	console.log(`[bot_${botId}]`, ...args);
}

/**
 * Waktu boot sistem (ms epoch) dari /proc/uptime. Dipakai untuk mendeteksi
 * lock basi lintas restart VM: PID tidak bertahan melewati reboot, jadi lock
 * yang ditulis SEBELUM boot saat ini pasti basi — walau PID-nya kebetulan
 * dipakai ulang proses lain di VM baru (kasus 2026-10-16: lock lama berisi
 * PID 2007, dan wrapper bash di VM baru kebetulan dapat PID 2007 juga
 * sehingga clone gagal restore "sedang dipakai proses lain").
 */
function bootTimeMs() {
	try {
		const uptimeSec = parseFloat(fs.readFileSync('/proc/uptime', 'utf-8').split(' ')[0]);
		if (!Number.isFinite(uptimeSec) || uptimeSec < 0) return 0;
		return Date.now() - uptimeSec * 1000;
	} catch {
		return 0;
	}
}

/**
 * Apakah PID pemegang lock benar-benar proses clone-runner? Cek /proc cmdline.
 * Kalau tidak bisa dibaca (mis. permission), anggap YA (arah aman: jangan
 * rebut lock yang mungkin masih dipakai).
 */
function isCloneRunnerPid(pid) {
	try {
		const cmdline = fs.readFileSync(`/proc/${pid}/cmdline`, 'utf-8').replace(/\0/g, ' ');
		return cmdline.includes('clone-runner');
	} catch {
		return true;
	}
}

function acquireLock(botId) {
	const dir = sessionPath(botId);
	fs.mkdirSync(dir, { recursive: true });
	const lp = lockPath(botId);
	try {
		if (fs.existsSync(lp)) {
			const pid = parseInt(fs.readFileSync(lp, 'utf-8').trim(), 10);
			if (pid && pid > 0 && pid !== process.pid) {
				let held = false;
				try {
					process.kill(pid, 0); // PID masih hidup?
					held = true;
				} catch {
					// PID mati, lock basi — ambil alih
				}
				if (held) {
					// PID hidup belum tentu pemegang lock: bisa jadi PID reuse
					// setelah VM diganti. Lock basi kalau (a) ditulis sebelum
					// boot saat ini, atau (b) PID-nya bukan clone-runner.
					const boot = bootTimeMs();
					let stale = false;
					try {
						if (boot > 0 && fs.statSync(lp).mtimeMs < boot) stale = true;
					} catch {}
					if (!stale && !isCloneRunnerPid(pid)) stale = true;
					if (!stale) return false; // benar-benar masih dipakai
					// else: lock basi — ambil alih
				}
			}
		}
		fs.writeFileSync(lp, String(process.pid));
		return true;
	} catch {
		return false;
	}
}

function releaseLock(botId) {
	try {
		const lp = lockPath(botId);
		if (fs.existsSync(lp)) {
			const pid = parseInt(fs.readFileSync(lp, 'utf-8').trim(), 10);
			if (pid === process.pid) fs.unlinkSync(lp);
		}
	} catch {}
}

/**
 * Sudah pairing? `registered` saja tidak cukup: setelah pairing code dimasukkan,
 * Baileys mengisi `account` (pair-success). Tanpa cek ini, session yang BARU
 * selesai pairing bisa dianggap "teracuni" lalu dihapus saat reconnect.
 */
function isPaired(creds) {
	return !!(creds && (creds.registered || creds.account));
}

/** Cek apakah creds "teracuni": me diset (requestPairingCode) tapi pairing tidak pernah selesai. */
function isPoisoned(botId) {
	try {
		const creds = JSON.parse(fs.readFileSync(path.join(sessionPath(botId), 'creds.json'), 'utf-8'));
		return !!(creds.me && !isPaired(creds));
	} catch {
		return false;
	}
}

export class BotSessionManager {
	constructor() {
		/**
		 * Map<botId, SessionContext>
		 * SessionContext = { sessionId, client, config, database, handlers, status }
		 */
		this.sessions = new Map();
		this.shuttingDown = false;
		// Hook: dipanggil tiap status session berubah (dipakai clone-runner untuk tulis file status)
		this.onStatus = null;
	}

	setStatus(ctx, status) {
		ctx.status = status;
		try { this.onStatus?.(ctx.sessionId, status, this.snapshot(ctx)); } catch {}
	}

	snapshot(ctx) {
		return {
			handlers: ctx.handlers,
			commands: ctx.commandCount || 0,
			plugins: ctx.pluginCount || 0,
			pid: process.pid,
		};
	}

	validateBotId(botId) {
		let id = String(botId).replace(/[^0-9]/g, '');
		// Perbaikan aman dari snippet user: 08xxx -> 62xxx (format WA).
		if (id.startsWith('08')) id = '62' + id.slice(1);
		else if (id.startsWith('0')) id = '62' + id.slice(1);
		if (!id || id.length < 8 || id.length > 16) {
			throw new Error(`Bot ID tidak valid: ${botId}`);
		}
		if (id === MAIN_SESSION_ID) {
			throw new Error('Dilarang menyentuh session bot utama.');
		}
		return id;
	}

	get(botId) {
		return this.sessions.get(String(botId).replace(/[^0-9]/g, ''));
	}

	list() {
		return [...this.sessions.entries()].map(([botId, ctx]) => ({
			botId,
			status: ctx.status,
			...this.snapshot(ctx),
		}));
	}

	/**
	 * initializeBotSession — inisialisasi LENGKAP untuk satu session.
	 * Semua session yang connected/ready WAJIB melewati ini.
	 */
	async initializeBotSession(botId, opts = {}) {
		const id = this.validateBotId(botId);
		const { onCode = null, onReady = null } = opts;

		if (this.sessions.has(id)) {
			const existing = this.sessions.get(id);
			if (existing.status === 'open' || existing.status === 'ready') {
				throw new Error(`Bot ${id} sudah aktif.`);
			}
			await this.close(id);
		}

		if (isPoisoned(id)) {
			sessionLog(id, 'creds teracuni, hapus.');
			fs.rmSync(sessionPath(id), { recursive: true, force: true });
		}

		if (!acquireLock(id)) {
			throw new Error(`Session ${id} sedang dipakai proses lain.`);
		}

		// === 1. createClient ===
		sessionLog(id, 'createClient...');
		const { state, saveCreds } = await useMultiFileAuthState(sessionPath(id));
		const { version } = await fetchLatestBaileysVersion().catch(() => ({ version: [2, 3000, 1027934701] }));

		const sock = makeWASocket({
			version,
			logger,
			agent: wsAgent,
			auth: {
				creds: state.creds,
				keys: makeCacheableSignalKeyStore(state.keys, pino({ level: 'silent' })),
			},
			browser: Browsers.appropriate('Chrome'),
			syncFullHistory: true, // WAJIB true agar clone bisa lihat story/status
			markOnlineOnConnect: true, // bantu sinkronisasi presence/status
			// Perbaikan aman dari snippet user: cegah pesan nyangkut "Menunggu pesan ini" (Bad MAC).
			getMessage: async () => ({ conversation: 'Halo' }),
		});

		// === Session Context ===
		const ctx = {
			sessionId: id,
			sock,          // socket mentah (authState, end(), dll)
			client: sock,  // diganti client hasil inject di initializeClient
			config: {
				sessionPath: sessionPath(id),
				isClone: true,
			},
			database: null, // diisi saat initializeClient jika perlu
			handlers: {
				message: false,
				command: false,
				event: false,
				middleware: false,
				features: false,
			},
			status: 'connecting',
			closing: false,   // true begitu close()/destroy() dipanggil — event socket lama diabaikan
			paired: false,    // true begitu pairing berhasil / koneksi pernah open
			reconnectTimer: null,
			pairTimer: null,
			onCode,
			onReady,
		};
		this.sessions.set(id, ctx);
		this.setStatus(ctx, 'connecting');

		sock.ev.on('creds.update', saveCreds);

		// FIX: listener koneksi dipasang SEGERA dan TERIKAT ke ctx ini.
		// Sebelumnya listener memakai sessions.get(botId) -> event 'close' dari socket
		// LAMA (hasil end() saat restart) mengenai ctx BARU dan memicu restart
		// berulang tiap 10 detik, sehingga clone tidak pernah stabil.
		sock.ev.on('connection.update', update => {
			this.handleConnectionUpdate(id, ctx, update);
		});

		// === 2. initializeClient ===
		await this.initializeClient(ctx);

		// === 3-7. Register handlers (sebelum connect, agar siap saat open) ===
		await this.registerMessageHandler(ctx);
		await this.registerCommandHandler(ctx);
		await this.registerEventHandler(ctx);
		await this.registerMiddleware(ctx);
		await this.registerAllFeatures(ctx);

		// === Pairing code jika belum terdaftar ===
		// FIX (snippet user): JANGAN pakai custom code 'AAAAAAAA' — kode itu
		// bukan kode valid dari WhatsApp, jadi pairing selalu gagal.
		// Biarkan server yang generate, lalu format XXXX-XXXX.
		if (!isPaired(sock.authState.creds)) {
			await delay(8000);
			if (ctx.closing) throw new Error('Session ditutup sebelum pairing code dibuat.');
			try {
				const code = await sock.requestPairingCode(id);
				const raw = String(code || '').replace(/[^A-Za-z0-9]/g, '');
				const formatted = raw ? (raw.match(/.{1,4}/g)?.join('-') || raw) : '';
				if (!formatted) throw new Error('Server tidak mengembalikan pairing code.');
				sessionLog(id, 'pairing code diminta (server): ' + formatted);
				if (onCode) await onCode(formatted);

				// FIX: timer pembersih HANYA menghapus session yang benar-benar belum
				// pairing. Sebelumnya ia menghapus session apa pun yang statusnya
				// bukan open/ready pada detik ke-120 (termasuk clone yang baru saja
				// pairing dan sedang reconnect) -> clone hilang tanpa respon.
				ctx.pairTimer = setTimeout(() => {
					ctx.pairTimer = null;
					if (ctx.closing || this.sessions.get(id) !== ctx) return;
					if (ctx.paired || isPaired(ctx.sock.authState.creds)) return;
					if (ctx.status === 'open' || ctx.status === 'ready') return;
					sessionLog(id, 'kode tidak dimasukkan, hapus session.');
					this.destroy(id).catch(() => {});
				}, 2 * 60 * 1000);
				ctx.pairTimer.unref?.();
			} catch (err) {
				await this.destroy(id).catch(() => {});
				throw new Error('Gagal minta pairing code: ' + (err?.message || 'error'));
			}
		} else if (onCode) {
			await onCode(null);
		}

		// === 8b. anti-dualbot: cek tiap kali clone masuk grup baru ===
		sock.ev.on('group-participants.update', async (upd) => {
			try {
				if (ctx.closing) return;
				const meNum = String(sock.user?.id || '').split('@')[0].split(':')[0].replace(/[^0-9]/g, '');
				const norm = j => String(j || '').split('@')[0].split(':')[0].replace(/[^0-9]/g, '');
				if (upd.action === 'add' && (upd.participants || []).some(p => norm(p) === meNum)) {
					await this.checkAntiDualBot(sock, id, upd.id);
				}
			} catch {}
		});

		return ctx;
	}

	/** initializeClient: inject helpers ke socket (sama seperti bot utama). */
	async initializeClient(ctx) {
		const { injectClient } = await import('./inject.js');
		const cacheMsg = new Map();
		const contacts = { read: () => null, write: () => {}, find: () => null };
		const groups = { read: () => null, write: () => {}, find: () => null };
		// Settings in-memory (privacy diisi saat koneksi open) supaya auto-read status
		// memakai pengaturan read-receipt akun clone, bukan selalu 'read-self'.
		const settingsStore = new Map();
		const settings = {
			read: k => settingsStore.get(k) ?? {},
			write: (k, v) => { settingsStore.set(k, v); },
		};
		const client = injectClient(ctx.client, cacheMsg, contacts, groups, settings);
		// FIX: bot utama punya hisoka.statusLog (dedup react/forward status + ringkasan harian);
		// clone tidak punya -> dedup mati. Simpan per-session.
		try { client.statusLog = new JSONDB('statuslog', sessionPath(ctx.sessionId)); } catch {}
		client._isClone = true;
		client._cloneNumber = ctx.sessionId;
		client._sessionId = ctx.sessionId;
		ctx.client = client;
		ctx.database = { contacts, groups, settings, cacheMsg };
		sessionLog(ctx.sessionId, 'initializeClient OK');
	}

	/** registerMessageHandler: pasang listener messages.upsert dengan logging. */
	async registerMessageHandler(ctx) {
		const id = ctx.sessionId;
		const { default: handleMessage } = await import('../handler/message.js');

		// Alias command Bahasa Indonesia (simpel, untuk orang awam)
		// Clone pakai command yang beda dari bot utama biar nggak aneh
		const CLONE_ALIASES = {
			'bantuan': 'menu',
			'help': 'menu',
			'unduh': 'tt',
			'download': 'tt',
			'tiktok': 'tt',
			'stiker': 's',
			'sticker': 's',
			'lagu': 'play',
			'musik': 'play',
			'putar': 'play',
			// Ubah react text (ganti .swreacttext / .ubahreact)
			'gantireact': 'ubahreact',
			'ubahreaksi': 'ubahreact',
			'reaksi': 'ubahreact',
		};

		ctx.client.ev.on('messages.upsert', async upsert => {
			// Abaikan event dari session yang sudah ditutup / digantikan socket baru.
			if (ctx.closing || this.sessions.get(id) !== ctx) return;
			if (process.env.CLONE_DEBUG) {
				sessionLog(id, `UPSERT type=${upsert.type} jumlah=${(upsert.messages || []).length}`);
			}
			for (const WAMessage of upsert.messages || []) {
				try {
					// KUNCI ANTI-LOOP JADIBOT (adaptasi snippet user, versi aman):
					// Abaikan pesan sistem Baileys dari bot sendiri (ID BAE5/3EB0 + fromMe).
					// TIDAK memfilter fromMe non-prefix secara umum — owner clone kirim
					// perintah/adwong/play 1-2 dari HP-nya juga via fromMe, jadi harus tetap lewat.
					// Catatan: di Baileys v7 ini, fromMe asli ber-ID AC..., jadi filter
					// BAE5/3EB0 saat ini no-op tapi aman untuk jaga-jaga format ID berubah.
					const _mid = WAMessage.key?.id || '';
					if (WAMessage.key?.fromMe && (_mid.startsWith('BAE5') || _mid.startsWith('3EB0'))) continue;
					let text = WAMessage.message?.conversation
						|| WAMessage.message?.extendedTextMessage?.text
						|| '';

					// Terjemahkan alias clone -> command asli
					const prefix = text.startsWith('.') ? '.' : text.startsWith('/') ? '/' : '';
					if (prefix) {
						const parts = text.slice(1).split(' ');
						const aliasCmd = parts[0].toLowerCase();
						if (CLONE_ALIASES[aliasCmd]) {
							const realCmd = CLONE_ALIASES[aliasCmd];
							text = prefix + realCmd + (parts.length > 1 ? ' ' + parts.slice(1).join(' ') : '');
							// Tulis ulang teks pesan agar handler memproses command asli
							if (WAMessage.message?.conversation) {
								WAMessage.message.conversation = text;
							} else if (WAMessage.message?.extendedTextMessage?.text) {
								WAMessage.message.extendedTextMessage.text = text;
							}
							sessionLog(id, `ALIAS: ${prefix}${aliasCmd} -> ${prefix}${realCmd}`);
						}
					}

					const cmd = text.startsWith('.') || text.startsWith('/')
						? text.slice(1).split(' ')[0].toLowerCase()
						: '';

					if (cmd) {
						const from = WAMessage.key.remoteJid || '?';
						sessionLog(id, 'MESSAGE RECEIVED');
						sessionLog(id, 'FROM:', from);
						sessionLog(id, 'COMMAND:', text.split(' ')[0]);
					}

					await handleMessage({ message: WAMessage, type: upsert.type }, ctx.client);

					if (cmd) {
						sessionLog(id, 'HANDLER SELESAI:', cmd);
					}
				} catch (err) {
					sessionLog(id, 'ERROR:', err?.message);
				}
			}
		});

		ctx.handlers.message = true;
		sessionLog(id, 'registerMessageHandler OK');
	}

	/** registerCommandHandler: pastikan plugin map tersedia untuk session ini. */
	async registerCommandHandler(ctx) {
		const id = ctx.sessionId;
		const { loadPlugins } = await import('../plugins/_loader.js');
		const pluginsDir = path.join(process.cwd(), 'src', 'plugins');
		const { map, list } = await loadPlugins(pluginsDir);
		ctx.commandMap = map;
		ctx.commandCount = map.size;
		ctx.pluginCount = list.length;
		ctx.client.loadedCommands = [...map.keys()];
		ctx.handlers.command = true;
		sessionLog(id, `registerCommandHandler OK (${map.size} commands, ${list.length} plugins)`);
	}

	/** registerEventHandler: event listener untuk status, dll. */
	async registerEventHandler(ctx) {
		const id = ctx.sessionId;
		// Event handler utama sudah di handler/event.js (dipanggil dari message handler)
		// Di sini daftarkan listener tambahan jika perlu
		ctx.handlers.event = true;
		sessionLog(id, 'registerEventHandler OK');
	}

	/** registerMiddleware: anti-spam, rate limit, dll per session. */
	async registerMiddleware(ctx) {
		const id = ctx.sessionId;
		ctx.middleware = {
			rateLimit: new Map(), // per-sender rate limit
		};
		ctx.handlers.middleware = true;
		sessionLog(id, 'registerMiddleware OK');
	}

	/** registerAllFeatures: muat SEMUA fitur (sama seperti bot utama). */
	async registerAllFeatures(ctx) {
		const id = ctx.sessionId;
		// Fitur dimuat via plugin system yang sama — otomatis dapat semua
		// termasuk fitur baru yang ditambahkan ke bot utama
		ctx.handlers.features = true;
		sessionLog(id, `registerAllFeatures OK (${ctx.pluginCount || 0} plugins)`);
	}

	/** Mark session sebagai ready setelah connect. */
	async markReady(ctx) {
		this.setStatus(ctx, 'ready');
		sessionLog(ctx.sessionId, 'READY — semua handler aktif');
		sessionLog(ctx.sessionId,
			`message:${ctx.handlers.message ? 'ON' : 'OFF'}`,
			`command:${ctx.handlers.command ? 'ON' : 'OFF'}`,
			`event:${ctx.handlers.event ? 'ON' : 'OFF'}`,
			`middleware:${ctx.handlers.middleware ? 'ON' : 'OFF'}`,
			`features:${ctx.handlers.features ? 'ON' : 'OFF'}`,
		);
		if (ctx.onReady) await ctx.onReady(ctx);
	}

	/** Backward compat: create() -> initializeBotSession() */
	async create(botId, onCode) {
		return this.initializeBotSession(botId, { onCode });
	}

	async load(botId) {
		const id = this.validateBotId(botId);
		if (this.sessions.has(id)) return this.sessions.get(id);
		const credsPath = path.join(sessionPath(id), 'creds.json');
		if (!fs.existsSync(credsPath)) throw new Error(`Session ${id} tidak ditemukan.`);
		const creds = JSON.parse(fs.readFileSync(credsPath, 'utf-8'));
		if (!isPaired(creds)) throw new Error(`Session ${id} belum selesai pairing.`);
		return this.initializeBotSession(id, {});
	}

	/**
	 * close(botId) — tutup socket clone TANPA menghapus folder session.
	 * Dipakai saat restart/shutdown agar clone bisa di-restore dari creds yang tersimpan.
	 */
	async close(botId) {
		const id = String(botId).replace(/[^0-9]/g, '');
		const ctx = this.sessions.get(id);
		if (ctx) {
			// FIX: tandai closing SEBELUM end() supaya event 'close' yang dipicu end()
			// tidak menjadwalkan reconnect baru / destroy (lihat handleConnectionUpdate).
			ctx.closing = true;
			if (ctx.reconnectTimer) clearTimeout(ctx.reconnectTimer);
			if (ctx.pairTimer) clearTimeout(ctx.pairTimer);
			ctx.reconnectTimer = null;
			ctx.pairTimer = null;
			try { (ctx.sock || ctx.client).end(undefined); } catch {}
			releaseLock(id);
			if (this.sessions.get(id) === ctx) this.sessions.delete(id);
			sessionLog(id, 'session ditutup (folder dipertahankan)');
		}
		return true;
	}

	/**
	 * destroy(botId) — hapus TOTAL: tutup socket + hapus permanen folder session.
	 * Hanya untuk: .jadibot stop eksplisit, auto-cleanup pairing 2 menit yang tak dimasukkan,
	 * dan session teracuni. JANGAN dipakai untuk restart/shutdown rutin.
	 */
	async destroy(botId) {
		const id = String(botId).replace(/[^0-9]/g, '');
		await this.close(id);
		const sp = sessionPath(id);
		const mainPath = path.join(sessionsRoot(), MAIN_SESSION_ID);
		if (sp === mainPath || mainPath.startsWith(sp)) {
			throw new Error('Dilarang menghapus session bot utama.');
		}
		try { fs.rmSync(sp, { recursive: true, force: true }); } catch {}
		// FIX pile-up: hapus juga file .status agar tidak jadi phantom clone.
		try { fs.unlinkSync(path.join(sessionsRoot(), 'clones', '.status', `${id}.json`)); } catch {}
		sessionLog(id, 'session dihancurkan');
		return true;
	}

	async restart(botId) {
		const id = this.validateBotId(botId);
		const ctx = this.sessions.get(id);
		const onCode = ctx?.onCode || null;
		const onReady = ctx?.onReady || null;
		if (ctx) {
			sessionLog(id, 'restart...');
			await this.close(id);
		}
		// Re-initialize PENUH (semua handler didaftarkan ulang)
		return this.initializeBotSession(id, { onCode, onReady });
	}

	status(botId) {
		if (botId) {
			const ctx = this.get(botId);
			return ctx ? {
				botId: String(botId),
				status: ctx.status,
				handlers: ctx.handlers,
				commands: ctx.commandCount || 0,
				plugins: ctx.pluginCount || 0,
			} : null;
		}
		return this.list();
	}

	/**
	 * Anti-dualbot: kalau clone ternyata satu grup sama bot utama,
	 * clone keluar sendiri dari grup itu (hindari balasan dobel).
	 * Nomor bot utama dibaca dari BOT_NUMBER_OWNER di .env.
	 */
	async checkAntiDualBot(sock, botId, onlyGroup = null) {
		const ownerNum = (process.env.BOT_NUMBER_OWNER || '').replace(/[^0-9]/g, '');
		if (!ownerNum) return;
		const norm = j => String(j || '').split('@')[0].split(':')[0].replace(/[^0-9]/g, '');
		try {
			const checkOne = async (gid) => {
				let meta = null;
				try { meta = await sock.groupMetadata(gid); } catch { return; }
				if (!meta) return;
				const clash = (meta.participants || []).some(p => norm(p.id) === ownerNum);
				if (clash) {
					sessionLog(botId, `anti-dualbot: keluar dari grup ${gid} (bot utama ada di sana)`);
					try { await sock.groupLeave(gid); } catch {}
				}
			};
			if (onlyGroup) {
				await checkOne(onlyGroup);
				return;
			}
			let groups = {};
			try { groups = await sock.groupFetchAllParticipating(); } catch { return; }
			for (const gid of Object.keys(groups)) {
				const clash = ((groups[gid] || {}).participants || []).some(p => norm(p.id) === ownerNum);
				if (clash) {
					sessionLog(botId, `anti-dualbot: keluar dari grup ${gid} (bot utama ada di sana)`);
					try { await sock.groupLeave(gid); } catch {}
				}
			}
		} catch (err) {
			sessionLog(botId, 'anti-dualbot error:', err?.message);
		}
	}

	handleConnectionUpdate(botId, ctx, update = {}) {
		const { connection, lastDisconnect, isNewLogin } = update;

		// Abaikan event dari socket lama / session yang sedang ditutup.
		if (ctx.closing || this.sessions.get(botId) !== ctx) return;

		if (isNewLogin) {
			ctx.paired = true;
			sessionLog(botId, 'pairing berhasil, menunggu WhatsApp me-restart koneksi...');
		}

		if (connection === 'open') {
			ctx.paired = true;
			if (ctx.pairTimer) { clearTimeout(ctx.pairTimer); ctx.pairTimer = null; }
			if (ctx.reconnectTimer) { clearTimeout(ctx.reconnectTimer); ctx.reconnectTimer = null; }
			this.setStatus(ctx, 'open');
			sessionLog(botId, 'terhubung!');
			// Mark ready — semua handler sudah didaftarkan saat initialize
			this.markReady(ctx).catch(err => sessionLog(botId, 'markReady error:', err?.message));
			// Anti-dualbot: cek semua grup saat konek
			this.checkAntiDualBot(ctx.sock, botId).catch(() => {});
			// Ambil privacy (read receipts) akun clone untuk auto-read status
			ctx.sock.fetchPrivacySettings?.()
				.then(p => ctx.database?.settings.write('privacy', p))
				.catch(() => {});
		}

		if (connection === 'close') {
			const reason = new Boom(lastDisconnect?.error)?.output?.statusCode;
			this.setStatus(ctx, 'close');
			sessionLog(botId, `koneksi putus (kode ${reason ?? '?'})`);

			// Logout / auth gagal: hapus session.
			// (shuttingDown TIDAK lagi menghapus session — shutdown hanya menutup socket.)
			if (this.shuttingDown) return;
			if (reason === DisconnectReason.loggedOut || reason === 401) {
				sessionLog(botId, reason === 401 ? 'auth gagal (401), hapus session.' : 'logout, hapus session.');
				this.destroy(botId).catch(() => {});
				return;
			}

			// Sesi dipakai di tempat lain (mis. ada runner ganda). Reconnect hanya
			// membuat dua proses saling tendang tanpa henti -> berhenti, folder dipertahankan.
			if (reason === DisconnectReason.connectionReplaced) {
				sessionLog(botId, 'sesi digantikan koneksi lain (cek apakah ada clone-runner ganda). Tidak reconnect.');
				this.setStatus(ctx, 'replaced');
				return;
			}

			// Putus sebelum pairing selesai: jangan reconnect (menunggu kode dimasukkan;
			// timer pembersih yang menghapus kalau memang tidak pernah dimasukkan).
			if (!ctx.paired && !isPaired(ctx.sock.authState.creds)) {
				sessionLog(botId, 'putus sebelum pairing selesai, tidak reconnect.');
				return;
			}

			// restartRequired (515) = normal setelah pairing -> reconnect cepat.
			const wait = reason === DisconnectReason.restartRequired ? 1000 : 10000;
			if (ctx.reconnectTimer) clearTimeout(ctx.reconnectTimer);
			ctx.reconnectTimer = setTimeout(() => {
				ctx.reconnectTimer = null;
				if (ctx.closing || this.sessions.get(botId) !== ctx || this.shuttingDown) return;
				sessionLog(botId, 'reconnect...');
				// Restart = re-initialize PENUH termasuk semua handler
				this.restart(botId).catch(err =>
					sessionLog(botId, 'reconnect gagal:', err?.message)
				);
			}, wait);
			ctx.reconnectTimer.unref?.();
		}
	}

	async restoreAll(onReady) {
		const clonesDir = path.join(sessionsRoot(), 'clones');
		let dirs = [];
		try {
			dirs = fs.readdirSync(clonesDir).filter(d => {
				const p = path.join(clonesDir, d);
				return fs.statSync(p).isDirectory() && fs.existsSync(path.join(p, 'creds.json'));
			});
		} catch { return []; }
		const restored = [];
		for (const id of dirs) {
			try {
				const creds = JSON.parse(fs.readFileSync(path.join(clonesDir, id, 'creds.json'), 'utf-8'));
				if (!isPaired(creds)) {
					sessionLog(id, 'lewati (belum selesai pairing)');
					continue;
				}
				await this.initializeBotSession(id, { onReady });
				restored.push(id);
			} catch (err) {
				sessionLog(id, 'restore gagal:', err?.message);
			}
		}
		return restored;
	}

	async shutdown() {
		this.shuttingDown = true;
		for (const [id] of this.sessions) {
			await this.close(id).catch(() => {});
		}
		console.log('[session-manager] semua session clone ditutup (folder dipertahankan).');
	}
}

export const sessionManager = new BotSessionManager();
