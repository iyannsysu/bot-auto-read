<p align="center">
  <img src="assets/adawong-logo.webp" alt="readsw logo" width="180">
</p>

<h1 align="center">readsw</h1>

<p align="center">
  <strong>WhatsApp Self-Bot — Status Automation, Media Downloader, and Multi-Clone Runner</strong>
</p>

<p align="center">
  Node.js &nbsp;|&nbsp; Baileys &nbsp;|&nbsp; Plugin Architecture &nbsp;|&nbsp; Owner-Only Access
</p>

---

## Overview

**readsw** is a personal WhatsApp self-bot built with Node.js and the Baileys library.
It runs as a single-owner assistant focused on three areas: full automation of WhatsApp
Status (stories), high-quality media downloading, and a multi-clone runner that lets
several additional numbers operate from the same codebase.

The bot uses a modular plugin system — every feature is an independent plugin file that
is loaded automatically at startup. The current build ships **69 plugins and 156 commands**.

## Key Features

### Status (Story) Automation
- Auto-read incoming statuses with read receipts.
- Auto-react with a configurable text sequence, a custom text per contact, or a random emoji pool.
- **Group Status support** — statuses posted to WhatsApp groups are detected and processed with the same auto-read and auto-react pipeline, while regular group chats remain untouched.
- Status saver — incoming status media is archived locally.
- Status auto-reply with a configurable message.
- Daily status summary delivered to Telegram at 23:59 WIB.

### Privacy and Safety Nets
- Anti-delete — deleted messages and statuses are forwarded to Telegram with sender, number, timestamp, and content.
- Anti view-once — view-once photos and videos are forwarded to Telegram so they can be opened again.
- Anti-group mode — the bot stays completely silent in group chats (commands and auto features do not respond there).
- Strict prefix policy — commands only work with the `.` prefix; plain words are treated as regular messages.

### Media Downloaders
- **TikTok HD 1080p** — downloads at true 1080p quality via `.tiktokhd`, and automatically when a TikTok link is sent in chat without any command.
- TikTok slideshow posts are delivered as a single album.
- YouTube audio/video downloader with an interactive choice (reply `1` for MP3, `2` for MP4).
- Sticker maker, Pinterest and Pixiv image search, and more.

### Multi-Clone (Jadibot)
- Additional WhatsApp numbers can be paired as clones with a pairing code (`.jadibot <number>`).
- All clones run in a separate runner process from the same codebase and plugin set; a code update applies to every clone after a runner restart.
- Stale session locks are detected and recovered automatically.

### Assistant Features
- Owner-only AI chat mode with fast, no-delay replies (`.adawong`).
- Scheduled status posting from a TikTok link queue.
- Animated loading panel and an organized status control panel (`.sw`).

## Tech Stack

| Component | Technology |
| --- | --- |
| Runtime | Node.js (ES Modules) |
| WhatsApp API | Baileys |
| Architecture | Plugin system with automatic loader |
| Storage | JSON file database (atomic writes, corruption-safe) |
| Process | Supervisor script with auto-restart and connection watchdog |
| Integrations | Telegram Bot API (forwards and daily summary) |

## Project Structure

```
readsw/
├── run.sh                  # Supervisor (auto-restart)
├── clone-run.sh            # Clone runner supervisor
├── src/
│   ├── index.js            # Main bot bootstrap
│   ├── clone-runner.js     # Multi-clone runner
│   ├── handler/            # Message and event handlers
│   ├── helper/             # Shared helpers (status, downloader, session, loading)
│   ├── plugins/            # Feature plugins (auto-loaded)
│   └── db/                 # JSON database layer
└── assets/                 # Menu banner and logo
```

## Installation

```bash
git clone https://github.com/iyannsysu/bot-auto-read.git
cd bot-auto-read
npm install
cp .env.example .env   # fill in your configuration
bash run.sh
```

On first run the bot prints a pairing code. Open WhatsApp on your phone,
go to **Linked Devices**, and enter the code to connect.

## Configuration

Main settings are provided through `.env`:

| Variable | Description |
| --- | --- |
| `BOT_NUMBER_OWNER` | Owner number(s), comma separated |
| `BOT_PREFIX` | Command prefix (default `.`) |
| `BOT_ALLOWED_NO_PREFIX` | Allow commands without prefix (default `false`) |
| `TELEGRAM_TOKEN` | Telegram bot token for forwarding (optional) |
| `TELEGRAM_CHAT_ID` | Telegram chat target for forwarding (optional) |

Runtime toggles for status features (auto-read, auto-react, auto-reply, random emoji
mode, react text) are managed live from chat through the `.sw` panel and are stored in
`swconfig.json` — changes apply without a restart.

## Usage Examples

| Command | Description |
| --- | --- |
| `.menu` | Show the command menu |
| `.sw` | Status control panel (auto-read, auto-react, auto-reply) |
| `.tiktokhd <link>` | Download a TikTok video in HD 1080p |
| `.tt <link>` | Download a TikTok video or slideshow |
| `.play <title>` | Search YouTube, then reply `1` (MP3) or `2` (MP4) |
| `.jadibot <number>` | Pair a new clone number |
| `.status` | Show main bot and clone status |
| `.adawong on` | Enable AI chat mode in the current chat |

Sending a TikTok link without any command also works: the bot detects the link
and replies with the HD video automatically.

## Notes

- This is a self-bot for personal use on your own account. WhatsApp does not
  officially support unofficial automation; use it responsibly and at your own risk.
- Sessions, `.env`, downloads, and logs are intentionally not included in this repository.

## Author

Created and maintained by **Iyan** — [github.com/iyannsysu](https://github.com/iyannsysu)

Copyright (c) 2026 Iyan. Personal project — please do not sell or redistribute commercially without permission.
