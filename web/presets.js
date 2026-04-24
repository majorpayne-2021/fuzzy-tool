// Curated example pairs for the "names" scenario. Each preset is picked
// to illustrate a specific kind of noise, so clicking through them tells
// a story about when different methods win or lose.

export const NAME_PRESETS = [
  {
    tag: 'typo',
    a: 'John Smith',
    b: 'Jon Smith',
    note: 'Single-character typo — edit-distance methods shine here.',
  },
  {
    tag: 'reorder',
    a: 'Smith, John',
    b: 'John Smith',
    note: 'Same name, different order and punctuation — token methods win.',
  },
  {
    tag: 'phonetic',
    a: 'Catherine Taylor',
    b: 'Katherine Taylor',
    note: 'Different spelling, same sound — Metaphone collapses both.',
  },
  {
    tag: 'accents',
    a: 'Müller',
    b: 'Mueller',
    note: 'Unicode fold turns "ü" into "u" before any matching happens.',
  },
  {
    tag: 'initial',
    a: 'J. Smith',
    b: 'John Smith',
    note: 'Initial vs. full name — hard for every method without a nickname rule.',
  },
  {
    tag: 'case',
    a: 'JOHN DOE',
    b: 'john doe',
    note: 'Pure case difference — lowercase step alone fixes it.',
  },
];
