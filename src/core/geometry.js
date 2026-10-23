// View directions on the unit sphere from yaw/pitch in degrees. Pure.

export const rad = d => d * Math.PI / 180;
export const dirOf = (y, p) => [Math.cos(rad(p)) * Math.sin(rad(y)), Math.sin(rad(p)), Math.cos(rad(p)) * Math.cos(rad(y))];
export const dot3 = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
// Forward, right and up vectors of a camera looking along (yaw, pitch).
export function basis(cam) {
  const f = dirOf(cam.yaw, cam.pitch), Y = rad(cam.yaw), r = [Math.cos(Y), 0, -Math.sin(Y)];
  const u = [f[1] * r[2] - f[2] * r[1], f[2] * r[0] - f[0] * r[2], f[0] * r[1] - f[1] * r[0]];
  return { f, r, u };
}
// True angle in degrees between two view directions.
export const angleBetween = (y1, p1, y2, p2) => Math.acos(Math.min(1, dot3(dirOf(y1, p1), dirOf(y2, p2)))) * 180 / Math.PI;
