// Scoring methods. To add one, add an entry; the settings menu, method card and export pick it up.
// Every method implements the same interface:
//   id, name, badge, summary          what it is
//   uses[]                            which readings it reads
//   how                               how readings become a sens
//   why, caveat, refs[]               reasoning and sources
//   search: 'bracket' | 'adaptive'    test a fixed spread, or step toward a target
//   trialEnd: 'firstClick' | 'hit'   does a miss end the target?
//   option                            label in the settings menu
//   bracket methods:  score(trials, { excludeRT }) -> number (higher = better), fmt(score) -> label
//   adaptive methods: next(sens, reach, limit), final(rounds, limit)
//                     (limit(sens) keeps a sens inside the allowed range and rounds it)
import { mean, median, sd } from '../core/stats.js';
import { TOL } from '../config.js';

const scored = trials => trials.filter(t => !t.warmup && !t.timeout && t.mt >= 100 && Math.abs(t.dx) < t.D);
const timeoutPenalty = trials => { const nw = trials.filter(t => !t.warmup); return nw.length ? 1 - nw.filter(t => t.timeout).length / nw.length : 1; };
// Movement time. With "exclude reaction time" on, time starts when your hand starts moving
// (Fitts' law describes movement, not reaction). A reaction under 100 ms means the hand was still
// moving from the previous target, so the block's median reaction is used instead.
export function moveTime(trials, excludeRT) {
  if (!excludeRT) return t => t.mt;
  const rts = trials.filter(t => !t.warmup && t.rt !== null && t.rt >= 100).map(t => t.rt);
  const med = rts.length ? median(rts) : 0;
  return t => Math.max(100, t.mt - (t.rt !== null && t.rt >= 100 ? t.rt : med));
}

export const METHODS = {
  throughput: {
    id: 'throughput', option: 'Fitts throughput (recommended)', name: 'Fitts throughput', badge: 'Recommended', badgeClass: '',
    search: 'bracket', trialEnd: 'firstClick',
    summary: 'Tests five sens values in shuffled blocks and picks the one where your speed and accuracy combine best.',
    uses: ['Distance from crosshair to target when it appears', 'Time until your first click', 'Where the first click landed along the line to the target (past or short)', 'Timeouts (reduce the score)'],
    how: 'Per block, effective width We = 4.133 × SD of click overshoot. Throughput = mean of log2(distance ÷ We + 1) ÷ time, in bits/s (ISO 9241-9). A parabola through throughput vs log(sens) gives the peak.',
    why: 'Throughput can’t be gamed by playing slow and careful or fast and sloppy: both speed and the spread of your clicks count. It is the standard measure for comparing pointing devices and gain settings.',
    caveat: 'Your hand favors the sens it already knows, so the first test can lean toward your old setting. Shuffled order and 2 warm-up targets per block reduce this. Rerun after a week at the new sens.',
    refs: [
      { label: 'MacKenzie: Fitts’ law and the ISO 9241-9 throughput method', url: 'https://www.yorku.ca/mack/UCLAN2018/FittsLaw.pdf' },
      { label: 'Casiez et al. 2008: control-display gain and pointing performance', url: 'https://www.gwern.net/doc/design/2008-casiez.pdf' }
    ],
    score(trials, { excludeRT = false } = {}) {
      const T = scored(trials); if (T.length < 4) return NaN;
      const We = Math.max(0.1, 4.133 * sd(T.map(t => t.dx))), mt = moveTime(trials, excludeRT);
      return mean(T.map(t => Math.log2(Math.max(0.1, t.D + t.dx) / We + 1) / (mt(t) / 1000))) * timeoutPenalty(trials);
    },
    fmt: v => `${v.toFixed(2)} bit/s`, axis: 'THROUGHPUT (BITS/S, HIGHER IS BETTER)'
  },
  precision: {
    id: 'precision', option: 'Precision-first', name: 'Precision-first', badge: 'Control', badgeClass: 'alt',
    search: 'bracket', trialEnd: 'firstClick',
    summary: 'Tests five sens values and picks the one where your first click lands on target most often and most consistently. Speed isn’t scored.',
    uses: ['Whether your first click hit the target', 'Spread of click overshoot relative to target distance', 'Timeouts (reduce the score)'],
    how: 'Per block: score = first-click hit rate ÷ (1 + 4.133 × SD of overshoot ÷ distance). A parabola through score vs log(sens) gives the peak.',
    why: 'Useful if you keep missing your first shot. It usually lands a little slower than throughput, because slower sens reduces endpoint scatter.',
    caveat: 'Ignores speed, so it can favor a sens that is accurate but too slow to turn quickly. Check the ergonomic range.',
    refs: [{ label: 'Casiez et al. 2008: control-display gain and pointing performance', url: 'https://www.gwern.net/doc/design/2008-casiez.pdf' }],
    score(trials) {
      const T = scored(trials); if (T.length < 4) return NaN;
      const hit = mean(T.map(t => t.hit ? 1 : 0)), rel = sd(T.map(t => t.dx / t.D));
      return hit / (1 + 4.133 * rel) * timeoutPenalty(trials);
    },
    fmt: v => v.toFixed(3), axis: 'ACCURACY SCORE (HIGHER IS BETTER)'
  },
  reach: {
    id: 'reach', option: 'Reach matching (legacy)', name: 'Reach matching', badge: 'Legacy', badgeClass: 'legacy',
    search: 'adaptive', trialEnd: 'hit', targetReach: 0.93,
    summary: 'Adjusts sens after each round until your first fast movement stops at about 93% of the way to the target.',
    uses: ['Where your first fast movement stopped, as a fraction of target distance', 'Nothing about speed or hit rate'],
    how: 'Median reach per round. Next sens = sens × (0.93 ÷ reach)^0.85, at most ±15% per round, kept inside the ergonomic range. Stops when two rounds land within 6% of 0.93.',
    why: 'Aiming research finds that first movements normally stop short, around 90–95% of the distance, because undershooting is cheaper to correct than overshooting. The earlier version aimed for 100%, which is why it kept raising your sens.',
    caveat: 'Your hand adapts to whatever sens you test, so reach drifts back to its usual undershoot and this method can chase its own tail. Use it as a diagnostic, not as your answer.',
    refs: [
      { label: 'Roberts et al. 2020: energy minimization and undershooting in aiming', url: 'https://ljmu-9.eprints-hosting.org/id/eprint/12204/11/Roberts2020_Article_EnergyMinimizationWithinTarget.pdf' },
      { label: 'Experimental Brain Research 2024: primary-submovement undershoot review', url: 'https://link.springer.com/10.1007/s00221-024-06784-0' }
    ],
    next(sens, reach, limit) {
      const g = Math.min(1.7, Math.max(0.6, reach)) / this.targetReach;
      const step = Math.min(1.15, Math.max(1 / 1.15, Math.pow(g, -0.85)));
      return limit(sens * step);
    },
    final(rounds, limit) {
      const R = rounds.map(r => ({ sens: r.sens, reach: r.reach / this.targetReach }));
      const n = R.length, ok = r => Math.abs(r.reach - 1) <= TOL;
      let s;
      if (n >= 2 && ok(R[n - 1]) && ok(R[n - 2])) s = Math.sqrt(R[n - 1].sens / Math.pow(R[n - 1].reach, 0.85) * R[n - 2].sens / Math.pow(R[n - 2].reach, 0.85));
      else s = R[n - 1].sens / Math.pow(Math.min(1.7, Math.max(0.6, R[n - 1].reach)), 0.85);
      return limit(s);
    },
    fmt: v => `${Math.round(v * 100)}%`
  }
};
// Tracking isn't a selectable method: it is always scored by time on target.
export const TRACK_METHOD = { id: 'track', fmt: v => `${Math.round(v * 100)}% on target`, axis: 'TIME ON TARGET (HIGHER IS BETTER)' };
export const methodFor = id => METHODS[id] || TRACK_METHOD;
export const DEFAULT_METHOD = 'throughput';
