// Video recording (opt-in).
// With "Record runs" on, each run is recorded: tests from Start until they finish, practice from Start until Esc.
// Pausing a test with Esc pauses the video, so the clip has no dead time and timestamps stay true.
// The range is copied into a 640×360 canvas on a steady 30 fps clock and encoded as low-bitrate
// WebM. The HUD is in the frame and a timer is burned into the corner; trial.videoT and
// block.videoT in the export say where each target or tracking block starts in the video.
import { $, canvas, saveFile, stamp } from './dom.js';
import { cfg, app } from '../app/state.js';
import { persist } from '../app/storage.js';
import { on } from '../app/events.js';
import { readInputs } from './settings.js';

const REC_W = 640, REC_H = 360, REC_FPS = 30, REC_BPS = 450000, REC_MAX_MS = 15 * 60 * 1000;
const recCanvas = document.createElement('canvas'); recCanvas.width = REC_W; recCanvas.height = REC_H;
const recCtx = recCanvas.getContext('2d');
let rec = null, recBlob = null, recInfo = null;
const recMime = () => ['video/webm;codecs=vp9', 'video/webm;codecs=vp8', 'video/webm'].find(m => window.MediaRecorder && MediaRecorder.isTypeSupported(m));
const fmtSize = b => b < 1048576 ? `${Math.max(1, Math.round(b / 1024))} KB` : `${(b / 1048576).toFixed(1)} MB`;
const fmtTime = ms => { const s = Math.floor(ms / 1000); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`; };
const recElapsed = (r, now = performance.now()) => now - r.t0 - r.pausedMs - (r.pauseAt ? now - r.pauseAt : 0);
function recUI() {
  $('rec-dl').disabled = !recBlob;
  $('rec-dot').className = 'rec-dot' + (rec ? (rec.pauseAt ? ' paused' : ' on') : '');
  if (!recMime()) { $('rec-status').textContent = 'This browser can’t record WebM video. Use Chrome, Edge or Firefox.'; return; }
  if (rec) $('rec-status').textContent = `${rec.pauseAt ? 'Paused' : 'Recording'} ${fmtTime(recElapsed(rec))} · ${fmtSize(rec.bytes)}`;
  else if (recBlob) $('rec-status').textContent = `Last run: ${fmtTime(recInfo.durationMs)} · ${fmtSize(recBlob.size)}. Download it, then Build export so the timestamps match.`;
  else if (cfg.record) $('rec-status').textContent = 'Each run will be recorded from Start: 640×360, 30 fps, about 3–4 MB a minute.';
  else $('rec-status').textContent = 'Recording is off. Turn it on to record each run (only the firing range, kept in this tab until you download it).';
}
// Own steady frame clock, so the video keeps a constant 30 fps whatever the screen refresh rate.
const startClock = r => { r.timer = setInterval(() => recFrame(performance.now()), 1000 / REC_FPS); };
function startRec() {
  const mimeType = recMime(); if (!mimeType || !cfg.record) return;
  if (rec) stopRec();
  const mr = new MediaRecorder(recCanvas.captureStream(REC_FPS), { mimeType, videoBitsPerSecond: REC_BPS });
  const r = { mr, chunks: [], t0: performance.now(), pausedMs: 0, pauseAt: 0, startedAt: new Date().toISOString(), bytes: 0, mimeType };
  mr.ondataavailable = e => { if (e.data && e.data.size) { r.chunks.push(e.data); r.bytes += e.data.size; } };
  mr.onstop = () => {
    recBlob = new Blob(r.chunks, { type: 'video/webm' });
    recInfo = { startedAt: r.startedAt, durationMs: Math.round(r.durationMs), codec: mimeType, width: REC_W, height: REC_H, fps: REC_FPS, sizeBytes: recBlob.size };
    recUI();
  };
  mr.start(1000);
  rec = r;
  startClock(r);
  r.ui = setInterval(recUI, 500);
  recUI();
}
function stopRec() {
  const r = rec; if (!r) return;
  rec = null;
  r.durationMs = recElapsed(r);
  clearInterval(r.timer); clearInterval(r.ui);
  if (r.mr.state !== 'inactive') r.mr.stop();
  recUI();
}
function pauseRec() {
  if (!rec || rec.pauseAt || rec.mr.state !== 'recording') return;
  recFrame(performance.now());
  rec.mr.pause(); rec.pauseAt = performance.now(); clearInterval(rec.timer); recUI();
}
function resumeRec() {
  if (!rec || !rec.pauseAt || rec.mr.state !== 'paused') return;
  rec.pausedMs += performance.now() - rec.pauseAt; rec.pauseAt = 0;
  rec.mr.resume(); startClock(rec); recUI();
}
// Seconds into the current recording, for linking data rows to the video.
const videoT = t => rec ? Math.round(recElapsed(rec, t) / 10) / 100 : null;
function recFrame(now) {
  if (!rec) return;
  if (recElapsed(rec, now) > REC_MAX_MS) { stopRec(); return; }
  recCtx.fillStyle = '#000'; recCtx.fillRect(0, 0, REC_W, REC_H);
  const k = Math.min(REC_W / canvas.width, REC_H / canvas.height), w = canvas.width * k, h = canvas.height * k;
  recCtx.drawImage(canvas, (REC_W - w) / 2, (REC_H - h) / 2, w, h);
  recCtx.font = '500 11px "IBM Plex Mono", Consolas, monospace'; recCtx.textBaseline = 'bottom'; recCtx.textAlign = 'left';
  recCtx.fillStyle = 'rgba(0,0,0,.6)'; recCtx.fillRect(4, REC_H - 20, 70, 16);
  recCtx.fillStyle = '#ec6a52'; recCtx.fillText(`● ${(recElapsed(rec, now) / 1000).toFixed(1)}s`, 8, REC_H - 6);
}

// Details of the last finished recording, for the export (null if none).
export const recordingInfo = () => recInfo;

export function initRecorder() {
  app.videoT = videoT;
  on('session:start', startRec);
  on('session:end', () => setTimeout(stopRec, 800));   // keep the final result screen in the video
  // Practice records from lock to Esc; a test pauses while the mouse is unlocked so the clip has no dead time.
  on('lock', ({ locked }) => {
    const S = app.session;
    if (locked) { if (S && S.practice && !rec && app.state !== 'done') startRec(); else resumeRec(); }
    else if (S && S.practice) stopRec(); else if (app.state !== 'done') pauseRec();   // a finished test stops on its own
  });
  // Turning recording off mid-run stops it; turning it on takes effect from the next Start.
  $('rec-on').addEventListener('change', () => { readInputs(); persist(); if (!cfg.record) stopRec(); recUI(); });
  $('rec-dl').addEventListener('click', () => {
    if (!recBlob) return;
    saveFile(`sens-run-${stamp()}.webm`, recBlob);
  });
  recUI();
}
