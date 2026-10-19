import { DEFAULT_LOOK, Look } from './InkfinModel';
import { STARTER_ITEMS } from './items';
import type { Quality } from '../engine/Renderer';

export type Difficulty = 'easy' | 'normal' | 'hard';

export interface Profile {
  name: string;
  look: Look;
  kit: string;
  owned: string[];
  coins: number;
  xp: number;
  level: number;
  sens: number;
  invert: boolean;
  volume: number;
  music: number;
  difficulty: Difficulty;
  quality: Quality;
  /** true once the player (not auto-tuning) chose a quality */
  qualityChosen: boolean;
  stage: string; // stage id or 'random'
}

const KEY = 'superink.profile.v2';

export function defaultProfile(): Profile {
  return {
    name: 'Player',
    look: { ...DEFAULT_LOOK },
    kit: 'kit_fizz',
    owned: [...STARTER_ITEMS],
    coins: 1000,
    xp: 0,
    level: 1,
    sens: 2.4,
    invert: false,
    volume: 0.6,
    music: 0.45,
    difficulty: 'normal',
    quality: 'high',
    qualityChosen: false,
    stage: 'random',
  };
}

export function loadProfile(): Profile {
  const def = defaultProfile();
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) {
      const p = JSON.parse(raw);
      const merged = { ...def, ...p, look: { ...def.look, ...p.look } } as Profile;
      for (const id of STARTER_ITEMS) if (!merged.owned.includes(id)) merged.owned.push(id);
      return merged;
    }
  } catch {
    /* storage unavailable */
  }
  return def;
}

export function saveProfile(p: Profile) {
  try {
    localStorage.setItem(KEY, JSON.stringify(p));
  } catch {
    /* ignore */
  }
}

export const MAX_LEVEL = 30;

export function xpToNext(level: number) {
  return 400 + level * 250;
}

/** Add XP, returning how many levels were gained. */
export function addXp(p: Profile, amount: number) {
  p.xp += amount;
  let gained = 0;
  while (p.level < MAX_LEVEL && p.xp >= xpToNext(p.level)) {
    p.xp -= xpToNext(p.level);
    p.level++;
    gained++;
  }
  return gained;
}
