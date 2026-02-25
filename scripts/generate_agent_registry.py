#!/usr/bin/env python3
import json
import os
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
AGENTS_DIR = ROOT / "configs" / "agents"
OUT_PATH = ROOT / "configs" / "agent_registry.json"

AGENT_NAME_RE = re.compile(r"^\s*agent_name:\s*\"([^\"]+)\"", re.MULTILINE)
INSTRUCTION_BLOCK_RE = re.compile(r"instruction:\s*\|\n((?:\s{8}.*\n)*)")
ROLE_RE = re.compile(r"^\s*Role:\s*(.+)\s*$", re.MULTILINE)
INST_RE = re.compile(r"^\s*Institution:\s*(.+)\s*$", re.MULTILINE)
TOPIC_RE = re.compile(r"topic `([^`]+)`")


def infer_institution(agent_id: str) -> str:
    if agent_id.startswith("solasland_head_"):
        return agent_id.replace("solasland_head_", "")
    if agent_id.startswith("solasland_math_"):
        return "math"
    if agent_id.startswith("solasland_company_alpha_"):
        return "company_alpha"
    if agent_id.startswith("solasland_company_beta_"):
        return "company_beta"
    if agent_id.startswith("solasland_company_gamma_"):
        return "company_gamma"
    if agent_id.startswith("solasland_company_delta_"):
        return "company_delta"
    if agent_id.startswith("solasland_company_epsilon_"):
        return "company_epsilon"
    if agent_id.startswith("solasland_government_"):
        return "government"
    if agent_id.startswith("solasland_education_"):
        return "education"
    if agent_id.startswith("solasland_healthcare_"):
        return "healthcare"
    if agent_id.startswith("solasland_research_"):
        return "research"
    if agent_id.startswith("solasland_infra_"):
        return "infrastructure"
    if agent_id.startswith("solasland_media_"):
        return "media"
    if agent_id.startswith("solasland_legal_"):
        return "legal"
    return "unknown"


def extract_fields(text: str) -> dict:
    m_agent = AGENT_NAME_RE.search(text)
    agent_id = m_agent.group(1) if m_agent else None

    instruction = ""
    m_instr = INSTRUCTION_BLOCK_RE.search(text)
    if m_instr:
        # remove 8-space indent from instruction lines
        raw = m_instr.group(1)
        instruction = "".join(line[8:] if line.startswith(" " * 8) else line for line in raw.splitlines(True))

    role = None
    institution = None
    topic = None

    m_role = ROLE_RE.search(instruction)
    if m_role:
        role = m_role.group(1).strip()

    m_inst = INST_RE.search(instruction)
    if m_inst:
        institution = m_inst.group(1).strip()

    m_topic = TOPIC_RE.search(instruction)
    if m_topic:
        topic = m_topic.group(1).strip()

    if not institution and agent_id:
        institution = infer_institution(agent_id)

    return {
        "id": agent_id,
        "institution": institution or "unknown",
        "role": role or "unknown",
        "topic": topic or "unknown",
    }


def main() -> None:
    agents = []
    for path in sorted(AGENTS_DIR.glob("*.yaml")):
        name = path.name
        if name in {"main_orchestrator.yaml", "agent1_agent.yaml"}:
            continue
        if not name.startswith("solasland_"):
            continue
        if name.endswith("_proxy.yaml"):
            continue
        text = path.read_text(encoding="utf-8")
        fields = extract_fields(text)
        if not fields.get("id"):
            continue
        fields["yaml_path"] = str(path)
        agents.append(fields)

    namespace = os.environ.get("NAMESPACE", "default_namespace/")
    payload = {"namespace": namespace, "agents": agents}

    OUT_PATH.write_text(json.dumps(payload, indent=2), encoding="utf-8")
    print(f"Wrote {len(agents)} agents to {OUT_PATH}")


if __name__ == "__main__":
    main()
