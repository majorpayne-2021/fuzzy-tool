# fuzzy-tool

An interactive showcase of fuzzy string matching — what it is, how it's used, the methods behind it, and a Python library you can drop into your own projects.

**[Try the live demo](#)** *(link goes here once deployed)*

---

## 1. What is fuzzy matching?

Fuzzy matching is how computers decide whether two strings *mean the same thing* even when they don't look exactly alike. `"Jon Smith"` and `"John Smith"`. `"123 Main St"` and `"123 Main Street"`. `"customer can't log in"` and `"login failing for user"`.

An equality check (`a == b`) says these are different. Fuzzy matching gives you a **similarity score** so you can decide how close is close enough.

## 2. How is it used?

- **Customer deduplication** — merging records for the same person entered twice with slightly different names.
- **Address standardization** — matching postal addresses across different formats and abbreviations.
- **Search & autocomplete** — returning results even when the user typos the query.
- **Data reconciliation** — joining two datasets from different systems where the keys don't match exactly.
- **Content moderation & spam detection** — finding near-duplicate messages.

## 3. The methods (theory)

The interactive tool in this repo lets you try each method on your own strings and see how they score. There are four families:

- **Edit distance** (Levenshtein, Jaro-Winkler) — count character-level changes.
- **Token / set-based** (Jaccard, TF-IDF) — compare bags of words or n-grams.
- **Phonetic** (Metaphone, Soundex) — match by sound, not spelling.
- **Semantic** (embeddings) — match by meaning.

The tool also shows a lesson most tutorials skip: **normalization matters more than method choice**. The same pair of strings can jump from 40% to 95% similarity just by lowercasing, stripping punctuation, and sorting tokens — *before* any algorithm runs.

## 4. The Python library (practical)

*Coming in a later phase.* A small Python package (`fuzzymatch`) that wraps these methods behind a clean API, with scenario helpers for names, addresses, and free-text notes.

```python
# preview of the eventual API
from fuzzymatch import compare, normalize

compare("Jon Smith", "John Smith", method="jaro_winkler")
# → 0.94

compare("Jon Smith", "John Smith", method="jaro_winkler", normalize=True)
# → 0.98  (after lowercasing, token-sort, etc.)
```

---

## Roadmap

- [x] Phase 1 — Interactive web tool (names scenario), deployed to GitHub Pages
- [ ] Phase 2 — Addresses + free-text notes scenarios
- [ ] Phase 3 — Python library with worked-example notebook
- [ ] Phase 4 — Publish library to PyPI
- [ ] Phase 5 — Single-file shareable HTML version

## Repo layout

```
fuzzy-tool/
├── web/           Interactive demo (HTML + vanilla JS, deployed to GitHub Pages)
├── fixtures/      Shared example pairs used by the demo and the library
├── notebooks/     Worked-example Jupyter notebooks (for the library phase)
└── src/           Python library (coming in Phase 3)
```

## Running locally

No build step — just open `web/index.html` in a browser.

## What I learned building this

*(Section to fill in as the project progresses — the lessons are part of the showcase.)*
