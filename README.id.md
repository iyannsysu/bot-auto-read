<p align="center">
  <img src="assets/adawong-logo.webp" alt="Logo readsw" width="180">
</p>

<h1 align="center">readsw</h1>

<p align="center">
  <strong>Self-Bot WhatsApp — Otomatisasi Status, Pengunduh Media, dan Penjalan Multi-Klon</strong>
</p>

<p align="center">
  Node.js &nbsp;|&nbsp; Baileys &nbsp;|&nbsp; Arsitektur Plugin &nbsp;|&nbsp; Akses Khusus Owner
</p>

<p align="center">
  <a href="README.md">English (US)</a> &nbsp;|&nbsp; <strong>Bahasa Indonesia</strong> &nbsp;|&nbsp; <a href="README.ja.md">日本語</a> &nbsp;|&nbsp; <a href="README.zh.md">中文</a> &nbsp;|&nbsp; <a href="README.ru.md">Русский</a>
</p>

---

## Ringkasan

**readsw** adalah self-bot WhatsApp pribadi yang dibangun dengan Node.js dan library Baileys.
Bot ini berjalan sebagai asisten khusus satu owner dengan tiga fokus utama: otomatisasi penuh
Status (story) WhatsApp, pengunduhan media berkualitas tinggi, dan penjalan multi-klon yang
memungkinkan beberapa nomor tambahan beroperasi dari basis kode yang sama.

Bot ini memakai sistem plugin modular — setiap fitur adalah file plugin mandiri yang dimuat
otomatis saat bot dimulai. Versi saat ini berisi **69 plugin dan 156 perintah**.

## Fitur Utama

### Otomatisasi Status (Story)
- Baca status masuk secara otomatis dengan tanda terima baca (centang biru).
- React status otomatis dengan rangkaian teks yang dapat diatur, teks khusus per kontak, atau kumpulan emoji acak.
- **Dukungan Status Grup** — status yang diposting ke grup WhatsApp terdeteksi dan diproses dengan alur auto-read dan auto-react yang sama, sementara chat grup biasa tetap tidak disentuh.
- Penyimpan status — media status yang masuk diarsipkan secara lokal.
- Balas status otomatis dengan pesan yang dapat diatur.
- Ringkasan status harian dikirim ke Telegram pukul 23:59 WIB.

### Privasi dan Jaring Pengaman
- Anti-hapus — pesan dan status yang dihapus diteruskan ke Telegram lengkap dengan pengirim, nomor, waktu, dan isinya.
- Anti sekali-lihat — foto dan video sekali lihat diteruskan ke Telegram agar dapat dibuka kembali.
- Mode anti-grup — bot diam sepenuhnya di chat grup (perintah dan fitur otomatis tidak merespons di sana).
- Aturan prefix ketat — perintah hanya bekerja dengan prefix `.`; kata biasa diperlakukan sebagai pesan biasa.

### Pengunduh Media
- **TikTok HD 1080p** — unduhan kualitas 1080p asli melalui `.tiktokhd`, dan otomatis saat link TikTok dikirim di chat tanpa perintah apa pun.
- Postingan slideshow TikTok dikirim sebagai satu album.
- Pengunduh audio/video YouTube dengan pilihan interaktif (balas `1` untuk MP3, `2` untuk MP4).
- Pembuat stiker, pencarian gambar Pinterest dan Pixiv, dan lainnya.

### Multi-Klon (Jadibot)
- Nomor WhatsApp tambahan dapat dipasangkan sebagai klon dengan kode pairing (`.jadibot <nomor>`).
- Semua klon berjalan dalam proses runner terpisah dari basis kode dan set plugin yang sama; pembaruan kode berlaku untuk semua klon setelah runner dimulai ulang.
- Kunci sesi yang basi (stale) terdeteksi dan dipulihkan secara otomatis.

### Fitur Asisten
- Mode chat AI khusus owner dengan balasan cepat tanpa delay (`.adawong`).
- Penjadwalan posting status dari antrean link TikTok.
- Panel loading animasi dan panel kontrol status yang rapi (`.sw`).

## Teknologi

| Komponen | Teknologi |
| --- | --- |
| Runtime | Node.js (ES Modules) |
| API WhatsApp | Baileys |
| Arsitektur | Sistem plugin dengan pemuat otomatis |
| Penyimpanan | Database file JSON (penulisan atomik, aman dari korupsi) |
| Proses | Skrip supervisor dengan restart otomatis dan watchdog koneksi |
| Integrasi | Telegram Bot API (penerusan pesan dan ringkasan harian) |

## Struktur Proyek

```
readsw/
├── run.sh                  # Supervisor (restart otomatis)
├── clone-run.sh            # Supervisor penjalan klon
├── src/
│   ├── index.js            # Titik masuk bot utama
│   ├── clone-runner.js     # Penjalan multi-klon
│   ├── handler/            # Penangan pesan dan event
│   ├── helper/             # Helper bersama (status, pengunduh, sesi, loading)
│   ├── plugins/            # Plugin fitur (dimuat otomatis)
│   └── db/                 # Lapisan database JSON
└── assets/                 # Banner menu dan logo
```

## Instalasi

```bash
git clone https://github.com/iyannsysu/bot-auto-read.git
cd bot-auto-read
npm install
cp .env.example .env   # isi konfigurasi Anda
bash run.sh
```

Saat pertama dijalankan, bot menampilkan kode pairing. Buka WhatsApp di ponsel Anda,
masuk ke **Perangkat Tertaut**, lalu masukkan kode tersebut untuk terhubung.

## Konfigurasi

Pengaturan utama disediakan melalui `.env`:

| Variabel | Keterangan |
| --- | --- |
| `BOT_NUMBER_OWNER` | Nomor owner, dipisahkan koma |
| `BOT_PREFIX` | Prefix perintah (default `.`) |
| `BOT_ALLOWED_NO_PREFIX` | Izinkan perintah tanpa prefix (default `false`) |
| `TELEGRAM_TOKEN` | Token bot Telegram untuk penerusan (opsional) |
| `TELEGRAM_CHAT_ID` | Tujuan chat Telegram untuk penerusan (opsional) |

Pengaturan fitur status (auto-read, auto-react, auto-reply, mode emoji acak, teks react)
diatur langsung dari chat melalui panel `.sw` dan tersimpan di `swconfig.json` —
perubahan berlaku tanpa restart.

## Contoh Penggunaan

| Perintah | Keterangan |
| --- | --- |
| `.menu` | Tampilkan menu perintah |
| `.sw` | Panel kontrol status (auto-read, auto-react, auto-reply) |
| `.tiktokhd <link>` | Unduh video TikTok kualitas HD 1080p |
| `.tt <link>` | Unduh video atau slideshow TikTok |
| `.play <judul>` | Cari YouTube, lalu balas `1` (MP3) atau `2` (MP4) |
| `.jadibot <nomor>` | Pasangkan nomor klon baru |
| `.status` | Tampilkan status bot utama dan klon |
| `.adawong on` | Aktifkan mode chat AI di chat ini |

Mengirim link TikTok tanpa perintah juga bisa: bot mendeteksi link tersebut
dan membalas dengan video HD secara otomatis.

## Catatan

- Ini adalah self-bot untuk penggunaan pribadi di akun Anda sendiri. WhatsApp tidak
  secara resmi mendukung otomatisasi tidak resmi; gunakan dengan bertanggung jawab dan atas risiko sendiri.
- Sesi, `.env`, unduhan, dan log sengaja tidak disertakan dalam repositori ini.

## Pembuat

Dibuat dan dikelola oleh **Iyan** — [github.com/iyannsysu](https://github.com/iyannsysu)

## Lisensi

Proyek ini dilisensikan di bawah MIT License — lihat file [LICENSE](LICENSE) untuk detailnya.

Copyright (c) 2025 Iyan
