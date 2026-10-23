// Unit tests for the DOM-free modules. Run with: npm test  (or: node --test tests/*.test.js)
import test from 'node:test';
import assert from 'node:assert/strict';
import { mean, median, sd, seeded, shuffle } from '../src/core/stats.js';
import { lsq, quadFit } from '../src/core/linalg.js';
import { fitBest } from '../src/core/fit.js';
import { bracketPlan, bracketValues, bayesPosterior, SEARCHES } from '../src/core/search.js';
import { cm360, sensAtCm, recBounds, testBounds, jitterDeg } from '../src/core/units.js';
import { analyzeTrial, yawScale } from '../src/core/analysis.js';
import { blend } from '../src/core/blend.js';
import { angleBetween } from '../src/core/geometry.js';
import { METHODS, moveTime } from '../src/registry/methods.js';
import { DRILLS, DRILL_IDS, FULL_TEST } from '../src/registry/drills.js';
import { GAMES } from '../src/registry/games.js';

const near = (a, b, tol, msg) => assert.ok(Math.abs(a - b) <= tol, `${msg || ''} expected ${b} ± ${tol}, got ${a}`);
const r2 = v => Math.round(v * 100) / 100;

test('stats', () => {
  assert.equal(mean([1, 2, 3, 6]), 3);
  assert.equal(median([5, 1, 3]), 3);
  assert.equal(median([4, 1, 3, 2]), 2.5);
  near(sd([2, 4, 4, 4, 5, 5, 7, 9]), 2, 1e-12);
  const a = seeded(7), b = seeded(7);
  assert.deepEqual([a(), a(), a()], [b(), b(), b()]);
  assert.deepEqual(shuffle([1, 2, 3, 4, 5], seeded(1)).sort(), [1, 2, 3, 4, 5]);
});

test('lsq matches the 3x3 quadratic solver', () => {
  const rnd = seeded(3), X = Array.from({ length: 12 }, () => rnd() * 2 - 1), Y = X.map(x => 1 + 2 * x - 3 * x * x + (rnd() - 0.5) * 0.1);
  const q = quadFit(X, Y), s = lsq(X.map(x => [1, x, x * x]), Y);
  near(s[0], q.a, 1e-9); near(s[1], q.b, 1e-9); near(s[2], q.c, 1e-9);
  assert.equal(lsq([[1, 1], [2, 2]], [1, 2]), null, 'singular system');
});

test('units: cm/360 and sens convert both ways', () => {
  near(cm360(4, 0.0066, 5200), 6.66, 0.01);
  near(sensAtCm(cm360(1.61, 0.0066, 5200), 0.0066, 5200), 1.61, 1e-12);
  const b = recBounds({ yaw: 0.0066, dpi: 5200, padCm: 45, fastCm: 12 });
  near(cm360(b.hi, 0.0066, 5200), 12, 1e-9); near(cm360(b.lo, 0.0066, 5200), 72, 1e-9);
  const open = testBounds({ yaw: 0.0066, dpi: 5200, padCm: 45, fastCm: 12, enforce: false });
  near(cm360(open.hi, 0.0066, 5200), 2, 1e-9);
  near(jitterDeg(12), 0.3, 1e-12);
});

// Synthetic blocks: ln(score) = -k·(ln s − ln peak)² + drift·order + noise.
const blocks = ({ peak = 2, k = 0.7, noise = 0, drift = 0, seed = 1, center = 2 } = {}) => {
  const rnd = seeded(seed), g = () => Math.sqrt(-2 * Math.log(1 - rnd())) * Math.cos(2 * Math.PI * rnd());
  const values = bracketValues(center, { lo: 0.1, hi: 100 }, r2);
  return bracketPlan(values, 2, rnd).map((sens, order) => ({ sens, order, score: Math.exp(-k * (Math.log(sens / peak)) ** 2 + drift * order + noise * g()) }));
};

test('fitBest finds a clear peak', () => {
  const f = fitBest(blocks({ peak: 1.7 }), { round: r2 });
  near(f.sens, 1.7, 0.03); assert.equal(f.flat, false); assert.equal(f.edge, false);
  assert.ok(f.lo <= f.sens && f.sens <= f.hi);
});

test('fitBest flags a flat curve and reports a sens inside the range, not an arbitrary end', () => {
  const f = fitBest(blocks({ k: 0, noise: 0.2, seed: 5 }), { round: r2 });
  assert.equal(f.flat, true);
  assert.ok(f.sens > f.points[0].sens && f.sens < f.points[f.points.length - 1].sens, `got ${f.sens}`);
});

test('fitBest treats a U-shaped curve as flat', () => {
  const f = fitBest(blocks({ k: -0.8 }), { round: r2 });
  assert.equal(f.flat, true);
});

test('fitBest flags a peak beyond the tested range as an edge', () => {
  const f = fitBest(blocks({ peak: 8 }), { round: r2 });
  assert.equal(f.edge, true); assert.equal(f.sens, f.points[f.points.length - 1].sens);
});

test('trend term removes steady learning across the run', () => {
  const B = blocks({ peak: 1.6, drift: 0.04 });
  const f = fitBest(B, { trend: true, round: r2 });
  near(f.trendPerBlock, 0.04, 0.005); near(f.sens, 1.6, 0.03);
});

test('bracket plan: mirrored reps give every sens the same average position', () => {
  const plan = bracketPlan([1, 2, 3, 4, 5], 2, seeded(9));
  assert.equal(plan.length, 10);
  for (const s of [1, 2, 3, 4, 5]) { const pos = plan.flatMap((v, i) => v === s ? [i] : []); assert.equal(pos.length, 2); assert.equal(pos[0] + pos[1], 9); }
});

test('bracket values stay inside the bounds', () => {
  const v = bracketValues(4, { lo: 0.37, hi: 2.22 }, r2);
  assert.equal(Math.max(...v), 2.22); assert.ok(Math.min(...v) >= 0.37); assert.equal(v.length, 5);
});

test('bayes posterior proposes a next sens inside the bounds', () => {
  const B = blocks({ peak: 1.8 }).slice(0, 6), b = { lo: 0.5, hi: 4 };
  const post = bayesPosterior({ records: B, center: 2 }, b, r2);
  assert.ok(post.next >= b.lo && post.next <= b.hi); assert.ok(post.lo <= post.hi); assert.ok(post.width > 0);
  const n = SEARCHES.bayes.next({ records: B, center: 2, posterior: undefined }, { bounds: b, round: r2 });
  assert.ok(n.posterior && n.posterior.width > 0);
});

test('analyzeTrial measures where the first movement stopped, at any pitch', () => {
  for (const pitch of [0, 20]) {
    const tr = { t0: 0, y0: 0, p0: pitch, ty: 50, tp: pitch + 5, samples: [] };
    for (let t = 0; t <= 600; t += 2) { const u = Math.min(1, Math.max(0, (t - 150) / 300)), m = 10 * u ** 3 - 15 * u ** 4 + 6 * u ** 5; tr.samples.push({ t, yaw: 50 * 0.9 * m, pitch: pitch + 5 * 0.9 * m }); }
    const a = analyzeTrial(tr, 600);
    assert.equal(a.valid, true); near(a.reach, 0.9, 0.01, `pitch ${pitch}`); near(a.rt, 176, 8); assert.equal(a.corrections, 0);
  }
  near(yawScale({ p0: 60, tp: 60 }), 0.5, 1e-12);
});

test('angles: a degree of yaw is cos(pitch) of a degree of view', () => {
  near(angleBetween(0, 0, 10, 0), 10, 1e-9);
  near(angleBetween(0, 60, 1, 60), 0.5, 1e-3);
});

test('blend: log-scale weighted mean, flat drills at a quarter weight, DPI converted', () => {
  const o = blend({ a: { sens: 1, dpi: 800 }, b: { sens: 4, dpi: 800 } }, { weights: { a: 0.5, b: 0.5 }, dpi: 800 });
  near(o.sens, 2, 1e-12);
  const f = blend({ a: { sens: 1, dpi: 800 }, b: { sens: 4, dpi: 800, flat: true } }, { weights: { a: 0.5, b: 0.5 }, dpi: 800 });
  near(f.parts.find(p => p.k === 'b').share, 0.2, 1e-12);
  const d = blend({ a: { sens: 2, dpi: 1600 } }, { weights: { a: 1 }, dpi: 800 });
  near(d.sens, 4, 1e-12, 'same cm/360 at half the DPI needs twice the sens');
  assert.equal(blend({}, { weights: { a: 1 }, dpi: 800 }), null);
});

test('scoring methods', () => {
  const trials = [0, 1, 2, 3, 4, 5].map(i => ({ warmup: i < 2, timeout: false, mt: 500, rt: 200, D: 40, dx: [0, 0, -1, 1, -1, 1][i], hit: i !== 5 }));
  const tp = METHODS.throughput.score(trials);
  near(tp, Math.log2(40 / (4.133 * 1) + 1) / 0.5, 0.15);
  assert.ok(METHODS.throughput.score(trials, { excludeRT: true }) > tp, 'movement-only time is shorter');
  near(METHODS.precision.score(trials), 0.75 / (1 + 4.133 * (1 / 40)), 1e-9);
  assert.equal(moveTime(trials, false)(trials[0]), 500);
  const limit = s => Math.min(3, Math.max(0.5, Math.round(s * 100) / 100));
  assert.ok(METHODS.reach.next(1, 0.7, limit) > 1, 'undershoot raises sens');
  assert.ok(METHODS.reach.next(1, 1.2, limit) < 1, 'overshoot lowers sens');
});

test('registries are consistent', () => {
  for (const k of DRILL_IDS) {
    const D = DRILLS[k];
    assert.ok(['targets', 'tracking'].includes(D.kind), k);
    assert.ok(D.minutes.bracket && D.radius > 0, k);
    if (D.kind === 'targets') { assert.equal(typeof D.spawn, 'function', k); assert.ok(D.timeout > 0, k); }
  }
  assert.ok(FULL_TEST.length > 0);
  for (const g of Object.values(GAMES)) {
    near(Object.values(g.weights).reduce((a, w) => a + w, 0), 1, 1e-9, `${g.id} weights`);
    for (const k of Object.keys(g.weights)) assert.ok(DRILLS[k], `${g.id} weights unknown drill ${k}`);
  }
  for (const m of Object.values(METHODS)) assert.ok(m.search === 'bracket' ? typeof m.score === 'function' : typeof m.next === 'function', m.id);
});

test('drill spawns land at the advertised distances', () => {
  const cam = { yaw: 0, pitch: 0 };
  for (let i = 0; i < 500; i++) {
    const f = DRILLS.flick.spawn(cam); assert.ok(Math.abs(f.ty) >= 20 && Math.abs(f.ty) <= 90 && Math.abs(f.tp) <= 22);
    const m = DRILLS.micro.spawn(cam), d = Math.hypot(m.ty, m.tp); assert.ok(d >= 3 - 1e-9 && d <= 12 + 1e-9);
  }
});
