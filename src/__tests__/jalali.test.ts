import { describe, it, expect } from 'vitest';
import { toJalali, toGregorian, formatJalaliDate } from '../jalali';

describe('toJalali', () => {
  // Anchors verified against TGJU API responses (gregorianDate ↔ jalaliDate pairs)
  const anchors: Array<[number, number, number, number, number, number]> = [
    [2026, 8, 25, 1405, 6, 3], // from live TGJU response
    [2026, 8, 24, 1405, 6, 2],
    [2026, 3, 21, 1405, 1, 1], // Nowruz 1405
    [2025, 3, 21, 1404, 1, 1], // Nowruz 1404
    [2024, 12, 31, 1403, 10, 11],
    [2000, 1, 1, 1378, 10, 11]
  ];

  for (const [gy, gm, gd, jy, jm, jd] of anchors) {
    it(`converts ${gy}-${gm}-${gd} → ${jy}/${jm}/${jd}`, () => {
      expect(toJalali(gy, gm, gd)).toEqual({ jy, jm, jd });
    });
  }
});

describe('roundtrip property', () => {
  it('g→j→g is identity across a century of dates', () => {
    let mismatches = 0;
    let tested = 0;
    for (let gy = 1900; gy <= 2100; gy += 1) {
      for (let gm = 1; gm <= 12; gm += 3) {
        for (let gd of [1, 15, 28]) {
          const j = toJalali(gy, gm, gd);
          const g = toGregorian(j.jy, j.jm, j.jd);
          tested += 1;
          if (g.gy !== gy || g.gm !== gm || g.gd !== gd) mismatches += 1;
        }
      }
      if (tested > 1200) break;
    }
    expect(mismatches).toBe(0);
  });

  it('j→g→j is identity across Jalali year range', () => {
    let mismatches = 0;
    for (let jy = 1350; jy <= 1450; jy += 7) {
      for (let jm = 1; jm <= 12; jm += 5) {
        const g = toGregorian(jy, jm, 15);
        const j = toJalali(g.gy, g.gm, g.gd);
        if (j.jy !== jy || j.jm !== jm || j.jd !== 15) mismatches += 1;
      }
    }
    expect(mismatches).toBe(0);
  });
});

describe('formatJalaliDate', () => {
  it('formats with Latin digits and English month name', () => {
    const d = new Date(2026, 7, 25); // Aug 25 2026 = 3 Shahrivar 1405
    expect(formatJalaliDate(d)).toBe('3 Shahrivar 1405');
  });

  it('includes weekday when names provided', () => {
    const d = new Date(2026, 7, 25); // Tuesday
    const s = formatJalaliDate(d, ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']);
    expect(s).toBe('Tue 3 Shahrivar 1405');
  });
});
