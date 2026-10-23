// The drill engine: runs a test or practice session, block by block and target by target, and turns
// what happened into scored records and results. It doesn't touch the page; it reports through the
// event bus (app/events.js) and the shared state (app/state.js).
import { WARMUP, MAX_ROUNDS, TOL, TRACK_MS, SETTLE_MS, REACT_MS } from '../config.js';
import { cfg, app, rs, EPS, fovNow, bounds, clampSens, angTo } from './state.js';
import { persist } from './storage.js';
import { emit } from './events.js';
import { DRILLS, DRILL_IDS, FULL_TEST } from '../registry/drills.js';
import { METHODS, methodFor } from '../registry/methods.js';
import { TRACK_PRESETS, DEFAULT_PRESET } from '../registry/tracking-presets.js';
import { SEARCHES } from '../core/search.js';
import { fitBest } from '../core/fit.js';
import { analyzeTrial, yawScale } from '../core/analysis.js';
import { mean, median, r3 } from '../core/stats.js';

const kindOf = type => DRILLS[type].kind;
const searchOf = d => SEARCHES[d.search] || SEARCHES.bracket;

function makeDrill(type) {
  const tracking = kindOf(type) === 'tracking';
  // Practice: one drill at exactly the Center sens (no limits), endless, nothing saved.
  if (app.session && app.session.practice) return { type, practice: true, method: tracking ? 'track' : 'throughput', sens: rs(cfg.startSens), cur: { trials: [] }, stats: { n: 0, hits: 0, mt: [], reach: [] } };
  const center = rs(clampSens(cfg.startSens));
  if (DRILLS[type].adaptive && METHODS[cfg.method].search === 'adaptive')
    return { type, method: cfg.method, adaptive: true, center, sens: center, rounds: [], cur: { trials: [] }, boundHits: 0 };
  const method = tracking ? 'track' : METHODS[cfg.method].search === 'bracket' ? cfg.method : 'throughput';
  const search = SEARCHES[cfg.search] || SEARCHES.bracket, blocks = search.plan({ center, bounds: bounds(), round: rs });
  return { type, method, search: search.id, center, blocks, bi: 0, records: [], sens: blocks[0], cur: null };
}

// Starts a test (or practice) with the current settings.
export function startSession() {
  const practice = cfg.practice;
  const queue = practice ? [cfg.mode] : cfg.mode === 'full' ? FULL_TEST : [cfg.mode];
  app.session = { queue, step: 0, order: 0, drill: null, practice, startedAt: new Date().toISOString(), t0: performance.now() };
  app.session.drill = makeDrill(queue[0]);
  app.cam = { yaw: 0, pitch: 0 }; app.trial = null; app.trk = null; app.between = null; app.ghost = null; app.flash = null;
  app.state = 'ready';
  emit('session:start');
  emit('results'); emit('overlay');
}
// Drops any running session (e.g. when the game changes or results are cleared).
export function resetSession() {
  app.session = null; app.trial = null; app.trk = null; app.state = 'idle';
}

export function beginDrill() {
  const d = app.session.drill;
  if (d.practice) { if (kindOf(d.type) === 'tracking') startTracking(performance.now()); else { app.state = 'gap'; app.gapUntil = performance.now() + 500; } }
  else if (d.adaptive) { app.state = 'gap'; app.gapUntil = performance.now() + 500; }
  else startBlock();
}
function startBlock() {
  const d = app.session.drill;
  d.sens = d.blocks[d.bi];
  d.cur = { trials: [] };
  app.trial = null; app.trk = null; app.ghost = null;
  app.state = 'countdown'; app.countUntil = performance.now() + 1300;
}
export function resume() {
  if (app.session.drill.practice) beginDrill();
  else if (app.session.drill.adaptive) { app.state = 'gap'; app.gapUntil = performance.now() + 700; }
  else startBlock();                       // an interrupted block restarts from scratch
}

// Advances timers: next target, timeouts, countdowns and the tracking target. Called every frame.
export function tick(now) {
  if (app.state === 'gap' && now >= app.gapUntil) spawn();
  if (app.state === 'trial' && app.trial && now - app.trial.t0 > app.trial.timeout) finishTrial(false, now, false);
  if (app.state === 'countdown' && now >= app.countUntil) {
    if (kindOf(app.session.drill.type) === 'tracking') startTracking(now); else { app.state = 'gap'; app.gapUntil = now; }
  }
  if (app.state === 'tracking' && app.trk) stepTracking(now);
}

// ---- targets ----
function spawn() {
  const t0 = performance.now(), D = DRILLS[app.session.drill.type];
  const { ty, tp } = D.spawn(app.cam);
  app.trial = { t0, y0: app.cam.yaw, p0: app.cam.pitch, ty, tp, r: D.radius, timeout: D.timeout, samples: [{ t: t0, yaw: app.cam.yaw, pitch: app.cam.pitch }], misses: 0 };
  app.state = 'trial';
}
// A click at time t while a target is up. Adaptive methods keep the target up until it's hit.
export function clickTarget(t) {
  const inside = angTo(app.trial.ty, app.trial.tp) <= app.trial.r;
  if (!app.session.drill.adaptive || inside) finishTrial(inside, t, true); else app.trial.misses++;
}

function finishTrial(hit, t, clicked) {
  const d = app.session.drill, tr = app.trial;
  app.trial = null;
  tr.samples.push({ t, yaw: app.cam.yaw, pitch: app.cam.pitch });
  const a = analyzeTrial(tr, t), until = performance.now() + cfg.gap + 150;
  const kx = yawScale(tr), D = Math.hypot((tr.ty - tr.y0) * kx, tr.tp - tr.p0), ux = (tr.ty - tr.y0) * kx / D, uy = (tr.tp - tr.p0) / D;
  const ex = (app.cam.yaw - tr.ty) * kx, ey = app.cam.pitch - tr.tp;
  const rec = {
    i: d.cur.trials.length, D: r3(D), dirDeg: Math.round(Math.atan2(uy, ux) * 180 / Math.PI),
    mt: Math.round(t - tr.t0), hit, timeout: !clicked, misses: tr.misses,
    dx: r3(ex * ux + ey * uy), dy: r3(-ex * uy + ey * ux),
    reach: a.valid ? r3(a.reach) : null, rt: a.valid ? a.rt : null, peak: a.valid ? Math.round(a.peak) : null,
    corrections: a.valid ? a.corrections : null,
    warmup: !d.adaptive && !d.practice && d.cur.trials.length < WARMUP,
    videoT: app.videoT(tr.t0)
  };
  d.cur.trials.push(rec);

  if (DRILLS[d.type].replay) {
    let text = !clicked ? 'Timed out' : '';
    let color = 'muted';
    if (a.valid) {
      const pct = Math.round((a.reach - 1) * 100);
      color = Math.abs(a.reach - 1) <= TOL ? 'good' : a.reach > 1 ? 'over' : 'under';
      text = color === 'good' ? `Flick on target ${pct >= 0 ? '+' : ''}${pct}%` : pct > 0 ? `Flick ${pct}% past` : `Flick ${-pct}% short`;
      app.ghost = { ty: tr.ty, tp: tr.tp, r: tr.r, a, color, until };
    } else app.ghost = null;
    if (clicked && !d.adaptive) text += `${text ? '  ·  ' : ''}${hit ? 'hit' : 'miss'}`;
    if (rec.warmup) text += '  ·  warm-up';
    app.flash = { text: text || (hit ? 'Hit' : 'Miss'), color, until };
  } else {
    app.flash = { text: !clicked ? 'Timed out' : `${hit ? 'Hit' : 'Miss'} · ${rec.mt} ms${rec.warmup ? ' · warm-up' : ''}`, color: hit ? 'fg' : 'over', until };
    app.ghost = null;
  }

  if (d.practice) {
    const st = d.stats; st.n++; if (hit) st.hits++;
    if (clicked) st.mt.push(rec.mt); if (rec.reach !== null) st.reach.push(rec.reach);
    if (st.mt.length > 30) st.mt.shift(); if (st.reach.length > 30) st.reach.shift();
    if (d.cur.trials.length > 200) d.cur.trials.shift();
  } else if (d.adaptive) { if (d.cur.trials.length >= cfg.perBlock) return endRound(); }
  else if (d.cur.trials.length >= cfg.perBlock) return endBlock();
  app.state = 'gap'; app.gapUntil = performance.now() + cfg.gap;
}

// ---- adaptive (reach matching) ----
function endRound() {
  const d = app.session.drill, M = METHODS[d.method], tr = d.cur.trials, b = bounds();
  const limit = s => rs(clampSens(s, b));
  const pool = tr.slice(1).filter(t => t.reach !== null);
  if (pool.length < 3) { app.between = { repeat: true }; d.cur = { trials: [] }; app.state = 'between'; return; }
  const r = { order: app.session.order++, sens: d.sens, reach: median(pool.map(t => t.reach)), mt: Math.round(mean(tr.filter(t => t.hit).map(t => t.mt))), misses: tr.reduce((x, t) => x + t.misses, 0), trials: tr };
  d.rounds.push(r);
  const next = M.next(d.sens, r.reach, limit);
  const atBound = next >= rs(b.hi) - EPS() || next <= rs(b.lo) + EPS();
  d.boundHits = atBound ? d.boundHits + 1 : 0;
  const R = d.rounds, ok = x => Math.abs(x.reach / M.targetReach - 1) <= TOL;
  if ((R.length >= 2 && ok(R[R.length - 1]) && ok(R[R.length - 2])) || R.length >= MAX_ROUNDS || d.boundHits >= 2) {
    d.result = { sens: M.final(R, limit), rounds: R, hitBound: d.boundHits >= 2 };
    return finishDrill();
  }
  app.between = { r, next };
  d.sens = next; d.cur = { trials: [] }; app.state = 'between';
  emit('results');
}

// ---- tracking ----
function startTracking(now) {
  const p0 = Math.max(-20, Math.min(20, app.cam.pitch));
  app.trk = { t0: now, last: now, ty: app.cam.yaw, tp: p0, p0, c: app.cam.yaw, v: 0, vt: 0, next: now + 400, flipAt: -1e9,
          P: TRACK_PRESETS[cfg.trackSpeed] || TRACK_PRESETS[DEFAULT_PRESET], r: DRILLS[app.session.drill.type].radius, on: 0, total: 0, err: 0, lag: 0, lagT: 0 };
  app.state = 'tracking';
}
function stepTracking(now) {
  const T = app.trk, P = T.P, dt = Math.min(0.05, (now - T.last) / 1000); T.last = now;
  // Strafe like a player: pick a new speed and direction every few hundred ms, accelerate into it.
  const setVt = v => { if (Math.sign(v) !== Math.sign(T.vt)) T.flipAt = now; T.vt = v; };
  if (now >= T.next) { setVt((Math.random() < 0.5 ? -1 : 1) * (P.vmin + Math.random() * (P.vmax - P.vmin))); T.next = now + P.tmin + Math.random() * (P.tmax - P.tmin); }
  if (T.ty - T.c > 30 && T.vt > 0) setVt(-T.vt); else if (T.ty - T.c < -30 && T.vt < 0) setVt(-T.vt);
  const maxDv = P.acc * dt; T.v += Math.max(-maxDv, Math.min(maxDv, T.vt - T.v));
  T.ty += T.v * dt;
  const el = (now - T.t0) / 1000;
  T.tp = T.p0 + 4 * Math.sin(el * 0.9) + 1.5 * Math.sin(el * 2.3);
  if (now - T.t0 > SETTLE_MS && (!cfg.excludeRT || now - T.flipAt > REACT_MS)) {
    const e = angTo(T.ty, T.tp);
    T.total += dt; T.err += e * dt; if (e <= T.r) T.on += dt;
    if (Math.abs(T.v) > 5) { T.lag += (T.ty - app.cam.yaw) * Math.sign(T.v) * dt; T.lagT += dt; }   // + = crosshair behind
  }
  if (!app.session.drill.practice && now - T.t0 >= SETTLE_MS + TRACK_MS) endBlock();
}

// ---- blocks ----
const sinceStart = () => Math.round((performance.now() - app.session.t0) / 100) / 10;   // seconds, pauses included
function endBlock() {
  const d = app.session.drill, M = methodFor(d.method), search = searchOf(d);
  let rec;
  if (kindOf(d.type) === 'tracking') {
    const T = app.trk; app.trk = null;
    rec = { order: app.session.order++, t: sinceStart(), videoT: app.videoT(T.t0), sens: d.sens, score: T.total ? T.on / T.total : NaN, meanErrDeg: T.total ? r3(T.err / T.total) : null, lagDeg: T.lagT ? r3(T.lag / T.lagT) : null, scoredMs: Math.round(T.total * 1000) };
  } else {
    const tr = d.cur.trials, nw = tr.filter(t => !t.warmup);
    rec = { order: app.session.order++, t: sinceStart(), sens: d.sens, score: M.score(tr, { excludeRT: cfg.excludeRT }), hitRate: r3(mean(nw.map(t => t.hit ? 1 : 0))), meanMt: Math.round(mean(nw.filter(t => !t.timeout).map(t => t.mt))), trials: tr };
  }
  d.records.push(rec);
  app.flash = { text: isFinite(rec.score) ? `Block: ${M.fmt(rec.score)}` : 'Block: not enough clean targets', color: 'fg', until: performance.now() + 1300 };
  d.bi++;
  // Adaptive searches decide whether to queue another block once the planned ones are used up.
  if (search.next && d.bi >= d.blocks.length) {
    const n = search.next(d, { bounds: bounds(), round: rs });
    d.posterior = n.posterior;
    if (n.sens !== undefined) d.blocks.push(n.sens);
  }
  if (d.bi < d.blocks.length) { startBlock(); emit('results'); }
  else {
    const fit = fitBest(d.records, { trend: search.trend, round: rs }), b = bounds();
    const lag = kindOf(d.type) === 'tracking' ? mean(d.records.map(r => r.lagDeg).filter(x => x !== null)) : undefined;
    d.result = { ...fit, sens: rs(clampSens(fit.sens, b)), fitSens: fit.sens, center: d.center, lag,
      search: search.id, blocksUsed: d.records.length, posterior: d.posterior, excludeRT: cfg.excludeRT };
    finishDrill();
  }
}
export const blockLabel = (d, sep = ' of ') => searchOf(d).blockLabel(d, sep);

function finishDrill() {
  const d = app.session.drill;
  app.saved[d.type] = {
    ...d.result, method: d.method, dpi: cfg.dpi, fov: fovNow(), game: cfg.game, date: new Date().toISOString().slice(0, 10),
    // Settings as they were for this run, since the export's setup section shows today's settings.
    session: { startedAt: app.session.startedAt, centerSens: d.center, scale: app.scale, rawInput: app.rawInput, excludeRT: cfg.excludeRT, enforceErgo: cfg.enforceErgo,
      perBlock: cfg.perBlock, gapMs: cfg.gap, trackPreset: kindOf(d.type) === 'tracking' ? cfg.trackSpeed : undefined },
    blocks: d.adaptive ? undefined : d.records, rounds: d.adaptive ? d.rounds : undefined
  };
  persist();
  emit('drill:end', { type: d.type, result: app.saved[d.type] });
  app.session.step++;
  if (app.session.step < app.session.queue.length) {
    app.session.drill = makeDrill(app.session.queue[app.session.step]);
    app.state = app.locked ? 'intro' : 'ready';
  } else {
    app.state = 'done';
    emit('session:end');
  }
  emit('results'); emit('overlay');
}

// Results keep every block, so results saved by an older version are refitted with the current math.
export function refitSaved() {
  for (const k of DRILL_IDS) {
    const r = app.saved[k];
    if (!r || r.rounds || !Array.isArray(r.blocks) || !r.blocks.length) continue;
    const fit = fitBest(r.blocks, { trend: searchOf(r).trend, round: rs }), b = bounds(), f = cfg.dpi / (r.dpi || cfg.dpi);
    app.saved[k] = { ...r, ...fit, sens: rs(Math.min(b.hi * f, Math.max(b.lo * f, fit.sens))), fitSens: fit.sens };
  }
}
