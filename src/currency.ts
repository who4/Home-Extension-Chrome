// Currency conversion query parser.
// Patterns: "100 usd", "50$ to toman", "usd 250", "2 gold", "100 usd in g"
// Uses prices already cached by ApiClient (Rial-scale strings).

export interface CurrencyRates {
  /** price per unit in Toman */
  usdToman: number | null;
  goldToman: number | null;
}

type AssetKey = 'usd' | 'gold';

const ALIASES: Record<string, AssetKey> = {
  usd: 'usd',
  dollar: 'usd',
  dollars: 'usd',
  $: 'usd',
  gold: 'gold',
  geram: 'gold',
  gram18: 'gold',
  طلا: 'gold',
  دلار: 'usd'
};

// Words that mean "the target is Toman" — the only target currency for now
const TOMAN_WORDS = new Set(['toman', 'tomans', 't', 'تومان', 'irt']);

export interface ConversionQuery {
  asset: AssetKey;
  amount: number;
}

/**
 * Detect a conversion request like "100 usd", "50$ in toman", "gold 2".
 * Returns null when the input isn't a conversion query.
 */
export function parseConversionQuery(input: string): ConversionQuery | null {
  const s = input.trim().toLowerCase();
  if (!s || s.length > 40) return null;

  // Split on "to"/"in" when present, keep the side that has the asset
  let working = s;
  const splitMatch = s.match(/\b(?:to|in|=|به)\b/);
  if (splitMatch) {
    const [left, right] = s.split(splitMatch[0]);
    const rightHasToman = right
      .trim()
      .split(/\s+/)
      .some((w) => TOMAN_WORDS.has(w));
    if (rightHasToman) {
      working = left.trim();
    } else if (left.trim().split(/\s+/).every((w) => !isNumberWord(w))) {
      return null; // "usd to x" — converting away from toman: unsupported
    }
  }

  // Tokenize: numbers (with , or . separators) and words
  const tokens = working.split(/[\s,]+/).filter(Boolean);
  if (tokens.length === 0 || tokens.length > 3) return null;

  let amount: number | null = null;
  let asset: AssetKey | null = null;

  const hasDollarSign = /\$/.test(working);

  for (let i = 0; i < tokens.length; i++) {
    const raw = tokens[i];

    // "$" glued to a number takes priority: "$100", "50$", "$50.5"
    if (/^\$?[\d.]+\$?$/.test(raw) && raw.includes('$')) {
      const v = parseFloat(raw.replace(/\$/g, ''));
      if (Number.isFinite(v) && amount === null) {
        amount = v;
        asset = 'usd';
        continue;
      }
    }

    const n = parseAmount(raw);
    if (n !== null && amount === null) {
      amount = n;
      // "100$" or bare number in a $-containing query implies usd
      if (raw.includes('$')) asset = 'usd';
      continue;
    }

    let word = raw.replace(/\.$/, '');
    if (!asset && word in ALIASES) {
      asset = ALIASES[word];
      continue;
    }

    void word;
  }

  // "$100" / "50$" — only the dollar sign marks the currency
  if (amount !== null && asset === null && hasDollarSign) asset = 'usd';

  if (amount === null || asset === null) return null;
  if (!Number.isFinite(amount) || amount <= 0) return null;
  return { asset, amount };
}

function parseAmount(token: string): number | null {
  const cleaned = token.replace(/\$|تومان/g, '');
  if (!/^[\d.]+$/.test(cleaned)) return null;
  const n = parseFloat(cleaned);
  return Number.isFinite(n) ? n : null;
}

function isNumberWord(w: string): boolean {
  return parseAmount(w) !== null;
}

/** Convert a parsed query to a Toman value. Returns null without rates. */
export function convertToToman(q: ConversionQuery, rates: CurrencyRates): number | null {
  const rate = q.asset === 'usd' ? rates.usdToman : rates.goldToman;
  if (rate === null || !Number.isFinite(rate)) return null;
  return q.amount * rate;
}
