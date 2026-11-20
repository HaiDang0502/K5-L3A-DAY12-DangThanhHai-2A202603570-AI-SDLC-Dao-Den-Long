# AGENTS.md — Đảo Đèn Lồng

3D web game (Three.js) + deterministic headless mode for Test Contract v1.0. Node >= 18, ESM, no build step.

## Commands
- Install: `npm install` (only dependency: three, for the browser build)
- Play: `npm start` -> http://localhost:8080
- Tests: `npm test` (node:test, must be green before finishing)
- Evidence: `npm run proof` -> regenerates `docs/proof/phase-<N>/results.md` from the real CLI
- Headless: `node src/headless.js --seed 1 --night 1 --ticks 600 --out out.jsonl`

## Layout
- `src/sim/` — ALL game rules. Pure JS, no DOM, no Math.random, no Date. Deterministic from seed.
- `src/sim/tuning.js` — every gameplay number. `game.contract.json` tuning must equal it (test CT-01).
- `src/web/` — rendering + input only. Never put rules here; extras here must not change headless output.
- `tests/` — acceptance tests (AC-xx = docs/notes acceptance criteria), contract tests (CT-xx).

## Rules for agents
- The lab spec (PRD/tickets + Test Contract) is the source of truth. Quote it; do not invent requirements.
  Ambiguity -> write an assumption in `docs/notes/phase-<N>.md`, then test that assumption.
- Change a number -> change `tuning.js` AND `game.contract.json` in the same commit.
- Never hand-edit files in `docs/proof/`; regenerate with `npm run proof`.
- Never weaken a test to make it pass. If a new ticket replaces a rule, update the test and note why.
- Contract details that are easy to get wrong: step k reads input of tick k -> state k+1, events tick = k+1;
  distances are horizontal XZ and "within r" is `<= r`; coords rounded to 3 decimals; malformed files -> exit 2.
