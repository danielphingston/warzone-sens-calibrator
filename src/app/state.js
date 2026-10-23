// Shared app state and the helpers that depend on the current settings.
import { GAMES, DEFAULT_GAME } from '../registry/games.js';
import { DRILLS } from '../registry/drills.js';
import * as units from '../core/units.js';
import { angleBetween } from '../core/geometry.js';
import { blend } from '../core/blend.js';

// Settings, as shown in the setup bar and saved between visits.
export const cfg = { game: DEFAULT_GAME, dpi: 5200, startSens: 1.5, fov: 120, perBlock: 10, gap: 350, mode: 'full', method: 'throughput', padCm: 45, fastCm: 12, trackSpeed: 'real', search: 'bracket', excludeRT: true, enforceErgo: true, practice: false, record: false, notes: '' };

// Everything that changes while the page runs, in one object so every module sees the same values.
//   session  { queue, step, order, drill, practice, startedAt, t0 } while a test or practice runs
//            bracket drill:  { type, method, search, center, blocks: [sens...], bi, records, sens, cur: { trials } }
//            adaptive drill: { type: 'flick', method: 'reach', adaptive: true, sens, rounds, cur: { trials }, boundHits }
//   state    idle | ready | intro | gap | trial | between | countdown | tracking | paused | done | measureReady | measureArm | measure
export const app = {
  scale: 1,                                 // browser movement units per real mouse count
  rawInput: null,                           // true once unadjusted (raw) pointer lock is confirmed
  savedAll: {},                             // { warzone: {...}, valorant: {...} }
  saved: {},                                // current game's { [drill]: latest result + raw data }
  session: null, state: 'idle',
  cam: { yaw: 0, pitch: 0 }, trial: null, trk: null,
  gapUntil: 0, countUntil: 0, flash: null, ghost: null, between: null,
  locked: false, measureSum: 0,
  videoT: () => null                        // seconds into the current recording for a timestamp (set by the recorder)
};

export const G = () => GAMES[cfg.game] || GAMES[DEFAULT_GAME];
export const yaw = () => G().yaw;
export const SD = () => G().decimals;       // decimals the game's sens field accepts
export const rs = v => { const p = 10 ** SD(); return Math.round(v * p) / p; };
export const EPS = () => 0.5 / 10 ** SD();
export const fovNow = () => G().fixedFov || cfg.fov;

export const cm360 = s => units.cm360(s, yaw(), cfg.dpi);
export const sensAtCm = cm => units.sensAtCm(cm, yaw(), cfg.dpi);
export { jitterDeg } from '../core/units.js';
const ergo = () => ({ yaw: yaw(), dpi: cfg.dpi, padCm: cfg.padCm, fastCm: cfg.fastCm, enforce: cfg.enforceErgo });
// Recommended range, shown always. Enforced only while "Enforce" is on; otherwise tests and results
// may go anywhere from 2 to 200 cm/360, for players who genuinely aim better outside it.
export const recBounds = () => units.recBounds(ergo());
export const bounds = () => units.testBounds(ergo());
export const outsideRec = s => { const b = recBounds(); return s > b.hi + EPS() || s < b.lo - EPS(); };
export const clampSens = (s, b = bounds()) => units.clamp(s, b);

// Angle from the crosshair to a direction.
export const angTo = (ty, tp) => angleBetween(app.cam.yaw, app.cam.pitch, ty, tp);

// Overall sens from the given results (defaults to the current game's saved results).
export const overall = (sv = app.saved) => blend(sv, { weights: drillWeights(), dpi: cfg.dpi, clamp: s => clampSens(s), round: rs, eps: EPS() });
// The current game's blend weights, for drills that exist.
export const drillWeights = () => Object.fromEntries(Object.entries(G().weights).filter(([k]) => DRILLS[k]));
