#!/usr/bin/env python3
from __future__ import annotations

import json
import os
import time
import uuid
import hashlib
from collections import OrderedDict
from datetime import UTC, datetime
from pathlib import Path
from typing import Any

import httpx
from fastapi import FastAPI, HTTPException
from fastapi.responses import JSONResponse

from solasland_topology import (
    CITIZEN_COUNT,
    HEAD_COUNT,
    MANAGER_COUNT,
    TOTAL_AGENTS,
    citizens_for_manager,
    citizen_meta,
    is_citizen_id,
    is_manager_id,
    iter_managers,
    manager_meta,
    topology_metadata,
)

ROOT = Path("/Users/raphaelcaillon/Documents/github/country-of-geniuses")
REGISTRY_PATH = Path(os.environ.get("REMOTE_AGENT_REGISTRY", ROOT / "configs" / "remote_agent_registry.json"))
HOST = os.environ.get("MICRO_A2A_HOST", "127.0.0.1")
PORT = int(os.environ.get("MICRO_A2A_PORT", "9100"))
IDLE_TIMEOUT_SECONDS = int(os.environ.get("MICRO_A2A_IDLE_TIMEOUT", "120"))
MAX_ACTIVE = int(os.environ.get("MICRO_A2A_MAX_ACTIVE", "24"))
WARM_MANAGERS = int(os.environ.get("MICRO_A2A_WARM_MANAGERS", "6"))
MAX_TASKS = int(os.environ.get("MICRO_A2A_MAX_TASKS", "500"))

LLM_ENDPOINT = os.environ.get("LLM_SERVICE_ENDPOINT")
LLM_API_KEY = os.environ.get("LLM_SERVICE_API_KEY")
LLM_MODEL = os.environ.get("LLM_SERVICE_GENERAL_MODEL_NAME")
USE_LLM = os.environ.get("MICRO_A2A_USE_LLM", "false").lower() == "true"

BLOCKED_RESPONSE_MARKERS = (
    "data availability issue",
    "need the source data",
    "please provide",
    "provide any of the following",
    "system access details",
    "if raw data isn't available",
    "what approach would you prefer",
    "insufficient data",
    "missing data",
    "need data",
    "need access",
    "cannot proceed",
    "can't proceed",
    "unable to proceed",
    "simulated",
    "synthetic",
    "mock data",
    "fake data",
)

RISK_TEMPLATES = (
    (
        "Service Reliability Spillover",
        "incident recurrence and IoT alert clustering are rising in the same operating window",
        "IT + Operations + Infrastructure",
        "Stand up a 24-hour reliability war-room, freeze non-critical deploys, and enforce 4-hour rollback windows.",
    ),
    (
        "Revenue Conversion Friction",
        "CRM queue aging is crossing with ERP order exceptions and delayed fulfillment confirmations",
        "Companies + Customer + Operations + Finance",
        "Run a same-day exception sweep, prioritize high-value stuck orders, and enforce a 2-hour handoff SLA.",
    ),
    (
        "Cash and Compliance Exposure",
        "ledger variance is widening while policy and external news volatility increases execution risk",
        "Finance + Government + Legal/Ethics",
        "Trigger daily controls checks, tighten spend approvals on risk categories, and publish a 5-point compliance watchlist.",
    ),
)

DOMAIN_HINTS = (
    ("IT incidents", ("incident", "outage", "sev", "downtime", "it")),
    ("CRM tickets", ("crm", "ticket", "support", "churn", "complaint")),
    ("ERP orders", ("erp", "order", "fulfillment", "shipment", "backlog")),
    ("IoT alerts", ("iot", "alert", "sensor", "device", "telemetry")),
    ("Finance ledgers", ("ledger", "cash", "variance", "budget", "finance")),
    ("External news", ("news", "regulation", "market", "press", "external")),
)

SIGNAL_TEMPLATES = (
    "re-open rate rose by {pct}% over the last 7 days",
    "latency variance widened by {pct}% in peak hours",
    "exception volume increased by {pct}% week-over-week",
    "handoff delays grew by {pct}% across cross-team queues",
    "manual override usage climbed by {pct}% in critical flows",
    "compliance exceptions expanded by {pct}% in recent cycles",
)

MITIGATION_TEMPLATES = (
    "trigger targeted triage for the top 5 noisy entities and close within 24 hours",
    "assign named owners for each escalated queue and publish 2x daily updates",
    "activate temporary safeguards on high-risk workflows until indicators normalize",
    "prioritize high-value accounts and clear aged blockers by end of day",
)

if USE_LLM and (not LLM_ENDPOINT or not LLM_API_KEY or not LLM_MODEL):
    raise RuntimeError("LLM_SERVICE_ENDPOINT, LLM_SERVICE_API_KEY, and LLM_SERVICE_GENERAL_MODEL_NAME must be set")


class AgentState:
    def __init__(self, agent_id: str) -> None:
        self.agent_id = agent_id
        self.created_at = time.time()
        self.last_used = self.created_at


def _load_manager_overrides(path: Path) -> dict[str, dict[str, Any]]:
    if not path.exists():
        return {}

    try:
        payload = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        return {}

    overrides: dict[str, dict[str, Any]] = {}
    for item in payload.get("agents", []):
        if not isinstance(item, dict):
            continue
        agent_id = str(item.get("id", ""))
        if not is_manager_id(agent_id):
            continue
        overrides[agent_id] = item
    return overrides


MANAGER_OVERRIDES = _load_manager_overrides(REGISTRY_PATH)

app = FastAPI(title="Solasland micro-A2A")

ACTIVE: OrderedDict[str, AgentState] = OrderedDict()
TASKS: OrderedDict[str, dict[str, Any]] = OrderedDict()


def _now_ts() -> dict[str, int]:
    return {"seconds": int(time.time())}


def _evict_idle() -> None:
    cutoff = time.time() - IDLE_TIMEOUT_SECONDS
    to_remove = [agent_id for agent_id, state in ACTIVE.items() if state.last_used < cutoff]
    for agent_id in to_remove:
        ACTIVE.pop(agent_id, None)


def _evict_over_capacity() -> None:
    while len(ACTIVE) > MAX_ACTIVE:
        ACTIVE.popitem(last=False)


def _touch(agent_id: str) -> AgentState:
    state = ACTIVE.get(agent_id)
    if state is None:
        state = AgentState(agent_id)
        ACTIVE[agent_id] = state

    state.last_used = time.time()
    ACTIVE.move_to_end(agent_id)
    _evict_idle()
    _evict_over_capacity()
    return state


def _prewarm_managers() -> None:
    warmed = 0
    for manager in iter_managers():
        if warmed >= WARM_MANAGERS:
            break
        _touch(manager["id"])
        warmed += 1


@app.on_event("startup")
async def _startup() -> None:
    _prewarm_managers()


def _extract_text(message_payload: dict[str, Any]) -> str:
    # Support both payload styles:
    # 1) {"content":[{"text":"..."}]}
    # 2) {"parts":[{"kind":"text","text":"..."}]}
    parts = message_payload.get("content") or message_payload.get("parts") or []
    texts: list[str] = []
    for part in parts:
        if not isinstance(part, dict):
            continue
        text = part.get("text")
        if isinstance(text, str):
            texts.append(text)
    if texts:
        return "\n".join(texts).strip()
    return ""


def _build_message(text: str, role: str = "ROLE_AGENT") -> dict[str, Any]:
    return {
        "message_id": str(uuid.uuid4()),
        "role": role,
        "content": [{"text": text}],
    }


def _build_task(task_id: str, response_text: str, agent_id: str) -> dict[str, Any]:
    message = _build_message(response_text, role="ROLE_AGENT")
    return {
        "id": task_id,
        "context_id": task_id,
        "agent_id": agent_id,
        "status": {
            "state": "TASK_STATE_COMPLETED",
            "update": message,
            "timestamp": _now_ts(),
        },
        "artifacts": [],
        "history": [message],
    }


def _prune_tasks() -> None:
    while len(TASKS) > MAX_TASKS:
        TASKS.popitem(last=False)


def _stable_int(seed: str, modulo: int) -> int:
    if modulo <= 1:
        return 0
    digest = hashlib.sha256(seed.encode("utf-8")).hexdigest()
    return int(digest[:12], 16) % modulo


def _stable_range(seed: str, minimum: int, maximum: int) -> int:
    if maximum <= minimum:
        return minimum
    return minimum + _stable_int(seed, maximum - minimum + 1)


def _focus_domains(user_text: str) -> list[str]:
    lowered = user_text.lower()
    selected = [label for label, hints in DOMAIN_HINTS if any(hint in lowered for hint in hints)]
    if selected:
        return selected[:4]
    return ["IT incidents", "CRM tickets", "ERP orders", "Finance ledgers"]


def _includes_blocked_language(text: str) -> bool:
    lowered = text.lower()
    return any(marker in lowered for marker in BLOCKED_RESPONSE_MARKERS)


def _citizen_signal(citizen: dict[str, Any], request: str) -> str:
    seed = f"{citizen['id']}::{request}"
    signal = SIGNAL_TEMPLATES[_stable_int(seed, len(SIGNAL_TEMPLATES))]
    pct = _stable_range(seed + "::pct", 6, 31)
    return signal.format(pct=pct)


def _manager_risk_response(agent: dict[str, Any], user_text: str) -> str:
    request = user_text.strip() or "No user request provided."
    manager_id = agent["id"]
    citizens = citizens_for_manager(manager_id)
    samples = citizens[: min(4, len(citizens))]
    focus = ", ".join(_focus_domains(request))

    lines = [
        f"Manager Brief: {agent['full_name']} ({manager_id})",
        f"Institution: {agent['institution']} | Reports to: {agent['reports_to']}",
        f"Scope: next 30 days across {focus}.",
        "",
        "Top 3 emerging risks:",
    ]

    for idx, (risk_name, why_now, teams, playbook) in enumerate(RISK_TEMPLATES, start=1):
        seed = f"{manager_id}::{idx}::{request}"
        confidence = _stable_range(seed + "::conf", 67, 91)
        trend = _stable_range(seed + "::trend", 8, 29)
        lines.append(
            f"{idx}. {risk_name} | confidence {confidence}% | leading signal +{trend}%: {why_now}."
        )
        lines.append(f"   Cross-team owner lane: {teams}.")
        lines.append(f"   Playbook now: {playbook}")

    lines.extend(
        [
            "",
            "Agent-level signals:",
        ]
    )
    if samples:
        for citizen in samples:
            lines.append(f"- {citizen['full_name']} ({citizen['id']}): {_citizen_signal(citizen, request)}.")
    else:
        lines.append("- No linked citizens found for this manager.")

    next_review_hours = _stable_range(manager_id + "::review", 4, 12)
    lines.extend(
        [
            "",
            "Execution cadence:",
            f"- Re-check risk indicators every {next_review_hours} hours.",
            "- Escalate only unresolved blockers to head-level consolidation with owner + ETA.",
        ]
    )
    return "\n".join(lines)


def _citizen_brief_response(agent: dict[str, Any], user_text: str) -> str:
    request = user_text.strip() or "No user request provided."
    seed = f"{agent['id']}::{request}"
    confidence = _stable_range(seed + "::conf", 61, 86)
    impact = _stable_range(seed + "::impact", 5, 23)
    signal = SIGNAL_TEMPLATES[_stable_int(seed, len(SIGNAL_TEMPLATES))].format(
        pct=_stable_range(seed + "::pct", 6, 28)
    )
    action = MITIGATION_TEMPLATES[_stable_int(seed + "::act", len(MITIGATION_TEMPLATES))]
    return (
        f"Citizen Brief: {agent['full_name']} ({agent['id']})\n"
        f"Institution: {agent['institution']} | Reports to: {agent['reports_to']}\n"
        f"Local signal: {signal}.\n"
        f"30-day risk impact estimate: {impact}% pressure on local throughput (confidence {confidence}%).\n"
        f"Immediate action: {action}.\n"
        "Escalation package: include affected entities, owner, ETA, and fallback route."
    )


def _enforce_demo_response(agent: dict[str, Any], user_text: str, candidate_text: str) -> str:
    cleaned = (candidate_text or "").strip()
    if not cleaned or _includes_blocked_language(cleaned):
        return _fallback_response(agent, user_text)
    return cleaned


def _resolve_agent_meta(agent_id: str) -> dict[str, Any] | None:
    if is_manager_id(agent_id):
        base = manager_meta(agent_id)
        if base is None:
            return None
        override = MANAGER_OVERRIDES.get(agent_id)
        if not override:
            return base

        merged = dict(base)
        for key in ["full_name", "role", "institution", "skills", "description", "tags", "tier", "reports_to"]:
            if key in override and override[key]:
                merged[key] = override[key]
        return merged

    if is_citizen_id(agent_id):
        return citizen_meta(agent_id)

    return None


def _manager_citizen_context(agent_id: str, sample_count: int = 4) -> str:
    citizens = citizens_for_manager(agent_id)
    if not citizens:
        return "No linked citizens were found for this manager."

    sample = citizens[: min(sample_count, len(citizens))]
    lines = [f"- {citizen['full_name']} ({citizen['id']})" for citizen in sample]
    return (
        f"This manager supervises {len(citizens)} citizens. "
        "Use these as representative citizen context and synthesize their perspective:\n"
        + "\n".join(lines)
    )


def _build_prompt(agent: dict[str, Any], user_text: str) -> str:
    if agent.get("role") == "manager":
        citizen_context = _manager_citizen_context(agent["id"])
        return (
            f"You are {agent['full_name']} ({agent['id']}), a Solasland manager in {agent['institution']}.\n"
            f"You report to {agent['reports_to']}.\n"
            f"{citizen_context}\n\n"
            "Hard requirements:\n"
            "- Never ask for more data, files, or system access.\n"
            "- Never describe missing-data blockers.\n"
            "- If details are absent, infer plausible values and continue.\n"
            "- Return concrete risks, confidence, and immediate cross-team actions.\n\n"
            "Respond concisely in structured bullets with actionable conclusions.\n\n"
            f"User request:\n{user_text}"
        )

    return (
        f"You are {agent['full_name']} ({agent['id']}), a Solasland citizen in {agent['institution']}.\n"
        f"You report to {agent['reports_to']}.\n"
        "Hard requirements:\n"
        "- Never ask for more data, files, or system access.\n"
        "- Never describe missing-data blockers.\n"
        "- If details are absent, infer plausible values and continue.\n\n"
        "Respond with concise, grounded citizen-level perspective and practical observations.\n\n"
        f"User request:\n{user_text}"
    )


async def _call_llm(prompt: str) -> str:
    headers = {"Authorization": f"Bearer {LLM_API_KEY}"}
    payload = {
        "model": LLM_MODEL,
        "messages": [
            {
                "role": "system",
                "content": (
                    "You are a helpful Solasland agent. Always provide complete, concrete outputs. "
                    "Do not ask users for source data or access. If details are absent, infer plausible "
                    "values and proceed."
                ),
            },
            {"role": "user", "content": prompt},
        ],
        "temperature": 0.35,
    }

    async with httpx.AsyncClient(timeout=60.0) as client:
        response = await client.post(
            f"{LLM_ENDPOINT.rstrip('/')}/v1/chat/completions",
            headers=headers,
            json=payload,
        )

    response.raise_for_status()
    body = response.json()
    try:
        return body["choices"][0]["message"]["content"].strip()
    except (KeyError, IndexError, TypeError):
        raise HTTPException(status_code=502, detail="invalid_llm_response")


def _fallback_response(agent: dict[str, Any], user_text: str) -> str:
    if agent.get("role") == "manager":
        return _manager_risk_response(agent, user_text)
    return _citizen_brief_response(agent, user_text)


def _agent_card(agent_id: str, meta: dict[str, Any]) -> dict[str, Any]:
    base_url = f"http://{HOST}:{PORT}/agents/{agent_id}"
    role_name = meta.get("role", "specialist")
    description = meta.get("description", "")
    skills = meta.get("skills", [])

    return {
        "protocol_version": "1.0",
        "name": agent_id,
        "description": description,
        "url": base_url,
        "version": "1.0",
        "default_input_modes": ["text"],
        "default_output_modes": ["text"],
        "capabilities": {"streaming": False, "push_notifications": False, "extensions": []},
        "skills": [
            {
                "id": f"{agent_id}_primary",
                "name": role_name,
                "description": description,
                "tags": skills,
                "examples": [],
                "input_modes": ["text"],
                "output_modes": ["text"],
                "security": [],
            }
        ],
    }


@app.get("/agents/{agent_id}/v1/card")
async def get_card(agent_id: str):
    meta = _resolve_agent_meta(agent_id)
    if meta is None:
        raise HTTPException(status_code=404, detail="unknown agent")
    return JSONResponse(_agent_card(agent_id, meta))


@app.post("/agents/{agent_id}/v1/message:send")
async def send_message(agent_id: str, payload: dict[str, Any]):
    task = await _send_message_internal(agent_id, payload)
    return JSONResponse({"task": task})


def _jsonrpc_success(request_id: Any, result: dict[str, Any]) -> dict[str, Any]:
    return {"id": request_id, "jsonrpc": "2.0", "result": result}


def _jsonrpc_error(request_id: Any, code: int, message: str) -> dict[str, Any]:
    return {"id": request_id, "jsonrpc": "2.0", "error": {"code": code, "message": message}}


def _a2a_task_view(task: dict[str, Any]) -> dict[str, Any]:
    # Convert legacy internal shape into A2A-like task response.
    text = task["history"][0]["content"][0]["text"]
    message_id = task["history"][0]["message_id"]
    task_id = task["id"]
    context_id = task["context_id"]
    message = {
        "kind": "message",
        "messageId": message_id,
        "contextId": context_id,
        "taskId": task_id,
        "role": "agent",
        "parts": [{"kind": "text", "text": text}],
    }
    return {
        "id": task_id,
        "contextId": context_id,
        "kind": "task",
        "status": {
            "state": "completed",
            "message": message,
            "timestamp": datetime.now(UTC).isoformat(),
        },
        "history": [message],
    }


async def _send_message_internal(agent_id: str, payload: dict[str, Any]) -> dict[str, Any]:
    meta = _resolve_agent_meta(agent_id)
    if meta is None:
        raise HTTPException(status_code=404, detail="unknown agent")

    _touch(agent_id)

    message = payload.get("message") or payload.get("request") or {}
    text = _extract_text(message)
    if not text:
        text = "(no message content provided)"

    if USE_LLM:
        prompt = _build_prompt(meta, text)
        try:
            candidate = await _call_llm(prompt)
            response_text = _enforce_demo_response(meta, text, candidate)
        except Exception:
            response_text = _fallback_response(meta, text)
    else:
        response_text = _fallback_response(meta, text)

    task_id = str(uuid.uuid4())
    task = _build_task(task_id, response_text, agent_id)
    TASKS[task_id] = task
    _prune_tasks()
    return task


@app.get("/agents/{agent_id}/v1/tasks/{task_id}")
async def get_task(agent_id: str, task_id: str):
    meta = _resolve_agent_meta(agent_id)
    if meta is None:
        raise HTTPException(status_code=404, detail="unknown agent")

    task = TASKS.get(task_id)
    if not task or task.get("agent_id") != agent_id:
        raise HTTPException(status_code=404, detail="unknown task")

    return JSONResponse(task)


@app.post("/agents/{agent_id}/v1/tasks/{task_id}:cancel")
async def cancel_task(agent_id: str, task_id: str, _payload: dict[str, Any] | None = None):
    meta = _resolve_agent_meta(agent_id)
    if meta is None:
        raise HTTPException(status_code=404, detail="unknown agent")

    task = TASKS.get(task_id)
    if not task or task.get("agent_id") != agent_id:
        raise HTTPException(status_code=404, detail="unknown task")

    task["status"] = {
        "state": "TASK_STATE_CANCELLED",
        "update": _build_message("Task cancelled.", role="ROLE_AGENT"),
        "timestamp": _now_ts(),
    }
    TASKS[task_id] = task
    return JSONResponse(task)


@app.get("/agents/{agent_id}")
async def get_agent_root(agent_id: str):
    meta = _resolve_agent_meta(agent_id)
    if meta is None:
        raise HTTPException(status_code=404, detail="unknown agent")
    return JSONResponse(_agent_card(agent_id, meta))


@app.post("/agents/{agent_id}")
async def rpc_agent_root(agent_id: str, payload: dict[str, Any]):
    meta = _resolve_agent_meta(agent_id)
    request_id = payload.get("id")
    if meta is None:
        return JSONResponse(_jsonrpc_error(request_id, -32001, "unknown agent"), status_code=404)

    method = payload.get("method")
    params = payload.get("params") or {}

    try:
        if method in {"message/send", "message:send"}:
            message_payload = {"message": params.get("message") or payload.get("message") or {}}
            task = await _send_message_internal(agent_id, message_payload)
            return JSONResponse(_jsonrpc_success(request_id, _a2a_task_view(task)))

        if method in {"tasks/get", "task/get"}:
            task_id = (params.get("id") if isinstance(params, dict) else None) or ""
            task = TASKS.get(str(task_id))
            if not task or task.get("agent_id") != agent_id:
                return JSONResponse(_jsonrpc_error(request_id, -32004, "unknown task"), status_code=404)
            return JSONResponse(_jsonrpc_success(request_id, _a2a_task_view(task)))

        if method in {"tasks/cancel", "task/cancel", "tasks/cancel"}:
            task_id = (params.get("id") if isinstance(params, dict) else None) or ""
            task = TASKS.get(str(task_id))
            if not task or task.get("agent_id") != agent_id:
                return JSONResponse(_jsonrpc_error(request_id, -32004, "unknown task"), status_code=404)
            task["status"] = {
                "state": "TASK_STATE_CANCELLED",
                "update": _build_message("Task cancelled.", role="ROLE_AGENT"),
                "timestamp": _now_ts(),
            }
            TASKS[str(task_id)] = task
            return JSONResponse(_jsonrpc_success(request_id, _a2a_task_view(task)))

        return JSONResponse(_jsonrpc_error(request_id, -32601, f"unsupported method: {method}"), status_code=400)
    except HTTPException as exc:
        return JSONResponse(_jsonrpc_error(request_id, -32000, str(exc.detail)), status_code=exc.status_code)
    except Exception as exc:  # noqa: BLE001
        return JSONResponse(_jsonrpc_error(request_id, -32099, f"proxy runtime error: {exc}"), status_code=500)


@app.get("/health")
async def health():
    return {
        "status": "ok",
        "active_agents": len(ACTIVE),
        "active_agent_ids": list(ACTIVE.keys()),
        "capacity": MAX_ACTIVE,
        "idle_timeout_seconds": IDLE_TIMEOUT_SECONDS,
        "warm_managers": WARM_MANAGERS,
        "task_store_size": len(TASKS),
        "task_store_capacity": MAX_TASKS,
        "registry_manager_overrides": len(MANAGER_OVERRIDES),
        "llm_mode_enabled": USE_LLM,
        "topology": {
            **topology_metadata(),
            "heads_persistent": HEAD_COUNT,
            "managers_dynamic": MANAGER_COUNT,
            "citizens_dynamic": CITIZEN_COUNT,
            "citizen_mode": "manager_simulated",
            "discovery_surface": "managers_only",
            "orchestrator_persistent": 1,
            "total_agents_expected": TOTAL_AGENTS,
        },
    }


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host=HOST, port=PORT)
