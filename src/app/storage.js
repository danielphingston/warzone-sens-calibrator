// Settings and results saved in localStorage between visits.
import { VERSION } from '../config.js';
import { cfg, app } from './state.js';
import { GAMES, DEFAULT_GAME } from '../registry/games.js';
import { DRILLS, DRILL_IDS } from '../registry/drills.js';
import { METHODS, DEFAULT_METHOD } from '../registry/methods.js';
import { TRACK_PRESETS, DEFAULT_PRESET } from '../registry/tracking-presets.js';
import { SEARCHES } from '../core/search.js';

const KEY = 'wzcal3', LEGACY_KEY = 'wzcal';
const CFG_KEYS = ['game', 'dpi', 'fov', 'gap', 'padCm', 'fastCm', 'mode', 'method', 'trackSpeed', 'search', 'excludeRT', 'enforceErgo', 'practice', 'record', 'notes'];

export function load() {
  try {
    const s3 = JSON.parse(localStorage.getItem(KEY) || 'null');
    const old = JSON.parse(localStorage.getItem(LEGACY_KEY) || 'null');
    const src = s3 || old;
    if (src) {
      const c = src.cfg || {};
      CFG_KEYS.forEach(k => { if (c[k] !== undefined) cfg[k] = c[k]; });
      // Older versions had Practice as a Test tab with its own drill picker.
      if (cfg.mode === 'practice') { cfg.mode = DRILLS[c.practiceDrill] ? c.practiceDrill : DRILL_IDS[0]; cfg.practice = true; }
      app.scale = src.scale || 1;
    }
    // v3 stored one game's results; v4 stores them per game. Older versions used different math and are dropped.
    if (s3) app.savedAll = (s3.v || 3) >= 4 ? (s3.result || {}) : { warzone: s3.result || {} };
    if (s3 && s3.cfg && s3.cfg.startSens) cfg.startSens = s3.cfg.startSens;
    if (s3 && s3.cfg && s3.cfg.perBlock) cfg.perBlock = s3.cfg.perBlock;
  } catch (e) {}
  // Anything a registry no longer has falls back to its default.
  if (!GAMES[cfg.game]) cfg.game = DEFAULT_GAME;
  if (!METHODS[cfg.method]) cfg.method = DEFAULT_METHOD;
  if (!TRACK_PRESETS[cfg.trackSpeed]) cfg.trackSpeed = DEFAULT_PRESET;
  if (!SEARCHES[cfg.search]) cfg.search = 'bracket';
  if (cfg.mode !== 'full' && !DRILLS[cfg.mode]) cfg.mode = 'full';
  if (typeof cfg.notes !== 'string') cfg.notes = '';
  app.saved = app.savedAll[cfg.game] = app.savedAll[cfg.game] || {};
}

export function persist() {
  try { localStorage.setItem(KEY, JSON.stringify({ v: VERSION, cfg, scale: app.scale, result: app.savedAll })); } catch (e) {}
}
