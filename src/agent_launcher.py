#!/usr/bin/env python3
import json
import os
import re
import signal
import subprocess
import threading
import time
from http.server import BaseHTTPRequestHandler, HTTPServer
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
REGISTRY_PATH = os.environ.get(
    "AGENT_REGISTRY_PATH",
    str(ROOT / "configs" / "agent_registry.json"),
)
SAM_BIN = os.environ.get(
    "SAM_BIN",
    str(ROOT / ".venv" / "bin" / "sam"),
)
MAX_ACTIVE = int(os.environ.get("MAX_ACTIVE_AGENTS", "100"))
IDLE_TIMEOUT_SECONDS = int(os.environ.get("IDLE_TIMEOUT_SECONDS", "300"))
HOST = os.environ.get("LAUNCHER_HOST", "127.0.0.1")
PORT = int(os.environ.get("LAUNCHER_PORT", "9001"))
LOG_DIR = Path(os.environ.get("LAUNCHER_LOG_DIR", str(ROOT / "logs" / "agents")))
SCREEN_PREFIX = os.environ.get("LAUNCHER_SCREEN_PREFIX", "solas_agent_")

_lock = threading.Lock()
_active = {}  # agent_id -> {"session": str, "last_used": float, "started_at": float}

with open(REGISTRY_PATH, "r", encoding="utf-8") as f:
    _registry = json.load(f)

_id_to_yaml = {a["id"]: a["yaml_path"] for a in _registry.get("agents", [])}


def _json_response(handler: BaseHTTPRequestHandler, status: int, payload: dict) -> None:
    body = json.dumps(payload).encode("utf-8")
    handler.send_response(status)
    handler.send_header("Content-Type", "application/json")
    handler.send_header("Content-Length", str(len(body)))
    handler.end_headers()
    handler.wfile.write(body)


def _start_agents(agent_ids):
    started = []
    skipped = []
    missing = []
    LOG_DIR.mkdir(parents=True, exist_ok=True)
    with _lock:
        for agent_id in agent_ids:
            if agent_id in _active:
                skipped.append(agent_id)
                continue
            yaml_path = _id_to_yaml.get(agent_id)
            if not yaml_path:
                missing.append(agent_id)
                continue
            session = _screen_name(agent_id)
            log_path = LOG_DIR / f"{agent_id}.log"
            cmd = (
                f"cd {ROOT} && "
                f". .venv/bin/activate && "
                f"set -a && source .env && set +a && "
                f"{SAM_BIN} run {yaml_path} > {log_path} 2>&1"
            )
            subprocess.run(
                ["screen", "-dmS", session, "bash", "-lc", cmd],
                check=False,
            )
            now = time.time()
            _active[agent_id] = {
                "session": session,
                "last_used": now,
                "started_at": now,
            }
            started.append(agent_id)
    return started, skipped, missing


def _stop_agents(agent_ids):
    stopped = []
    missing = []
    with _lock:
        for agent_id in agent_ids:
            entry = _active.get(agent_id)
            if not entry:
                missing.append(agent_id)
                continue
            _stop_session(entry["session"])
            _active.pop(agent_id, None)
            stopped.append(agent_id)
    return stopped, missing


def _cleanup_all():
    with _lock:
        for agent_id, entry in list(_active.items()):
            _stop_session(entry["session"])
            _active.pop(agent_id, None)


def _evict_idle_lru(needed_slots: int) -> int:
    """Evict least-recently-used idle agents to free needed_slots. Returns freed slots."""
    now = time.time()
    evicted = 0
    with _lock:
        # build LRU list of idle agents (oldest first)
        idle = [
            (agent_id, entry["last_used"])
            for agent_id, entry in _active.items()
            if now - entry["last_used"] >= IDLE_TIMEOUT_SECONDS
        ]
        idle.sort(key=lambda x: x[1])
        for agent_id, _ in idle:
            if evicted >= needed_slots:
                break
            entry = _active.get(agent_id)
            if not entry:
                continue
            _stop_session(entry["session"])
            _active.pop(agent_id, None)
            evicted += 1
    return evicted


def _touch_agents(agent_ids):
    touched = []
    missing = []
    with _lock:
        now = time.time()
        for agent_id in agent_ids:
            entry = _active.get(agent_id)
            if not entry:
                missing.append(agent_id)
                continue
            entry["last_used"] = now
            touched.append(agent_id)
    return touched, missing


def _idle_sweeper():
    while True:
        time.sleep(30)
        _evict_idle_lru(needed_slots=MAX_ACTIVE)  # evict all idle beyond timeout


def _screen_name(agent_id: str) -> str:
    safe = re.sub(r"[^a-zA-Z0-9_-]+", "_", agent_id)
    return f"{SCREEN_PREFIX}{safe}"


def _screen_list() -> set[str]:
    try:
        out = subprocess.check_output(["screen", "-ls"], text=True)
    except subprocess.CalledProcessError:
        return set()
    sessions = set()
    for line in out.splitlines():
        line = line.strip()
        if not line or "\t" not in line:
            continue
        sess = line.split("\t", 1)[-1].split(" ", 1)[0]
        if not sess:
            continue
        # screen -ls returns "1234.name"; normalize to "name"
        name = sess.split(".", 1)[1] if "." in sess else sess
        sessions.add(name)
    return sessions


def _session_exists(session: str) -> bool:
    return session in _screen_list()


def _stop_session(session: str) -> None:
    subprocess.run(["screen", "-S", session, "-X", "quit"], check=False)


def _prune_dead_sessions(grace_seconds: int = 5) -> None:
    live = _screen_list()
    now = time.time()
    with _lock:
        for agent_id, entry in list(_active.items()):
            if entry["session"] in live:
                continue
            # avoid pruning immediately after start; screen may lag
            if now - entry["started_at"] < grace_seconds:
                continue
            _active.pop(agent_id, None)


class Handler(BaseHTTPRequestHandler):
    def do_GET(self):
        if self.path != "/status":
            _json_response(self, 404, {"error": "not_found"})
            return
        _prune_dead_sessions()
        with _lock:
            payload = {
                "active_agents": sorted(_active.keys()),
                "active_count": len(_active),
                "capacity": MAX_ACTIVE,
                "idle_timeout_seconds": IDLE_TIMEOUT_SECONDS,
            }
        _json_response(self, 200, payload)

    def do_POST(self):
        length = int(self.headers.get("Content-Length", "0"))
        body = self.rfile.read(length) if length else b"{}"
        try:
            data = json.loads(body.decode("utf-8"))
        except json.JSONDecodeError:
            _json_response(self, 400, {"error": "invalid_json"})
            return

        agent_ids = data.get("agent_ids") or []
        if not isinstance(agent_ids, list):
            _json_response(self, 400, {"error": "agent_ids_must_be_list"})
            return

        if self.path == "/start":
            with _lock:
                active_now = len(_active)
            needed = [a for a in agent_ids if a in _id_to_yaml and a not in _active]
            if active_now + len(needed) > MAX_ACTIVE:
                to_free = (active_now + len(needed)) - MAX_ACTIVE
                freed = _evict_idle_lru(to_free)
                with _lock:
                    active_now = len(_active)
                if active_now + len(needed) > MAX_ACTIVE and freed < to_free:
                    _json_response(
                        self,
                        409,
                        {
                            "error": "capacity_exceeded",
                            "capacity": MAX_ACTIVE,
                            "active_count": active_now,
                            "requested": len(needed),
                        },
                    )
                    return
            started, skipped, missing = _start_agents(agent_ids)
            _json_response(
                self,
                200,
                {
                    "started": started,
                    "skipped": skipped,
                    "missing": missing,
                    "active_count": len(_active),
                    "capacity": MAX_ACTIVE,
                },
            )
            return

        if self.path == "/stop":
            stopped, missing = _stop_agents(agent_ids)
            _json_response(
                self,
                200,
                {
                    "stopped": stopped,
                    "missing": missing,
                    "active_count": len(_active),
                    "capacity": MAX_ACTIVE,
                },
            )
            return
        if self.path == "/touch":
            touched, missing = _touch_agents(agent_ids)
            _json_response(
                self,
                200,
                {
                    "touched": touched,
                    "missing": missing,
                    "active_count": len(_active),
                    "capacity": MAX_ACTIVE,
                },
            )
            return

        _json_response(self, 404, {"error": "not_found"})

    def log_message(self, format, *args):
        return


def main():
    def handle_sig(*_):
        _cleanup_all()
        raise SystemExit(0)

    signal.signal(signal.SIGINT, handle_sig)
    signal.signal(signal.SIGTERM, handle_sig)

    sweeper = threading.Thread(target=_idle_sweeper, daemon=True)
    sweeper.start()
    server = HTTPServer((HOST, PORT), Handler)
    print(f"Agent Launcher listening on http://{HOST}:{PORT}")
    server.serve_forever()


if __name__ == "__main__":
    main()
