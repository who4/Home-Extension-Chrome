import { describe, it, expect } from 'vitest';
import { fuzzyMatch } from '../fuzzy';

describe('fuzzyMatch', () => {
  it('matches exact substring', () => {
    expect(fuzzyMatch('you', 'YouTube')).not.toBeNull();
  });

  it('rejects non-subsequence', () => {
    expect(fuzzyMatch('xy', 'GitHub')).toBeNull();
    expect(fuzzyMatch('zzz', 'gmail')).toBeNull();
  });

  it('is case-insensitive', () => {
    expect(fuzzyMatch('YT', 'YouTube')).not.toBeNull();
  });

  it('scores prefix match higher than scattered', () => {
    const prefix = fuzzyMatch('git', 'GitHub')!;
    const scattered = fuzzyMatch('git', 'XxGxxIxxT')!;
    expect(prefix.score).toBeGreaterThan(scattered.score);
  });

  it('scores consecutive over gappy', () => {
    const consecutive = fuzzyMatch('fac', 'Facebook')!;
    // Same letters, no word boundaries, just gaps
    const gappy = fuzzyMatch('fac', 'Fzazc')!;
    expect(consecutive.score).toBeGreaterThan(gappy.score);
  });

  it('prefers shorter targets', () => {
    const short = fuzzyMatch('mail', 'Gmail')!;
    const long = fuzzyMatch('mail', 'mailing-list-archive-2026')!;
    expect(short.score).toBeGreaterThan(long.score);
  });

  it('returns matched indices in order', () => {
    const r = fuzzyMatch('yb', 'YouTube')!;
    // y at 0, b at 5 (lowercase: y-o-u-t-u-b-e)
    expect(r.indices).toEqual([0, 5]);
  });
});
