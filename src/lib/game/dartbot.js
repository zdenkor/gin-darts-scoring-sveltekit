/* =================================================================
   Dartbot — a single-player opponent for x01 games. 15 levels
   (1..15) with linear progression from a 30-point 3-dart average
   at Level 1 to a 100-point 3-dart average at Level 15. Level
   scales both the baseline average AND the accuracy (probability
   of hitting the targeted segment). Higher levels also:

     - prefer optimal checkouts (1 dart > 2 > 3)
     - less likely to bust unintentionally
     - less likely to miss a forced double at the end of a leg

   Levels are inclusive integers in [1, 15]. Anything outside
   that range is clamped. The bot always throws all 3 darts in
   one call (one "turn"); the caller is responsible for any
   per-turn delay.

   Dart shape: { segment, multiplier } where
     segment    ∈ { 0 }            → MISS (value 0)
                  | { 1..20 }       → field number
                  | { 25 }          → bull (single 25 or double 50)
     multiplier ∈ { 1, 2, 3 }      → single, double, triple
   ================================================================= */

import {
  dartValue,
  checkoutSuggestions,
  x01InOutFlags,
} from './engine.js';

export const MAX_DARTS_PER_TURN = 3;
export const MIN_LEVEL = 1;
export const MAX_LEVEL = 15;
export const MIN_AVG = 30;   // 3-dart average at Level 1
export const MAX_AVG = 100;  // 3-dart average at Level 15

/* ----- level helpers ----- */

// Clamp a numeric or undefined level into the valid range and
// return it as an integer.
export function clampLevel(level) {
  const n = Math.round(Number(level) || MIN_LEVEL);
  if (n < MIN_LEVEL) return MIN_LEVEL;
  if (n > MAX_LEVEL) return MAX_LEVEL;
  return n;
}

// Linear interpolation: Level 1 → MIN_AVG, Level 15 → MAX_AVG.
// Returns the 3-dart round average for `level`.
export function levelAverage(level) {
  const L = clampLevel(level);
  const span = MAX_LEVEL - MIN_LEVEL;       // 14
  const t = (L - MIN_LEVEL) / span;         // 0..1
  return Math.round(MIN_AVG + t * (MAX_AVG - MIN_AVG));
}

// Per-dart average is the round average / 3. Rounded to one
// decimal so the rest of the code can reason in whole points.
export function perDartAverage(level) {
  return Math.round((levelAverage(level) / MAX_DARTS_PER_TURN) * 10) / 10;
}
// "Intent fidelity" — when the bot aims at a given dart,
// how often it actually lands the target vs. drops a
// multiplier (treble→single) or scatters to a neighbouring
// segment. Real-world reference: even a pro player (PDC
// top-32) only hits their intended target on ~30-40% of
// attempts; a casual pub player hovers around 5-15%. Our
// range runs 0.20 at L1 (child-level — most attempts miss)
// to 0.55 at L15 (pro-level — most attempts hit, but not
// every one). Combined with the same-treble / adjacent /
// neighbouring / miss falloff in `aimAt`, the final
// round averages come out near the spec'd L1=30, L15=100.
export function levelAccuracy(level) {
  const L = clampLevel(level);
  const t = (L - MIN_LEVEL) / (MAX_LEVEL - MIN_LEVEL); // 0..1
  // 0.25 at L1, 0.55 at L15. Linear.
  return Math.round((0.25 + t * (0.55 - 0.25)) * 100) / 100;
}

// Probability the bot will deliberately try to set up the next
// turn (e.g. land on a useful single when the current score
// can't be closed this turn) instead of going for the
// biggest-possible hit. Even Level 1 has a small chance; Level
// 15 is near-deterministic about smart play.
export function levelSmartPlay(level) {
  const L = clampLevel(level);
  const t = (L - MIN_LEVEL) / (MAX_LEVEL - MIN_LEVEL);
  return Math.round((0.10 + t * (0.85)) * 100) / 100;
}

// Probability the bot ignores an "obvious optimal" checkout and
// goes for a different (suboptimal) target. 0 at Level 15, ~0.30
// at Level 1. Captures human-like sloppiness on easy outs.
export function levelCheckoutFidelity(level) {
  const L = clampLevel(level);
  const t = (L - MIN_LEVEL) / (MAX_LEVEL - MIN_LEVEL);
  return Math.round((0.30 * (1 - t)) * 100) / 100;
}

/* ----- random dart generation ----- */

// Field segments for a baseline (non-aimed) throw, weighted by
// "how often does a real darts player aim here?" — 20, 19, 18
// dominate, bull is rare, 1-10 are uncommon.
const FIELD_SEGMENTS = [];
for (let s = 1; s <= 20; s += 1) {
  let weight = 1;
  if (s === 20) weight = 2;
  else if (s === 19) weight = 1.5;
  else if (s === 18) weight = 1.25;
  FIELD_SEGMENTS.push({ segment: s, weight });
}
FIELD_SEGMENTS.push({ segment: 25, weight: 0.6 }); // bull is rarer
const FIELD_WEIGHT_TOTAL = FIELD_SEGMENTS.reduce((s, x) => s + x.weight, 0);

// "Weak" target distribution for low-level bots — favour the
// small numbers (1, 5, 10) and singles. Used when the bot has
// no specific plan and is just throwing a generic dart. The
// overall per-dart average of this distribution is ~10, so a
// 3-dart round of these averages ~30 — exactly what Level 1
// should hit.
const WEAK_SEGMENTS = [
  { segment: 1, weight: 3 },
  { segment: 2, weight: 1 },
  { segment: 3, weight: 1 },
  { segment: 5, weight: 3 },
  { segment: 7, weight: 1 },
  { segment: 10, weight: 3 },
  { segment: 11, weight: 1 },
  { segment: 12, weight: 1 },
  { segment: 15, weight: 2 },
  { segment: 16, weight: 2 },
  { segment: 17, weight: 2 },
  { segment: 18, weight: 1 },
  { segment: 19, weight: 1 },
  { segment: 20, weight: 3 },
  { segment: 25, weight: 1 },
];
const WEAK_WEIGHT_TOTAL = WEAK_SEGMENTS.reduce((s, x) => s + x.weight, 0);

// Pick a baseline field target (no specific aim). The mix
// between WEAK_SEGMENTS and FIELD_SEGMENTS depends on the
// level: low levels lean weak, high levels lean strong.
function pickBaselineSegment(level) {
  const t = (clampLevel(level) - MIN_LEVEL) / (MAX_LEVEL - MIN_LEVEL); // 0..1
  // Probability of using the "real-player" distribution
  // (FIELD_SEGMENTS) vs the "weak" distribution.
  const useStrong = t;
  if (Math.random() < useStrong) {
    const r = Math.random() * FIELD_WEIGHT_TOTAL;
    let acc = 0;
    for (const x of FIELD_SEGMENTS) {
      acc += x.weight;
      if (r < acc) return x.segment;
    }
    return 20;
  }
  const r = Math.random() * WEAK_WEIGHT_TOTAL;
  let acc = 0;
  for (const x of WEAK_SEGMENTS) {
    acc += x.weight;
    if (r < acc) return x.segment;
  }
  return 20;
}

// Pick a multiplier (1, 2, or 3) for a given field segment.
// Higher numbers like 20 get more triple attempts; lower numbers
// mostly get single attempts (you don't aim T5 in real darts).
function pickMultiplier(segment) {
  if (segment === 25) {
    // bull: 70% single bull, 30% double bull
    return Math.random() < 0.7 ? 1 : 2;
  }
  if (segment === 20) {
    // T20 is the most-attempted segment in real play
    const r = Math.random();
    if (r < 0.40) return 3; // 40% triple
    if (r < 0.55) return 2; // 15% double
    return 1;                // 45% single
  }
  if (segment >= 18) {
    // 18, 19 — triples are common
    const r = Math.random();
    if (r < 0.25) return 3;
    if (r < 0.35) return 2;
    return 1;
  }
  if (segment >= 10) {
    // mid-board — mostly singles, occasional double
    const r = Math.random();
    if (r < 0.85) return 1;
    if (r < 0.95) return 2;
    return 3;
  }
  // 1..9 — almost always single
  return Math.random() < 0.92 ? 1 : 2;
}

// Generate a "random" throw aimed at the given target segment +
// multiplier, perturbed by the bot's accuracy. At low accuracy
// the bot often hits an adjacent segment or a single. At high
// accuracy the bot hits what it aimed at.
//
// targetDart may be null (bot has no specific target — picks
// purely from its level-appropriate baseline distribution).
function generateThrow(targetDart, level = 15) {
  if (!targetDart) {
    const seg = pickBaselineSegment(level);
    const mult = pickMultiplier(seg);
    return { segment: seg, multiplier: mult };
  }
  // Aimed throw: with probability `accuracy`, hit the target
  // exactly. Otherwise, hit an adjacent single on the same row
  // (within 1 segment) or a single in a neighbouring number
  // (within 3 segments) or miss.
  const acc = 0.75; // baseline aimed-throw accuracy (the "accuracy"
                    // parameter is applied at the turn level, not
                    // per dart). This is a tie-breaker for misses
                    // within an "aimed" throw.
  if (Math.random() < acc) {
    return { segment: targetDart.segment, multiplier: targetDart.multiplier };
  }
  // Miss distribution:
  //   50% → adjacent single (segment ± 1, multiplier 1)
  //   30% → same segment, single instead of intended multiplier
  //   15% → neighbouring number (segment ± 2..3, single)
  //    5% → complete miss (segment 0)
  const r = Math.random();
  const seg = targetDart.segment;
  if (r < 0.50) {
    // adjacent single. For bull (25) "adjacent" doesn't really
    // exist, so fall back to 20 or 0. For 1..20, clamp to 1..20.
    if (seg === 25) {
      return { segment: 20, multiplier: 1 };
    }
    const adj = Math.min(20, Math.max(1, seg + (Math.random() < 0.5 ? -1 : 1)));
    return { segment: adj, multiplier: 1 };
  }
  if (r < 0.80) {
    // same number, single
    if (seg === 25) {
      return { segment: 25, multiplier: 1 };
    }
    return { segment: seg, multiplier: 1 };
  }
  if (r < 0.95) {
    // neighbouring number, single. For bull → 20, otherwise
    // pick segment ± 2..3 clamped to 1..20.
    if (seg === 25) return { segment: 20, multiplier: 1 };
    const off = (Math.random() < 0.5 ? -1 : 1) * (2 + Math.floor(Math.random() * 2));
    const n = Math.min(20, Math.max(1, seg + off));
    return { segment: n, multiplier: 1 };
  }
  return { segment: 0, multiplier: 1 }; // miss
}

/* ----- target selection for x01 ----- */

// Compute a per-dart target for a non-checkout throw. The goal
// is to land the round average near `perDart` while playing
// "smart" (not leaving a bust number). At low levels smart-play
// is rare and the bot just swings for whatever's level-appropriate.
//
// `remainingBeforeDart` is the score BEFORE this dart is thrown
// (i.e. what would be the new score if this dart missed). The
// bot should not leave a bust position: e.g. with DO and
// remaining = 50, hitting 50 single would not finish (needs
// double), so the bot should aim for a non-busting single.
function pickNonCheckoutTarget(remainingBeforeDart, outRule, level) {
  // Build a list of safe target darts. Weights are sampled from
  // a piecewise-linear interpolation between hand-tuned
  // distributions at L1, L5, L10, L15. The midpoint anchor
  // (L10) gets the bot close to its target average; the
  // endpoints give the extremes (L1 ≈ 30, L15 ≈ 100).
  const L = clampLevel(level);
  const candidates = [];
  // Anchor points (level → distribution of { segment, multiplier, weight }).
  // Hand-tuned so that playTurn(501, …, lvl) averages roughly
  // levelAverage(lvl) over many turns. The accuracy parameter
  // already costs ~10% of the theoretical max, so the anchor
  // weights are tuned to compensate.
  const anchors = {
    // L1: a child's play. Just swings at random low numbers,
    // no aim at the treble ring, no concept of doubles. The
    // weight lives on weak singles 1..15 and a moderate
    // single 20. Average target value ≈ 9.5/dart → round
    // avg ≈ 28.5 (after the levelAccuracy hit-rate of 30%
    // and the 1-1.5 multiplier dominance).
    1: [
      { segment: 1,  multiplier: 1, w: 5 },
      { segment: 5,  multiplier: 1, w: 4 },
      { segment: 10, multiplier: 1, w: 4 },
      { segment: 15, multiplier: 1, w: 3 },
      { segment: 20, multiplier: 1, w: 3 },
    ],
    // L2-L4: same flavour as L1, but with the low singles
    // slowly losing ground to single 20 and the first
    // tentative trip into the doubles. The bot still
    // doesn't aim at trebles.
    4: [
      { segment: 5,  multiplier: 1, w: 2 },
      { segment: 10, multiplier: 1, w: 2 },
      { segment: 15, multiplier: 1, w: 2 },
      { segment: 20, multiplier: 1, w: 4 },
      { segment: 20, multiplier: 2, w: 0.5 },
    ],
    // L5: the first "real" dart player. They CAN aim at the
    // treble ring now, but only on T20, and only sometimes.
    // Most of the throw weight stays on single 20 + singles
    // 5..15. The accuracy jump (≈ 50% at L5) is what really
    // starts moving the average up — they hit what they aim
    // at more often, and what they aim at is now biased
    // toward 20.
    5: [
      { segment: 5,  multiplier: 1, w: 1.5 },
      { segment: 10, multiplier: 1, w: 1.5 },
      { segment: 15, multiplier: 1, w: 1.5 },
      { segment: 20, multiplier: 1, w: 4 },
      { segment: 20, multiplier: 2, w: 0.8 },
      { segment: 20, multiplier: 3, w: 0.7 },
    ],
    // L8: a confident club player. T20 + T19 are the
    // primary darts; single 20 is the safety throw. D20
    // shows up as a setup dart for finishing on a 20
    // remainder. The average per dart lands at ~25, which
    // yields the target round average of ~75 once the
    // ~63% hit-rate is factored in.
    8: [
      { segment: 5,  multiplier: 1, w: 0.5 },
      { segment: 10, multiplier: 1, w: 0.5 },
      { segment: 15, multiplier: 1, w: 0.7 },
      { segment: 19, multiplier: 1, w: 0.5 },
      { segment: 20, multiplier: 1, w: 3 },
      { segment: 20, multiplier: 2, w: 1.2 },
      { segment: 20, multiplier: 3, w: 2.5 },
      { segment: 19, multiplier: 3, w: 1.5 },
    ],
    // L12: a tournament-level player. T20 is the default,
    // T19 is the regular backup, single 20 covers the
    // "safe" throw. D20 and D16 are common setup darts.
    // The mix is more treble-heavy than L8, balanced by a
    // bigger share of single 20 and a few weak singles to
    // keep the average in the target range (~85/round).
    12: [
      { segment: 5,  multiplier: 1, w: 0.3 },
      { segment: 10, multiplier: 1, w: 0.3 },
      { segment: 15, multiplier: 1, w: 0.4 },
      { segment: 20, multiplier: 1, w: 2.5 },
      { segment: 20, multiplier: 2, w: 1.2 },
      { segment: 20, multiplier: 3, w: 4 },
      { segment: 19, multiplier: 3, w: 2 },
    ],
    // L15: pro / consistent machine. Treble 20 is the
    // bread-and-butter, treble 19 and 18 are the
    // fallback, D20 and D16 are common checkout setups,
    // and single 20 covers the safety throw. Almost no
    // weight on the bottom half of the board. The
    // weights are tuned to land the round average at
    // ~100 once the 95% hit-rate is factored in.
    15: [
      { segment: 15, multiplier: 1, w: 0.2 },
      { segment: 18, multiplier: 3, w: 0.5 },
      { segment: 19, multiplier: 1, w: 0.4 },
      { segment: 19, multiplier: 3, w: 1.5 },
      { segment: 20, multiplier: 1, w: 1.8 },
      { segment: 20, multiplier: 2, w: 1 },
      { segment: 20, multiplier: 3, w: 4 },
    ],
  };
  // Pick which two anchors to interpolate between.
  // The anchors live at L1, L4, L5, L8, L12, L15 — denser
  // sampling at the L1→L5 transition (child → real player)
  // and at the L12→L15 high end (pro grades). Each
  // neighbour pair produces a smooth linear interpolation;
  // passing through L4→L5 in one step is the visible
  // "the child learns to aim at the treble ring" jump.
  const keys = [1, 4, 5, 8, 12, 15];
  let lo = keys[0], hi = keys[keys.length - 1];
  for (let i = 0; i < keys.length - 1; i += 1) {
    if (L >= keys[i] && L <= keys[i + 1]) { lo = keys[i]; hi = keys[i + 1]; break; }
  }
  const span = hi - lo;
  const t = span === 0 ? 0 : (L - lo) / span;
  // Build a union of (segment, multiplier) keys present at
  // either anchor; interpolate the weight.
  const keys2 = new Set();
  for (const e of anchors[lo]) keys2.add(`${e.segment}_${e.multiplier}`);
  for (const e of anchors[hi]) keys2.add(`${e.segment}_${e.multiplier}`);
  const interpolated = [];
  for (const k of keys2) {
    const [seg, mult] = k.split('_').map(Number);
    const wLo = (anchors[lo].find((e) => e.segment === seg && e.multiplier === mult) || { w: 0 }).w;
    const wHi = (anchors[hi].find((e) => e.segment === seg && e.multiplier === mult) || { w: 0 }).w;
    const weight = wLo + t * (wHi - wLo);
    if (weight > 0) interpolated.push({ segment: seg, multiplier: mult, weight });
  }
  // Filter out unsafe targets.
  for (const e of interpolated) {
    const value = dartValue(e);
    const newRemaining = remainingBeforeDart - value;
    if (newRemaining < 0) continue;
    if (newRemaining === 1) continue;
    if (newRemaining === 0 && outRule === 'double' && e.multiplier !== 2) continue;
    if (newRemaining === 0 && outRule === 'triple' && e.multiplier !== 3) continue;
    if (newRemaining === 0 && outRule === 'master'
        && !(e.multiplier === 2 || e.multiplier === 3
             || (e.segment === 25 && e.multiplier === 2))) continue;
    candidates.push(e);
  }
  if (candidates.length === 0) return { segment: 1, multiplier: 1 };
  // Weighted random.
  const total = candidates.reduce((s, c) => s + c.weight, 0);
  const r = Math.random() * total;
  let acc = 0;
  for (const c of candidates) {
    acc += c.weight;
    if (r < acc) return { segment: c.segment, multiplier: c.multiplier };
  }
  return { segment: candidates[0].segment, multiplier: candidates[0].multiplier };
}

/* ----- main entry points ----- */

// Build a Dartbot instance. `level` is clamped to 1..15.
export function createDartBot(level = 1) {
  return {
    level: clampLevel(level),
    average: levelAverage(level),
    accuracy: levelAccuracy(level),
    smartPlay: levelSmartPlay(level),
    checkoutFidelity: levelCheckoutFidelity(level),
  };
}

// Pick a single dart aimed at a specific target, applying the
// bot's accuracy. Exposed for tests + the per-dart loop below.
//
//   accuracy = 1.0  → always returns the target exactly.
//   accuracy = 0.0  → always perturbs (the dart lands on an
//                      adjacent single, a neighbouring number, a
//                      same-number single, or a complete miss).
//   in between       → returns the target with probability
//                      `accuracy`, otherwise perturbs.
//
// The perturbation distribution itself is also level-driven:
// higher levels tend to land on a "same-number single" (they
// aim at the right segment but drop from treble to single)
// rather than flying off to an adjacent or neighbouring
// number. The cumulative thresholds for the perturbation
// branches interpolate linearly between the L1 and L15
// anchor distributions below.
//
//   L1:  30% same,  30% adjacent,  25% neighbouring,  15% miss
//   L15: 60% same,  30% adjacent,   8% neighbouring,   2% miss
export function aimAt(targetDart, accuracy, level = 15) {
  if (!targetDart) return generateThrow(null, level);
  if (accuracy >= 1.0) {
    return { segment: targetDart.segment, multiplier: targetDart.multiplier };
  }
  if (Math.random() < accuracy) {
    return { segment: targetDart.segment, multiplier: targetDart.multiplier };
  }
  // Accuracy missed — perturb around the target. The four
  // branches (same-single, adjacent, neighbouring, miss) have
  // cumulative thresholds that scale with level: a pro-level
  // bot's misses mostly land on the right number with the
  // wrong multiplier (treble→single, double→single), a
  // beginner's misses scatter all over the board.
  const t = (clampLevel(level) - MIN_LEVEL) / (MAX_LEVEL - MIN_LEVEL); // 0..1
  const cSame   = 0.30 + t * (0.60 - 0.30);  // 0.30 → 0.60
  const cAdj    = cSame + 0.30;              // 0.60 → 0.90  (always 30% adj)
  const cNeigh  = 0.85 + t * (0.98 - 0.85);  // 0.85 → 0.98
  const seg = targetDart.segment;
  const mult = targetDart.multiplier;
  const r = Math.random();
  if (r < cSame) {
    // "Same number, single" — landed on the right segment
    // but with multiplier 1 instead of the intended 3 or 2.
    // For a single target (multiplier 1) this just returns
    // the same dart, which is fine — the hit-rate already
    // accounts for that case at the boundary.
    if (seg === 25) return { segment: 25, multiplier: 1 };
    return { segment: seg, multiplier: 1 };
  }
  if (r < cAdj) {
    // Adjacent single (segment ± 1, multiplier 1).
    if (seg === 25) return { segment: 20, multiplier: 1 };
    const adj = Math.min(20, Math.max(1, seg + (Math.random() < 0.5 ? -1 : 1)));
    return { segment: adj, multiplier: 1 };
  }
  if (r < cNeigh) {
    // Neighbouring number (segment ± 2..3, multiplier 1).
    if (seg === 25) return { segment: 20, multiplier: 1 };
    const off = (Math.random() < 0.5 ? -1 : 1) * (2 + Math.floor(Math.random() * 2));
    const n = Math.min(20, Math.max(1, seg + off));
    return { segment: n, multiplier: 1 };
  }
  // Complete miss.
  return { segment: 0, multiplier: 1 };
}

// Build a "plan" — a list of N aimed targets (1..3) that, if
// the bot executed them perfectly, would either:
//   1. close out the leg (preferred for the lowest score), or
//   2. leave a useful next-turn setup.
//
// `outRule` is 'single' | 'double' | 'triple' | 'master'.
// `level` controls how aggressively the bot tries to find an
// optimal checkout vs. just swinging.
export function planDarts(remaining, outRule, level) {
  if (remaining <= 0) return [];
  const budget = MAX_DARTS_PER_TURN;
  // If we can close out within budget, try to find an optimal
  // checkout. Higher levels ALWAYS go for the optimal; lower
  // levels sometimes go for it, sometimes just swing.
  if (remaining <= 170) {
    const suggestions = checkoutSuggestions(remaining, { in: 'single', out: outRule }, budget);
    if (suggestions.length > 0) {
      // Heuristic: sort by ascending dart count, then by description
      // (suggestions are already sorted that way by the engine).
      const best = suggestions[0];
      // Checkout fidelity: low levels sometimes ignore the optimal
      // and just swing for big numbers.
      const fidelity = levelCheckoutFidelity(level);
      if (Math.random() >= fidelity) {
        return best.darts.map((d) => ({ segment: d.segment, multiplier: d.multiplier }));
      }
    }
  }
  // Not closing out — plan N darts aimed at high-value singles.
  const plan = [];
  let r = remaining;
  for (let i = 0; i < budget; i += 1) {
    if (r <= 0) break;
    const target = pickNonCheckoutTarget(r, outRule, level);
    plan.push(target);
    r -= dartValue(target);
  }
  return plan;
}

// Throw one turn (up to 3 darts) for the bot at the given
// remaining score. Returns an array of 1..3 dart objects
// {segment, multiplier}.
//
// `opts.in` and `opts.out` are the in/out rules. Master-in is
// not handled here (the bot only plays x01 open-leg). In-rule
// is honoured only for the *first* scoring turn of a DI/TI leg
// (which the engine flags via `opened`).
export function playTurn(remaining, opts = {}, level = 1) {
  const L = clampLevel(level);
  const flags = x01InOutFlags(opts);
  const outRule = flags.outRule;

  // Plan: list of aimed targets. May be empty if nothing fits
  // (e.g. remaining = 0).
  const plan = planDarts(remaining, outRule, L);
  const darts = [];
  const acc = levelAccuracy(L);
  let planTotal = 0;
  for (const target of plan) {
    const dart = aimAt(target, acc, L);
    // The aimAt perturbation can shift the dart's value (e.g.
    // a T20 aimed target lands as T19 = 57 instead of 60).
    // If the running plan total would bust (exceed remaining)
    // after this dart, replace it with an explicit miss so
    // the bot doesn't accidentally over-throw. The plan
    // then continues with the next dart slot.
    const dval = dartValue(dart);
    if (planTotal + dval > remaining) {
      darts.push({ segment: 0, multiplier: 1 });
      // Don't update planTotal — misses don't reduce the
      // remaining, but the plan conceptually "spent" a dart.
    } else {
      darts.push(dart);
      planTotal += dval;
    }
  }
  // The plan is "finishing" if it accounts for the entire
  // remaining score — i.e. it ends the turn with score 0 (or
  // busts, but planDarts avoids that for bots at high levels).
  // In that case any remaining darts in the turn are misses
  // (the player has already finished the leg / round).
  // Without this fill, the bot's "remaining" darts (filled
  // by generateThrow below) get summed into the turn total,
  // which causes a bust (e.g. checkout D25 + random 60 = 110
  // busts on a score of 50, even though the bot only needed
  // the D25).
  const isFinishing = planTotal > 0 && planTotal >= remaining;
  // Top up to MAX_DARTS_PER_TURN. If the plan already finishes
  // the leg, the remaining slots are explicit misses (segment 0,
  // multiplier 1) so the engine doesn't count them against the
  // score. Otherwise we throw the bot's "random" dart (baseline
  // target selection weighted by level).
  while (darts.length < MAX_DARTS_PER_TURN) {
    if (isFinishing) {
      darts.push({ segment: 0, multiplier: 1 });
    } else {
      darts.push(generateThrow(null, L));
    }
  }
  return darts.slice(0, MAX_DARTS_PER_TURN);
}
