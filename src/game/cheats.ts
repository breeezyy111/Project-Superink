/**
 * Admin cheats. Only the admin account can switch these on (see ui/AdminPanel.ts),
 * and they only ever affect the admin's own Inkfin.
 */
export const cheats = {
  /** take no damage */
  god: false,
  /** every hit you land splats */
  oneHit: false,
  infiniteInk: false,
  infiniteSpecial: false,
  /** bots stand still */
  freezeBots: false,
  speed: 1,
  jump: 1,
};

export function resetCheats() {
  Object.assign(cheats, { god: false, oneHit: false, infiniteInk: false, infiniteSpecial: false, freezeBots: false, speed: 1, jump: 1 });
}
