# cfb4th Adoption Plan (Sportsecon Fourth-Down Upgrade)

Date: 2026-03-10

## Decision
Use `cfb4th` as the modeling reference and build a Sportsecon.com wrapper UX, rather than developing a fully custom model from scratch.

## Why this approach
- Faster path to credible recommendations
- Existing, documented logic for go/punt/FG outcomes
- Includes win-probability framing in the broader ecosystem
- Reduces model-risk from ad hoc assumptions

## Source references
- cfb4th docs: https://cfb4th.sportsdataverse.org
- GitHub repo: https://github.com/sportsdataverse/cfb4th
- License: MIT (compatible with adaptation/use with attribution)

## Integration options

### Option A: Direct JS port of key logic
Pros:
- Fully local, no runtime dependency on R backend
- Fast frontend performance
Cons:
- Porting risk if behavior diverges from source implementation
- Requires thorough parity tests

### Option B: Precomputed scenario tables from cfb4th
Pros:
- High fidelity to source model where table covers
- Simpler frontend compute path
Cons:
- Requires interpolation for unlisted states
- Table generation pipeline must be maintained

### Option C: Hybrid (recommended)
- Build a compact precomputed core for common states
- Use local approximation/interpolation for in-between states
- Maintain explicit provenance + confidence notes

## Chosen direction (initial)
Proceed with **Option C (Hybrid)** for v1.1:
1. Generate benchmark outputs for representative state grid.
2. Fit lightweight local approximation surfaces to benchmark outputs.
3. Expose recommendation + win-prob deltas with provenance note.

## Validation plan
- Create parity test set against benchmark scenarios.
- Track recommendation agreement rate + avg WP delta.
- Flag low-confidence regions in UI copy.

## Attribution note (site)
Add a short “Model basis” section on tool page:
- “Current decision logic is informed by SportsDataverse cfb4th methodology and adapted for Sportsecon.com presentation and interaction.”

## Cross-site deployment rule
When stable, deploy the same model layer and assumptions to:
1. sportsecon.com
2. signalplay/site
