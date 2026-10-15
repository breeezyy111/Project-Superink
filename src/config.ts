// Global tuning values for Project SuperInk.

export type Team = 0 | 1; // 0 = Alpha (your team), 1 = Bravo

export interface InkPair {
  name: string;
  alpha: string; // hex color
  bravo: string;
}

// Hand-picked high-contrast pairs, one is chosen at random each match.
export const INK_PAIRS: InkPair[] = [
  { name: 'Citrus vs Tide', alpha: '#ff7a1a', bravo: '#2b4cff' },
  { name: 'Bubblegum vs Lime', alpha: '#ff2fa8', bravo: '#3ce81f' },
  { name: 'Lemon vs Grape', alpha: '#e8ff1f', bravo: '#8a2cff' },
  { name: 'Mint vs Coral', alpha: '#1fffc3', bravo: '#ff4a4a' },
  { name: 'Sky vs Mango', alpha: '#2ec8ff', bravo: '#ffb01f' },
  { name: 'Turquoise vs Magenta', alpha: '#14e0d2', bravo: '#ff1fd6' },
];

export const MATCH_SECONDS = 180;
export const RESPAWN_SECONDS = 4.5;
export const TEAM_SIZE = 4;

export const PHYS = {
  gravity: 24,
  jumpSpeed: 9.5,
  walkSpeed: 6.2,
  walkSpeedEnemyInk: 2.4,
  swimSpeed: 11.5,
  swimSpeedDry: 3.2, // swim form on bare ground
  climbSpeed: 7.5,
  playerRadius: 0.42,
  playerHalfHeight: 0.5, // capsule half height (cylinder part)
};

export const HEALTH = {
  max: 100,
  regenDelay: 1.2,
  regenPerSec: 60,
  enemyInkDps: 18,
  enemyInkDamageCap: 40, // enemy ink can't take you below max - cap
};

export const INK_TANK = {
  max: 100,
  refillSwim: 38, // per second while submerged in own ink
  refillIdle: 7, // per second in kid form not firing
};

// Texel density of the ink paint canvases (pixels per world meter).
export const INK_TEXELS_PER_METER = 14;
// Resolution of the logical ownership grid (cells per meter).
export const OWNER_CELLS_PER_METER = 3;

export const COLL_GROUP_MAP = 0x0001;
export const COLL_GROUP_CHAR = 0x0002;
// Rapier interaction group helper: membership << 16 | filter
export const groups = (member: number, filter: number) => (member << 16) | filter;
