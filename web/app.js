// App entry point — scenario-driven walkthrough.
//
// Page reads top to bottom as a story:
//   0. Scenario tabs + story + messy input + reference list
//   1. THE ANSWER — the verdict first, because that's what the reader
//      wants to know
//   2. Working — normalisation trail, candidate breakdowns, the rest
//
// Each candidate card leads with a compact score summary across all
// methods, so the reader can compare at a glance before diving into
// the per-method visual detail.

import { steps, runPipeline, normalize } from './normalization.js';
import { METHODS } from './methods.js';
import { SCENARIOS, getScenario } from './scenarios.js';
import { renderVisualization } from './visualize.js';
import { renderCalculation } from './calculations.js';
import { escapeHtml } from './util.js';

const state = {
  scenarioId: SCENARIOS[0].id,
  input: SCENARIOS[0].defaultInput,
};

// ─── Element lookups ─────────────────────────────────────────────────────
const $ = (id) => document.getElementById(id);
const tabsEl = $('scenarioTabs');
const storyEl = $('scenarioStory');
const sourceEl = $('scenarioSource');
const noiseEl = $('scenarioNoise');
const inputEl = $('mainInput');
const refSummaryEl = $('referenceSummary');
const refListEl = $('referenceList');
const normTrailEl = $('normTrail');
const topEl = $('topCandidates');
const restEl = $('restCandidates');
const verdictEl = $('verdict');

// ─── Helpers ─────────────────────────────────────────────────────────────
const fmt = (n) => n.toFixed(3);
const scoreClass = (s) => (s >= 0.85 ? 'score-high' : s < 0.5 ? 'score-low' : '');
const ordinal = (n) => {
  const tens = n % 100;
  if (tens >= 11 && tens <= 13) return `${n}th`;
  const suffix = { 1: 'st', 2: 'nd', 3: 'rd' }[n % 10] || 'th';
  return `${n}${suffix}`;
};

// ─── Scenario tabs ───────────────────────────────────────────────────────
function renderTabs() {
  tabsEl.innerHTML = '';
  for (const s of SCENARIOS) {
    const btn = document.createElement('button');
    btn.className = 'scenario-tab' + (s.id === state.scenarioId ? ' active' : '');
    btn.textContent = s.title;
    btn.addEventListener('click', () => {
      state.scenarioId = s.id;
      state.input = s.defaultInput;
      inputEl.value = s.defaultInput;
      renderAll();
    });
    tabsEl.appendChild(btn);
  }
}

// ─── Scenario story + reference list ─────────────────────────────────────
function renderScenarioHeader() {
  const sc = getScenario(state.scenarioId);
  storyEl.textContent = sc.story;
  sourceEl.innerHTML = `<strong>Where the reference list comes from:</strong> ${escapeHtml(sc.source)}`;
  noiseEl.innerHTML = `<strong>Typical noise:</strong> ${escapeHtml(sc.noise)}.`;
  refSummaryEl.textContent = `Reference list — ${sc.reference.length} entries`;
  refListEl.innerHTML = sc.reference
    .map((entry) => `<li>${escapeHtml(entry)}</li>`)
    .join('');
}

// ─── Normalization trail for the user's input ────────────────────────────
function renderNormTrail() {
  const stages = runPipeline(state.input);
  const rows = stages
    .map((stage, i) => {
      const explain =
        i === 0
          ? 'Raw input.'
          : (steps.find((s) => s.id === stage.id)?.explain || '');
      return `
        <div class="trail-row ${i === 0 ? 'is-raw' : ''}">
          <span class="trail-stage">${escapeHtml(stage.label)}</span>
          <span class="trail-string">${escapeHtml(stage.output) || '<em class="trail-empty">(empty)</em>'}</span>
          <span class="trail-explain">${escapeHtml(explain)}</span>
        </div>
      `;
    })
    .join('');
  normTrailEl.innerHTML = `
    <div class="trail-head">
      <span>Stage</span>
      <span>Your entry after this step</span>
      <span>Why this step matters</span>
    </div>
    ${rows}
  `;
}

// ─── Score every candidate ───────────────────────────────────────────────
// For each candidate, run every method and pick the best score + method.
// Rank candidates by their best score across all methods.

function scoreCandidates() {
  const sc = getScenario(state.scenarioId);
  const normA = normalize(state.input);
  return sc.reference
    .map((entry) => {
      const normB = normalize(entry);
      const perMethod = METHODS.map((m) => ({
        methodId: m.id,
        methodLabel: m.label,
        methodFamily: m.family,
        result: m.fn(normA, normB),
      }));
      const best = perMethod.reduce(
        (acc, cur) => (cur.result.score > acc.result.score ? cur : acc),
        perMethod[0],
      );
      return { raw: entry, normA, normB, perMethod, best };
    })
    .sort((a, b) => b.best.result.score - a.best.result.score);
}

// ─── Score summary row (shown at top of each candidate card) ─────────────
function renderScoreSummary(perMethod, bestId) {
  const cells = perMethod
    .map((pm) => {
      const isBest = pm.methodId === bestId;
      return `
        <div class="score-summary-cell ${isBest ? 'is-best' : ''} ${scoreClass(pm.result.score)}">
          <span class="score-summary-method">${escapeHtml(pm.methodLabel)}</span>
          <span class="score-summary-score">${fmt(pm.result.score)}</span>
        </div>
      `;
    })
    .join('');
  return `<div class="score-summary">${cells}</div>`;
}

// ─── Top candidate — full breakdown, always expanded ─────────────────────
function renderTopCandidates(candidates) {
  topEl.innerHTML = candidates.length
    ? renderCandidateCard(candidates[0], { showCalc: true })
    : '<p class="empty-note">No candidates to compare.</p>';
}

function renderMethodSections(perMethod, normA, normB, bestId, { showCalc = false } = {}) {
  return perMethod
    .map((pm) => {
      const viz = renderVisualization(pm.methodId, normA, normB, pm.result, {
        aLabel: 'Your entry',
        bLabel: 'Candidate',
      });
      const scoreCls = scoreClass(pm.result.score);
      const isBest = pm.methodId === bestId;
      const calc = showCalc
        ? `<details class="method-calc-toggle"><summary>Show calculation</summary>${renderCalculation(pm.methodId, normA, normB, pm.result)}</details>`
        : '';
      return `
        <div class="method-section ${isBest ? 'method-section-best' : ''}">
          <div class="method-section-head">
            <span class="method-section-name">${escapeHtml(pm.methodLabel)}</span>
            <span class="method-section-family">${escapeHtml(pm.methodFamily)}</span>
            <span class="method-section-score ${scoreCls}">${fmt(pm.result.score)}</span>
          </div>
          <p class="method-section-expl">${escapeHtml(pm.result.explanation)}</p>
          ${viz}
          ${calc}
        </div>
      `;
    })
    .join('');
}

function renderCandidateCard(cand, { showCalc = false } = {}) {
  const { raw, normA, normB, perMethod, best } = cand;
  return `
    <article class="candidate-card">
      <header class="candidate-head">
        <div class="candidate-names">
          <span class="candidate-name">${escapeHtml(raw)}</span>
          <span class="candidate-norm">normalised: <code>${escapeHtml(normB)}</code></span>
        </div>
      </header>
      ${renderScoreSummary(perMethod, best.methodId)}
      <div class="candidate-methods">${renderMethodSections(perMethod, normA, normB, best.methodId, { showCalc })}</div>
    </article>
  `;
}

// ─── Rest — accordion rows, click to reveal full working ─────────────────
function renderRestCandidates(candidates) {
  const rest = candidates.slice(1);
  if (rest.length === 0) {
    restEl.innerHTML = '<p class="empty-note">Only one candidate in the reference list.</p>';
    return;
  }
  restEl.innerHTML = rest
    .map((cand, i) => renderAccordionRow(cand, i + 2))
    .join('');
}

function renderAccordionRow(cand, rank) {
  const { raw, normA, normB, perMethod, best } = cand;
  return `
    <details class="candidate-row">
      <summary class="candidate-row-summary">
        <span class="candidate-row-rank">${ordinal(rank)}</span>
        <span class="candidate-row-name">${escapeHtml(raw)}</span>
        <span class="candidate-row-method">${escapeHtml(best.methodLabel)}</span>
        <span class="candidate-row-score ${scoreClass(best.result.score)}">${fmt(best.result.score)}</span>
        <span class="candidate-row-chevron" aria-hidden="true">›</span>
      </summary>
      <div class="candidate-row-body">
        <div class="candidate-row-norm">normalised: <code>${escapeHtml(normB)}</code></div>
        ${renderScoreSummary(perMethod, best.methodId)}
        <div class="candidate-methods">${renderMethodSections(perMethod, normA, normB, best.methodId, { showCalc: true })}</div>
      </div>
    </details>
  `;
}

// ─── Verdict (now at the top) ────────────────────────────────────────────
function renderVerdict(candidates) {
  if (candidates.length === 0) {
    verdictEl.innerHTML = '<p>No candidates to match against.</p>';
    return;
  }
  const winner = candidates[0];
  const { raw, best } = winner;
  const confidence =
    best.result.score >= 0.85 ? 'high' : best.result.score >= 0.65 ? 'medium' : 'low';
  const confidenceCopy = {
    high: 'Strong evidence — the best-scoring method is well above chance.',
    medium: 'Reasonable match, but worth a human look.',
    low: 'Weak match — treat with caution. The analyst may have typed something very different from anything in the reference list.',
  }[confidence];
  verdictEl.innerHTML = `
    <div class="verdict-box verdict-${confidence}">
      <div class="verdict-row">
        <span class="eyebrow">Your entry</span>
        <code>${escapeHtml(state.input)}</code>
      </div>
      <div class="verdict-row">
        <span class="eyebrow">Likely match</span>
        <span class="verdict-match">${escapeHtml(raw)}</span>
      </div>
      <div class="verdict-row">
        <span class="eyebrow">Winning method</span>
        <span>${escapeHtml(best.methodLabel)} — score ${fmt(best.result.score)}</span>
      </div>
      <p class="verdict-why">${confidenceCopy}</p>
    </div>
  `;
}

// ─── Main render loop ────────────────────────────────────────────────────
function renderAll() {
  renderScenarioHeader();
  const candidates = scoreCandidates();
  renderVerdict(candidates);
  renderNormTrail();
  renderTopCandidates(candidates);
  renderRestCandidates(candidates);
  [...tabsEl.children].forEach((btn, i) => {
    btn.classList.toggle('active', SCENARIOS[i].id === state.scenarioId);
  });
}

// ─── Bootstrap ───────────────────────────────────────────────────────────
function init() {
  inputEl.value = state.input;
  inputEl.addEventListener('input', (e) => {
    state.input = e.target.value;
    renderAll();
  });
  renderTabs();
  renderAll();
}

init();
