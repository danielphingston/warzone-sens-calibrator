# Warzone Sens Calibrator

A browser tool that finds your mouse sensitivity for **Call of Duty: Warzone** or **Valorant** from how you actually aim.

**Live:** https://danielphingston.github.io/warzone-sens-calibrator/

## Games

| Game | Degrees per count at sens 1 | Sens decimals | FOV | Blend (tracking / flicks / micro) |
|---|---|---|---|---|
| Warzone | 0.0066 | 2 | your setting | 45 / 35 / 20 |
| Valorant | 0.07 | 3 | fixed 103° | 20 / 45 / 35 |

Center sens and cm/360 are linked: edit either one. Switching games keeps the same cm/360, and results are saved separately per game.

## Drills

- **Flicks** – targets 20–90° away; the first click ends each target (hit or miss). A replay shows where your first fast movement stopped.
- **Tracking** – keep the crosshair on a target that strafes like a player 10–20 m away (Realistic preset: 8–28°/s, direction change every 0.6–1.5 s; Calm and Hard presets available). The 220 ms after each reversal is not scored. Scored by time on target.
- **Micro-adjust** – small targets 3–12° away.
- **Full test** – all three, blended on a log scale: tracking 45%, flicks 35%, micro 20%.

Each drill tests five sens values twice in shuffled order (first 2 targets of each block are warm-up) and fits a parabola of score vs ln(sens) to find the peak.

## Scoring methods (selectable)

| Method | Uses | Calculation |
|---|---|---|
| **Fitts throughput** (default) | distance, time to first click, click overshoot, timeouts | ISO 9241-9 effective throughput: We = 4.133·SD(overshoot), TP = mean(log2(D/We + 1) / MT) |
| **Precision-first** | first-click hits, overshoot spread relative to distance | hit rate ÷ (1 + 4.133·SD(overshoot/D)) |
| **Reach matching** (legacy) | where the first fast movement stopped | steps sens toward a 93% reach (primary movements normally undershoot), ±15% per round |

## Ergonomic range

All tests and results stay between a slow limit (a 180° turn fits in 80% of your mousepad width) and a fast limit (default 12 cm/360, where ~0.1 mm of hand jitter moves aim ~0.3°). Both are adjustable.

## Export

"Build export" produces an analysis prompt plus every block and target with raw readings and field definitions, ready to paste into an AI.

## References

- MacKenzie, Fitts' law and ISO 9241-9: https://www.yorku.ca/mack/UCLAN2018/FittsLaw.pdf
- Casiez et al. 2008, control-display gain and pointing: https://www.gwern.net/doc/design/2008-casiez.pdf
- Roberts et al. 2020, energy minimization and undershoot in aiming: https://ljmu-9.eprints-hosting.org/id/eprint/12204/11/Roberts2020_Article_EnergyMinimizationWithinTarget.pdf
