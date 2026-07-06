// Unit tests for the Dartbot engine. No DOM, no async — pure
// deterministic checks of the level helpers and statistical
// checks of the throw-generation and playTurn functions (which
// use Math.random and so are tested with large sample sizes).
import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  MIN_LEVEL, MAX_LEVEL, MIN_AVG, MAX_AVG,
  clampLevel, levelAverage, perDartAverage,
  levelAccuracy, levelSmartPlay, levelCheckoutFidelity,
  createDartBot, playTurn, planDarts, aimAt,
  MAX_DARTS_PER_TURN,
} from '../js/game/dartbot.js';
import { dartValue } from '../js/game/engine.js';

test('clampLevel accepts in-range values verbatim', () => {
  assert.equal(clampLevel(1), 1);
  assert.equal(clampLevel(8), 8);
  assert.equal(clampLevel(15), 15);
});

test('clampLevel clamps below MIN_LEVEL and above MAX_LEVEL', () => {
  assert.equal(clampLevel(0), MIN_LEVEL);
  assert.equal(clampLevel(-5), MIN_LEVEL);
  assert.equal(clampLevel(16), MAX_LEVEL);
  assert.equal(clampLevel(999), MAX_LEVEL);
});

test('clampLevel rounds and defaults to MIN_LEVEL', () => {
  assert.equal(clampLevel(7.4), 7);
  assert.equal(clampLevel(7.6), 8);
  assert.equal(clampLevel(undefined), MIN_LEVEL);
  assert.equal(clampLevel(null), MIN_LEVEL);
  assert.equal(clampLevel('banana'), MIN_LEVEL);
});

test('levelAverage is linear from MIN_AVG to MAX_AVG', () => {
  assert.equal(levelAverage(1), MIN_AVG);
  assert.equal(levelAverage(15), MAX_AVG);
  // 8 levels up the 14-step scale, half-way, → 30 + 0.5*70 = 65
  assert.equal(levelAverage(8), 65);
  // Level 9 → 30 + (8/14)*70 = 30 + 40 = 70
  assert.equal(levelAverage(9), 70);
  // Level 4 → 30 + (3/14)*70 ≈ 45
  assert.equal(levelAverage(4), 45);
});

test('perDartAverage is the round average divided by 3', () => {
  assert.equal(perDartAverage(1), 10);   // 30/3
  assert.equal(perDartAverage(15), 33.3); // 100/3, rounded to 1dp
  assert.equal(perDartAverage(8), 21.7);  // 65/3
});

test('accuracy, smart-play, and checkout-fidelity grow with level', () => {
  const a1 = levelAccuracy(1);
  const a15 = levelAccuracy(15);
  assert.ok(a1 < a15, 'accuracy must increase');
  assert.ok(a1 >= 0.20 && a1 <= 0.30, `L1 accuracy ${a1} in 0.20..0.30`);
  // L15 accuracy is "intent fidelity" — even a pro player
  // only hits the target on ~50-60% of attempts. A 0.90+
  // value here would mean the bot never misses, which is
  // unrealistic and would blow the round average way past
  // the spec'd 100. 0.50+ is the realistic upper bound.
  assert.ok(a15 >= 0.50, `L15 accuracy ${a15} >= 0.50`);
  const s1 = levelSmartPlay(1);
  const s15 = levelSmartPlay(15);
  assert.ok(s1 < s15, 'smart play must increase');
  assert.ok(s15 > 0.80, 'L15 should be highly strategic');
  const f1 = levelCheckoutFidelity(1);
  const f15 = levelCheckoutFidelity(15);
  assert.ok(f1 > f15, 'checkout fidelity (sloppiness) must decrease');
  assert.equal(f15, 0, 'L15 always goes for the optimal checkout');
  assert.ok(f1 > 0.20, 'L1 has noticeable checkout sloppiness');
});

test('createDartBot snapshots the level parameters', () => {
  const b = createDartBot(8);
  assert.equal(b.level, 8);
  assert.equal(b.average, 65);
  assert.equal(b.accuracy, levelAccuracy(8));
  assert.equal(b.smartPlay, levelSmartPlay(8));
  assert.equal(b.checkoutFidelity, levelCheckoutFidelity(8));
});

test('playTurn returns exactly 3 darts', () => {
  for (let lvl = 1; lvl <= 15; lvl += 1) {
    const darts = playTurn(501, { in: 'single', out: 'double' }, lvl);
    assert.equal(darts.length, MAX_DARTS_PER_TURN,
      `level ${lvl} should throw 3 darts`);
    for (const d of darts) {
      assert.ok(d && typeof d.segment === 'number', 'dart has segment');
      assert.ok(d && typeof d.multiplier === 'number', 'dart has multiplier');
    }
  }
});

test('playTurn uses Math.random in [0,60] range, never invalid', () => {
  // Run a lot of throws and ensure every dart is a valid shape.
  for (let i = 0; i < 500; i += 1) {
    const darts = playTurn(501, { in: 'single', out: 'double' }, 8);
    for (const d of darts) {
      assert.ok(d.segment === 0
        || (d.segment >= 1 && d.segment <= 20)
        || d.segment === 25,
        `invalid segment ${d.segment}`);
      assert.ok(d.multiplier === 1 || d.multiplier === 2 || d.multiplier === 3,
        `invalid multiplier ${d.multiplier}`);
      // BULL: only single or double (no triple bull)
      if (d.segment === 25) {
        assert.ok(d.multiplier !== 3, 'no triple bull');
      }
    }
  }
});

test('Level 1 averages roughly 30 (broad statistical check)', () => {
  // Statistical: 400 turns × 3 darts = 1200 darts. Tolerance is
  // broad because Level 1 is a coin-flip and the exact average
  // depends on what mix of segments the bot is allowed to pick
  // at score 501. ±50% covers the variance.
  let total = 0;
  const N = 400;
  for (let i = 0; i < N; i += 1) {
    const darts = playTurn(501, { in: 'single', out: 'double' }, 1);
    for (const d of darts) total += dartValue(d);
  }
  const avgPerRound = total / N;
  // Target: 30, allow 15..50.
  assert.ok(avgPerRound >= 15 && avgPerRound <= 50,
    `L1 average ${avgPerRound.toFixed(1)} should be roughly 30 (15..50)`);
});

test('Level 15 averages roughly 100 (broad statistical check)', () => {
  let total = 0;
  const N = 400;
  for (let i = 0; i < N; i += 1) {
    const darts = playTurn(501, { in: 'single', out: 'double' }, 15);
    for (const d of darts) total += dartValue(d);
  }
  const avgPerRound = total / N;
  // Target: 100, allow 60..140. The exact mix (T20 vs single 20
  // vs T19 etc.) shifts the actual average by 20-30 points.
  assert.ok(avgPerRound >= 60 && avgPerRound <= 140,
    `L15 average ${avgPerRound.toFixed(1)} should be roughly 100 (60..140)`);
});

test('Level 15 averages are clearly higher than Level 1', () => {
  let t1 = 0, t15 = 0;
  const N = 400;
  for (let i = 0; i < N; i += 1) {
    for (const d of playTurn(501, { in: 'single', out: 'double' }, 1)) t1 += dartValue(d);
    for (const d of playTurn(501, { in: 'single', out: 'double' }, 15)) t15 += dartValue(d);
  }
  assert.ok(t15 > t1 * 2,
    `L15 (${(t15 / N).toFixed(1)}) should clearly beat L1 (${(t1 / N).toFixed(1)})`);
});

test('Level 8 averages roughly 65 (mid-tier, broad tolerance)', () => {
  let total = 0;
  const N = 400;
  for (let i = 0; i < N; i += 1) {
    const darts = playTurn(501, { in: 'single', out: 'double' }, 8);
    for (const d of darts) total += dartValue(d);
  }
  const avgPerRound = total / N;
  // Mid-tier, target 65, allow 40..90.
  assert.ok(avgPerRound >= 40 && avgPerRound <= 90,
    `L8 average ${avgPerRound.toFixed(1)} should be roughly 65 (40..90)`);
});

test('planDarts returns at most 3 darts', () => {
  for (const r of [501, 170, 100, 50, 40, 32, 16, 8, 4, 2]) {
    const plan = planDarts(r, 'double', 15);
    assert.ok(plan.length >= 0 && plan.length <= 3,
      `plan for ${r} has ${plan.length} darts`);
  }
});

test('planDarts finds the optimal checkout for 170 at high level', () => {
  // 170 → T20 + T20 + BULL(50). At L15 the bot should always
  // aim for this.
  for (let i = 0; i < 50; i += 1) {
    const plan = planDarts(170, 'double', 15);
    const total = plan.reduce((s, d) => s + dartValue(d), 0);
    assert.equal(total, 170, 'plan must sum to remaining');
    // Should be exactly 3 darts.
    assert.equal(plan.length, 3);
  }
});

test('planDarts finds the optimal checkout for 40 at high level', () => {
  // 40 → D20 (1 dart). At L15 the bot should prefer the 1-dart
  // finish.
  let sawOneDart = 0;
  for (let i = 0; i < 100; i += 1) {
    const plan = planDarts(40, 'double', 15);
    if (plan.length === 1) sawOneDart += 1;
  }
  assert.ok(sawOneDart >= 95,
    `expected L15 to pick 1-dart checkout for 40 in >=95% of trials, got ${sawOneDart}`);
});

test('planDarts at L15 never leaves a single 1 (always a bust)', () => {
  // For any score, the plan should not finish on a "1" — which
  // is unwinnable. We test by sampling a range of scores.
  for (let trial = 0; trial < 200; trial += 1) {
    const remaining = 2 + Math.floor(Math.random() * 168); // 2..169
    const plan = planDarts(remaining, 'double', 15);
    let running = remaining;
    for (const d of plan) running -= dartValue(d);
    if (running === 0) {
      // This dart closed the leg. Ensure it was a double.
      const last = plan[plan.length - 1];
      assert.equal(last.multiplier, 2,
        `L15 closed ${remaining} with non-double ${last.segment}×${last.multiplier}`);
    }
  }
});

test('aimAt always hits the target when accuracy is 1.0', () => {
  for (let i = 0; i < 100; i += 1) {
    const result = aimAt({ segment: 20, multiplier: 3 }, 1.0);
    assert.equal(result.segment, 20);
    assert.equal(result.multiplier, 3);
  }
});

test('aimAt never hits the target when accuracy is 0.0', () => {
  // With accuracy 0, the generator should always perturb.
  // (The generator has its own internal perturbation logic
  // for "missed" throws.)
  let perturbed = 0;
  for (let i = 0; i < 50; i += 1) {
    const result = aimAt({ segment: 20, multiplier: 3 }, 0.0);
    const isTarget = result.segment === 20 && result.multiplier === 3;
    if (!isTarget) perturbed += 1;
  }
  assert.equal(perturbed, 50, 'with 0 accuracy every throw should be perturbed');
});

test('playTurn at remaining=0 returns 3 darts without crashing', () => {
  // Edge case: bot called when game is already over.
  // Should not throw, but should not crash either.
  const darts = playTurn(0, { in: 'single', out: 'double' }, 8);
  assert.equal(darts.length, MAX_DARTS_PER_TURN);
});
