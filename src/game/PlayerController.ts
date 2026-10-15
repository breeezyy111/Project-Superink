import * as THREE from 'three';
import type { Physics } from '../world/Physics';
import type { Character } from './Character';

/** Mouse + keyboard controls and the over-the-shoulder camera. */
export class PlayerController {
  yaw = 0;
  pitch = -0.12;
  sensitivity = 0.0024;
  invertY = false;
  private keys = new Set<string>();
  private mouseL = false;
  private mouseR = false;
  private pivot = new THREE.Vector3();
  private camDist = 4.4;
  enabled = false;
  /** may the canvas grab the mouse right now? (true during a match) */
  allowLock = false;
  locked = false;
  onPause: (() => void) | null = null;

  constructor(private canvas: HTMLCanvasElement) {
    window.addEventListener('keydown', (e) => {
      if (e.code === 'Escape') return;
      this.keys.add(e.code);
      if (['Space', 'ShiftLeft', 'ShiftRight'].includes(e.code) && this.enabled) e.preventDefault();
    });
    window.addEventListener('keyup', (e) => this.keys.delete(e.code));
    window.addEventListener('blur', () => {
      this.keys.clear();
      this.mouseL = this.mouseR = false;
    });
    canvas.addEventListener('mousedown', (e) => {
      if (!this.locked) {
        if (this.allowLock) this.requestLock();
        return;
      }
      if (!this.enabled) return;
      if (e.button === 0) this.mouseL = true;
      if (e.button === 2) this.mouseR = true;
    });
    window.addEventListener('mouseup', (e) => {
      if (e.button === 0) this.mouseL = false;
      if (e.button === 2) this.mouseR = false;
    });
    canvas.addEventListener('contextmenu', (e) => e.preventDefault());
    document.addEventListener('pointerlockchange', () => {
      const was = this.locked;
      this.locked = document.pointerLockElement === canvas;
      if (was && !this.locked && this.enabled) this.onPause?.();
    });
    document.addEventListener('mousemove', (e) => {
      if (!this.locked || !this.enabled) return;
      this.yaw -= e.movementX * this.sensitivity;
      this.pitch -= e.movementY * this.sensitivity * (this.invertY ? -1 : 1);
      this.pitch = THREE.MathUtils.clamp(this.pitch, -1.25, 1.05);
    });
  }

  requestLock() {
    try {
      const r = this.canvas.requestPointerLock() as unknown as Promise<void> | undefined;
      if (r && typeof r.catch === 'function') r.catch(() => {});
    } catch {
      /* not allowed right now */
    }
  }

  releaseLock() {
    if (document.pointerLockElement) document.exitPointerLock();
  }

  reset(yaw: number) {
    this.yaw = yaw;
    this.pitch = -0.12;
    this.keys.clear();
    this.mouseL = this.mouseR = false;
  }

  snapCamera(ch: Character) {
    this.pivot.copy(ch.pos);
  }

  /** Fill the character's input from devices and position the camera. */
  update(dt: number, ch: Character, cam: THREE.PerspectiveCamera, physics: Physics) {
    const k = this.keys;
    let mx = 0, mz = 0;
    if (this.enabled) {
      if (k.has('KeyW') || k.has('ArrowUp')) mz += 1;
      if (k.has('KeyS') || k.has('ArrowDown')) mz -= 1;
      if (k.has('KeyD') || k.has('ArrowRight')) mx += 1;
      if (k.has('KeyA') || k.has('ArrowLeft')) mx -= 1;
    }
    const sy = Math.sin(this.yaw), cy = Math.cos(this.yaw);
    // forward (sy, cy), right (-cy, sy)
    const wx = sy * mz + -cy * mx;
    const wz = cy * mz + sy * mx;
    const len = Math.hypot(wx, wz);
    ch.input.move.set(len > 0 ? wx / len : 0, len > 0 ? wz / len : 0);
    ch.input.jump = this.enabled && k.has('Space');
    ch.input.swim = this.enabled && (k.has('ShiftLeft') || k.has('ShiftRight') || this.mouseR);
    ch.input.fire = this.enabled && this.mouseL && !ch.input.swim;
    ch.input.aimYaw = this.yaw;
    ch.input.aimPitch = this.pitch;
    ch.input.aimPoint.copy(this.updateCamera(dt, ch, cam, physics));
  }

  /** Chase camera for spectating a bot-driven character (demo mode). */
  follow(dt: number, ch: Character, cam: THREE.PerspectiveCamera, physics: Physics) {
    let d = ch.input.aimYaw - this.yaw;
    while (d > Math.PI) d -= Math.PI * 2;
    while (d < -Math.PI) d += Math.PI * 2;
    this.yaw += d * Math.min(1, dt * 3);
    this.pitch += (-0.22 - this.pitch) * Math.min(1, dt * 3);
    this.updateCamera(dt, ch, cam, physics);
  }

  /** Over-the-shoulder camera. Returns the world point under the crosshair. */
  private updateCamera(dt: number, ch: Character, cam: THREE.PerspectiveCamera, physics: Physics) {
    const sy = Math.sin(this.yaw), cy = Math.cos(this.yaw);
    const targetPivot = ch.pos.clone();
    this.pivot.lerp(targetPivot, Math.min(1, dt * 14));
    this.pivot.x = targetPivot.x + (this.pivot.x - targetPivot.x) * 0.5;
    this.pivot.z = targetPivot.z + (this.pivot.z - targetPivot.z) * 0.5;
    const head = this.pivot.clone().add(new THREE.Vector3(0, ch.swimming ? 1.25 : 1.75, 0));
    const fwd = new THREE.Vector3(sy * Math.cos(this.pitch), Math.sin(this.pitch), cy * Math.cos(this.pitch));
    const right = new THREE.Vector3(-cy, 0, sy);
    const shoulder = head.clone().addScaledVector(right, 0.55);
    const want = shoulder.clone().addScaledVector(fwd, -this.camDist).add(new THREE.Vector3(0, 0.35, 0));
    const toCam = want.clone().sub(shoulder);
    const d = toCam.length();
    toCam.normalize();
    const hit = physics.raycast(shoulder, toCam, d + 0.3);
    const dist = hit ? Math.max(0.6, hit.dist - 0.3) : d;
    cam.position.copy(shoulder).addScaledVector(toCam, dist);
    cam.lookAt(cam.position.clone().add(fwd));

    // aim point: what's under the crosshair
    const start = cam.position.clone().addScaledVector(fwd, dist + 0.5);
    const aimHit = physics.raycast(start, fwd, 90);
    return aimHit ? aimHit.point : start.clone().addScaledVector(fwd, 90);
  }
}
