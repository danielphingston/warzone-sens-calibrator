// Tunable constants shared across the app. Anything a drill, scoring method or game needs to
// vary on its own belongs in its registry entry (src/registry) instead.

export const VERSION = 4;                  // storage/export format version

export const WARMUP = 2;                   // targets at the start of each block that aren't scored
export const BRACKET = [0.62, 0.79, 1, 1.27, 1.6], REPS = 2;
export const MAX_ROUNDS = 8, TOL = 0.06;   // reach matching: round limit, "on target" band around the aim
export const JITTER_MM = 0.1;              // rough size of involuntary hand jitter while aiming

// Tracking blocks: scored time, settle time before scoring starts, and the reaction window after each
// reversal that isn't scored when reaction time is excluded.
export const TRACK_MS = 10000, SETTLE_MS = 1500, REACT_MS = 220;
