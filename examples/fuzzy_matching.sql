-- fuzzy_matching.sql — a five-stage fuzzy-matching pipeline in PostgreSQL.
--
-- Each section maps to one step in the data-cleansing workflow:
--
--     1. Validate    — is the value sensible at all?
--     2. Standardise — force a consistent format (dataset-level, applied once)
--     3. Exact match — try the cheap, unambiguous path first
--     4. Fuzzy match — normalise → compare → rank
--     5. Threshold   — auto-match, send to review, or leave unmatched
--
-- Every example is self-contained — it uses inline VALUES so you can
-- paste any single block into psql and run it. Lift the snippet you
-- need; the "Putting it together" CTE at the bottom is just glue.
--
-- Dialect:    PostgreSQL 13+
-- Extensions: required for Stages 4a and 4b — install once per database:
--
--     CREATE EXTENSION IF NOT EXISTS unaccent;       -- accent folding
--     CREATE EXTENSION IF NOT EXISTS pg_trgm;        -- trigram similarity (Jaccard 3-grams)
--     CREATE EXTENSION IF NOT EXISTS fuzzystrmatch;  -- Levenshtein, Soundex, Metaphone
--
-- BigQuery / Snowflake equivalents are noted inline where there's a
-- clean swap. There's no built-in Jaro-Winkler in any of these
-- warehouses — call out to a UDF (PL/Python, JS UDF) if you need it.


-- =========================================================================
-- Stage 1: Validate
-- Cheap shape checks. Use as WHERE filters, CHECK constraints, or CASE.
-- =========================================================================

-- Email shape (deliberately loose — RFC-perfect regexes are not worth it)
SELECT 'jen@example.com' ~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$' AS is_email;

-- Four-digit Australian postcode
SELECT '2000' ~ '^\d{4}$' AS is_au_postcode;


-- =========================================================================
-- Stage 2: Standardise
-- Applied once at ingest. Different from Stage 4a's per-string normalisation:
-- standardisation makes every record in the dataset look the same;
-- normalisation runs on a single value just before it's compared.
-- =========================================================================

-- 2.1 — Title-case names + collapse internal whitespace
CREATE OR REPLACE FUNCTION fm_standardise_name(s text) RETURNS text AS $$
  SELECT INITCAP(REGEXP_REPLACE(TRIM(s), '\s+', ' ', 'g'));
$$ LANGUAGE SQL IMMUTABLE;

SELECT fm_standardise_name('  john   SMITH ');   -- 'John Smith'

-- 2.2 — Australian phone numbers → +61… form
CREATE OR REPLACE FUNCTION fm_standardise_phone_au(s text) RETURNS text AS $$
  SELECT '+' || REGEXP_REPLACE(
                  REGEXP_REPLACE(s, '\D', '', 'g'),
                  '^0', '61'
                );
$$ LANGUAGE SQL IMMUTABLE;

SELECT fm_standardise_phone_au('(03) 9123 4567');  -- '+61391234567'

-- 2.3 — Address abbreviations (Street → st, Highway → hwy, …)
CREATE OR REPLACE FUNCTION fm_standardise_address(s text) RETURNS text AS $$
  SELECT REGEXP_REPLACE(
           REGEXP_REPLACE(
             REGEXP_REPLACE(
               REGEXP_REPLACE(
                 REGEXP_REPLACE(
                   REGEXP_REPLACE(LOWER(TRIM(s)),
                     '\mstreet\M',    'st',   'g'),
                     '\mroad\M',      'rd',   'g'),
                     '\mavenue\M',    'ave',  'g'),
                     '\mboulevard\M', 'blvd', 'g'),
                     '\mhighway\M',   'hwy',  'g'),
                     '\s+',           ' ',    'g'
         );
$$ LANGUAGE SQL IMMUTABLE;

SELECT fm_standardise_address('10 Smith Street');  -- '10 smith st'


-- =========================================================================
-- Stage 3: Exact match
-- A plain join. Try this before anything fuzzy — it covers most clean rows.
-- Use the `_ci` variant when case is unreliable.
-- =========================================================================

WITH input(id, value) AS (VALUES (1, 'John Smith'), (2, 'Jhon Smith')),
     reference(id, value) AS (VALUES (10, 'John Smith'), (11, 'Jane Doe'))
SELECT i.value AS input_value, r.value AS exact_match
FROM input i
LEFT JOIN reference r ON i.value = r.value;
-- Returns 'John Smith' for input 1, NULL for input 2 (typo → falls through to fuzzy).

-- Case-insensitive variant: LOWER on both sides (or use COLLATE if you have one).
WITH input(value) AS (VALUES ('john smith')),
     reference(value) AS (VALUES ('John Smith'))
SELECT r.value AS exact_match_ci
FROM input i
JOIN reference r ON LOWER(i.value) = LOWER(r.value);


-- =========================================================================
-- Stage 4a: Fuzzy — Normalise
-- Per-string cleanup applied identically to both sides. Lower, fold
-- accents, strip punctuation, collapse whitespace.
-- =========================================================================

CREATE OR REPLACE FUNCTION fm_normalise(s text) RETURNS text AS $$
  SELECT REGEXP_REPLACE(
           REGEXP_REPLACE(
             unaccent(LOWER(s)),
             '[^[:alnum:][:space:]]', ' ', 'g'),
             '\s+',                   ' ', 'g'
         );
$$ LANGUAGE SQL IMMUTABLE;

SELECT fm_normalise('  Café Müller!  ');  -- 'cafe muller'

-- Optional: also sort tokens so "Smith John" matches "John Smith".
CREATE OR REPLACE FUNCTION fm_sort_tokens(s text) RETURNS text AS $$
  SELECT array_to_string(
           ARRAY(SELECT unnest(string_to_array(s, ' ')) AS t ORDER BY t),
           ' '
         );
$$ LANGUAGE SQL IMMUTABLE;

SELECT fm_sort_tokens(fm_normalise('Smith, John'));  -- 'john smith'


-- =========================================================================
-- Stage 4b: Fuzzy — Compare
-- Pick the scorer that matches the noise you actually have.
-- =========================================================================

-- 4b.1 — Edit distance (typos in short strings).
--        levenshtein() returns raw edits; divide by the longer length for 0..1.
SELECT
  levenshtein('John Smith', 'Jhon Smith') AS lev_distance,        -- 2
  1.0 - levenshtein('John Smith', 'Jhon Smith')::float
        / GREATEST(length('John Smith'), length('Jhon Smith'))    -- 0.8
    AS lev_similarity;
-- BigQuery: EDIT_DISTANCE(a, b)  ·  Snowflake: EDITDISTANCE(a, b)

-- 4b.2 — Trigram similarity (Jaccard on character 3-grams; partial-word matches).
SELECT
  similarity('John Smith', 'John Smithers')  AS trigram_sim,       -- ~0.65
  'John Smith' <-> 'John Smithers'           AS trigram_distance;  -- 1 - sim
-- BigQuery / Snowflake: no built-in; build n-grams via SPLIT/SUBSTR + ARRAY_AGG.

-- 4b.3 — Phonetic (sounds-alike). Useful as a complement, not a replacement.
SELECT
  soundex('Catherine')   = soundex('Katherine')    AS soundex_match,
  dmetaphone('Schmidt')  = dmetaphone('Schmit')    AS metaphone_match;

-- 4b.4 — No Jaro-Winkler in core Postgres. If you need it:
--   • install the `pg_similarity` extension (provides jaro_winkler), or
--   • write a PL/Python function calling rapidfuzz / jellyfish.


-- =========================================================================
-- Stage 4c: Fuzzy — Rank
-- Score every reference candidate against each input, sort best-first.
-- For large reference lists, add a trigram GIN index and use the % operator
-- to filter to a shortlist BEFORE scoring everything.
-- =========================================================================

WITH input(id, value) AS (
  VALUES (1, 'Jhon Smith'),
         (2, 'cafe muller')
),
reference(id, value) AS (
  VALUES (10, 'John Smith'),
         (11, 'Jane Doe'),
         (12, 'Café Müller'),
         (13, 'Smithers John')
),
scored AS (
  SELECT
    i.id           AS input_id,
    i.value        AS input_value,
    r.value        AS candidate,
    similarity(fm_normalise(i.value), fm_normalise(r.value)) AS score
  FROM input i
  CROSS JOIN reference r
)
SELECT input_id, input_value, candidate, ROUND(score::numeric, 3) AS score,
       ROW_NUMBER() OVER (PARTITION BY input_id ORDER BY score DESC) AS rank
FROM scored
ORDER BY input_id, rank;

-- Index pattern for big reference lists:
--   CREATE INDEX ON reference USING GIN (value gin_trgm_ops);
--   ... WHERE i.value % r.value     -- shortlist via trigram index, then score


-- =========================================================================
-- Stage 5: Threshold
-- Cutoffs are a BUSINESS decision, not a technical one. Plug in whichever
-- numbers your stakeholders agree on.
-- =========================================================================

WITH scored(input_value, candidate, score) AS (
  VALUES ('Jhon Smith',  'John Smith',     0.94),
         ('cafe muller', 'Café Müller',    0.78),
         ('xyz',         'something else', 0.30)
)
SELECT input_value, candidate, score,
       CASE
         WHEN score >= 0.90 THEN 'auto'
         WHEN score >= 0.70 THEN 'review'
         ELSE 'unmatched'
       END AS decision
FROM scored;


-- =========================================================================
-- Putting it together
-- One messy input through validate → standardise → exact → fuzzy → threshold.
-- Drop your real `input` and `reference` tables in place of the VALUES blocks.
-- =========================================================================

WITH input(id, raw) AS (
  VALUES (1, 'Jhon Smith'),
         (2, 'jane DOE'),
         (3, 'Cafe Muller')
),
reference(id, raw) AS (
  VALUES (10, 'John Smith'),
         (11, 'Jane Doe'),
         (12, 'Café Müller')
),
prepped AS (
  SELECT id,
         raw,
         fm_standardise_name(raw)                AS std,
         fm_normalise(fm_standardise_name(raw))  AS norm
  FROM input
),
ref AS (
  SELECT id, raw, fm_normalise(raw) AS norm FROM reference
),
exact AS (
  SELECT p.id AS input_id, p.raw AS input_raw, r.raw AS match,
         1.0::float AS score, 'exact' AS via
  FROM prepped p
  JOIN ref r ON LOWER(p.std) = LOWER(r.raw)
),
fuzzy AS (
  SELECT p.id AS input_id, p.raw AS input_raw, r.raw AS match,
         GREATEST(
           similarity(p.norm, r.norm),
           1.0 - levenshtein(p.norm, r.norm)::float
                 / NULLIF(GREATEST(length(p.norm), length(r.norm)), 0)
         ) AS score,
         'fuzzy' AS via
  FROM prepped p
  CROSS JOIN ref r
  WHERE NOT EXISTS (SELECT 1 FROM exact e WHERE e.input_id = p.id)
),
ranked AS (
  SELECT *, ROW_NUMBER() OVER (PARTITION BY input_id ORDER BY score DESC) AS rk
  FROM (SELECT * FROM exact UNION ALL SELECT * FROM fuzzy) AS u
)
SELECT input_id,
       input_raw,
       match,
       ROUND(score::numeric, 3) AS score,
       via,
       CASE
         WHEN score >= 0.90 THEN 'auto'
         WHEN score >= 0.70 THEN 'review'
         ELSE 'unmatched'
       END AS decision
FROM ranked
WHERE rk = 1
ORDER BY input_id;
