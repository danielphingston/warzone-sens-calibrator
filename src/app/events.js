// A tiny event bus, so the drill engine doesn't need to know which panels, recorders or other
// features react to it. New features subscribe here instead of being called from the engine.
//
// Events:
//   'results'        results or progress changed (re-render the results panel)
//   'overlay'        the click-to-continue overlay may need updating
//   'session:start'  a test or practice session started
//   'drill:end'      a drill finished; payload: { type, result }
//   'session:end'    the last drill of a session finished
//   'lock'           mouse lock changed; payload: { locked }

const handlers = {};
export const on = (name, fn) => { (handlers[name] = handlers[name] || []).push(fn); };
export const emit = (name, payload) => { (handlers[name] || []).forEach(fn => fn(payload)); };
