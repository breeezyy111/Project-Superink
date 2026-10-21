import type { Mode } from './Match';
import { ROTATION_MS } from './rotation';

/** Splatoon 2-style ranks, lowest to highest. */
export const RANKS = ['C-', 'C', 'C+', 'B-', 'B', 'B+', 'A-', 'A', 'A+', 'S', 'S+'] as const;
export const RANKED_LEVEL = 3;

export interface RankResult {
  before: number;
  after: number;
  /** meter before/after (0..100) */
  ptsBefore: number;
  ptsAfter: number;
  delta: number;
  rankUp: boolean;
  rankDown: boolean;
}

/** Points for a win / loss at each rank: climbing gets slower, losing hurts more. */
function winPts(rank: number) {
  return Math.round(22 - rank * 1.4);
}
function lossPts(rank: number) {
  return Math.round(5 + rank * 1.0);
}

/** Apply a ranked result to the rank meter. A knockout win counts for extra. */
export function applyRanked(rank: number, pts: number, win: boolean, ko: boolean): RankResult {
  const before = rank, ptsBefore = pts;
  let delta = win ? Math.round(winPts(rank) * (ko ? 1.5 : 1)) : -lossPts(rank);
  if (rank === RANKS.length - 1 && win) delta = Math.max(4, Math.round(delta * 0.6));
  pts += delta;
  let rankUp = false, rankDown = false;
  if (pts >= 100) {
    if (rank < RANKS.length - 1) {
      rank++;
      pts = 30;
      rankUp = true;
    } else pts = 100;
  } else if (pts < 0) {
    if (rank > 0) {
      rank--;
      pts = 70;
      rankDown = true;
    } else pts = 0;
  }
  return { before, after: rank, ptsBefore, ptsAfter: pts, delta, rankUp, rankDown };
}

/** Bots get tougher as you climb. */
export function rankedSkill(rank: number): [number, number] {
  return [Math.min(0.9, 0.4 + rank * 0.05), Math.min(0.98, 0.62 + rank * 0.035)];
}

/** Ranked alternates between Zone Control and Tower Control with each stage rotation. */
export function rankedMode(now = Date.now()): Mode {
  return Math.floor(now / ROTATION_MS) % 2 === 0 ? 'zones' : 'tower';
}
