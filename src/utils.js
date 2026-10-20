import * as THREE from 'three';

export const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
export const lerp = (a, b, t) => a + (b - a) * t;
export const damp = (a, b, lambda, dt) => lerp(a, b, 1 - Math.exp(-lambda * dt));
export const rand = (a = 0, b = 1) => a + Math.random() * (b - a);
export const randInt = (a, b) => Math.floor(rand(a, b + 1));
export const choice = (arr) => arr[Math.floor(Math.random() * arr.length)];
export const dist2 = (ax, az, bx, bz) => {
  const dx = ax - bx; const dz = az - bz;
  return dx * dx + dz * dz;
};
export const dist = (ax, az, bx, bz) => Math.sqrt(dist2(ax, az, bx, bz));
export const angleLerp = (a, b, t) => {
  let d = ((b - a + Math.PI) % (Math.PI * 2)) - Math.PI;
  if (d < -Math.PI) d += Math.PI * 2;
  return a + d * t;
};
export const smoothstep = (a, b, x) => {
  const t = clamp((x - a) / (b - a), 0, 1);
  return t * t * (3 - 2 * t);
};

export function mulberry32(seed) {
  let a = seed >>> 0;
  return function random() {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function makeCanvas(w, h) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  return c;
}

export function canvasTexture(canvas, { repeat = true, colorSpace = true, nearest = false } = {}) {
  const tex = new THREE.CanvasTexture(canvas);
  if (repeat) tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  if (colorSpace) tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  if (nearest) tex.magFilter = THREE.NearestFilter;
  return tex;
}

// Resolve a circle against an axis-aligned rectangle. Mutates pos {x,z}.
export function resolveCircleRect(pos, radius, r) {
  const nx = clamp(pos.x, r.minX, r.maxX);
  const nz = clamp(pos.z, r.minZ, r.maxZ);
  let dx = pos.x - nx;
  let dz = pos.z - nz;
  let d2 = dx * dx + dz * dz;
  if (d2 > radius * radius) return false;
  if (d2 > 1e-7) {
    const d = Math.sqrt(d2);
    pos.x += (dx / d) * (radius - d + 0.001);
    pos.z += (dz / d) * (radius - d + 0.001);
  } else {
    // Center is inside the rectangle: push out on the shallowest axis.
    const left = pos.x - r.minX;
    const right = r.maxX - pos.x;
    const back = pos.z - r.minZ;
    const front = r.maxZ - pos.z;
    const m = Math.min(left, right, back, front);
    if (m === left) pos.x = r.minX - radius;
    else if (m === right) pos.x = r.maxX + radius;
    else if (m === back) pos.z = r.minZ - radius;
    else pos.z = r.maxZ + radius;
  }
  return true;
}

export function pointInRect(x, z, r, pad = 0) {
  return x > r.minX - pad && x < r.maxX + pad && z > r.minZ - pad && z < r.maxZ + pad;
}

export function rectDistance(x, z, r) {
  const nx = clamp(x, r.minX, r.maxX);
  const nz = clamp(z, r.minZ, r.maxZ);
  return Math.hypot(x - nx, z - nz);
}

// Closest distance from point to segment on XZ plane.
export function segmentDistance(px, pz, ax, az, bx, bz) {
  const abx = bx - ax; const abz = bz - az;
  const len = abx * abx + abz * abz;
  let t = len > 0 ? ((px - ax) * abx + (pz - az) * abz) / len : 0;
  t = clamp(t, 0, 1);
  return Math.hypot(px - (ax + abx * t), pz - (az + abz * t));
}

export function makeTextTexture(w, h, draw) {
  const c = makeCanvas(w, h);
  const ctx = c.getContext('2d');
  draw(ctx, w, h);
  return c;
}

export function formatCash(n) {
  return '$' + Math.round(n).toLocaleString('en-US');
}

export function formatTime(s) {
  s = Math.max(0, Math.ceil(s));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

export function dieRoll(seed) {
  const r = mulberry32(seed);
  return r;
}
