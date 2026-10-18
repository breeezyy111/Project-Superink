import type * as THREE from 'three';
import type { Team } from '../config';
import type { InkSystem, SplatCircle } from '../ink/InkSystem';
import type { Physics } from '../world/Physics';
import type { Sfx } from '../audio/Sfx';
import type { Character } from './Character';
import type { Effects } from './Effects';
import type { Gadgets } from './kit';
import type { Projectiles } from './Projectiles';

/** Everything a character/weapon needs to talk to the running match (or the hub). */
export interface GameCtx {
  physics: Physics;
  ink: InkSystem;
  projectiles: Projectiles;
  effects: Effects;
  gadgets: Gadgets;
  sfx: Sfx;
  characters: Character[];
  listener: THREE.Vector3; // where the local player hears from
  /** subs and specials enabled? (off in the hub) */
  allowKit: boolean;
  colorOf(team: Team): string;
  damage(target: Character, amount: number, attacker: Character): void;
  /** paint on behalf of a character: credits special gauge + turf points */
  paintBy(owner: Character, circles: SplatCircle[]): void;
  /** ink explosion: paints and deals falloff damage in a radius */
  explode(at: THREE.Vector3, radius: number, max: number, min: number, team: Team, owner: Character, exclude?: Character): void;
}
