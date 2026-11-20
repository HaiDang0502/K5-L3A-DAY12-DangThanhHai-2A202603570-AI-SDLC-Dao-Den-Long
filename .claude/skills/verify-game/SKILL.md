---
name: verify-game
description: Run the full verification for Đảo Đèn Lồng (unit/acceptance tests, headless proof scenarios, determinism, screenshot) and update the evidence table. Use after changing game rules, tuning, or the headless runner, and before tagging a phase.
---

# Verify the game and save evidence

1. `npm test` — all AC-xx / CT-xx tests must pass. If one fails, fix the code (not the test) unless a ticket changed the rule.
2. `npm run proof` — runs the real CLI on the scenarios in `scripts/proof.js` and writes
   `docs/proof/phase-<N>/results.md`. Exit code 1 means a check failed: report it honestly.
   Read the Observed column, not just PASS: a check must fail if the scenario did not really run (see AGENTS.md).
3. New requirement? Add a check to `scripts/proof.js` (scenario file + expected values taken from the spec)
   and an AC test in `tests/sim.test.js` BEFORE implementing it.
4. Visual requirements (HUD, lighting, character): start `PORT=8090 npm start` in the background, then
   `chrome --headless=new --window-size=1280,720 --virtual-time-budget=4000 --screenshot=<abs path>.png "http://localhost:8090/?autostart=1&night=<1|2|3>&seed=7&lit=3"`
   One chrome call per command (loops of screenshots were blocked by the permission system).
   and look at the image. `lit=N` pre-lights N lanterns (debug only).
5. FPS: open `?autostart=1&night=3&fps` in a real browser with GPU; headless Chrome renders in software and is not a valid FPS measurement.
6. Update the requirement -> evidence table in `docs/proof/phase-<N>/README.md`. Mark anything unverified as "chưa đạt" with the reason.
