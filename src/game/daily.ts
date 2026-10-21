import type { Mode } from './Match';

/** What a finished battle tells the daily challenges. */
export interface BattleStats {
  win: boolean;
  mode: Mode;
  ranked: boolean;
  paintedP: number;
  splats: number;
  specials: number;
}

interface ChallengeDef {
  id: string;
  text: string;
  goal: number;
  coins: number;
  /** how much a battle counts toward it */
  add(b: BattleStats): number;
}

const POOL: ChallengeDef[] = [
  { id: 'win2', text: 'Win 2 battles', goal: 2, coins: 300, add: (b) => (b.win ? 1 : 0) },
  { id: 'play3', text: 'Play 3 battles', goal: 3, coins: 150, add: () => 1 },
  { id: 'paint', text: 'Paint 1,500p of turf', goal: 1500, coins: 250, add: (b) => Math.round(b.paintedP) },
  { id: 'splat', text: 'Splat 10 enemies', goal: 10, coins: 300, add: (b) => b.splats },
  { id: 'special', text: 'Use your special 5 times', goal: 5, coins: 200, add: (b) => b.specials },
  { id: 'zones', text: 'Win a Zone Control battle', goal: 1, coins: 250, add: (b) => (b.win && b.mode === 'zones' ? 1 : 0) },
  { id: 'tower', text: 'Win a Tower Control battle', goal: 1, coins: 250, add: (b) => (b.win && b.mode === 'tower' ? 1 : 0) },
  { id: 'turf', text: 'Win a Turf War battle', goal: 1, coins: 200, add: (b) => (b.win && b.mode === 'turf' ? 1 : 0) },
  { id: 'ranked', text: 'Win a Ranked battle', goal: 1, coins: 400, add: (b) => (b.win && b.ranked ? 1 : 0) },
];

export interface DailyState {
  day: string;
  ids: string[];
  progress: number[];
  done: boolean[];
}

export interface DailyView {
  text: string;
  goal: number;
  progress: number;
  coins: number;
  done: boolean;
}

function today() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/** Same 3 challenges for everyone on a given day. */
function pickFor(day: string) {
  let seed = 0;
  for (const ch of day) seed = (seed * 31 + ch.charCodeAt(0)) >>> 0;
  const list = [...POOL];
  const out: string[] = [];
  while (out.length < 3) {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    out.push(list.splice(seed % list.length, 1)[0].id);
  }
  return out;
}

/** Today's challenges (rolls over to new ones at midnight). */
export function currentDaily(state: DailyState | null | undefined): DailyState {
  const day = today();
  if (state && state.day === day && state.ids?.length === 3) return state;
  return { day, ids: pickFor(day), progress: [0, 0, 0], done: [false, false, false] };
}

export function viewDaily(state: DailyState): DailyView[] {
  return state.ids.map((id, i) => {
    const d = POOL.find((p) => p.id === id)!;
    return { text: d.text, goal: d.goal, progress: Math.min(d.goal, state.progress[i]), coins: d.coins, done: state.done[i] };
  });
}

/** Count a battle. Returns the challenges it just finished (their coins are for the caller to add). */
export function recordBattle(state: DailyState, b: BattleStats): DailyView[] {
  const finished: DailyView[] = [];
  state.ids.forEach((id, i) => {
    if (state.done[i]) return;
    const d = POOL.find((p) => p.id === id)!;
    state.progress[i] += d.add(b);
    if (state.progress[i] >= d.goal) {
      state.done[i] = true;
      finished.push({ text: d.text, goal: d.goal, progress: d.goal, coins: d.coins, done: true });
    }
  });
  return finished;
}
