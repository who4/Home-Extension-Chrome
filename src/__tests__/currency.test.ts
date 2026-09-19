import { describe, it, expect } from 'vitest';
import { parseConversionQuery, convertToToman } from '../currency';

describe('parseConversionQuery', () => {
  it.each([
    ['100 usd', { asset: 'usd', amount: 100 }],
    ['100 dollars', { asset: 'usd', amount: 100 }],
    ['$100', { asset: 'usd', amount: 100 }],
    ['50$ to toman', { asset: 'usd', amount: 50 }],
    ['2.5 usd', { asset: 'usd', amount: 2.5 }],
    ['usd 250', { asset: 'usd', amount: 250 }],
    ['2 gold', { asset: 'gold', amount: 2 }],
    ['3 gram18 in toman', { asset: 'gold', amount: 3 }],
    ['10 دلار', { asset: 'usd', amount: 10 }],
    ['1 طلا', { asset: 'gold', amount: 1 }]
  ])('parses "%s"', (input, expected) => {
    expect(parseConversionQuery(input)).toEqual(expected);
  });

  it.each([
    ['hello'],
    ['how are you'],
    ['usd'], // no amount
    ['100'], // no asset
    ['100 eur'], // unsupported currency
    ['usd to eur'] // away from toman
  ])('rejects "%s"', (input) => {
    expect(parseConversionQuery(input)).toBeNull();
  });
});

describe('convertToToman', () => {
  const rates = { usdToman: 200_500, goldToman: 21_653_100 };

  it('multiplies by the asset rate', () => {
    expect(convertToToman({ asset: 'usd', amount: 100 }, rates)).toBe(20_050_000);
    expect(convertToToman({ asset: 'gold', amount: 2 }, rates)).toBe(43_306_200);
  });

  it('returns null without a rate', () => {
    expect(convertToToman({ asset: 'usd', amount: 1 }, { usdToman: null, goldToman: null })).toBeNull();
  });
});
