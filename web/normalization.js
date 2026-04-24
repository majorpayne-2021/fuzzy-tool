// Normalization pipeline — each step is a pure function so the UI can
// display intermediate results and teach what each step does.
//
// The lesson: normalization often matters more than algorithm choice.

export const steps = [
  {
    id: 'lowercase',
    label: 'Lowercase',
    explain: 'Case differences ("Smith" vs "smith") are almost always noise.',
    apply: (s) => s.toLowerCase(),
  },
  {
    id: 'unicode_fold',
    label: 'Fold accents',
    explain: 'Strip diacritics so "Müller" matches "Muller" and "café" matches "cafe".',
    apply: (s) => s.normalize('NFD').replace(/[\u0300-\u036f]/g, ''),
  },
  {
    id: 'strip_punctuation',
    label: 'Strip punctuation',
    explain: 'Remove commas, periods, apostrophes — usually not meaningful for matching.',
    apply: (s) => s.replace(/[^\p{L}\p{N}\s]/gu, ' '),
  },
  {
    id: 'collapse_whitespace',
    label: 'Collapse whitespace',
    explain: 'Turn any run of spaces/tabs into a single space and trim the ends.',
    apply: (s) => s.replace(/\s+/g, ' ').trim(),
  },
  {
    id: 'token_sort',
    label: 'Sort tokens',
    explain: 'Sort words alphabetically so "Smith John" matches "John Smith".',
    apply: (s) => s.split(' ').filter(Boolean).sort().join(' '),
  },
];

// Run the pipeline up to and including the given step id (or all steps if no id).
// Returns an array of { id, label, output } so the UI can render every stage.
export function runPipeline(input, enabledIds = null) {
  const active = enabledIds
    ? steps.filter((s) => enabledIds.includes(s.id))
    : steps;
  const stages = [{ id: 'raw', label: 'Raw input', output: input }];
  let current = input;
  for (const step of active) {
    current = step.apply(current);
    stages.push({ id: step.id, label: step.label, output: current });
  }
  return stages;
}

// Convenience: just return the final normalized string.
export function normalize(input, enabledIds = null) {
  const stages = runPipeline(input, enabledIds);
  return stages[stages.length - 1].output;
}
