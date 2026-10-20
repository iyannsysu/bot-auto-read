'use strict';

// Pesan list interaktif WhatsApp (bisa di-tap seperti Telegram).
// Row ID format: "<aksi>_<param1>_<param2>..." — diurai di handleListTap.

/**
 * Kirim list yang bisa di-tap.
 * @param {object} hisoka - koneksi Baileys
 * @param {string} jid - tujuan
 * @param {object} opt - { title, text, buttonText, sections: [{title, rows: [{title, rowId, description}]}], footer }
 * @param {object} quoted - pesan yang di-quote (opsional)
 */
export async function sendList(hisoka, jid, opt, quoted) {
	const sections = (opt.sections || []).map(s => ({
		title: s.title || '',
		rows: (s.rows || []).slice(0, 20).map(r => ({
			title: String(r.title).slice(0, 60),
			rowId: String(r.rowId).slice(0, 200),
			description: String(r.description || '').slice(0, 80),
		})),
	}));
	return hisoka.sendMessage(
		jid,
		{
			text: opt.text || '',
			footer: opt.footer || '🤖 adawong',
			title: opt.title || '',
			buttonText: opt.buttonText || 'Pilih',
			sections,
		},
		quoted ? { quoted } : {}
	);
}

/** Ambil rowId dari pesan tap list, atau null. */
export function getListTap(m) {
	try {
		const sel = m.message?.listResponseMessage?.singleSelectReply;
		if (sel && sel.selectedRowId) return sel.selectedRowId;
		// fallback: beberapa framework menaruh di tombol lain
		const btn = m.message?.buttonsResponseMessage?.selectedButtonId;
		if (btn) return btn;
	} catch {}
	return null;
}
