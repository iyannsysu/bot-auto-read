'use strict';

// Animasi loading "CORE STATUS": kirim 1 pesan lalu edit berulang dengan
// panel status bergaya terminal (di-render monospace biar rapi).
//
// Pakai: const load = await startLoading(hisoka, m, 'Download');
//        ... kerja berat ...
//        await load.update('Mengirim file...'); // opsional: ganti label di tengah jalan
//        await load.done('✅ Selesai!');        // atau load.fail('❌ Gagal')

const W = 31; // lebar total tiap baris box
const TOP = '╭' + '─'.repeat(5) + '〔 𖤍 CORE STATUS 𖤍 〕' + '─'.repeat(5) + '╮';
const BOTTOM = '╰' + '─'.repeat(W - 2) + '╯';
const EMPTY = '│' + ' '.repeat(W - 2) + '│';

// Urutan status tiap baris per frame — dibaca kayak sistem lagi mikir.
const SEQ = {
	SYSTEM: ['AWAKENED'],
	ENGINE: ['EXECUTING', 'LOADING', 'PROCESSING', 'RENDERING'],
	DATA: ['ANALYZING', 'FETCHING', 'PARSING', 'SYNCING'],
	REQUEST: ['IN PROGRESS', 'QUEUED', 'DISPATCHED', 'ACTIVE'],
	RESPONSE: ['MATERIALIZING', 'COMPILING', 'FINALIZING', 'READY'],
};
const ORDER = ['SYSTEM', 'ENGINE', 'DATA', 'REQUEST', 'RESPONSE'];

function row(label, value) {
	return '│  ◈ ' + String(label).padEnd(8) + ': ' + String(value).padEnd(14) + ' │';
}

function box(values) {
	const lines = [TOP, EMPTY];
	for (const k of ORDER) lines.push(row(k, values[k]));
	lines.push(EMPTY, BOTTOM);
	return '```\n' + lines.join('\n') + '\n```';
}

function frame(i) {
	const v = {};
	for (const k of ORDER) {
		const arr = SEQ[k];
		v[k] = arr[i % arr.length];
	}
	return box(v);
}

const FRAMES = Array.from({ length: 8 }, (_, i) => frame(i));
const DONE_BOX = box({
	SYSTEM: 'AWAKENED',
	ENGINE: 'STANDBY',
	DATA: 'SYNCED',
	REQUEST: 'COMPLETE',
	RESPONSE: 'DELIVERED',
});

const INTERVAL_MS = 800;
const MAX_MS = 120000; // pengaman: berhenti otomatis setelah 2 menit

export async function startLoading(hisoka, m, label = 'Loading') {
	let sent = null;
	try {
		sent = await m.reply(`⏳ *${label}...*\n${FRAMES[0]}`);
	} catch {
		return nullLoader();
	}
	const key = sent?.key;
	if (!key) return nullLoader();
	let i = 0;
	let curLabel = label;
	const started = Date.now();
	const render = async () => {
		await hisoka.sendMessage(m.from, { text: `⏳ *${curLabel}...*\n${FRAMES[i]}`, edit: key });
	};
	const timer = setInterval(async () => {
		try {
			if (Date.now() - started > MAX_MS) { clearInterval(timer); return; }
			i = (i + 1) % FRAMES.length;
			await render();
		} catch {
			clearInterval(timer);
		}
	}, INTERVAL_MS);

	const finish = async (finalText, del = false) => {
		clearInterval(timer);
		try {
			if (del) {
				await hisoka.sendMessage(m.from, { delete: key });
			} else if (finalText) {
				// Tampilkan panel "selesai" sekilas biar puas, baru ganti ke hasil akhir
				try {
					await hisoka.sendMessage(m.from, { text: `✅ *${curLabel} selesai!*\n${DONE_BOX}`, edit: key });
					await new Promise(r => setTimeout(r, 600));
				} catch {}
				await hisoka.sendMessage(m.from, { text: finalText, edit: key });
			}
		} catch { /* abaikan */ }
	};
	return {
		done: (t) => finish(t || `✅ *${curLabel} selesai!*`),
		fail: (t) => finish(t || `❌ *${curLabel} gagal.*`),
		stop: () => finish(null, true), // hapus pesan loading
		update: async (newLabel) => {   // ganti label tanpa reset pesan
			curLabel = newLabel || curLabel;
			i = 0;
			try { await render(); } catch {}
		},
	};
}

function nullLoader() {
	const noop = async () => {};
	return { done: noop, fail: noop, stop: noop, update: noop };
}
