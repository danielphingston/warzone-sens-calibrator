// "Export for AI": an analysis prompt plus every block and target, with field definitions.
import { VERSION, WARMUP, BRACKET, REPS, JITTER_MM, TRACK_MS, SETTLE_MS, REACT_MS } from '../config.js';
import { $, saveFile, stamp } from './dom.js';
import { cfg, app, G, yaw, SD, rs, fovNow, cm360, recBounds, overall } from '../app/state.js';
import { DRILLS, DRILL_IDS } from '../registry/drills.js';
import { METHODS } from '../registry/methods.js';
import { TRACK_PRESETS } from '../registry/tracking-presets.js';
import { r2 } from '../core/stats.js';
import * as units from '../core/units.js';
import { recordingInfo } from './recorder.js';

// Per-drill constants, named <drill>TargetRadiusDeg, <drill>DistanceDeg and <drill>TimeoutMs.
const drillConstants = () => Object.fromEntries(DRILL_IDS.flatMap(k => {
  const D = DRILLS[k];
  return [[`${k}TargetRadiusDeg`, D.radius], ...(D.distance ? [[`${k}DistanceDeg`, D.distance]] : []), ...(D.timeout ? [[`${k}TimeoutMs`, D.timeout]] : [])];
}));

export const promptText = () => `You are an expert in human motor control, Fitts' law and competitive FPS aiming. Below is raw data from a browser-based mouse sensitivity calibration for ${G().fullName || G().name}. Please analyze it and recommend a sensitivity.

Context:
- Units: angles in degrees of in-game view rotation, times in milliseconds. ${G().name} turns ${G().yaw} degrees per mouse count at sens 1, so cm per 360 = 360 / (${G().yaw} * sens * dpi) * 2.54.${G().fixedFov ? ` FOV is fixed at ${G().fixedFov} degrees horizontal.` : ''}
${cfg.notes.trim() ? `- From the player: ${cfg.notes.trim()}\n` : ''}- Flick and micro-adjust blocks test one sens each for a set number of targets, in shuffled order; the first ${WARMUP} targets of each block are warm-up after a sens change. A target ends on the first click (hit or miss) unless the method is "reach".
- Tracking blocks score the fraction of time the crosshair stayed within the target radius on a strafing target; when the drill's reactionTimeExcluded is true, the first ${REACT_MS} ms after each direction reversal is not scored. Target motion presets are in constants.trackTargetMotion; the preset used is testedWith.trackPreset.
- Drills may come from different sessions or days, with different settings. Each drill's testedWith shows the settings it was run with; the setup section shows the settings at export time.

Please:
1. Check data quality: warm-up effects, outliers, timeouts, and learning or fatigue across blocks (use "order" and "t", which count within one test session).
2. For each drill, estimate the sens that maximizes performance and give an uncertainty range. Say whether the curve fit the page used looks reasonable.
3. Look for signs of over-adaptation to high sens: systematic undershoot of the first movement (reach well below ~0.9), many corrections, large endpoint spread (dx), misses that fall short versus past the target, and whether performance drops faster at low or at high sens.
4. Recommend one ${G().name} sens and a transition plan from the current high sens (steps, how long at each step, and what to re-test), respecting the ergonomic limits in the setup section.
5. Check whether each drill's "flat" flag and likely range (lo/hi) are justified by the data, and whether the Bayesian search (if setup.search is "bayes") stopped too early.
6. Say what additional data would make you more confident.

If a .webm screen recording is attached, use it to watch the actual mouse paths: trial.videoT and block.videoT give the second in the video where each target or tracking block started (details in the "video" section).

Field definitions are in the "definitions" section of the JSON.`;

const DEFINITIONS = {
  'trial.D': 'Angular distance from crosshair to target center when the target appeared (deg).',
  'trial.dirDeg': 'Direction of the target from the crosshair: 0 = right, 90 = up, 180 = left, -90 = down.',
  'trial.mt': 'Time from target appearing to the click that ended it (ms). For timeouts, the timeout length.',
  'trial.hit': 'Whether the ending click was inside the target radius.',
  'trial.timeout': 'True if no click ended the target before the timeout.',
  'trial.misses': 'Reach method only: clicks outside the target before the hit.',
  'trial.dx': 'Click position along the start-to-target line relative to target center (deg). Positive = past the target, negative = short.',
  'trial.dy': 'Click position perpendicular to that line (deg).',
  'trial.reach': 'Where the first fast movement (primary submovement) stopped, as a fraction of D. 1.0 = target center. Null if no clear flick was detected.',
  'trial.rt': 'Reaction time: target appearing until movement reached 10% of its peak speed (ms).',
  'trial.peak': 'Peak angular speed of the first movement (deg/s).',
  'trial.corrections': 'Number of corrective movements after the first one.',
  'trial.videoT': 'Seconds into the attached screen recording when this target appeared; null if it was not recorded.',
  'trial.warmup': 'First 2 targets after a sens change; excluded from scoring.',
  'block.order': 'Order the block was played within its test session; a full test numbers flicks, tracking and micro in one sequence. Drills with a different testedWith.startedAt came from other sessions, so their orders are not comparable.',
  'block.t': 'Seconds from the start of the test session to the end of this block, pauses included.',
  'block.score': 'The block score under the drill method (throughput in bit/s, precision score, or tracking fraction on target).',
  'track.meanErrDeg': 'Mean angular distance between crosshair and target center while tracking.',
  'track.lagDeg': 'Mean signed distance along the target’s direction of motion. Positive = crosshair trailing behind, negative = running ahead.',
  'fit': 'Least-squares quadratic of ln(block score) versus ln(sens) over all blocks: ln(score) = a + b·u + c·u², u = ln(sens) − curve.xm. Fixed-bracket drills also fit a straight line in block order to absorb practice or fatigue (trendPerBlock, ln units per block). peakSens is the highest point of the curve inside the tested range. resultSens is peakSens, or for a flat drill the mean (in ln sens) of the bootstrap peaks, limited to the ergonomic range when limits are enforced.',
  'likelyRange': 'lo/hi: 10th and 90th percentile of the best sens over 300 bootstrap resamples of the blocks.',
  'flat': 'True when the fitted curve rises less than 1.5× the residual block noise (curveRise and blockNoise, both in ln units), the likely range covers more than 75% of the tested range, or the curve bends upward with its low point inside the range. Flat drills count at 25% weight in the overall blend.',
  'testedWith': 'Settings this drill was run with: session start, center sens and cm/360, mouse scaling correction, raw input, reaction-time exclusion, ergonomic limits, targets per block, delay between targets, tracking preset. Missing for results saved before this field existed.',
  'posterior': 'Bayesian search only: 80% interval of the posterior peak when the search stopped (width in ln units).',
  'excludeReactionTime': 'When true, throughput uses mt minus rt (time from movement onset). rt under 100 ms (movement carried over from the previous target) is replaced by the block median rt.'
};

export function buildExport() {
  const strip = r => r && {
    method: r.method, resultSens: r.sens, fitSens: r.fitSens, edgeOfRange: r.edge, date: r.date, dpiAtTest: r.dpi, fovAtTest: r.fov,
    likelyRange: [r.lo, r.hi], flat: r.flat, blockNoise: r.noise, curveRise: r.rise, search: r.search, blocksUsed: r.blocksUsed, posterior: r.posterior, reactionTimeExcluded: r.excludeRT, points: r.points, curve: r.curve, trackingLagDeg: r.lag, hitErgonomicBound: r.hitBound,
    peakSens: r.peakSens, trendPerBlock: r.trendPerBlock,
    testedWith: r.session && { ...r.session, centerCm360: r2(units.cm360(r.session.centerSens, yaw(), r.dpi || cfg.dpi)) },
    blocks: r.blocks, rounds: r.rounds
  };
  const o = overall(), recInfo = recordingInfo();
  const data = {
    tool: 'Warzone Sens Calibrator', game: G().name, version: VERSION, exportedAt: new Date().toISOString(),
    setup: {
      dpi: cfg.dpi, fovSetting: fovNow(), sensDecimals: SD(), centerSens: cfg.startSens, centerCm360: r2(cm360(cfg.startSens)),
      method: cfg.method, targetsPerBlock: cfg.perBlock, warmupPerBlock: WARMUP, nextTargetDelayMs: cfg.gap, search: cfg.search, excludeReactionTime: cfg.excludeRT,
      rawInput: app.rawInput, browserScaleCorrection: app.scale, mousepadCm: cfg.padCm,
      ergonomicLimitsEnforced: cfg.enforceErgo,
      ergonomicRange: { sensMin: rs(recBounds().lo), sensMax: rs(recBounds().hi), cm360Slowest: r2(recBounds().slowCm), cm360Fastest: r2(recBounds().fastCm), jitterAssumptionMm: JITTER_MM, note: 'Recommended range. When ergonomicLimitsEnforced is false, tests and results could go anywhere from 2 to 200 cm/360.' }
    },
    constants: {
      degPerCountAtSens1: yaw(), ...drillConstants(), trackScoredMs: TRACK_MS, trackSettleMs: SETTLE_MS,
      trackTargetMotion: { preset: cfg.trackSpeed, ...TRACK_PRESETS[cfg.trackSpeed], units: 'vmin/vmax deg/s, tmin/tmax ms between direction changes, acc deg/s^2' },
      trackReactionWindowExcludedMs: REACT_MS, bracketMultipliers: BRACKET, repsPerSens: REPS,
      blendWeights: G().weights, reachMethodTarget: METHODS.reach && METHODS.reach.targetReach
    },
    overall: o && { sens: o.sens, cm360: r2(cm360(o.sens)), pulledToErgonomicEdge: o.clamped, parts: o.parts.map(p => ({ drill: p.k, sens: rs(p.s), share: r2(p.share) })) },
    video: recInfo ? { startedAt: recInfo.startedAt, durationS: Math.round(recInfo.durationMs / 100) / 10, codec: recInfo.codec, resolution: `${recInfo.width}x${recInfo.height}`, fps: recInfo.fps, sizeBytes: recInfo.sizeBytes, note: 'trial.videoT and block.videoT are seconds into this recording; null means the row was not recorded. A timer is burned into the bottom-left of every frame.' } : null,
    drills: Object.fromEntries(DRILL_IDS.map(k => [k, strip(app.saved[k]) || null])),
    definitions: DEFINITIONS
  };
  return { data, text: `${promptText()}\n\n\`\`\`json\n${JSON.stringify(data, null, 1)}\n\`\`\`\n` };
}

let lastExport = null;
export function initExport() {
  $('export').addEventListener('click', () => {
    lastExport = buildExport();
    const n = DRILL_IDS.filter(k => app.saved[k]).length;
    $('export-text').value = lastExport.text;
    $('export-note').textContent = n ? `${n} drill${n > 1 ? 's' : ''} included · ${(lastExport.text.length / 1024).toFixed(0)} KB` : 'No drills run yet, so the export only has your settings.';
    $('export-out').hidden = false;
  });
  $('copy').addEventListener('click', () => {
    const ta = $('export-text');
    navigator.clipboard.writeText(ta.value).then(() => { $('export-note').textContent = 'Copied. Paste it into a new chat.'; })
      .catch(() => { ta.focus(); ta.select(); $('export-note').textContent = 'Press Ctrl+C to copy the selected text.'; });
  });
  $('download').addEventListener('click', () => {
    if (!lastExport) return;
    saveFile(`sens-data-${stamp()}.json`, new Blob([JSON.stringify({ prompt: promptText(), ...lastExport.data }, null, 2)], { type: 'application/json' }));
    $('export-note').textContent = 'Saved to your downloads.';
  });
}
