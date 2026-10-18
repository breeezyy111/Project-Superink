import * as THREE from 'three';
import { StageBuilder, StageDef, V } from './Stage';
import { facade } from './textures';

// ---------------------------------------------------------------------------
// Battle stages. Layouts describe Alpha's half (z < 0); Bravo's half is mirrored.
// ---------------------------------------------------------------------------

const skatepark: StageDef = {
  id: 'skatepark',
  name: 'Grindrail Skatepark',
  blurb: 'Ramps, rails and a quarter pipe in the heart of Splashburg.',
  half: { x: 22, z: 44 },
  build(b) {
    b.floor(-22, 22, -44, 44, 'concrete');
    b.walls(22, 44, 5.5, 'tealPanel', 'creamPanel');
    b.spawnDeck(-40);
    b.ramp(V(-8, 2.5, -40), V(-13, 0, -40), 6, 'coralPanel');
    b.ramp(V(8, 2.5, -40), V(13, 0, -40), 6, 'coralPanel');

    b.box(-10, 0, -30, 2.4, 1.4, 2.4, 'creamPanel');
    b.box(10.5, 0, -27, 2.4, 1.4, 2.4, 'creamPanel');
    b.box(3.5, 0, -24, 4, 1.0, 1.0, 'violetPanel');

    b.box(-15.5, 0, -18, 7, 3, 7, 'violetPanel');
    b.ramp(V(-15.5, 3, -14.5), V(-15.5, 0, -7), 3.2, 'violetPanel');
    b.box(-18.8, 3, -21.2, 0.6, 1.0, 0.6, 'metal');

    b.ramp(V(22, 2.6, -18), V(15.5, 0, -18), 9, 'tealPanel', 0.8);
    b.box(19.5, 0, -24, 5, 2.6, 3, 'tealPanel');

    b.box(-6.5, 0, -12, 5, 1.2, 0.7, 'coralPanel');
    b.box(7, 0, -9, 0.7, 1.2, 5, 'coralPanel');
    b.box(13, 0, -36, 3, 1.8, 3, 'tealPanel');
    b.box(-13, 0, -33, 3, 1.8, 1.4, 'tealPanel');

    b.box(0, 0, -1.5, 9, 1.6, 3, 'creamPanel');
    b.ramp(V(0, 1.6, -3), V(0, 0, -8), 5, 'creamPanel');
    b.ramp(V(-4.5, 1.6, -1.5), V(-8.5, 0, -1.5), 3, 'coralPanel');

    b.box(-9, 0, 4, 0.25, 0.5, 8, 'metal');
    b.box(11, 0, -4, 0.25, 0.5, 6, 'metal');
    b.box(16, 0, -2, 6, 1.2, 4, 'metal');

    b.street();
    b.skyline(22, 44);
    b.graffiti(0, -21.99, 2.3, -28, Math.PI / 2, 8);
    b.graffiti(1, 21.99, 2.3, 28, -Math.PI / 2, 8);
    b.graffiti(2, -21.99, 2.3, 20, Math.PI / 2, 8);
    b.graffiti(3, 21.99, 2.3, -6, -Math.PI / 2, 7);
    b.graffiti(2, 0, 2.3, -43.99, 0, 9);
    b.graffiti(0, 0, 2.3, 43.99, Math.PI, 9);
    for (const [x, z] of [[-23, -10], [23, 10], [-23, 30], [23, -30]]) b.lamp(x, z, 1);
  },
};

const galleria: StageDef = {
  id: 'galleria',
  name: 'Splashburg Galleria',
  blurb: 'A shiny shopping plaza with a fountain, kiosks and upstairs walkways.',
  half: { x: 24, z: 40 },
  build(b) {
    b.floor(-24, 24, -40, 40, 'plaza', 0, 12);
    // storefront walls
    b.walls(24, 40, 8, 'brick', 'creamPanel');
    b.spawnDeck(-36, 'deck');

    // center fountain (un-inkable water, solid basin)
    const basin = new THREE.Mesh(new THREE.CylinderGeometry(3.2, 3.4, 0.9, 40), new THREE.MeshStandardMaterial({ color: '#efe2c2', roughness: 0.5 }));
    basin.position.set(0, 0.45, 0);
    basin.castShadow = true;
    b.add(basin);
    const water = new THREE.Mesh(new THREE.CylinderGeometry(2.9, 2.9, 0.1, 40), new THREE.MeshPhysicalMaterial({ color: '#46c3ff', roughness: 0.05, clearcoat: 1 }));
    water.position.set(0, 0.86, 0);
    b.add(water);
    const spout = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.6, 2.6, 16), new THREE.MeshStandardMaterial({ color: '#d6c8a8', roughness: 0.5 }));
    spout.position.set(0, 1.3, 0);
    spout.castShadow = true;
    b.add(spout);
    const ball = new THREE.Mesh(new THREE.SphereGeometry(0.7, 20, 14), new THREE.MeshPhysicalMaterial({ color: '#46c3ff', roughness: 0.05, clearcoat: 1, transparent: true, opacity: 0.8 }));
    ball.position.set(0, 2.9, 0);
    b.add(ball);
    b.solid(0, 0, 0, 5.6, 2.6, 5.6, false);

    // upstairs walkway along the right side with an escalator (metal = un-inkable)
    b.box(19.5, 0, -14, 9, 2.6, 16, 'creamPanel');
    b.ramp(V(19.5, 2.6, -22), V(19.5, 0, -29), 4, 'metal');
    b.box(15.2, 2.6, -14, 0.25, 1, 12, 'glass');

    // kiosks and planters
    b.box(-7, 0, -24, 3.2, 2.2, 2.2, 'yellowPanel');
    b.sign('FIZZ POPS', -7, 2.9, -22.85, 3.2, 0, '#ff5ca8', '#fff');
    b.box(-14, 0, -12, 3, 0.9, 3, 'creamPanel');
    b.tree(-14, -12, 0.9, 0.9);
    b.box(8, 0, -18, 3, 0.9, 3, 'creamPanel');
    b.tree(8, -18, 0.9, 0.9);
    b.box(-5, 0, -7, 1.2, 4.5, 1.2, 'brick');
    b.box(9, 0, -3.5, 5, 1.0, 0.8, 'mintPanel');
    b.box(-17, 0, -26, 4, 1.4, 1.2, 'mintPanel');
    b.box(2, 0, -28, 1.0, 0.6, 3, 'planks');

    // storefront dressing on the side walls
    const shops = ['NEWFIN', 'SQUISH', 'BUBBLES', 'GLOW', 'KICKS'];
    for (let i = 0; i < 5; i++) {
      const z = -32 + i * 16;
      const left = i % 2 === 0;
      const x = left ? -22.95 : 22.95;
      const rot = left ? Math.PI / 2 : -Math.PI / 2;
      const glass = new THREE.Mesh(new THREE.PlaneGeometry(7, 3.2), new THREE.MeshPhysicalMaterial({ color: '#9fdcff', roughness: 0.05, clearcoat: 1, transparent: true, opacity: 0.85 }));
      glass.position.set(x + (left ? 0.03 : -0.03), 1.8, z);
      glass.rotation.y = rot;
      b.add(glass);
      b.sign(shops[i], x + (left ? 0.05 : -0.05), 5.4, z, 6, rot, ['#ffe14d', '#5cd6ff', '#ff8a3c', '#9b7bff', '#7dff5c'][i], '#15121c');
      b.awning(x + (left ? 0.9 : -0.9), 3.9, z, 7, rot, '#ff5c8a', '#ffffff', false);
    }
    b.street();
    b.skyline(24, 40, 10, 0, 22, 50);
    b.lamp(-12, 4);
    b.lamp(12, -4);
  },
};

const containerYard: StageDef = {
  id: 'yard',
  name: 'Dockside Container Yard',
  blurb: 'Stacked shipping containers, narrow lanes and catwalks under the cranes.',
  half: { x: 26, z: 42 },
  build(b) {
    b.floor(-26, 26, -42, 42, 'asphalt', 0, 13);
    b.walls(26, 42, 6.2, 'containerBlue', 'containerRed');
    b.spawnDeck(-38);
    const C = (x: number, y: number, z: number, rot: number, s: 'containerRed' | 'containerBlue' | 'containerYellow' | 'containerGreen') =>
      b.boxRot(x, y, z, 6, 2.6, 2.4, rot, s, { trim: false });
    C(-13, 0, -28, 0, 'containerRed');
    b.ramp(V(-13, 2.6, -29.2), V(-13, 0, -35), 2.2, 'metal');
    C(9, 0, -27, Math.PI / 2, 'containerBlue');
    C(17, 0, -16, 0, 'containerGreen');
    b.ramp(V(17, 2.6, -14.8), V(17, 0, -8.5), 3, 'metal');
    C(-4, 0, -17, 0.3, 'containerYellow');
    C(-19, 0, -10, Math.PI / 2, 'containerBlue');
    C(-19, 2.6, -10, Math.PI / 2, 'containerYellow'); // tall stack: swim up its inked walls
    C(6, 0, -8, 0, 'containerRed');
    // center: two containers + a bridge container on top
    C(0, 0, -3, 0, 'containerGreen');
    C(0, 2.6, 0, Math.PI / 2, 'containerRed');
    b.ramp(V(0, 2.6, -4.2), V(0, 0, -10.2), 3, 'metal');
    // pallets
    b.box(-8, 0, -34, 2, 1.1, 2, 'planks');
    b.box(14, 0, -33, 2.4, 0.8, 1.6, 'planks');
    b.box(-22, 0, -22, 1.6, 1.1, 1.6, 'planks');
    // catwalk between a container stack and the side
    b.box(-21, 2.6, -28, 10, 0.3, 2.2, 'metal');

    // gantry cranes (decor) straddling the yard
    const yellow = new THREE.MeshStandardMaterial({ color: '#f0b62e', roughness: 0.5, metalness: 0.3 });
    for (const z of [-22, 22]) {
      const g = new THREE.Group();
      for (const x of [-29, 29]) {
        const leg = new THREE.Mesh(new THREE.BoxGeometry(1.2, 22, 1.2), yellow);
        leg.position.set(x, 11, 0);
        leg.castShadow = true;
        g.add(leg);
      }
      const beam = new THREE.Mesh(new THREE.BoxGeometry(62, 1.6, 2), yellow);
      beam.position.y = 22;
      beam.castShadow = true;
      g.add(beam);
      const cab = new THREE.Mesh(new THREE.BoxGeometry(3, 2.4, 3), new THREE.MeshStandardMaterial({ color: '#2f6fd1', roughness: 0.4 }));
      cab.position.set(z > 0 ? 8 : -8, 20.4, 0);
      g.add(cab);
      g.position.z = z;
      b.add(g);
    }
    b.water(-1.5);
    b.skyline(26, 42, 30, 0, 10, 30, ['x']);
    b.lamp(-27, 0, 0, 9);
    b.lamp(27, 0, 0, 9);
  },
};

const rooftops: StageDef = {
  id: 'rooftops',
  name: 'Skyline Courts',
  blurb: 'Two rooftops and a basketball court linked by narrow bridges. Mind the gap!',
  half: { x: 24, z: 42 },
  killY: -8,
  build(b) {
    // Alpha roof (floor() is not mirrored, so lay both roofs)
    b.floor(-24, 24, -42, -16, 'roof', 0, 12);
    b.floor(-24, 24, 16, 42, 'roof', 0, 12);
    b.box(0, -1, 0, 24, 1, 20, 'court', { mirror: false, inkSides: false });
    // bridges over the gaps
    b.box(-9, -0.5, -13, 4, 0.5, 6.2, 'planks');
    b.box(9, -0.5, -13, 4, 0.5, 6.2, 'planks');
    b.box(0, -0.4, -13, 1.2, 0.4, 6.2, 'metal');
    // parapets on the long sides and back
    b.box(-24.5, 0, -29, 1, 1, 26, 'brick');
    b.box(24.5, 0, -29, 1, 1, 26, 'brick');
    b.box(0, 0, -42.5, 50, 2.5, 1, 'brick');
    b.box(-12.5, 0, 0, 1, 1, 20, 'brick', { mirror: false });
    b.box(12.5, 0, 0, 1, 1, 20, 'brick', { mirror: false });
    b.spawnDeck(-37);

    // rooftop clutter
    b.box(-14, 0, -27, 2.6, 1.6, 2, 'metal');
    b.box(14, 0, -24, 4, 3, 4, 'brick');
    b.ramp(V(14, 3, -22), V(14, 0, -17.2), 2.6, 'brick');
    b.box(-6, 0, -21, 3, 0.4, 3, 'glass');
    b.box(5, 0, -30, 1.2, 1.2, 4, 'yellowPanel');
    b.box(-19, 0, -20, 3, 1.2, 1, 'mintPanel');

    // water tower (decor + solid legs)
    const tower = new THREE.Group();
    const wood = new THREE.MeshStandardMaterial({ color: '#a8714a', roughness: 0.8 });
    const tank = new THREE.Mesh(new THREE.CylinderGeometry(1.8, 1.8, 3, 20), wood);
    tank.position.y = 5;
    const cone = new THREE.Mesh(new THREE.ConeGeometry(2, 1.4, 20), new THREE.MeshStandardMaterial({ color: '#4a3a5a', roughness: 0.6 }));
    cone.position.y = 7.2;
    tower.add(tank, cone);
    for (const [x, z] of [[-1.2, -1.2], [1.2, -1.2], [-1.2, 1.2], [1.2, 1.2]]) {
      const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, 3.5, 8), wood);
      leg.position.set(x, 1.75, z);
      tower.add(leg);
    }
    tower.position.set(-18, 0, -34);
    tower.traverse((o) => (o.castShadow = true));
    b.add(tower, true);
    b.solid(-18, 0, -34, 3, 3.5, 3);

    // court hoops
    for (const z of [-9.3, 9.3]) {
      const hoop = new THREE.Group();
      const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, 3.4, 10), new THREE.MeshStandardMaterial({ color: '#333', metalness: 0.5, roughness: 0.4 }));
      pole.position.y = 1.7;
      const board = new THREE.Mesh(new THREE.BoxGeometry(1.8, 1.1, 0.08), new THREE.MeshStandardMaterial({ color: '#fff', roughness: 0.3 }));
      board.position.set(0, 3.3, z > 0 ? -0.3 : 0.3);
      const rim = new THREE.Mesh(new THREE.TorusGeometry(0.3, 0.03, 8, 20), new THREE.MeshStandardMaterial({ color: '#ff6a2a' }));
      rim.rotation.x = Math.PI / 2;
      rim.position.set(0, 2.95, z > 0 ? -0.65 : 0.65);
      hoop.add(pole, board, rim);
      hoop.position.set(0, 0, z);
      hoop.traverse((o) => (o.castShadow = true));
      b.add(hoop);
    }
    b.solid(0, 0, -9.3, 0.4, 3.4, 0.4, true);
    b.box(-5, 0, -4, 3, 0.55, 0.9, 'planks');

    // the buildings under the roofs and the long drop
    const bld = (z: number, d: number, base: string) => {
      const t = facade(base, '#3e3a73').clone();
      t.needsUpdate = true;
      t.repeat.set(8, 6);
      const m = new THREE.Mesh(new THREE.BoxGeometry(48, 40, d), new THREE.MeshStandardMaterial({ map: t, roughness: 0.7 }));
      m.position.set(0, -21, z);
      b.add(m);
    };
    bld(-29, 26, '#c6b5ff');
    bld(29, 26, '#ffb38a');
    bld(0, 20, '#9fe0f0');
    b.street(-41);
    b.skyline(24, 42, 14, -41, 40, 80);
  },
};

const boardwalk: StageDef = {
  id: 'boardwalk',
  name: 'Seaside Boardwalk',
  blurb: 'Sunny piers, beach huts and an arcade. Fall off the edge and you\'re fish food.',
  half: { x: 20, z: 44 },
  killY: -1.4,
  build(b) {
    b.floor(-14, 14, -44, 44, 'planks', 0, 14);
    b.box(17, -1, -25, 6, 1, 10, 'planks', { inkSides: false });
    b.box(-17, -1, -8, 6, 1, 8, 'planks', { inkSides: false });
    // arcade building backs at both ends
    b.box(0, -1, -45, 30, 7, 2, 'mintPanel', { mirror: false });
    b.box(0, -1, 45, 30, 7, 2, 'mintPanel', { mirror: false });
    b.spawnDeck(-40, 'yellowPanel');

    // railings with gaps so some edges are open to the sea
    b.box(-14.25, 0, -37, 0.3, 0.9, 14, 'planks');
    b.box(14.25, 0, -37, 0.3, 0.9, 14, 'planks');
    b.box(-14.25, 0, -17, 0.3, 0.9, 6, 'planks');
    b.box(20.15, 0, -25, 0.3, 0.9, 10, 'planks');

    // beach huts
    b.box(-8, 0, -27, 4, 3, 3.5, 'coralPanel');
    b.ramp(V(-8, 3, -25.25), V(-8, 0, -19.5), 2.4, 'coralPanel');
    b.box(9, 0, -19, 3.5, 3, 4, 'mintPanel');
    b.box(-11, 0, -9, 2.4, 1.3, 2.4, 'yellowPanel');
    b.box(5, 0, -33, 3, 1.2, 1.2, 'creamPanel');

    // arcade kiosk
    b.box(1, 0, -14, 8, 3.2, 4, 'violetPanel');
    b.ramp(V(-3, 3.2, -14), V(-9.5, 0, -14), 3.6, 'violetPanel');
    b.sign('ARCADE', 1, 4.2, -14, 6, 0, '#9b7bff', '#e4ff2f');
    b.sign('ARCADE', 1, 4.2, -14.01, 6, Math.PI, '#9b7bff', '#e4ff2f');

    // bandstand in the middle
    b.box(0, 0, 0, 7, 1.2, 6, 'creamPanel', { mirror: false });
    b.ramp(V(0, 1.2, -3), V(0, 0, -6.5), 4, 'creamPanel');
    const roof = new THREE.Mesh(new THREE.ConeGeometry(4.6, 1.8, 8), new THREE.MeshStandardMaterial({ color: '#ff5c8a', roughness: 0.5 }));
    roof.position.set(0, 6.2, 0);
    roof.castShadow = true;
    b.add(roof);
    for (const [x, z] of [[-3, -2.5], [3, -2.5], [-3, 2.5], [3, 2.5]]) {
      const post = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.15, 4.2, 10), new THREE.MeshStandardMaterial({ color: '#fff', roughness: 0.4 }));
      post.position.set(x, 3.3, z);
      post.castShadow = true;
      b.add(post);
    }
    b.solid(-3, 1.2, -2.5, 0.3, 4, 0.3);
    b.solid(3, 1.2, -2.5, 0.3, 4, 0.3);

    // lifeguard tower on the pier
    b.box(17, 0, -27, 2, 2.4, 2, 'yellowPanel');
    // beach umbrellas
    for (const [x, z, c] of [[17, -22, '#ff5c5c'], [-17, -6, '#5cd6ff']] as [number, number, string][]) {
      const g = new THREE.Group();
      const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 2.6, 8), new THREE.MeshStandardMaterial({ color: '#fff' }));
      pole.position.y = 1.3;
      const top = new THREE.Mesh(new THREE.ConeGeometry(1.4, 0.6, 12), new THREE.MeshStandardMaterial({ color: c, roughness: 0.6 }));
      top.position.y = 2.6;
      g.add(pole, top);
      g.position.set(x, 0, z);
      g.traverse((o) => (o.castShadow = true));
      b.add(g, true);
    }
    b.palm(-12.5, -30);
    b.palm(12.5, -6);

    // ferris wheel far beyond each end
    for (const z of [-75, 75]) {
      const g = new THREE.Group();
      const ring = new THREE.Mesh(new THREE.TorusGeometry(14, 0.5, 8, 48), new THREE.MeshStandardMaterial({ color: '#fff', roughness: 0.4 }));
      g.add(ring);
      for (let i = 0; i < 12; i++) {
        const a = (i / 12) * Math.PI * 2;
        const spoke = new THREE.Mesh(new THREE.BoxGeometry(0.2, 14, 0.2), new THREE.MeshStandardMaterial({ color: '#ddd' }));
        spoke.position.set(Math.cos(a) * 7, Math.sin(a) * 7, 0);
        spoke.rotation.z = a + Math.PI / 2;
        g.add(spoke);
        const cab = new THREE.Mesh(new THREE.BoxGeometry(1.6, 1.6, 1.6), new THREE.MeshStandardMaterial({ color: ['#ff5c8a', '#5cd6ff', '#ffe14d', '#7dff5c'][i % 4] }));
        cab.position.set(Math.cos(a) * 14, Math.sin(a) * 14 - 1, 0);
        g.add(cab);
      }
      g.position.set(z > 0 ? 20 : -20, 16, z);
      g.rotation.y = 0.4;
      b.add(g);
    }
    b.water(-1.2);
    b.skyline(20, 44, 18, 0, 12, 30, ['x']);
  },
};

export const STAGES: StageDef[] = [skatepark, galleria, containerYard, rooftops, boardwalk];

export function stageById(id: string) {
  return STAGES.find((s) => s.id === id) ?? STAGES[0];
}

export type { StageBuilder };
