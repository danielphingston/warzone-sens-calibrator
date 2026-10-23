// Tracking target motion. A strafing player 10–20 m away moves roughly 10–30°/s across your view.
// Direction changes are spaced well beyond visual reaction time (~200–250 ms), and the first
// REACT_MS after each reversal isn't scored, so the score reflects sens rather than reaction speed.
// To add a preset, add an entry; the settings menu lists them all.
//   vmin/vmax  speed range in deg/s     tmin/tmax  ms between changes of speed/direction
//   acc        acceleration in deg/s²

export const TRACK_PRESETS = {
  calm: { name: 'Calm', vmin: 6, vmax: 18, tmin: 800, tmax: 1800, acc: 100 },
  real: { name: 'Realistic', vmin: 8, vmax: 28, tmin: 600, tmax: 1500, acc: 140 },
  hard: { name: 'Hard', vmin: 12, vmax: 40, tmin: 350, tmax: 1000, acc: 250 }
};
export const DEFAULT_PRESET = 'real';
