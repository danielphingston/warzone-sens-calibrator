// Overall sens: a weighted blend of each drill's result on a log scale. Pure.
//
// results: { [drillId]: { sens, dpi, flat } }; weights: { [drillId]: number }
// dpi: current DPI (results tested at another DPI are converted to the same physical speed)
// clamp: limits the blend to the allowed range; round: rounds to the game's sens field; eps: half a step.
export const FLAT_WEIGHT = 0.25;

export function blend(results, { weights, dpi, clamp = s => s, round = v => v, eps = 0 }) {
  // A drill whose curve was flat says little about sens, so it counts at a quarter of its usual weight.
  const parts = Object.keys(weights).filter(k => results[k] && isFinite(results[k].sens))
    .map(k => ({ k, s: results[k].sens * (results[k].dpi || dpi) / dpi, w: weights[k] * (results[k].flat ? FLAT_WEIGHT : 1), flat: !!results[k].flat }));
  if (!parts.length) return null;
  const wsum = parts.reduce((a, p) => a + p.w, 0);
  const raw = Math.exp(parts.reduce((a, p) => a + p.w * Math.log(p.s), 0) / wsum);
  const sens = round(clamp(raw));
  return { sens, clamped: Math.abs(sens - round(raw)) > eps, parts: parts.map(p => ({ ...p, share: p.w / wsum })) };
}
