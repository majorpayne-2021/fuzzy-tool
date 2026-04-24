// App entry point — wires the UI to the normalization pipeline and
// the method registry. Keep this file focused on DOM + rendering;
// the actual algorithms live in methods.js and normalization.js.

import { steps as normSteps, runPipeline } from './normalization.js';
import { METHODS } from './methods.js';
import { NAME_PRESETS } from './presets.js';

// ─── State ───────────────────────────────────────────────────────────────
const state = {
  a: 'John Smith',
  b: 'Jon Smith',
  enabledNormSteps: new Set(normSteps.map((s) => s.id)), // all on by default
  enabledMethods: new Set(METHODS.map((m) => m.id)),
  trailMethodId: 'levenshtein', // which method to show in the trail column
};

// ─── Element lookups ─────────────────────────────────────────────────────
const $ = (id) => document.getElementById(id);
const inputA = $('inputA');
const inputB = $('inputB');
const presetsEl = $('presets');
const normControlsEl = $('normControls');
const methodControlsEl = $('methodControls');
const trailEl = $('trail');
const methodResultsEl = $('methodResults');

// ─── Rendering helpers ───────────────────────────────────────────────────
const fmt = (n) => n.toFixed(3);
const scoreClass = (s) => (s >= 0.85 ? 'score-high' : s < 0.5 ? 'score-low' : '');

// ─── Presets ─────────────────────────────────────────────────────────────
function renderPresets() {
  for (const p of NAME_PRESETS) {
    const btn = document.createElement('button');
    btn.className = 'preset-btn';
    btn.type = 'button';
    btn.title = p.note;
    btn.innerHTML = `${p.a} ↔ ${p.b}<span class="preset-tag">${p.tag}</span>`;
    btn.addEventListener('click', () => {
      state.a = p.a;
      state.b = p.b;
      inputA.value = p.a;
      inputB.value = p.b;
      render();
    });
    presetsEl.appendChild(btn);
  }
}

// ─── Normalization step toggles ──────────────────────────────────────────
function renderNormControls() {
  for (const step of normSteps) {
    const id = `norm-${step.id}`;
    const wrapper = document.createElement('div');
    const label = document.createElement('label');
    label.innerHTML = `
      <input type="checkbox" id="${id}" ${state.enabledNormSteps.has(step.id) ? 'checked' : ''} />
      <span>${step.label}</span>
    `;
    const explain = document.createElement('span');
    explain.className = 'step-explain';
    explain.textContent = step.explain;
    wrapper.appendChild(label);
    wrapper.appendChild(explain);
    normControlsEl.appendChild(wrapper);
    label.querySelector('input').addEventListener('change', (e) => {
      if (e.target.checked) state.enabledNormSteps.add(step.id);
      else state.enabledNormSteps.delete(step.id);
      render();
    });
  }
}

// ─── Method toggles (also populates the trail's method picker) ───────────
function renderMethodControls() {
  for (const m of METHODS) {
    const id = `method-${m.id}`;
    const wrapper = document.createElement('div');
    const label = document.createElement('label');
    label.innerHTML = `
      <input type="checkbox" id="${id}" ${state.enabledMethods.has(m.id) ? 'checked' : ''} />
      <span>${m.label}</span>
    `;
    const explain = document.createElement('span');
    explain.className = 'step-explain';
    explain.textContent = m.tagline;
    wrapper.appendChild(label);
    wrapper.appendChild(explain);
    methodControlsEl.appendChild(wrapper);
    label.querySelector('input').addEventListener('change', (e) => {
      if (e.target.checked) state.enabledMethods.add(m.id);
      else state.enabledMethods.delete(m.id);
      render();
    });
  }
}

// ─── Normalization trail ────────────────────────────────────────────────
function renderTrail() {
  trailEl.innerHTML = '';

  // Picker: which method's score do we show in the rightmost column?
  const picker = document.createElement('div');
  picker.className = 'trail-method-picker';
  const pickerId = 'trail-method-select';
  picker.innerHTML = `
    <label for="${pickerId}">Score column shows:</label>
    <select id="${pickerId}">
      ${METHODS.map(
        (m) => `<option value="${m.id}" ${state.trailMethodId === m.id ? 'selected' : ''}>${m.label}</option>`,
      ).join('')}
    </select>
  `;
  trailEl.appendChild(picker);
  picker.querySelector('select').addEventListener('change', (e) => {
    state.trailMethodId = e.target.value;
    renderTrail();
  });

  const enabledStepIds = [...state.enabledNormSteps];
  const stagesA = runPipeline(state.a, enabledStepIds);
  const stagesB = runPipeline(state.b, enabledStepIds);
  const method = METHODS.find((m) => m.id === state.trailMethodId);

  const head = document.createElement('div');
  head.className = 'trail-head';
  head.innerHTML = `
    <span>Stage</span>
    <span class="trail-string-head">String A</span>
    <span class="trail-string-head">String B</span>
    <span class="trail-score-head">${method.label}</span>
  `;
  trailEl.appendChild(head);

  for (let i = 0; i < stagesA.length; i++) {
    const row = document.createElement('div');
    row.className = 'trail-row' + (i === 0 ? ' is-raw' : '');
    const { score } = method.fn(stagesA[i].output, stagesB[i].output);
    row.innerHTML = `
      <span class="trail-stage">${stagesA[i].label}</span>
      <span class="trail-string">${escapeHtml(stagesA[i].output) || '<em style="color:#999">(empty)</em>'}</span>
      <span class="trail-string">${escapeHtml(stagesB[i].output) || '<em style="color:#999">(empty)</em>'}</span>
      <span class="trail-score ${scoreClass(score)}">${fmt(score)}</span>
    `;
    trailEl.appendChild(row);
  }
}

// ─── Method results (all enabled methods on fully-normalized strings) ───
function renderMethodResults() {
  methodResultsEl.innerHTML = '';
  const enabledStepIds = [...state.enabledNormSteps];
  const stagesA = runPipeline(state.a, enabledStepIds);
  const stagesB = runPipeline(state.b, enabledStepIds);
  const finalA = stagesA[stagesA.length - 1].output;
  const finalB = stagesB[stagesB.length - 1].output;

  for (const m of METHODS) {
    if (!state.enabledMethods.has(m.id)) continue;
    const result = m.fn(finalA, finalB);
    const card = document.createElement('div');
    card.className = 'method-card';
    card.innerHTML = `
      <div>
        <span class="method-name">${m.label}</span>
        <span class="method-family">${m.family}</span>
      </div>
      <div>
        <div class="method-detail">${escapeHtml(result.explanation)}</div>
        <div class="method-tagline">${m.tagline}</div>
      </div>
      <span class="method-score ${scoreClass(result.score)}">${fmt(result.score)}</span>
    `;
    methodResultsEl.appendChild(card);
  }

  if (state.enabledMethods.size === 0) {
    methodResultsEl.innerHTML =
      '<p style="color:var(--muted);font-style:italic">No methods enabled — toggle some on above.</p>';
  }
}

// ─── Main render ─────────────────────────────────────────────────────────
function render() {
  renderTrail();
  renderMethodResults();
}

// ─── Utilities ───────────────────────────────────────────────────────────
function escapeHtml(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// ─── Bootstrap ───────────────────────────────────────────────────────────
function init() {
  inputA.value = state.a;
  inputB.value = state.b;
  inputA.addEventListener('input', (e) => { state.a = e.target.value; render(); });
  inputB.addEventListener('input', (e) => { state.b = e.target.value; render(); });
  renderPresets();
  renderNormControls();
  renderMethodControls();
  render();
}

init();
