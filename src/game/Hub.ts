import * as THREE from 'three';
import type { Team } from '../config';
import type { Sfx } from '../audio/Sfx';
import type { Renderer } from '../engine/Renderer';
import { Stage, StageDef, V } from '../world/Stage';
import { Character } from './Character';
import { DEFAULT_LOOK, InkfinModel, Look } from './InkfinModel';
import { Kit, KITS } from './items';
import { buildWeaponModel } from './weapons';
import { randomLook } from './Match';
import type { PlayerController } from './PlayerController';
import { InkWorld } from './World';

export type ZoneId = 'tower' | 'arms' | 'threads' | 'studio' | 'locker';

export interface Zone {
  id: ZoneId;
  name: string;
  pos: THREE.Vector3;
}

export const ZONES: Zone[] = [
  { id: 'tower', name: 'Turf Tower', pos: V(0, 0, -26) },
  { id: 'arms', name: 'Fizz & Splash Arms', pos: V(-26, 0, -10) },
  { id: 'studio', name: 'Fin Studio', pos: V(-26, 0, 12) },
  { id: 'threads', name: 'Frill Threads', pos: V(26, 0, -10) },
  { id: 'locker', name: 'Your Locker', pos: V(26, 0, 12) },
];

const shopFront = (b: Parameters<StageDef['build']>[0], z: number, side: -1 | 1, name: string, surface: Parameters<typeof b.box>[6], signBg: string, signFg: string, a: string, c: string) => {
  // building block behind the plaza edge, front face at |x| = 29
  b.box(side * 33.5, 0, z, 9, 8, 11, surface, { trim: false });
  const rot = side < 0 ? Math.PI / 2 : -Math.PI / 2;
  const fx = side * 28.97;
  const door = new THREE.Mesh(new THREE.PlaneGeometry(3, 3.4), new THREE.MeshStandardMaterial({ color: '#2b2440', roughness: 0.4 }));
  door.position.set(fx, 1.7, z);
  door.rotation.y = rot;
  b.add(door);
  const frame = new THREE.Mesh(new THREE.PlaneGeometry(3.5, 3.8), new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.4 }));
  frame.position.set(fx - side * -0.005, 1.9, z);
  frame.rotation.y = rot;
  b.add(frame);
  for (const dz of [-3.6, 3.6]) {
    const win = new THREE.Mesh(new THREE.PlaneGeometry(2.6, 2.4), new THREE.MeshPhysicalMaterial({ color: '#9fdcff', roughness: 0.05, clearcoat: 1, emissive: '#fff4c2', emissiveIntensity: 0.25 }));
    win.position.set(fx, 2, z + dz);
    win.rotation.y = rot;
    b.add(win);
  }
  b.sign(name, side * 28.9, 6.2, z, 8.5, rot, signBg, signFg);
  b.awning(side * 28.2, 4.3, z, 10, rot, a, c, false);
};

export const HUB_DEF: StageDef = {
  id: 'hub',
  name: 'Splashburg Plaza',
  blurb: 'Home sweet home.',
  half: { x: 30, z: 30 },
  mirrored: false,
  build(b) {
    b.floor(-30, 30, -30, 30, 'plaza', 0, 12);
    // Turf Tower
    b.box(0, 0, -34, 18, 34, 10, 'violetPanel', { trim: false });
    b.box(0, 0, -28.5, 8, 0.4, 2, 'creamPanel');
    const door = new THREE.Mesh(new THREE.PlaneGeometry(5, 4.2), new THREE.MeshStandardMaterial({ color: '#2b2440', roughness: 0.3, emissive: '#5ff0d0', emissiveIntensity: 0.15 }));
    door.position.set(0, 2.1, -28.97);
    b.add(door);
    b.sign('TURF TOWER', 0, 9, -28.9, 14, 0, '#e4ff2f', '#ff2fa8');
    b.sign('BATTLE!', 0, 5.2, -28.92, 5, 0, '#ff2fa8', '#ffffff');
    for (let i = 0; i < 5; i++) {
      const stripe = new THREE.Mesh(new THREE.PlaneGeometry(18.02, 0.6), new THREE.MeshStandardMaterial({ color: '#5ff0d0', emissive: '#5ff0d0', emissiveIntensity: 0.4 }));
      stripe.position.set(0, 13 + i * 4, -28.96);
      b.add(stripe);
    }
    // shops
    shopFront(b, -10, -1, 'FIZZ & SPLASH ARMS', 'brick', '#ff8a3c', '#ffffff', '#ff8a3c', '#ffffff');
    shopFront(b, 12, -1, 'FIN STUDIO', 'mintPanel', '#5cd6ff', '#ffffff', '#5cd6ff', '#ffffff');
    shopFront(b, -10, 1, 'FRILL THREADS', 'coralPanel', '#ff5ca8', '#ffe14d', '#ff5ca8', '#ffffff');
    shopFront(b, 12, 1, 'LOCKER', 'yellowPanel', '#2b2b33', '#e4ff2f', '#2b2b33', '#e4ff2f');
    // side walls between/around shops
    b.box(-31, 0, -24, 2, 4, 8, 'creamPanel', { mirror: false });
    b.box(31, 0, -24, 2, 4, 8, 'creamPanel', { mirror: false });
    b.box(-31, 0, 1, 2, 4, 6, 'creamPanel', { mirror: false });
    b.box(31, 0, 1, 2, 4, 6, 'creamPanel', { mirror: false });
    b.box(-31, 0, 24, 2, 4, 12, 'creamPanel', { mirror: false });
    b.box(31, 0, 24, 2, 4, 12, 'creamPanel', { mirror: false });
    b.box(-20, 0, -29.5, 22, 4, 1, 'creamPanel', { mirror: false });
    b.box(20, 0, -29.5, 22, 4, 1, 'creamPanel', { mirror: false });
    // south edge: planters you can look over
    b.box(-17, 0, 30.5, 26, 1.1, 2, 'creamPanel', { mirror: false });
    b.box(17, 0, 30.5, 26, 1.1, 2, 'creamPanel', { mirror: false });
    b.box(0, 0, 31.5, 8, 1.1, 1, 'creamPanel', { mirror: false });

    // central fountain
    const basin = new THREE.Mesh(new THREE.CylinderGeometry(5, 5.3, 0.9, 48), new THREE.MeshStandardMaterial({ color: '#efe2c2', roughness: 0.5 }));
    basin.position.set(0, 0.45, 0);
    basin.castShadow = true;
    b.add(basin);
    const water = new THREE.Mesh(new THREE.CylinderGeometry(4.6, 4.6, 0.1, 48), new THREE.MeshPhysicalMaterial({ color: '#46c3ff', roughness: 0.05, clearcoat: 1 }));
    water.position.set(0, 0.86, 0);
    b.add(water);
    const ped = new THREE.Mesh(new THREE.CylinderGeometry(1, 1.3, 2.4, 24), new THREE.MeshStandardMaterial({ color: '#d6c8a8', roughness: 0.5 }));
    ped.position.set(0, 1.2, 0);
    ped.castShadow = true;
    b.add(ped);
    b.solid(0, 0, 0, 9.4, 1.2, 9.4, false);
    b.solid(0, 0, 0, 2.4, 2.4, 2.4, false);
    // golden Inkfin statue on top, blaster raised to the sky
    const statue = new InkfinModel({ ...DEFAULT_LOOK, hair: 0, mark: 0, head: 'h_cap_white' }, '#ffd23f', 'shooter');
    const wm = buildWeaponModel('shooter', statue.inkMats[0]);
    statue.setWeaponModel(wm.model, wm.drum);
    statue.animate(0.5, { speed: 0, grounded: true, aimPitch: 1.1, inkFrac: 1, swim: false, hidden: false, firing: false, rolling: false, climbing: false });
    const gold = new THREE.MeshPhysicalMaterial({ color: '#ffd23f', metalness: 0.85, roughness: 0.22, clearcoat: 1 });
    statue.root.traverse((o) => {
      if ((o as THREE.Mesh).isMesh) {
        (o as THREE.Mesh).material = gold;
        o.castShadow = true;
      }
    });
    statue.root.scale.setScalar(2.1);
    statue.root.position.set(0, 2.4, 0);
    statue.root.rotation.y = 0.35;
    b.add(statue.root);

    // benches, trees and lamps
    for (const [x, z, r] of [[-11, 6, 0], [11, 6, 0], [-11, -6, 0], [11, -6, 0]] as [number, number, number][]) {
      b.boxRot(x, 0, z, 3, 0.5, 0.9, r, 'planks', { mirror: false, trim: false });
    }
    for (const [x, z] of [[-18, -20], [18, -20], [-18, 22], [18, 22], [-8, 24], [8, 24]]) b.tree(x, z, 0, 1, false);
    for (const [x, z] of [[-14, 0], [14, 0], [-6, -20], [6, -20]]) b.lamp(x, z);
    b.graffiti(4, -10, 2, -28.99, 0, 7);
    b.graffiti(1, 10, 2, -28.99, 0, 7);

    b.street();
    b.skyline(30, 30, 16, 0, 20, 55);
    b.alphaSpawns = [V(0, 0.1, 18)];
    b.alphaYaw = Math.PI;
  },
};

const NPC_NAMES = ['Ruffle', 'Tako', 'Bubbs', 'Pip', 'Coral', 'Nautia'];

/** The walkable hub: you, a few locals, and the doors to every shop. */
export class Hub extends InkWorld {
  player: Character;
  private npcs: { ch: Character; target: THREE.Vector3; wait: number }[] = [];
  nearZone: Zone | null = null;
  inShop = false;

  constructor(private r: Renderer, stage: Stage, sfx: Sfx, private controller: PlayerController, opts: { look: Look; kit: Kit; name: string }) {
    super(r.scene, stage, sfx);
    this.allowKit = false;
    this.ink.setColors(this.colorOf(0), this.colorOf(1));
    this.projectiles.setColors(this.colorOf(0), this.colorOf(1));
    this.player = new Character(opts.name, 0, true, opts.look, opts.kit, this, r.scene);
    this.characters.push(this.player);
    this.player.spawn(stage.info.spawns[0][0], stage.info.spawnYaw[0]);
    controller.reset(stage.info.spawnYaw[0]);
    controller.snapCamera(this.player);
    for (let i = 0; i < NPC_NAMES.length; i++) {
      const ch = new Character(NPC_NAMES[i], 0, false, randomLook(), KITS[i % KITS.length], this, r.scene);
      const a = (i / NPC_NAMES.length) * Math.PI * 2;
      ch.spawn(V(Math.cos(a) * 12, 0.1, Math.sin(a) * 12), Math.random() * 6);
      this.characters.push(ch);
      this.npcs.push({ ch, target: ch.pos.clone(), wait: Math.random() * 4 });
    }
  }

  colorOf(team: Team) {
    return team === 0 ? '#ff2fa8' : '#e4ff2f';
  }

  protected onHit() {}

  /** Swap the player's look / kit after shopping. */
  refreshPlayer(look: Look, kit: Kit, name: string) {
    const pos = this.player.pos.clone(), yaw = this.player.yaw;
    this.player.dispose(this.scene);
    this.characters = this.characters.filter((c) => c !== this.player);
    this.player = new Character(name, 0, true, look, kit, this, this.scene);
    this.characters.unshift(this.player);
    this.player.spawn(pos, yaw);
  }

  update(dt: number) {
    const p = this.player;
    this.controller.enabled = !this.inShop && this.controller.locked;
    if (!this.inShop) this.controller.update(dt, p, this.r.camera, this.physics);
    else {
      p.input.move.set(0, 0);
      p.input.fire = false;
    }
    this.listener.copy(p.pos);

    for (const n of this.npcs) {
      const inp = n.ch.input;
      n.wait -= dt;
      const to = n.target.clone().sub(n.ch.pos).setY(0);
      if (to.length() < 0.8) {
        inp.move.set(0, 0);
        if (n.wait <= 0) {
          const a = Math.random() * Math.PI * 2, r = 8 + Math.random() * 14;
          n.target.set(Math.cos(a) * r, 0, Math.sin(a) * r);
          n.wait = 3 + Math.random() * 6;
        }
      } else {
        to.normalize().multiplyScalar(0.5);
        inp.move.set(to.x, to.z);
        inp.aimYaw = Math.atan2(to.x, to.z);
      }
      // face the player when they come say hi
      if (n.ch.pos.distanceTo(p.pos) < 3.5) {
        inp.move.set(0, 0);
        const d = p.pos.clone().sub(n.ch.pos);
        inp.aimYaw = Math.atan2(d.x, d.z);
      }
      inp.aimPoint.copy(n.ch.pos).add(new THREE.Vector3(Math.sin(inp.aimYaw) * 5, 1, Math.cos(inp.aimYaw) * 5));
    }

    // which door are we standing at?
    this.nearZone = null;
    for (const z of ZONES) if (z.pos.distanceTo(p.pos.clone().setY(0)) < 3.6) this.nearZone = z;

    if (p.pos.y < -5) p.spawn(this.stage.info.spawns[0][0], this.stage.info.spawnYaw[0]);
    this.simulate(dt, true);
  }
}
