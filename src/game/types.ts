import type * as THREE from 'three';
import type { Team } from '../config';
import type { InkSystem } from '../ink/InkSystem';
import type { Physics } from '../world/Physics';
import type { Sfx } from '../audio/Sfx';
import type { Character } from './Character';
import type { Effects } from './Effects';
import type { Projectiles } from './Projectiles';

/** Everything a character/weapon needs to talk to the running match. */
export interface GameCtx {
  physics: Physics;
  ink: InkSystem;
  projectiles: Projectiles;
  effects: Effects;
  sfx: Sfx;
  characters: Character[];
  listener: THREE.Vector3; // where the local player hears from
  colorOf(team: Team): string;
  damage(target: Character, amount: number, attacker: Character): void;
}
