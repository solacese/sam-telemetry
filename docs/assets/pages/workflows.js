import { workflows, agentById, domains, platforms, sumBy } from '../data.js';
import { renderShell, escapeHTML, formatCurrency, formatDuration, statusBadge, announce } from '../app.js';

const mount = renderShell({
  page: 'workflows', title: 'Workflow replay',
  description: 'Replay sample task events from entrypoint through the event broker, Agent/Workflow stage, secure tool runtime and tool.', kicker: 'Task event correlation'
});
let scenarioIndex = 0;
let currentStep = 0;
let playing = false;
let speed = 1000;
let timer = null;

mount.innerHTML = `
  <aside class="callout" role="note"><strong>Event trail, not distributed tracing.</strong> Every event shares one immutable UUIDv7 <code>traceID</code> for correlation. Agent Mesh does not emit spans, span IDs, parent-child timing or a trace waterfall.</aside>
  <div class="section-heading"><div><p class="eyebrow">Four scenario replays</p><h2>Choose a banking task</h2></div></div>
  <div class="replay-layout">
    <aside class="panel panel-pad"><div id="scenario-list" class="scenario-list" aria-label="Workflow scenarios"></div></aside>
    <section class="panel panel-pad">
      <div id="workflow-header"></div>
      <div id="workflow-kpis" class="kpi-grid"></div>
      <div class="replay-toolbar" aria-label="Replay controls">
        <button id="previous" class="button" type="button">Previous event</button>
        <button id="play" class="button primary" type="button">Play</button>
        <button id="step" class="button" type="button">Next event</button>
        <button id="reset" class="button" type="button">Reset</button>
        <div class="field"><label for="speed">Speed</label><select id="speed"><option value="1600">0.5×</option><option value="1000" selected>1×</option><option value="500">2×</option><option value="250">4×</option></select></div>
      </div>
      <div id="event-sequence" class="event-sequence" aria-label="Task event sequence"></div>
      <div id="event-table" class="table-wrap event-table"></div>
    </section>
  </div>`;

function scenario() { return workflows[scenarioIndex]; }
function totalDuration(workflow) { return sumBy(workflow.events, 'duration'); }
function totalCost(workflow) { return workflow.events.reduce((sum, event) => sum + (event.agentId ? (agentById.get(event.agentId)?.telemetry.monthlyCost || 0) / Math.max(agentById.get(event.agentId)?.telemetry.executions || 1, 1) : 0.004), 0); }
function stop() { playing = false; clearTimeout(timer); timer = null; }
function tick() {
  if (!playing) return;
  if (currentStep >= scenario().events.length) { stop(); render(); announce('Workflow replay complete'); return; }
  currentStep += 1; render();
  timer = setTimeout(tick, speed);
}
function selectScenario(index) { stop(); scenarioIndex = index; currentStep = 0; render(); }

function render() {
  const workflow = scenario();
  mount.querySelector('#scenario-list').innerHTML = workflows.map((item, index) => `<button class="scenario-button" type="button" data-scenario="${index}" aria-pressed="${index === scenarioIndex}"><strong>${escapeHTML(item.name)}</strong><span>${item.events.length} events · ${formatDuration(totalDuration(item))}</span></button>`).join('');
  mount.querySelectorAll('[data-scenario]').forEach(button => button.addEventListener('click', () => selectScenario(Number(button.dataset.scenario))));
  mount.querySelector('#workflow-header').innerHTML = `<p class="eyebrow">Selected scenario</p><h2>${escapeHTML(workflow.name)}</h2><p class="section-note">${escapeHTML(workflow.description)}</p><div class="trace-id"><strong>Correlation query</strong><span>@traceID:${escapeHTML(workflow.traceID)}</span></div>`;
  const involvedAgents = new Set(workflow.events.map(event => event.agentId).filter(Boolean));
  const stages = new Set(workflow.events.map(event => event.stage));
  mount.querySelector('#workflow-kpis').innerHTML = [
    ['Events', workflow.events.length, `${currentStep} replayed`], ['Agent participants', involvedAgents.size, 'Canonical inventory references'], ['Stages', stages.size, 'One sequential task trail'], ['Illustrative task cost', formatCurrency(totalCost(workflow)), 'Derived from shared unit model']
  ].map(([label,value,meta]) => `<article class="kpi-card"><span class="label">${label}</span><strong class="value">${value}</strong><span class="meta">${meta}</span></article>`).join('');
  mount.querySelector('#play').textContent = playing ? 'Pause' : currentStep >= workflow.events.length ? 'Replay' : 'Play';
  mount.querySelector('#event-sequence').innerHTML = workflow.events.map((event, index) => `<article class="event-node ${index < currentStep ? 'active' : ''} ${index === currentStep - 1 ? 'current' : ''}"><button class="event-number" type="button" data-event="${index}" aria-label="Show event ${index + 1}: ${escapeHTML(event.operation)}">${index + 1}</button><h3>${escapeHTML(event.stage)}</h3><p>${escapeHTML(event.operation)}</p><small>${formatDuration(event.duration)}${event.agentId ? ` · ${escapeHTML(agentById.get(event.agentId).name)}` : ''}</small></article>`).join('');
  mount.querySelector('#event-table').innerHTML = `<table><caption>Event data for ${escapeHTML(workflow.name)}. Select a row to move the replay.</caption><thead><tr><th scope="col">#</th><th scope="col">Timestamp</th><th scope="col">Stage</th><th scope="col">Operation</th><th scope="col">Agent / platform</th><th scope="col">Outcome</th><th scope="col" class="numeric">Duration</th></tr></thead><tbody>${workflow.events.map((event,index) => { const agent = event.agentId ? agentById.get(event.agentId) : null; return `<tr class="${index < currentStep ? 'active' : ''} ${index === currentStep - 1 ? 'current' : ''}" data-event-row="${index}"><td>${index + 1}</td><td>${new Date(event.timestamp).toISOString().slice(11,23)}</td><td>${escapeHTML(event.stage)}</td><td>${escapeHTML(event.operation)}</td><td>${agent ? `${escapeHTML(agent.name)}<br><small>${escapeHTML(domains[agent.domain].short)} · ${escapeHTML(platforms[agent.platform].label)}</small>` : 'System stage'}</td><td>${statusBadge(event.outcome === 'ok' ? 'Completed' : 'Review', event.outcome === 'ok' ? 'good' : 'warning')}</td><td class="numeric">${formatDuration(event.duration)}</td></tr>`; }).join('')}</tbody></table>`;
  mount.querySelectorAll('[data-event], [data-event-row]').forEach(element => element.addEventListener('click', () => { stop(); currentStep = Number(element.dataset.event ?? element.dataset.eventRow) + 1; render(); announce(`Moved to event ${currentStep}`); }));
}

mount.querySelector('#play').addEventListener('click', () => {
  if (playing) { stop(); render(); return; }
  if (currentStep >= scenario().events.length) currentStep = 0;
  playing = true; render(); timer = setTimeout(tick, 250);
});
mount.querySelector('#previous').addEventListener('click', () => { stop(); currentStep = Math.max(0, currentStep - 1); render(); });
mount.querySelector('#step').addEventListener('click', () => { stop(); currentStep = Math.min(scenario().events.length, currentStep + 1); render(); });
mount.querySelector('#reset').addEventListener('click', () => { stop(); currentStep = 0; render(); announce('Workflow replay reset'); });
mount.querySelector('#speed').addEventListener('change', event => { speed = Number(event.target.value); if (playing) { clearTimeout(timer); timer = setTimeout(tick, speed); } });
render();
