// The setup bar and settings panel: builds the controls from the registries, reads them into cfg,
// and renders the method and ergonomic-range explainers.
import { JITTER_MM } from '../config.js';
import { $, esc, arenaWrap } from './dom.js';
import { cfg, app, G, SD, rs, cm360, sensAtCm, jitterDeg, recBounds, outsideRec, clampSens } from '../app/state.js';
import { persist } from '../app/storage.js';
import { emit } from '../app/events.js';
import { refitSaved, resetSession } from '../app/session.js';
import { GAMES } from '../registry/games.js';
import { DRILLS, DRILL_IDS, FULL_TEST } from '../registry/drills.js';
import { METHODS } from '../registry/methods.js';
import { TRACK_PRESETS } from '../registry/tracking-presets.js';
import { SEARCHES } from '../core/search.js';
import { renderScale } from './overlay.js';

const lower = s => s.charAt(0).toLowerCase() + s.slice(1);
const list = names => names.length > 1 ? `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}` : names[0] || '';
const radios = (name, prefix, items) => items.map(([v, label]) => `<input type="radio" name="${name}" id="${prefix}-${v}" value="${v}"><label for="${prefix}-${v}">${esc(label)}</label>`).join('');
const options = items => items.map(([v, label]) => `<option value="${v}">${esc(label)}</option>`).join('');

// Controls that list registry entries.
function buildControls() {
  $('game-seg').innerHTML = radios('game', 'g', Object.values(GAMES).map(g => [g.id, g.name]));
  $('mode-seg').innerHTML = radios('mode', 'm', [['full', 'Full test'], ...DRILL_IDS.map(k => [k, DRILLS[k].name])]);
  $('method').innerHTML = options(Object.values(METHODS).map(m => [m.id, m.option || m.name]));
  $('search').innerHTML = options(Object.values(SEARCHES).map(s => [s.id, s.option || s.name]));
  $('tspeed').innerHTML = options(Object.entries(TRACK_PRESETS).map(([k, p]) => [k, `${p.name} · ${p.vmin}–${p.vmax}°/s`]));
}
// Puts the loaded settings into the form.
function applyToForm() {
  $('dpi').value = cfg.dpi; $('sens0').value = cfg.startSens; $('fov').value = cfg.fov; $('per').value = cfg.perBlock;
  $('gap').value = cfg.gap; $('pad').value = cfg.padCm; $('fast').value = cfg.fastCm; $('method').value = cfg.method;
  $('tspeed').value = cfg.trackSpeed;
  $('search').value = cfg.search; $('rt').checked = cfg.excludeRT !== false; $('ergo').checked = cfg.enforceErgo !== false;
  $('practice').checked = !!cfg.practice;
  $('rec-on').checked = !!cfg.record;
  $('notes').value = cfg.notes;
  for (const [name, val] of [['mode', cfg.mode], ['game', cfg.game]]) {
    const el = document.querySelector(`input[name="${name}"][value="${val}"]`);
    if (el) el.checked = true;
  }
}

const num = (id, lo, hi, d) => { const v = parseFloat($(id).value); return isFinite(v) ? Math.min(hi, Math.max(lo, v)) : d; };
export function readInputs() {
  cfg.dpi = num('dpi', 100, 32000, 5200);
  cfg.startSens = num('sens0', 0.001, 100, 1.5);
  if (!G().fixedFov) cfg.fov = num('fov', 60, 120, 120);
  cfg.perBlock = Math.round(num('per', 6, 30, 10));
  cfg.gap = Math.round(num('gap', 150, 1500, 350));
  cfg.padCm = num('pad', 20, 120, 45);
  cfg.fastCm = num('fast', 4, 40, 12);
  cfg.mode = (document.querySelector('input[name="mode"]:checked') || {}).value || 'full';
  cfg.method = METHODS[$('method').value] ? $('method').value : 'throughput';
  cfg.trackSpeed = TRACK_PRESETS[$('tspeed').value] ? $('tspeed').value : 'real';
  cfg.search = SEARCHES[$('search').value] ? $('search').value : 'bracket';
  cfg.excludeRT = $('rt').checked;
  cfg.enforceErgo = $('ergo').checked;
  cfg.record = $('rec-on').checked;
  cfg.notes = $('notes').value.slice(0, 1000);
  // Practice reuses the Test selection as its drill; a full test can't be practiced, so it falls back to the first drill.
  cfg.practice = $('practice').checked;
  $('m-full').disabled = cfg.practice;
  if (cfg.practice && cfg.mode === 'full') { cfg.mode = DRILL_IDS[0]; $(`m-${cfg.mode}`).checked = true; }
  $('start').textContent = cfg.practice ? 'Start practice' : 'Start';
  $('rt-hint').textContent = cfg.excludeRT ? 'times start at movement' : 'times start at target';
  renderGame();
  const queue = cfg.mode === 'full' ? FULL_TEST : [cfg.mode], span = queue.map(k => DRILLS[k].minutes[cfg.search] || DRILLS[k].minutes.bracket);
  const lo = span.reduce((a, m) => a + m[0], 0), hi = span.reduce((a, m) => a + m[1], 0);
  $('time-est').textContent = cfg.practice ? 'unlimited · Esc to stop' : `about ${lo === hi ? lo : `${lo}–${hi}`} min`;
  $('summary-chip').textContent = `${METHODS[cfg.method].name} · ${SEARCHES[cfg.search].chip} · reaction time ${cfg.excludeRT ? 'excluded' : 'included'} · limits ${cfg.enforceErgo ? 'on' : 'off'}`;
  persist();
  renderMethod();
}
// Everything on the page that depends on which game is selected.
function renderGame() {
  const g = G(), w = g.weights;
  $('eyebrow').textContent = `${g.scale} sensitivity scale · ${g.yaw}° per count`;
  $('sens0').step = g.decimals === 3 ? '0.005' : '0.05';
  $('sens0-hint').textContent = `eDPI ${Math.round(cfg.startSens * cfg.dpi)}`;
  $('fov').disabled = !!g.fixedFov;
  $('fov').value = g.fixedFov || cfg.fov;
  $('fov-hint').textContent = g.fixedFov ? `fixed in ${g.name}` : '';
  $('game-hint').textContent = `${g.yaw}° / count`;
  const parts = Object.keys(w).filter(k => DRILLS[k]).sort((a, b) => w[b] - w[a]).map(k => `${lower(DRILLS[k].name)} ${Math.round(w[k] * 100)}%`);
  $('blend-text').textContent = `In ${g.name}: ${parts.join(', ')}, blended on a log scale and kept inside your ergonomic range. Only drills you've run count.`;
}

// Center sens and cm/360 are two views of one setting. Editing either updates the other;
// DPI changes keep the in-game sens, and switching games keeps the physical cm/360.
export const showCm = () => { $('cm').value = cm360(cfg.startSens).toFixed(1); };
const showSens = () => { $('sens0').value = rs(cfg.startSens); };

function renderMethod() {
  const M = METHODS[cfg.method], search = SEARCHES[cfg.search];
  const targets = DRILL_IDS.filter(k => DRILLS[k].kind === 'targets'), tracking = DRILL_IDS.filter(k => DRILLS[k].kind === 'tracking');
  const names = ks => list(ks.map((k, i) => i ? lower(DRILLS[k].name) : DRILLS[k].name));
  const fallback = targets.filter(k => !DRILLS[k].adaptive);
  const usage = M.search === 'bracket' ? `${names(targets)} use this method.`
    : fallback.length ? `${names(fallback)} ${fallback.length > 1 ? 'use' : 'uses'} Fitts throughput, because ${lower(M.name)} only works on long flicks.` : '';
  $('method-card').innerHTML = `
    <h3>${esc(M.name)} <span class="badge ${M.badgeClass}">${esc(M.badge)}</span></h3>
    <p>${esc(M.summary)}</p>
    <dl>
      <div><dt>Readings used</dt><dd><ul>${M.uses.map(u => `<li>${esc(u)}</li>`).join('')}</ul></dd></div>
      <div><dt>Calculation</dt><dd>${esc(M.how)}</dd></div>
      <div><dt>Why</dt><dd>${esc(M.why)}</dd></div>
      <div><dt>Watch out for</dt><dd>${esc(M.caveat)}</dd></div>
      <div><dt>Sources</dt><dd><ul>${M.refs.map(r => `<li><a href="${esc(r.url)}" target="_blank" rel="noopener">${esc(r.label)}</a></li>`).join('')}</ul></dd></div>
    </dl>
    <p>${tracking.length ? `${names(tracking)} ${tracking.length > 1 ? 'are' : 'is'} always scored by time on target. ` : ''}${usage}</p>
    <dl>
      <div><dt>Search: ${esc(search.name)}</dt><dd>${esc(search.info)}${M.search === 'adaptive' ? ` ${esc(M.name)} uses its own step-by-step search for flicks.` : ''}</dd></div>
      <div><dt>Reaction time: ${cfg.excludeRT ? 'excluded' : 'included'}</dt><dd>${cfg.excludeRT
        ? 'Flick and micro times start when your hand starts moving, not when the target appears, because reaction time doesn’t depend on sens and only adds noise. If your hand was still moving from the last target, the block’s typical reaction time is used. Tracking skips the 220 ms after each direction change.'
        : 'Times run from the moment each target appears, and tracking scores every moment. Closer to how a real fight feels, but reaction time adds noise that has nothing to do with sens.'}</dd></div>
    </dl>`;

  const b = recBounds(), you = cm360(cfg.startSens);
  const lc = Math.log(4), hc = Math.log(120), pos = cm => Math.min(100, Math.max(0, (Math.log(cm) - lc) / (hc - lc) * 100));
  const outside = outsideRec(cfg.startSens);
  $('range-card').innerHTML = `
    <h3>Ergonomic range <span class="badge ${cfg.enforceErgo ? '' : 'legacy'}">${cfg.enforceErgo ? 'Enforced' : 'Not enforced'}</span></h3>
    <p>Recommended at ${cfg.dpi} DPI: <b>sens ${b.lo.toFixed(SD())} to ${b.hi.toFixed(SD())}</b> (${b.slowCm.toFixed(0)} to ${b.fastCm.toFixed(0)} cm/360). ${cfg.enforceErgo
      ? 'Every test and result stays inside it. To test outside it, untick Enforce under More settings.'
      : 'Limits are off: tests and results can go anywhere from 2 to 200 cm/360. Results outside the range are marked.'}</p>
    <div class="range-bar" aria-hidden="true"><div class="ok" style="left:${pos(b.fastCm)}%;width:${pos(b.slowCm) - pos(b.fastCm)}%"></div><div class="you" style="left:calc(${pos(you)}% - 1px)"></div></div>
    <div class="range-scale"><span>4 cm (fast)</span><span>120 cm (slow)</span></div>
    <p><b>Slow limit:</b> a 180° turn should fit in 80% of your ${cfg.padCm} cm mousepad, so you never have to lift the mouse mid-fight.</p>
    <p><b>Fast limit:</b> about ${JITTER_MM} mm of natural hand jitter moves your aim ${jitterDeg(b.fastCm).toFixed(2)}° at ${b.fastCm} cm/360. A head at mid range is roughly 1–2°. This limit is a rule of thumb you can change under More settings.</p>
    <p${outside ? ' class="warn"' : ''}>Center sens ${cfg.startSens.toFixed(SD())} = ${you.toFixed(1)} cm/360, jitter ${jitterDeg(you).toFixed(2)}°.${outside ? (cfg.enforceErgo
      ? ` That's outside the range, so tests will center on ${clampSens(cfg.startSens).toFixed(SD())}. Untick Enforce under More settings to test there anyway.`
      : ' That’s outside the recommended range; with limits off, tests center on it anyway.') : ''}</p>`;
}

function bindControls() {
  ['fov', 'per', 'gap', 'pad', 'fast'].forEach(id => $(id).addEventListener('input', () => { readInputs(); renderScale(); }));
  $('sens0').addEventListener('input', () => { readInputs(); showCm(); });
  $('dpi').addEventListener('input', () => { readInputs(); showCm(); });
  $('cm').addEventListener('input', () => {
    const cm = parseFloat($('cm').value);
    if (!(cm >= 2 && cm <= 200)) return;
    cfg.dpi = num('dpi', 100, 32000, 5200);
    cfg.startSens = rs(sensAtCm(cm)); showSens(); readInputs();
  });
  document.querySelectorAll('input[name="game"]').forEach(el => el.addEventListener('change', () => {
    const cm = cm360(cfg.startSens);
    if (app.session && app.state !== 'idle' && app.state !== 'done') {
      if (document.pointerLockElement) document.exitPointerLock();
      resetSession();
    }
    cfg.game = el.value;
    $('fov').value = G().fixedFov || cfg.fov;     // restore your own FOV before it's read back
    app.saved = app.savedAll[cfg.game] = app.savedAll[cfg.game] || {};
    cfg.startSens = rs(sensAtCm(cm)); showSens();
    readInputs(); showCm(); refitSaved(); emit('results'); emit('overlay');
  }));
  document.querySelectorAll('input[name="mode"]').forEach(el => el.addEventListener('change', readInputs));
  ['method', 'tspeed', 'search', 'rt', 'practice', 'notes'].forEach(id => $(id).addEventListener('change', readInputs));
  $('ergo').addEventListener('change', () => { readInputs(); emit('results'); });
}

// Settings panel: closed by default so the range sits right under the control bar; open state is remembered.
function setSettingsOpen(open) {
  $('settings').hidden = !open;
  $('settings-toggle').setAttribute('aria-expanded', String(open));
  $('settings-toggle').textContent = open ? 'Hide settings' : 'Settings';
  try { localStorage.setItem('wzcal-settings-open', open ? '1' : '0'); } catch (e) {}
}
// Size the range to the space left under the control bar (closed settings), so the whole
// range is on the first screen whatever the bar's height. Never smaller than 480px wide.
function fitArena() {
  const setupBox = document.querySelector('.setup').getBoundingClientRect();
  const settingsH = $('settings').hidden ? 0 : $('settings').getBoundingClientRect().height + 10;
  const top = setupBox.bottom - settingsH + window.scrollY + 14;   // where the range starts, from the page top
  const avail = window.innerHeight - top - 16;
  arenaWrap.style.maxWidth = `${Math.max(480, Math.round(avail * 16 / 9))}px`;
}

export function initSettings() {
  buildControls();
  applyToForm();
  bindControls();
  $('settings-toggle').addEventListener('click', () => setSettingsOpen($('settings').hidden));
  new ResizeObserver(fitArena).observe(document.querySelector('.setup'));
  window.addEventListener('resize', fitArena);
  try { if (localStorage.getItem('wzcal-settings-open') === '1') setSettingsOpen(true); } catch (e) {}
}
