// Drills. To add one, add an entry: the Test picker, full test, engine, results cards, blend
// (once a game gives it a weight in registry/games.js) and export all read from here.
//
//   kind        'targets'  click targets one at a time, scored with the selected method
//               'tracking' follow a strafing target, scored by time on target
//   name, intro, hint      labels: Test picker and HUD, start panel, empty results card
//   inFullTest  part of "Full test" (run in the order listed here)
//   minutes     rough duration per search strategy, [low, high]
//   radius      target radius in degrees
//   targets drills only:
//     timeout   ms before an unclicked target counts as timed out
//     spawn(cam) -> { ty, tp }   where the next target appears (yaw/pitch in degrees)
//     distance  description of spawn distances, for the export
//     replay    after each target, show where the first fast movement stopped
//     adaptive  can run adaptive methods (reach matching), which need long flicks
//   example     scores for the five sample sens values shown before your first run (and lag, for tracking)

export const DRILLS = {
  flick: {
    id: 'flick', kind: 'targets', name: 'Flicks', inFullTest: true,
    intro: 'Snap to each target in one quick motion and click.',
    hint: 'Five sens values, scored with the selected method.',
    minutes: { bracket: [3, 3], bayes: [2, 2] },
    radius: 2.2, timeout: 6000, replay: true, adaptive: true,
    distance: '20 to 90, random direction (mostly horizontal)',
    spawn(cam) {
      const mag = 20 + Math.random() * 70, sign = Math.random() < 0.5 ? -1 : 1;
      return { ty: cam.yaw + sign * mag, tp: Math.min(22, Math.max(-22, cam.pitch + (Math.random() * 24 - 12))) };
    },
    example: { scores: [3.1, 3.6, 3.8, 3.5, 3.0] }
  },
  track: {
    id: 'track', kind: 'tracking', name: 'Tracking', inFullTest: true,
    intro: 'Keep the crosshair on the strafing target. No clicking.',
    hint: 'Five sens values, scored by time on a strafing target.',
    minutes: { bracket: [2.5, 2.5], bayes: [1.5, 2] },
    radius: 2.5,
    example: { scores: [0.49, 0.57, 0.61, 0.58, 0.47], lag: 0.6 }
  },
  micro: {
    id: 'micro', kind: 'targets', name: 'Micro-adjust', inFullTest: true,
    intro: 'Small, close targets. Click each one as fast as you can.',
    hint: 'Five sens values, scored with the selected method.',
    minutes: { bracket: [2.5, 2.5], bayes: [1.5, 2] },
    radius: 1.1, timeout: 4000,
    distance: '3 to 12, any direction',
    spawn(cam) {
      // Flip the vertical direction instead of capping height, so the target is always 3–12° away.
      const ang = Math.random() * Math.PI * 2, mag = 3 + Math.random() * 9;
      let dp = Math.sin(ang) * mag;
      if (Math.abs(cam.pitch + dp) > 40 && Math.abs(cam.pitch - dp) < Math.abs(cam.pitch + dp)) dp = -dp;
      return { ty: cam.yaw + Math.cos(ang) * mag, tp: cam.pitch + dp };
    },
    example: { scores: [2.6, 2.9, 2.95, 2.7, 2.3] }
  }
};
export const DRILL_IDS = Object.keys(DRILLS);
export const FULL_TEST = DRILL_IDS.filter(k => DRILLS[k].inFullTest);
