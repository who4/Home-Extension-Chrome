// Fuzzy subsequence matcher with scoring.
// Returns null when query chars don't appear in order inside target.

export interface FuzzyResult {
  score: number;
  indices: number[]; // matched character positions in target
}

const SCORE_MATCH = 16;
const SCORE_CONSECUTIVE = 8; // per consecutive pair after the first char
const SCORE_WORD_BOUNDARY = 12; // match after separator or camelCase hump
const SCORE_START_OF_STRING = 10;
const PENALTY_GAP = -3; // per skipped char — must outweigh a boundary bonus over 2+ gaps
const PENALTY_LEADING = -2; // per unmatched leading char

function isWordBoundary(target: string, index: number): boolean {
  if (index === 0) return true;
  const prev = target[index - 1];
  if (/[\s\-_.:/#]/.test(prev)) return true;
  // camelCase hump: prev lower, current upper
  const cur = target[index];
  if (prev >= 'a' && prev <= 'z' && cur >= 'A' && cur <= 'Z') return true;
  return false;
}

function scoreAlignment(q: string, tLower: string, target: string, startIdx: number): FuzzyResult | null {
  // Greedy leftmost pass from startIdx, then a right-to-left tightening pass:
  // pull matched chars as close together as possible without breaking order.
  const n = q.length;
  const indices: number[] = [];
  let pos = startIdx;
  for (let i = 0; i < n; i++) {
    let found = -1;
    for (let j = pos; j < tLower.length; j++) {
      if (tLower[j] === q[i]) {
        found = j;
        break;
      }
    }
    if (found === -1) return null;
    indices.push(found);
    pos = found + 1;
  }

  // Tighten: walk from the end, moving each match as late as possible while
  // staying before the next match — this groups trailing matches together.
  // Skip tightening when it would break an already-consecutive run.
  for (let i = n - 1; i > 0; i--) {
    if (indices[i] === indices[i - 1] + 1) continue; // preserve consecutiveness
    const limit = indices[i] - 1;
    const candidate = tLower.lastIndexOf(q[i - 1], limit);
    if (candidate > (i > 1 ? indices[i - 2] : -1) && candidate !== indices[i]) {
      // only move earlier match forward (toward its successor) if it closes a gap
      if (indices[i] - candidate === 1) indices[i - 1] = candidate;
    }
  }

  let score = 0;
  let prevIdx = -1;
  for (let i = 0; i < n; i++) {
    const idx = indices[i];
    let charScore = SCORE_MATCH;
    if (i > 0 && idx === prevIdx + 1) charScore += SCORE_CONSECUTIVE;
    if (isWordBoundary(target, idx)) {
      charScore += idx === 0 ? SCORE_START_OF_STRING : SCORE_WORD_BOUNDARY;
    }
    const gap = idx - prevIdx - 1;
    if (gap > 0 && i > 0) charScore += gap * PENALTY_GAP;
    if (i === 0 && idx > 0) charScore += idx * PENALTY_LEADING;
    score += charScore;
    prevIdx = idx;
  }

  // Length ratio bonus: targets barely longer than the query rank much higher
  // than long ones. Scaled by query length so "mail" in Gmail (ratio 1.25)
  // beats "mail" at the head of a 25-char archive name.
  const ratio = q.length / target.length;
  score += Math.round(ratio * 40);
  return { score, indices };
}

export function fuzzyMatch(query: string, target: string): FuzzyResult | null {
  const q = query.toLowerCase();
  const tLower = target.toLowerCase();

  // Fast reject: all chars must appear as a subsequence
  let qi = 0;
  for (let ti = 0; ti < tLower.length && qi < q.length; ti++) {
    if (tLower[ti] === q[qi]) qi++;
  }
  if (qi < q.length) return null;

  // Evaluate alignments anchored at every occurrence of the first char,
  // keep the best. First occurrences dominate in practice so early-exit
  // once we've seen several.
  let best: FuzzyResult | null = null;
  for (let anchor = tLower.indexOf(q[0]); anchor !== -1; anchor = tLower.indexOf(q[0], anchor + 1)) {
    const r = scoreAlignment(q, tLower, target, anchor);
    if (r && (!best || r.score > best.score)) best = r;
    if (best && best.indices[0] === anchor) break; // first-char anchors after the best prefix can't win
  }

  return best;
}
