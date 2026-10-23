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

Each drill tests five sens values twice, in a shuffled order that is then played back in reverse (A B C D E, E D C B A), so every sens sits at the same average point in the run. The first 2 targets of each block are warm-up. A parabola of ln(score) vs ln(sens) finds the peak.

## Scoring methods (selectable)

| Method | Uses | Calculation |
|---|---|---|
| **Fitts throughput** (default) | distance, time to first click, click overshoot, timeouts | ISO 9241-9 effective throughput: We = 4.133·SD(overshoot), TP = mean(log2(D/We + 1) / MT) |
| **Precision-first** | first-click hits, overshoot spread relative to distance | hit rate ÷ (1 + 4.133·SD(overshoot/D)) |
| **Reach matching** (legacy) | where the first fast movement stopped | steps sens toward a 93% reach (primary movements normally undershoot), ±15% per round |

## Finding the peak

- **Curve fit:** a quadratic of ln(score) vs ln(sens) through every block (performance falls off in proportion, so the log scale avoids being dragged toward the edge by a steep side). With the fixed bracket the fit also includes a straight line in block order, so scores that climb through the run as you warm up (or sag with fatigue) aren't read as a sens effect. The reported sens is the fitted curve's highest point inside the tested range.
- **Likely range:** 10th–90th percentile of the peak over 300 bootstrap resamples of the blocks (resamples with fewer than 3 distinct sens values are skipped).
- **Flat:** flagged when the curve rises less than 1.5× the block noise, the likely range covers 75%+ of the tested range, or the curve bends upward with its low point inside the range (the middle scoring worst is noise, not a preference). On a flat curve the highest point is just whichever end happened to score higher, so a flat drill reports the average of the bootstrap peaks instead. Flat drills count at 25% weight in the overall blend.
- **Older results** are refitted with the current math when the page loads, since every block is stored.
- **Search – Fixed bracket:** five values ×0.62–×1.6 around the center, twice each, shuffled then mirrored (10 blocks).
- **Search – Bayesian adaptive:** 3 starting blocks, then Thompson sampling from the posterior of the same model picks each next sens; stops when 80% of plausible peaks lie within about ±12% (5–12 blocks). In simulation it typically finishes in 6 blocks with accuracy close to the 10-block bracket.

## Reaction time

On by default: flick and micro throughput use time from movement onset (click time minus reaction time; reactions under 100 ms, from movement carried over from the previous target, use the block median). Tracking skips the 220 ms after each direction change. Turn it off to score raw times.

## Practice

Turn on the Practice toggle and pick Flicks, Tracking or Micro-adjust under Test: unlimited targets at a fixed sens with live stats. Nothing is saved.

## Ergonomic range

By default, tests and results stay between a slow limit (a 180° turn fits in 80% of your mousepad width) and a fast limit (default 12 cm/360, where ~0.1 mm of hand jitter moves aim ~0.3°). Both are adjustable, and **Enforce** can be turned off to test anywhere from 2 to 200 cm/360; results outside the recommended range are marked.

## Mouse scaling check

Move the mouse 10 cm along a ruler between two clicks. With raw input on, the browser sees the same counts the game does, so a mismatch means the mouse isn't at the DPI you entered: the DPI field is updated to the measured value. Without raw input, Windows pointer settings can scale movement, and the calibrator compensates instead.

## Video recording

Recording is off by default. Turn on **Record runs** in the sidebar and each run is recorded as a small WebM (640×360, 30 fps, about 3–4 MB a minute): tests from Start until they finish, practice from Start until Esc. Pausing a test with Esc pauses the video, so the clip has no dead time. A timer is burned into each frame, and every target and tracking block in the export carries videoT (seconds into the video), so an AI can line the numbers up with what it sees. Download the last run from the sidebar.

## Export

"Build export" produces an analysis prompt plus every block and target with raw readings and field definitions, ready to paste into an AI. An optional "About you" note is added to the prompt. Each drill carries the settings it was run with (`testedWith`), since drills can come from different sessions, and each block has `t`, seconds since the session started.

## References

- MacKenzie, Fitts' law and ISO 9241-9: https://www.yorku.ca/mack/UCLAN2018/FittsLaw.pdf
- Casiez et al. 2008, control-display gain and pointing: https://www.gwern.net/doc/design/2008-casiez.pdf
- Roberts et al. 2020, energy minimization and undershoot in aiming: https://ljmu-9.eprints-hosting.org/id/eprint/12204/11/Roberts2020_Article_EnergyMinimizationWithinTarget.pdf
