// Entry point: loads saved settings, wires the modules together and starts the frame loop.
//
//   src/config.js      tunable constants
//   src/registry/      games, drills, scoring methods, tracking presets: add entries to extend
//   src/core/          pure maths (fit, search, units, analysis, blend), unit-tested in tests/
//   src/app/           shared state, storage, event bus, and the drill engine (session.js)
//   src/ui/            everything that touches the page
import { cfg, app, rs, bounds, overall } from './app/state.js';
import { load } from './app/storage.js';
import { on } from './app/events.js';
import { tick, refitSaved } from './app/session.js';
import { fitBest, setFlatK } from './core/fit.js';
import { bracketValues, bayesPosterior, BAYES } from './core/search.js';
import { analyzeTrial } from './core/analysis.js';
import { METHODS, moveTime } from './registry/methods.js';
import { initSettings, readInputs, showCm } from './ui/settings.js';
import { updateOverlay, renderScale } from './ui/overlay.js';
import { initInput } from './ui/input.js';
import { draw } from './ui/arena.js';
import { renderResults, initResults } from './ui/results.js';
import { initExport } from './ui/export.js';
import { initRecorder } from './ui/recorder.js';

load();
initSettings();
initInput();
initExport();
initRecorder();
initResults();
on('results', renderResults);
on('overlay', updateOverlay);

readInputs(); showCm(); renderScale(); refitSaved(); renderResults(); updateOverlay();

function loop(now) {
  tick(now);
  draw(now);
  requestAnimationFrame(loop);
}
requestAnimationFrame(loop);

// For poking at the maths from the browser console.
window.__cal = {
  analyzeTrial, METHODS, BAYES, cfg, setFlatK, bounds,
  fitBest: (records, o = {}) => fitBest(records, { round: rs, ...o }),
  overall: sv => overall(sv),
  bracketValues: center => bracketValues(center, bounds(), rs),
  bayesPosterior: d => bayesPosterior(d, bounds(), rs),
  moveTime: trials => moveTime(trials, cfg.excludeRT),
  app
};
