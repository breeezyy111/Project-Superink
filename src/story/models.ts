import * as THREE from 'three';

// Glossy, toy-like models for story mode: Gloopie turrets, Dr. Gloop and his Gloopmobile,
// bounce pads, checkpoint flags and the Great Ink Orb.

const glossy = (color: string, extra: THREE.MeshPhysicalMaterialParameters = {}) =>
  new THREE.MeshPhysicalMaterial({ color, roughness: 0.25, clearcoat: 0.8, clearcoatRoughness: 0.15, ...extra });
const DARK = '#2a2438';

function eye(r: number, iris = '#1b1530') {
  const g = new THREE.Group();
  const white = new THREE.Mesh(new THREE.SphereGeometry(r, 20, 14), glossy('#ffffff'));
  const pupil = new THREE.Mesh(new THREE.SphereGeometry(r * 0.55, 16, 10), glossy(iris));
  pupil.position.z = r * 0.62;
  const shine = new THREE.Mesh(new THREE.SphereGeometry(r * 0.16, 8, 6), new THREE.MeshBasicMaterial({ color: '#ffffff' }));
  shine.position.set(r * 0.18, r * 0.22, r * 0.98);
  g.add(white, pupil, shine);
  return g;
}

/** A Gloopie: a wobbly goo blob with one big eye and a cannon. Returns parts to animate. */
export function gloopieModel(color: string) {
  const root = new THREE.Group();
  const body = new THREE.Group();
  const goo = glossy(color, { roughness: 0.15, transmission: 0, clearcoat: 1 });
  const blob = new THREE.Mesh(new THREE.SphereGeometry(0.72, 28, 20), goo);
  blob.scale.set(1, 0.85, 1);
  blob.position.y = 0.6;
  const base = new THREE.Mesh(new THREE.CylinderGeometry(0.85, 0.95, 0.25, 24), goo);
  base.position.y = 0.12;
  // drips
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2;
    const d = new THREE.Mesh(new THREE.SphereGeometry(0.16, 10, 8), goo);
    d.position.set(Math.cos(a) * 0.72, 0.22, Math.sin(a) * 0.72);
    d.scale.y = 1.4;
    body.add(d);
  }
  const e = eye(0.3, '#ff2f6d');
  e.position.set(0, 0.78, 0.5);
  const lid = new THREE.Mesh(new THREE.SphereGeometry(0.33, 16, 10, 0, Math.PI * 2, 0, Math.PI * 0.35), glossy(DARK));
  lid.position.copy(e.position);
  lid.rotation.x = -0.5;
  const cannon = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.17, 0.6, 14), glossy(DARK, { metalness: 0.3 }));
  cannon.rotation.x = Math.PI / 2;
  cannon.position.set(0, 0.45, 0.75);
  const ring = new THREE.Mesh(new THREE.TorusGeometry(0.14, 0.04, 8, 16), glossy('#ffe14a'));
  ring.position.set(0, 0.45, 1.05);
  body.add(blob, base, e, lid, cannon, ring);
  root.add(body);
  root.traverse((o) => ((o as THREE.Mesh).isMesh && ((o.castShadow = true), (o.receiveShadow = true))));
  return { root, body };
}

/** Dr. Gloop: a grumpy mad-scientist sea slug in goggles, riding a stompy Gloopmobile. */
export function drGloopModel() {
  const root = new THREE.Group();
  const mobile = new THREE.Group();
  const metal = glossy('#6b5a8e', { metalness: 0.4, roughness: 0.3 });
  const trim = glossy('#ffe14a');
  // hover-tank body
  const hull = new THREE.Mesh(new THREE.CylinderGeometry(2.1, 2.5, 1.3, 32), metal);
  hull.position.y = 1.3;
  const band = new THREE.Mesh(new THREE.TorusGeometry(2.3, 0.12, 10, 40), trim);
  band.rotation.x = Math.PI / 2;
  band.position.y = 1.0;
  mobile.add(hull, band);
  // stompy legs
  const legs: THREE.Group[] = [];
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2 + Math.PI / 4;
    const leg = new THREE.Group();
    const thigh = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.32, 1.2, 12), glossy(DARK));
    thigh.position.y = -0.4;
    const foot = new THREE.Mesh(new THREE.SphereGeometry(0.5, 16, 10), metal);
    foot.scale.y = 0.55;
    foot.position.y = -1.0;
    leg.add(thigh, foot);
    leg.position.set(Math.cos(a) * 1.7, 1.1, Math.sin(a) * 1.7);
    mobile.add(leg);
    legs.push(leg);
  }
  // glass dome with Dr. Gloop inside
  const dome = new THREE.Mesh(
    new THREE.SphereGeometry(1.6, 32, 20, 0, Math.PI * 2, 0, Math.PI / 2),
    new THREE.MeshPhysicalMaterial({ color: '#c9f3ff', roughness: 0.05, transmission: 0.0, transparent: true, opacity: 0.32, clearcoat: 1 }),
  );
  dome.position.y = 1.95;
  const slugMat = glossy('#7dd85a', { roughness: 0.2 });
  const slug = new THREE.Group();
  const sb = new THREE.Mesh(new THREE.SphereGeometry(0.85, 24, 18), slugMat);
  sb.scale.set(1, 1.15, 0.9);
  sb.position.y = 0.7;
  // spots
  for (const [x, y, z, r] of [[0.5, 1.0, 0.5, 0.14], [-0.55, 0.6, 0.45, 0.11], [0.2, 1.4, -0.5, 0.12], [-0.3, 1.25, 0.6, 0.09]]) {
    const s = new THREE.Mesh(new THREE.SphereGeometry(r, 10, 8), glossy('#c25dff'));
    s.position.set(x, y, z);
    slug.add(s);
  }
  // eye stalks
  for (const s of [-1, 1]) {
    const stalk = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.09, 0.6, 8), slugMat);
    stalk.position.set(0.25 * s, 1.75, 0.15);
    stalk.rotation.z = -0.25 * s;
    const e = eye(0.17, '#ff2f6d');
    e.position.set(0.33 * s, 2.08, 0.22);
    slug.add(stalk, e);
  }
  // goggles band + lab coat collar + grumpy mouth
  const goggles = new THREE.Mesh(new THREE.TorusGeometry(0.82, 0.07, 8, 32), glossy(DARK));
  goggles.rotation.x = Math.PI / 2;
  goggles.position.y = 1.25;
  for (const s of [-1, 1]) {
    const lens = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.2, 0.12, 18), glossy('#ffb347', { metalness: 0.3 }));
    lens.rotation.x = Math.PI / 2;
    lens.position.set(0.3 * s, 1.25, 0.8);
    slug.add(lens);
  }
  const coat = new THREE.Mesh(new THREE.CylinderGeometry(0.9, 1.0, 0.5, 24, 1, true), glossy('#ffffff', { side: THREE.DoubleSide }));
  coat.position.y = 0.3;
  const mouth = new THREE.Mesh(new THREE.TorusGeometry(0.18, 0.04, 6, 14, Math.PI), new THREE.MeshStandardMaterial({ color: '#3a1530' }));
  mouth.position.set(0, 0.85, 0.78);
  slug.add(sb, goggles, coat, mouth);
  slug.position.y = 1.95;
  // the stolen orb, glowing on the back: this is the weak spot when it opens up
  const coreMat = new THREE.MeshPhysicalMaterial({ color: '#5ff0d0', emissive: '#5ff0d0', emissiveIntensity: 0.6, roughness: 0.1, clearcoat: 1 });
  const core = new THREE.Mesh(new THREE.SphereGeometry(0.75, 24, 18), coreMat);
  core.position.set(0, 1.4, -2.1);
  const hatch = new THREE.Mesh(new THREE.SphereGeometry(0.9, 20, 14, 0, Math.PI * 2, 0, Math.PI / 2), metal);
  hatch.rotation.x = -Math.PI / 2;
  hatch.position.copy(core.position);
  // cannons
  for (const s of [-1, 1]) {
    const c = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.3, 1.2, 14), glossy(DARK));
    c.rotation.x = Math.PI / 2;
    c.position.set(1.7 * s, 1.6, 1.2);
    mobile.add(c);
  }
  mobile.add(dome, slug, core, hatch);
  root.add(mobile);
  root.traverse((o) => ((o as THREE.Mesh).isMesh && (o.castShadow = true)));
  dome.castShadow = false;
  return { root, mobile, legs, core, coreMat, hatch, slug };
}

/** Springy bounce pad. */
export function padModel(color: string) {
  const g = new THREE.Group();
  const base = new THREE.Mesh(new THREE.CylinderGeometry(1.1, 1.2, 0.25, 28), glossy(DARK));
  base.position.y = 0.12;
  const top = new THREE.Mesh(new THREE.CylinderGeometry(0.95, 0.95, 0.12, 28), glossy(color, { emissive: color, emissiveIntensity: 0.25 }));
  top.position.y = 0.3;
  const arrow = new THREE.Mesh(new THREE.ConeGeometry(0.35, 0.5, 4), new THREE.MeshBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0.8 }));
  arrow.position.y = 1.0;
  g.add(base, top, arrow);
  g.traverse((o) => ((o as THREE.Mesh).isMesh && (o.castShadow = true)));
  return { root: g, top, arrow };
}

/** Checkpoint flag: grey until you reach it. */
export function checkpointModel() {
  const g = new THREE.Group();
  const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 2.6, 8), glossy('#e8e8f0'));
  pole.position.y = 1.3;
  const flagMat = glossy('#9a93ad', { side: THREE.DoubleSide });
  const flag = new THREE.Mesh(new THREE.PlaneGeometry(0.9, 0.6), flagMat);
  flag.position.set(0.48, 2.25, 0);
  const base = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.6, 0.15, 20), glossy(DARK));
  base.position.y = 0.07;
  g.add(pole, flag, base);
  g.traverse((o) => ((o as THREE.Mesh).isMesh && (o.castShadow = true)));
  return { root: g, flag, flagMat };
}

/** A shard of the Great Ink Orb (the goal of each level). */
export function orbModel(big = false) {
  const g = new THREE.Group();
  const r = big ? 1.1 : 0.55;
  const mat = new THREE.MeshPhysicalMaterial({ color: '#5ff0d0', emissive: '#5ff0d0', emissiveIntensity: 0.7, roughness: 0.05, clearcoat: 1 });
  const orb = new THREE.Mesh(big ? new THREE.SphereGeometry(r, 32, 24) : new THREE.OctahedronGeometry(r, 1), mat);
  const halo = new THREE.Mesh(new THREE.TorusGeometry(r * 1.6, 0.05, 8, 40), new THREE.MeshBasicMaterial({ color: '#ffe14a' }));
  halo.rotation.x = Math.PI / 2;
  const glow = new THREE.Mesh(
    new THREE.SphereGeometry(r * 1.9, 20, 14),
    new THREE.MeshBasicMaterial({ color: '#5ff0d0', transparent: true, opacity: 0.18, depthWrite: false }),
  );
  g.add(orb, halo, glow);
  return { root: g, orb, halo };
}
