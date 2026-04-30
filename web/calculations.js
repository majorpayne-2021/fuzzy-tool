// Score-derivation rendering shared between the algorithms page (where
// each method card shows the math for its fixed example) and the Try-it
// page (where it's an opt-in toggle on the top candidate). Each builder
// returns { where?, blocks } — `blocks` is the substitution derivation,
// `where` is an optional definitions list for any named quantities the
// formula references.

import { escapeHtml } from './util.js';

const fmtScore = (n) => n.toFixed(3);

const CALCULATIONS = {
  levenshtein: (a, b, r) => {
    const d = r.details.distance;
    const maxLen = Math.max(a.length, b.length);
    return {
      blocks: [[
        'Score = 1 − distance ÷ max(len A, len B)',
        `      = 1 − ${d} ÷ max(${a.length}, ${b.length})`,
        `      = 1 − ${d} ÷ ${maxLen} = ${fmtScore(r.score)}`,
      ]],
    };
  },
  jaro_winkler: (a, b, r) => {
    const { jaro, prefix, matches, transpositions } = r.details;
    return {
      where: [
        ['matches', 'characters that appear in both strings, found close to the same position (within a small sliding window).'],
        ['transpositions', 'matched characters that appear in a different order between the two strings (counted as out-of-order pairs ÷ 2).'],
        ['prefix', 'how many characters at the start of A and B are identical (capped at 4) — drives the Winkler bonus.'],
      ],
      blocks: [
        [
          'Jaro = (matches÷|A| + matches÷|B| + (matches − transpositions)÷matches) ÷ 3',
          `     = (${matches}÷${a.length} + ${matches}÷${b.length} + (${matches} − ${transpositions})÷${matches}) ÷ 3`,
          `     = ${fmtScore(jaro)}`,
        ],
        [
          'Score = Jaro + prefix × 0.1 × (1 − Jaro)',
          `      = ${fmtScore(jaro)} + ${prefix} × 0.1 × (1 − ${fmtScore(jaro)})`,
          `      = ${fmtScore(r.score)}`,
        ],
      ],
    };
  },
  jaccard_tokens: (a, b, r) => {
    const sharedN = r.details.shared.length;
    const unionN = sharedN + r.details.uniqueA.length + r.details.uniqueB.length;
    return {
      blocks: [[
        'Score = shared tokens ÷ total unique tokens',
        `      = ${sharedN} ÷ ${unionN}`,
        `      = ${fmtScore(r.score)}`,
      ]],
    };
  },
  jaccard_ngrams: (a, b, r) => {
    const sharedN = r.details.shared.length;
    const unionN = sharedN + r.details.uniqueA.length + r.details.uniqueB.length;
    return {
      blocks: [[
        `Score = shared ${r.details.n}-grams ÷ total unique ${r.details.n}-grams`,
        `      = ${sharedN} ÷ ${unionN}`,
        `      = ${fmtScore(r.score)}`,
      ]],
    };
  },
};

export function renderCalculation(methodId, a, b, result) {
  const builder = CALCULATIONS[methodId];
  if (!builder) return '';
  const out = builder(a, b, result);
  const where = (out.where || [])
    .map(([term, def]) => `<dt>${escapeHtml(term)}</dt><dd>${escapeHtml(def)}</dd>`)
    .join('');
  const whereHtml = where ? `<dl class="method-calc-where">${where}</dl>` : '';
  const blocks = out.blocks
    .map((rows) => `<pre class="method-calc-block">${rows.join('\n')}</pre>`)
    .join('');
  return `
    <div class="method-calc">
      <div class="method-calc-label">How the score is calculated</div>
      ${whereHtml}
      ${blocks}
    </div>
  `;
}
