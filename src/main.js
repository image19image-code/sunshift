import './style.css';
import { geocodeCity, fetchForecast } from './api.js';
import { estimateOutputKw } from './solar.js';
import { scheduleAppliances } from './scheduler.js';
import { renderChart } from './chart.js';

const WINDOW_START = 7;
const WINDOW_END = 23;

const APPLIANCE_PRESETS = [
  { name: 'Washing machine', powerKw: 0.5, durationH: 2, defaultStart: 19 },
  { name: 'Dishwasher', powerKw: 1.2, durationH: 2, defaultStart: 21 },
  { name: 'EV charger', powerKw: 3.3, durationH: 4, defaultStart: 18 },
];

const form = document.getElementById('city-form');
const input = document.getElementById('city-input');
const panelInput = document.getElementById('panel-input');
const button = document.getElementById('go-btn');
const statusEl = document.getElementById('status');
const resultEl = document.getElementById('result');
const placeEl = document.getElementById('place');
const summaryEl = document.getElementById('summary');
const impactEl = document.getElementById('impact');
const rowsEl = document.getElementById('rows');
const scheduleRowsEl = document.getElementById('schedule-rows');
const applianceRowsEl = document.getElementById('appliance-rows');
const chartCanvas = document.getElementById('chart');

function numberInput(label, value, min, max, step) {
  const el = document.createElement('input');
  el.type = 'number';
  el.value = String(value);
  el.min = String(min);
  el.max = String(max);
  el.step = String(step);
  el.setAttribute('aria-label', label);
  return el;
}

function buildApplianceRow(preset) {
  const tr = document.createElement('tr');
  const checkbox = document.createElement('input');
  checkbox.type = 'checkbox';
  checkbox.checked = true;
  checkbox.setAttribute('aria-label', `Use ${preset.name}`);
  const power = numberInput(`${preset.name} power in kW`, preset.powerKw, 0.1, 20, 0.1);
  const duration = numberInput(`${preset.name} run time in hours`, preset.durationH, 1, 16, 1);
  const start = numberInput(`${preset.name} usual start hour`, preset.defaultStart, 0, 23, 1);

  for (const content of [checkbox, preset.name, power, duration, start]) {
    const td = document.createElement('td');
    if (typeof content === 'string') {
      td.textContent = content;
    } else {
      td.appendChild(content);
    }
    tr.appendChild(td);
  }
  applianceRowsEl.appendChild(tr);
  return { preset, checkbox, power, duration, start };
}

const controls = APPLIANCE_PRESETS.map(buildApplianceRow);

function readAppliances() {
  const list = controls
    .filter((c) => c.checkbox.checked)
    .map((c) => ({
      name: c.preset.name,
      powerKw: Number(c.power.value),
      durationH: Number(c.duration.value),
      earliest: WINDOW_START,
      latest: WINDOW_END,
      defaultStart: Number(c.start.value),
    }));
  if (list.length === 0) {
    throw new Error('Select at least one appliance.');
  }
  return list;
}

function setStatus(message, isError = false) {
  statusEl.textContent = message;
  statusEl.className = isError ? 'error' : '';
}

function formatNumber(value) {
  return typeof value === 'number' ? String(Math.round(value)) : '–';
}

function hourLabel(h) {
  return `${String(h).padStart(2, '0')}:00`;
}

function loadFromStarts(n, appliances, starts) {
  const load = new Array(n).fill(0);
  appliances.forEach((a, i) => {
    for (let h = starts[i]; h < starts[i] + a.durationH; h++) {
      load[h] += a.powerKw;
    }
  });
  return load;
}

function fillRows(tbody, rows) {
  tbody.replaceChildren();
  for (const cells of rows) {
    const tr = document.createElement('tr');
    for (const text of cells) {
      const td = document.createElement('td');
      td.textContent = text;
      tr.appendChild(td);
    }
    tbody.appendChild(tr);
  }
}

function renderForecast(hours) {
  fillRows(
    rowsEl,
    hours.map((h) => [
      h.time.replace('T', ' '),
      formatNumber(h.radiation),
      formatNumber(h.temperature),
      formatNumber(h.cloud),
      h.outputKw.toFixed(2),
    ])
  );
}

function renderSchedule(result) {
  fillRows(
    scheduleRowsEl,
    result.placements.map((p) => [
      p.name,
      String(p.powerKw),
      `${hourLabel(p.defaultStart)}–${hourLabel(p.defaultStart + p.durationH)}`,
      `${hourLabel(p.start)}–${hourLabel(p.end)}`,
    ])
  );

  const before = result.baseline.gridKwh;
  const after = result.optimized.gridKwh;
  if (before > 0.005) {
    const pct = Math.round((result.savedGridKwh / before) * 100);
    impactEl.textContent =
      `Grid electricity: ${before.toFixed(1)} kWh → ${after.toFixed(1)} kWh ` +
      `(${pct}% less) for these appliances today. Estimate.`;
  } else {
    impactEl.textContent = 'These appliances need almost no grid electricity today.';
  }
}

form.addEventListener('submit', async (event) => {
  event.preventDefault();
  const name = input.value.trim();
  const panelKw = Number(panelInput.value);

  if (name.length < 2) {
    setStatus('Please enter a city name (at least 2 characters).', true);
    resultEl.hidden = true;
    return;
  }
  if (!Number.isFinite(panelKw) || panelKw < 0.5 || panelKw > 100) {
    setStatus('Panel size must be a number between 0.5 and 100 kW.', true);
    resultEl.hidden = true;
    return;
  }

  let appliances;
  try {
    appliances = readAppliances();
  } catch (err) {
    setStatus(err.message, true);
    resultEl.hidden = true;
    return;
  }

  button.disabled = true;
  resultEl.hidden = true;
  setStatus('Loading solar forecast...');

  try {
    const place = await geocodeCity(name);
    const forecastResult = await fetchForecast(place.latitude, place.longitude);
    const today = forecastResult.hours.slice(0, 24).map((h) => ({
      ...h,
      outputKw: estimateOutputKw(h, panelKw),
    }));
    const solarKw = today.map((h) => h.outputKw);
    const totalKwh = solarKw.reduce((sum, v) => sum + v, 0);
    const schedule = scheduleAppliances(solarKw, appliances);

    placeEl.textContent = place.country ? `${place.name}, ${place.country}` : place.name;
    summaryEl.textContent = `Estimated solar production for these 24 hours: ${totalKwh.toFixed(1)} kWh (${panelKw} kW system).`;
    renderSchedule(schedule);
    renderForecast(today);
    resultEl.hidden = false;

    const n = today.length;
    renderChart(chartCanvas, {
      labels: today.map((_, h) => hourLabel(h)),
      solar: solarKw.map((v) => Number(v.toFixed(2))),
      before: loadFromStarts(n, appliances, appliances.map((a) => a.defaultStart)),
      after: loadFromStarts(n, appliances, schedule.placements.map((p) => p.start)),
    });

    if (forecastResult.fromCache) {
      const when = Number.isFinite(forecastResult.savedAt)
        ? new Date(forecastResult.savedAt).toLocaleString()
        : 'an earlier time';
      setStatus(`Weather service unreachable. Showing the forecast saved on ${when}.`);
    } else {
      setStatus('');
    }
  } catch (err) {
    setStatus(err.message, true);
  } finally {
    button.disabled = false;
  }
});