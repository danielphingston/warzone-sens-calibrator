// Game profiles. To add a game, add an entry: the settings bar, conversions, blend, results and export
// all read from here.
//
//   yaw        view rotation in degrees per mouse count at sens 1
//   decimals   how finely the game's sens field rounds
//   fixedFov   horizontal FOV if the game doesn't let you change it, else null
//   weights    how much each drill counts toward the overall sens (keys are drill ids; a drill
//              missing here doesn't count for this game)
//   apply(s)   HTML telling the player where to enter the sens

export const GAMES = {
  // Valorant is a tactical shooter where fights are decided by flicks and small corrections,
  // so tracking counts less there than in Warzone.
  warzone: { id: 'warzone', name: 'Warzone', scale: 'Call of Duty', fullName: 'Call of Duty: Warzone', yaw: 0.0066, decimals: 2, fixedFov: null,
    weights: { flick: 0.35, track: 0.45, micro: 0.2 },
    apply: s => `Set <b>Mouse Sensitivity</b> to <b>${s}</b> in Warzone and keep <b>ADS multiplier at 1.00</b>.` },
  valorant: { id: 'valorant', name: 'Valorant', scale: 'Valorant', fullName: 'Valorant', yaw: 0.07, decimals: 3, fixedFov: 103,
    weights: { flick: 0.45, track: 0.2, micro: 0.35 },
    apply: s => `Set <b>Sensitivity</b> to <b>${s}</b> in Valorant (Settings → General → Mouse) and keep <b>Scoped Sensitivity Multiplier at 1.000</b>.` }
};
export const DEFAULT_GAME = 'warzone';
