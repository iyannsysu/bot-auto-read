import { toCapitalize } from './text.js';

/**
 *
 * @param {string} chatId
 * @param {Buffer | string} media
 * @param {Object} options
 * @param {string} options.parse_mode
 * @param {string} options.caption
 * @param {'text' | 'photo' | 'video' | 'audio' | 'document' | 'sticker' | 'voice'} options.type
 * @returns {Promise<Response>}
 */
export async function send(chatId, media = '', options = {}) {
	const type = (options.type || 'text').replace('image', 'photo').replace('audio', 'voice');

	const DEFAULT_EXTENSIONS = {
		audio: ['audio/mp3', 'mp3'],
		photo: ['image/jpeg', 'jpg'],
		sticker: ['image/webp', 'webp'],
		video: ['video/mp4', 'mp4'],
		document: ['application/pdf', 'pdf'],
		voice: ['audio/ogg', 'ogg'],
		text: ['text/plain', 'txt'],
	};

	const ext = DEFAULT_EXTENSIONS[type];
	if (!ext) {
		throw new Error(`Unsupported media type for Telegram upload: ${options.type}`);
	}

	const url = `https://api.telegram.org/bot${process.env.TELEGRAM_TOKEN}/send${
		type === 'text' ? 'Message' : toCapitalize(type)
	}`;
	const form = new FormData();

	form.append('chat_id', chatId);
	if (options.parse_mode) form.append('parse_mode', options.parse_mode);
	if (type === 'text') form.append(type, media || options.caption);
	else {
		if (Buffer.isBuffer(media)) {
			form.append(type, new Blob([media], { type: ext[0] }), `file.${ext[1]}`);
		} else {
			throw new Error('Invalid media input: must be a Buffer or a valid file path');
		}

		if (options.caption) form.append('caption', options.caption);
	}

	// NOTE: jangan set header Content-Type secara manual untuk FormData,
	// fetch akan menambahkannya otomatis beserta boundary-nya.
	const res = await fetch(url, {
		method: 'POST',
		body: form,
		headers: {
			Accept: 'application/json',
		},
	});

	const data = await res.json();

	return data;
}
