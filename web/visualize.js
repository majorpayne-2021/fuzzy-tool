// Visual explanations — the teaching layer.
//
// Each method has a renderer that turns its `details` object into HTML
// that *shows the mechanism*. Scores alone don't teach; seeing which
// characters aligned, which tokens overlapped, and which phonetic code
// was produced — that's what makes the method click for a reader.

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// ─── Levenshtein: character alignment ────────────────────────────────────
// Walks the edit script and renders two stacked rows, with each pair of
// aligned characters in a column. Insertions/deletions get a "·" gap
// marker. Substitutions and gaps are color-coded to draw the eye.

export function renderLevenshtein(details, { aLabel = 'Your entry', bLabel = 'Candidate' } = {}) {
  const { ops, distance } = details;
  const cells = ops
    .map((op) => {
      const cls = `lev-cell lev-${op.op}`;
      const top = op.a == null ? '·' : escapeHtml(op.a);
      const bot = op.b == null ? '·' : escapeHtml(op.b);
      const topChar = `<span class="lev-char">${top}</span>`;
      const botChar = `<span class="lev-char">${bot}</span>`;
      return `<div class="${cls}"><div class="lev-top">${topChar}</div><div class="lev-bot">${botChar}</div></div>`;
    })
    .join('');
  const summary = distance === 0
    ? 'No edits needed — identical.'
    : `${distance} edit${distance === 1 ? '' : 's'} to turn one into the other (substitutions in orange, insertions/deletions in blue).`;
  return `
    <div class="viz viz-lev">
      <div class="viz-labels">
        <span class="viz-label-top">${escapeHtml(aLabel)}</span>
        <span class="viz-label-bot">${escapeHtml(bLabel)}</span>
      </div>
      <div class="lev-row">${cells}</div>
      <p class="viz-summary">${summary}</p>
    </div>
  `;
}

// ─── Jaro-Winkler: matched characters + prefix highlight ─────────────────
// Shows each character of both strings, shading matched characters green.
// Prefix characters (shared at the start) get an extra underline to show
// the Winkler boost coming from them.

export function renderJaroWinkler(a, b, details, { aLabel = 'Your entry', bLabel = 'Candidate' } = {}) {
  const { aMatches, bMatches, prefix, matches, transpositions } = details;
  const renderString = (str, mask) =>
    [...str]
      .map((ch, i) => {
        const matched = mask[i];
        const isPrefix = i < prefix;
        const classes = ['jw-ch'];
        if (matched) classes.push('jw-matched');
        if (isPrefix) classes.push('jw-prefix');
        return `<span class="${classes.join(' ')}">${escapeHtml(ch)}</span>`;
      })
      .join('');

  const aHtml = renderString(a, aMatches || []);
  const bHtml = renderString(b, bMatches || []);
  const prefixSummary =
    prefix > 0
      ? `Shared prefix of ${prefix} character${prefix === 1 ? '' : 's'} (underlined) — Winkler bonus.`
      : 'No shared prefix — no Winkler bonus.';
  const transSummary =
    transpositions > 0
      ? ` ${transpositions} pair${transpositions === 1 ? '' : 's'} out of order.`
      : '';

  return `
    <div class="viz viz-jw">
      <div class="jw-row"><span class="viz-side-label">${escapeHtml(aLabel)}</span><span class="jw-string">${aHtml}</span></div>
      <div class="jw-row"><span class="viz-side-label">${escapeHtml(bLabel)}</span><span class="jw-string">${bHtml}</span></div>
      <p class="viz-summary">${matches || 0} character${matches === 1 ? '' : 's'} matched within the window (green). ${prefixSummary}${transSummary}</p>
    </div>
  `;
}

// ─── Jaccard tokens: pills ───────────────────────────────────────────────
// Renders three groups of pills: shared, unique to A, unique to B.
// A glance tells the reader how much overlap there is.

export function renderJaccardTokens(details) {
  const { shared, uniqueA, uniqueB } = details;
  const pill = (text, cls) => `<span class="pill ${cls}">${escapeHtml(text)}</span>`;
  const group = (label, items, cls) => {
    if (items.length === 0) {
      return `<div class="pill-group"><span class="pill-group-label">${label}:</span><span class="pill-none">none</span></div>`;
    }
    return `<div class="pill-group"><span class="pill-group-label">${label}:</span>${items.map((t) => pill(t, cls)).join('')}</div>`;
  };
  return `
    <div class="viz viz-tokens">
      ${group('Shared tokens', shared, 'pill-shared')}
      ${group('Only in your entry', uniqueA, 'pill-unique-a')}
      ${group('Only in candidate', uniqueB, 'pill-unique-b')}
    </div>
  `;
}

// ─── Jaccard n-grams: compact tile summary ───────────────────────────────
// Full n-gram lists get long. Show a count + the first ~10 shared tiles
// so the reader sees the idea without a wall of two-letter squares.

export function renderJaccardNgrams(details) {
  const { shared, uniqueA, uniqueB, n } = details;
  const sample = shared.slice(0, 12);
  const tiles = sample
    .map((g) => `<span class="ngram-tile">${escapeHtml(g)}</span>`)
    .join('');
  const extra = shared.length > sample.length ? ` (+${shared.length - sample.length} more)` : '';
  return `
    <div class="viz viz-ngrams">
      <div class="ngram-summary">
        ${shared.length} shared ${n}-gram${shared.length === 1 ? '' : 's'},
        ${uniqueA.length} only in your entry,
        ${uniqueB.length} only in the candidate.
      </div>
      <div class="ngram-row">
        <span class="viz-side-label">Shared:</span>
        ${tiles || '<span class="pill-none">none</span>'}
        <span class="ngram-extra">${extra}</span>
      </div>
    </div>
  `;
}

// ─── Metaphone: the phonetic fingerprint ─────────────────────────────────
// Shows each string above its phonetic code — if the codes match, the
// strings "sound the same" even when they're spelled differently.

export function renderMetaphone(a, b, details, { aLabel = 'Your entry', bLabel = 'Candidate' } = {}) {
  const { codeA, codeB, sameCode } = details;
  const verdict = sameCode
    ? '<span class="meta-verdict meta-verdict-same">Same phonetic code → they sound alike.</span>'
    : '<span class="meta-verdict meta-verdict-diff">Different phonetic codes.</span>';
  return `
    <div class="viz viz-meta">
      <div class="meta-row">
        <span class="viz-side-label">${escapeHtml(aLabel)}</span>
        <span class="meta-string">${escapeHtml(a)}</span>
        <span class="meta-arrow">→</span>
        <span class="meta-code">${escapeHtml(codeA || '(empty)')}</span>
      </div>
      <div class="meta-row">
        <span class="viz-side-label">${escapeHtml(bLabel)}</span>
        <span class="meta-string">${escapeHtml(b)}</span>
        <span class="meta-arrow">→</span>
        <span class="meta-code">${escapeHtml(codeB || '(empty)')}</span>
      </div>
      <p class="viz-summary">${verdict}</p>
    </div>
  `;
}

// ─── Dispatch by method id ───────────────────────────────────────────────
// Called from the main render loop. Each method is rendered from its
// normalized inputs + the details object the method itself returned.

export function renderVisualization(methodId, a, b, result, labels) {
  const details = result.details || {};
  switch (methodId) {
    case 'levenshtein':
      return renderLevenshtein(details, labels);
    case 'jaro_winkler':
      return renderJaroWinkler(a, b, details, labels);
    case 'jaccard_tokens':
      return renderJaccardTokens(details);
    case 'jaccard_ngrams':
      return renderJaccardNgrams(details);
    case 'metaphone':
      return renderMetaphone(a, b, details, labels);
    default:
      return '';
  }
}
