# Iyan x m 🤖

WhatsApp self-bot berbasis [Baileys](https://github.com/WhiskeySockets/Baileys) — downloader TikTok HD, pembuat stiker, auto-react status, galeri, dan banyak lagi.

👥 **Join grup WhatsApp kami:** [Klik untuk gabung](https://chat.whatsapp.com/BJRPy8iTnrRFbiEjwkZrUV)

---

## ✨ Fitur

| Kategori | Command | Keterangan |
|----------|---------|------------|
| 📥 Downloader | `.tt` / `.tiktok` + link | Download video TikTok HD tanpa watermark |
| | `.tt` (foto) | Slideshow TikTok jadi album foto |
| | `.play <judul>` | Download audio YouTube (max 20 menit) |
| | `.pin <keyword>` | Cari & download gambar Pinterest |
| | `.bokep <keyword>` | Cari video (18+) |
| 🎨 Stiker | kirim gambar + `.s` | Bikin stiker dari foto/video |
| | `.tpack <link>` | Ambil sticker pack Telegram |
| 👁️ Status | `.sw` | Panel pengaturan status |
| | `.swread` / `.swreact` on/off | Auto-baca & auto-react status |
| | `.swreacttext <tulisan>` | React status pakai tulisan custom |
| | `.swreply` on/off | Balas status otomatis pakai teks |
| | `.swemoji 😍🔥` | Ganti pool emoji react |
| 🖼️ Galeri | `.cewe [n]` | Galeri gambar AI |
| | `.cewevid` | Galeri video |
| | `.chara <nama>` | Cari karakter |
| 🎌 Anime 18+ | `.manhwa` / `.manhwa top` | Komik Korea sub Indo |
| | `.hentai` / `.hd <keyword>` | Galeri Hentaidad |
| | `.nekopoi <keyword>` | Cari di Nekopoi |
| | `.hanime` | Video hanime |
| 😂 Fun | `.khodam` / `.alay` / `.hacker` | Cek khodam, alay text, hacker prank |
| ⚙️ Lainnya | `.menu` | Lihat semua command |
| | `.setgc <link>` | Set link grup di menu |

---

## 📋 Syarat

- **Node.js** versi 20 atau lebih baru
- **ffmpeg** (untuk stiker & konversi media)
- Nomor WhatsApp aktif (untuk pairing)

---

## 🚀 Cara Install

### 1. Clone & install

```bash
git clone https://github.com/iyannsysu/iyan-x-m.git
cd iyan-x-m
npm install
```

### 2. Setting config

```bash
cp .env.example .env
```

Buka file `.env` lalu isi yang penting:

```env
# Nomor WhatsApp untuk pairing (format: 6281234567890)
BOT_NUMBER_PAIR=6281234567890

# Nomor owner (bisa lebih dari 1, pisahkan koma)
BOT_NUMBER_OWNER=6281234567890

# Nama owner (tampil di menu)
BOT_OWNER_NAME=Iyan
```

> 💡 Pengaturan lain (auto-download, status saver, dsb) bisa dibiarkan default dulu.

### 3. Jalankan bot

```bash
npm start
```

Atau pakai supervisor (auto-restart kalau crash):

```bash
bash run.sh
```

### 4. Pairing WhatsApp

- Kalau `BOT_NUMBER_PAIR` diisi → kode pairing muncul di terminal, masukkan di **WhatsApp > Perangkat Tertaut > Tautkan Perangkat > Tautkan dengan nomor telepon**
- Kalau dikosongkan → scan QR yang muncul di terminal

Tunggu sampai muncul **"Connected successfully"** ✅

---

## ⚙️ Konfigurasi Lanjutan

| File | Fungsi |
|------|--------|
| `.env` | Konfigurasi utama (jangan dibagikan!) |
| `swconfig.json` | Pengaturan status (auto-read/react/reply) — bisa diubah via command `.sw` |
| `react.json` | Custom emoji react per kontak |
| `autoreply.json` | Auto-reply keyword di chat pribadi |
| `watch.json` | Pantau kontak penting → teruskan ke Telegram |

Semua file config di atas **otomatis dibuat** saat bot pertama jalan, dan bisa diubah tanpa restart.

---

## 📝 Catatan

- Session WhatsApp tersimpan di folder `sessions/` — **jangan dibagikan ke siapa pun**
- File `.env` berisi data pribadi — sudah masuk `.gitignore`, jangan di-push
- Bot ini self-bot: gunakan nomor kedua/baru, bukan nomor utama
- Gunakan dengan bijak dan patuhi [Ketentuan WhatsApp](https://www.whatsapp.com/legal/terms-of-service)

---

## 💬 Butuh Bantuan?

Join grup WhatsApp kami untuk tanya-tanya & update terbaru:

👉 [Gabung Grup WhatsApp](https://chat.whatsapp.com/BJRPy8iTnrRFbiEjwkZrUV)

---

## 📞 Kontak Owner

Ada kendala atau mau request fitur? Hubungi langsung:

👉 [Chat WhatsApp Iyan](https://wa.me/6282161429908)

---

Made with ❤️ by Iyan
