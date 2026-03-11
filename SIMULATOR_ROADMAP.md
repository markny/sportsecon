# Fourth Down Simulator Roadmap

## Goal
Upgrade the current fourth-down tool from lightweight expected-points guidance to a stronger decision engine with game-state-aware win probability outputs.

## Working Principles
- Keep the existing UI usable while improving internals in phases.
- Prefer transparent assumptions first, then data-backed calibration.
- Ship incremental improvements (small deployable steps).
- Cross-site deployment rule: once the upgraded model reaches sufficient quality/stability, deploy the model improvements to both `sportsecon` and `signalplay/site` to keep the 4th simulator aligned.

## Phase 0 — Baseline + Instrumentation
- [ ] Snapshot current model assumptions and formulas.
- [ ] Add a small test matrix of representative scenarios.
- [ ] Define baseline outputs for comparison (current recommendation + score deltas).

## Phase 1 — Better Decision Core (fast upgrade)
- [ ] Improve go-for-it conversion model by yards-to-go and field context.
- [ ] Improve FG make probability by kick distance bands.
- [ ] Improve punt outcome model (net + touchback likelihood).
- [ ] Add clearer output explanations: "why this recommendation".
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
