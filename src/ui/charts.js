// SVG charts for the result cards.
import { TOL } from '../config.js';
import { SD } from '../app/state.js';
import { esc } from './dom.js';

const AX = 'fill="var(--muted)" font-family="IBM Plex Mono, monospace" font-size="11"';
export function reachChart(R, targetReach) {
  const tr = targetReach;
  const w = 640, h = 190, L = 52, Rt = 18, T = 24, Bm = 40;
  const lo = 0.6, hi = 1.4, y = r => T + (hi - Math.min(hi, Math.max(lo, r))) / (hi - lo) * (h - T - Bm);
  const n = Math.max(R.length, 4), x = i => L + i * (w - L - Rt) / (n - 1);
  const kd = r => Math.abs(r / tr - 1) <= TOL ? 'good' : r > tr ? 'over' : 'under';
  let s = `<svg viewBox="0 0 ${w} ${h}" role="img" aria-label="Where your first flick stopped each round">`;
  s += `<text x="${L}" y="13" ${AX}>WHERE THE FIRST FLICK STOPPED (BAND = ${Math.round(tr * 100)}% ± 6% AIM)</text>`;
  s += `<rect x="${L}" y="${y(tr * (1 + TOL))}" width="${w - L - Rt}" height="${y(tr * (1 - TOL)) - y(tr * (1 + TOL))}" fill="var(--good)" opacity="0.12"/>`;
  for (const t of [0.7, 0.85, 1, 1.15, 1.3]) {
    s += `<line x1="${L}" x2="${w - Rt}" y1="${y(t)}" y2="${y(t)}" stroke="var(--line)" stroke-width="1"${t === 1 ? '' : ' stroke-dasharray="3 4"'}/>`;
    s += `<text x="${L - 8}" y="${y(t) + 4}" text-anchor="end" ${AX}>${Math.round(t * 100)}%</text>`;
  }
  if (R.length > 1) s += `<polyline fill="none" stroke="var(--muted)" stroke-width="1.5" points="${R.map((r, i) => `${x(i)},${y(r.reach)}`).join(' ')}"/>`;
  R.forEach((r, i) => {
    s += `<circle cx="${x(i)}" cy="${y(r.reach)}" r="${i === R.length - 1 ? 6 : 4.5}" fill="var(--${kd(r.reach)})"/>`;
    s += `<text x="${x(i)}" y="${h - Bm + 18}" text-anchor="middle" fill="var(--fg)" font-family="IBM Plex Mono, monospace" font-size="11">${r.sens.toFixed(SD())}</text>`;
    s += `<text x="${x(i)}" y="${h - Bm + 32}" text-anchor="middle" ${AX} font-size="10">R${i + 1}</text>`;
  });
  return s + '</svg>';
}

export function scoreChart(r, label, fmt) {
  const pts = r.points || [];
  if (!pts.length) return '';
  const w = 640, h = 190, L = 84, Rt = 18, T = 24, Bm = 40;
  const s0 = pts[0].sens * 0.93, s1 = pts[pts.length - 1].sens * 1.07, ls0 = Math.log(s0), ls1 = Math.log(s1);
  const x = s => L + (Math.log(s) - ls0) / (ls1 - ls0) * (w - L - Rt);
  const scores = pts.map(p => p.score);
  let lo = Math.min(...scores), hi = Math.max(...scores);
  const pad = (hi - lo) * 0.3 || Math.abs(hi) * 0.1 || 0.05; lo -= pad; hi += pad;
  const y = v => T + (hi - Math.min(hi, Math.max(lo, v))) / (hi - lo) * (h - T - Bm);
  let s = `<svg viewBox="0 0 ${w} ${h}" role="img" aria-label="${label} for each sens tested">`;
  s += `<text x="${L}" y="13" ${AX}>${label}</text>`;
  if (isFinite(r.lo) && isFinite(r.hi)) {
    const a = x(Math.min(s1, Math.max(s0, r.lo))), b = x(Math.min(s1, Math.max(s0, r.hi)));
    s += `<rect x="${a}" y="${T}" width="${Math.max(2, b - a)}" height="${h - Bm - T}" fill="var(--accent)" opacity="0.1"/>`;
  }
  for (let i = 0; i <= 3; i++) {
    const v = lo + (hi - lo) * (i / 3);
    s += `<line x1="${L}" x2="${w - Rt}" y1="${y(v)}" y2="${y(v)}" stroke="var(--line)" stroke-width="1" stroke-dasharray="3 4"/>`;
    s += `<text x="${L - 8}" y="${y(v) + 4}" text-anchor="end" ${AX}>${esc(fmt(v))}</text>`;
  }
  if (r.curve) {
    const { a, b, c, xm } = r.curve, cp = [], f = v => r.curve.log ? Math.exp(v) : v;
    for (let i = 0; i <= 40; i++) { const sv = Math.exp(ls0 + (ls1 - ls0) * i / 40), xx = Math.log(sv) - xm; cp.push(`${x(sv).toFixed(1)},${y(f(a + b * xx + c * xx * xx)).toFixed(1)}`); }
    s += `<polyline fill="none" stroke="var(--muted)" stroke-width="1.5" opacity="0.7" points="${cp.join(' ')}"/>`;
  }
  const bs = Math.min(s1, Math.max(s0, r.sens));
  s += `<line x1="${x(bs)}" x2="${x(bs)}" y1="${T}" y2="${h - Bm}" stroke="var(--accent)" stroke-width="1.5" stroke-dasharray="5 4"/>`;
  s += `<text x="${x(bs) + 6}" y="${T + 12}" fill="var(--accent)" font-family="IBM Plex Mono, monospace" font-size="11">best ${r.sens.toFixed(SD())}</text>`;
  let lastLabel = -1e9;                     // Bayesian runs test many nearby values; skip labels that would overlap
  pts.forEach(p => {
    s += `<circle cx="${x(p.sens)}" cy="${y(p.score)}" r="${p.n > 1 ? 5 : 4}" fill="var(--fg)" opacity="${p.n > 1 ? 1 : 0.75}"/>`;
    if (x(p.sens) - lastLabel >= 44) {
      s += `<text x="${x(p.sens)}" y="${h - Bm + 18}" text-anchor="middle" fill="var(--fg)" font-family="IBM Plex Mono, monospace" font-size="11">${p.sens.toFixed(SD())}</text>`;
      lastLabel = x(p.sens);
    }
  });
  s += `<text x="${(L + w - Rt) / 2}" y="${h - 4}" text-anchor="middle" ${AX} font-size="10">SENS TESTED</text>`;
  return s + '</svg>';
}
