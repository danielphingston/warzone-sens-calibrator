// Mouse input: pointer lock, raw movement into the camera, clicks, and the mouse scaling check.
import { $, canvas, arenaWrap } from './dom.js';
import { cfg, app, yaw } from '../app/state.js';
import { persist } from '../app/storage.js';
import { emit, on } from '../app/events.js';
import { startSession, beginDrill, resume, clickTarget, refitSaved } from '../app/session.js';
import { r2 } from '../core/stats.js';
import { setOverlay, showNotice, clearNotice, updateOverlay, renderRaw, renderScale } from './overlay.js';
import { readInputs, showCm } from './settings.js';

async function lock() {
  // Fullscreen lets the browser skip compositing the page around the canvas, which cuts latency.
  if (!document.fullscreenElement && arenaWrap.requestFullscreen) arenaWrap.requestFullscreen().catch(() => {});
  try {
    const p = canvas.requestPointerLock({ unadjustedMovement: true });
    if (p && p.then) await p;
    app.rawInput = !!(p && p.then);
  } catch (e) {
    try { const p = canvas.requestPointerLock(); if (p && p.then) await p; app.rawInput = false; }
    catch (e2) { setOverlay('Mouse lock was blocked', 'Your browser refused to lock the mouse. Click again, or open this page in Chrome or Edge on a desktop.'); return; }
  }
  renderRaw(); renderScale();
}
const unlockAll = () => {
  if (document.pointerLockElement) document.exitPointerLock();
  if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
};

function onLockChange() {
  app.locked = document.pointerLockElement === canvas;
  if (app.locked) {
    if (app.state === 'ready') app.state = 'intro';
    else if (app.state === 'paused') resume();
    else if (app.state === 'measureReady') app.state = 'measureArm';
  } else {
    if (['trial', 'gap', 'tracking', 'countdown'].includes(app.state)) { app.trial = null; app.trk = null; app.state = 'paused'; }
    else if (app.state === 'measureArm' || app.state === 'measure') app.state = 'measureReady';
  }
  emit('lock', { locked: app.locked });
  updateOverlay();
}

function onMove(e) {
  if (!app.locked) return;
  const dx = e.movementX || 0, dy = e.movementY || 0;
  if (!dx && !dy) return;
  if (app.state === 'measure') { app.measureSum += dx; return; }
  if (app.state === 'measureArm' || !app.session) return;
  const k = yaw() * app.session.drill.sens / app.scale;
  app.cam.yaw += dx * k;
  app.cam.pitch = Math.min(80, Math.max(-80, app.cam.pitch - dy * k));
  if (app.state === 'trial' && app.trial) app.trial.samples.push({ t: e.timeStamp, yaw: app.cam.yaw, pitch: app.cam.pitch });
}

function onMouseDown(e) {
  if (!app.locked || e.button !== 0) return;
  const t = e.timeStamp;
  if (app.state === 'trial') clickTarget(t);
  else if (app.state === 'between') { app.between = null; app.state = 'gap'; app.gapUntil = performance.now() + 500; }
  else if (app.state === 'intro') beginDrill();
  else if (app.state === 'measureArm') { app.measureSum = 0; app.state = 'measure'; }
  else if (app.state === 'measure') finishMeasure();
}

function finishMeasure() {
  const counts = Math.abs(app.measureSum), expected = cfg.dpi * 10 / 2.54;
  document.exitPointerLock();
  if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
  app.state = app.session ? (app.session.step >= app.session.queue.length ? 'done' : 'paused') : 'idle';
  if (counts < expected * 0.2) {
    showNotice('Scaling check didn’t register', 'Move the mouse a full 10 cm along a ruler between the two clicks, then try again.');
    return;
  }
  const f = counts / expected;
  // Raw input passes the mouse's own counts straight through, exactly as the game reads them. A mismatch
  // then means the mouse isn't at the DPI entered, and correcting it here would hide that: the game would
  // still turn faster or slower than the test did. So the DPI field is fixed instead.
  if (app.rawInput && Math.abs(f - 1) > 0.07) {
    const was = cfg.dpi, dpi = Math.round(counts / (10 / 2.54) / 50) * 50;
    app.scale = 1; $('dpi').value = dpi; readInputs(); showCm(); renderScale(); refitSaved(); emit('results');
    showNotice(`Your mouse is at about ${dpi} DPI`, `Measured ${Math.round(counts)} counts for 10 cm; ${was} DPI would give ${Math.round(expected)}. With raw input the game sees the same counts, so DPI is now set to ${dpi} and every sens is worked out for it. If that's wrong, check the DPI in your mouse software and measure again.`);
    return;
  }
  app.scale = Math.abs(f - 1) <= 0.07 ? 1 : r2(f);
  persist(); renderScale();
  showNotice(app.scale === 1 ? 'Mouse scaling matches' : `Corrected for ×${app.scale.toFixed(2)} scaling`,
    app.scale === 1 ? `Measured ${Math.round(counts)} counts for 10 cm, close to the ${Math.round(expected)} expected at ${cfg.dpi} DPI. You're set.`
                : `Measured ${Math.round(counts)} counts for 10 cm; ${cfg.dpi} DPI should give ${Math.round(expected)}. The calibrator now compensates. Check that your mouse really is at ${cfg.dpi} DPI.`);
}

const start = () => { clearNotice(); readInputs(); startSession(); };

export function initInput() {
  document.addEventListener('pointerlockchange', onLockChange);
  document.addEventListener('pointerlockerror', () => setOverlay('Mouse lock was blocked', 'Click again, or open this page in Chrome or Edge on a desktop.'));
  if ('onpointerrawupdate' in window) document.addEventListener('pointerrawupdate', onMove);
  else document.addEventListener('mousemove', onMove);
  document.addEventListener('mousedown', onMouseDown);
  $('overlay').addEventListener('click', () => {
    if (app.state === 'idle' || app.state === 'done') start();
    if (['ready', 'intro', 'paused', 'between', 'measureReady'].includes(app.state)) lock();
  });
  canvas.addEventListener('click', () => { if (!app.locked && app.state !== 'idle' && app.state !== 'done') lock(); });
  $('start').addEventListener('click', () => { start(); arenaWrap.scrollIntoView({ block: 'center' }); lock(); });
  $('check').addEventListener('click', () => { readInputs(); app.state = 'measureReady'; updateOverlay(); lock(); });
  on('session:end', unlockAll);
}
