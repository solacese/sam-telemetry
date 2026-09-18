# sam-telemetry

Solace Agent Mesh examples with a static observability and operations dashboard suite.

## Published dashboard

The GitHub Pages source of truth is [`docs/`](docs/). It contains five browser-native dashboards with no package install, build step, or external runtime dependency:

- Agent inventory
- Governance and compliance
- Workflow replay
- Cost and ROI scenario
- Observability

Serve it locally from the repository root:

```bash
python3 -m http.server 8000 --directory docs
```

Then open `http://localhost:8000/`.

### Canonical scenario model

The dashboard uses exactly **89 agents** generated from one shared module:

- 1 group orchestrator
- 4 domain heads
- 84 specialists, 21 in each banking domain
- 22 agents per domain when its head is included
- Platform totals: 31 Databricks, 14 Salesforce, 23 Mistral, and 21 Claude

All dashboard values are deterministic, synthetic scenario data from a fixed April 2026 snapshot. The site has no live backend connection and must not be interpreted as production monitoring, regulatory certification, a commercial estimate, or Solace pricing.

### Presentation modes

The global **Native / Datadog-like** control changes presentation density over the same data. Datadog-like is labeled as a synthetic integration preview; it is not a data-source switch and does not imply affiliation. The choice is stored in `localStorage` when available and is shareable with `?view=native` or `?view=datadog`.

### Observability semantics

The observability page is a static reference model for structured operational logs, Prometheus-compatible `/metrics`, optional OTLP metrics/log export, health semantics, and application-level `traceID` task-event correlation. It does not inspect the repository runtime or prove these integrations are configured. The synthetic `traceID` values are correlation IDs, not OpenTelemetry trace context. Agent Mesh does not emit distributed spans or provide a tracing collector, so the workflow replay is an event trail rather than a distributed-trace waterfall.

Historical standalone copies under `static/bnpp/` are intentionally not part of the published source and remain unchanged.

## Runtime example

The separate runtime example uses the following project structure:

- `src/`: runtime services (`micro_a2a_service.py`, topology model, launcher)
- `scripts/`: generation and run/stop scripts
- `configs/`: Agent Mesh agent, service, and gateway configuration
- `static/`: historical/static visualizations

### Quick start

1. Create a Python virtual environment and install dependencies:
   ```bash
   python3 -m venv .venv
   source .venv/bin/activate
   pip install -r requirements.txt
   ```
2. Create local environment configuration:
   ```bash
   cp .env.example .env
   ```
3. Fill `.env` with broker and model-provider values.
4. Start the stack:
   ```bash
   bash scripts/run_solasland_hierarchy.sh
   ```

### Runtime health endpoints

- Web UI / gateway: `http://127.0.0.1:8000/health`
- micro-A2A: `http://127.0.0.1:9100/health`

### Stop

```bash
bash scripts/stop_solasland.sh all
```

### Regeneration

```bash
python3 scripts/generate_hierarchy.py
python3 scripts/generate_agent_registry.py
```
