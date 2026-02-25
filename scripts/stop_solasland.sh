#!/usr/bin/env bash
set -euo pipefail

MODE="${1:-sam}"

stop_screen_session() {
  local session_name="$1"
  if command -v screen >/dev/null 2>&1; then
    local session_id
    session_id="$(screen -ls 2>/dev/null | rg -o "([0-9]+\\.${session_name})" | head -n1 || true)"
    if [ -n "$session_id" ]; then
      screen -S "$session_id" -X quit || true
    fi
  fi
}

kill_listener_port() {
  local port="$1"
  local pid
  pid="$(lsof -tiTCP:"$port" -sTCP:LISTEN || true)"
  if [ -n "$pid" ]; then
    kill "$pid" 2>/dev/null || true
    sleep 1
    if lsof -tiTCP:"$port" -sTCP:LISTEN >/dev/null 2>&1; then
      kill -9 "$pid" 2>/dev/null || true
    fi
  fi
}

stop_sam() {
  stop_screen_session "solas_sam"
  pkill -f "sam run configs/gateways/webui.yaml configs/services/platform.yaml configs/agents/main_orchestrator.yaml" 2>/dev/null || true
  kill_listener_port 8000
}

stop_micro() {
  stop_screen_session "solas_micro_a2a"
  pkill -f "src/micro_a2a_service.py" 2>/dev/null || true
  kill_listener_port 9100
}

case "$MODE" in
  sam)
    stop_sam
    echo "Stopped SAM (port 8000)."
    ;;
  all)
    stop_sam
    stop_micro
    echo "Stopped SAM + micro-A2A (ports 8000 and 9100)."
    ;;
  *)
    echo "Usage: $0 [sam|all]"
    exit 1
    ;;
esac
