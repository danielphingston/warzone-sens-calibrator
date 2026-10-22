# Warzone Sens Calibrator

A browser tool that finds your Call of Duty: Warzone mouse sensitivity from how you actually aim.

**Live:** https://danielphingston.github.io/warzone-sens-calibrator/

## Drills

- **Flick reach** – snap to targets 20–90° away. Measures where your first fast movement stops (past or short of the target) and adjusts sens each round until two rounds land within 6%. A replay shows the target, your path and where the flick stopped.
- **Tracking** – keep the crosshair on a target that strafes and changes direction. Tests five sens values (two shuffled blocks each) and fits a curve to time-on-target to find your best.
- **Micro-adjust** – small, close targets. Same five-value test, scored by targets per minute with a miss penalty.
- **Full test** – runs all three and blends them: tracking 45%, flick 35%, micro 20%.

Uses Warzone's sensitivity scale (0.0066° per count at sens 1), so results go straight into the game at the same DPI. Includes a 10 cm ruler check to confirm the browser reads your DPI correctly.

Works best in Chrome or Edge on desktop, fullscreen, with Windows pointer speed at 6/11 and Enhance pointer precision off.
