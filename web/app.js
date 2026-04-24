// App entry point — scenario-driven walkthrough.
//
// The flow is: user picks a scenario, types (or edits) a messy input, and
// the page re-renders top to bottom as a step-by-step story:
//   1. Normalization trail
//   2. Top 3 candidates with full visual method breakdowns
//   3. Remaining candidates in a compact table
//   4. A verdict — the likely match + why
//
// Keeping the renderers small and the state tiny means the code reads as
// the same narrative the UI tells.

import { steps as normSteps, runPipeline, normalize } from './normalization.js';
import { METHODS } from './methods.js';
import { SCENARIOS, getScenario } from './scenarios.js';
import { renderVisualization } from './visualize.js';

const state = {
  scenarioId: SCENARIOS[0].id,
  input: SCENARIOS[0].defaultInput,
};

// ─── Element lookups ─────────────────────────────────────────────────────
const $ = (id) => document.getElementById(id);
const tabsEl = $('scenarioTabs');
const storyEl = $('scenarioStory');
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

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

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
  noiseEl.innerHTML = `<strong>Typical noise in this scenario:</strong> ${escapeHtml(sc.noise)}.`;
  refSummaryEl.textContent = `Reference list — ${sc.reference.length} entries we'll match against`;
  refListEl.innerHTML = sc.reference
    .map((entry) => `<li>${escapeHtml(entry)}</li>`)
    .join('');
}

// ─── Normalization trail for the user's input ────────────────────────────
function renderNormTrail() {
  const stages = runPipeline(state.input);
  const rows = stages
    .map((stage, i) => {
      const explain = i === 0
        ? 'Raw input.'
        : (normSteps.find((s) => s.id === stage.id)?.explain || '');
      return `
        <div class="trail-row ${i === 0 ? 'is-raw' : ''}">
          <span class="trail-stage">${escapeHtml(stage.label)}</span>
          <span class="trail-string">${escapeHtml(stage.output) || '<em style="color:#999">(empty)</em>'}</span>
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
// For each candidate in the reference list, run every method and pick the
// winning score + method. Then rank the candidates by that top score.

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

// ─── Top 3 candidates — full visual breakdown ────────────────────────────
function renderTopCandidates(candidates) {
  const top = candidates.slice(0, 3);
  topEl.innerHTML = top
    .map((cand, rank) => renderCandidateCard(cand, rank + 1))
    .join('');
}

function renderCandidateCard(cand, rank) {
  const { raw, normA, normB, perMethod, best } = cand;
  const methodSections = perMethod
    .map((pm) => {
      const viz = renderVisualization(pm.methodId, normA, normB, pm.result, {
        aLabel: 'Your entry',
        bLabel: 'Candidate',
      });
      const scoreCls = scoreClass(pm.result.score);
      const isBest = pm.methodId === best.methodId;
      return `
        <div class="method-section ${isBest ? 'method-section-best' : ''}">
          <div class="method-section-head">
            <span class="method-section-name">${escapeHtml(pm.methodLabel)}</span>
            <span class="method-section-family">${escapeHtml(pm.methodFamily)}</span>
            <span class="method-section-score ${scoreCls}">${fmt(pm.result.score)}</span>
          </div>
          <p class="method-section-expl">${escapeHtml(pm.result.explanation)}</p>
          ${viz}
        </div>
      `;
    })
    .join('');
  return `
    <div class="candidate-card">
      <div class="candidate-head">
        <span class="candidate-rank">#${rank}</span>
        <div class="candidate-names">
          <span class="candidate-name">${escapeHtml(raw)}</span>
          <span class="candidate-norm">normalized: <code>${escapeHtml(normB)}</code></span>
        </div>
        <div class="candidate-best">
          <span class="candidate-best-label">best method</span>
          <span class="candidate-best-method">${escapeHtml(best.methodLabel)}</span>
          <span class="candidate-best-score ${scoreClass(best.result.score)}">${fmt(best.result.score)}</span>
        </div>
      </div>
      <div class="candidate-methods">${methodSections}</div>
    </div>
  `;
}

// ─── The rest — compact table ────────────────────────────────────────────
function renderRestCandidates(candidates) {
  const rest = candidates.slice(3);
  if (rest.length === 0) {
    restEl.innerHTML = '<p class="empty-note">All candidates shown above.</p>';
    return;
  }
  const rows = rest
    .map((c, i) => {
      return `
        <tr>
          <td class="cmp-rank">#${i + 4}</td>
          <td class="cmp-name">${escapeHtml(c.raw)}</td>
          <td class="cmp-method">${escapeHtml(c.best.methodLabel)}</td>
          <td class="cmp-score ${scoreClass(c.best.result.score)}">${fmt(c.best.result.score)}</td>
        </tr>
      `;
    })
    .join('');
  restEl.innerHTML = `
    <table class="compact-candidates">
      <thead>
        <tr><th>Rank</th><th>Candidate</th><th>Best method</th><th>Score</th></tr>
      </thead>
      <tbody>${rows}</tbody>
    </table>
  `;
}

// ─── Verdict ─────────────────────────────────────────────────────────────
function renderVerdict(candidates) {
  if (candidates.length === 0) {
    verdictEl.innerHTML = '<p>No candidates to match against.</p>';
    return;
  }
  const winner = candidates[0];
  const { raw, best } = winner;
  const confidence = best.result.score >= 0.85 ? 'high' : best.result.score >= 0.65 ? 'medium' : 'low';
  const confidenceCopy = {
    high: 'Strong evidence — the best-scoring method is well above chance.',
    medium: 'Reasonable match, but worth a human look.',
    low: 'Weak match — treat with caution. The analyst may have typed something very different from anything in the reference list.',
  }[confidence];
  verdictEl.innerHTML = `
    <div class="verdict-box verdict-${confidence}">
      <div class="verdict-row">
        <span class="verdict-label">Your entry</span>
        <code>${escapeHtml(state.input)}</code>
      </div>
      <div class="verdict-row">
        <span class="verdict-label">Likely match</span>
        <code class="verdict-match">${escapeHtml(raw)}</code>
      </div>
      <div class="verdict-row">
        <span class="verdict-label">Winning method</span>
        <span>${escapeHtml(best.methodLabel)} (${fmt(best.result.score)})</span>
      </div>
      <p class="verdict-why">${confidenceCopy}</p>
    </div>
  `;
}

// ─── Main render loop ────────────────────────────────────────────────────
function renderAll() {
  renderScenarioHeader();
  renderNormTrail();
  const candidates = scoreCandidates();
  renderTopCandidates(candidates);
  renderRestCandidates(candidates);
  renderVerdict(candidates);
  // Also rebuild tabs to reflect active state.
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
