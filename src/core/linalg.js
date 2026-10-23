// Small linear-algebra helpers for fitting y = a + b·x + c·x² (and friends). Pure.

const det3 = m => m[0][0] * (m[1][1] * m[2][2] - m[1][2] * m[2][1]) - m[0][1] * (m[1][0] * m[2][2] - m[1][2] * m[2][0]) + m[0][2] * (m[1][0] * m[2][1] - m[1][1] * m[2][0]);
export function solve3(A, v) {
  const D = det3(A); if (!(Math.abs(D) > 1e-12)) return null;
  const col = k => A.map((row, i) => row.map((c, j) => j === k ? v[i] : c));
  return [det3(col(0)) / D, det3(col(1)) / D, det3(col(2)) / D];
}
export const inv3 = A => { const c0 = solve3(A, [1, 0, 0]), c1 = solve3(A, [0, 1, 0]), c2 = solve3(A, [0, 0, 1]); return c0 && c1 && c2 ? [0, 1, 2].map(i => [c0[i], c1[i], c2[i]]) : null; };
export function chol3(A) {
  const L = [[0, 0, 0], [0, 0, 0], [0, 0, 0]];
  for (let i = 0; i < 3; i++) for (let j = 0; j <= i; j++) {
    let s = A[i][j]; for (let k = 0; k < j; k++) s -= L[i][k] * L[j][k];
    L[i][j] = i === j ? Math.sqrt(Math.max(s, 1e-12)) : s / L[j][j];
  }
  return L;
}
// Normal equations for y = a + b·x + c·x² (optionally with prior precision P and prior mean m).
export function normalEq(X, Y, s2 = 1, P = [0, 0, 0], m = [0, 0, 0]) {
  const A = [[0, 0, 0], [0, 0, 0], [0, 0, 0]], v = [0, 0, 0];
  X.forEach((x, i) => { const f = [1, x, x * x]; for (let r = 0; r < 3; r++) { v[r] += f[r] * Y[i] / s2; for (let c = 0; c < 3; c++) A[r][c] += f[r] * f[c] / s2; } });
  for (let r = 0; r < 3; r++) { A[r][r] += P[r]; v[r] += P[r] * m[r]; }
  return { A, v };
}
export function quadFit(X, Y) { const { A, v } = normalEq(X, Y); const s = solve3(A, v); return s && { a: s[0], b: s[1], c: s[2] }; }
export const quadAt = (q, x) => q.a + q.b * x + q.c * x * x;
export function peakOnRange(q, x0, x1) {
  let bx = x0, bv = -Infinity;
  for (let i = 0; i <= 60; i++) { const x = x0 + (x1 - x0) * i / 60, v = quadAt(q, x); if (v > bv) { bv = v; bx = x; } }
  return bx;
}
// Least squares for any number of columns (normal equations, Gaussian elimination with pivoting).
export function lsq(rows, Y) {
  const p = rows[0].length, A = Array.from({ length: p }, () => new Array(p + 1).fill(0));
  rows.forEach((f, i) => { for (let r = 0; r < p; r++) { A[r][p] += f[r] * Y[i]; for (let c = 0; c < p; c++) A[r][c] += f[r] * f[c]; } });
  for (let c = 0; c < p; c++) {
    let m = c; for (let r = c + 1; r < p; r++) if (Math.abs(A[r][c]) > Math.abs(A[m][c])) m = r;
    if (!(Math.abs(A[m][c]) > 1e-9)) return null;
    [A[c], A[m]] = [A[m], A[c]];
    for (let r = 0; r < p; r++) if (r !== c) { const k = A[r][c] / A[c][c]; for (let j = c; j <= p; j++) A[r][j] -= k * A[c][j]; }
  }
  return A.map((row, i) => row[p] / row[i]);
}
