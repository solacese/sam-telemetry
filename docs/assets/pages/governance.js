import { governance, domains, agentById, sumBy } from '../data.js';
import { renderShell, escapeHTML, formatNumber, statusBadge, setupFilterDrawer, emptyState, sectionHeader } from '../app.js';
import { renderBarChart } from '../charts.js';

const mount = renderShell({
  page: 'governance', title: 'Governance & compliance',
  description: 'Review illustrative policy findings, access decisions and regulatory readiness across the banking scenario.', kicker: 'Policy evidence'
});
const state = { domain: 'all', severity: 'all', regulation: 'all' };
const severities = ['critical', 'high', 'medium', 'low'];

mount.innerHTML = `
  <section id="governance-kpis" class="kpi-grid" aria-label="Governance summary"></section>
  <div class="section-heading"><div><p class="eyebrow">Scenario controls</p><h2>Governance scope</h2></div><button class="filter-trigger" data-filter-trigger aria-expanded="false" aria-controls="governance-filters">Filters</button></div>
  <div id="governance-filters" class="panel filter-toolbar" data-filter-panel>
    <div class="filter-title"><strong class="sr-only">Filters</strong><button class="icon-button filter-close" type="button" data-filter-close aria-label="Close filters">×</button></div>
    ${selectField('gov-domain', 'Domain', [['all','All domains'], ...['cib','retail','risk','it'].map(key => [key, domains[key].short])])}
    ${selectField('gov-severity', 'Severity', [['all','All severities'], ...severities.map(value => [value, titleCase(value)])])}
    ${selectField('gov-regulation', 'Regulation', [['all','All regulations'], ...governance.regulations.map(item => [item.id, item.name])])}
    <button id="governance-reset" class="button" type="button">Reset</button>
  </div>
  <div class="grid-2">
    <section><div id="finding-heading"></div><div id="finding-list" class="finding-list"></div></section>
    <section><div id="access-heading"></div><div id="access-matrix" class="table-wrap"></div></section>
  </div>
  <div class="grid-2">
    <section><div id="reg-heading"></div><div id="reg-chart" class="panel"></div></section>
    <section><div id="residency-heading"></div><div id="residency-grid" class="residency-grid"></div></section>
  </div>
  <section><div id="policy-heading"></div><div id="policy-table" class="table-wrap"></div></section>
  <aside class="callout" role="note"><strong>Scenario evidence only.</strong> These findings are examples, not certifications, audit opinions or production incidents. Scores describe this fixed synthetic snapshot.</aside>`;

function selectField(id, label, options) { return `<div class="field"><label for="${id}">${label}</label><select id="${id}">${options.map(([value,text]) => `<option value="${value}">${escapeHTML(text)}</option>`).join('')}</select></div>`; }
function titleCase(value) { return value[0].toUpperCase() + value.slice(1); }
function severityTone(value) { return value === 'critical' ? 'critical' : value === 'high' ? 'serious' : value === 'medium' ? 'warning' : 'neutral'; }
function scopedFindings() { return governance.findings.filter(item => (state.domain === 'all' || item.domain === state.domain) && (state.severity === 'all' || item.severity === state.severity) && (state.regulation === 'all' || item.regulation === state.regulation)); }
function scopedPolicies() { return governance.policies.filter(item => (state.domain === 'all' || item.domain === state.domain) && (state.regulation === 'all' || item.regulation === state.regulation)); }
function scopedAccess() { return governance.access.filter(item => state.domain === 'all' || item.from === state.domain || item.to === state.domain); }

function render() {
  const findings = scopedFindings();
  const policies = scopedPolicies();
  const access = scopedAccess();
  const critical = findings.filter(item => item.severity === 'critical').length;
  mount.querySelector('#governance-kpis').innerHTML = [
    ['Scoped findings', findings.length, `${critical} critical in current scope`],
    ['Policy rules', policies.length, `${policies.filter(item => item.status === 'Enforced').length} enforced`],
    ['Access evaluations', formatNumber(sumBy(access, 'requests')), 'Derived from scoped matrix cells'],
    ['Regulatory records', state.regulation === 'all' ? governance.regulations.length : 1, 'Readiness examples, not certification']
  ].map(([label,value,meta]) => `<article class="kpi-card"><span class="label">${label}</span><strong class="value">${value}</strong><span class="meta">${meta}</span></article>`).join('');

  mount.querySelector('#finding-heading').innerHTML = sectionHeader('Finding feed', 'Combined filters', `<span class="chip">${findings.length} records</span>`);
  mount.querySelector('#finding-list').innerHTML = findings.length ? findings.map(item => `<article class="finding ${item.severity}"><div class="finding-meta"><strong>${escapeHTML(item.id)}</strong><br>${escapeHTML(item.time)} UTC</div><div><h3>${escapeHTML(item.title)}</h3><p>${escapeHTML(item.detail)}</p><p>${escapeHTML(agentById.get(item.agentId)?.name || item.agentId)} · ${escapeHTML(domains[item.domain].short)}</p></div>${statusBadge(`${titleCase(item.severity)} · ${item.outcome}`, severityTone(item.severity))}</article>`).join('') : emptyState('No findings match', 'Adjust domain, severity or regulation.');

  mount.querySelector('#access-heading').innerHTML = sectionHeader('Cross-domain access', 'Scenario request matrix', `<span class="chip">${formatNumber(sumBy(access, 'requests'))} evaluations</span>`);
  const domainKeys = ['cib','retail','risk','it'];
  mount.querySelector('#access-matrix').innerHTML = `<table class="matrix"><caption>Access requests by source and destination domain</caption><thead><tr><th scope="col">From \ To</th>${domainKeys.map(key => `<th scope="col">${escapeHTML(domains[key].short)}</th>`).join('')}</tr></thead><tbody>${domainKeys.map(from => `<tr><th scope="row">${escapeHTML(domains[from].short)}</th>${domainKeys.map(to => { const cell = governance.access.find(item => item.from === from && item.to === to); const visible = state.domain === 'all' || from === state.domain || to === state.domain; return `<td>${visible ? `<span class="matrix-cell"><strong>${formatNumber(cell.requests)}</strong><small>${cell.decision}</small></span>` : '—'}</td>`; }).join('')}</tr>`).join('')}</tbody></table>`;

  const regulations = governance.regulations.filter(item => state.regulation === 'all' || item.id === state.regulation);
  mount.querySelector('#reg-heading').innerHTML = sectionHeader('Regulatory posture', 'Illustrative readiness');
  renderBarChart(mount.querySelector('#reg-chart'), { id: 'regulatory-posture', title: 'Readiness score', description: 'Scenario control evidence completion, percent.', rows: regulations.map(item => ({ label: item.name, value: item.score })), format: value => `${value.toFixed(1)}%` });

  mount.querySelector('#residency-heading').innerHTML = sectionHeader('Data residency', 'Sample records');
  mount.querySelector('#residency-grid').innerHTML = governance.residency.map(item => `<article class="residency-card"><span class="chip">${escapeHTML(item.code)}</span><strong>${escapeHTML(item.region)}</strong><span>${formatNumber(item.records)} scenario records</span><p>${statusBadge(item.status, 'good')}</p></article>`).join('');

  mount.querySelector('#policy-heading').innerHTML = sectionHeader('Policy rules', 'Current combined scope', `<span class="chip">${policies.length} rules</span>`);
  mount.querySelector('#policy-table').innerHTML = policies.length ? `<table><caption>Policy rules matching current filters</caption><thead><tr><th scope="col">Rule</th><th scope="col">Domain</th><th scope="col">Regulation</th><th scope="col">Status</th><th scope="col" class="numeric">Evaluations</th></tr></thead><tbody>${policies.map(item => `<tr><td><strong>${escapeHTML(item.name)}</strong><br><small>${escapeHTML(item.id)}</small></td><td>${escapeHTML(domains[item.domain].short)}</td><td>${escapeHTML(governance.regulations.find(reg => reg.id === item.regulation)?.name || item.regulation)}</td><td>${statusBadge(item.status, item.status === 'Enforced' ? 'good' : 'warning')}</td><td class="numeric">${formatNumber(item.evaluations)}</td></tr>`).join('')}</tbody></table>` : emptyState('No policy rules match', 'The current combined filter returns no policy records.');
}

[['gov-domain','domain'],['gov-severity','severity'],['gov-regulation','regulation']].forEach(([id,key]) => mount.querySelector(`#${id}`).addEventListener('change', event => { state[key] = event.target.value; render(); }));
mount.querySelector('#governance-reset').addEventListener('click', () => { Object.assign(state, { domain:'all', severity:'all', regulation:'all' }); mount.querySelectorAll('#governance-filters select').forEach(select => { select.value = 'all'; }); render(); });
setupFilterDrawer(mount);
render();
