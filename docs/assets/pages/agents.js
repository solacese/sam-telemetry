import { agents, domains, platforms, modelCounts, DOMAIN_ORDER, PLATFORM_ORDER, countBy } from '../data.js';
import { renderShell, escapeHTML, formatCurrency, formatDuration, statusBadge, setupFilterDrawer, emptyState, announce } from '../app.js';

const mount = renderShell({
  page: 'agents',
  title: 'Solace Agent Inventory',
  description: `${modelCounts.total} banking agents across ${DOMAIN_ORDER.length} domains and ${PLATFORM_ORDER.length} platforms, with role, availability, latency and cost signals.`,
  kicker: 'Inventory overview'
});

const state = { search: '', domains: new Set(), platforms: new Set(), roles: new Set(), audiences: new Set(), availability: new Set(), sort: 'name', direction: 1 };

mount.innerHTML = `
  <section class="kpi-grid six" aria-label="Inventory summary">
    <article class="kpi-card"><span class="label">Total agents</span><strong class="value">${modelCounts.total}</strong><span class="meta">${modelCounts.roles.orchestrator} orchestrator · ${modelCounts.roles.head} heads · ${modelCounts.roles.specialist} specialists</span></article>
    <article class="kpi-card"><span class="label">Banking domains</span><strong class="value">${DOMAIN_ORDER.length}</strong><span class="meta">${modelCounts.domains[DOMAIN_ORDER[0]]} agents in each domain</span></article>
    ${PLATFORM_ORDER.map(platform => `<article class="kpi-card"><span class="label">${escapeHTML(platforms[platform].label)}</span><strong class="value">${modelCounts.platforms[platform]}</strong><span class="meta">Derived from shared inventory</span></article>`).join('')}
  </section>
  <div class="section-heading"><div><p class="eyebrow">Explore</p><h2>Topology directory</h2></div><button class="filter-trigger" type="button" data-filter-trigger aria-controls="inventory-filters" aria-expanded="false">Filters</button></div>
  <div class="sidebar-layout">
    <aside id="inventory-filters" class="panel filter-panel" data-filter-panel aria-label="Inventory filters">
      <div class="filter-title"><strong>Filter agents</strong><button class="icon-button filter-close" type="button" data-filter-close aria-label="Close filters">×</button></div>
      <div class="field"><label for="agent-search">Search</label><input id="agent-search" type="search" placeholder="Name, ID or capability"></div>
      ${filterGroup('Domain', 'domain', DOMAIN_ORDER.map(key => [key, domains[key].short]))}
      ${filterGroup('Platform', 'platform', PLATFORM_ORDER.map(key => [key, platforms[key].label]))}
      ${filterGroup('Role', 'role', [['orchestrator', 'Orchestrator'], ['head', 'Domain head'], ['specialist', 'Specialist']])}
      ${filterGroup('Audience', 'audience', [['internal', 'Internal'], ['customer', 'Customer-facing']])}
      ${filterGroup('Availability', 'availability', [['available', 'Available'], ['degraded', 'Degraded'], ['unavailable', 'Unavailable']])}
      <button id="clear-filters" class="button" type="button">Clear filters</button>
    </aside>
    <section aria-live="polite">
      <p id="agent-result-count" class="result-count"></p>
      <div id="agent-cards" class="agent-cards-view"></div>
      <div id="agent-table" class="agent-table-view table-wrap"></div>
    </section>
  </div>`;

function filterGroup(label, key, options) {
  return `<fieldset class="filter-group"><legend>${escapeHTML(label)}</legend><div class="check-list">${options.map(([value, text]) => `<label><input type="checkbox" data-filter="${key}" value="${value}"><span>${escapeHTML(text)}</span></label>`).join('')}</div></fieldset>`;
}

function selectionMatches(set, value) { return set.size === 0 || set.has(value); }
function filteredAgents() {
  const query = state.search.trim().toLowerCase();
  return agents.filter(agent => {
    const searchable = `${agent.name} ${agent.id} ${agent.description}`.toLowerCase();
    return (!query || searchable.includes(query)) && selectionMatches(state.domains, agent.domain) && selectionMatches(state.platforms, agent.platform) && selectionMatches(state.roles, agent.role) && selectionMatches(state.audiences, agent.audience) && selectionMatches(state.availability, agent.telemetry.availability);
  });
}

function availabilityTone(value) { return value === 'available' ? 'good' : value === 'degraded' ? 'warning' : 'critical'; }
function card(agent) {
  return `<article class="agent-card"><div class="agent-card-head"><h3>${escapeHTML(agent.name)}</h3>${statusBadge(agent.telemetry.availability, availabilityTone(agent.telemetry.availability))}</div><p>${escapeHTML(agent.description)}</p><div class="agent-meta"><span class="chip">${escapeHTML(agent.id)}</span><span class="chip">${escapeHTML(platforms[agent.platform].label)}</span><span class="chip">${escapeHTML(agent.role)}</span><span class="chip">${escapeHTML(agent.audience)}</span></div><div class="agent-kpis"><span>Success<strong>${agent.telemetry.successRate}%</strong></span><span>p95 latency<strong>${formatDuration(agent.telemetry.latencyP95)}</strong></span><span>Monthly cost<strong>${formatCurrency(agent.telemetry.monthlyCost)}</strong></span></div></article>`;
}

function render() {
  const filtered = filteredAgents();
  const resultCount = mount.querySelector('#agent-result-count');
  resultCount.textContent = `${filtered.length} of ${agents.length} agents · ${Object.entries(countBy(filtered, 'platform')).map(([key, value]) => `${value} ${platforms[key].label}`).join(' · ') || 'No platform matches'}`;
  const groups = ['group', ...DOMAIN_ORDER].map(domain => ({ domain, items: filtered.filter(agent => agent.domain === domain) })).filter(group => group.items.length);
  mount.querySelector('#agent-cards').innerHTML = groups.length ? groups.map(group => `<details class="panel domain-section" open><summary><strong>${escapeHTML(domains[group.domain].label)}</strong><span>${group.items.length} agent${group.items.length === 1 ? '' : 's'}</span></summary><div class="agent-grid">${group.items.map(card).join('')}</div></details>`).join('') : emptyState('No agents match', 'Clear filters or broaden your search.');
  const sorted = [...filtered].sort((a, b) => {
    const key = state.sort;
    const av = key === 'cost' ? a.telemetry.monthlyCost : key === 'latency' ? a.telemetry.latencyP95 : a[key] ?? a.telemetry[key] ?? '';
    const bv = key === 'cost' ? b.telemetry.monthlyCost : key === 'latency' ? b.telemetry.latencyP95 : b[key] ?? b.telemetry[key] ?? '';
    return String(av).localeCompare(String(bv), undefined, { numeric: true }) * state.direction;
  });
  mount.querySelector('#agent-table').innerHTML = `<table><caption>${filtered.length} matching agents. Select a heading to sort.</caption><thead><tr>${[['name','Agent'],['domain','Domain'],['platform','Platform'],['role','Role'],['availability','Availability'],['latency','p95 latency'],['cost','Monthly cost']].map(([key,label]) => `<th scope="col"><button type="button" data-sort="${key}">${label}${state.sort === key ? (state.direction === 1 ? ' ↑' : ' ↓') : ''}</button></th>`).join('')}</tr></thead><tbody>${sorted.map(agent => `<tr><td><strong>${escapeHTML(agent.name)}</strong><br><small>${escapeHTML(agent.id)}</small></td><td>${escapeHTML(domains[agent.domain].short)}</td><td>${escapeHTML(platforms[agent.platform].label)}</td><td>${escapeHTML(agent.role)}</td><td>${statusBadge(agent.telemetry.availability, availabilityTone(agent.telemetry.availability))}</td><td>${formatDuration(agent.telemetry.latencyP95)}</td><td>${formatCurrency(agent.telemetry.monthlyCost)}</td></tr>`).join('')}</tbody></table>`;
  mount.querySelectorAll('[data-sort]').forEach(button => button.addEventListener('click', () => {
    if (state.sort === button.dataset.sort) state.direction *= -1; else { state.sort = button.dataset.sort; state.direction = 1; }
    render();
  }));
}

mount.querySelector('#agent-search').addEventListener('input', event => { state.search = event.target.value; render(); });
mount.querySelectorAll('[data-filter]').forEach(input => input.addEventListener('change', () => {
  const set = state[`${input.dataset.filter}s`] || state[input.dataset.filter];
  input.checked ? set.add(input.value) : set.delete(input.value);
  render();
}));
mount.querySelector('#clear-filters').addEventListener('click', () => {
  state.search = '';
  ['domains', 'platforms', 'roles', 'audiences', 'availability'].forEach(key => state[key].clear());
  mount.querySelector('#agent-search').value = '';
  mount.querySelectorAll('[data-filter]').forEach(input => { input.checked = false; });
  render(); announce('Inventory filters cleared');
});
setupFilterDrawer(mount);
render();
