// Sens ↔ cm/360 conversions and the ergonomic range. Pure: the game's turn rate (yaw, degrees per
// count at sens 1) and the mouse DPI are passed in.
import { JITTER_MM } from '../config.js';

export const cm360 = (sens, yaw, dpi) => 360 / (yaw * sens * dpi) * 2.54;
export const sensAtCm = (cm, yaw, dpi) => 360 * 2.54 / (yaw * dpi * cm);
// How far ~0.1 mm of hand jitter turns your aim at a given cm/360.
export const jitterDeg = cm => JITTER_MM / (cm * 10) * 360;

// Recommended range: slow enough that a 180° turn fits in 80% of the pad width, no faster than fastCm.
export function recBounds({ yaw, dpi, padCm, fastCm }) {
  const slowCm = Math.max(fastCm + 4, padCm * 1.6);
  return { lo: sensAtCm(slowCm, yaw, dpi), hi: sensAtCm(fastCm, yaw, dpi), slowCm, fastCm };
}
// Limits that apply to tests and results: the recommended range when enforced, otherwise 2–200 cm/360.
export function testBounds(o) {
  return o.enforce ? recBounds(o) : { lo: sensAtCm(200, o.yaw, o.dpi), hi: sensAtCm(2, o.yaw, o.dpi), slowCm: 200, fastCm: 2, open: true };
}
export const clamp = (s, b) => Math.min(b.hi, Math.max(b.lo, s));
