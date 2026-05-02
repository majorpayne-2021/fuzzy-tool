"""
fuzzy_matching.py — a five-stage fuzzy-matching pipeline in single-purpose functions.

Author:    Jennifer Payne — Data scientist
GitHub:    https://github.com/majorpayne-2021
LinkedIn:  https://www.linkedin.com/in/jenniferapayne25/
           Making the complex simple, one tech project at a time.

Each stage maps to one step in the data-cleansing workflow:

    1. Validate    — is the value sensible at all?
    2. Standardise — force a consistent format (dataset-level, applied once)
    3. Exact match — try the cheap, unambiguous path first
    4. Fuzzy match — normalise → compare → rank
    5. Threshold   — auto-match, send to review, or leave unmatched

Every function is small and stateless. Lift the one you need; the
"Putting it together" example at the bottom is just glue.

Dependency:
    rapidfuzz>=3   `pip install rapidfuzz`   (used for edit-distance scoring)

The Jaccard scorers are written from scratch because set arithmetic is
short and clear; Levenshtein and Jaro-Winkler defer to rapidfuzz, which
is what production code should use.
"""

from __future__ import annotations

import re
import unicodedata
from typing import Callable, Iterable, Optional

from rapidfuzz.distance import JaroWinkler, Levenshtein


# ─────────────────────────────────────────────────────────────────────────────
# Stage 1: Validate
# Reject obviously broken values before doing any matching work.
# Use as filters, CHECK constraints, or guards at the start of a pipeline.
# ─────────────────────────────────────────────────────────────────────────────

EMAIL_RE = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")
AU_POSTCODE_RE = re.compile(r"^\d{4}$")


def is_email(s: str) -> bool:
    """True if `s` looks like an email address.

    >>> is_email("jen@example.com")
    True
    >>> is_email("not an email")
    False
    """
    return bool(EMAIL_RE.match(s.strip()))


def is_au_postcode(s: str) -> bool:
    """True if `s` is a four-digit Australian postcode.

    >>> is_au_postcode("2000")
    True
    >>> is_au_postcode("20000")
    False
    """
    return bool(AU_POSTCODE_RE.match(s.strip()))


# ─────────────────────────────────────────────────────────────────────────────
# Stage 2: Standardise
# Force every record into the same format. Dataset-level practice — applied
# once at ingest. Different from Stage 4a's per-string normalisation.
# ─────────────────────────────────────────────────────────────────────────────

ADDRESS_ABBREVIATIONS = {
    "street": "st",
    "road": "rd",
    "avenue": "ave",
    "boulevard": "blvd",
    "drive": "dr",
    "court": "ct",
    "lane": "ln",
    "place": "pl",
    "highway": "hwy",
}


def standardise_name(s: str) -> str:
    """Title-case and collapse internal whitespace.

    >>> standardise_name("  john   SMITH ")
    'John Smith'
    """
    return " ".join(s.split()).title()


def standardise_phone_au(s: str) -> str:
    """Strip non-digits and rewrite as +61… form.

    >>> standardise_phone_au("(03) 9123 4567")
    '+61391234567'
    >>> standardise_phone_au("0412 345 678")
    '+61412345678'
    """
    digits = re.sub(r"\D", "", s)
    if digits.startswith("0"):
        digits = "61" + digits[1:]
    elif not digits.startswith("61"):
        digits = "61" + digits
    return "+" + digits


def standardise_address(s: str) -> str:
    """Lowercase and abbreviate common street types.

    >>> standardise_address("10 Smith Street")
    '10 smith st'
    >>> standardise_address("99 Pacific Highway")
    '99 pacific hwy'
    """
    out = " ".join(s.lower().split())
    for full, short in ADDRESS_ABBREVIATIONS.items():
        out = re.sub(rf"\b{full}\b", short, out)
    return out


# ─────────────────────────────────────────────────────────────────────────────
# Stage 3: Exact match
# Try this first. It's cheap, unambiguous, and handles most clean records.
# Only fall through to fuzzy matching when this misses.
# ─────────────────────────────────────────────────────────────────────────────


def exact_match(value: str, reference: Iterable[str]) -> Optional[str]:
    """Return the first reference entry equal to `value`, or None.

    >>> exact_match("John Smith", ["John Smith", "Jane Doe"])
    'John Smith'
    >>> exact_match("Jhon Smith", ["John Smith", "Jane Doe"]) is None
    True
    """
    return next((r for r in reference if r == value), None)


def exact_match_ci(value: str, reference: Iterable[str]) -> Optional[str]:
    """Case-insensitive exact match.

    >>> exact_match_ci("john smith", ["John Smith"])
    'John Smith'
    """
    needle = value.lower()
    return next((r for r in reference if r.lower() == needle), None)


# ─────────────────────────────────────────────────────────────────────────────
# Stage 4a: Fuzzy — Normalise
# Per-string cleanup applied identically to both sides just before comparison.
# Compose a custom pipeline by passing your own `steps` list to `normalise`.
# ─────────────────────────────────────────────────────────────────────────────


def lowercase(s: str) -> str:
    """`Smith` → `smith`."""
    return s.lower()


def fold_accents(s: str) -> str:
    """Strip diacritics so `Müller` → `Muller`, `café` → `cafe`."""
    return "".join(
        c for c in unicodedata.normalize("NFD", s) if not unicodedata.combining(c)
    )


def strip_punctuation(s: str) -> str:
    """Replace anything that isn't a letter/digit/whitespace with a space."""
    return re.sub(r"[^\w\s]", " ", s, flags=re.UNICODE)


def collapse_whitespace(s: str) -> str:
    """Any run of spaces/tabs becomes one space; trim ends."""
    return " ".join(s.split())


def sort_tokens(s: str) -> str:
    """Sort whitespace-separated tokens alphabetically.

    Lets `Smith John` match `John Smith`. Useful for full-name fields.

    >>> sort_tokens("Smith John")
    'John Smith'
    """
    return " ".join(sorted(s.split()))


DEFAULT_NORMALISATION = (
    lowercase,
    fold_accents,
    strip_punctuation,
    collapse_whitespace,
)


def normalise(
    s: str,
    steps: Iterable[Callable[[str], str]] = DEFAULT_NORMALISATION,
) -> str:
    """Run each step in order. The default does NOT sort tokens — opt in
    by passing your own `steps` if word order is unreliable.

    >>> normalise("  Café Müller!  ")
    'cafe muller'
    >>> normalise("Smith, John", steps=DEFAULT_NORMALISATION + (sort_tokens,))
    'john smith'
    """
    for step in steps:
        s = step(s)
    return s


# ─────────────────────────────────────────────────────────────────────────────
# Stage 4b: Fuzzy — Compare
# Each scorer takes two normalised strings and returns 0..1.
# Pick by the noise:
#   • edit distance  → typos in short strings (Levenshtein, Jaro-Winkler)
#   • set tokens     → reordered words ("John Smith" vs "Smith, John")
#   • set n-grams    → partial-word matches ("Street" vs "St")
# ─────────────────────────────────────────────────────────────────────────────


def levenshtein_score(a: str, b: str) -> float:
    """0..1 similarity from raw edit distance, normalised by max length.

    >>> round(levenshtein_score("kitten", "sitting"), 3)
    0.571
    """
    return Levenshtein.normalized_similarity(a, b)


def jaro_winkler_score(a: str, b: str) -> float:
    """Specialised for short strings like names. Boosts scores when the
    pair shares a leading prefix (people typo the ends of names more
    often than the beginnings).

    >>> round(jaro_winkler_score("jonathan", "jonathon"), 3)
    0.95
    """
    return JaroWinkler.normalized_similarity(a, b)


def jaccard_tokens_score(a: str, b: str) -> float:
    """Treat each string as a set of whitespace-separated words.
    Score = |shared| / |union|. Insensitive to word order.

    >>> jaccard_tokens_score("red blue green", "green red yellow")
    0.5
    """
    A, B = set(a.split()), set(b.split())
    if not A and not B:
        return 1.0
    return len(A & B) / len(A | B)


def jaccard_ngrams_score(a: str, b: str, n: int = 2) -> float:
    """Same idea as `jaccard_tokens_score`, but with overlapping character
    n-grams. Catches partial matches inside words.

    >>> round(jaccard_ngrams_score("hello", "hallo"), 3)
    0.5
    """
    def grams(s: str) -> set[str]:
        s = f" {s} "
        return {s[i:i + n] for i in range(len(s) - n + 1)}

    A, B = grams(a), grams(b)
    if not A and not B:
        return 1.0
    return len(A & B) / len(A | B)


# ─────────────────────────────────────────────────────────────────────────────
# Stage 4c: Fuzzy — Rank
# Score every candidate, return them sorted best-first. For very large
# reference lists, run a candidate-generation step (blocking, trigram index,
# MinHash/LSH) BEFORE this — never score one input against a million.
# ─────────────────────────────────────────────────────────────────────────────


def rank_candidates(
    value: str,
    reference: Iterable[str],
    scorer: Callable[[str, str], float] = jaro_winkler_score,
    top_n: Optional[int] = None,
) -> list[tuple[str, float]]:
    """Return [(candidate, score), …] sorted high-to-low.

    >>> rank_candidates(
    ...     "jhon smith",
    ...     ["John Smith", "Jane Doe", "Jonathan Müller"],
    ...     scorer=lambda a, b: jaro_winkler_score(normalise(a), normalise(b)),
    ...     top_n=2,
    ... )[0][0]
    'John Smith'
    """
    scored = [(r, scorer(value, r)) for r in reference]
    scored.sort(key=lambda x: x[1], reverse=True)
    return scored[:top_n] if top_n else scored


# ─────────────────────────────────────────────────────────────────────────────
# Stage 5: Threshold
# Cutoffs are a BUSINESS decision, not a technical one. Pick numbers your
# stakeholders agree on; the function below just applies them.
# ─────────────────────────────────────────────────────────────────────────────


def classify(score: float, auto: float = 0.90, review: float = 0.70) -> str:
    """Bucket a score into 'auto', 'review', or 'unmatched'.

    >>> classify(0.95)
    'auto'
    >>> classify(0.80)
    'review'
    >>> classify(0.40)
    'unmatched'
    """
    if score >= auto:
        return "auto"
    if score >= review:
        return "review"
    return "unmatched"


# Default scorer registry. Mirrors the four methods shown on the
# interactive tool. Pass your own dict to `best_match` to swap one out
# or experiment with a different combination.
SCORERS: dict[str, Callable[[str, str], float]] = {
    "levenshtein":    levenshtein_score,
    "jaro_winkler":   jaro_winkler_score,
    "jaccard_tokens": jaccard_tokens_score,
    "jaccard_ngrams": jaccard_ngrams_score,
}


# ─────────────────────────────────────────────────────────────────────────────
# Putting it together
# One messy input → all five stages → a decision. Glue, not framework.
# ─────────────────────────────────────────────────────────────────────────────


def match(
    messy: str,
    reference: list[str],
    *,
    scorer: Callable[[str, str], float] = jaro_winkler_score,
    auto: float = 0.90,
    review: float = 0.70,
) -> dict:
    """Run a single value end-to-end with ONE chosen scorer."""
    standardised = standardise_name(messy)

    if (hit := exact_match_ci(standardised, reference)) is not None:
        return {
            "input": messy,
            "match": hit,
            "score": 1.0,
            "decision": "auto",
            "via": "exact",
        }

    norm_input = normalise(standardised)
    ranked = sorted(
        ((r, scorer(norm_input, normalise(r))) for r in reference),
        key=lambda x: x[1],
        reverse=True,
    )
    best, best_score = ranked[0]
    return {
        "input": messy,
        "match": best,
        "score": best_score,
        "decision": classify(best_score, auto=auto, review=review),
        "via": "fuzzy",
    }


def best_match(
    messy: str,
    reference: list[str],
    *,
    scorers: dict[str, Callable[[str, str], float]] | None = None,
    auto: float = 0.90,
    review: float = 0.70,
) -> dict:
    """Run every scorer against every candidate; return the highest-scoring
    (candidate, method) combination — same idea as the interactive tool.

    Use this when your data has mixed noise types and you don't want to
    commit to a single scorer up front. Trade-off: 4× the comparisons,
    so it's slower than `match()`. For very large reference lists, add
    a candidate-generation step before this.

    Returns: {input, match, score, method, decision, via}.
    """
    if scorers is None:
        scorers = SCORERS

    standardised = standardise_name(messy)

    if (hit := exact_match_ci(standardised, reference)) is not None:
        return {
            "input": messy,
            "match": hit,
            "score": 1.0,
            "method": "exact",
            "decision": "auto",
            "via": "exact",
        }

    norm_input = normalise(standardised)
    best = {"score": -1.0, "match": None, "method": None}
    for r in reference:
        norm_r = normalise(r)
        for name, scorer in scorers.items():
            s = scorer(norm_input, norm_r)
            if s > best["score"]:
                best = {"score": s, "match": r, "method": name}

    return {
        "input": messy,
        "match": best["match"],
        "score": best["score"],
        "method": best["method"],
        "decision": classify(best["score"], auto=auto, review=review),
        "via": "fuzzy",
    }


if __name__ == "__main__":
    reference = ["John Smith", "Jane Doe", "Jonathan Müller", "10 Smith St"]
    messy_inputs = ["Jhon Smith", "jane DOE", "Jon Muller", "10 Smith Street"]
    for raw in messy_inputs:
        result = best_match(raw, reference)
        print(
            f"{result['input']!r:24} → {result['match']!r:22} "
            f"score={result['score']:.3f}  "
            f"method={result['method']:14}  "
            f"decision={result['decision']}"
        )
