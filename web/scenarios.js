// Scenarios — the four real-world situations the tool walks through.
//
// Each scenario is just data: a title, a short story framing, a messy
// default input that an analyst might realistically type, and a reference
// list that represents the "known-good" values the tool should try to
// match against. Keeping this purely declarative means the rest of the
// app is generic — adding a fifth scenario is just another entry here.

export const SCENARIOS = [
  {
    id: 'names',
    title: 'Customer names',
    story:
      'An analyst has a customer name that looks off — a typo, a phonetic spelling, or a name with diacritics. What\'s the real name in our customer database?',
    noise: 'phonetic spellings, typos, diacritics, word order',
    defaultInput: 'Jhon Smyth',
    reference: [
      'John Smith',
      'Jon Smyth',
      'Catherine Taylor',
      'Katherine Taylor',
      'Michael Johnson',
      'Sarah Williams',
      'Jose Garcia',
      'Francois Dubois',
      'Jennifer Anderson',
      'David Miller',
      'Emily Wilson',
      'Robert Brown',
      'Mueller Schmidt',
      'Ahmed Hassan',
      'Maria Rodriguez',
      'William Taylor',
    ],
  },
  {
    id: 'sentences',
    title: 'Free-text notes',
    story:
      'A support-ticket system has a fixed list of common issues. An analyst sees a note with typos and wants to bucket it under one of the canonical issues.',
    noise: 'typos, missing articles, different phrasings',
    defaultInput: 'i cant loggin to my acount',
    reference: [
      'Cannot log in to my account',
      'Password reset not working',
      'Payment failed during checkout',
      'Item not received after delivery',
      'App crashes on startup',
      'Email notifications not arriving',
      'Cannot update my profile picture',
      'Subscription not cancelling',
      'Search results are slow',
      'Two-factor authentication not working',
      'Wrong amount charged to card',
      'Account locked after too many attempts',
    ],
  },
  {
    id: 'addresses',
    title: 'Addresses',
    story:
      'A messy address — abbreviations, typos, missing commas — needs to be matched to an address in a standardized list.',
    noise: 'abbreviations (St vs Street), typos in place names, format',
    defaultInput: '123 mane st sprngfld IL',
    reference: [
      '123 Main Street, Springfield, IL',
      '456 Oak Avenue, Portland, OR',
      '789 Elm Drive, Austin, TX',
      '100 Market Plaza, San Francisco, CA',
      '250 5th Avenue, New York, NY',
      '1600 Pennsylvania Avenue, Washington, DC',
      '42 Baker Street, London',
      '15 Rue de Rivoli, Paris',
      '8 Maple Lane, Boulder, CO',
      '321 Cedar Court, Seattle, WA',
      '77 Pine Road, Miami, FL',
      '555 Broadway, New York, NY',
    ],
  },
  {
    id: 'countries',
    title: 'Country names',
    story:
      'A user typed a country name with a typo or an old/alternate name. Which country in our canonical list did they mean?',
    noise: 'typos, abbreviations, alternate spellings',
    defaultInput: 'untied kingdum',
    reference: [
      'United States',
      'United Kingdom',
      'Germany',
      'France',
      'Spain',
      'Italy',
      'Japan',
      'China',
      'Brazil',
      'Canada',
      'Australia',
      'Mexico',
      'India',
      'Russia',
      'South Korea',
      'Netherlands',
      'Sweden',
      'Norway',
      'South Africa',
      'Egypt',
      'Argentina',
      'New Zealand',
      'Ireland',
      'Portugal',
    ],
  },
];

export function getScenario(id) {
  return SCENARIOS.find((s) => s.id === id);
}
