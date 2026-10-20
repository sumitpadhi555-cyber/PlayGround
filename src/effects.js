import * as THREE from 'three';
import { rand } from './utils.js';

const POOL = 900;

export class Effects {
  constructor(scene) {
    this.scene = scene;
    this.pos = new Float32Array(POOL * 3);
    this.vel = new Float32Array(POOL * 3);
    this.col = new Float32Array(POOL * 3);
    this.size = new Float32Array(POOL);
    this.alpha = new Float32Array(POOL);
    this.life = new Float32Array(POOL);
    this.maxLife = new Float32Array(POOL);
    this.drag = new Float32Array(POOL);
    this.grav = new Float32Array(POOL);
    this.cursor = 0;

    for (let i = 0; i < POOL; i++) this.pos[i * 3 + 1] = -999;

    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(this.pos, 3));
    geo.setAttribute('aColor', new THREE.BufferAttribute(this.col, 3));
    geo.setAttribute('aSize', new THREE.BufferAttribute(this.size, 1));
    geo.setAttribute('aAlpha', new THREE.BufferAttribute(this.alpha, 1));
    this.geo = geo;

    const mat = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      uniforms: {},
      vertexShader: `
        attribute vec3 aColor;
        attribute float aSize;
        attribute float aAlpha;
        varying vec3 vColor;
        varying float vAlpha;
        void main() {
          vColor = aColor;
          vAlpha = aAlpha;
          vec4 mv = modelViewMatrix * vec4(position, 1.0);
          gl_PointSize = aSize * (260.0 / max(1.0, -mv.z));
          gl_Position = projectionMatrix * mv;
        }`,
      fragmentShader: `
        varying vec3 vColor;
        varying float vAlpha;
        void main() {
          vec2 p = gl_PointCoord - vec2(0.5);
          float d = length(p);
          if (d > 0.5) discard;
          float a = smoothstep(0.5, 0.08, d) * vAlpha;
          gl_FragColor = vec4(vColor, a);
        }`,
    });
    this.points = new THREE.Points(geo, mat);
    this.points.frustumCulled = false;
    scene.add(this.points);

    // smoke uses normal blending
    this.smokePos = new Float32Array(360 * 3);
    this.smokeVel = new Float32Array(360 * 3);
    this.smokeCol = new Float32Array(360 * 3);
    this.smokeSize = new Float32Array(360);
    this.smokeAlpha = new Float32Array(360);
    this.smokeLife = new Float32Array(360);
    this.smokeMax = new Float32Array(360);
    this.smokeCursor = 0;
    for (let i = 0; i < 360; i++) this.smokePos[i * 3 + 1] = -999;
    const sgeo = new THREE.BufferGeometry();
    sgeo.setAttribute('position', new THREE.BufferAttribute(this.smokePos, 3));
    sgeo.setAttribute('aColor', new THREE.BufferAttribute(this.smokeCol, 3));
    sgeo.setAttribute('aSize', new THREE.BufferAttribute(this.smokeSize, 1));
    sgeo.setAttribute('aAlpha', new THREE.BufferAttribute(this.smokeAlpha, 1));
    const smat = mat.clone();
    smat.blending = THREE.NormalBlending;
    this.smoke = new THREE.Points(sgeo, smat);
    this.smoke.frustumCulled = false;
    scene.add(this.smoke);

    // Tracers
    this.tracers = [];
    for (let i = 0; i < 12; i++) {
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(6), 3));
      const m = new THREE.LineBasicMaterial({ color: 0xffe2a8, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, fog: false });
      const line = new THREE.Line(g, m);
      line.frustumCulled = false;
      line.visible = false;
      scene.add(line);
      this.tracers.push({ line, life: 0 });
    }
    this.tracerCursor = 0;

    // Explosion flash
    this.flash = new THREE.PointLight(0xffa04a, 0, 80, 2);
    this.flash.position.y = 2;
    scene.add(this.flash);
    this.flashLife = 0;

    // Shockwave rings
    this.rings = [];
    for (let i = 0; i < 5; i++) {
      const m = new THREE.MeshBasicMaterial({ color: 0xffc27a, transparent: true, opacity: 0, side: THREE.DoubleSide, depthWrite: false, fog: false, blending: THREE.AdditiveBlending });
      const ring = new THREE.Mesh(new THREE.RingGeometry(0.8, 1.1, 40), m);
      ring.rotation.x = -Math.PI / 2;
      ring.visible = false;
      scene.add(ring);
      this.rings.push({ mesh: ring, life: 0 });
    }
    this.ringCursor = 0;
  }

  _spawn(x, y, z, vx, vy, vz, color, size, life, drag = 1.4, grav = 0) {
    const i = this.cursor = (this.cursor + 1) % POOL;
    this.pos[i * 3] = x; this.pos[i * 3 + 1] = y; this.pos[i * 3 + 2] = z;
    this.vel[i * 3] = vx; this.vel[i * 3 + 1] = vy; this.vel[i * 3 + 2] = vz;
    const c = new THREE.Color(color);
    this.col[i * 3] = c.r; this.col[i * 3 + 1] = c.g; this.col[i * 3 + 2] = c.b;
    this.size[i] = size;
    this.alpha[i] = 1;
    this.life[i] = life;
    this.maxLife[i] = life;
    this.drag[i] = drag;
    this.grav[i] = grav;
  }

  _spawnSmoke(x, y, z, vx, vy, vz, color, size, life) {
    const i = this.smokeCursor = (this.smokeCursor + 1) % 360;
    this.smokePos[i * 3] = x; this.smokePos[i * 3 + 1] = y; this.smokePos[i * 3 + 2] = z;
    this.smokeVel[i * 3] = vx; this.smokeVel[i * 3 + 1] = vy; this.smokeVel[i * 3 + 2] = vz;
    const c = new THREE.Color(color);
    this.smokeCol[i * 3] = c.r; this.smokeCol[i * 3 + 1] = c.g; this.smokeCol[i * 3 + 2] = c.b;
    this.smokeSize[i] = size;
    this.smokeAlpha[i] = 0.5;
    this.smokeLife[i] = life;
    this.smokeMax[i] = life;
  }

  explosion(x, y, z, scale = 1) {
    for (let i = 0; i < 44; i++) {
      const a = rand(0, Math.PI * 2);
      const r = rand(0.5, 2.5) * scale;
      const up = rand(2, 12) * scale;
      this._spawn(
        x + Math.cos(a) * r, y + rand(0.3, 2) * scale, z + Math.sin(a) * r,
        Math.cos(a) * rand(3, 13) * scale, up, Math.sin(a) * rand(3, 13) * scale,
        i % 3 === 0 ? 0xfff0b0 : i % 3 === 1 ? 0xff9a2e : 0xff4a12,
        rand(2.6, 6.5) * scale, rand(0.45, 1.15), 1.1, 5,
      );
    }
    for (let i = 0; i < 26; i++) {
      const a = rand(0, Math.PI * 2);
      const r = rand(0.5, 4) * scale;
      this._spawn(
        x + Math.cos(a) * r, y + rand(0.4, 3) * scale, z + Math.sin(a) * r,
        Math.cos(a) * rand(8, 24) * scale, rand(3, 16) * scale, Math.sin(a) * rand(8, 24) * scale,
        0xffd070, rand(0.8, 1.8), rand(0.35, 0.8), 0.7, 16,
      );
    }
    for (let i = 0; i < 26; i++) {
      const a = rand(0, Math.PI * 2);
      this._spawnSmoke(
        x + Math.cos(a) * rand(0.5, 3.5) * scale, y + rand(0.5, 3.5) * scale, z + Math.sin(a) * rand(0.5, 3.5) * scale,
        Math.cos(a) * rand(0.6, 3.2), rand(1.4, 4.5), Math.sin(a) * rand(0.6, 3.2),
        i % 4 === 0 ? '#3a3d44' : '#1b1d22', rand(7, 16) * scale, rand(1.6, 3.4),
      );
    }
    this.flash.position.set(x, y + 2, z);
    this.flash.intensity = 22 * scale;
    this.flashLife = 0.45;
    const r = this.rings[this.ringCursor = (this.ringCursor + 1) % this.rings.length];
    r.mesh.position.set(x, 0.25, z);
    r.mesh.scale.setScalar(1);
    r.mesh.material.opacity = 0.8;
    r.mesh.visible = true;
    r.life = 0.55;
  }

  muzzle(x, y, z, dx, dy, dz) {
    for (let i = 0; i < 5; i++) {
      this._spawn(x, y, z,
        dx * rand(6, 18) + rand(-1.2, 1.2), dy * rand(6, 18) + rand(-0.5, 1), dz * rand(6, 18) + rand(-1.2, 1.2),
        0xffdd8a, rand(0.7, 1.6), rand(0.05, 0.12), 2, 2);
    }
    this.flash.position.set(x, y, z);
    this.flash.intensity = 8;
    this.flashLife = 0.06;
  }

  impact(x, y, z, hex = 0xffcf8a) {
    for (let i = 0; i < 7; i++) {
      this._spawn(x, y, z,
        rand(-5, 5), rand(1, 6), rand(-5, 5),
        hex, rand(0.5, 1.2), rand(0.18, 0.4), 2.2, 14,
      );
    }
  }

  tracer(ax, ay, az, bx, by, bz) {
    const t = this.tracers[this.tracerCursor = (this.tracerCursor + 1) % this.tracers.length];
    const arr = t.line.geometry.attributes.position.array;
    arr[0] = ax; arr[1] = ay; arr[2] = az;
    arr[3] = bx; arr[4] = by; arr[5] = bz;
    t.line.geometry.attributes.position.needsUpdate = true;
    t.line.material.opacity = 0.95;
    t.line.visible = true;
    t.life = 0.07;
  }

  update(dt) {
    for (let i = 0; i < POOL; i++) {
      if (this.life[i] <= 0) continue;
      this.life[i] -= dt;
      if (this.life[i] <= 0) { this.pos[i * 3 + 1] = -999; this.alpha[i] = 0; continue; }
      const k = Math.exp(-this.drag[i] * dt);
      this.vel[i * 3] *= k;
      this.vel[i * 3 + 1] = this.vel[i * 3 + 1] * k - this.grav[i] * dt;
      this.vel[i * 3 + 2] *= k;
      this.pos[i * 3] += this.vel[i * 3] * dt;
      this.pos[i * 3 + 1] += this.vel[i * 3 + 1] * dt;
      this.pos[i * 3 + 2] += this.vel[i * 3 + 2] * dt;
      if (this.pos[i * 3 + 1] < 0.06) {
        this.pos[i * 3 + 1] = 0.06;
        this.vel[i * 3 + 1] *= -0.28;
        this.vel[i * 3] *= 0.72;
        this.vel[i * 3 + 2] *= 0.72;
      }
      const f = this.life[i] / this.maxLife[i];
      this.alpha[i] = Math.min(1, f * 1.8);
    }
    this.geo.attributes.position.needsUpdate = true;
    this.geo.attributes.aAlpha.needsUpdate = true;
    this.geo.attributes.aColor.needsUpdate = true;
    this.geo.attributes.aSize.needsUpdate = true;

    for (let i = 0; i < 360; i++) {
      if (this.smokeLife[i] <= 0) continue;
      this.smokeLife[i] -= dt;
      if (this.smokeLife[i] <= 0) { this.smokePos[i * 3 + 1] = -999; this.smokeAlpha[i] = 0; continue; }
      this.smokeVel[i * 3] *= 0.985;
      this.smokeVel[i * 3 + 1] = this.smokeVel[i * 3 + 1] * 0.99 + 0.9 * dt;
      this.smokeVel[i * 3 + 2] *= 0.985;
      this.smokePos[i * 3] += this.smokeVel[i * 3] * dt;
      this.smokePos[i * 3 + 1] += this.smokeVel[i * 3 + 1] * dt;
      this.smokePos[i * 3 + 2] += this.smokeVel[i * 3 + 2] * dt;
      this.smokeSize[i] += dt * 4;
      const f = this.smokeLife[i] / this.smokeMax[i];
      this.smokeAlpha[i] = Math.max(0, Math.min(0.55, f * 0.65));
    }
    this.smoke.geometry.attributes.position.needsUpdate = true;
    this.smoke.geometry.attributes.aAlpha.needsUpdate = true;
    this.smoke.geometry.attributes.aSize.needsUpdate = true;
    this.smoke.geometry.attributes.aColor.needsUpdate = true;

    for (const t of this.tracers) {
      if (t.life > 0) {
        t.life -= dt;
        t.line.material.opacity = Math.max(0, t.life / 0.07) * 0.95;
        if (t.life <= 0) t.line.visible = false;
      }
    }

    if (this.flashLife > 0) {
      this.flashLife -= dt;
      this.flash.intensity = Math.max(0, this.flash.intensity * (1 - dt * 14));
      if (this.flashLife <= 0) this.flash.intensity = 0;
    }
    for (const r of this.rings) {
      if (r.life <= 0) continue;
      r.life -= dt;
      if (r.life <= 0) { r.mesh.visible = false; continue; }
      const p = 1 - r.life / 0.55;
      r.mesh.scale.setScalar(1 + p * 16);
      r.mesh.material.opacity = (1 - p) * 0.75;
    }
  }
}
