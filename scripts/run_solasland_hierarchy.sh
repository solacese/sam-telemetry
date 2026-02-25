#!/usr/bin/env bash
set -euo pipefail

ROOT="/Users/raphaelcaillon/Documents/github/country-of-geniuses"
cd "$ROOT"

source .venv/bin/activate
set -a
source .env
set +a

LOG_DIR="$ROOT/logs"
mkdir -p "$LOG_DIR"

# Generate hierarchy files and registries
python3 scripts/generate_hierarchy.py
python3 scripts/generate_agent_registry.py

# Stop any prior Solasland screen sessions
if command -v screen >/dev/null 2>&1; then
  sessions=$(screen -ls 2>/dev/null | rg -o "^[[:space:]]*[0-9]+\.solas_[^[:space:]]+" | awk '{print $1}' || true)
  if [ -n "$sessions" ]; then
    while read -r sess; do
      screen -S "$sess" -X quit || true
    done <<<"$sessions"
  fi
fi

# Stop orphaned processes not attached to screen (prevents stale code from persisting)
pkill -f "src/micro_a2a_service.py" 2>/dev/null || true
pkill -f "sam run configs/gateways/webui.yaml configs/services/platform.yaml configs/agents/main_orchestrator.yaml" 2>/dev/null || true

# Start micro-A2A service (CPU-optimized profile)
screen -dmS solas_micro_a2a bash -lc "cd $ROOT && . .venv/bin/activate && export MICRO_A2A_MAX_ACTIVE=24 && export MICRO_A2A_IDLE_TIMEOUT=120 && export MICRO_A2A_WARM_MANAGERS=6 && export MICRO_A2A_MAX_TASKS=500 && export MICRO_A2A_USE_LLM=false && export REMOTE_AGENT_REGISTRY=$ROOT/configs/remote_agent_registry.json && python3 src/micro_a2a_service.py >\"$LOG_DIR/micro_a2a.log\" 2>&1"

# Wait for micro-A2A to become healthy (force successful initial discovery)
for _ in {1..30}; do
  if curl -sS http://127.0.0.1:9100/health >/dev/null 2>&1; then
    break
  fi
  sleep 1
done

# Build head agent list
HEAD_LIST=$(python3 - <<'PY'
from pathlib import Path
root = Path("/Users/raphaelcaillon/Documents/github/country-of-geniuses")
paths = [str(p) for p in sorted((root/"configs"/"agents").glob("solasland_head_*.yaml"))]
print(" ".join(paths))
PY
)

# Start SAM (WebUI + Platform + Orchestrator + Proxy + Heads)
screen -dmS solas_sam bash -lc "cd $ROOT && . .venv/bin/activate && sam run configs/gateways/webui.yaml configs/services/platform.yaml configs/agents/main_orchestrator.yaml configs/agents/solasland_remote_proxy.yaml $HEAD_LIST >\"$LOG_DIR/solas_sam.log\" 2>&1"

cat <<EOF
Started:
- micro-A2A service (screen: solas_micro_a2a)
- SAM (WebUI + platform + orchestrator + proxy + heads) (screen: solas_sam)

Web UI: http://127.0.0.1:8000
micro-A2A: http://127.0.0.1:9100/health
Logs: $LOG_DIR
EOF
