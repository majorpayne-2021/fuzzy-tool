// Scenarios — the four real-world situations the tool walks through.
//
// Each scenario is just data: a title, a short story framing, a note about
// where the reference list comes from in real life (so readers understand
// the setup is realistic), a messy default input an analyst might type,
// and the reference list of known-good values.
//
// Keeping this purely declarative means the rest of the app is generic —
// adding a fifth scenario is just another entry here.

export const SCENARIOS = [
  {
    id: 'names',
    title: 'Customer names',
    story:
      "An analyst has a customer name that looks off — a typo, a phonetic spelling, or a name with diacritics. Which real customer did they mean?",
    source:
      "In real life, the reference list comes from your CRM, customer master table, or patient registry — an authoritative list of known customers.",
    noise: 'typos, diacritics, word order, missing letters',
    defaultInput: 'Jhon Smith',
    topN: 3,
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
    id: 'companies',
    title: 'Company names',
    story:
      "An analyst has a company name with typos and missing legal suffixes. Which company in the corporate registry did they mean?",
    source:
      "In real life, the reference list comes from ASIC's company register, an ASX-listed company list, your vendor master, or a data provider like Dun & Bradstreet.",
    noise: 'legal suffixes (Pty Ltd, Proprietary Limited), typos, abbreviations, missing words',
    defaultInput: 'Commwealth Bank Aus',
    topN: 3,
    reference: [
      'BHP Group Limited',
      'Commonwealth Bank of Australia',
      'CSL Limited',
      'Rio Tinto Limited',
      'Wesfarmers Limited',
      'Woolworths Group Limited',
      'Telstra Group Limited',
      'Macquarie Group Limited',
      'ANZ Group Holdings Limited',
      'National Australia Bank Limited',
      'Westpac Banking Corporation',
      'Qantas Airways Limited',
      'Coles Group Limited',
      'Fortescue Metals Group Limited',
      'Origin Energy Limited',
      'Atlassian Corporation Plc',
    ],
  },
  {
    id: 'addresses',
    title: 'Addresses',
    story:
      "A messy Australian address — abbreviations, typos, missing commas — needs to be matched to a standardized address.",
    source:
      "In real life, the reference list comes from Australia Post's Postal Address File (PAF), a geocoding service like Google Places, or your organisation's cleansed address database.",
    noise: 'abbreviations (St vs Street), typos in place names, format, missing postcodes',
    defaultInput: '130 Swanson st melborne VIC',
    topN: 3,
    reference: [
      '130 Swanston Street, Melbourne VIC 3000',
      'Parliament House, Canberra ACT 2600',
      'Sydney Opera House, Bennelong Point, Sydney NSW 2000',
      'Flinders Street Station, Melbourne VIC 3000',
      '1 Martin Place, Sydney NSW 2000',
      '101 Collins Street, Melbourne VIC 3000',
      '200 George Street, Sydney NSW 2000',
      'Adelaide Oval, War Memorial Drive, North Adelaide SA 5006',
      'Kings Park, Fraser Avenue, Perth WA 6005',
      'Brisbane City Hall, 64 Adelaide Street, Brisbane QLD 4000',
      'Melbourne Cricket Ground, Brunton Avenue, Richmond VIC 3002',
      'Old Parliament House, King George Terrace, Parkes ACT 2600',
      'Southern Cross Station, 99 Spencer Street, Melbourne VIC 3008',
      'Federation Square, Swanston Street, Melbourne VIC 3000',
    ],
  },
  {
    id: 'countries',
    title: 'Country names',
    story:
      "A user typed a country name with a typo or abbreviation. Which country in the standard list did they mean?",
    source:
      "The reference list is ISO 3166 — the internationally maintained list of country names. Every system that stores countries should normalise against this.",
    noise: 'typos, abbreviations, alternate spellings',
    defaultInput: 'untied kingdum',
    topN: 1,
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
