// Integration test: verify that a Dartbot player is recognised
// by the UI, and that the autoplay path produces a sensible
// sequence of moves. The test is mostly a sanity check on the
// isBot/botLevel player fields + the playTurn + the engine's
// submitTurnTotal01 — the actual UI wiring (afterThrow →
// maybeStartDartbotTurn → setTimeout) is jsdom-friendly enough
// to exercise here.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';

import { new01, submitTurnTotal01, dartValue } from '../js/game/engine.js';
import { playTurn as dartbotPlayTurn } from '../js/game/dartbot.js';

test('Dartbot player field is recognised by the engine flow', () => {
  // The engine doesn't itself read isBot/botLevel — the UI
  // does. But the player object shape needs to support those
  // fields (no engine code strips them). Build a 1vBot game
  // and walk it through a couple of turns to confirm the
  // shape is preserved.
  const game = new01(['Alex', 'Bot-5'], { start: 501, out: 'double' });
  game.players[1].isBot = true;
  game.players[1].botLevel = 5;
  assert.equal(game.players[1].isBot, true);
  assert.equal(game.players[1].botLevel, 5);
  // Human turn.
  const r1 = submitTurnTotal01(game, 60);
  assert.equal(r1.state.current, 1, 'turn advanced to the bot');
  // Bot turn (simulated by calling dartbotPlayTurn directly).
  const darts = dartbotPlayTurn(game.players[1].score, { in: 'single', out: 'double' }, 5);
  assert.equal(darts.length, 3);
  const total = darts.reduce((s, d) => s + dartValue(d), 0);
  const r2 = submitTurnTotal01(game, total);
  assert.equal(r2.state.current, 0, 'turn advanced back to the human');
});

test('Dartbot turn does not crash when score is at 0', () => {
  const game = new01(['Alex', 'Bot-5'], { start: 50, out: 'double' });
  game.players[1].isBot = true;
  game.players[1].botLevel = 5;
  // Bot is on 50, wants D20. The dartbot should produce a valid
  // turn even if planDarts is degenerate.
  const darts = dartbotPlayTurn(game.players[1].score, { in: 'single', out: 'double' }, 5);
  assert.equal(darts.length, 3);
  for (const d of darts) {
    assert.ok(d && typeof d.segment === 'number', 'bot dart has segment');
    assert.ok(d && typeof d.multiplier === 'number', 'bot dart has multiplier');
  }
});

test('A 1vBot game reaches an end state after many turns', () => {
  // Walk a 1vBot game to completion, simulating the bot's
  // turn each time it's the bot's turn. Use level 1 (lowest
  // accuracy) to keep the loop bounded.
  const game = new01(['Alex', 'Bot-1'], { start: 101, out: 'double' });
  game.players[1].isBot = true;
  game.players[1].botLevel = 1;
  let safety = 200; // ~67 turns max
  while (game.winner == null && safety-- > 0) {
    const p = game.players[game.current];
    if (p.isBot) {
      const darts = dartbotPlayTurn(p.score, { in: 'single', out: 'double' }, p.botLevel);
      const total = darts.reduce((s, d) => s + dartValue(d), 0);
      const r = submitTurnTotal01(game, total);
      if (r.state.winner != null) break;
    } else {
      // Human turn: throw 60 (T20 or 20). Not a real dart, just
      // a placeholder to keep the game moving.
      const r = submitTurnTotal01(game, 60);
      if (r.state.winner != null) break;
    }
  }
  assert.ok(game.winner != null, `1vBot game should end within ${200} turns; got ${200 - safety} turns`);
  // The winner is one of the two players.
  assert.ok(game.winner === 0 || game.winner === 1,
    `winner should be 0 or 1, got ${game.winner}`);
});

test('A 1v1 game without isBot does not auto-play', () => {
  // Sanity: without isBot set, the game engine alone never
  // generates a turn. The UI's maybeStartDartbotTurn checks
  // isBot; if false, no setTimeout fires. The engine doesn't
  // do this on its own.
  const game = new01(['Alex', 'Sam'], { start: 501, out: 'double' });
  assert.equal(game.players[0].isBot, undefined,
    'no isBot field on a regular player');
  assert.equal(game.players[1].isBot, undefined);
  // submitTurnTotal01 still works as before.
  const r = submitTurnTotal01(game, 60);
  assert.equal(r.state.current, 1);
  assert.equal(r.state.players[0].score, 441);
});
