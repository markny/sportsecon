# Fourth Down Simulator UI Spec (v2)

Date: 2026-03-21

## Goal
Upgrade the current fourth-down tool from a compact beta interface into a more comprehensive, classroom-friendly decision interface while keeping the stronger cfb4th-aligned model backbone.

## Design Principles
- Keep the interface approachable for first-time users.
- Make the core controls obvious and fast to use.
- Hide advanced inputs behind an expandable panel rather than overwhelming the default view.
- Show both the recommendation and the reasoning clearly.
- Preserve mobile usability.

## Model Assumption
The recommendation engine is now dense-surface-backed and closely aligned with cfb4th behavior. The UI should expose more of that model, not obscure it.

## Layout Overview

### 1. Hero / Intro block
- Tool title
- One-sentence description
- Short note that the model uses a cfb4th-aligned decision surface
- Optional “About this model” expandable note

### 2. Primary control panel (default visible)
These should always be visible:
- Yard line (keep slider + numeric display)
- Yards to go
- Quarter
- Time remaining
- Score differential

### 3. Advanced inputs panel (collapsible)
Show under an “Advanced Inputs” toggle:
- Offense timeouts remaining
- Defense timeouts remaining
- Pregame spread
- Over/under
- Offense receives second-half kickoff? (yes/no)
- Optional team-strength mode later

Default values when hidden:
- offense timeouts = 3
- defense timeouts = 3
- spread = -3
- over/under = 52
- receives second-half kickoff = yes

## Output Overview

### A. Primary recommendation card
Show prominently:
- Recommended action
- Best win probability
- One-sentence reasoning summary
- Optional confidence note / model note

### B. Three-option comparison cards
One card each for:
- Go for it
- Punt
- Field goal

Each card should show:
- Win probability
- Short supporting metric

Supporting metric by action:
- Go: conversion probability
- Punt: post-punt position estimate or opponent disadvantage note
- FG: kick distance + make probability

### C. Expanded explanation panel
Below result cards:
- “Why this recommendation” summary
- Explain tradeoffs in plain English
- If two choices are close, say so explicitly

## Specific Inputs

### Default inputs
1. Yard line
   - Slider with field-position labeling
   - Numeric display
   - Preserve current 1–99 interpretation, but explain it clearly

2. Yards to go
   - Number input or stepped control

3. Quarter
   - Segmented selector or dropdown

4. Time remaining
   - Minute/second input or preset slider with exact display

5. Score differential
   - Number input

### Advanced inputs
1. Offense timeouts remaining
2. Defense timeouts remaining
3. Pregame spread
4. Over/under
5. Receives second-half kickoff

## Specific Outputs

### Recommendation card
- Recommendation label
- Best WP as percentage
- Very short summary line, e.g.:
  - “Go is favored because conversion odds plus game state outweigh the value of a field goal.”

### Comparison row/card data
For each action:
- Win probability
- Delta vs best option
- Supporting metric

#### Go for it
- Win probability
- Conversion probability
- Optional first-down leverage note

#### Punt
- Win probability
- Expected opponent field position (or nearest surface note)
- Optional hidden advanced note later

#### Field goal
- Win probability
- Kick distance
- Make probability

### Optional advanced results (not required in first UI pass)
- Expected points / value proxy
- Sensitivity range
- Surface-match / interpolation confidence note

## Suggested Interaction Flow
1. User adjusts primary inputs
2. Recommendation updates immediately or on “Calculate”
3. Result cards show all three choices
4. User expands advanced inputs if needed
5. User refines timeouts/spread/kickoff
6. Output updates with richer context

## Suggested Aesthetic Direction
Inspired by compact analytics dashboards like Malter Analytics, but not copied.

### Visual priorities
- Strong slider for yard line
- Clear hierarchy
- Clean data cards
- Minimal clutter
- More premium than the current beta tool
- Keep color contrast strong

### Tone
- Analytical but not sterile
- Confident but not overclaimed
- Explainable enough for students and casual readers

## v2 Implementation Sequence

### Phase A — controls and structure
- Add advanced inputs panel
- Reorganize primary controls
- Keep current model intact

### Phase B — richer outputs
- Add recommendation card
- Add three comparison cards with supporting metrics
- Improve explanation text

### Phase C — polish
- Better spacing/typography
- More premium card styling
- Mobile cleanup
- Optional animations / transitions

## Not in scope yet
- Timeout-sensitive full dynamic state grid regeneration
- User accounts / saved scenarios
- Team-specific adjustment mode
- Sound or narration
- Historical play lookup mode

## Success criteria
- Tool feels significantly more complete
- More inputs without overwhelming default users
- Outputs look more credible and readable
- Recommendation remains backed by the stronger dense-surface model
- Interface is clean enough to present publicly on sportsecon and signalplay
