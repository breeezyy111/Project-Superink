import * as THREE from 'three';

interface Particle {
  pos: THREE.Vector3;
  vel: THREE.Vector3;
  life: number;
  maxLife: number;
  size: number;
  color: THREE.Color;
}

interface Tracer {
  mesh: THREE.Mesh;
  life: number;
  maxLife: number;
  width: number;
}

const MAX = 2000;
const dummy = new THREE.Object3D();

/** Ink droplets, splashes and charger tracers. */
export class Effects {
  private mesh: THREE.InstancedMesh;
  private parts: Particle[] = [];
  private tracers: Tracer[] = [];

  constructor(private scene: THREE.Scene) {
    const mat = new THREE.MeshPhysicalMaterial({ roughness: 0.15, clearcoat: 1, clearcoatRoughness: 0.05 });
    this.mesh = new THREE.InstancedMesh(new THREE.SphereGeometry(1, 10, 8), mat, MAX);
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.mesh.setColorAt(0, new THREE.Color());
    this.mesh.frustumCulled = false;
    this.mesh.count = 0;
    scene.add(this.mesh);
  }

  burst(pos: THREE.Vector3, normal: THREE.Vector3 | null, color: string, count: number, speed = 5, size = 0.09) {
    const c = new THREE.Color(color);
    for (let i = 0; i < count && this.parts.length < MAX; i++) {
      const v = new THREE.Vector3(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5).normalize();
      if (normal) v.addScaledVector(normal, 1.2).normalize();
      v.multiplyScalar(speed * (0.4 + Math.random() * 0.8));
      const life = 0.35 + Math.random() * 0.45;
      this.parts.push({ pos: pos.clone(), vel: v, life, maxLife: life, size: size * (0.5 + Math.random()), color: c });
    }
  }

  tracer(from: THREE.Vector3, to: THREE.Vector3, color: string, width = 0.06) {
    const len = from.distanceTo(to);
    const geo = new THREE.CylinderGeometry(1, 1, 1, 8, 1, true);
    geo.rotateX(Math.PI / 2);
    const mat = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.9 });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.copy(from).add(to).multiplyScalar(0.5);
    mesh.lookAt(to);
    mesh.scale.set(width, width, len);
    this.scene.add(mesh);
    this.tracers.push({ mesh, life: 0.22, maxLife: 0.22, width });
  }

  update(dt: number) {
    let n = 0;
    for (let i = this.parts.length - 1; i >= 0; i--) {
      const p = this.parts[i];
      p.life -= dt;
      if (p.life <= 0) {
        this.parts[i] = this.parts[this.parts.length - 1];
        this.parts.pop();
        continue;
      }
      p.vel.y -= 18 * dt;
      p.pos.addScaledVector(p.vel, dt);
      const s = p.size * Math.min(1, (p.life / p.maxLife) * 2.2);
      dummy.position.copy(p.pos);
      dummy.scale.setScalar(s);
      dummy.updateMatrix();
      this.mesh.setMatrixAt(n, dummy.matrix);
      this.mesh.setColorAt(n, p.color);
      n++;
    }
    this.mesh.count = n;
    this.mesh.instanceMatrix.needsUpdate = true;
    if (this.mesh.instanceColor) this.mesh.instanceColor.needsUpdate = true;

    for (let i = this.tracers.length - 1; i >= 0; i--) {
      const t = this.tracers[i];
      t.life -= dt;
      const k = Math.max(0, t.life / t.maxLife);
      t.mesh.scale.x = t.mesh.scale.y = t.width * k;
      (t.mesh.material as THREE.MeshBasicMaterial).opacity = 0.9 * k;
      if (t.life <= 0) {
        this.scene.remove(t.mesh);
        t.mesh.geometry.dispose();
        (t.mesh.material as THREE.Material).dispose();
        this.tracers.splice(i, 1);
      }
    }
  }

  clear() {
    this.parts.length = 0;
    for (const t of this.tracers) this.scene.remove(t.mesh);
    this.tracers.length = 0;
  }

  dispose() {
    this.clear();
    this.scene.remove(this.mesh);
  }
}
