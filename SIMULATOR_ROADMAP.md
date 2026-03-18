# Fourth Down Simulator Roadmap

## Goal
Upgrade the current fourth-down tool from lightweight expected-points guidance to a stronger decision engine with game-state-aware win probability outputs.

## Working Principles
- Keep the existing UI usable while improving internals in phases.
- Prefer transparent assumptions first, then data-backed calibration.
- Ship incremental improvements (small deployable steps).
- Cross-site deployment rule: once the upgraded model reaches sufficient quality/stability, deploy the model improvements to both `sportsecon` and `signalplay/site` to keep the 4th simulator aligned.

## Phase 0 — Baseline + Instrumentation
- [x] Snapshot current model assumptions and formulas.
- [x] Add a small test matrix of representative scenarios.
- [x] Define baseline outputs for comparison (current recommendation + score deltas).

## Phase 1 — Better Decision Core (fast upgrade)
- [ ] Adopt `cfb4th` methodology as primary reference implementation (avoid reinventing baseline logic).
- [ ] Choose integration path: direct port, precomputed lookup tables, or hybrid wrapper.
- [ ] Implement go / punt / FG logic aligned with `cfb4th` assumptions where feasible.
- [ ] Add clearer output explanations: "why this recommendation" plus model provenance note.
- [ ] Ship as v1.1 with changelog note.

## Phase 2 — Win Probability Layer
- [ ] Add game-state features: yard line, yards-to-go, quarter, time left, score differential.
- [ ] Build a first WP approximation for post-decision states.
- [ ] Compare go/punt/FG by expected win probability (not only expected points).
- [ ] Surface both: WP impact + confidence/uncertainty note.

## Phase 3 — Data-backed Calibration
- [ ] Pull and clean historical play-by-play data.
- [ ] Fit/update conversion, FG, and punt submodels from data.
- [ ] Calibrate WP function on holdout seasons.
- [ ] Validate against known benchmark situations.

## Phase 4 — Quality + UX
- [ ] Add scenario compare mode (A/B situations).
- [ ] Add sensitivity view (how recommendation changes with assumptions).
- [ ] Improve mobile output readability and interpretation text.

## Deliverables
- Model notes document (assumptions + formulas)
- Versioned JS model file(s)
- Scenario test file with expected outputs
- Release notes per phase

## Open Questions
- Include timeout inputs now or later?
- Team-strength adjustment (optional toggle) in phase 2 or 3?
- Should recommendations optimize for WP only, or include EP as secondary tie-breaker?

## Status Log
- 2026-03-10: Roadmap initialized.
- 2026-03-10: Phase 0 completed. Added baseline model notes (`docs/simulator-model-notes-v1.md`) and scenario baseline outputs (`data/simulator-baseline-v1.json`).
- 2026-03-10: Strategy update — decided to adopt `cfb4th` methodology and implement a Sportsecon wrapper approach (see `docs/cfb4th-adoption-plan.md`).
- 2026-03-11: Added parity scaffolding (`data/cfb4th-benchmark-template.json`, `scripts/simulator-parity-check.mjs`) to benchmark Sportsecon outputs against cfb4th targets.
- 2026-03-11: Generated initial cfb4th benchmark targets (`data/cfb4th-benchmark-targets.json`) and ran first parity check (2/4 scenario recommendation agreement; clear upgrade opportunities identified).
- 2026-03-12: Added first win-probability layer to `assets/fourth-down-model.js`, recalibrated field-goal make-rate assumptions, and updated the UI to show WP outputs. Current benchmark parity now matches cfb4th recommendations on the seeded 4-scenario test set (4/4), though absolute WP values still need broader calibration.
- 2026-03-16: Started broader calibration phase by generating `data/cfb4th-benchmark-grid.json` (640 scenarios across field position, distance, quarter, time, and score states) and adding a reusable generator script at `scripts/generate-cfb4th-benchmark-grid.R`.
- 2026-03-18: Ran full 640-scenario comparison against the local model, identified overly conservative behavior in short-yardage/trailing states, and completed a first calibration pass. Recommendation agreement improved from 59.8% to 77.5% (`data/cfb4th-grid-comparison.json`).
