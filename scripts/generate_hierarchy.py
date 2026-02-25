#!/usr/bin/env python3
from __future__ import annotations

import json
import sys
from pathlib import Path

ROOT = Path("/Users/raphaelcaillon/Documents/github/country-of-geniuses")
SRC_DIR = ROOT / "src"
if str(SRC_DIR) not in sys.path:
    sys.path.insert(0, str(SRC_DIR))

from solasland_topology import (  # noqa: E402
    HEADS,
    HEAD_COUNT,
    MANAGER_COUNT,
    iter_managers,
    topology_metadata,
)

AGENTS_DIR = ROOT / "configs" / "agents"
REMOTE_REGISTRY = ROOT / "configs" / "remote_agent_registry.json"
PROXY_YAML = AGENTS_DIR / "solasland_remote_proxy.yaml"

HEAD_LEADS = [
    "Amara Kumar",
    "Diego Chen",
    "Nina Silva",
    "Rafael Hassan",
    "Maya Ibrahim",
    "Aya Novak",
    "Leila Petrov",
    "Jonas Romero",
    "Sofia Kim",
    "Tariq Lopes",
]


def _write_head_yaml(agent_id: str, full_name: str, title: str, institution: str) -> None:
    log_file = f"{agent_id}.log"
    db_file = f"/tmp/{agent_id}.db"
    topic = f"solasland/head/{institution}/{agent_id}"

    content = f"""# Solace Agent Mesh Agent Configuration

log:
  stdout_log_level: INFO
  log_file_level: DEBUG
  log_file: {log_file}

!include ../shared_config.yaml

apps:
  - name: "{agent_id}__app"
    app_base_path: .
    app_module: solace_agent_mesh.agent.sac.app
    broker:
      <<: *broker_connection

    app_config:
      namespace: "${{NAMESPACE}}"
      supports_streaming: true
      agent_name: "{agent_id}"
      display_name: "{full_name} - {title}"
      model: *general_model

      instruction: |
        You are {full_name}, {title} in Solasland.
        Institution: {institution}
        Role: head
        Communicate via Solace events on topic `{topic}`.
        You coordinate managers and summarize outcomes for the orchestrator.
        Keep manager fan-out efficient and synthesize citizen input through manager summaries.
        This deployment is in demo mode.
        When concrete values are missing, generate plausible and internally consistent
        operational details (metrics, timelines, entities, outcomes).
        Keep generated facts coherent within the same conversation.
        Never ask for additional data files, live system access, or user confirmation to proceed.
        Never describe missing-data blockers, constraints, or data availability issues.
        Always return complete recommendations with confidence and concrete immediate actions.
        Do not mention or imply that data is simulated, synthetic, mock, fake, or demo-only.
        Provide concise, structured outputs.

      tools:
        - tool_type: builtin-group
          group_name: artifact_management
        - tool_type: builtin-group
          group_name: general

      session_service:
        type: "sql"
        default_behavior: "PERSISTENT"
        database_url: "sqlite:///{db_file}"
      artifact_service: *default_artifact_service

      artifact_handling_mode: "reference"
      enable_embed_resolution: true
      enable_artifact_content_instruction: true
      data_tools_config: *default_data_tools_config

      agent_card:
        description: |
          {title} coordinating {institution}.
        defaultInputModes: [text]
        defaultOutputModes: [text, file]
        skills: []

      agent_card_publishing:
        interval_seconds: 10
      agent_discovery:
        enabled: true
      inter_agent_communication:
        allow_list: ["*"]
        deny_list: []
        request_timeout_seconds: 600
"""
    (AGENTS_DIR / f"{agent_id}.yaml").write_text(content, encoding="utf-8")


def _build_proxy_yaml(managers: list[dict]) -> str:
    lines = [
        "# Remote A2A Proxy for Solasland micro-A2A service",
        "",
        "log:",
        "  stdout_log_level: INFO",
        "  log_file_level: DEBUG",
        "  log_file: a2a_remote_proxy.log",
        "",
        "!include ../shared_config.yaml",
        "",
        "apps:",
        "  - name: solasland_remote_proxy_app",
        "    app_base_path: .",
        "    app_module: solace_agent_mesh.agent.proxies.a2a.app",
        "    broker:",
        "      <<: *broker_connection",
        "    app_config:",
        "      namespace: ${NAMESPACE}",
        "      artifact_service:",
        "        type: filesystem",
        "        base_path: /tmp/samv2",
        "        artifact_scope: namespace",
        "      artifact_handling_mode: reference",
        "      discovery_interval_seconds: 10",
        "      tools:",
        "        - group_name: artifact_management",
        "          tool_type: builtin-group",
        "      proxied_agents:",
    ]

    for manager in managers:
        agent_id = manager["id"]
        lines.extend(
            [
                f"        - name: {agent_id}",
                f"          url: http://127.0.0.1:9100/agents/{agent_id}",
                "          agent_card_path: /v1/card",
                "          use_agent_card_url: true",
            ]
        )

    return "\n".join(lines) + "\n"


def main() -> None:
    AGENTS_DIR.mkdir(parents=True, exist_ok=True)

    for path in AGENTS_DIR.glob("solasland_head_*.yaml"):
        path.unlink()
    if PROXY_YAML.exists():
        PROXY_YAML.unlink()

    for idx, ((institution, title), full_name) in enumerate(zip(HEADS, HEAD_LEADS), start=1):
        agent_id = f"solasland_head_{institution}"
        _write_head_yaml(agent_id, full_name, title, institution)

    managers = [manager for manager in iter_managers()]

    payload = {
        "topology": {
            **topology_metadata(),
            "heads_persistent": HEAD_COUNT,
            "managers_discovery_surface": MANAGER_COUNT,
            "citizen_mode": "manager_simulated",
            "discovery_surface": "managers_only",
        },
        "agents": managers,
    }
    REMOTE_REGISTRY.write_text(json.dumps(payload, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")

    PROXY_YAML.write_text(_build_proxy_yaml(managers), encoding="utf-8")

    print(f"Heads: {HEAD_COUNT} written to {AGENTS_DIR}")
    print(f"Remote manager registry written to {REMOTE_REGISTRY} (managers={len(managers)})")
    print(f"Proxy config written to {PROXY_YAML} (managers={len(managers)}, citizens=0 listed)")


if __name__ == "__main__":
    main()
