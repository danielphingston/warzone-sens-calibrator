// Curve fit: log(score) vs log(sens). Pure.
//
// Performance falls off in proportion as sens moves away from your best, and block noise is roughly
// proportional too, so the quadratic is fitted to log(score); a plain parabola gets dragged toward
// the edge when one side falls off faster than the other.
import { mean, r3, seeded } from './stats.js';
import { lsq, quadAt, peakOnRange } from './linalg.js';

export const lscore = v => Math.log(Math.max(v, 1e-3));

// Least-squares quadratic through every block score. The best sens is where the fitted curve
// is highest inside the tested range (an end of the range if it keeps rising), so the number
// always matches the curve. A bootstrap over blocks gives an 80% likely range. The result is
// "flat" when the curve rises less than block-to-block noise, or the likely range covers most
// of what was tested; flat drills count for less in the overall blend.
let FLAT_K = 1.5;                           // flat when the curve rises less than this many noise SDs
export const setFlatK = k => { FLAT_K = k; };

// records: [{ sens, score, order? }]
// trend: also fit a straight line in run order. Scores often climb through a run as you warm up
// (or sag with fatigue); the term soaks that up so it isn't read as a sens effect. Only used for the
// fixed bracket, where run order is spread evenly over the sens values; Bayesian runs test later
// blocks near the peak, so order and sens are tangled there.
// round: rounds a sens to what the game's sens field accepts.
export function fitBest(records, { trend = false, round = v => v } = {}) {
  const rs = round;
  const R = records.filter(r => isFinite(r.score));
  const by = {};
  R.forEach(r => { (by[r.sens] = by[r.sens] || []).push(r.score); });
  const pts = Object.keys(by).map(k => ({ sens: +k, score: mean(by[k]), n: by[k].length })).sort((a, b) => a.sens - b.sens);
  if (!pts.length) return { sens: NaN, edge: false, flat: true, points: [], curve: null };
  const top = pts.reduce((m, p) => p.score > m.score ? p : m, pts[0]);
  const fallback = { sens: rs(top.sens), lo: rs(pts[0].sens), hi: rs(pts[pts.length - 1].sens), edge: false, flat: true, points: pts, curve: null };
  if (pts.length < 3) return fallback;
  const xm = mean(R.map(r => Math.log(r.sens)));
  const X = R.map(r => Math.log(r.sens) - xm), Y = R.map(r => lscore(r.score));
  const useTrend = trend && R.length >= 7 && R.every(r => isFinite(r.order));
  const om = useTrend ? mean(R.map(r => r.order)) : 0, O = R.map(r => useTrend ? r.order - om : 0);
  const x0 = Math.log(pts[0].sens) - xm, x1 = Math.log(pts[pts.length - 1].sens) - xm, span = x1 - x0;
  const fitOn = idx => {
    if (new Set(idx.map(i => X[i])).size < 3) return null;   // a parabola needs 3 distinct sens values
    const s = lsq(idx.map(i => useTrend ? [1, X[i], X[i] * X[i], O[i]] : [1, X[i], X[i] * X[i]]), idx.map(i => Y[i]));
    return s && { a: s[0], b: s[1], c: s[2], d: useTrend ? s[3] : 0 };
  };
  const q = fitOn(R.map((_, i) => i));
  if (!q) return fallback;
  const bx = peakOnRange(q, x0, x1);
  const rnd = seeded(R.length * 7919 + Math.round(mean(R.map(r => r.score)) * 1e4));
  const boots = [];
  for (let k = 0; k < 300; k++) {
    const qb = fitOn(R.map(() => Math.floor(rnd() * R.length)));
    if (qb) boots.push(peakOnRange(qb, x0, x1));
  }
  boots.sort((a, b) => a - b);
  const lo = boots.length ? boots[Math.floor(boots.length * 0.1)] : x0, hi = boots.length ? boots[Math.floor(boots.length * 0.9)] : x1;
  const noise = Math.sqrt(X.reduce((a, x, i) => a + (Y[i] - quadAt(q, x) - q.d * O[i]) ** 2, 0) / Math.max(1, R.length - (useTrend ? 4 : 3)));
  const vals = Array.from({ length: 21 }, (_, i) => quadAt(q, x0 + span * i / 20));
  const rise = Math.max(...vals) - Math.min(...vals);
  // A curve that bends upward with its low point inside the range says the middle is worst. That isn't
  // a preference for either end, just noise, so it counts as flat.
  const vx = q.c > 0 ? -q.b / (2 * q.c) : NaN;
  const ushape = vx > x0 + 0.15 * span && vx < x1 - 0.15 * span;
  const flat = rise < FLAT_K * noise || hi - lo > 0.75 * span || ushape;
  const edge = !flat && (bx - x0 < 0.03 * span || x1 - bx < 0.03 * span);
  // On a flat curve the highest point is an arbitrary end of the range, so the result is the average
  // (in log sens) of where the resampled curves peak instead.
  const best = flat && boots.length ? mean(boots) : bx;
  return { sens: rs(Math.exp(best + xm)), peakSens: rs(Math.exp(bx + xm)), lo: rs(Math.exp(lo + xm)), hi: rs(Math.exp(hi + xm)), edge, flat, noise: r3(noise), rise: r3(rise),
    trendPerBlock: useTrend ? r3(q.d) : undefined, points: pts, curve: { a: q.a, b: q.b, c: q.c, xm, log: true } };
}
