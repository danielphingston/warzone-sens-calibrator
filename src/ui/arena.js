// The firing range: draws the 3D view, targets, replay, crosshair, HUD and in-range panels.
import { WARMUP, TRACK_MS, SETTLE_MS } from '../config.js';
import { canvas } from './dom.js';
import { cfg, app, SD, fovNow, cm360, angTo } from '../app/state.js';
import { blockLabel } from '../app/session.js';
import { DRILLS } from '../registry/drills.js';
import { METHODS } from '../registry/methods.js';
import { rad, dirOf, dot3, basis } from '../core/geometry.js';
import { median } from '../core/stats.js';

const ctx = canvas.getContext('2d', { alpha: false, desynchronized: true });
let W = 0, H = 0, sky = null;
let fps = 0, frames = 0, fpsAt = 0;
function resize() {
  // Render at CSS-pixel resolution: far fewer pixels to fill each frame on high-DPI screens.
  W = canvas.clientWidth; H = canvas.clientHeight;
  canvas.width = Math.round(W); canvas.height = Math.round(H);
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  sky = ctx.createLinearGradient(0, 0, 0, H);
  sky.addColorStop(0, '#152027'); sky.addColorStop(1, '#0a0f12');
}
new ResizeObserver(resize).observe(canvas);

const css = n => getComputedStyle(document.documentElement).getPropertyValue(n).trim();
const C = { accent: css('--accent'), over: css('--over'), under: css('--under'), good: css('--good'), fg: css('--fg'), muted: css('--muted') };
const MONO = s => `500 ${s}px "IBM Plex Mono", Consolas, monospace`, DISP = s => `600 ${s}px "Chakra Petch", "Segoe UI", sans-serif`;

export function draw(now) {
  frames++;
  if (now - fpsAt >= 500) { fps = Math.round(frames * 1000 / (now - fpsAt)); frames = 0; fpsAt = now; }
  if (!W) return;
  const B = basis(app.cam), tanH = Math.tan(rad(fovNow() / 2)), half = W / 2;
  const P = d => { const z = dot3(d, B.f); if (z <= 0.03) return null; return [half + dot3(d, B.r) / z / tanH * half, H / 2 - dot3(d, B.u) / z / tanH * half, z]; };
  const rpxAt = (deg, z) => Math.tan(rad(deg)) / tanH * half / z;

  ctx.fillStyle = sky; ctx.fillRect(0, 0, W, H);

  // Whole grid in one path and one stroke. Meridians and the horizon are great circles,
  // which project to straight lines, so they need only a few points each.
  const seg = pts => { let on = false; for (const d of pts) { const p = P(d); if (!p) { on = false; continue; } on ? ctx.lineTo(p[0], p[1]) : ctx.moveTo(p[0], p[1]); on = true; } };
  ctx.lineWidth = 1;
  ctx.strokeStyle = 'rgba(141,154,158,0.13)';
  ctx.beginPath();
  const y0 = Math.floor(app.cam.yaw / 15) * 15;
  for (let y = y0 - 90; y <= y0 + 90; y += 15) seg([dirOf(y, -50), dirOf(y, -25), dirOf(y, 0), dirOf(y, 25), dirOf(y, 50)]);
  for (const p of [-45, -30, -15, 15, 30, 45]) { const pts = []; for (let y = app.cam.yaw - 90; y <= app.cam.yaw + 90; y += 6) pts.push(dirOf(y, p)); seg(pts); }
  ctx.stroke();
  ctx.strokeStyle = 'rgba(240,166,58,0.35)';
  ctx.beginPath(); seg([dirOf(app.cam.yaw - 85, 0), dirOf(app.cam.yaw, 0), dirOf(app.cam.yaw + 85, 0)]); ctx.stroke();

  // Replay of the last flick: dashed ring = where the target was, line = first fast movement, X = where it stopped.
  if (app.ghost && now < app.ghost.until && app.state !== 'trial') {
    const gc = C[app.ghost.color] || C.muted, tpj = P(dirOf(app.ghost.ty, app.ghost.tp));
    if (tpj) {
      ctx.strokeStyle = C.accent; ctx.lineWidth = 1.5; ctx.setLineDash([4, 4]);
      ctx.beginPath(); ctx.arc(tpj[0], tpj[1], rpxAt(app.ghost.r, tpj[2]), 0, Math.PI * 2); ctx.stroke(); ctx.setLineDash([]);
    }
    ctx.strokeStyle = gc; ctx.lineWidth = 2; ctx.globalAlpha = 0.5;
    ctx.beginPath(); seg(app.ghost.a.path.map(p => dirOf(p[0], p[1]))); ctx.stroke(); ctx.globalAlpha = 1;
    const ep = P(dirOf(app.ghost.a.endYaw, app.ghost.a.endPitch));
    if (ep) {
      ctx.lineWidth = 2.5; ctx.beginPath();
      ctx.moveTo(ep[0] - 7, ep[1] - 7); ctx.lineTo(ep[0] + 7, ep[1] + 7); ctx.moveTo(ep[0] + 7, ep[1] - 7); ctx.lineTo(ep[0] - 7, ep[1] + 7);
      ctx.stroke();
    }
  }

  const target = (ty, tp, rdeg, color) => {
    const d = dirOf(ty, tp), p = P(d);
    if (p && p[0] > -20 && p[0] < W + 20 && p[1] > -20 && p[1] < H + 20) {
      const rpx = rpxAt(rdeg, p[2]);
      ctx.fillStyle = color; ctx.globalAlpha = 0.9;
      ctx.beginPath(); ctx.arc(p[0], p[1], rpx, 0, Math.PI * 2); ctx.fill();
      ctx.globalAlpha = 1; ctx.strokeStyle = '#fff'; ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.arc(p[0], p[1], Math.max(2, rpx * 0.35), 0, Math.PI * 2); ctx.stroke();
    } else {
      const a = Math.atan2(-dot3(d, B.u), dot3(d, B.r));
      const cx = W / 2 + Math.cos(a) * (W / 2 - 34), cy = H / 2 + Math.sin(a) * (H / 2 - 34);
      ctx.save(); ctx.translate(cx, cy); ctx.rotate(a); ctx.fillStyle = color;
      ctx.beginPath(); ctx.moveTo(14, 0); ctx.lineTo(-8, -10); ctx.lineTo(-8, 10); ctx.closePath(); ctx.fill(); ctx.restore();
    }
  };
  if (app.state === 'trial' && app.trial) target(app.trial.ty, app.trial.tp, app.trial.r, C.accent);
  if (app.state === 'tracking' && app.trk) target(app.trk.ty, app.trk.tp, app.trk.r, angTo(app.trk.ty, app.trk.tp) <= app.trk.r ? C.good : C.accent);

  // crosshair
  ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 2;
  const cx = W / 2, cy = H / 2;
  ctx.beginPath(); ctx.moveTo(cx - 10, cy); ctx.lineTo(cx - 4, cy); ctx.moveTo(cx + 4, cy); ctx.lineTo(cx + 10, cy);
  ctx.moveTo(cx, cy - 10); ctx.lineTo(cx, cy - 4); ctx.moveTo(cx, cy + 4); ctx.lineTo(cx, cy + 10); ctx.stroke();

  // HUD
  const fs = Math.max(12, Math.min(16, W / 60));
  ctx.font = MONO(fs); ctx.textBaseline = 'top';
  if (app.session && app.session.drill && app.state !== 'done') {
    const d = app.session.drill, tracking = DRILLS[d.type].kind === 'tracking';
    ctx.fillStyle = C.fg; ctx.textAlign = 'left';
    ctx.fillText(`${DRILLS[d.type].name.toUpperCase()}  ·  SENS ${d.sens.toFixed(SD())}  ·  ${cm360(d.sens).toFixed(1)} CM/360`, 14, 12);
    ctx.textAlign = 'right';
    let right;
    const cur = d.cur ? d.cur.trials.length + (app.state === 'trial' ? 1 : 0) : 0;
    if (d.practice) {
      const st = d.stats;
      if (tracking) right = `PRACTICE  ·  ${app.trk && app.trk.total ? Math.round(app.trk.on / app.trk.total * 100) : 0}% ON TARGET  ·  ${app.trk ? Math.floor((now - app.trk.t0) / 1000) : 0}s`;
      else right = `PRACTICE  ·  ${st.n} TARGETS  ·  ${st.n ? Math.round(st.hits / st.n * 100) : 0}% HIT  ·  ${st.mt.length ? Math.round(median(st.mt)) : 0} MS${st.reach.length ? `  ·  FLICK STOPS AT ${Math.round(median(st.reach) * 100)}%` : ''}`;
    } else if (d.adaptive) right = `ROUND ${d.rounds.length + 1}  ·  FLICK ${Math.min(cfg.perBlock, cur)}/${cfg.perBlock}`;
    else if (!tracking) right = `BLOCK ${blockLabel(d, '/').toUpperCase()}  ·  TARGET ${Math.min(cfg.perBlock, cur)}/${cfg.perBlock}`;
    else {
      right = `BLOCK ${blockLabel(d, '/').toUpperCase()}`;
      if (app.state === 'tracking' && app.trk) {
        const left = Math.max(0, SETTLE_MS + TRACK_MS - (now - app.trk.t0)) / 1000;
        right += `  ·  ${left.toFixed(1)}s  ·  ${app.trk.total ? Math.round(app.trk.on / app.trk.total * 100) : 0}% ON`;
        ctx.fillStyle = 'rgba(141,154,158,0.25)'; ctx.fillRect(0, H - 4, W, 4);
        ctx.fillStyle = C.accent; ctx.fillRect(0, H - 4, W * Math.min(1, (now - app.trk.t0) / (SETTLE_MS + TRACK_MS)), 4);
        ctx.fillStyle = C.fg;
      }
    }
    ctx.fillText(right, W - 14, 12);
  }
  if (app.locked) {
    ctx.textAlign = 'right'; ctx.textBaseline = 'bottom'; ctx.fillStyle = fps < 100 ? C.over : C.muted;
    ctx.fillText(`${fps} FPS`, W - 14, H - 10);
    ctx.textBaseline = 'top';
  }
  if (app.flash && now < app.flash.until) {
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.font = DISP(fs * 1.4);
    ctx.fillStyle = C[app.flash.color] || C.muted;
    ctx.fillText(app.flash.text, W / 2, H * 0.68);
  }
  if (app.locked && app.session && app.session.drill) {
    const d = app.session.drill, name = DRILLS[d.type].name;
    const stepTxt = app.session.queue.length > 1 ? `  ·  ${app.session.step + 1} of ${app.session.queue.length}` : '';
    if (app.state === 'intro') {
      const pk = app.session.step > 0 ? app.session.queue[app.session.step - 1] : null;
      const prev = pk && app.saved[pk] ? `${DRILLS[pk].name} done: ${app.saved[pk].sens.toFixed(SD())}.  ` : '';
      panel(d.practice ? [`Practice  ·  ${name}`, `Sens ${d.sens.toFixed(SD())}  (${cm360(d.sens).toFixed(1)} cm/360)  ·  unlimited`, 'Click to start. Esc to stop.'] : [name + stepTxt, DRILLS[d.type].intro, prev + 'Click to start.'], fs);
    } else if (app.state === 'between') {
      const tr = METHODS[d.method].targetReach;
      panel(app.between.repeat
        ? ['Not enough clean flicks', 'Snap to each target in one quick motion.', 'Click to repeat this round.']
        : [`Round done: first flicks stopped at ${Math.round(app.between.r.reach * 100)}% (aim ${Math.round(tr * 100)}%)`, `Next: sens ${app.between.next.toFixed(SD())}  (${cm360(app.between.next).toFixed(1)} cm/360)`, 'Click to start the next round.'], fs);
    } else if (app.state === 'countdown') {
      panel([`${name}  ·  block ${blockLabel(d)}`, `Sens ${d.sens.toFixed(SD())}  (${cm360(d.sens).toFixed(1)} cm/360)`, DRILLS[d.type].kind === 'tracking' ? 'Get on the target and stay there.' : `First ${WARMUP} targets are warm-up.`], fs);
    }
  }
  if (app.locked && (app.state === 'measureArm' || app.state === 'measure')) {
    panel(app.state === 'measureArm'
      ? ['Mouse scaling check', 'Put the mouse at 0 cm on a ruler and click.', 'Then slide it exactly 10 cm right and click again.']
      : ['Slide exactly 10 cm right, then click', `${Math.round(Math.abs(app.measureSum))} counts so far`, `Expected at ${cfg.dpi} DPI: ${Math.round(cfg.dpi * 10 / 2.54)}`], fs);
  }
}
function fitFont(text, maxW, font, size) { ctx.font = font(size); while (size > 9 && ctx.measureText(text).width > maxW) { size -= 1; ctx.font = font(size); } }
function panel(lines, fs) {
  const w = Math.min(W - 40, 640), h = fs * 7.2, x = (W - w) / 2, y = (H - h) / 2, inner = w - 32;
  ctx.fillStyle = 'rgba(8,12,14,0.86)'; ctx.fillRect(x, y, w, h);
  ctx.strokeStyle = C.accent; ctx.lineWidth = 1; ctx.strokeRect(x + .5, y + .5, w - 1, h - 1);
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  fitFont(lines[0], inner, DISP, fs * 1.25); ctx.fillStyle = C.fg; ctx.fillText(lines[0], W / 2, y + h * 0.27);
  fitFont(lines[1], inner, MONO, fs); ctx.fillStyle = C.accent; ctx.fillText(lines[1], W / 2, y + h * 0.55);
  fitFont(lines[2], inner, MONO, fs); ctx.fillStyle = C.muted; ctx.fillText(lines[2], W / 2, y + h * 0.78);
}
