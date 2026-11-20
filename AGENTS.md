# AGENTS.md — Đảo Đèn Lồng

3D web game (Three.js), 3 nights, + deterministic headless mode for **Test Contract v1.1** (Ticket-02). Node >= 18, ESM, no build step.

## Commands
- Install: `npm install` (only dependency: three, for the browser build)
- Play: `npm start` -> http://localhost:8080
- Tests: `npm test` (node:test, must be green before finishing)
- Evidence: `npm run proof` -> regenerates `docs/proof/phase-<N>/results.md` from the real CLI
- Headless: `node src/headless.js --seed 1 --night 1|2|3 --ticks 600 --out out.jsonl`
- Play a given night directly: `http://localhost:8080/?autostart=1&night=3&fps` (`lit=N`, `seed=N` for screenshots)

## Layout
- `src/sim/` — ALL game rules. Pure JS, no DOM, no Math.random, no Date. Deterministic from seed.
- `src/sim/tuning.js` — Ticket-02 standard numbers (`TUNING` = contract keys, `WORLD` = other constants).
  `game.contract.json` tuning must equal `TUNING` (test CT-01). Numbers are FIXED by the ticket: never "tune" them.
- `src/sim/maps.js` — standard maps of nights 1-3 (ground height function, lanterns, spawn points, pads).
- `Sim.step` follows the mandatory per-tick order of Ticket-02 (numbered comments). Keep that order.
- `src/web/` — rendering + input only. Never put rules here; extras here must not change headless output.
- `tests/` — AC-xx (rules), FT-xx (one+ headless scenario per Ticket-02 feature), CT-xx (contract/CLI).

## Rules for agents
- The lab spec (PRD/tickets + Test Contract) is the source of truth. Quote it; do not invent requirements.
  Ambiguity -> write an assumption in `docs/notes/phase-<N>.md`, then test that assumption.
- Change a number -> change `tuning.js` AND `game.contract.json` in the same commit.
- Never hand-edit files in `docs/proof/`; regenerate with `npm run proof`.
- Never weaken a test to make it pass. If a new ticket replaces a rule, update the test and note why.
- A check that "passes" must prove the claim: e.g. a full-night perf run must assert `ticks == duration*60`
  and `reason == dawn` (twice an idle player died early and the check still said PASS).
- When a test fails, print the real values first; decide from the SPEC whether code or test is wrong.
- Contract details that are easy to get wrong: step k reads input of tick k -> state k+1, events tick = k+1;
  distances are horizontal XZ and "within r" is `<= r`; coords rounded to 3 decimals; malformed files -> exit 2;
  pause: tick advances but sim_tick/time/cooldowns freeze; shade states are exactly spawning|wander|chase|recoil|stunned.
