// The click-to-continue overlay over the range, and the status chips under the setup bar.
import { $ } from './dom.js';
import { cfg, app, SD, cm360, overall } from '../app/state.js';
import { DRILLS } from '../registry/drills.js';

export function setOverlay(title, text) { $('ov-title').textContent = title; $('ov-text').textContent = text; $('overlay').hidden = false; }
// A message that stays up until the mouse is locked again or a test starts. Unlocking the mouse
// redraws the overlay a moment later, which would otherwise replace it straight away.
let notice = null;
export function showNotice(title, text) { notice = { title, text }; setOverlay(title, text); }
export const clearNotice = () => { notice = null; };
export function updateOverlay() {
  if (app.locked) { notice = null; $('overlay').hidden = true; return; }
  if (notice) { setOverlay(notice.title, notice.text); return; }
  const S = app.session, d = S && S.drill, name = d ? DRILLS[d.type].name : '';
  const stepTxt = S && S.queue.length > 1 ? ` (${Math.min(S.step + 1, S.queue.length)} of ${S.queue.length})` : '';
  if (app.state === 'idle') setOverlay('Ready when you are', 'Pick a test and a scoring method, then click here. Press Esc any time to pause.');
  else if (app.state === 'ready' || app.state === 'intro') setOverlay(d.practice ? `Practice · ${name}` : `${name}${stepTxt}`, `${DRILLS[d.type].intro}${d.practice ? ` Sens ${d.sens.toFixed(SD())} (${cm360(d.sens).toFixed(1)} cm/360), unlimited, nothing is saved.` : ''} Click to lock the mouse and begin.`);
  else if (app.state === 'paused' || app.state === 'between') setOverlay(`Paused · ${name}`, d.adaptive || d.practice ? 'Click to lock the mouse and carry on.' : 'Click to carry on. The interrupted block starts over.');
  else if (app.state === 'done') { const o = overall(); setOverlay(o ? `Your sens: ${o.sens.toFixed(SD())}` : 'Done', o ? `${cm360(o.sens).toFixed(1)} cm/360 at ${cfg.dpi} DPI. Details and export are below. Click to run it again.` : 'Click to run it again.'); }
  else if (app.state === 'measureReady') setOverlay('Mouse scaling check', 'Click to lock the mouse. You’ll need a ruler.');
}
export function renderRaw() {
  const d = $('raw-dot'), t = $('raw-text');
  if (app.rawInput) { d.className = 'dot ok'; t.textContent = 'Raw input: on'; }
  else { d.className = 'dot warn'; t.textContent = 'Raw input: off. Set Windows pointer speed to 6/11 and turn off Enhance pointer precision.'; }
}
export function renderScale() {
  const d = $('scale-dot'), t = $('scale-text');
  if (app.scale === 1) { d.className = 'dot'; t.textContent = 'Mouse scaling: ×1.00 (use the check if results look off)'; }
  else { d.className = 'dot warn'; t.textContent = `Mouse scaling: corrected ×${app.scale.toFixed(2)}${app.rawInput ? '. With raw input on, this usually means the DPI field is wrong: run the check again' : ''}`; }
}
