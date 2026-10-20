'use strict';
// Command: update — cek / pasang update script dari GitHub (khusus owner).
//
//   .update            -> cek apakah ada versi baru
//   .update now        -> unduh, validasi, pasang, lalu restart otomatis
//   .update force      -> pasang ulang versi terbaru walau sudah sama
//   .update status     -> konfigurasi & versi terpasang
//   .update auto on|off-> hidupkan / matikan pengecekan berkala
//   .update rollback   -> kembalikan ke versi sebelum update terakhir
//
// Konfigurasi di .env: UPDATE_REPO=pemilik/repo (wajib), UPDATE_BRANCH, GITHUB_TOKEN.

import {
	UpdateError,
	getConfig,
	readState,
	patchState,
	isAutoEnabled,
	checkForUpdate,
	applyUpdate,
	rollbackLastUpdate,
	scheduleRestart,
	isSupervised,
	shortSha,
	localVersion,
} from '../helper/updater.js';

const ago = ts => {
	if (!ts) return '-';
	const s = Math.floor((Date.now() - ts) / 1000);
	if (s < 60) return 'baru saja';
	if (s < 3600) return `${Math.floor(s / 60)} menit lalu`;
	if (s < 86400) return `${Math.floor(s / 3600)} jam lalu`;
	return `${Math.floor(s / 86400)} hari lalu`;
};

const fail = e => (e instanceof UpdateError ? `⚠️ ${e.message}` : `❌ Update gagal: ${e?.message || e}`);

function statusText() {
	const cfg = getConfig();
	const st = readState();
	return (
		`╭─❏ *STATUS UPDATE*\n` +
		`│ 📦 Versi paket : ${localVersion()}\n` +
		`│ 🔖 Commit      : ${shortSha(st.sha)}\n` +
		`│ 🌐 Sumber      : ${cfg.repo ? `${cfg.repo}@${cfg.branch}` : '_belum diset (UPDATE_REPO)_'}\n` +
		`│ 🔄 Auto update : ${isAutoEnabled(cfg, st) ? `ON (tiap ${cfg.intervalMin} menit)` : 'OFF'}\n` +
		`│ 🕒 Terakhir    : ${ago(st.updatedAt)}\n` +
		`│ ♻️ Restart     : ${isSupervised() ? 'otomatis (run.sh)' : 'manual (tidak lewat run.sh)'}\n` +
		(st.lastError ? `│ ⚠️ Error akhir : ${st.lastError.slice(0, 120)}\n` : '') +
		`╰──────────────`
	);
}

export default {
	name: 'update',
	aliases: ['upgrade', 'cekupdate', 'gitpull'],
	category: 'OWNER & SISTEM',
	desc: 'Cek & pasang update dari GitHub. .update | .update now | .update status | .update rollback',
	async run(ctx) {
		const { m, query } = ctx;
		if (!m.isOwner) return;

		const sub = String(query || '').trim().toLowerCase().split(/\s+/)[0] || 'cek';

		try {
			// ── status ──
			if (sub === 'status' || sub === 'info') {
				await m.reply(statusText());
				return;
			}

			// ── auto on/off ──
			if (sub === 'auto') {
				const val = String(query || '').trim().toLowerCase().split(/\s+/)[1];
				if (val !== 'on' && val !== 'off') {
					await m.reply(`Auto update saat ini: *${isAutoEnabled() ? 'ON' : 'OFF'}*\nGanti: .update auto on | .update auto off`);
					return;
				}
				if (!getConfig().repo) {
					await m.reply('⚠️ Isi dulu UPDATE_REPO di .env (format pemilik/repo), lalu restart bot.');
					return;
				}
				patchState({ auto: val === 'on' });
				await m.reply(`✅ Auto update *${val.toUpperCase()}*.`);
				return;
			}

			// ── rollback ──
			if (sub === 'rollback' || sub === 'undo') {
				const r = rollbackLastUpdate();
				await m.reply(
					`↩️ Rollback selesai (${r.files} file dikembalikan ke \`${shortSha(r.to)}\`).\n` +
						`Versi \`${shortSha(r.from)}\` tidak akan dipasang otomatis lagi.` +
						(scheduleRestart({ maxWaitMs: 2 * 60 * 1000 }).scheduled ? '\n♻️ Bot restart sebentar lagi...' : '\n⚠️ Restart manual agar versi lama aktif.')
				);
				return;
			}

			// ── cek ──
			if (sub === 'cek' || sub === 'check') {
				const r = await checkForUpdate();
				if (r.status === 'up-to-date') {
					await m.reply(`✅ Sudah versi terbaru (\`${shortSha(r.local)}\`).`);
				} else if (r.status === 'update-available') {
					await m.reply(`🆕 Ada versi baru!\nTerpasang : \`${shortSha(r.local)}\`\nTerbaru   : \`${shortSha(r.remote)}\`\n\nKetik *.update now* untuk memasang.`);
				} else {
					await m.reply(
						`ℹ️ Belum ada versi acuan.\nVersi terbaru di repo: \`${shortSha(r.remote)}\`\n\n` +
							`• Auto update akan menetapkan acuan otomatis (tanpa mengubah file).\n` +
							`• Atau ketik *.update now* untuk langsung memasang versi repo (menimpa file kode lokal; backup dibuat otomatis).`
					);
				}
				return;
			}

			// ── pasang ──
			if (sub === 'now' || sub === 'go' || sub === 'force') {
				await m.reply('⏳ Mengunduh & memeriksa update...');
				const r = await applyUpdate({ force: sub === 'force', notifyJid: m.from });
				if (r.status === 'up-to-date') {
					await m.reply(`✅ Sudah versi terbaru (\`${shortSha(r.to)}\`). Pakai *.update force* kalau mau pasang ulang.`);
					return;
				}
				if (r.status === 'no-changes') {
					await m.reply(`✅ Isi file sudah sama dengan repo (\`${shortSha(r.to)}\`), tidak ada yang diubah.`);
					return;
				}
				const list = r.changed.slice(0, 8).map(f => `• ${f}`).join('\n');
				const more = r.changed.length > 8 ? `\n… +${r.changed.length - 8} file lain` : '';
				const rs = scheduleRestart({ maxWaitMs: 2 * 60 * 1000 });
				await m.reply(
					`✅ *Update berhasil*\n\`${shortSha(r.from)}\` → \`${shortSha(r.to)}\`\n` +
						`${r.changed.length} file diperbarui${r.removed.length ? `, ${r.removed.length} dihapus` : ''}${r.npm ? ', dependensi di-install' : ''}\n\n${list}${more}\n\n` +
						(rs.scheduled
							? '♻️ Bot restart beberapa detik lagi untuk memakai versi baru.'
							: '⚠️ Bot tidak dijalankan lewat run.sh — restart manual agar versi baru aktif.')
				);
				return;
			}

			await m.reply(
				'*Perintah update*\n' +
					'• .update — cek versi baru\n' +
					'• .update now — pasang update\n' +
					'• .update force — pasang ulang paksa\n' +
					'• .update status — info & konfigurasi\n' +
					'• .update auto on/off — cek berkala\n' +
					'• .update rollback — batalkan update terakhir'
			);
		} catch (e) {
			console.error('\x1b[31m[update] error:\x1b[39m', e?.message || e);
			await m.reply(fail(e));
		}
	},
};
