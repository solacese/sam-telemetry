import { agents, domains, platforms, observability, workflows, agentById } from '../data.js';
import { renderShell, escapeHTML, formatNumber, formatDuration, statusBadge, emptyState, sectionHeader, setupFilterDrawer } from '../app.js';
import { renderLineChart } from '../charts.js';

const mount = renderShell({
  page: 'observability', title: 'Observability',
  description: 'Explore a static reference model for operational logs, Prometheus-compatible metrics, optional OTLP export and application traceID task-event correlation.', kicker: 'Signals and health semantics'
});
const state = { domain: 'all', platform: 'all', status: 'all', logLevel: 'all', logQuery: '' };

mount.innerHTML = `
  <aside class="callout" role="note"><strong>Static capability reference.</strong> This page visualises documented Agent Mesh observability concepts with synthetic records; it does not inspect this repository's runtime or prove that metrics, OTLP export, health probes, or traceID propagation are configured. The displayed <code>traceID</code> is an application correlation ID, not OpenTelemetry trace context. Agent Mesh does not emit distributed spans or provide a tracing collector.</aside>
  <div id="obs-kpis" class="kpi-grid six" style="margin-top:16px"></div>
  <div class="section-heading"><div><p class="eyebrow">Global scope</p><h2>Signal filters</h2></div><button class="filter-trigger" data-filter-trigger aria-expanded="false" aria-controls="obs-filters">Filters</button></div>
  <div id="obs-filters" class="panel filter-toolbar" data-filter-panel>
    <div class="filter-title"><strong class="sr-only">Filters</strong><button class="icon-button filter-close" data-filter-close type="button" aria-label="Close filters">×</button></div>
    ${select('obs-domain','Domain',[['all','All domains'],...['cib','retail','risk','it'].map(key=>[key,domains[key].short])])}
    ${select('obs-platform','Platform',[['all','All platforms'],...Object.entries(platforms).map(([key,value])=>[key,value.label])])}
    ${select('obs-status','Availability',[['all','All states'],['available','Available'],['degraded','Degraded'],['unavailable','Unavailable']])}
    <button id="obs-reset" class="button" type="button">Reset</button>
  </div>
  ${sectionHeader('Signal pipeline', 'Supported paths')}
  <section class="panel panel-pad pipeline">
    <article class="pipeline-step"><strong>Agent Mesh runtime</strong><p>Documented instrumentation can produce operational metrics and structured logs.</p></article>
    <article class="pipeline-step"><strong>Prometheus endpoint</strong><p>A configured deployment can expose Prometheus-compatible <code>/metrics</code>.</p></article>
    <article class="pipeline-step"><strong>Optional OTLP export</strong><p>A configured deployment can export metrics and logs to a collector.</p></article>
    <article class="pipeline-step"><strong>Operator backend</strong><p>An external backend can build dashboards, alerts and log queries from those signals.</p></article>
  </section>
  <div class="grid-2 native-only">
    <section><div id="health-heading"></div><div id="health-list" class="panel health-list"></div></section>
    <section><div id="trend-heading"></div><div id="obs-trend" class="panel"></div></section>
  </div>
  <section>${sectionHeader('Metric explorer', 'Documented instruments', '<span class="chip">Prometheus-compatible</span>')}<div id="metric-grid" class="metric-grid"></div></section>
  <section>${sectionHeader('Agent signal inventory', 'Filtered shared model')}<div id="agent-signal-table" class="table-wrap"></div></section>
  <section>${sectionHeader('Structured log explorer', 'Synthetic integration preview', '<span class="chip">traceID correlation</span>')}
    <div class="panel panel-pad"><div class="log-toolbar"><div class="field"><label for="log-query">Query</label><input id="log-query" class="query-input" value="" placeholder="@traceID:… or message text"></div>${select('log-level','Level',[['all','All levels'],['INFO','INFO'],['WARN','WARN'],['ERROR','ERROR']])}<div class="field"><label for="log-scope">View</label><select id="log-scope"><option value="records">Records</option><option value="json">JSON fields</option></select></div></div><div id="log-list" class="log-list"></div></div>
  </section>
  <section>${sectionHeader('Task event trail', 'Correlated by traceID, not spans')}<div id="event-trail" class="table-wrap"></div></section>`;

function select(id,label,options){return `<div class="field"><label for="${id}">${label}</label><select id="${id}">${options.map(([value,text])=>`<option value="${value}">${escapeHTML(text)}</option>`).join('')}</select></div>`;}
function scopedAgents(){return agents.filter(agent=>(state.domain==='all'||agent.domain===state.domain)&&(state.platform==='all'||agent.platform===state.platform)&&(state.status==='all'||agent.telemetry.availability===state.status));}
function availabilityTone(value){return value==='available'?'good':value==='degraded'?'warning':'critical';}

function renderScope(){
  const scoped=scopedAgents();
  const scopedIds=new Set(scoped.map(agent=>agent.id));
  const available=scoped.filter(agent=>agent.telemetry.availability==='available').length;
  const degraded=scoped.filter(agent=>agent.telemetry.availability==='degraded').length;
  const unavailable=scoped.filter(agent=>agent.telemetry.availability==='unavailable').length;
  const avgSuccess=scoped.length?scoped.reduce((sum,a)=>sum+a.telemetry.successRate,0)/scoped.length:0;
  const avgLatency=scoped.length?scoped.reduce((sum,a)=>sum+a.telemetry.latencyP95,0)/scoped.length:0;
  mount.querySelector('#obs-kpis').innerHTML=[['Scoped agents',scoped.length,'Shared inventory'],['Available',available,'Agent-card availability'],['Degraded',degraded,'Individual availability'],['Unavailable',unavailable,'Individual availability'],['Success rate',`${avgSuccess.toFixed(1)}%`,'Workload outcome average'],['p95 latency',formatDuration(avgLatency),'Workload duration average']].map(([label,value,meta])=>`<article class="kpi-card"><span class="label">${label}</span><strong class="value">${value}</strong><span class="meta">${meta}</span></article>`).join('');
  mount.querySelector('#agent-signal-table').innerHTML=scoped.length?`<table><caption>${scoped.length} agents matching global filters</caption><thead><tr><th scope="col">Agent</th><th scope="col">Domain</th><th scope="col">Platform</th><th scope="col">Availability</th><th scope="col">Workload health</th><th scope="col" class="numeric">Success</th><th scope="col" class="numeric">p95</th></tr></thead><tbody>${scoped.map(agent=>`<tr><td><strong>${escapeHTML(agent.name)}</strong><br><small>${escapeHTML(agent.id)}</small></td><td>${escapeHTML(domains[agent.domain].short)}</td><td>${escapeHTML(platforms[agent.platform].label)}</td><td>${statusBadge(agent.telemetry.availability,availabilityTone(agent.telemetry.availability))}</td><td>${statusBadge(agent.telemetry.workload,agent.telemetry.workload==='healthy'?'good':agent.telemetry.workload==='warning'?'warning':'critical')}</td><td class="numeric">${agent.telemetry.successRate}%</td><td class="numeric">${formatDuration(agent.telemetry.latencyP95)}</td></tr>`).join('')}</tbody></table>`:emptyState('No agent signals match','Adjust the global signal filters.');
  renderLogs(scopedIds);
  renderEvents(scopedIds);
}

mount.querySelector('#health-heading').innerHTML=sectionHeader('Health model','Separate operational meanings');
mount.querySelector('#health-list').innerHTML=observability.health.map(item=>`<div class="health-row"><strong>${escapeHTML(item.layer)}</strong><span>${escapeHTML(item.signal)}</span>${statusBadge(item.status,item.status==='healthy'?'good':item.status==='degraded'?'warning':'serious')}<span>${escapeHTML(item.detail)}</span></div>`).join('');
mount.querySelector('#trend-heading').innerHTML=sectionHeader('Request trend','Fixed seven-hour sample');
renderLineChart(mount.querySelector('#obs-trend'),{id:'request-trend',title:'Entrypoint activity',description:'Requests and errors shown as separate same-unit counts.',rows:observability.trend,xKey:'time',series:[{key:'requests',label:'Requests',color:'#0077a3'},{key:'errors',label:'Errors',color:'#b4582f'}]});
mount.querySelector('#metric-grid').innerHTML=observability.instruments.map(metric=>`<article class="metric-card"><code>${escapeHTML(metric.name)}</code><strong>${escapeHTML(metric.type)}</strong><p>${escapeHTML(metric.description)}</p></article>`).join('');

function scopedTraceIDs(scopedIds){
  const allAgents=state.domain==='all'&&state.platform==='all'&&state.status==='all';
  return new Set(workflows.filter(workflow=>allAgents||workflow.events.some(event=>event.agentId&&scopedIds.has(event.agentId))).map(workflow=>workflow.traceID));
}
function renderLogs(scopedIds=new Set(scopedAgents().map(agent=>agent.id))){
  const query=state.logQuery.trim().toLowerCase();
  const traceIDs=scopedTraceIDs(scopedIds);
  const logs=observability.logRecords.filter(log=>traceIDs.has(log.traceID)&&(state.logLevel==='all'||log.level===state.logLevel)&&(!query||`@traceid:${log.traceID} ${log.message} ${log.component} ${log.operation}`.toLowerCase().includes(query)));
  const json=mount.querySelector('#log-scope').value==='json';
  mount.querySelector('#log-list').innerHTML=logs.length?logs.map(log=>`<div class="log-row"><span>${escapeHTML(log.timestamp)}</span><span class="log-level ${log.level}">${escapeHTML(log.level)}</span><span>${escapeHTML(log.component)}</span><span class="log-message"><strong>${escapeHTML(log.operation)}</strong>${json?escapeHTML(JSON.stringify(log)):escapeHTML(log.message)}<br><small>@traceID:${escapeHTML(log.traceID)}</small></span></div>`).join(''):`<div class="log-empty">No log records match this query.</div>`;
}

const eventRecords=workflows.flatMap(workflow=>workflow.events.map(event=>({...event,workflow:workflow.name})));
function renderEvents(scopedIds=new Set(scopedAgents().map(agent=>agent.id))){
  const traceIDs=scopedTraceIDs(scopedIds);
  const records=eventRecords.filter(event=>traceIDs.has(event.traceID));
  mount.querySelector('#event-trail').innerHTML=records.length?`<table><caption>${records.length} task events correlated by immutable traceID</caption><thead><tr><th scope="col">Workflow</th><th scope="col">Time</th><th scope="col">Stage</th><th scope="col">Operation</th><th scope="col">Agent</th><th scope="col">traceID</th><th scope="col" class="numeric">Duration</th></tr></thead><tbody>${records.map(event=>`<tr><td>${escapeHTML(event.workflow)}</td><td>${escapeHTML(event.timestamp.slice(11,23))}</td><td>${escapeHTML(event.stage)}</td><td>${escapeHTML(event.operation)}</td><td>${event.agentId?escapeHTML(agentById.get(event.agentId).name):'System stage'}</td><td><code>${escapeHTML(event.traceID)}</code></td><td class="numeric">${formatDuration(event.duration)}</td></tr>`).join('')}</tbody></table>`:emptyState('No task events match','Adjust the global signal filters.');
}

[['obs-domain','domain'],['obs-platform','platform'],['obs-status','status']].forEach(([id,key])=>mount.querySelector(`#${id}`).addEventListener('change',event=>{state[key]=event.target.value;renderScope();}));
mount.querySelector('#obs-reset').addEventListener('click',()=>{Object.assign(state,{domain:'all',platform:'all',status:'all'});mount.querySelectorAll('#obs-filters select').forEach(select=>{select.value='all';});renderScope();});
mount.querySelector('#log-query').addEventListener('input',event=>{state.logQuery=event.target.value;renderLogs();});
mount.querySelector('#log-level').addEventListener('change',event=>{state.logLevel=event.target.value;renderLogs();});
mount.querySelector('#log-scope').addEventListener('change',renderLogs);
setupFilterDrawer(mount);renderScope();
