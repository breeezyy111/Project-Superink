import RAPIER from '@dimforge/rapier3d-compat';
import * as THREE from 'three';
import { COLL_GROUP_CHAR, COLL_GROUP_MAP, groups } from '../config';

export { RAPIER };

export interface RayHit {
  point: THREE.Vector3;
  normal: THREE.Vector3;
  dist: number;
  parent?: THREE.Object3D; // visual object whose ink faces were hit
  inkable: boolean;
}

export const MAP_ONLY = groups(COLL_GROUP_CHAR, COLL_GROUP_MAP);

export class Physics {
  world!: RAPIER.World;
  private colliderInfo = new Map<number, { parent: THREE.Object3D; inkable: boolean }>();

  private static ready: Promise<void> | null = null;

  static async create() {
    if (!Physics.ready) Physics.ready = RAPIER.init();
    await Physics.ready;
    const p = new Physics();
    p.world = new RAPIER.World({ x: 0, y: 0, z: 0 });
    return p;
  }

  addBox(center: THREE.Vector3, quat: THREE.Quaternion, half: THREE.Vector3, parent: THREE.Object3D, inkable: boolean) {
    const desc = RAPIER.ColliderDesc.cuboid(half.x, half.y, half.z)
      .setTranslation(center.x, center.y, center.z)
      .setRotation({ x: quat.x, y: quat.y, z: quat.z, w: quat.w })
      .setCollisionGroups(groups(COLL_GROUP_MAP, 0xffff));
    const c = this.world.createCollider(desc);
    this.colliderInfo.set(c.handle, { parent, inkable });
    return c;
  }

  addCylinder(center: THREE.Vector3, quat: THREE.Quaternion, halfH: number, r: number, parent: THREE.Object3D) {
    const desc = RAPIER.ColliderDesc.cylinder(halfH, r)
      .setTranslation(center.x, center.y, center.z)
      .setRotation({ x: quat.x, y: quat.y, z: quat.z, w: quat.w })
      .setCollisionGroups(groups(COLL_GROUP_MAP, 0xffff));
    const c = this.world.createCollider(desc);
    this.colliderInfo.set(c.handle, { parent, inkable: false });
    return c;
  }

  createCharacterCollider(radius: number, halfHeight: number) {
    const desc = RAPIER.ColliderDesc.capsule(halfHeight, radius).setCollisionGroups(groups(COLL_GROUP_CHAR, COLL_GROUP_MAP));
    return this.world.createCollider(desc);
  }

  dispose() {
    this.world.free();
    this.colliderInfo.clear();
  }

  step() {
    this.world.step();
  }

  private ray = new RAPIER.Ray({ x: 0, y: 0, z: 0 }, { x: 0, y: -1, z: 0 });

  raycast(origin: THREE.Vector3, dir: THREE.Vector3, maxDist: number): RayHit | null {
    this.ray.origin = { x: origin.x, y: origin.y, z: origin.z };
    this.ray.dir = { x: dir.x, y: dir.y, z: dir.z };
    const hit = this.world.castRayAndGetNormal(this.ray, maxDist, true, undefined, MAP_ONLY);
    if (!hit) return null;
    const info = this.colliderInfo.get(hit.collider.handle);
    return {
      point: origin.clone().addScaledVector(dir, hit.timeOfImpact),
      normal: new THREE.Vector3(hit.normal.x, hit.normal.y, hit.normal.z),
      dist: hit.timeOfImpact,
      parent: info?.parent,
      inkable: info?.inkable ?? false,
    };
  }
}
