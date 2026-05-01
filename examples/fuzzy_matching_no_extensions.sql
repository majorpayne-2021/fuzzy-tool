-- fuzzy_matching_no_extensions.sql
-- Same five-stage pipeline as fuzzy_matching.sql, but every algorithm is
-- written from scratch in PL/pgSQL or pure SQL — no CREATE EXTENSION
-- required. Useful when you're on a locked-down corporate Postgres
-- where DBA approval for extensions is hard to get.
--
-- Author:    Jennifer Payne — Data scientist
-- GitHub:    https://github.com/majorpayne-2021
-- LinkedIn:  https://www.linkedin.com/in/jenniferapayne25/
--            Making the complex simple, one tech project at a time.
--
-- Dialect:   PostgreSQL 9.3+ (LATERAL joins are used; everything else is older)
-- Privileges needed: CREATE FUNCTION on the target schema. That's it —
--                    no superuser, no contrib extensions, no PL/Python.
--
-- Trade-offs vs. the extension-based version:
--   • Slower. PL/pgSQL is interpreted, so each call has overhead. For
--     thousands of pairs you're fine; for millions you'll want a
--     candidate-generation step (blocking on first letter, postcode
--     prefix, etc.) so the function only runs on shortlisted pairs.
--   • Accent folding is via translate() with a Latin-only mapping
--     instead of the comprehensive unaccent extension. Adequate for
--     European names; extend the mapping if you need other scripts.
--   • Trigram operator (%) and GIN index aren't available, so candidate
--     generation must be hand-rolled.
--
-- Functions defined here (all prefixed `fm_`):
--   fm_unaccent              · strip Latin diacritics (Müller → Muller)
--   fm_standardise_name      · INITCAP + collapse whitespace
--   fm_standardise_phone_au  · → +61… form
--   fm_standardise_address   · lowercase + abbreviate Street/Road/etc.
--   fm_normalise             · per-string cleanup before scoring
--   fm_sort_tokens           · "Smith John" → "John Smith"
--   fm_levenshtein           · raw edit distance
--   fm_levenshtein_score     · 0..1 similarity from edit distance
--   fm_jaro_winkler          · 0..1 specialised for short names ★
--   fm_jaccard_tokens        · 0..1 set-based on whitespace tokens
--   fm_jaccard_ngrams        · 0..1 set-based on character n-grams


-- =========================================================================
-- Stage 1: Validate
-- Cheap shape checks. Use as WHERE filters, CHECK constraints, or CASE.
-- No functions defined — just inline regex.
-- =========================================================================

SELECT 'jen@example.com' ~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$' AS is_email;
SELECT '2000' ~ '^\d{4}$' AS is_au_postcode;


-- =========================================================================
-- Stage 2: Standardise
-- Applied once at ingest. Pure SQL — no extensions needed.
-- =========================================================================

CREATE OR REPLACE FUNCTION fm_standardise_name(s text) RETURNS text AS $$
  SELECT INITCAP(REGEXP_REPLACE(TRIM(s), '\s+', ' ', 'g'));
$$ LANGUAGE SQL IMMUTABLE;

CREATE OR REPLACE FUNCTION fm_standardise_phone_au(s text) RETURNS text AS $$
  SELECT '+' || REGEXP_REPLACE(
                  REGEXP_REPLACE(s, '\D', '', 'g'),
                  '^0', '61'
                );
$$ LANGUAGE SQL IMMUTABLE;

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


-- =========================================================================
-- Stage 3: Exact match
-- A plain join. No extensions needed.
-- =========================================================================

WITH input(value) AS (VALUES ('John Smith'), ('Jhon Smith')),
     reference(value) AS (VALUES ('John Smith'), ('Jane Doe'))
SELECT i.value AS input_value, r.value AS exact_match
FROM input i
LEFT JOIN reference r ON i.value = r.value;


-- =========================================================================
-- Stage 4a: Fuzzy — Normalise
-- Replacement for the unaccent extension: a translate() mapping that
-- covers common Latin diacritics. Extend the mapping if your data has
-- characters from other scripts.
-- =========================================================================

-- The mapping deliberately omits Æ, Œ, and ß because translate() can
-- only do single-char to single-char replacements; the proper expansion
-- (Æ→AE, Œ→OE, ß→ss) needs REPLACE() and is data-specific. Add those
-- as a layer on top if your data needs them.
CREATE OR REPLACE FUNCTION fm_unaccent(s text) RETURNS text AS $$
  SELECT translate(
    s,
    -- Source: accented characters (uppercase block, then lowercase block)
    'ÀÁÂÃÄÅĀĂĄÇĆČĐÈÉÊËĒĚĘÌÍÎÏĪÑŃŇÒÓÔÕÖØŌŐŠŚŞÙÚÛÜŪŮŰÝŸŽŹŻ' ||
    'àáâãäåāăąçćčđèéêëēěęìíîïīñńňòóôõöøōőšśşùúûüūůűýÿžźż',
    -- Replacement: ASCII equivalents at the same positions
    'AAAAAAAAACCCDEEEEEEEIIIIINNNOOOOOOOOSSSUUUUUUUYYZZZ'   ||
    'aaaaaaaaacccdeeeeeeeiiiiinnnoooooooosssuuuuuuuyyzzz'
  );
$$ LANGUAGE SQL IMMUTABLE;

SELECT fm_unaccent('Müller Schmidt — Café 1');  -- 'Muller Schmidt — Cafe 1'

CREATE OR REPLACE FUNCTION fm_normalise(s text) RETURNS text AS $$
  SELECT REGEXP_REPLACE(
           REGEXP_REPLACE(
             fm_unaccent(LOWER(s)),
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


-- =========================================================================
-- Stage 4b: Fuzzy — Compare
-- Four scorers, all reimplemented from scratch.
-- =========================================================================

-- 4b.1 — Levenshtein edit distance.
-- Standard dynamic programming, two-row optimisation (only the previous
-- row is needed at each step). Returns the raw edit count.
CREATE OR REPLACE FUNCTION fm_levenshtein(a text, b text) RETURNS int AS $$
DECLARE
    m int := length(a);
    n int := length(b);
    prev_row int[];
    curr_row int[];
    i int;
    j int;
    cost int;
BEGIN
    IF m = 0 THEN RETURN n; END IF;
    IF n = 0 THEN RETURN m; END IF;

    -- prev_row[j+1] holds dp[i-1][j], where j ranges 0..n.
    prev_row := ARRAY(SELECT generate_series(0, n));
    curr_row := array_fill(0, ARRAY[n + 1]);

    FOR i IN 1..m LOOP
        curr_row[1] := i;  -- dp[i][0] = i
        FOR j IN 1..n LOOP
            IF substring(a FROM i FOR 1) = substring(b FROM j FOR 1) THEN
                cost := 0;
            ELSE
                cost := 1;
            END IF;
            curr_row[j + 1] := LEAST(
                prev_row[j + 1] + 1,    -- deletion
                curr_row[j]     + 1,    -- insertion
                prev_row[j]     + cost  -- substitution
            );
        END LOOP;
        prev_row := curr_row;
        curr_row := array_fill(0, ARRAY[n + 1]);
    END LOOP;

    RETURN prev_row[n + 1];
END;
$$ LANGUAGE plpgsql IMMUTABLE STRICT PARALLEL SAFE;

-- 4b.1b — Levenshtein as a 0..1 similarity, normalised by max length.
CREATE OR REPLACE FUNCTION fm_levenshtein_score(a text, b text) RETURNS float AS $$
  SELECT
    CASE
      WHEN length(a) = 0 AND length(b) = 0 THEN 1.0
      WHEN length(a) = 0 OR  length(b) = 0 THEN 0.0
      ELSE 1.0 - fm_levenshtein(a, b)::float / GREATEST(length(a), length(b))
    END;
$$ LANGUAGE SQL IMMUTABLE STRICT PARALLEL SAFE;

SELECT fm_levenshtein('kitten', 'sitting')        AS lev_distance,   -- 3
       fm_levenshtein_score('kitten', 'sitting')  AS lev_similarity; -- 0.571


-- 4b.2 — Jaro-Winkler. ★ The headline algorithm of this file.
-- Two-step:
--   1. Jaro: count characters that "match" within a sliding window;
--      count how many of those matches are out of order (transpositions);
--      then jaro = (m/|a| + m/|b| + (m - t/2)/m) / 3.
--   2. Winkler boost: weight a shared prefix (capped at `prefix_max`)
--      because typos cluster at the end of names, not the start.
CREATE OR REPLACE FUNCTION fm_jaro_winkler(
    a              text,
    b              text,
    prefix_scale   float DEFAULT 0.1,
    prefix_max     int   DEFAULT 4
) RETURNS float AS $$
DECLARE
    a_len          int := length(a);
    b_len          int := length(b);
    match_window   int;
    a_matches      boolean[];
    b_matches      boolean[];
    matches        int := 0;
    transpositions int := 0;
    prefix_len     int := 0;
    jaro           float;
    score          float;
    i              int;
    j              int;
    k              int;
    win_start      int;
    win_end        int;
BEGIN
    IF a = b THEN RETURN 1.0; END IF;
    IF a_len = 0 OR b_len = 0 THEN RETURN 0.0; END IF;

    match_window := GREATEST(0, FLOOR(GREATEST(a_len, b_len)::float / 2)::int - 1);
    a_matches := array_fill(false, ARRAY[a_len]);
    b_matches := array_fill(false, ARRAY[b_len]);

    -- Find matched characters (each can only match once).
    FOR i IN 1..a_len LOOP
        win_start := GREATEST(1, i - match_window);
        win_end   := LEAST(b_len, i + match_window);
        FOR j IN win_start..win_end LOOP
            IF NOT b_matches[j]
               AND substring(a FROM i FOR 1) = substring(b FROM j FOR 1) THEN
                a_matches[i] := true;
                b_matches[j] := true;
                matches := matches + 1;
                EXIT;
            END IF;
        END LOOP;
    END LOOP;

    IF matches = 0 THEN RETURN 0.0; END IF;

    -- Count transpositions: matched characters that appear in different orders.
    k := 1;
    FOR i IN 1..a_len LOOP
        IF a_matches[i] THEN
            WHILE NOT b_matches[k] LOOP k := k + 1; END LOOP;
            IF substring(a FROM i FOR 1) <> substring(b FROM k FOR 1) THEN
                transpositions := transpositions + 1;
            END IF;
            k := k + 1;
        END IF;
    END LOOP;
    -- Half-pairs: two out-of-order matches count as one transposition.
    transpositions := transpositions / 2;

    jaro := (matches::float / a_len
           + matches::float / b_len
           + (matches - transpositions)::float / matches) / 3;

    -- Winkler boost: shared prefix of up to prefix_max characters.
    FOR i IN 1..LEAST(prefix_max, a_len, b_len) LOOP
        IF substring(a FROM i FOR 1) = substring(b FROM i FOR 1) THEN
            prefix_len := prefix_len + 1;
        ELSE
            EXIT;
        END IF;
    END LOOP;

    score := jaro + prefix_len * prefix_scale * (1 - jaro);
    RETURN score;
END;
$$ LANGUAGE plpgsql IMMUTABLE STRICT PARALLEL SAFE;

SELECT fm_jaro_winkler('jonathan', 'jonathon')  AS jw_full_match,    -- ~0.95
       fm_jaro_winkler('John',     'Jhon')      AS jw_typo,          -- ~0.93
       fm_jaro_winkler('Jhon Smith','Smith Jhon') AS jw_reordered;   -- ~0.53 (Jaccard fits this better)


-- 4b.3 — Jaccard similarity on whitespace-separated tokens.
-- Pure SQL: split both strings, dedupe, count shared / union.
CREATE OR REPLACE FUNCTION fm_jaccard_tokens(a text, b text) RETURNS float AS $$
  WITH
    a_tokens AS (
      SELECT DISTINCT t FROM unnest(string_to_array(a, ' ')) AS t WHERE t <> ''
    ),
    b_tokens AS (
      SELECT DISTINCT t FROM unnest(string_to_array(b, ' ')) AS t WHERE t <> ''
    ),
    shared AS (SELECT t FROM a_tokens INTERSECT SELECT t FROM b_tokens),
    full_union AS (SELECT t FROM a_tokens UNION     SELECT t FROM b_tokens)
  SELECT
    CASE
      WHEN (SELECT count(*) FROM full_union) = 0 THEN 1.0
      ELSE (SELECT count(*) FROM shared)::float / (SELECT count(*) FROM full_union)
    END;
$$ LANGUAGE SQL IMMUTABLE STRICT PARALLEL SAFE;

SELECT fm_jaccard_tokens('red blue green', 'green red yellow');  -- 0.5


-- 4b.4 — Jaccard similarity on character n-grams. Default n = 2 (bigrams).
-- Pad each string with a leading + trailing space so first/last characters
-- contribute to gram counts the same way middle characters do.
CREATE OR REPLACE FUNCTION fm_jaccard_ngrams(
    a text,
    b text,
    n int DEFAULT 2
) RETURNS float AS $$
  WITH
    a_padded(s) AS (SELECT ' ' || a || ' '),
    b_padded(s) AS (SELECT ' ' || b || ' '),
    a_grams AS (
      SELECT DISTINCT substring(p.s FROM g.i FOR n) AS g
      FROM a_padded p
      CROSS JOIN LATERAL generate_series(1, length(p.s) - n + 1) AS g(i)
    ),
    b_grams AS (
      SELECT DISTINCT substring(p.s FROM g.i FOR n) AS g
      FROM b_padded p
      CROSS JOIN LATERAL generate_series(1, length(p.s) - n + 1) AS g(i)
    ),
    shared AS (SELECT g FROM a_grams INTERSECT SELECT g FROM b_grams),
    full_union AS (SELECT g FROM a_grams UNION SELECT g FROM b_grams)
  SELECT
    CASE
      WHEN (SELECT count(*) FROM full_union) = 0 THEN 1.0
      ELSE (SELECT count(*) FROM shared)::float / (SELECT count(*) FROM full_union)
    END;
$$ LANGUAGE SQL IMMUTABLE STRICT PARALLEL SAFE;

SELECT fm_jaccard_ngrams('hello', 'hallo')     AS bigram_sim,
       fm_jaccard_ngrams('hello', 'hallo', 3)  AS trigram_sim;


-- =========================================================================
-- Stage 4c: Fuzzy — Rank
-- Score every candidate, sort best-first. Same shape as the extension
-- version, just using fm_* functions throughout.
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
    fm_jaro_winkler(fm_normalise(i.value), fm_normalise(r.value)) AS score
  FROM input i
  CROSS JOIN reference r
)
SELECT input_id, input_value, candidate, ROUND(score::numeric, 3) AS score,
       ROW_NUMBER() OVER (PARTITION BY input_id ORDER BY score DESC) AS rank
FROM scored
ORDER BY input_id, rank;


-- =========================================================================
-- Stage 5: Threshold
-- Same as the extension version. Cutoffs are a business decision.
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
-- One messy input through validate → standardise → exact → fuzzy → threshold,
-- using only the fm_* functions defined above. Drop your real `input` and
-- `reference` tables in place of the VALUES blocks.
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
         -- Use Jaro-Winkler as the default scorer here; swap in any of
         -- fm_levenshtein_score / fm_jaccard_tokens / fm_jaccard_ngrams
         -- depending on which one fits your data's noise type.
         fm_jaro_winkler(p.norm, r.norm) AS score,
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


-- =========================================================================
-- Performance note
-- =========================================================================
--
-- A PL/pgSQL Jaro-Winkler is ~10–50x slower per call than the same
-- algorithm in a C extension. Rules of thumb for staying out of trouble:
--
--   • Always normalise BEFORE scoring (Stage 4a). Saves work and
--     improves match quality at once.
--   • For reference lists over a few thousand rows, do candidate
--     generation (blocking) before scoring. Cheap blocking keys:
--       - first letter of normalised input
--       - postcode prefix
--       - soundex-style first-consonant key, hand-rolled
--     A blocking key turns N×M comparisons into N×k where k ≪ M.
--   • Score in batches via INSERT INTO ... SELECT, not row-by-row from
--     the application. Keeps the planner happy and the function calls
--     local.
--   • If you hit a performance wall, the right next step is to lobby
--     for the `pg_similarity` extension or PL/Python — both turn this
--     file into a teaching artefact and the production code into one
--     line of `jaro_winkler(a, b)`.
