import { STAGES } from '../world/stages';
import type { StageDef } from '../world/Stage';
import type { Mode } from './Match';

/** Stages rotate every two hours, the same for everyone (based on the clock). */
export const ROTATION_MS = 2 * 60 * 60 * 1000;
/** Coin bonus for playing a stage that's on rotation for that mode. */
export const ROTATION_BONUS = 0.25;

export interface Rotation {
  turf: [StageDef, StageDef];
  zones: [StageDef, StageDef];
  /** ms until the next rotation */
  endsIn: number;
}

export function currentRotation(now = Date.now()): Rotation {
  const slot = Math.floor(now / ROTATION_MS);
  // seeded shuffle so every player sees the same stages
  let seed = (slot * 2654435761) >>> 0;
  const rnd = () => {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    return seed / 4294967296;
  };
  const list = [...STAGES];
  for (let i = list.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    [list[i], list[j]] = [list[j], list[i]];
  }
  // with five stages, the fifth one gets a turn in the next rotation
  const z = [list[2], list[3 + Math.floor(rnd() * 2)]] as [StageDef, StageDef];
  return { turf: [list[0], list[1]], zones: z, endsIn: (slot + 1) * ROTATION_MS - now };
}

export function onRotation(mode: Mode, stageId: string, rot = currentRotation()) {
  return rot[mode].some((s) => s.id === stageId);
}

export function formatEndsIn(ms: number) {
  const m = Math.max(1, Math.round(ms / 60000));
  const h = Math.floor(m / 60);
  return h > 0 ? `${h}h ${m % 60}m` : `${m}m`;
}
