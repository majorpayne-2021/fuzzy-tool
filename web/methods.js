// Fuzzy matching methods.
//
// Each method exports a function of shape:
//   (a: string, b: string) -> { score, explanation, details }
//
// `details` is method-specific and drives the visual explanations in
// visualize.js. Implementations are kept deliberately readable — this is
// a teaching tool, so the code itself is part of the lesson. Production
// code would reach for `rapidfuzz` (Python) or `fastest-levenshtein` (JS)
// for speed.

// ─── Levenshtein ─────────────────────────────────────────────────────────
// The minimum number of single-character edits (insert, delete, substitute)
// needed to turn a into b. We divide by max(|a|, |b|) to get a 0..1 similarity.
//
// The `details.ops` array reconstructs the edit script by backtracking
// through the DP table — this is what the visualizer uses to show the
// character-by-character alignment with insert / delete / substitute
// operations highlighted.

export function levenshtein(a, b) {
  if (a === b) {
    return {
      score: 1,
      explanation: 'Identical strings.',
      details: { distance: 0, ops: [...a].map((ch) => ({ op: 'match', a: ch, b: ch })) },
    };
  }
  if (a.length === 0 || b.length === 0) {
    const ops = a.length
      ? [...a].map((ch) => ({ op: 'del', a: ch, b: null }))
      : [...b].map((ch) => ({ op: 'ins', a: null, b: ch }));
    return {
      score: 0,
      explanation: 'One string is empty.',
      details: { distance: Math.max(a.length, b.length), ops },
    };
  }

  const m = a.length;
  const n = b.length;
  const dp = Array.from({ length: m + 1 }, () => new Array(n + 1).fill(0));
  for (let i = 0; i <= m; i++) dp[i][0] = i;
  for (let j = 0; j <= n; j++) dp[0][j] = j;

  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      dp[i][j] = Math.min(
        dp[i - 1][j] + 1,        // deletion
        dp[i][j - 1] + 1,        // insertion
        dp[i - 1][j - 1] + cost, // substitution
      );
    }
  }

  // Backtrack to reconstruct the alignment — this is what the UI renders.
  const ops = [];
  let i = m;
  let j = n;
  while (i > 0 || j > 0) {
    if (i > 0 && j > 0 && a[i - 1] === b[j - 1] && dp[i][j] === dp[i - 1][j - 1]) {
      ops.unshift({ op: 'match', a: a[i - 1], b: b[j - 1] });
      i--; j--;
    } else if (i > 0 && j > 0 && dp[i][j] === dp[i - 1][j - 1] + 1) {
      ops.unshift({ op: 'sub', a: a[i - 1], b: b[j - 1] });
      i--; j--;
    } else if (i > 0 && dp[i][j] === dp[i - 1][j] + 1) {
      ops.unshift({ op: 'del', a: a[i - 1], b: null });
      i--;
    } else {
      ops.unshift({ op: 'ins', a: null, b: b[j - 1] });
      j--;
    }
  }

  const distance = dp[m][n];
  const score = 1 - distance / Math.max(m, n);
  return {
    score,
    explanation: `${distance} single-character edit${distance === 1 ? '' : 's'} needed.`,
    details: { distance, ops },
  };
}

// ─── Jaro-Winkler ────────────────────────────────────────────────────────
// Bounded 0..1 similarity. Good for short strings like names — boosts the
// score when strings share a common prefix (people typo the end, not the start).

export function jaroWinkler(a, b, prefixScale = 0.1, prefixMax = 4) {
  if (a === b) {
    return {
      score: 1,
      explanation: 'Identical strings.',
      details: { jaro: 1, prefix: Math.min(a.length, prefixMax), transpositions: 0, aMatches: new Array(a.length).fill(true), bMatches: new Array(b.length).fill(true) },
    };
  }
  if (a.length === 0 || b.length === 0) {
    return {
      score: 0,
      explanation: 'One string is empty.',
      details: { jaro: 0, prefix: 0, transpositions: 0, aMatches: [], bMatches: [] },
    };
  }

  // A character in a is considered "matching" with b if it appears within
  // this window. The window grows with the longer string.
  const matchWindow = Math.max(0, Math.floor(Math.max(a.length, b.length) / 2) - 1);

  const aMatches = new Array(a.length).fill(false);
  const bMatches = new Array(b.length).fill(false);
  let matches = 0;

  for (let i = 0; i < a.length; i++) {
    const start = Math.max(0, i - matchWindow);
    const end = Math.min(i + matchWindow + 1, b.length);
    for (let j = start; j < end; j++) {
      if (bMatches[j]) continue;
      if (a[i] !== b[j]) continue;
      aMatches[i] = true;
      bMatches[j] = true;
      matches++;
      break;
    }
  }

  if (matches === 0) {
    return {
      score: 0,
      explanation: 'No matching characters in window.',
      details: { jaro: 0, prefix: 0, transpositions: 0, aMatches, bMatches },
    };
  }

  // Count transpositions: matched characters that appear in different orders.
  let transpositions = 0;
  let k = 0;
  for (let i = 0; i < a.length; i++) {
    if (!aMatches[i]) continue;
    while (!bMatches[k]) k++;
    if (a[i] !== b[k]) transpositions++;
    k++;
  }
  transpositions /= 2;

  const jaro =
    (matches / a.length + matches / b.length + (matches - transpositions) / matches) / 3;

  // Winkler boost: add weight for a shared prefix up to prefixMax characters.
  let prefix = 0;
  for (let i = 0; i < Math.min(prefixMax, a.length, b.length); i++) {
    if (a[i] === b[i]) prefix++;
    else break;
  }
  const score = jaro + prefix * prefixScale * (1 - jaro);

  return {
    score,
    explanation: `Jaro ${jaro.toFixed(2)}, prefix boost from ${prefix} shared leading character${prefix === 1 ? '' : 's'}.`,
    details: { jaro, prefix, transpositions, aMatches, bMatches, matches },
  };
}

// ─── Jaccard (token-based) ───────────────────────────────────────────────
// Treat each string as a set of tokens (words). Similarity = intersection / union.
// Insensitive to word order — great when "John Smith" and "Smith John" should match.

export function jaccardTokens(a, b) {
  const tokensA = new Set(a.split(/\s+/).filter(Boolean));
  const tokensB = new Set(b.split(/\s+/).filter(Boolean));
  if (tokensA.size === 0 && tokensB.size === 0) {
    return {
      score: 1,
      explanation: 'Both strings empty.',
      details: { shared: [], uniqueA: [], uniqueB: [] },
    };
  }
  const shared = [...tokensA].filter((t) => tokensB.has(t));
  const uniqueA = [...tokensA].filter((t) => !tokensB.has(t));
  const uniqueB = [...tokensB].filter((t) => !tokensA.has(t));
  const union = new Set([...tokensA, ...tokensB]);
  const score = shared.length / union.size;
  return {
    score,
    explanation: `${shared.length} shared token${shared.length === 1 ? '' : 's'} out of ${union.size} total unique.`,
    details: { shared, uniqueA, uniqueB },
  };
}

// ─── Jaccard (character n-gram) ──────────────────────────────────────────
// Same idea, but with overlapping character sequences of length n instead
// of whole words. Catches partial matches within words ("Street" vs "St").

export function jaccardNgrams(a, b, n = 2) {
  const ngrams = (s) => {
    const grams = new Set();
    const padded = ` ${s} `;
    for (let i = 0; i <= padded.length - n; i++) grams.add(padded.slice(i, i + n));
    return grams;
  };
  const A = ngrams(a);
  const B = ngrams(b);
  if (A.size === 0 && B.size === 0) {
    return {
      score: 1,
      explanation: 'Both strings empty.',
      details: { n, shared: [], uniqueA: [], uniqueB: [] },
    };
  }
  const shared = [...A].filter((g) => B.has(g));
  const uniqueA = [...A].filter((g) => !B.has(g));
  const uniqueB = [...B].filter((g) => !A.has(g));
  const union = new Set([...A, ...B]);
  const score = shared.length / union.size;
  return {
    score,
    explanation: `${shared.length} shared character ${n}-grams out of ${union.size}.`,
    details: { n, shared, uniqueA, uniqueB },
  };
}

// ─── Metaphone (phonetic) ────────────────────────────────────────────────
// Encodes a string by how it *sounds*. "Catherine" and "Katherine" encode to
// the same key. This is a simplified Metaphone — handles the common English
// cases. Real projects should use a library (Double Metaphone, or language-
// specific encoders) for better coverage.

export function metaphoneCode(s) {
  if (!s) return '';
  let w = s.toUpperCase().replace(/[^A-Z]/g, '');
  if (!w) return '';

  // Strip common silent letter pairs at the start.
  w = w.replace(/^(KN|GN|PN|AE|WR)/, (m) => m[1]);
  if (w.startsWith('X')) w = 'S' + w.slice(1);
  if (w.startsWith('WH')) w = 'W' + w.slice(2);

  let out = '';
  for (let i = 0; i < w.length; i++) {
    const c = w[i];
    const prev = w[i - 1];
    const next = w[i + 1];

    // Collapse double letters (except C, which has special rules).
    if (c === prev && c !== 'C') continue;

    switch (c) {
      case 'A': case 'E': case 'I': case 'O': case 'U':
        if (i === 0) out += c; // vowels only kept at the start
        break;
      case 'B':
        if (!(i === w.length - 1 && prev === 'M')) out += 'B'; // silent B in "dumb"
        break;
      case 'C':
        if (next === 'H') { out += 'X'; i++; }          // CH -> X
        else if (/[IEY]/.test(next)) out += 'S';        // soft C
        else out += 'K';
        break;
      case 'D':
        if (next === 'G' && /[IEY]/.test(w[i + 2])) { out += 'J'; i += 2; }
        else out += 'T';
        break;
      case 'G':
        if (next === 'H') { if (i + 2 < w.length) i++; break; } // silent GH often
        if (next === 'N') { out += 'N'; i++; break; }
        if (/[IEY]/.test(next)) out += 'J';
        else out += 'K';
        break;
      case 'H':
        if (/[AEIOU]/.test(prev) && !/[AEIOU]/.test(next)) break; // silent H
        out += 'H';
        break;
      case 'K':
        if (prev !== 'C') out += 'K';
        break;
      case 'P':
        if (next === 'H') { out += 'F'; i++; } else out += 'P';
        break;
      case 'Q': out += 'K'; break;
      case 'S':
        if (next === 'H') { out += 'X'; i++; } else out += 'S';
        break;
      case 'T':
        if (next === 'H') { out += '0'; i++; }          // "th" -> 0
        else out += 'T';
        break;
      case 'V': out += 'F'; break;
      case 'W': case 'Y':
        if (/[AEIOU]/.test(next)) out += c;
        break;
      case 'X': out += 'KS'; break;
      case 'Z': out += 'S'; break;
      default: out += c;
    }
  }
  return out;
}

export function metaphone(a, b) {
  const codeA = metaphoneCode(a);
  const codeB = metaphoneCode(b);
  if (!codeA || !codeB) {
    return {
      score: 0,
      explanation: 'One string has no phonetic content.',
      details: { codeA, codeB, sameCode: false },
    };
  }
  if (codeA === codeB) {
    return {
      score: 1,
      explanation: `Both encode to "${codeA}" — they sound the same.`,
      details: { codeA, codeB, sameCode: true },
    };
  }
  // Fall back to Levenshtein on the codes for a soft phonetic score.
  const lev = levenshtein(codeA, codeB);
  return {
    score: lev.score,
    explanation: `Encodes to "${codeA}" vs "${codeB}" — phonetically ${lev.details.distance} edit${lev.details.distance === 1 ? '' : 's'} apart.`,
    details: { codeA, codeB, sameCode: false, codeDistance: lev.details.distance },
  };
}

// ─── Method registry ─────────────────────────────────────────────────────
// Single source of truth for the UI. Add a method here and it appears
// automatically in the tool.

export const METHODS = [
  {
    id: 'levenshtein',
    label: 'Levenshtein',
    family: 'Edit distance',
    tagline: 'Counts character edits — the classic for typos.',
    fn: levenshtein,
  },
  {
    id: 'jaro_winkler',
    label: 'Jaro-Winkler',
    family: 'Edit distance',
    tagline: 'Weights shared prefixes. Built for short strings like names.',
    fn: jaroWinkler,
  },
  {
    id: 'jaccard_tokens',
    label: 'Jaccard (tokens)',
    family: 'Set-based',
    tagline: 'Shared words over total unique words. Ignores word order.',
    fn: jaccardTokens,
  },
  {
    id: 'jaccard_ngrams',
    label: 'Jaccard (n-grams)',
    family: 'Set-based',
    tagline: 'Shared character sequences. Catches partial word matches.',
    fn: jaccardNgrams,
  },
  {
    id: 'metaphone',
    label: 'Metaphone',
    family: 'Phonetic',
    tagline: 'Matches by sound, not spelling. "Catherine" ≈ "Katherine".',
    fn: metaphone,
  },
];
