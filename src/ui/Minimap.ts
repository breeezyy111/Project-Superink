import * as THREE from 'three';
import type { Match } from '../game/Match';
import type { InkFace } from '../ink/InkSystem';

const PX_PER_M = 3; // one pixel per ownership cell
const MAX_W = 150;
const MAX_H = 230;

interface CellRef {
  face: InkFace;
  idx: number;
  pixel: number;
}

/**
 * Top-down map of the stage: floors shaded by height, painted with each team's ink,
 * plus you and your teammates. Oriented so your team's base is at the bottom.
 */
export class Minimap {
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private ink = document.createElement('canvas');
  private inkCtx!: CanvasRenderingContext2D;
  private img!: ImageData;
  private base!: Uint8ClampedArray;
  private cells: CellRef[] = [];
  private w = 0;
  private h = 0;
  private scale = 1;
  private minX = 0;
  private maxZ = 0;
  private refreshT = 0;
  private colors: [number[], number[]] = [[0, 0, 0], [0, 0, 0]];
  private match: Match | null = null;

  constructor(private root: HTMLElement) {
    this.canvas = root.querySelector('canvas')!;
    this.ctx = this.canvas.getContext('2d')!;
  }

  setup(m: Match) {
    this.match = m;
    const b = m.stage.info.bounds;
    // a little margin so edge floors are visible
    this.minX = b.minX - 1.5;
    const maxX = b.maxX + 1.5;
    const minZ = b.minZ - 1.5;
    this.maxZ = b.maxZ + 1.5;
    this.w = Math.ceil((maxX - this.minX) * PX_PER_M);
    this.h = Math.ceil((this.maxZ - minZ) * PX_PER_M);
    this.ink.width = this.w;
    this.ink.height = this.h;
    this.inkCtx = this.ink.getContext('2d')!;
    this.img = this.inkCtx.createImageData(this.w, this.h);
    this.base = new Uint8ClampedArray(this.w * this.h * 4);

    this.scale = Math.min(MAX_W / this.w, MAX_H / this.h);
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const cw = Math.round(this.w * this.scale), ch = Math.round(this.h * this.scale);
    this.canvas.style.width = `${cw}px`;
    this.canvas.style.height = `${ch}px`;
    this.canvas.width = Math.round(cw * dpr);
    this.canvas.height = Math.round(ch * dpr);

    this.colors = [hexRgb(m.pair.alpha), hexRgb(m.pair.bravo)];

    // floor faces, lowest first so higher platforms draw on top
    const floors = m.ink.faces.filter((f) => f.isFloor).sort((a, b2) => a.wOrigin.y - b2.wOrigin.y);
    const ys = floors.map((f) => f.wOrigin.y);
    const lo = Math.min(...ys, 0), hi = Math.max(...ys, 1);
    const owner = new Map<number, CellRef>();
    const p = new THREE.Vector3();
    for (const f of floors) {
      const shade = 150 + Math.round(((f.wOrigin.y - lo) / Math.max(0.01, hi - lo)) * 80);
      const cw2 = f.w / f.cols, chh = f.h / f.rows;
      for (let r = 0; r < f.rows; r++)
        for (let c = 0; c < f.cols; c++) {
          p.copy(f.wOrigin).addScaledVector(f.wU, (c + 0.5) * cw2).addScaledVector(f.wV, (r + 0.5) * chh);
          const px = this.px(p.x, p.z);
          if (px < 0) continue;
          const i = px * 4;
          this.base[i] = shade;
          this.base[i + 1] = shade;
          this.base[i + 2] = shade + 8;
          this.base[i + 3] = 255;
          owner.set(px, { face: f, idx: r * f.cols + c, pixel: px });
        }
    }
    this.cells = [...owner.values()];
    this.refreshT = 0;
    this.root.classList.remove('hidden');
  }

  /** world x/z -> pixel index (your base at the bottom, your right on the right) */
  private px(x: number, z: number) {
    // Alpha looks toward +z with -x on its right
    const sx = Math.floor((this.w - 1) - (x - this.minX) * PX_PER_M);
    const sy = Math.floor((this.maxZ - z) * PX_PER_M);
    if (sx < 0 || sy < 0 || sx >= this.w || sy >= this.h) return -1;
    return sy * this.w + sx;
  }

  private screen(x: number, z: number): [number, number] {
    const k = this.canvas.width / this.w;
    return [((this.w - 1) - (x - this.minX) * PX_PER_M) * k, (this.maxZ - z) * PX_PER_M * k];
  }

  private paintInk() {
    const d = this.img.data;
    d.set(this.base);
    const [a, b] = this.colors;
    for (const c of this.cells) {
      const o = c.face.owner[c.idx];
      if (!o) continue;
      const col = o === 1 ? a : b;
      const i = c.pixel * 4;
      d[i] = col[0];
      d[i + 1] = col[1];
      d[i + 2] = col[2];
    }
    this.inkCtx.putImageData(this.img, 0, 0);
  }

  update(dt: number) {
    const m = this.match;
    if (!m) return;
    this.refreshT -= dt;
    if (this.refreshT <= 0) {
      this.refreshT = 0.25;
      this.paintInk();
    }
    const g = this.ctx;
    g.imageSmoothingEnabled = false;
    g.clearRect(0, 0, this.canvas.width, this.canvas.height);
    g.drawImage(this.ink, 0, 0, this.canvas.width, this.canvas.height);

    const k = this.canvas.width / this.w;
    // Zone Control: outline the zone in the holding team's color
    const z = m.zones;
    if (z) {
      const [x1, y1] = this.screen(z.rect.minX, z.rect.minZ);
      const [x2, y2] = this.screen(z.rect.maxX, z.rect.maxZ);
      g.lineWidth = 2.2 * k;
      g.setLineDash([4 * k, 3 * k]);
      g.strokeStyle = z.owner === -1 ? '#ffffff' : m.colorOf(z.owner);
      g.strokeRect(Math.min(x1, x2), Math.min(y1, y2), Math.abs(x2 - x1), Math.abs(y2 - y1));
      g.setLineDash([]);
    }
    // teammates as dots, you as an arrow
    for (const c of m.characters) {
      if (c.team !== m.player.team || !c.alive) continue;
      const [x, y] = this.screen(c.pos.x, c.pos.z);
      if (c.isPlayer) continue;
      g.fillStyle = m.colorOf(c.team);
      g.strokeStyle = '#15121c';
      g.lineWidth = 2 * k * 0.5;
      g.beginPath();
      g.arc(x, y, 3.2 * k, 0, Math.PI * 2);
      g.fill();
      g.stroke();
    }
    const p = m.player;
    if (p.alive) {
      const [x, y] = this.screen(p.pos.x, p.pos.z);
      // world yaw 0 faces +z (map up); +yaw turns toward +x, which is map-left
      const ang = -p.input.aimYaw;
      g.save();
      g.translate(x, y);
      g.rotate(ang);
      g.fillStyle = '#ffffff';
      g.strokeStyle = '#15121c';
      g.lineWidth = 1.2 * k;
      const s = 4.5 * k;
      g.beginPath();
      g.moveTo(0, -s * 1.3);
      g.lineTo(s, s);
      g.lineTo(0, s * 0.45);
      g.lineTo(-s, s);
      g.closePath();
      g.fill();
      g.stroke();
      g.restore();
    }
  }

  hide() {
    this.match = null;
    this.root.classList.add('hidden');
  }
}

function hexRgb(hex: string) {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
