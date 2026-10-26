/**
 * Scam-script detection from a live/entered transcript.
 *
 * Fraud calls follow patterns. Detecting the *script* is often more reliable
 * than detecting a cloned voice — and it also catches the very common case
 * where no AI voice is used at all (a stranger simply claims to be a relative).
 */

export const CATEGORY_META = {
  secrecy: { label: 'Asking you to keep it secret', weight: 3 },
  money: { label: 'Asking for money or payment', weight: 3 },
  authority: { label: 'Pretending to be police / government', weight: 2.5 },
  isolation: { label: 'Trying to keep you on the call / alone', weight: 2.5 },
  identity: { label: 'Claiming to be a relative on a new number', weight: 2 },
  credential: { label: 'Asking for OTP / PIN / passwords', weight: 3 },
  urgency: { label: 'Creating panic or urgency', weight: 2 },
  emotional: { label: 'Using an emergency story', weight: 2 },
  paymentRail: { label: 'Unusual payment method (gift card / crypto)', weight: 2.5 },
};

const PHRASES = {
  secrecy: [
    'don\'t tell anyone',
    'do not tell anyone',
    'dont tell anyone',
    'don\'t tell your',
    'do not tell your',
    'keep this between us',
    'keep it secret',
    'don\'t call anyone',
    'do not call anyone',
    'don\'t inform',
    'kisi ko mat batao',
    'kisi ko na batao',
    'kisi ko mat batana',
    'kisi ko nahi batana',
  ],
  money: [
    'send money',
    'transfer the money',
    'transfer money',
    'wire transfer',
    'send the amount',
    'need money',
    'i need rs',
    'need rupees',
    'pay immediately',
    'make the payment',
    'upi',
    'google pay',
    'phonepe',
    'paytm',
    'bank transfer',
    'deposit the money',
    'paisa bhejo',
    'paise bhejo',
    'paisa transfer',
    'rupaye bhejo',
  ],
  authority: [
    'police',
    'cbi',
    'customs',
    'income tax',
    'enforcement directorate',
    'digital arrest',
    'court case',
    'case against you',
    'arrest warrant',
    'legal action',
    'you will be arrested',
    'fir has been',
    'cyber cell',
    'trai',
    'police station',
  ],
  isolation: [
    'stay on the line',
    'stay on the call',
    'don\'t hang up',
    'do not hang up',
    'don\'t disconnect',
    'do not disconnect',
    'keep the call connected',
    'go to a private place',
    'are you alone',
    'make sure no one is',
    'phone mat kaato',
    'call mat kaato',
    'line par raho',
  ],
  identity: [
    'it\'s me',
    'its me',
    'this is your son',
    'this is your daughter',
    'this is your',
    'i am your son',
    'i am your daughter',
    'new number',
    'changed my number',
    'this is my new number',
    'i lost my phone',
    'my phone broke',
    'naya number',
    'yeh mera naya number',
    'main tumhara beta',
    'main aapka beta',
  ],
  credential: [
    'otp',
    'one time password',
    'share the code',
    'tell me the code',
    'read me the code',
    'pin number',
    'cvv',
    'password',
    'aadhaar number',
    'account number',
    'ifsc',
    'card number',
    'cvv batao',
    'otp batao',
  ],
  urgency: [
    'urgent',
    'right now',
    'immediately',
    'within an hour',
    'within 10 minutes',
    'last chance',
    'before it is too late',
    'hurry',
    'jaldi',
    'turant',
    'abhi karo',
    'jaldi karo',
    'time nahi hai',
  ],
  emotional: [
    'accident',
    'hospital',
    'emergency',
    'injured',
    'surgery',
    'bail',
    'in jail',
    'arrested',
    'kidnapped',
    'in trouble',
    'accident ho gaya',
    'hospital mein',
    'pareshani',
  ],
  paymentRail: [
    'gift card',
    'google play card',
    'amazon card',
    'itunes card',
    'bitcoin',
    'crypto',
    'usdt',
    'western union',
    'moneygram',
    'hawala',
  ],
};

const ALL_PHRASES = Object.entries(PHRASES).flatMap(([category, list]) =>
  list.map((phrase) => ({ category, phrase }))
);

function normalise(text) {
  return ` ${String(text || '')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s']/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim()} `;
}

/** Pull a readable snippet around the matched phrase, for display. */
function quoteFor(text, phrase) {
  const source = String(text || '');
  const lower = source.toLowerCase();
  const needle = phrase.toLowerCase();
  let index = lower.indexOf(needle);
  let length = needle.length;
  if (index < 0) {
    const firstWord = needle.split(' ')[0];
    index = lower.indexOf(firstWord);
    length = firstWord.length;
    if (index < 0) return phrase;
  }
  const start = Math.max(0, index - 24);
  const end = Math.min(source.length, index + length + 34);
  let snippet = source.slice(start, end);
  for (const code of [10, 13, 9]) snippet = snippet.split(String.fromCharCode(code)).join(' ');
  while (snippet.includes('  ')) snippet = snippet.split('  ').join(' ');
  snippet = snippet.trim();
  if (start > 0) {
    const space = snippet.indexOf(' ');
    if (space > 0 && space < 14) snippet = snippet.slice(space + 1);
    snippet = `…${snippet}`;
  }
  if (end < source.length) {
    const space = snippet.lastIndexOf(' ');
    if (space > snippet.length - 14) snippet = snippet.slice(0, space);
    snippet = `${snippet}…`;
  }
  return snippet;
}

/**
 * Score a transcript for scam-script signals.
 * @returns {{score:number, matches:Array, categories:Array, combos:Array}}
 */
export function scoreTranscript(text) {
  const haystack = normalise(text);
  if (haystack.trim().length < 3) {
    return { score: 0, matches: [], categories: [], combos: [], empty: true };
  }

  const matches = [];
  const seen = new Set();

  for (const { category, phrase } of ALL_PHRASES) {
    if (haystack.includes(` ${phrase}`) || haystack.includes(`${phrase} `)) {
      const key = `${category}:${phrase}`;
      if (seen.has(key)) continue;
      seen.add(key);
      matches.push({ category, phrase, weight: CATEGORY_META[category].weight });
    }
  }

  const byCategory = new Map();
  for (const m of matches) {
    const existing = byCategory.get(m.category);
    if (!existing || m.weight > existing.weight) byCategory.set(m.category, m);
  }

  const categories = [...byCategory.entries()].map(([category, m]) => ({
    category,
    label: CATEGORY_META[category].label,
    weight: m.weight,
    phrase: m.phrase,
    quote: quoteFor(text, m.phrase),
  }));

  const raw = categories.reduce((sum, c) => sum + c.weight * 11, 0);

  // combinations that are much stronger than any single phrase
  const combos = [];
  const has = (c) => byCategory.has(c);
  let comboBoost = 0;

  if (has('secrecy') && has('money')) {
    combos.push('Asks for money AND asks you to keep it secret');
    comboBoost += 18;
  }
  if (has('authority') && has('money')) {
    combos.push('Claims authority (police/government) and asks for money');
    comboBoost += 16;
  }
  if (has('isolation') && has('money')) {
    combos.push('Keeps you on the line while asking for money');
    comboBoost += 14;
  }
  if (has('credential') && (has('authority') || has('urgency'))) {
    combos.push('Urgent request for OTP / PIN / password');
    comboBoost += 16;
  }
  if (has('identity') && has('secrecy')) {
    combos.push('Claims to be family but wants secrecy');
    comboBoost += 12;
  }
  if (has('emotional') && has('money')) {
    combos.push('Emergency story followed by a money request');
    comboBoost += 12;
  }

  const score = Math.min(100, Math.round(raw + comboBoost));

  return {
    score,
    matches: matches.slice(0, 12),
    categories,
    combos,
    empty: false,
    matchedCount: matches.length,
  };
}

/** Example transcripts for the demo / test lab. */
export const EXAMPLE_SCRIPTS = [
  {
    id: 'relative-money',
    title: '“Beta, I had an accident” — fake relative',
    text:
      'Hello beta, it\'s me, I am your uncle. I had an accident and I am in the hospital. ' +
      'I lost my phone, this is my new number. Please send money urgently to this account, ' +
      'I need rupees fifty thousand right now. Do not tell your mother, she will panic. ' +
      'Stay on the line and do the UPI transfer immediately.',
  },
  {
    id: 'digital-arrest',
    title: '“Digital arrest” — fake police',
    text:
      'This is CBI cyber cell. A case has been registered against you for illegal parcels. ' +
      'You are under digital arrest. Do not disconnect the call and do not tell anyone, ' +
      'not even your family. To clear your name you must transfer the amount to the ' +
      'government verification account. Share the OTP you receive immediately.',
  },
  {
    id: 'normal',
    title: 'Normal family call (control)',
    text:
      'Hi dad, I reached the office. I will come home around seven and we can have dinner together. ' +
      'Do you need anything from the market on the way back?',
  },
];
