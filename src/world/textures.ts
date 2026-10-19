import * as THREE from 'three';

// Procedural textures so the repo needs no binary art assets yet.

function canvas(w: number, h: number) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return [c, c.getContext('2d')!] as const;
}

function noise(ctx: CanvasRenderingContext2D, w: number, h: number, amount: number, count: number) {
  for (let i = 0; i < count; i++) {
    const v = Math.random() < 0.5 ? 0 : 255;
    ctx.fillStyle = `rgba(${v},${v},${v},${Math.random() * amount})`;
    const s = 1 + Math.random() * 2.5;
    ctx.fillRect(Math.random() * w, Math.random() * h, s, s);
  }
}

function tex(c: HTMLCanvasElement, srgb = true) {
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = 8;
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

const cache = new Map<string, THREE.Texture>();
function cached(key: string, make: () => THREE.Texture) {
  let t = cache.get(key);
  if (!t) cache.set(key, (t = make()));
  return t;
}

/** Light concrete slabs with grout lines (one texture = 4m x 4m, 2x2 slabs). */
export function concreteTiles(base = '#bdbab3', line = '#878279') {
  return cached(`tiles${base}${line}`, () => {
    const [c, ctx] = canvas(512, 512);
    ctx.fillStyle = base;
    ctx.fillRect(0, 0, 512, 512);
    noise(ctx, 512, 512, 0.06, 9000);
    // subtle per-slab tint
    for (let y = 0; y < 2; y++)
      for (let x = 0; x < 2; x++) {
        ctx.fillStyle = `rgba(${Math.random() < 0.5 ? 0 : 255},${Math.random() < 0.5 ? 0 : 255},0,0.025)`;
        ctx.fillRect(x * 256, y * 256, 256, 256);
      }
    ctx.strokeStyle = line;
    ctx.lineWidth = 5;
    for (let i = 0; i <= 2; i++) {
      ctx.beginPath(); ctx.moveTo(i * 256, 0); ctx.lineTo(i * 256, 512); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(0, i * 256); ctx.lineTo(512, i * 256); ctx.stroke();
    }
    // a few skate scuffs
    ctx.strokeStyle = 'rgba(40,40,40,0.08)';
    ctx.lineWidth = 3;
    for (let i = 0; i < 14; i++) {
      ctx.beginPath();
      const x = Math.random() * 512, y = Math.random() * 512;
      ctx.moveTo(x, y);
      ctx.quadraticCurveTo(x + Math.random() * 80 - 40, y + Math.random() * 80 - 40, x + Math.random() * 120 - 60, y + Math.random() * 120 - 60);
      ctx.stroke();
    }
    const t = tex(c);
    (t as any).userData = { meters: 4 };
    return t;
  });
}

/** Painted wall panel with a top stripe and rivets (one texture = 4m x 4m). */
export function wallPanel(base: string, stripe: string) {
  return cached(`panel${base}${stripe}`, () => {
    const [c, ctx] = canvas(512, 512);
    ctx.fillStyle = base;
    ctx.fillRect(0, 0, 512, 512);
    noise(ctx, 512, 512, 0.05, 9000);
    ctx.fillStyle = stripe;
    ctx.fillRect(0, 18, 512, 22);
    ctx.fillStyle = 'rgba(0,0,0,0.12)';
    ctx.fillRect(0, 40, 512, 4);
    ctx.strokeStyle = 'rgba(0,0,0,0.18)';
    ctx.lineWidth = 3;
    ctx.beginPath(); ctx.moveTo(256, 44); ctx.lineTo(256, 512); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(0, 44); ctx.lineTo(0, 512); ctx.stroke();
    ctx.fillStyle = 'rgba(255,255,255,0.35)';
    for (const x of [16, 240, 272, 496]) for (const y of [60, 490]) {
      ctx.beginPath(); ctx.arc(x, y, 5, 0, Math.PI * 2); ctx.fill();
    }
    return tex(c);
  });
}

/** Diamond-plate metal: in SuperInk, metal is UN-inkable (like Splatoon grates). */
export function metalPlate() {
  return cached('metal', () => {
    const [c, ctx] = canvas(256, 256);
    const g = ctx.createLinearGradient(0, 0, 256, 256);
    g.addColorStop(0, '#9aa3ad');
    g.addColorStop(1, '#7d8792');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 256, 256);
    for (let y = 0; y < 8; y++)
      for (let x = 0; x < 8; x++) {
        const cx = x * 32 + (y % 2) * 16, cy = y * 32 + 16;
        ctx.save();
        ctx.translate(cx, cy);
        ctx.rotate(((x + y) % 2 ? 1 : -1) * 0.7);
        ctx.fillStyle = 'rgba(255,255,255,0.35)';
        ctx.fillRect(-11, -3, 22, 6);
        ctx.fillStyle = 'rgba(0,0,0,0.22)';
        ctx.fillRect(-11, 2, 22, 2);
        ctx.restore();
      }
    return tex(c);
  });
}

/** Yellow/black hazard stripe edge trim. */
export function hazard() {
  return cached('hazard', () => {
    const [c, ctx] = canvas(256, 64);
    ctx.fillStyle = '#ffd21f';
    ctx.fillRect(0, 0, 256, 64);
    ctx.fillStyle = '#1b1b1f';
    for (let i = -2; i < 10; i++) {
      ctx.beginPath();
      ctx.moveTo(i * 32, 64); ctx.lineTo(i * 32 + 16, 64); ctx.lineTo(i * 32 + 48, 0); ctx.lineTo(i * 32 + 32, 0);
      ctx.fill();
    }
    return tex(c);
  });
}

/** Building facade with windows for the Splashburg skyline. */
export function facade(base: string, win: string) {
  return cached(`facade${base}${win}`, () => {
    const [c, ctx] = canvas(256, 256);
    ctx.fillStyle = base;
    ctx.fillRect(0, 0, 256, 256);
    noise(ctx, 256, 256, 0.05, 2500);
    for (let y = 0; y < 4; y++)
      for (let x = 0; x < 4; x++) {
        const lit = Math.random() < 0.35;
        ctx.fillStyle = lit ? '#fff3b0' : win;
        ctx.fillRect(x * 64 + 12, y * 64 + 12, 40, 34);
        ctx.fillStyle = 'rgba(255,255,255,0.25)';
        ctx.fillRect(x * 64 + 12, y * 64 + 12, 40, 5);
      }
    return tex(c);
  });
}

/** Bubbly graffiti tag on a transparent background. */
export function graffiti(text: string, fill: string, outline: string, accent: string) {
  return cached(`graf${text}${fill}`, () => {
    const [c, ctx] = canvas(1024, 384);
    ctx.translate(512, 200);
    ctx.rotate(-0.06);
    // spray splotches behind
    for (let i = 0; i < 20; i++) {
      ctx.fillStyle = accent;
      ctx.globalAlpha = 0.85;
      ctx.beginPath();
      ctx.arc((Math.random() - 0.5) * 900, (Math.random() - 0.5) * 220, 18 + Math.random() * 55, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
    ctx.font = '900 150px "Titan One", "Arial Black", sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.lineJoin = 'round';
    ctx.lineWidth = 34;
    ctx.strokeStyle = '#111';
    ctx.strokeText(text, 0, 0);
    ctx.lineWidth = 18;
    ctx.strokeStyle = outline;
    ctx.strokeText(text, 0, 0);
    ctx.fillStyle = fill;
    ctx.fillText(text, 0, 0);
    ctx.fillStyle = 'rgba(255,255,255,0.5)';
    ctx.font = '900 150px "Titan One", "Arial Black", sans-serif';
    ctx.save();
    ctx.beginPath();
    ctx.rect(-512, -80, 1024, 40);
    ctx.clip();
    ctx.fillText(text, 0, 0);
    ctx.restore();
    // drips
    ctx.fillStyle = fill;
    for (let i = 0; i < 9; i++) {
      const x = (Math.random() - 0.5) * 700;
      const len = 30 + Math.random() * 90;
      ctx.fillRect(x, 50, 9, len);
      ctx.beginPath();
      ctx.arc(x + 4.5, 50 + len, 7, 0, Math.PI * 2);
      ctx.fill();
    }
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    return t;
  });
}

/** Scale a BoxGeometry's UVs so textures tile at `meters` per repeat. */
export function boxUVsWorld(geo: THREE.BoxGeometry, sx: number, sy: number, sz: number, meters: number) {
  const uv = geo.getAttribute('uv') as THREE.BufferAttribute;
  // face order in BoxGeometry: +x, -x, +y, -y, +z, -z; 4 vertices each
  const dims: [number, number][] = [
    [sz, sy], [sz, sy], [sx, sz], [sx, sz], [sx, sy], [sx, sy],
  ];
  for (let f = 0; f < 6; f++) {
    for (let i = 0; i < 4; i++) {
      const k = f * 4 + i;
      uv.setXY(k, (uv.getX(k) * dims[f][0]) / meters, (uv.getY(k) * dims[f][1]) / meters);
    }
  }
  uv.needsUpdate = true;
}

/** Corrugated shipping-container steel (one texture = 4m). */
export function corrugated(base: string) {
  return cached(`corr${base}`, () => {
    const [c, ctx] = canvas(256, 256);
    ctx.fillStyle = base;
    ctx.fillRect(0, 0, 256, 256);
    for (let x = 0; x < 256; x += 16) {
      const g = ctx.createLinearGradient(x, 0, x + 16, 0);
      g.addColorStop(0, 'rgba(255,255,255,0.18)');
      g.addColorStop(0.5, 'rgba(0,0,0,0.05)');
      g.addColorStop(1, 'rgba(0,0,0,0.22)');
      ctx.fillStyle = g;
      ctx.fillRect(x, 0, 16, 256);
    }
    noise(ctx, 256, 256, 0.06, 3000);
    ctx.fillStyle = 'rgba(0,0,0,0.25)';
    ctx.fillRect(0, 0, 256, 6);
    ctx.fillRect(0, 250, 256, 6);
    return tex(c);
  });
}

/** Weathered boardwalk planks (one texture = 4m). */
export function planks(base = '#c99a63') {
  return cached(`planks${base}`, () => {
    const [c, ctx] = canvas(512, 512);
    ctx.fillStyle = base;
    ctx.fillRect(0, 0, 512, 512);
    for (let y = 0; y < 512; y += 64) {
      ctx.fillStyle = `rgba(${Math.random() < 0.5 ? 0 : 255},${Math.random() < 0.5 ? 40 : 200},0,${0.04 + Math.random() * 0.05})`;
      ctx.fillRect(0, y, 512, 64);
      ctx.fillStyle = 'rgba(60,35,15,0.55)';
      ctx.fillRect(0, y, 512, 4);
      const off = Math.random() * 512;
      ctx.fillRect(off, y, 4, 64);
      // grain
      ctx.strokeStyle = 'rgba(80,50,20,0.15)';
      ctx.lineWidth = 2;
      for (let i = 0; i < 5; i++) {
        ctx.beginPath();
        const yy = y + 10 + Math.random() * 46;
        ctx.moveTo(0, yy);
        ctx.bezierCurveTo(170, yy + 6, 340, yy - 6, 512, yy);
        ctx.stroke();
      }
      for (const x of [off - 12, off + 12]) {
        ctx.fillStyle = 'rgba(40,30,20,0.6)';
        ctx.beginPath(); ctx.arc(x, y + 16, 3, 0, Math.PI * 2); ctx.arc(x, y + 48, 3, 0, Math.PI * 2); ctx.fill();
      }
    }
    noise(ctx, 512, 512, 0.05, 6000);
    return tex(c);
  });
}

/** Painted brick (one texture = 4m). */
export function brick(base = '#c8664a', mortar = '#e8d8c4') {
  return cached(`brick${base}`, () => {
    const [c, ctx] = canvas(512, 512);
    ctx.fillStyle = mortar;
    ctx.fillRect(0, 0, 512, 512);
    for (let row = 0; row < 16; row++) {
      const off = (row % 2) * 32;
      for (let x = -64; x < 512; x += 64) {
        const k = Math.random() * 0.12 - 0.06;
        ctx.fillStyle = base;
        ctx.fillRect(x + off + 3, row * 32 + 3, 58, 26);
        ctx.fillStyle = `rgba(${k > 0 ? 255 : 0},${k > 0 ? 255 : 0},${k > 0 ? 255 : 0},${Math.abs(k)})`;
        ctx.fillRect(x + off + 3, row * 32 + 3, 58, 26);
      }
    }
    noise(ctx, 512, 512, 0.06, 6000);
    return tex(c);
  });
}

/** Rooftop sports court: colored base with painted lines (one texture = whole court, not tiled). */
export function courtFloor(base = '#3b7dd8', key = '#e8743b') {
  return cached(`court${base}`, () => {
    const [c, ctx] = canvas(1024, 1024);
    ctx.fillStyle = base;
    ctx.fillRect(0, 0, 1024, 1024);
    noise(ctx, 1024, 1024, 0.04, 12000);
    ctx.fillStyle = key;
    ctx.fillRect(380, 0, 264, 230);
    ctx.fillRect(380, 794, 264, 230);
    ctx.strokeStyle = '#fff';
    ctx.lineWidth = 10;
    ctx.strokeRect(40, 40, 944, 944);
    ctx.beginPath(); ctx.moveTo(40, 512); ctx.lineTo(984, 512); ctx.stroke();
    ctx.beginPath(); ctx.arc(512, 512, 120, 0, Math.PI * 2); ctx.stroke();
    ctx.beginPath(); ctx.arc(512, 40, 360, 0, Math.PI); ctx.stroke();
    ctx.beginPath(); ctx.arc(512, 984, 360, Math.PI, Math.PI * 2); ctx.stroke();
    const t = tex(c);
    t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping;
    return t;
  });
}

/** Polished plaza tiles with a diamond accent (one texture = 4m). */
export function plazaTiles(base = '#9e9080', accent = '#c25a40') {
  return cached(`plaza${base}${accent}`, () => {
    const [c, ctx] = canvas(512, 512);
    ctx.fillStyle = base;
    ctx.fillRect(0, 0, 512, 512);
    noise(ctx, 512, 512, 0.04, 6000);
    ctx.strokeStyle = 'rgba(0,0,0,0.18)';
    ctx.lineWidth = 3;
    for (let i = 0; i <= 4; i++) {
      ctx.beginPath(); ctx.moveTo(i * 128, 0); ctx.lineTo(i * 128, 512); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(0, i * 128); ctx.lineTo(512, i * 128); ctx.stroke();
    }
    ctx.fillStyle = accent;
    for (const [x, y] of [[128, 128], [384, 384], [128, 384], [384, 128]]) {
      ctx.beginPath(); ctx.moveTo(x, y - 22); ctx.lineTo(x + 22, y); ctx.lineTo(x, y + 22); ctx.lineTo(x - 22, y); ctx.fill();
    }
    return tex(c);
  });
}

/** Store / building sign with bubbly text. */
export function signTexture(text: string, bg: string, fg: string, w = 1024, h = 256) {
  return cached(`sign${text}${bg}`, () => {
    const [c, ctx] = canvas(w, h);
    ctx.fillStyle = bg;
    const r = h * 0.3;
    ctx.beginPath();
    ctx.roundRect(8, 8, w - 16, h - 16, r);
    ctx.fill();
    ctx.lineWidth = 12;
    ctx.strokeStyle = '#15121c';
    ctx.stroke();
    let size = h * 0.55;
    ctx.font = `900 ${size}px "Titan One", "Arial Black", sans-serif`;
    while (ctx.measureText(text).width > w * 0.86 && size > 20) {
      size -= 4;
      ctx.font = `900 ${size}px "Titan One", "Arial Black", sans-serif`;
    }
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.lineJoin = 'round';
    ctx.lineWidth = size * 0.22;
    ctx.strokeStyle = '#15121c';
    ctx.strokeText(text, w / 2, h / 2 + size * 0.05);
    ctx.fillStyle = fg;
    ctx.fillText(text, w / 2, h / 2 + size * 0.05);
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    t.anisotropy = 8;
    return t;
  });
}

/** Cartoon water surface (tiles). */
export function waterTexture() {
  return cached('water', () => {
    const [c, ctx] = canvas(256, 256);
    ctx.fillStyle = '#2aa7d8';
    ctx.fillRect(0, 0, 256, 256);
    ctx.strokeStyle = 'rgba(255,255,255,0.45)';
    ctx.lineWidth = 4;
    ctx.lineCap = 'round';
    for (let i = 0; i < 18; i++) {
      const x = Math.random() * 256, y = Math.random() * 256;
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.quadraticCurveTo(x + 10, y - 6, x + 20, y);
      ctx.quadraticCurveTo(x + 30, y + 6, x + 40, y);
      ctx.stroke();
    }
    return tex(c);
  });
}
