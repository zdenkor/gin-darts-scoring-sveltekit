# Checkout Darts Formulas (SvelteKit port)

The checkout-attempts modal asks the player how many darts they
had available for the close-out. The engine helper
`maxCheckoutAttemptsForX01(target, total, inOut, isLegWin)` encodes
the rules in this file. The same rules drive the modal: button
`n` is enabled when `n <= max`, where `max` is the value returned
by the formula. The modal offers buttons 0..max (the player can
also pick 0 if none of the 3 darts were aimed at the close).

> **Note:** This is the SvelteKit port of the rules. The original
> `gins-online-darts-scoring` repo has a different, more
> conservative formula in its `docs/CHECKOUT_FORMULAS.md`. The
> rules below supersede those for the SvelteKit engine.

## Cells

- `B2` = target (the player's score at the start of the turn)
- `C2` = total (the player's actual points scored this turn)
- `D2` = `B2 - C2` (remaining after the throw)

The "out rule" (DO, MO, SO, TO) is passed separately via
`inOut.out` and changes the legal-finisher set, which in turn
changes which targets are 1-/2-/3-dart closable.

## Unified table (all 4 out rules, all branches)

`max` answers one question: *how many darts in this turn could
the player have aimed at the close-out?* The answer depends
**only on the original target B2** (or, for leg-win, on the
scored C2, which equals B2 in that case).

| Target type | max | Modal buttons |
|---|---|---|
| 1-dart closer (e.g. 50, 40, 60 in SO, 60 in TO if div by 3, ...) | 3 | 0, 1, 2, 3 |
| 2-dart closer (e.g. 100, 60 in DO, 120 in MO/SO/TO, ...) | 2 | 0, 1, 2 |
| 3-dart closer (e.g. 170, 160, 158, ...) | 1 | 0, 1 |
| Unclosable (1, 159, 162, 163, 165, 166, 168, 169, anything > max-bustable, ...) | 0 | (no modal) |

This table is **uniform across DO, MO, SO, TO** and across
leg-win, non-leg-win, and bust branches. The only thing that
varies per out rule is *which* numbers are 1-/2-/3-dart
closable (the legal-finisher set).

### Why this table?

A 1-dart closer (e.g. 50 in DO = D-Bull) means the player needs
**one** dart to finish. With 3 darts in a turn, the player had
up to 3 chances to throw that one dart — so `max=3`.

A 2-dart closer (e.g. 60 in DO = D20+S20) means the player needs
**two** darts. The first dart must be setup (leaving a 1-dart
closer), the second can be the closer — so only 2 of the 3
turn-darts can aim at the close. `max=2`.

A 3-dart closer (e.g. 170 in DO = T20+T20+BULL) means the player
needs **three** darts. The first two must be setup (leaving a
1-dart closer), the third can be the closer — so only 1 of the
3 turn-darts can aim at the close. `max=1`.

## Per-out-rule closer sets

### Double Out (DO)

A DO close-out requires the final dart to be a double (D1..D20
or D-Bull = 50).

**1-dart closers** in DO: `B2 <= 40` and even, OR `B2 = 50`.
(That is: 2, 4, 6, ..., 40, 50.)

**2-dart closers** in DO: `B2 in 1..100` and not in
`{91, 93, 95, 97, 99}` and not a 1-dart closer.

**3-dart closers** in DO: `B2 in 101..170` and not in
`UNCLOSABLE_DO_3DART = {1, 159, 162, 163, 165, 166, 168, 169, 171, 172, 173, 174, 175, 176, 177, 178, 179, 180}`.

**Unclosable** in DO: anything > 170, anything in
`UNCLOSABLE_DO_3DART`, or `B2 = 1`.

### Master Out (MO)

An MO close-out requires the final dart to be a double, a
triple, or the double bull (D25 = 50).

**1-dart closers** in MO: `B2 <= 60` and (even or divisible by 3), OR `B2 = 50`.
(That is: 2, 3, 4, 6, 8, 9, ..., 60, 50.)

**2-dart closers** in MO: `B2 in 1..120` and not a 1-dart closer.

**3-dart closers** in MO: `B2 in 121..180`.

**Unclosable** in MO: `B2 > 180` or `B2 = 1`.

### Single Out (SO)

An SO close-out can be any single, double, triple, or S/D-Bull.

**1-dart closers** in SO: `B2 in 1..60`. (1..60 can all be
finished on a single dart — S1..S60, plus the doubles and
triples in that range.)

**2-dart closers** in SO: `B2 in 61..120`.

**3-dart closers** in SO: `B2 in 121..180`.

**Unclosable** in SO: `B2 > 180`.

### Triple Out (TO)

A TO close-out requires the final dart to be a triple (T1..T20)
or the double bull (D25 = 50).

**1-dart closers** in TO: `B2 <= 60` and divisible by 3, OR `B2 = 50`.
(That is: 3, 6, 9, 12, ..., 60, 50.)

**2-dart closers** in TO: `B2 in 1..120` and not a 1-dart closer.

**3-dart closers** in TO: `B2 in 121..180`.

**Unclosable** in TO: `B2 > 180`, `B2 = 1`, or `B2 = 2`.

## Leg-win branch

When `D2 = 0` (the throw finished the leg), the answer is the
same as above, but applied to `C2` instead of `B2` (since
`C2 = B2` in a leg-win, both give the same result).

| C2 (= B2) | max |
|---|---|
| 1-dart closer | 3 |
| 2-dart closer | 2 |
| 3-dart closer | 1 |

## Non-leg-win and bust branches

Identical logic. `max` depends only on the target B2 (or C2
for leg-win). Whether the throw advanced the score (C2 < B2)
or busted (C2 > B2) does not change `max` — the question is
*how many of the 3 turn-darts could have aimed at the close of
the original target B2*.

## Worked examples

| B2 | C2 | Out | Closer type | max | Modal |
|---|---|---|---|---|---|
| 50 (D-Bull) | 0 | DO | 1-dart | 3 | 0/1/2/3 |
| 50 | 50 (leg-win) | DO | 1-dart | 3 | 0/1/2/3 |
| 50 | 80 (bust) | DO | 1-dart | 3 | 0/1/2/3 |
| 60 | 0 | DO | 2-dart | 2 | 0/1/2 |
| 60 | 60 (leg-win) | DO | 2-dart | 2 | 0/1/2 |
| 100 | 180 (bust) | DO | 2-dart | 2 | 0/1/2 |
| 170 | 0 | DO | 3-dart | 1 | 0/1 |
| 170 | 170 (leg-win) | DO | 3-dart | 1 | 0/1 |
| 170 | 200 (bust) | DO | 3-dart | 1 | 0/1 |
| 159 | 200 (bust) | DO | unclosable | 0 | (no modal) |
| 171 | 200 (bust) | DO | unclosable | 0 | (no modal) |
| 60 | 100 (bust) | MO | 1-dart | 3 | 0/1/2/3 |
| 170 | 0 | SO | 3-dart | 1 | 0/1 |
| 60 | 0 | TO | 3-dart* (60 is not div by 3, so 1-dart not applicable; 2-dart) | 2 | 0/1/2 |

\* For TO, 60 is divisible by 3 so it IS a 1-dart closer
(T20 = 60). The table is right; the asterisk is just a
reminder to check the per-out-rule sets.

## What the modal asks

After a turn where `max > 0`, the modal asks the player:

> "How many of your 3 darts were aimed at the close-out?"

The player picks 0, 1, 2, or 3 (up to `max`). The answer is
saved to `player.history[historyIdx].checkoutAttempts` for the
stats layer (`stats.js` and `/stats` page) to consume.

For **bot players** the answer is auto-set to `max` (bots always
aim at the close if there is one). For **human players with the
"Ask checkout attempts" setting off** the answer is also
auto-set to `max` (the setting hides the modal, not the event).
