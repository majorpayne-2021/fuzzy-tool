# fuzzy-tool

A teaching artefact for **fuzzy string matching** — how a computer decides that
`"Jhon Smith"` probably meant `"John Smith"`, and which of the four common
algorithms to reach for when.

Two halves:

- An **interactive web tool** that visualises *how* each algorithm reasons
  about a pair of strings, side by side, with the score derivation spelled
  out underneath.
- A pair of **copy-pasteable recipe files** — the same five-stage pipeline
  written as single-purpose functions in **Python** and **PostgreSQL** —
  so you can lift the bit you need into your own project.

— **Jennifer Payne** · Data scientist · [GitHub](https://github.com/majorpayne-2021) · [LinkedIn](https://www.linkedin.com/in/jenniferapayne25/)
*Making the complex simple, one tech project at a time.*

---

## Quickstart

| If you want to… | Go here |
|---|---|
| Just play with the tool, no install | Download [`dist/fuzzy-tool.html`](dist/fuzzy-tool.html) and double-click it |
| Read the source of the tool | [`web/`](web/) — three HTML pages + plain ES-module JS |
| Drop the pipeline into Python | [`examples/fuzzy_matching.py`](examples/fuzzy_matching.py) |
| Drop the pipeline into PostgreSQL | [`examples/fuzzy_matching.sql`](examples/fuzzy_matching.sql) |
| See it run on CRM-style CSVs | [`examples/fuzzy_matching_demo.ipynb`](examples/fuzzy_matching_demo.ipynb) |

The bundled HTML file is fully self-contained — all CSS and JavaScript inlined,
no companion files. It works offline; only the custom fonts (Fraunces + Inter)
need an internet connection, and it falls back gracefully without them.

## The five-stage pipeline

Every recipe in this repo organises around the same five stages, the
canonical data-cleansing workflow:

1. **Validate** — is the value sensible at all? (regex shape checks)
2. **Standardise** — force the dataset into a consistent format (title-case names, normalise phone numbers, abbreviate street types)
3. **Exact match** — try the cheap path first; covers most clean records
4. **Fuzzy match** — only when exact fails:
   - **Normalise** the input and each candidate identically
   - **Compare** with one of four scorers
   - **Rank** candidates by best score
5. **Threshold** — turn the score into a decision: auto-match, send to review, or leave unmatched

The Python and SQL files mirror this structure section-for-section so the
parallel between languages is immediate.

## The four scorers

Picked because each one teaches a different idea about similarity:

| Method | Family | Earns its keep when… |
|---|---|---|
| **Levenshtein** | Edit distance | Typos in short strings |
| **Jaro-Winkler** | Edit distance (specialised) | Short names — boosts shared prefixes |
| **Jaccard (tokens)** | Set-based | Words reordered (`John Smith` ↔ `Smith, John`) |
| **Jaccard (n-grams)** | Set-based | Partial-word matches (`Street` ↔ `St`) |

Phonetic methods (Soundex, Metaphone) and semantic embeddings exist but
aren't covered here — they're a different teaching arc.

## Two lessons most tutorials skip

1. **Normalisation matters more than algorithm choice.** Lower-casing,
   folding accents, stripping punctuation, and collapsing whitespace can
   turn a 30% Jaccard score into a 95% one — *before* any clever
   algorithm runs. The interactive tool shows the normalisation trail
   explicitly so you can watch it happen.
2. **Thresholds are a business decision, not a technical one.** A score
   of 0.85 might be "auto-match" in your customer CRM and "needs human
   review" in your patient registry. The pipeline keeps thresholding as
   the last step on purpose.

## Repo layout

```
fuzzy-tool/
├── web/                    Source for the interactive tool (HTML + ES-module JS)
│   ├── index.html          "Try it" — pick a scenario, type messy input, see scores
│   ├── concepts.html       "What is fuzzy matching?" — pipeline + checklist
│   └── methods.html        "The algorithms" — per-method explanations + math
├── dist/fuzzy-tool.html    Bundled single-file version of the tool (download-and-go)
├── examples/
│   ├── fuzzy_matching.py        Python recipes — single-purpose functions per stage
│   ├── fuzzy_matching.sql       PostgreSQL recipes — same shape, paste-and-run
│   └── fuzzy_matching_demo.ipynb  Notebook walkthrough on CSV inputs
├── fixtures/
│   ├── inputs.csv          Messy inputs across 4 scenarios + expected_match column
│   └── reference.csv       Authoritative reference lists (same as the web tool)
└── tools/build_bundle.py   Builds dist/fuzzy-tool.html from web/
```

## Running locally

The web tool uses ES modules, which need a tiny HTTP server (browsers
don't load modules from `file://`):

```bash
python3 -m http.server 8000 --directory web
# then visit http://localhost:8000
```

Rebuild the bundled file after editing source:

```bash
python3 tools/build_bundle.py
```

The Python file works as-is:

```bash
pip install rapidfuzz
python3 examples/fuzzy_matching.py
```

The SQL file targets PostgreSQL 13+ and needs three `CREATE EXTENSION`
lines (listed at the top of the file): `unaccent`, `pg_trgm`, `fuzzystrmatch`.

---

Made by **Jennifer Payne**.
[GitHub](https://github.com/majorpayne-2021) · [LinkedIn](https://www.linkedin.com/in/jenniferapayne25/)
