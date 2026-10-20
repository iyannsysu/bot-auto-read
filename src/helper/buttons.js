'use strict';

// Penyimpanan sementara untuk pilihan tombol interaktif.
// buttonId -> { type, data, expires }
// Dibersihkan otomatis setelah 2 menit (seperti di screenshot).

const pending = new Map();

const EXPIRY_MS = 2 * 60 * 1000;

export function saveButtonChoice(buttonId, payload) {
	pending.set(buttonId, { ...payload, expires: Date.now() + EXPIRY_MS });
	// Bersihkan yang kedaluwarsa
	for (const [id, v] of pending) {
		if (v.expires < Date.now()) pending.delete(id);
	}
}

export function getButtonChoice(buttonId) {
	const v = pending.get(buttonId);
	if (!v) return null;
	if (v.expires < Date.now()) {
		pending.delete(buttonId);
		return null;
	}
	pending.delete(buttonId); // sekali pakai
	return v;
}

// Bersihkan periodik
setInterval(() => {
	const now = Date.now();
	for (const [id, v] of pending) {
		if (v.expires < now) pending.delete(id);
	}
}, 60 * 1000).unref?.();
