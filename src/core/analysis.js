// Primary-submovement analysis: where the first fast movement of a flick stopped. Pure.
//
// tr: { t0, y0, p0, ty, tp, samples: [{ t, yaw, pitch }] }, angles in degrees, times in ms.

// A degree of yaw covers only cos(pitch) degrees of view when you look up or down, so yaw
// differences are scaled by it to measure real angles (matching the hit test).
export const yawScale = tr => Math.cos((tr.p0 + tr.tp) / 2 * Math.PI / 180);
export function analyzeTrial(tr, tEnd) {
  const kx = yawScale(tr), dy = (tr.ty - tr.y0) * kx, dp = tr.tp - tr.p0, dist = Math.hypot(dy, dp);
  const ux = dy / dist, uy = dp / dist;
  const out = { valid: false, time: tEnd - tr.t0 };
  const s = tr.samples.filter(p => p.t >= tr.t0 - 1 && p.t <= tEnd + 1);
  if (s.length < 4 || out.time < 80) return out;
  const prog = s.map(p => ((p.yaw - tr.y0) * kx * ux + (p.pitch - tr.p0) * uy) / dist);
  // resample (sample-and-hold) onto a 4 ms grid
  const DT = 4, n = Math.floor((tEnd - tr.t0) / DT) + 1, g = new Float64Array(n), gi = new Int32Array(n);
  for (let i = 0, j = 0; i < n; i++) {
    const t = tr.t0 + i * DT;
    while (j < s.length - 1 && s[j + 1].t <= t) j++;
    g[i] = prog[j]; gi[i] = j;
  }
  if (n < 12) return out;
  const vRaw = new Float64Array(n), v = new Float64Array(n);
  for (let i = 2; i < n - 2; i++) vRaw[i] = (g[i + 2] - g[i - 2]) / (4 * DT) * 1000;
  for (let i = 0; i < n; i++) { let a = 0, c = 0; for (let k = -2; k <= 2; k++) if (i + k >= 0 && i + k < n) { a += vRaw[i + k]; c++; } v[i] = a / c; }
  let ip = 0; for (let i = 1; i < n; i++) if (v[i] > v[ip]) ip = i;
  const vpeak = v[ip];
  if (vpeak < 1.0) return out;              // under one target-distance per second: not a flick
  let iEnd = n - 1;
  for (let i = ip + 1; i < n; i++) if (v[i] < 0.12 * vpeak) { iEnd = i; break; }
  const reach = g[iEnd];
  if (!(reach > 0.25 && reach < 2.5)) return out;
  let rt = 0; for (let i = 0; i < n; i++) if (v[i] > 0.1 * vpeak) { rt = i * DT; break; }
  let corrections = 0, sign = 0;
  for (let i = iEnd; i < n; i++) {
    const sg = v[i] > 0.15 * vpeak ? 1 : v[i] < -0.15 * vpeak ? -1 : 0;
    if (sg !== 0 && sg !== sign) corrections++;
    if (sg !== 0) sign = sg;
  }
  const ei = gi[iEnd], e = s[ei];
  const step = Math.max(1, Math.floor(ei / 60)), path = [];
  for (let k = 0; k <= ei; k += step) path.push([s[k].yaw, s[k].pitch]);
  path.push([e.yaw, e.pitch]);
  return { valid: true, reach, time: out.time, rt, corrections, peak: vpeak * dist, endYaw: e.yaw, endPitch: e.pitch, path };
}
