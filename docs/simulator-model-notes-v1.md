# Fourth Down Simulator — Model Notes (Baseline v1)

Date: 2026-03-10

## Scope
This document snapshots the pre-upgrade model currently used by `/tools/fourth-down/`.

## Inputs
- Yard line (1–99, from own goal to opponent goal)
- Yards to go (1–25)
- Quarter (1–4)
- Time remaining (MM:SS, interpreted within quarter)
- Score differential (team score minus opponent score)

## Core Logic
The tool computes expected points (EP) for each decision:
1. Go for it
2. Punt
3. Field goal

It then recommends the option with highest adjusted EP.

## Submodels
### 1) Conversion probability
- Lookup table for 1–10 yards to go
- Linear decay beyond 10 yards (floored)

### 2) Expected points by field position
- Piecewise linear interpolation over anchor points
- Anchors run from own 1 through opponent 1 (1–99 scale)

### 3) Field goal success
- Distance bands with fixed make probabilities
- Kick distance estimated as `117 - yardLine`

### 4) Punt value
- Net punt distance by field-position bands
- Touchback simplification: if punt crosses goal line, opponent starts at 20

### 5) Late-game heuristic adjustments
- Fourth-quarter-only additive tweaks to go/FG/punt EP
- Adjustment magnitude depends on time left and score differential

## Recommendation Output
- Best EP decision label
- Short natural-language explanation
- EP table for all three options

## Known Baseline Limitations
- EP-based core, not direct win probability optimization
- No timeout state, possession quality, weather, or team-strength priors
- Coarse static bands for FG and punt
- Fourth-quarter adjustments are heuristic, not fit to historical outcomes
