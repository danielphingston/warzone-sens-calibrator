// The results sidebar (overall sens) and one card per drill.
import { $ } from './dom.js';
import { cfg, app, G, yaw, SD, rs, EPS, cm360, jitterDeg, outsideRec, overall, drillWeights } from '../app/state.js';
import { persist } from '../app/storage.js';
import { emit } from '../app/events.js';
import { blockLabel, resetSession } from '../app/session.js';
import { GAMES } from '../registry/games.js';
import { DRILLS, DRILL_IDS } from '../registry/drills.js';
import { methodFor } from '../registry/methods.js';
import { SEARCHES } from '../core/search.js';
import { fitBest } from '../core/fit.js';
import * as units from '../core/units.js';
import { reachChart, scoreChart } from './charts.js';

// Example results at about 12–31 cm/360, expressed in the selected game's sens scale.
const exBlocks = (vals, scores) => vals.flatMap((s, i) => [{ sens: s, score: scores[i] }, { sens: s, score: scores[i] * 0.97 }]);
const exampleData = () => {
  const SENS5 = [0.93, 1.19, 1.5, 1.91, 2.4].map(v => rs(v * 0.0066 / yaw())), dpi = 5200;
  return Object.fromEntries(DRILL_IDS.filter(k => DRILLS[k].example).map(k => {
    const ex = DRILLS[k].example;
    return [k, { dpi, method: DRILLS[k].kind === 'tracking' ? 'track' : 'throughput', lag: ex.lag, ...fitBest(exBlocks(SENS5, ex.scores), { round: rs }) }];
  }));
};

// The same physical speed in the other game, for players who play both.
function otherGame(sens) {
  const other = Object.values(GAMES).find(g => g.id !== cfg.game);
  const v = sens * yaw() / other.yaw, p = 10 ** other.decimals;
  return `<p>Same speed in ${other.name}: <b>${(Math.round(v * p) / p).toFixed(other.decimals)}</b> at the same DPI.</p>`;
}

export function renderResults() {
  const hasSaved = DRILL_IDS.some(k => app.saved[k]);
  const isExample = !hasSaved && !app.session;
  const sv = isExample ? exampleData() : app.saved;
  const o = overall(sv);
  const running = app.session && !app.session.practice && app.state !== 'done' && app.state !== 'idle';
  let html = '';
  if (running) {
    const d = app.session.drill;
    html += `<span class="tag live">In progress</span>
      <div class="big">${d.sens.toFixed(SD())}</div>
      <div class="big-sub">testing now · ${cm360(d.sens).toFixed(1)} cm/360</div>
      <p><b>${DRILLS[d.type].name}</b>${app.session.queue.length > 1 ? `, drill ${app.session.step + 1} of ${app.session.queue.length}` : ''}. ${d.adaptive ? `Round ${d.rounds.length + 1}.` : `Block ${blockLabel(d)}.`}${d.posterior ? ` Likely best so far: ${d.posterior.lo.toFixed(SD())}–${d.posterior.hi.toFixed(SD())}.` : ''}</p>`;
    if (o) html += `<p>Overall so far: <b>${o.sens.toFixed(SD())}</b></p>`;
  } else if (o) {
    html += `${isExample ? '<span class="tag">Example</span>' : '<span class="tag live">Your overall sens</span>'}
      <div class="big">${o.sens.toFixed(SD())}</div>
      <div class="big-sub">${cm360(o.sens).toFixed(1)} cm/360 at ${cfg.dpi} DPI</div>
      <p>${G().apply(o.sens.toFixed(SD()))}</p>${otherGame(o.sens)}
      ${o.clamped ? '<p class="warn">The blend landed outside your ergonomic range and was pulled to its edge.</p>' : ''}
      <p>${isExample ? 'Sample results so you can see the output. Pick a test and press Start to get your own.' : o.parts.length < Object.keys(drillWeights()).length ? 'Run the full test to include every drill.' : 'Run the full test again on another day to confirm.'}</p>`;
  } else {
    html += `<span class="tag">No results yet</span><p>Pick a test and press Start.</p>`;
  }
  const parts = o ? Object.fromEntries(o.parts.map(p => [p.k, p])) : {};
  html += `<ul class="parts">${DRILL_IDS.map(k => parts[k]
    ? `<li><span>${DRILLS[k].name}${parts[k].flat ? ' (flat)' : ''}</span><span>${parts[k].s.toFixed(SD())}</span><span class="w">${Math.round(parts[k].share * 100)}%</span></li>`
    : `<li class="off"><span>${DRILLS[k].name}</span><span>not run</span><span class="w">0%</span></li>`).join('')}</ul>`;
  $('verdict').innerHTML = html;
  $('cards').innerHTML = DRILL_IDS.map(k => card(k, sv[k], isExample)).join('');
}

function card(k, r, isEx) {
  const name = DRILLS[k].name;
  if (!r || !isFinite(r.sens)) return `<article class="card"><div class="card-head"><h3>${name}</h3><span class="val none">Not run yet</span></div>
    <div class="sub">${DRILLS[k].hint}</div></article>`;
  const dpi = r.dpi || cfg.dpi, M = methodFor(r.method), cm = units.cm360(r.sens, yaw(), dpi);
  let sub = `${cm.toFixed(1)} cm/360 at ${dpi} DPI · ${M.name || 'Time on target'}${r.date && !isEx ? ` · ${r.date}` : ''}`;
  if (isFinite(r.lag) && Math.abs(r.lag) >= 0.3) sub += ` · on average you ${r.lag > 0 ? 'trailed' : 'ran ahead of'} the target by ${Math.abs(r.lag).toFixed(1)}°`;
  if (r.search && r.search !== 'bracket' && SEARCHES[r.search]) sub += ` · ${SEARCHES[r.search].chip}, ${r.blocksUsed} blocks`;
  if (r.excludeRT === false) sub += ' · reaction time included';
  let warn = '';
  if (isFinite(r.lo) && isFinite(r.hi) && !r.rounds) sub += `<br>Likely range (80%): ${r.lo.toFixed(SD())}–${r.hi.toFixed(SD())}`;
  if (outsideRec(r.sens)) warn += `<div class="sub warn">Outside the recommended range (${cm.toFixed(1)} cm/360, hand jitter ${jitterDeg(cm).toFixed(2)}°). Fine if you really aim better there; re-test on another day to be sure.</div>`;
  if (r.flat) warn += `<div class="sub warn">No clear preference: the scores differ less than your block-to-block noise. This drill counts at a quarter of its usual weight in the overall sens.</div>`;
  if (r.edge) warn += `<div class="sub warn">Your best score was at the edge of the tested range. Run this drill again with Center sens set to ${r.sens.toFixed(SD())}.</div>`;
  if (isFinite(r.fitSens) && Math.abs(r.fitSens - r.sens) > EPS()) warn += `<div class="sub warn">The fit pointed to ${r.fitSens.toFixed(SD())}, outside your ergonomic range, so it was limited to ${r.sens.toFixed(SD())}.</div>`;
  if (r.hitBound) warn += `<div class="sub warn">Reach matching kept pushing against the ergonomic limit. That points to an adaptation habit, not a real optimum; use Fitts throughput instead.</div>`;
  const chart = r.rounds ? reachChart(r.rounds, M.targetReach) : scoreChart(r, M.axis || 'SCORE', M.fmt);
  return `<article class="card"><div class="card-head"><h3>${name}</h3><span class="val">${r.sens.toFixed(SD())}</span></div>
    <div class="sub">${sub}</div>${warn}<div class="chart">${chart}</div></article>`;
}

// Clear results needs a second click within 3 s.
export function initResults() {
  let armed = false;
  $('clear').addEventListener('click', () => {
    if (!armed) { armed = true; $('clear').textContent = 'Click to confirm'; setTimeout(() => { armed = false; $('clear').textContent = 'Clear results'; }, 3000); return; }
    armed = false; $('clear').textContent = 'Clear results';
    app.saved = app.savedAll[cfg.game] = {}; resetSession(); persist(); emit('results'); emit('overlay');
    $('export-out').hidden = true;
  });
}
