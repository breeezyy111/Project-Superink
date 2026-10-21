import * as THREE from 'three';
import type { StageBuilder, StageDef } from '../world/Stage';

type P3 = [number, number, number];

export interface LevelDef {
  id: string;
  name: string;
  blurb: string;
  /** coins for the first clear */
  coins: number;
  boss?: boolean;
  stage: StageDef;
  spawn: P3;
  turrets?: { at: P3; weapon: 'shooter' | 'blaster' | 'charger' }[];
  troopers?: { at: P3; kit: string }[];
  pads?: { at: P3; power: number }[];
  /** moving platforms: from/to are the top-center of the platform */
  movers?: { from: P3; to: P3; size: [number, number]; speed: number }[];
  checkpoints?: P3[];
  goal: P3;
  enemyInk?: [number, number, number, number][];
  hints?: { at: P3; r: number; text: string }[];
}

/** A pool of purple goo far below the islands (falling in means a respawn). */
function gooSea(b: StageBuilder, y: number) {
  const m = new THREE.Mesh(
    new THREE.PlaneGeometry(400, 400),
    new THREE.MeshPhysicalMaterial({ color: '#6a2fb0', roughness: 0.15, clearcoat: 1, emissive: '#3a1070', emissiveIntensity: 0.25 }),
  );
  m.rotation.x = -Math.PI / 2;
  m.position.y = y;
  m.receiveShadow = true;
  b.add(m);
}

/** Goo-covered pillars under an island so it doesn't look like it floats on nothing. */
function pillar(b: StageBuilder, x: number, z: number, top: number, w = 3) {
  b.box(x, top - 24, z, w, 24 - 0.01, w, 'violetPanel', { inkable: false, trim: false, mirror: false });
}

function stage(id: string, name: string, half: [number, number], killY: number, spawn: P3, build: (b: StageBuilder) => void): StageDef {
  return {
    id, name, blurb: '', half: { x: half[0], z: half[1] }, killY, mirrored: false,
    build(b) {
      build(b);
      gooSea(b, killY + 1.5);
      b.alphaSpawns = [new THREE.Vector3(spawn[0], spawn[1] + 0.1, spawn[2])];
      b.alphaYaw = 0;
    },
  };
}

const L1: LevelDef = {
  id: 'gate', name: 'Gloop Gate', coins: 400,
  blurb: 'Learn the ropes on the way in: shoot, swim, and climb a wall.',
  spawn: [0, 0, 0],
  stage: stage('s_gate', 'Gloop Gate', [16, 52], -8, [0, 0, 0], (b) => {
    b.floor(-5, 5, -4, 8, 'deck', 0);
    pillar(b, 0, 2, 0, 6);
    b.floor(-2, 2, 8, 20, 'planks', 0);
    b.floor(-8, 8, 20, 34, 'concrete', 0);
    pillar(b, 0, 27, 0, 10);
    b.box(-4, 0, 27, 2.4, 1.2, 1, 'yellowPanel', { mirror: false });
    b.box(4, 0, 27, 2.4, 1.2, 1, 'yellowPanel', { mirror: false });
    // the wall you paint and swim up
    b.box(0, 0, 34.5, 16, 4, 1, 'creamPanel', { mirror: false });
    b.floor(-8, 8, 35, 48, 'roof', 4);
    pillar(b, 0, 41, 4, 10);
  }),
  turrets: [
    { at: [-5, 0, 31], weapon: 'shooter' },
    { at: [5, 0, 31], weapon: 'shooter' },
    { at: [0, 4, 43], weapon: 'shooter' },
  ],
  checkpoints: [[0, 0, 21]],
  goal: [0, 4, 46],
  enemyInk: [[0, 4, 40, 3], [-4, 4, 44, 2.5], [4, 4, 44, 2.5]],
  hints: [
    { at: [0, 0, 2], r: 4, text: 'WASD to move. Click to lock the mouse and look around.' },
    { at: [0, 0, 12], r: 3, text: 'Hold left click to shoot ink. Hold Shift to swim in your ink: it refills your tank!' },
    { at: [0, 0, 24], r: 4, text: 'Gloopies! Splat them before they splat you.' },
    { at: [0, 0, 32], r: 4, text: 'Paint the wall, then swim into it to climb up!' },
  ],
};

const L2: LevelDef = {
  id: 'bounce', name: 'Bounce Bay', coins: 500,
  blurb: 'Hop across floating islands on springy bounce pads.',
  spawn: [0, 0, 0],
  stage: stage('s_bounce', 'Bounce Bay', [16, 86], -10, [0, 0, 0], (b) => {
    b.floor(-5, 5, -4, 6, 'deck', 0);
    pillar(b, 0, 1, 0, 6);
    b.floor(-4, 4, 10, 20, 'planks', 3);
    pillar(b, 0, 15, 3, 5);
    b.floor(-5, 5, 37, 47, 'concrete', 3);
    pillar(b, 0, 42, 3, 6);
    b.floor(-6, 6, 51, 63, 'roof', 7);
    pillar(b, 0, 57, 7, 7);
    b.floor(-4, 4, 72, 82, 'deck', 7);
    pillar(b, 0, 77, 7, 5);
  }),
  pads: [
    { at: [0, 0, 4], power: 17 },
    { at: [0, 3, 45], power: 17.5 },
  ],
  movers: [
    { from: [0, 3, 22.5], to: [0, 3, 34.5], size: [3.2, 3.2], speed: 2.6 },
    { from: [-6, 7, 67.5], to: [6, 7, 67.5], size: [3.2, 3.2], speed: 2.4 },
  ],
  turrets: [
    { at: [3, 3, 43], weapon: 'blaster' },
    { at: [-4, 7, 60], weapon: 'shooter' },
    { at: [4, 7, 60], weapon: 'shooter' },
  ],
  checkpoints: [[0, 3, 38], [0, 7, 53]],
  goal: [0, 7, 79],
  hints: [
    { at: [0, 0, 2], r: 3, text: 'Step on the bounce pad and hold W to fly forward!' },
    { at: [0, 3, 19], r: 3, text: 'Ride the moving platform. Time your jump!' },
  ],
};

const L3: LevelDef = {
  id: 'mills', name: 'Murky Mills', coins: 600,
  blurb: "Dr. Gloop's goo is everywhere. Paint your way through.",
  spawn: [0, 0, 0],
  stage: stage('s_mills', 'Murky Mills', [16, 80], -8, [0, 0, 0], (b) => {
    b.floor(-6, 6, -4, 8, 'deck', 0);
    pillar(b, 0, 2, 0, 6);
    b.floor(-10, 10, 8, 40, 'asphalt', 0);
    pillar(b, 0, 24, 0, 12);
    for (const [x, z] of [[-5, 15], [5, 19], [-3, 30], [6, 33], [-7, 25]]) b.box(x, 0, z, 2.2, 1.3, 2.2, 'containerRed', { mirror: false, trim: false });
    b.box(0, 0, 22, 4, 2.2, 1, 'metal', { mirror: false });
    b.floor(-8, 8, 52, 66, 'concrete', 0);
    pillar(b, 0, 59, 0, 8);
    b.box(0, 0, 65.5, 16, 3.2, 1, 'creamPanel', { mirror: false });
    b.floor(-8, 8, 66, 76, 'roof', 3.2);
    pillar(b, 0, 71, 3.2, 8);
  }),
  movers: [
    { from: [-3, 0, 42], to: [-3, 0, 50], size: [3, 3], speed: 3 },
    { from: [3, 0, 50], to: [3, 0, 42], size: [3, 3], speed: 3 },
  ],
  turrets: [
    { at: [-7, 0, 18], weapon: 'shooter' },
    { at: [7, 0, 27], weapon: 'blaster' },
    { at: [0, 0, 36], weapon: 'shooter' },
    { at: [-5, 0, 60], weapon: 'blaster' },
    { at: [5, 3.2, 72], weapon: 'charger' },
  ],
  checkpoints: [[0, 0, 10], [0, 0, 54]],
  goal: [0, 3.2, 74],
  enemyInk: [
    ...Array.from({ length: 22 }, (_, i) => [((i * 37) % 17) - 8, 0, 11 + i * 1.3, 2.6] as [number, number, number, number]),
    [0, 0, 58, 4], [-5, 0, 62, 3], [5, 0, 56, 3], [0, 3.2, 70, 4],
  ],
  hints: [{ at: [0, 0, 6], r: 4, text: 'Enemy ink slows you down and hurts. Paint over it!' }],
};

const L4: LevelDef = {
  id: 'towers', name: 'Gloop Towers', coins: 700,
  blurb: 'Hypnotized Inkfins guard the towers. Splat them to snap them out of it!',
  spawn: [0, 0, 0],
  stage: stage('s_towers', 'Gloop Towers', [18, 66], -8, [0, 0, 0], (b) => {
    b.floor(-6, 6, -4, 8, 'deck', 0);
    pillar(b, 0, 2, 0, 6);
    b.floor(-14, 14, 8, 46, 'plaza', 0);
    pillar(b, 0, 27, 0, 16);
    b.box(-9, 0, 20, 4, 5, 4, 'tealPanel', { mirror: false });
    b.box(9, 0, 28, 4, 5, 4, 'coralPanel', { mirror: false });
    b.box(-4, 0, 34, 3, 1.4, 3, 'containerBlue', { mirror: false, trim: false });
    b.box(4, 0, 15, 3, 1.4, 3, 'containerYellow', { mirror: false, trim: false });
    // the big wall up to the top deck
    b.box(0, 0, 46.5, 28, 6, 1, 'violetPanel', { mirror: false });
    b.floor(-8, 8, 47, 60, 'roof', 6);
    pillar(b, 0, 53, 6, 10);
  }),
  turrets: [
    { at: [-9, 5, 20], weapon: 'shooter' },
    { at: [9, 5, 28], weapon: 'blaster' },
    { at: [-5, 6, 56], weapon: 'charger' },
    { at: [5, 6, 56], weapon: 'shooter' },
  ],
  troopers: [
    { at: [-4, 0, 24], kit: 'kit_fizz' },
    { at: [5, 0, 36], kit: 'kit_roller' },
    { at: [0, 0, 42], kit: 'kit_dualies' },
  ],
  checkpoints: [[0, 0, 11], [0, 6, 49]],
  goal: [0, 6, 58],
  enemyInk: [[0, 0, 40, 4], [-8, 0, 40, 3], [8, 0, 40, 3], [0, 6, 54, 4]],
};

const L5: LevelDef = {
  id: 'gauntlet', name: 'The Gauntlet', coins: 900,
  blurb: "Everything Dr. Gloop has, all at once. The lab is just ahead!",
  spawn: [0, 0, 0],
  stage: stage('s_gauntlet', 'The Gauntlet', [18, 110], -10, [0, 0, 0], (b) => {
    b.floor(-5, 5, -4, 6, 'deck', 0);
    pillar(b, 0, 1, 0, 6);
    b.floor(-8, 8, 10, 26, 'asphalt', 2);
    pillar(b, 0, 18, 2, 10);
    b.box(-3, 2, 18, 2, 1.2, 2, 'containerGreen', { mirror: false, trim: false });
    b.box(4, 2, 22, 2, 1.2, 2, 'containerRed', { mirror: false, trim: false });
    b.floor(-5, 5, 41, 50, 'planks', 2);
    pillar(b, 0, 45, 2, 6);
    b.box(0, 2, 50.5, 10, 4, 1, 'creamPanel', { mirror: false });
    b.floor(-7, 7, 51, 68, 'concrete', 6);
    pillar(b, 0, 59, 6, 8);
    b.floor(-6, 6, 80, 98, 'roof', 6);
    pillar(b, 0, 89, 6, 8);
    b.box(-3, 6, 88, 2.4, 1.3, 2.4, 'containerBlue', { mirror: false, trim: false });
    b.box(3, 6, 92, 2.4, 1.3, 2.4, 'containerYellow', { mirror: false, trim: false });
  }),
  pads: [{ at: [0, 0, 3], power: 17 }],
  movers: [
    { from: [0, 2, 28.5], to: [0, 2, 38.5], size: [3, 3], speed: 3.2 },
    { from: [-5, 6, 71], to: [5, 6, 77], size: [3, 3], speed: 2.6 },
  ],
  turrets: [
    { at: [-6, 2, 24], weapon: 'shooter' },
    { at: [6, 2, 14], weapon: 'blaster' },
    { at: [-3, 2, 48], weapon: 'shooter' },
    { at: [-5, 6, 64], weapon: 'charger' },
    { at: [5, 6, 64], weapon: 'blaster' },
    { at: [0, 6, 96], weapon: 'shooter' },
  ],
  troopers: [
    { at: [3, 2, 20], kit: 'kit_charger' },
    { at: [0, 6, 58], kit: 'kit_bucket' },
    { at: [-3, 6, 85], kit: 'kit_splatling' },
    { at: [4, 6, 90], kit: 'kit_roller' },
  ],
  checkpoints: [[0, 2, 12], [0, 6, 53], [0, 6, 82]],
  goal: [0, 6, 97],
  enemyInk: [[0, 2, 18, 4], [0, 6, 60, 4], [0, 6, 88, 4], [-3, 6, 93, 3], [3, 6, 84, 3]],
};

const BOSS: LevelDef = {
  id: 'lab', name: "Dr. Gloop's Lab", coins: 1500, boss: true,
  blurb: 'Take back the Great Ink Orb!',
  spawn: [0, 0, -13],
  stage: stage('s_lab', "Dr. Gloop's Lab", [20, 20], -8, [0, 0, -13], (b) => {
    b.floor(-17, 17, -17, 17, 'metal', 0);
    pillar(b, 0, 0, 0, 30);
    for (const [x, z, sx, sz] of [[0, -17.5, 36, 1], [0, 17.5, 36, 1], [-17.5, 0, 1, 34], [17.5, 0, 1, 34]] as [number, number, number, number][]) {
      b.box(x, 0, z, sx, 2.5, sz, 'violetPanel', { mirror: false });
    }
    for (const [x, z] of [[-9, -9], [9, -9], [-9, 9], [9, 9]]) b.box(x, 0, z, 2.2, 2.6, 2.2, 'metal', { mirror: false });
  }),
  checkpoints: [],
  goal: [0, 0, 0],
};

export const LEVELS: LevelDef[] = [L1, L2, L3, L4, L5, BOSS];
