import { agents, domains, platforms, DOMAIN_ORDER, PLATFORM_ORDER, countBy, sumBy, costAssumptions, monthlyCostTrend } from '../data.js';
import { renderShell, escapeHTML, formatCurrency, formatNumber, sectionHeader } from '../app.js';
import { renderBarChart, renderStackedBars } from '../charts.js';

const mount = renderShell({
  page: 'cost', title: 'Cost & ROI scenario',
  description: `Inspect illustrative monthly cost allocations derived from the shared ${agents.length}-agent inventory and stated assumptions.`, kicker: 'Scenario economics'
});

const agentCompute = sumBy(agents, agent => agent.telemetry.monthlyCost);
const withPlatform = agentCompute + costAssumptions.platformSubscription;
const baselineTotal = sumBy(Object.values(costAssumptions.baseline), value => value);
const savings = baselineTotal - withPlatform;
const savingsPct = savings / baselineTotal * 100;
const roi = savings / withPlatform * 100;
const payback = savings > 0 ? withPlatform / savings : null;
const domainRows = DOMAIN_ORDER.map(key => ({ label: domains[key].short, value: sumBy(agents.filter(agent => agent.domain === key), agent => agent.telemetry.monthlyCost) }));
const platformRows = PLATFORM_ORDER.map(key => ({ label: platforms[key].label, value: sumBy(agents.filter(agent => agent.platform === key), agent => agent.telemetry.monthlyCost) }));
const roleRows = Object.entries(countBy(agents, 'role')).map(([key]) => ({ label: key === 'head' ? 'Domain head' : key[0].toUpperCase() + key.slice(1), value: sumBy(agents.filter(agent => agent.role === key), agent => agent.telemetry.monthlyCost) }));

mount.innerHTML = `
  <section class="kpi-grid" aria-label="Illustrative financial summary">
    ${[
      ['Scenario monthly cost', formatCurrency(withPlatform), `${formatCurrency(agentCompute)} agent usage + ${formatCurrency(costAssumptions.platformSubscription)} platform assumption`],
      ['Comparison baseline', formatCurrency(baselineTotal), 'Same monthly scenario period'],
      ['Illustrative savings', formatCurrency(savings), `${savingsPct.toFixed(1)}% below comparison baseline`],
      ['Illustrative ROI', `${roi.toFixed(0)}%`, payback ? `${payback.toFixed(1)} month scenario payback` : 'No payback in this scenario']
    ].map(([label,value,meta]) => `<article class="kpi-card"><span class="label">${label}</span><strong class="value">${value}</strong><span class="meta">${meta}</span></article>`).join('')}
  </section>
  ${sectionHeader('Assumptions', 'Visible calculation basis')}
  <section class="panel panel-pad">
    <ul class="assumption-list">
      <li><span>Period</span><strong>${escapeHTML(costAssumptions.period)}</strong></li>
      <li><span>Execution volume</span><strong>${formatNumber(costAssumptions.executionVolume)}</strong></li>
      <li><span>Agent population</span><strong>${agents.length} agents</strong></li>
      <li><span>Platform assumption</span><strong>${formatCurrency(costAssumptions.platformSubscription)}/month</strong></li>
    </ul>
    <p class="section-note">Unit costs per execution: ${PLATFORM_ORDER.map(key => `${platforms[key].label} ${formatCurrency(costAssumptions.platformUnitCosts[key])}`).join(' · ')}. ${escapeHTML(costAssumptions.disclaimer)}</p>
  </section>
  ${sectionHeader('With / without comparison', 'Illustrative scenario')}
  <section class="panel panel-pad comparison">
    <article class="comparison-card"><span>Separate capability baseline</span><strong>${formatCurrency(baselineTotal)}</strong><p>Integration ${formatCurrency(costAssumptions.baseline.integration)} · Operations ${formatCurrency(costAssumptions.baseline.operations)} · Governance ${formatCurrency(costAssumptions.baseline.governance)} · Manual review ${formatCurrency(costAssumptions.baseline.manualReview)}</p></article>
    <span class="comparison-arrow" aria-hidden="true">→</span>
    <article class="comparison-card"><span>Agent Mesh scenario</span><strong>${formatCurrency(withPlatform)}</strong><p>Agent usage ${formatCurrency(agentCompute)} · Platform assumption ${formatCurrency(costAssumptions.platformSubscription)}</p></article>
  </section>
  <div class="grid-2">
    <section><div id="domain-heading"></div><div id="domain-chart" class="panel"></div></section>
    <section><div id="platform-heading"></div><div id="platform-chart" class="panel"></div></section>
  </div>
  <div class="grid-2">
    <section><div id="role-heading"></div><div id="role-chart" class="panel"></div></section>
    <section><div id="trend-heading"></div><div id="trend-chart" class="panel"></div></section>
  </div>
  <section>${sectionHeader('Highest allocated agent costs', 'Top ten from shared inventory')}<div id="top-agent-table" class="table-wrap"></div></section>
  <aside class="callout" role="note"><strong>Interpretation.</strong> Savings, ROI and payback are illustrative calculations for this synthetic scenario. They are not Solace pricing, a quote, a guarantee or measured production value.</aside>`;

mount.querySelector('#domain-heading').innerHTML = sectionHeader('Cost by domain', 'Monthly allocation');
renderBarChart(mount.querySelector('#domain-chart'), { id:'cost-domain', title:'Agent usage allocation', description:'Monthly scenario cost by banking domain; orchestrator excluded from domain comparison.', rows:domainRows, format:value => formatCurrency(value) });
mount.querySelector('#platform-heading').innerHTML = sectionHeader('Cost by platform', 'Monthly allocation');
renderBarChart(mount.querySelector('#platform-chart'), { id:'cost-platform', title:'Platform workload allocation', description:'Same shared agent cost grouped by platform affinity.', rows:platformRows, format:value => formatCurrency(value), color:'#5e4b8b' });
mount.querySelector('#role-heading').innerHTML = sectionHeader('Cost by role', 'Monthly allocation');
renderBarChart(mount.querySelector('#role-chart'), { id:'cost-role', title:'Role allocation', description:'Orchestrator, domain heads and specialists on one currency scale.', rows:roleRows, format:value => formatCurrency(value), color:'#b4582f' });
mount.querySelector('#trend-heading').innerHTML = sectionHeader('Six-month trend', 'Shared scenario series');
renderStackedBars(mount.querySelector('#trend-chart'), { id:'cost-trend', title:'Optimisation scenario', description:'Illustrative monthly compute, token and governance allocation.', rows:monthlyCostTrend, xKey:'month', series:[{key:'compute',label:'Compute',color:'#0077a3'},{key:'tokens',label:'Tokens',color:'#b4582f'},{key:'governance',label:'Governance',color:'#5e4b8b'}], valueFormat:value => formatCurrency(value) });

const topAgents = [...agents].sort((a,b) => b.telemetry.monthlyCost - a.telemetry.monthlyCost).slice(0,10);
mount.querySelector('#top-agent-table').innerHTML = `<table><caption>Ten agents with the highest illustrative monthly allocation</caption><thead><tr><th scope="col">Agent</th><th scope="col">Domain</th><th scope="col">Platform</th><th scope="col" class="numeric">Executions</th><th scope="col" class="numeric">Cost / execution</th><th scope="col" class="numeric">Monthly cost</th></tr></thead><tbody>${topAgents.map(agent => `<tr><td><strong>${escapeHTML(agent.name)}</strong><br><small>${escapeHTML(agent.id)}</small></td><td>${escapeHTML(domains[agent.domain].short)}</td><td>${escapeHTML(platforms[agent.platform].label)}</td><td class="numeric">${formatNumber(agent.telemetry.executions)}</td><td class="numeric">${formatCurrency(agent.telemetry.monthlyCost / agent.telemetry.executions)}</td><td class="numeric">${formatCurrency(agent.telemetry.monthlyCost)}</td></tr>`).join('')}</tbody></table>`;
