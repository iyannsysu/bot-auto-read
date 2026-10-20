# Plugin System — readsw-plugin

Semua command bot dimigrasi dari `switch` raksasa di `src/handler/message.js`
menjadi **plugin terpisah** di `src/plugins/`. Satu file = satu command (grup).

## Struktur

```
src/plugins/
├── _shared.js      # Barrel: re-export semua helper + state + fungsi bersama
├── _loader.js      # Loader: scan, validasi, bangun map command -> plugin
├── menu.js         # contoh plugin
├── play.js
└── ... (66 plugin, 135 command)
```

## Format plugin

```js
'use strict';
// Auto-generated dari message.js — command: play
// Kategori: DOWNLOADER

import * as shared from './_shared.js';

const {
    // ... destructure semua yang dibutuhkan dari shared ...
} = shared;

export default {
    name: 'play',          // nama utama
    aliases: [],           // alias lain, mis. ['p']
    category: 'DOWNLOADER',// kategori menu
    desc: '',              // deskripsi (opsional)
    async run(ctx) {
        const { hisoka, m, query, text, quoted, message, messagesType } = ctx;
        // ... isi command ...
    },
};
```

## Cara kerja

1. **Startup**: `src/handler/message.js` memuat semua plugin sekali via
   `loadPlugins()` (top-level await). Hasil: `pluginMap` (command -> plugin).
2. **Dispatch**: saat pesan masuk, `pluginMap.get(m.command)` dicari.
   Kalau ketemu, `plugin.run(ctx)` dipanggil dengan context:
   `{ hisoka, m, query, text, quoted, message, messagesType }`.
3. **Shared**: semua import/helper/state yang dulu ada di `message.js`
   (fs, path, downloadYouTubeAudio, cache Map, dsb.) tersedia lewat
   `import * as shared from './_shared.js'`.

## Tambah command baru

1. Buat file `src/plugins/namacommand.js` ikut format di atas.
2. Restart bot — plugin ter-load otomatis, tanpa edit file lain.

## Catatan migrasi

- `break;` sebagai early-exit di dalam `case` diubah menjadi `return;`
  (kecuali `break` di dalam loop/`switch` nested yang dipertahankan).
- File-file `_*.js` diabaikan loader.
- `src/handler/message.js.bak` = versi lama (switch) sebagai cadangan.
