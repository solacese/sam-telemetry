import { snapshot, modelCounts, DOMAIN_ORDER, PLATFORM_ORDER } from './data.js';

const pages = [
  ['agents', 'Agents', 'agents.html'],
  ['governance', 'Governance', 'governance.html'],
  ['workflows', 'Workflows', 'workflows.html'],
  ['cost', 'Cost & ROI', 'cost.html'],
  ['observability', 'Observability', 'observability.html']
];

const storageKey = 'sam-dashboard-view';

export function escapeHTML(value) {
  return String(value ?? '').replace(/[&<>'"]/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' })[character]);
}

export function formatNumber(value, maximumFractionDigits = 0) {
  return new Intl.NumberFormat('en-GB', { maximumFractionDigits }).format(value);
}

export function formatCurrency(value, compact = false) {
  return new Intl.NumberFormat('en-GB', { style: 'currency', currency: 'EUR', notation: compact ? 'compact' : 'standard', maximumFractionDigits: compact ? 1 : 0 }).format(value);
}

export function formatDuration(value) {
  return value >= 1000 ? `${(value / 1000).toFixed(2)} s` : `${Math.round(value)} ms`;
}

export function getViewMode() {
  const fromQuery = new URLSearchParams(location.search).get('view');
  if (fromQuery === 'native' || fromQuery === 'datadog') return fromQuery;
  try {
    const saved = localStorage.getItem(storageKey);
    if (saved === 'native' || saved === 'datadog') return saved;
  } catch (_) {
    // Storage can be unavailable in private or embedded contexts.
  }
  return 'native';
}

function setViewMode(mode) {
  document.documentElement.dataset.view = mode;
  try { localStorage.setItem(storageKey, mode); } catch (_) { /* URL remains shareable. */ }
  const url = new URL(location.href);
  url.searchParams.set('view', mode);
  history.replaceState({}, '', url);
  document.querySelectorAll('[data-view-mode]').forEach(button => {
    const selected = button.dataset.viewMode === mode;
    button.setAttribute('aria-pressed', String(selected));
  });
  document.querySelectorAll('[data-nav-link]').forEach(link => {
    const target = new URL(link.href);
    target.searchParams.set('view', mode);
    link.href = target.href;
  });
  window.dispatchEvent(new CustomEvent('viewchange', { detail: { mode } }));
}

export function statusBadge(label, tone = 'neutral') {
  return `<span class="status status-${escapeHTML(tone)}"><span aria-hidden="true" class="status-icon"></span>${escapeHTML(label)}</span>`;
}

export function emptyState(title, detail) {
  return `<div class="empty-state"><strong>${escapeHTML(title)}</strong><p>${escapeHTML(detail)}</p></div>`;
}

export function sectionHeader(title, eyebrow, action = '') {
  return `<div class="section-heading"><div>${eyebrow ? `<p class="eyebrow">${escapeHTML(eyebrow)}</p>` : ''}<h2>${escapeHTML(title)}</h2></div>${action}</div>`;
}

export function renderShell({ page, title, description, kicker = 'Agent Mesh operations' }) {
  const root = document.querySelector('#app');
  if (!root) throw new Error('Missing #app mount');
  const mode = getViewMode();
  document.documentElement.dataset.view = mode;
  root.innerHTML = `
    <a class="skip-link" href="#main-content">Skip to content</a>
    <header class="site-header">
      <div class="header-inner">
        <a class="brand" href="agents.html" aria-label="Solace Agent Inventory home">
          <span class="brand-mark" aria-hidden="true"><i></i><i></i><i></i></span>
          <span><strong>Solace Agent Inventory</strong></span>
        </a>
        <button class="icon-button menu-button" type="button" aria-expanded="false" aria-controls="primary-navigation"><span class="sr-only">Open navigation</span><span aria-hidden="true">☰</span></button>
        <nav id="primary-navigation" class="primary-nav" aria-label="Primary navigation">
          ${pages.map(([id, label, href]) => `<a data-nav-link href="${href}?view=${mode}" ${id === page ? 'aria-current="page"' : ''}>${label}</a>`).join('')}
        </nav>
        <div class="header-facts" aria-label="Inventory summary">
          <strong>${modelCounts.total}</strong><span>agents</span>
          <i aria-hidden="true"></i><strong>${DOMAIN_ORDER.length}</strong><span>domains</span>
          <i aria-hidden="true"></i><strong>${PLATFORM_ORDER.length}</strong><span>platforms</span>
        </div>
        <div class="view-switch-wrap">
          <span class="view-switch-label">Presentation</span>
          <div class="segmented" aria-label="Presentation mode">
            <button type="button" data-view-mode="native" aria-pressed="${mode === 'native'}">Native</button>
            <button type="button" data-view-mode="datadog" aria-pressed="${mode === 'datadog'}">Datadog-like</button>
          </div>
          <span class="preview-label">Synthetic integration preview</span>
        </div>
      </div>
    </header>
    <div class="snapshot-banner" role="note">
      <span class="snapshot-dot" aria-hidden="true"></span>
      <strong>${escapeHTML(snapshot.label)}</strong>
      <span>${escapeHTML(snapshot.period)} · ${escapeHTML(snapshot.timezone)} · No live connection · ${escapeHTML(snapshot.id)}</span>
    </div>
    <main id="main-content" class="page-shell" tabindex="-1">
      <div class="page-hero">
        <div><p class="eyebrow">${escapeHTML(kicker)}</p><h1>${escapeHTML(title)}</h1><p>${escapeHTML(description)}</p></div>
      </div>
      <div id="page-content"></div>
    </main>
    <footer class="site-footer"><span>Solace Agent Mesh scenario dashboard</span><span>${escapeHTML(snapshot.disclosure)}</span></footer>`;

  const nav = root.querySelector('#primary-navigation');
  const menuButton = root.querySelector('.menu-button');
  menuButton.addEventListener('click', () => {
    const open = menuButton.getAttribute('aria-expanded') === 'true';
    menuButton.setAttribute('aria-expanded', String(!open));
    nav.dataset.open = String(!open);
  });
  root.querySelectorAll('[data-view-mode]').forEach(button => button.addEventListener('click', () => setViewMode(button.dataset.viewMode)));
  return root.querySelector('#page-content');
}

export function setupFilterDrawer(container) {
  const trigger = container.querySelector('[data-filter-trigger]');
  const panel = container.querySelector('[data-filter-panel]');
  const close = container.querySelector('[data-filter-close]');
  if (!trigger || !panel) return;
  const setOpen = open => {
    panel.dataset.open = String(open);
    trigger.setAttribute('aria-expanded', String(open));
    if (open) panel.querySelector('input, select, button')?.focus();
  };
  trigger.addEventListener('click', () => setOpen(trigger.getAttribute('aria-expanded') !== 'true'));
  close?.addEventListener('click', () => setOpen(false));
  panel.addEventListener('keydown', event => { if (event.key === 'Escape') { setOpen(false); trigger.focus(); } });
}

export function announce(message) {
  let region = document.querySelector('#live-region');
  if (!region) {
    region = document.createElement('div');
    region.id = 'live-region';
    region.className = 'sr-only';
    region.setAttribute('aria-live', 'polite');
    document.body.append(region);
  }
  region.textContent = '';
  requestAnimationFrame(() => { region.textContent = message; });
}
