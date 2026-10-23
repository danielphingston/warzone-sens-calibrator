// Search strategies: which sens values to test, in which order. Pure.
//
// A strategy has:
//   id, name, option, chip, info        labels: settings menu, status chip, method card
//   trend                               fit a run-order term (only when order is spread evenly over sens)
//   blockLabel(drill, sep)              "3 of 10" progress label
//   plan({ center, bounds, round, rnd }) -> initial list of sens values to test
//   next(drill, { bounds, round }) -> { sens, posterior } to queue another block, or { posterior } to stop
//                                     (optional; strategies without it just run their plan)
import { BRACKET, REPS } from '../config.js';
import { mean, gauss, shuffle } from './stats.js';
import { solve3, inv3, chol3, normalEq, quadFit, quadAt, peakOnRange } from './linalg.js';
import { lscore } from './fit.js';

// Fixed bracket. Every other rep runs in reverse (A B C D E, E D C B A), so each sens sits at the same
// average position in the run and steady practice or fatigue can't favor one end of the bracket.
export function bracketPlan(values, reps = REPS, rnd = Math.random) {
  const base = shuffle([...values], rnd), blocks = [];
  for (let r = 0; r < reps; r++) blocks.push(...(r % 2 ? [...base].reverse() : base));
  return blocks;
}

// Five values spread around the center, shifted as a whole to fit inside the bounds.
export function bracketValues(center, b, round) {
  let v = BRACKET.map(m => center * m);
  const mx = Math.max(...v), mn = Math.min(...v);
  if (mx > b.hi) v = v.map(x => x * b.hi / mx);
  else if (mn < b.lo) v = v.map(x => x * b.lo / mn);
  return [...new Set(v.map(x => round(Math.min(b.hi, Math.max(b.lo, x)))))];
}

// ---- Bayesian adaptive search ----
// The same quadratic model with a weak prior that expects a peak somewhere, refit after every block.
// The next sens is chosen by Thompson sampling: draw one plausible curve from the posterior and test
// where it peaks. Blocks pile up near the likely best value instead of being spread evenly, and the
// drill stops once 80% of plausible peaks sit within about ±12%, usually after 6–8 blocks instead of 10.
export const BAYES = { init: [0.7, 1, 1.4], min: 5, max: 12, width: 0.24, grid: 17 };

// d: { records: [{ sens, score }], center }; b: { lo, hi } sens bounds.
export function bayesPosterior(d, b, round = v => v) {
  const rs = round, clamp = s => Math.min(b.hi, Math.max(b.lo, s));
  const R = d.records.filter(r => isFinite(r.score));
  const xc = Math.log(d.center);
  const x0 = Math.log(Math.max(b.lo, d.center * 0.5)) - xc, x1 = Math.log(Math.min(b.hi, d.center * 2)) - xc;
  const X = R.map(r => Math.log(r.sens) - xc), Y = R.map(r => lscore(r.score));
  let s2 = 0.08 ** 2;                                          // prior guess: blocks vary about 8%
  if (R.length >= 5) {
    const q = quadFit(X, Y);
    if (q) { const rv = X.reduce((a, x, i) => a + (Y[i] - quadAt(q, x)) ** 2, 0) / (R.length - 3); s2 = (3 * s2 + (R.length - 3) * rv) / R.length; }
  }
  // Weak prior in log-score units: level from the data, no slope, and a gentle hump (most players have a best sens).
  const P = [1, 1, 1], m = [mean(Y) || 0, 0, -0.5];
  const { A, v } = normalEq(X, Y, s2, P, m);
  const mu = solve3(A, v), cov = inv3(A);
  if (!mu || !cov) return null;
  const L = chol3(cov);
  const draw = () => { const z = [gauss(), gauss(), gauss()]; const t = [0, 1, 2].map(i => mu[i] + L[i][0] * z[0] + L[i][1] * z[1] + L[i][2] * z[2]); return { a: t[0], b: t[1], c: t[2] }; };
  const peaks = Array.from({ length: 300 }, () => peakOnRange(draw(), x0, x1)).sort((a, b2) => a - b2);
  const p10 = peaks[30], p90 = peaks[269];
  const snap = x => x0 + Math.round((x - x0) / (x1 - x0) * (BAYES.grid - 1)) / (BAYES.grid - 1) * (x1 - x0);
  return {
    width: p90 - p10, lo: rs(Math.exp(p10 + xc)), hi: rs(Math.exp(p90 + xc)),
    next: rs(clamp(Math.exp(snap(peakOnRange(draw(), x0, x1)) + xc)))
  };
}

export const SEARCHES = {
  bracket: {
    id: 'bracket', name: 'Fixed bracket', option: 'Fixed bracket · 10 blocks', chip: 'fixed bracket', trend: true,
    info: 'Five sens values spread around the center (×0.62 to ×1.6), each tested twice: a shuffled order, then the same order in reverse, so warming up during the run helps every value equally. 10 blocks. Slower, but gives even coverage and a clean picture of the whole curve.',
    plan: ({ center, bounds, round, rnd }) => bracketPlan(bracketValues(center, bounds, round), REPS, rnd),
    blockLabel: (d, sep) => `${Math.min(d.bi + 1, d.blocks.length)}${sep}${d.blocks.length}`
  },
  bayes: {
    id: 'bayes', name: 'Bayesian adaptive', option: 'Bayesian adaptive · faster', chip: 'Bayesian search', trend: false,
    info: `Starts with 3 blocks (center sens ×0.7, ×1, ×1.4). After each block it refits the curve and picks the next sens by Thompson sampling: draw one plausible curve from what it has learned so far and test where that curve peaks. Testing concentrates near your likely best value, and the drill stops once 80% of plausible peaks fall within about ±12% (at least ${BAYES.min} blocks, at most ${BAYES.max}). Usually 6–8 blocks instead of 10.`,
    plan: ({ center, bounds, round, rnd }) => shuffle([...new Set(BAYES.init.map(m => round(Math.min(bounds.hi, Math.max(bounds.lo, center * m)))))], rnd),
    // Called once the planned blocks are used up: queue one more, or stop when confident.
    next(d, { bounds, round }) {
      const post = bayesPosterior(d, bounds, round);
      const posterior = post ? { width: Math.round(post.width * 1000) / 1000, lo: post.lo, hi: post.hi } : d.posterior;
      const confident = post && d.records.length >= BAYES.min && post.width <= BAYES.width;
      return { posterior, sens: post && !confident && d.records.length < BAYES.max ? post.next : undefined };
    },
    blockLabel: (d, sep) => `${Math.min(d.bi + 1, BAYES.max)}${sep}up to ${BAYES.max}`
  }
};
