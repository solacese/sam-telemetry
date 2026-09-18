import { escapeHTML, formatNumber } from './app.js';

const palette = ['#0077A3', '#B4582F', '#5E4B8B', '#B57A00'];

function tableMarkup({ columns, rows, caption }) {
  return `<div class="chart-table" hidden><table><caption>${escapeHTML(caption)}</caption><thead><tr>${columns.map(column => `<th scope="col">${escapeHTML(column.label)}</th>`).join('')}</tr></thead><tbody>${rows.map(row => `<tr>${columns.map(column => `<td>${escapeHTML(column.format ? column.format(row[column.key], row) : row[column.key])}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`;
}

function viewToggle(id) {
  return `<div class="chart-view-toggle segmented" aria-label="Chart display"><button type="button" data-chart-view="chart" aria-pressed="true" aria-controls="${id}-chart">Chart</button><button type="button" data-chart-view="table" aria-pressed="false" aria-controls="${id}-table">Table</button></div>`;
}

function bindViewToggle(container) {
  container.querySelectorAll('[data-chart-view]').forEach(button => button.addEventListener('click', () => {
    const table = button.dataset.chartView === 'table';
    container.querySelector('.chart-visual').hidden = table;
    container.querySelector('.chart-table').hidden = !table;
    container.querySelectorAll('[data-chart-view]').forEach(candidate => candidate.setAttribute('aria-pressed', String(candidate === button)));
  }));
}

function tooltipElement(container) {
  const tooltip = document.createElement('div');
  tooltip.className = 'chart-tooltip';
  tooltip.hidden = true;
  container.append(tooltip);
  return tooltip;
}

function showTooltip(tooltip, target, lines) {
  tooltip.replaceChildren();
  lines.forEach((line, index) => {
    const element = document.createElement(index === 0 ? 'strong' : 'span');
    element.textContent = line;
    tooltip.append(element);
  });
  tooltip.hidden = false;
  const container = tooltip.parentElement.getBoundingClientRect();
  const rect = target.getBoundingClientRect();
  tooltip.style.left = `${Math.min(container.width - 190, Math.max(8, rect.left - container.left + rect.width / 2 - 80))}px`;
  tooltip.style.top = `${Math.max(8, rect.top - container.top - 70)}px`;
}

function hideTooltip(tooltip) { tooltip.hidden = true; }

export function renderBarChart(container, { id, title, description, rows, categoryKey = 'label', valueKey = 'value', format = value => formatNumber(value), color = palette[0] }) {
  const max = Math.max(...rows.map(row => row[valueKey]), 1);
  container.classList.add('chart-component');
  container.innerHTML = `<div class="chart-head"><div><h3>${escapeHTML(title)}</h3><p>${escapeHTML(description)}</p></div>${viewToggle(id)}</div>
    <div id="${id}-chart" class="chart-visual bar-chart" role="img" aria-label="${escapeHTML(title)}. ${escapeHTML(description)}">
      ${rows.map(row => `<div class="bar-row"><span class="bar-label">${escapeHTML(row[categoryKey])}</span><div class="bar-track"><button class="bar-mark" type="button" style="--bar:${(row[valueKey] / max) * 100}%;--mark:${row.color || color}" data-category="${escapeHTML(row[categoryKey])}" data-value="${escapeHTML(format(row[valueKey]))}" aria-label="${escapeHTML(row[categoryKey])}: ${escapeHTML(format(row[valueKey]))}"></button></div><strong>${escapeHTML(format(row[valueKey]))}</strong></div>`).join('')}
    </div>
    <div id="${id}-table">${tableMarkup({ caption: `${title} data`, columns: [{ key: categoryKey, label: 'Category' }, { key: valueKey, label: 'Value', format }], rows })}</div>`;
  const tooltip = tooltipElement(container);
  container.querySelectorAll('.bar-mark').forEach(mark => {
    const show = () => showTooltip(tooltip, mark, [mark.dataset.value, mark.dataset.category]);
    mark.addEventListener('pointerenter', show); mark.addEventListener('focus', show);
    mark.addEventListener('pointerleave', () => hideTooltip(tooltip)); mark.addEventListener('blur', () => hideTooltip(tooltip));
  });
  bindViewToggle(container);
}

export function renderLineChart(container, { id, title, description, rows, xKey = 'label', series, valueFormat = value => formatNumber(value) }) {
  const width = 720, height = 240, left = 42, right = 20, top = 20, bottom = 36;
  const values = rows.flatMap(row => series.map(item => row[item.key]));
  const min = Math.min(0, ...values), max = Math.max(...values, 1);
  const x = index => left + index * ((width - left - right) / Math.max(rows.length - 1, 1));
  const y = value => top + (max - value) * ((height - top - bottom) / Math.max(max - min, 1));
  const ticks = [0, .25, .5, .75, 1].map(portion => min + (max - min) * portion);
  container.classList.add('chart-component');
  const columnDefs = [{ key: xKey, label: 'Time' }, ...series.map(item => ({ key: item.key, label: item.label, format: valueFormat }))];
  container.innerHTML = `<div class="chart-head"><div><h3>${escapeHTML(title)}</h3><p>${escapeHTML(description)}</p></div>${viewToggle(id)}</div>
    <div class="chart-legend" aria-label="Legend">${series.map((item, index) => `<span><i class="line-key" style="--mark:${item.color || palette[index]}"></i>${escapeHTML(item.label)}</span>`).join('')}</div>
    <div id="${id}-chart" class="chart-visual line-chart" role="img" aria-label="${escapeHTML(title)}. ${escapeHTML(description)}">
      <svg viewBox="0 0 ${width} ${height}" aria-hidden="true" focusable="false">
        ${ticks.map(tick => `<line class="grid-line" x1="${left}" x2="${width - right}" y1="${y(tick)}" y2="${y(tick)}"></line><text class="axis-label" x="${left - 8}" y="${y(tick) + 4}" text-anchor="end">${escapeHTML(valueFormat(tick))}</text>`).join('')}
        ${rows.map((row, index) => `<text class="axis-label" x="${x(index)}" y="${height - 9}" text-anchor="middle">${escapeHTML(row[xKey])}</text>`).join('')}
        ${series.map((item, seriesIndex) => `<polyline class="series-line" style="--mark:${item.color || palette[seriesIndex]}" points="${rows.map((row, index) => `${x(index)},${y(row[item.key])}`).join(' ')}"></polyline>`).join('')}
        ${rows.map((row, index) => `<g><line class="crosshair" x1="${x(index)}" x2="${x(index)}" y1="${top}" y2="${height - bottom}"></line>${series.map((item, seriesIndex) => `<circle class="series-dot" style="--mark:${item.color || palette[seriesIndex]}" cx="${x(index)}" cy="${y(row[item.key])}" r="5"></circle>`).join('')}<rect class="chart-hit" tabindex="0" role="button" aria-label="${escapeHTML(row[xKey])}: ${series.map(item => `${item.label} ${valueFormat(row[item.key])}`).join(', ')}" data-index="${index}" x="${Math.max(0, x(index) - 22)}" y="${top}" width="44" height="${height - top - bottom}"></rect></g>`).join('')}
      </svg>
    </div>
    <div id="${id}-table">${tableMarkup({ caption: `${title} data`, columns: columnDefs, rows })}</div>`;
  const tooltip = tooltipElement(container);
  container.querySelectorAll('.chart-hit').forEach(hit => {
    const show = () => {
      const row = rows[Number(hit.dataset.index)];
      showTooltip(tooltip, hit, [row[xKey], ...series.map(item => `${valueFormat(row[item.key])} — ${item.label}`)]);
    };
    hit.addEventListener('pointerenter', show); hit.addEventListener('focus', show);
    hit.addEventListener('pointerleave', () => hideTooltip(tooltip)); hit.addEventListener('blur', () => hideTooltip(tooltip));
  });
  bindViewToggle(container);
}

export function renderStackedBars(container, { id, title, description, rows, xKey = 'label', series, valueFormat = value => formatNumber(value) }) {
  const max = Math.max(...rows.map(row => series.reduce((sum, item) => sum + row[item.key], 0)), 1);
  const columns = [{ key: xKey, label: 'Period' }, ...series.map(item => ({ key: item.key, label: item.label, format: valueFormat }))];
  container.classList.add('chart-component');
  container.innerHTML = `<div class="chart-head"><div><h3>${escapeHTML(title)}</h3><p>${escapeHTML(description)}</p></div>${viewToggle(id)}</div>
    <div class="chart-legend">${series.map((item, index) => `<span><i class="rect-key" style="--mark:${item.color || palette[index]}"></i>${escapeHTML(item.label)}</span>`).join('')}</div>
    <div id="${id}-chart" class="chart-visual stacked-chart" role="img" aria-label="${escapeHTML(title)}. ${escapeHTML(description)}">
      ${rows.map(row => `<div class="stack-column"><div class="stack" style="--stack-height:${(series.reduce((sum, item) => sum + row[item.key], 0) / max) * 100}%">${series.map((item, index) => `<button type="button" class="stack-segment" style="--share:${(row[item.key] / series.reduce((sum, candidate) => sum + row[candidate.key], 0)) * 100}%;--mark:${item.color || palette[index]}" data-label="${escapeHTML(item.label)}" data-period="${escapeHTML(row[xKey])}" data-value="${escapeHTML(valueFormat(row[item.key]))}" aria-label="${escapeHTML(row[xKey])}, ${escapeHTML(item.label)}: ${escapeHTML(valueFormat(row[item.key]))}"></button>`).join('')}</div><span>${escapeHTML(row[xKey])}</span></div>`).join('')}
    </div>
    <div id="${id}-table">${tableMarkup({ caption: `${title} data`, columns, rows })}</div>`;
  const tooltip = tooltipElement(container);
  container.querySelectorAll('.stack-segment').forEach(mark => {
    const show = () => showTooltip(tooltip, mark, [mark.dataset.value, `${mark.dataset.label} · ${mark.dataset.period}`]);
    mark.addEventListener('pointerenter', show); mark.addEventListener('focus', show);
    mark.addEventListener('pointerleave', () => hideTooltip(tooltip)); mark.addEventListener('blur', () => hideTooltip(tooltip));
  });
  bindViewToggle(container);
}
