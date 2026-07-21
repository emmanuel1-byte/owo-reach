#!/usr/bin/env bash
#
# run-backend.sh — one command to bring up the backend for local testing.
#
#   1. starts the Bun/Hono API (`bun run dev`) on :3000
#   2. waits until it answers /api/health
#   3. opens a cloudflared quick tunnel to it (optional)
#   4. prints the public https URL (paste this into Monnify's webhook settings
#      so deposit/disbursement callbacks reach your laptop)
#
# Leave this terminal running. Ctrl-C stops the server and the tunnel.
#
# Usage:
#   ./scripts/run-backend.sh              # API + tunnel
#   ./scripts/run-backend.sh --restart    # stop whatever holds :3000 first
#   ./scripts/run-backend.sh --no-tunnel  # API only (no public URL)
#
# NOTE ON .env: Bun reads .env once, at process start. Editing .env while the
# server is running changes nothing (`--hot` reloads TypeScript, not the
# environment). To pick up a new key or provider you must restart — use
# `--restart`, or Ctrl-C here and run this script again.
#
set -euo pipefail

WITH_TUNNEL=1
RESTART=0
for arg in "$@"; do
  case "$arg" in
    --no-tunnel) WITH_TUNNEL=0 ;;
    --restart)   RESTART=1 ;;
    -h|--help)   sed -n '2,22p' "${BASH_SOURCE[0]}" | sed 's/^# \{0,1\}//'; exit 0 ;;
    *) echo "Unknown option: $arg (try --help)" >&2; exit 1 ;;
  esac
done

# --- resolve paths so the script works no matter where it's called from -------
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
cd "$ROOT_DIR"

PORT="${PORT:-3000}"
HEALTH_URL="http://localhost:${PORT}/api/health"
LOG_DIR="$ROOT_DIR/.run"
SERVER_LOG="$LOG_DIR/server.log"
TUNNEL_LOG="$LOG_DIR/tunnel.log"
mkdir -p "$LOG_DIR"

# Bun installs to ~/.bun/bin, which isn't always on a fresh shell's PATH.
export PATH="$HOME/.bun/bin:$PATH"

# --- preflight checks ---------------------------------------------------------
if ! command -v bun >/dev/null 2>&1; then
  echo "✗ bun not found. Install it, or add ~/.bun/bin to your PATH." >&2
  exit 1
fi
if [ "$WITH_TUNNEL" -eq 1 ] && ! command -v cloudflared >/dev/null 2>&1; then
  echo "✗ cloudflared not found. Install it, or run with --no-tunnel." >&2
  exit 1
fi
if [ ! -f "$ROOT_DIR/.env" ]; then
  echo "✗ No .env in $ROOT_DIR — the server needs its Monnify/AI keys." >&2
  exit 1
fi

# --- is anything already on the port? -----------------------------------------
# This matters more than it looks: if a stale backend is still listening, the
# new one fails to bind but /api/health still answers (the OLD process replies),
# so the script would report success while you keep running the old .env. That
# is the classic "I changed my API key and nothing happened" trap.
pids_on_port() {
  if command -v lsof >/dev/null 2>&1; then
    lsof -tiTCP:"$PORT" -sTCP:LISTEN 2>/dev/null || true
  elif command -v ss >/dev/null 2>&1; then
    ss -ltnp 2>/dev/null | grep ":${PORT} " | grep -oE 'pid=[0-9]+' | cut -d= -f2 | sort -u || true
  fi
}

EXISTING="$(pids_on_port)"
if [ -n "$EXISTING" ]; then
  if [ "$RESTART" -eq 1 ]; then
    echo "→ Stopping existing process on :${PORT} (pid: $(echo "$EXISTING" | tr '\n' ' '))…"
    # shellcheck disable=SC2086
    kill $EXISTING 2>/dev/null || true
    for _ in $(seq 1 20); do
      [ -z "$(pids_on_port)" ] && break
      sleep 0.5
    done
    if [ -n "$(pids_on_port)" ]; then
      # shellcheck disable=SC2086
      kill -9 $(pids_on_port) 2>/dev/null || true
      sleep 1
    fi
    echo "✓ Port ${PORT} is free."
  else
    echo "✗ Something is already listening on :${PORT} (pid: $(echo "$EXISTING" | tr '\n' ' '))." >&2
    echo "" >&2
    echo "  A stale server would keep serving its OLD .env, so this script won't" >&2
    echo "  start a second one silently. Either:" >&2
    echo "    • re-run with --restart to stop it automatically, or" >&2
    echo "    • stop it yourself:  kill $(echo "$EXISTING" | tr '\n' ' ')" >&2
    exit 1
  fi
fi

SERVER_PID=""
TUNNEL_PID=""

cleanup() {
  echo ""
  echo "→ Shutting down…"
  [ -n "$TUNNEL_PID" ] && kill "$TUNNEL_PID" 2>/dev/null || true
  [ -n "$SERVER_PID" ] && kill "$SERVER_PID" 2>/dev/null || true
  wait 2>/dev/null || true
  echo "✓ Stopped."
}
trap cleanup INT TERM EXIT

# --- 1. start the backend -----------------------------------------------------
echo "→ Starting backend (bun run dev) on :${PORT}…"
: > "$SERVER_LOG"
bun run dev >"$SERVER_LOG" 2>&1 &
SERVER_PID=$!

# --- 2. wait for it to be healthy --------------------------------------------
echo "→ Waiting for the API to come up…"
for i in $(seq 1 40); do
  if ! kill -0 "$SERVER_PID" 2>/dev/null; then
    echo "✗ Backend exited during startup. Last log lines:" >&2
    tail -n 20 "$SERVER_LOG" >&2
    exit 1
  fi
  if curl -sf "$HEALTH_URL" >/dev/null 2>&1; then
    echo "✓ API is up at http://localhost:${PORT}"
    break
  fi
  sleep 0.5
  if [ "$i" -eq 40 ]; then
    echo "✗ API didn't respond on ${HEALTH_URL} within 20s. Last log lines:" >&2
    tail -n 20 "$SERVER_LOG" >&2
    exit 1
  fi
done

# --- 3. open the tunnel (best-effort) ----------------------------------------
# The tunnel is a convenience for webhooks, NOT a prerequisite for the API.
# Cloudflare's quick-tunnel endpoint times out often enough that letting a
# transient network blip tear down a working backend is the wrong trade —
# especially mid-demo. So: retry once, then carry on without it.
TUNNEL_URL=""
start_tunnel() {
  : > "$TUNNEL_LOG"
  cloudflared tunnel --url "http://localhost:${PORT}" >"$TUNNEL_LOG" 2>&1 &
  TUNNEL_PID=$!
  for _ in $(seq 1 40); do
    if ! kill -0 "$TUNNEL_PID" 2>/dev/null; then return 1; fi
    TUNNEL_URL="$(grep -oE 'https://[a-z0-9-]+\.trycloudflare\.com' "$TUNNEL_LOG" | head -n1 || true)"
    [ -n "$TUNNEL_URL" ] && return 0
    sleep 0.5
  done
  return 1
}

if [ "$WITH_TUNNEL" -eq 1 ]; then
  echo "→ Opening cloudflared quick tunnel…"
  if ! start_tunnel; then
    kill "$TUNNEL_PID" 2>/dev/null || true
    TUNNEL_PID=""
    echo "  … first attempt failed, retrying once…"
    if ! start_tunnel; then
      kill "$TUNNEL_PID" 2>/dev/null || true
      TUNNEL_PID=""
      TUNNEL_URL=""
      echo "⚠ Tunnel unavailable — continuing without it. Last log line:" >&2
      tail -n 1 "$TUNNEL_LOG" >&2
    fi
  fi
fi

# --- 4. report ----------------------------------------------------------------
echo ""
echo "────────────────────────────────────────────────────────────"
if [ -n "$TUNNEL_URL" ]; then
  echo "  ✓ Backend + tunnel are live"
  echo ""
  echo "    Local API      http://localhost:${PORT}"
  echo "    Public URL     ${TUNNEL_URL}"
  echo "    Webhook URL    ${TUNNEL_URL}/api/webhooks/monnify"
  echo ""
  echo "  Paste the Webhook URL into your Monnify dashboard so deposit"
  echo "  and disbursement callbacks reach this machine."
else
  echo "  ✓ Backend is live (no tunnel)"
  echo ""
  echo "    Local API      http://localhost:${PORT}"
  echo ""
  if [ "$WITH_TUNNEL" -eq 1 ]; then
    echo "  ⚠ No public URL, so Monnify webhooks can't reach you. Deposits and"
    echo "    payout statuses won't update live until a tunnel is running."
    echo "    Start one in another terminal (the API keeps running):"
    echo "      cloudflared tunnel --url http://localhost:${PORT}"
  else
    echo "  Tunnel skipped (--no-tunnel). Webhooks won't reach this machine."
  fi
fi
echo ""
echo "  Logs:  ${SERVER_LOG}"
[ -n "$TUNNEL_URL" ] && echo "         ${TUNNEL_LOG}"
echo ""
echo "  Press Ctrl-C to stop."
echo "────────────────────────────────────────────────────────────"
echo ""

# Keep running until Ctrl-C. Waiting on the SERVER (not the tunnel) is
# deliberate: if the tunnel dies later, the API stays up.
wait "$SERVER_PID"
