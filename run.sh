#!/usr/bin/env bash
# Supervisor readsw self-bot: hidup terus, restart otomatis kalau proses mati/crash.
# Single instance via flock. Stop: kill $(cat bot-sup.pid)
set -u
BASE_DIR="$(cd "$(dirname "$0")" && pwd)"
LOCK="$BASE_DIR/bot.lock"
LOG="$BASE_DIR/bot.log"

# TLS lewat egress proxy (khusus sandbox; diabaikan kalau file tidak ada)
if [ -f /usr/local/share/ca-certificates/hatch-egress-ca.crt ]; then
	export NODE_EXTRA_CA_CERTS=/usr/local/share/ca-certificates/hatch-egress-ca.crt
fi
# Sanitasi no_proxy (entri IPv6 tanpa kurung siku merusak parsing di bbrp lib)
export NO_PROXY=localhost,127.0.0.1
export no_proxy=localhost,127.0.0.1

echo $$ > "$BASE_DIR/bot-sup.pid"

CHILD=""
cleanup() { [ -n "$CHILD" ] && kill "$CHILD" 2>/dev/null; exit 0; }
trap cleanup TERM INT

exec 9>"$LOCK"
if ! flock -n 9; then echo "readsw supervisor sudah jalan"; exit 0; fi

# WAJIB: kode bot pakai process.cwd() untuk .env, sessions/, react.json, dll.
# Tanpa cd ke sini, dotenv tidak menemukan .env dan semua env jadi undefined.
cd "$BASE_DIR"

while true; do
  echo "[$(date -u +%FT%TZ)] supervisor: menjalankan bot..." >>"$LOG"
  # stdbuf: matikan buffering stdout agar log real-time (bukan 4KB buffer)
  # Tutup fd lock (9) di child: kalau tidak, bot mewarisi fd lock dan
  # flock tidak pernah lepas saat supervisor mati -> supervisor baru
  # mengira supervisor lama masih jalan ("ghost lock").
  stdbuf -o0 -e0 node "$BASE_DIR/src/index.js" 9>&- >>"$LOG" 2>&1 &
  CHILD=$!
  wait "$CHILD"
  code=$?
  CHILD=""
  echo "[$(date -u +%FT%TZ)] supervisor: bot keluar (code $code), restart 10 dtk..." >>"$LOG"
  sleep 10
done
