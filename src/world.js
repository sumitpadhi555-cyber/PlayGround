import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/BufferGeometryUtils.js';
import {
  clamp, mulberry32, makeCanvas, canvasTexture, smoothstep, lerp, choice, randInt,
} from './utils.js';

export const CITY = {
  half: 260,
  roads: Array.from({ length: 9 }, (_, i) => -240 + i * 60),
  margin: 11,
  roadHalf: 7,
  sidewalk: 4,
  island: 680,
  block: 60,
};

const PALETTES = {
  glass: {
    base: '#2b3a4b', mullion: '#18212d', frame: '#3d5266',
    windows: ['#1d2c3b', '#244055', '#2f4f63', '#35576c'],
    lit: ['#ffd79a', '#ffe8bd', '#bfe6ff', '#ffc777'],
  },
  concrete: {
    base: '#8d8478', mullion: '#6d675e', frame: '#a39a8c',
    windows: ['#232a33', '#1e252d', '#2b333c', '#303944'],
    lit: ['#ffd18c', '#ffdfae', '#cdeaff', '#ffc06b'],
  },
  brick: {
    base: '#7b4f42', mullion: '#5d3a31', frame: '#94675a',
    windows: ['#20262d', '#262d35', '#1b2128', '#2c343d'],
    lit: ['#ffca7a', '#ffe0a8', '#c8e4ff'],
  },
};

function makeFacadeTextures(kind, rng) {
  const S = 256;
  const color = makeCanvas(S, S);
  const glow = makeCanvas(S, S);
  const c = color.getContext('2d');
  const g = glow.getContext('2d');
  const p = PALETTES[kind];

  c.fillStyle = p.base;
  c.fillRect(0, 0, S, S);
  g.fillStyle = '#000';
  g.fillRect(0, 0, S, S);

  // subtle facade grain
  for (let i = 0; i < 240; i++) {
    c.fillStyle = `rgba(0,0,0,${rng() * 0.035})`;
    c.fillRect(rng() * S, rng() * S, 1 + rng() * 4, 1 + rng() * 9);
  }

  if (kind === 'brick') {
    c.strokeStyle = 'rgba(30,15,12,0.16)';
    c.lineWidth = 1;
    for (let y = 0; y < S; y += 8) {
      c.beginPath(); c.moveTo(0, y); c.lineTo(S, y); c.stroke();
    }
  }

  const cols = 5, rows = 5;
  const cw = S / cols, ch = S / rows;
  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) {
      const x = col * cw + cw * 0.2;
      const y = row * ch + ch * 0.22;
      const w = cw * 0.6;
      const h = ch * 0.52;
      const lit = rng() < 0.3;
      const glass = choice(p.windows);
      const litColor = choice(p.lit);
      c.fillStyle = p.frame;
      c.fillRect(x - 2, y - 2, w + 4, h + 4);
      c.fillStyle = glass;
      c.fillRect(x, y, w, h);
      if (lit) {
        c.globalAlpha = 0.42;
        c.fillStyle = litColor;
        c.fillRect(x, y, w, h);
        c.globalAlpha = 1;
      }
      // glass highlight
      c.fillStyle = lit ? 'rgba(255,255,255,0.3)' : 'rgba(150,205,255,0.14)';
      c.fillRect(x + 1, y + 1, w * 0.36, h * 0.32);
      c.fillStyle = 'rgba(0,0,0,0.28)';
      c.fillRect(x + w * 0.46, y, 1.5, h);
      if (lit) {
        const grad = g.createLinearGradient(x, y, x, y + h);
        grad.addColorStop(0, choice(p.lit));
        grad.addColorStop(1, 'rgba(80,50,20,0.15)');
        g.fillStyle = grad;
        g.fillRect(x, y, w, h);
        g.fillStyle = 'rgba(255,255,255,0.22)';
        g.fillRect(x + 1, y + 1, w * 0.3, h * 0.25);
      }
    }
    // floor slab line
    c.fillStyle = 'rgba(0,0,0,0.18)';
    c.fillRect(0, row * ch, S, 1.5);
  }

  return {
    map: canvasTexture(color),
    emissiveMap: canvasTexture(glow),
  };
}

function makeGroundTexture(roads, rng, parks, plaza) {
  const S = 2048;
  const span = 560;
  const px = (v) => ((v + CITY.half) / 520) * S;
  const sc = S / 520;
  const canvas = makeCanvas(S, S);
  const c = canvas.getContext('2d');

  c.fillStyle = '#a8a294';
  c.fillRect(0, 0, S, S);

  // Block lots
  for (let i = 0; i < roads.length - 1; i++) {
    for (let j = 0; j < roads.length - 1; j++) {
      if (roads[i] < -260 || roads[i + 1] > 260) continue;
      const x0 = px(roads[i] + CITY.margin);
      const x1 = px(roads[i + 1] - CITY.margin);
      const z0 = px(roads[j] + CITY.margin);
      const z1 = px(roads[j + 1] - CITY.margin);
      const key = `${i},${j}`;
      let fill = rng() < 0.28 ? '#6f7564' : rng() < 0.4 ? '#7e7c70' : '#8d887b';
      if (parks.has(key)) fill = '#4d6a48';
      if (plaza === key) fill = '#b2aa95';
      c.fillStyle = fill;
      c.fillRect(x0, z0, x1 - x0, z1 - z0);

      // sidewalk seams around lots
      c.strokeStyle = 'rgba(60,60,55,0.22)';
      c.lineWidth = 2;
      c.strokeRect(x0, z0, x1 - x0, z1 - z0);

      if (parks.has(key)) {
        for (let k = 0; k < 40; k++) {
          c.fillStyle = `rgba(30,60,32,${0.04 + rng() * 0.08})`;
          const rx = x0 + rng() * (x1 - x0);
          const ry = z0 + rng() * (z1 - z0);
          c.beginPath(); c.arc(rx, ry, 4 + rng() * 18, 0, Math.PI * 2); c.fill();
        }
      } else if (!parks.has(key)) {
        c.strokeStyle = 'rgba(65,62,56,0.16)';
        c.lineWidth = 1;
        for (let gx = x0 + 4 * sc; gx < x1; gx += 4 * sc) {
          c.beginPath(); c.moveTo(gx, z0); c.lineTo(gx, z1); c.stroke();
        }
        for (let gz = z0 + 4 * sc; gz < z1; gz += 4 * sc) {
          c.beginPath(); c.moveTo(x0, gz); c.lineTo(x1, gz); c.stroke();
        }
      }
    }
  }

  // plaza paving detail around the fountain
  {
    const cx = px(30), cz = px(30);
    c.strokeStyle = 'rgba(70,66,58,0.18)';
    c.lineWidth = 1.5;
    for (let r = 40; r < 210; r += 26) {
      c.beginPath(); c.arc(cx, cz, r, 0, Math.PI * 2); c.stroke();
    }
    c.strokeStyle = 'rgba(70,66,58,0.14)';
    for (let k = 0; k < 12; k++) {
      const a = (k / 12) * Math.PI * 2;
      c.beginPath(); c.moveTo(cx + Math.cos(a) * 34, cz + Math.sin(a) * 34);
      c.lineTo(cx + Math.cos(a) * 210, cz + Math.sin(a) * 210); c.stroke();
    }
    // fine paving grid
    c.strokeStyle = 'rgba(60,58,52,0.1)';
    for (let x = px(11); x < px(49); x += 3 * sc) {
      c.beginPath(); c.moveTo(x, px(11)); c.lineTo(x, px(49)); c.stroke();
    }
    for (let z = px(11); z < px(49); z += 3 * sc) {
      c.beginPath(); c.moveTo(px(11), z); c.lineTo(px(49), z); c.stroke();
    }
  }

  function drawRoad(vertical, r) {
    const a = px(r - CITY.roadHalf - CITY.sidewalk);
    const b = px(r + CITY.roadHalf + CITY.sidewalk);
    c.fillStyle = '#b7b2a6';
    if (vertical) c.fillRect(a, 0, b - a, S); else c.fillRect(0, a, S, b - a);

    const inner = CITY.roadHalf;
    const a2 = px(r - inner); const b2 = px(r + inner);
    c.fillStyle = '#303339';
    if (vertical) c.fillRect(a2, 0, b2 - a2, S); else c.fillRect(0, a2, S, b2 - a2);

    // asphalt variation
    for (let k = 0; k < 90; k++) {
      c.fillStyle = `rgba(255,255,255,${rng() * 0.018})`;
      const t = rng() * S;
      if (vertical) c.fillRect(a2 + rng() * (b2 - a2), t, 3 + rng() * 25, 1 + rng() * 3);
      else c.fillRect(t, a2 + rng() * (b2 - a2), 1 + rng() * 3, 3 + rng() * 25);
    }

    // lane markings
    const line = (offset, color, dash, width = 0.16) => {
      const pos = px(r + offset);
      c.strokeStyle = color;
      c.lineWidth = Math.max(1.5, width * sc);
      c.setLineDash(dash ? [8 * sc, 7 * sc] : []);
      c.beginPath();
      if (vertical) { c.moveTo(pos, 0); c.lineTo(pos, S); }
      else { c.moveTo(0, pos); c.lineTo(S, pos); }
      c.stroke();
      c.setLineDash([]);
    };
    line(-0.38, 'rgba(230,190,70,0.9)', false, 0.12);
    line(0.38, 'rgba(230,190,70,0.9)', false, 0.12);
    line(-3.5, 'rgba(235,235,235,0.65)', true, 0.13);
    line(3.5, 'rgba(235,235,235,0.65)', true, 0.13);
    line(-6.55, 'rgba(230,230,230,0.5)', false, 0.1);
    line(6.55, 'rgba(230,230,230,0.5)', false, 0.1);

    // curb highlight
    c.strokeStyle = 'rgba(245,240,225,0.45)';
    c.lineWidth = 2;
    if (vertical) {
      c.beginPath(); c.moveTo(a2 - 2, 0); c.lineTo(a2 - 2, S); c.stroke();
      c.beginPath(); c.moveTo(b2 + 2, 0); c.lineTo(b2 + 2, S); c.stroke();
    } else {
      c.beginPath(); c.moveTo(0, a2 - 2); c.lineTo(S, a2 - 2); c.stroke();
      c.beginPath(); c.moveTo(0, b2 + 2); c.lineTo(S, b2 + 2); c.stroke();
    }
  }

  for (const r of roads) { drawRoad(true, r); drawRoad(false, r); }

  // Crosswalks at intersections
  for (const rx of roads) {
    for (const rz of roads) {
      const cx = px(rx); const cz = px(rz);
      const half = CITY.roadHalf * sc;
      const gap = (CITY.roadHalf + 2.2) * sc;
      c.fillStyle = 'rgba(238,238,230,0.58)';
      for (const dir of [-1, 1]) {
        for (let k = -3; k <= 3; k++) {
          const off = k * 1.8 * sc;
          c.fillRect(cx + off - 0.5 * sc, cz + dir * gap - 1.1 * sc, 0.9 * sc, 2.2 * sc);
          c.fillRect(cx + dir * gap - 1.1 * sc, cz + off - 0.5 * sc, 2.2 * sc, 0.9 * sc);
        }
      }
      // stop lines
      c.fillStyle = 'rgba(235,235,225,0.5)';
      c.fillRect(cx - half, cz - gap - 3 * sc, half * 2, 0.7 * sc);
      c.fillRect(cx - half, cz + gap + 2.3 * sc, half * 2, 0.7 * sc);
    }
  }

  // road detail: patches, cracks, manholes, oil
  for (let i = 0; i < 180; i++) {
    const x = rng() * S; const y = rng() * S;
    c.fillStyle = `rgba(15,16,18,${0.04 + rng() * 0.1})`;
    if (rng() < 0.5) {
      c.fillRect(x, y, 10 + rng() * 60, 4 + rng() * 12);
    } else {
      c.beginPath(); c.arc(x, y, 3 + rng() * 5, 0, Math.PI * 2); c.fill();
    }
  }
  c.strokeStyle = 'rgba(20,20,22,0.22)';
  for (let i = 0; i < 70; i++) {
    let x = rng() * S; let y = rng() * S;
    c.lineWidth = 1 + rng() * 1.6;
    c.beginPath(); c.moveTo(x, y);
    for (let s = 0; s < 4; s++) { x += (rng() - 0.5) * 30; y += rng() * 22; c.lineTo(x, y); }
    c.stroke();
  }

  // winding paths through the parks
  for (const key of parks) {
    const [i, j] = key.split(',').map(Number);
    const x0 = roads[i] + 11, z0 = roads[j] + 11;
    const cx = px(x0 + 19), cz = px(z0 + 19);
    c.strokeStyle = 'rgba(200,190,160,0.42)';
    c.lineWidth = 4 * sc;
    c.beginPath();
    c.moveTo(cx - 15 * sc, cz - 18 * sc);
    c.quadraticCurveTo(cx + 8 * sc, cz - 4 * sc, cx - 6 * sc, cz + 14 * sc);
    c.stroke();
    c.beginPath();
    c.moveTo(cx + 18 * sc, cz - 10 * sc);
    c.quadraticCurveTo(cx + 2 * sc, cz + 6 * sc, cx + 12 * sc, cz + 18 * sc);
    c.stroke();
  }
  return canvas;
}

function makeMinimapBase(roads, parks, plaza) {
  const S = 512;
  const k = S / 540;
  const px = (v) => (v + 270) * k;
  const canvas = makeCanvas(S, S);
  const c = canvas.getContext('2d');
  c.fillStyle = '#0a1a25';
  c.fillRect(0, 0, S, S);

  // island
  c.fillStyle = '#b8ab86';
  c.fillRect(px(-335), px(-335), 670 * k, 670 * k);
  c.fillStyle = '#202a34';
  c.fillRect(px(-260), px(-260), 520 * k, 520 * k);

  for (let i = 0; i < roads.length - 1; i++) {
    for (let j = 0; j < roads.length - 1; j++) {
      const key = `${i},${j}`;
      let col = '#2a333d';
      if (parks.has(key)) col = '#2f4a34';
      if (plaza === key) col = '#3c4249';
      c.fillStyle = col;
      c.fillRect(px(roads[i] + 11), px(roads[j] + 11), 38 * k, 38 * k);
    }
  }
  c.fillStyle = '#7e8a95';
  for (const r of roads) {
    c.fillRect(px(r - 7), px(-260), 14 * k, 520 * k);
    c.fillRect(px(-260), px(r - 7), 520 * k, 14 * k);
  }
  c.strokeStyle = 'rgba(230,240,255,0.16)';
  c.lineWidth = 1;
  for (const r of roads) {
    c.beginPath(); c.moveTo(px(r), px(-260)); c.lineTo(px(r), px(260)); c.stroke();
    c.beginPath(); c.moveTo(px(-260), px(r)); c.lineTo(px(260), px(r)); c.stroke();
  }
  return canvas;
}

function planeGeom(w, h, x, y, z, rotY, uScale, vScale) {
  const g = new THREE.PlaneGeometry(w, h);
  const uv = g.attributes.uv;
  for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * uScale, uv.getY(i) * vScale);
  g.rotateY(rotY);
  g.translate(x, y, z);
  return g;
}

function mergeMixed(geos) {
  return mergeGeometries(geos.map((g) => (g.index ? g.toNonIndexed() : g)), false);
}

function colorize(geometry, color) {
  const count = geometry.attributes.position.count;
  const arr = new Float32Array(count * 3);
  for (let i = 0; i < count; i++) {
    arr[i * 3] = color.r; arr[i * 3 + 1] = color.g; arr[i * 3 + 2] = color.b;
  }
  geometry.setAttribute('color', new THREE.BufferAttribute(arr, 3));
  return geometry;
}

export function createWorld(scene, renderer, { mobile = false } = {}) {
  const rng = mulberry32(20261020);
  const colliders = [];
  const parkingSpots = [];
  const animated = [];
  const roads = CITY.roads;

  const parks = new Set(['3,3', '5,5', '2,5']);
  const plaza = '4,4';

  scene.fog = new THREE.Fog(0xcfe0ee, 150, 680);

  // ---------------- Environment map ----------------
  const envCanvas = makeCanvas(1024, 512);
  const ec = envCanvas.getContext('2d');
  const eg = ec.createLinearGradient(0, 0, 0, 512);
  eg.addColorStop(0, '#274a78');
  eg.addColorStop(0.46, '#9dc3e0');
  eg.addColorStop(0.56, '#ffd9a8');
  eg.addColorStop(0.7, '#5a4a44');
  eg.addColorStop(1, '#1b1a1c');
  ec.fillStyle = eg; ec.fillRect(0, 0, 1024, 512);
  const sunGrad = ec.createRadialGradient(300, 250, 4, 300, 250, 260);
  sunGrad.addColorStop(0, 'rgba(255,245,215,1)');
  sunGrad.addColorStop(0.15, 'rgba(255,210,140,0.6)');
  sunGrad.addColorStop(1, 'rgba(255,180,100,0)');
  ec.fillStyle = sunGrad; ec.fillRect(0, 0, 1024, 512);
  const envTex = canvasTexture(envCanvas, { repeat: false });
  envTex.mapping = THREE.EquirectangularReflectionMapping;
  const pmrem = new THREE.PMREMGenerator(renderer);
  const envMap = pmrem.fromEquirectangular(envTex).texture;
  scene.environment = envMap;
  scene.environmentIntensity = 0.55;
  envTex.dispose();
  pmrem.dispose();

  // ---------------- Sky ----------------
  const skyUniforms = {
    topColor: { value: new THREE.Color('#3d74b5') },
    horizonColor: { value: new THREE.Color('#f4c48d') },
    sunColor: { value: new THREE.Color('#ffe6bb') },
    sunDir: { value: new THREE.Vector3(0.4, 0.4, 0.5) },
    nightMix: { value: 0 },
  };
  const skyMat = new THREE.ShaderMaterial({
    uniforms: skyUniforms,
    side: THREE.BackSide,
    depthWrite: false,
    fog: false,
    vertexShader: `
      varying vec3 vPos;
      void main() {
        vPos = position;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }`,
    fragmentShader: `
      uniform vec3 topColor;
      uniform vec3 horizonColor;
      uniform vec3 sunColor;
      uniform vec3 sunDir;
      uniform float nightMix;
      varying vec3 vPos;
      void main() {
        vec3 dir = normalize(vPos);
        float h = clamp(dir.y * 2.2 + 0.08, 0.0, 1.0);
        vec3 col = mix(horizonColor, topColor, pow(h, 0.62));
        float sunDot = max(dot(dir, normalize(sunDir)), 0.0);
        float disc = smoothstep(0.9985, 0.9995, sunDot);
        float glow = pow(sunDot, 60.0) * 0.35 + pow(sunDot, 6.0) * 0.12;
        col += sunColor * (disc * 2.2 + glow * (1.0 - nightMix));
        // subtle horizon band
        col += horizonColor * 0.08 * exp(-abs(dir.y) * 18.0);
        gl_FragColor = vec4(col, 1.0);
      }`,
  });
  const sky = new THREE.Mesh(new THREE.SphereGeometry(1800, 40, 24), skyMat);
  sky.renderOrder = -10;
  sky.frustumCulled = false;
  scene.add(sky);

  const starGeo = new THREE.BufferGeometry();
  const starCount = 900;
  const starPos = new Float32Array(starCount * 3);
  for (let i = 0; i < starCount; i++) {
    const theta = rng() * Math.PI * 2;
    const phi = Math.acos(0.08 + rng() * 0.92);
    const r = 1450;
    starPos[i * 3] = Math.sin(phi) * Math.cos(theta) * r;
    starPos[i * 3 + 1] = Math.cos(phi) * r;
    starPos[i * 3 + 2] = Math.sin(phi) * Math.sin(theta) * r;
  }
  starGeo.setAttribute('position', new THREE.BufferAttribute(starPos, 3));
  const starMat = new THREE.PointsMaterial({
    color: 0xdfeaff, size: 2.2, sizeAttenuation: false, transparent: true,
    opacity: 0, depthWrite: false, fog: false,
  });
  const stars = new THREE.Points(starGeo, starMat);
  stars.renderOrder = -9;
  stars.frustumCulled = false;
  scene.add(stars);

  const moonMat = new THREE.MeshBasicMaterial({ color: 0xe8f2ff, transparent: true, opacity: 0, fog: false });
  const moon = new THREE.Mesh(new THREE.SphereGeometry(18, 18, 12), moonMat);
  moon.renderOrder = -8;
  scene.add(moon);

  // ---------------- Lights ----------------
  const hemi = new THREE.HemisphereLight(0xbcd8ff, 0x40403a, 1.1);
  scene.add(hemi);
  const sun = new THREE.DirectionalLight(0xffd9a3, 2.2);
  sun.castShadow = true;
  const shadowSize = mobile ? 1024 : 2048;
  sun.shadow.mapSize.set(shadowSize, shadowSize);
  sun.shadow.camera.near = 1;
  sun.shadow.camera.far = 420;
  sun.shadow.camera.left = -105;
  sun.shadow.camera.right = 105;
  sun.shadow.camera.top = 105;
  sun.shadow.camera.bottom = -105;
  sun.shadow.bias = -0.0006;
  sun.shadow.normalBias = 0.035;
  scene.add(sun);
  scene.add(sun.target);

  // ---------------- Water ----------------
  const waterCanvas = makeCanvas(128, 128);
  const wc = waterCanvas.getContext('2d');
  const img = wc.createImageData(128, 128);
  for (let y = 0; y < 128; y++) {
    for (let x = 0; x < 128; x++) {
      const i = (y * 128 + x) * 4;
      const n = 128 + Math.sin(x * 0.28) * 26 + Math.cos(y * 0.22) * 24 + (rng() - 0.5) * 42;
      img.data[i] = n; img.data[i + 1] = n; img.data[i + 2] = n; img.data[i + 3] = 255;
    }
  }
  wc.putImageData(img, 0, 0);
  const waterBump = canvasTexture(waterCanvas, { colorSpace: false });
  waterBump.repeat.set(90, 90);
  const waterMat = new THREE.MeshStandardMaterial({
    color: 0x1c5870, roughness: 0.18, metalness: 0.62,
    bumpMap: waterBump, bumpScale: 0.55, envMapIntensity: 1.15,
  });
  const water = new THREE.Mesh(new THREE.PlaneGeometry(4200, 4200), waterMat);
  water.rotation.x = -Math.PI / 2;
  water.position.y = -0.55;
  water.receiveShadow = false;
  scene.add(water);

  // beach / island
  const sandMat = new THREE.MeshStandardMaterial({ color: 0xcdbb8e, roughness: 0.96, metalness: 0 });
  const island = new THREE.Mesh(new THREE.BoxGeometry(CITY.island, 1.1, CITY.island), sandMat);
  island.position.y = -0.56;
  island.receiveShadow = true;
  scene.add(island);

  // shore foam ring
  const foamMat = new THREE.MeshBasicMaterial({ color: 0xd8f2f4, transparent: true, opacity: 0.22, depthWrite: false });
  const foam = new THREE.Mesh(new THREE.RingGeometry(CITY.island * 0.485, CITY.island * 0.5, 64), foamMat);
  foam.rotation.x = -Math.PI / 2;
  foam.position.y = 0.01;
  scene.add(foam);

  // ---------------- Ground ----------------
  const groundTex = canvasTexture(makeGroundTexture(roads, rng, parks, plaza));
  groundTex.anisotropy = renderer.capabilities.getMaxAnisotropy();
  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(520, 520),
    new THREE.MeshStandardMaterial({ map: groundTex, roughness: 0.94, metalness: 0.02 }),
  );
  ground.rotation.x = -Math.PI / 2;
  ground.position.y = 0.05;
  ground.receiveShadow = true;
  scene.add(ground);

  const minimapBase = makeMinimapBase(roads, parks, plaza);

  // ---------------- Facades ----------------
  const facadeTextures = {
    glass: makeFacadeTextures('glass', rng),
    concrete: makeFacadeTextures('concrete', rng),
    brick: makeFacadeTextures('brick', rng),
  };
  const facadeMats = {};
  const facadeGeos = { glass: [], concrete: [], brick: [] };
  const roofGeos = [];
  const baseGeos = [];
  const propGeos = [];
  const shopGeos = [];
  let buildingCount = 0;

  const roofColor = new THREE.Color();
  const baseColor = new THREE.Color();

  function addBuilding(x, z, w, d, h, style, opts = {}) {
    const uS = w / 8, vS = h / 8;
    const dU = d / 8;
    // four facades
    facadeGeos[style].push(planeGeom(w, h, x, h / 2, z + d / 2, 0, uS, vS));
    facadeGeos[style].push(planeGeom(w, h, x, h / 2, z - d / 2, Math.PI, uS, vS));
    facadeGeos[style].push(planeGeom(d, h, x + w / 2, h / 2, z, Math.PI / 2, dU, vS));
    facadeGeos[style].push(planeGeom(d, h, x - w / 2, h / 2, z, -Math.PI / 2, dU, vS));

    // roof slab with slight overhang
    roofColor.setHSL(0.58, 0.04, 0.16 + rng() * 0.09);
    const roof = new THREE.BoxGeometry(w + 0.5, 0.55, d + 0.5);
    roof.translate(x, h + 0.27, z);
    roofGeos.push(colorize(roof, roofColor));

    // plinth
    baseColor.setHSL(0.09, 0.03, 0.3 + rng() * 0.08);
    const base = new THREE.BoxGeometry(w + 1.4, 1.5, d + 1.4);
    base.translate(x, 0.75, z);
    baseGeos.push(colorize(base, baseColor));

    // storefront glow strip on a random face
    if (rng() < 0.55) {
      const face = randInt(0, 3);
      const col = new THREE.Color().setHSL(rng() < 0.5 ? 0.09 : 0.55, 0.75, 0.6);
      let g;
      if (face === 0) g = planeGeom(w * 0.78, 2.4, x, 2.1, z + d / 2 + 0.03, 0, 3, 1);
      else if (face === 1) g = planeGeom(w * 0.78, 2.4, x, 2.1, z - d / 2 - 0.03, Math.PI, 3, 1);
      else if (face === 2) g = planeGeom(d * 0.78, 2.4, x + w / 2 + 0.03, 2.1, z, Math.PI / 2, 3, 1);
      else g = planeGeom(d * 0.78, 2.4, x - w / 2 - 0.03, 2.1, z, -Math.PI / 2, 3, 1);
      shotColorize(g, col);
      shopGeos.push(g);
    }

    // rooftop details
    if (h > 14) {
      const tank = new THREE.CylinderGeometry(1.1, 1.1, 2.2, 8);
      tank.translate(x + (rng() - 0.5) * w * 0.45, h + 1.6, z + (rng() - 0.5) * d * 0.45);
      propGeos.push(tank);
    }
    if (rng() < 0.7) {
      const ac = new THREE.BoxGeometry(2.2, 1.1, 1.6);
      ac.translate(x + (rng() - 0.5) * w * 0.5, h + 1.1, z + (rng() - 0.5) * d * 0.5);
      propGeos.push(ac);
    }
    if (h > 55) {
      const mast = new THREE.CylinderGeometry(0.09, 0.16, 9, 5);
      mast.translate(x, h + 5, z);
      propGeos.push(mast);
    }

    colliders.push({
      minX: x - w / 2 - 0.4, maxX: x + w / 2 + 0.4,
      minZ: z - d / 2 - 0.4, maxZ: z + d / 2 + 0.4,
      tall: h,
    });
    buildingCount++;
  }

  function shotColorize(geometry, color) {
    return colorize(geometry, color);
  }

  function addLot(x0, z0, x1, z1, forceTall = 0) {
    const w = Math.min(x1 - x0, 38);
    const d = Math.min(z1 - z0, 38);
    const gap = Math.max(0.5, Math.min(2.2, Math.min(w, d) * 0.08));
    const cx = (x0 + x1) / 2;
    const cz = (z0 + z1) / 2;
    const dc = Math.hypot(cx, cz);
    let h = 7 + rng() * 13 + Math.exp(-dc / 95) * rng() * 86;
    if (forceTall) h = forceTall + rng() * 34;
    h = Math.min(h, 138);
    const style = h > 46 || rng() < 0.2 ? 'glass' : rng() < 0.34 ? 'brick' : 'concrete';
    addBuilding(cx, cz, w - gap, d - gap, Math.round(h), style);
  }

  for (let i = 0; i < roads.length - 1; i++) {
    for (let j = 0; j < roads.length - 1; j++) {
      const key = `${i},${j}`;
      const x0 = roads[i] + CITY.margin;
      const z0 = roads[j] + CITY.margin;
      const x1 = roads[i + 1] - CITY.margin;
      const z1 = roads[j + 1] - CITY.margin;
      if (parks.has(key) || key === plaza) continue;

      const cx = (x0 + x1) / 2; const cz = (z0 + z1) / 2;
      const dc = Math.hypot(cx, cz);
      const split = rng() < 0.3 ? 1 : 2;
      const splitZ = rng() < 0.5;
      const tall = (i === 4 && (j === 2 || j === 6)) || (j === 4 && (i === 2 || i === 6));

      if (split === 1) {
        addLot(x0, z0, x1, z1, tall ? 72 : dc < 130 ? 20 : 0);
      } else if (splitZ) {
        const mid = z0 + (z1 - z0) * (0.38 + rng() * 0.24);
        addLot(x0, z0, x1, mid - 0.6, tall ? 66 : 0);
        addLot(x0, mid + 0.6, x1, z1, tall ? 74 : 0);
      } else {
        const mid = x0 + (x1 - x0) * (0.38 + rng() * 0.24);
        addLot(x0, z0, mid - 0.6, z1, tall ? 68 : 0);
        addLot(mid + 0.6, z0, x1, z1, tall ? 78 : 0);
      }
    }
  }

  // merge static architecture
  const buildingMeshes = [];
  for (const style of Object.keys(facadeGeos)) {
    const geo = mergeGeometries(facadeGeos[style], false);
    if (!geo) continue;
    const tex = facadeTextures[style];
    const mat = new THREE.MeshStandardMaterial({
      map: tex.map, emissiveMap: tex.emissiveMap, emissive: 0xffffff,
      emissiveIntensity: 0.25, roughness: 0.72, metalness: style === 'glass' ? 0.18 : 0.04,
      vertexColors: false,
    });
    facadeMats[style] = mat;
    const mesh = new THREE.Mesh(geo, mat);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    scene.add(mesh);
    buildingMeshes.push(mesh);
  }
  const roofMesh = new THREE.Mesh(mergeGeometries(roofGeos, false), new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.92, metalness: 0.05 }));
  roofMesh.castShadow = true; roofMesh.receiveShadow = true; scene.add(roofMesh);
  const baseMesh = new THREE.Mesh(mergeGeometries(baseGeos, false), new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.9, metalness: 0.03 }));
  baseMesh.castShadow = true; baseMesh.receiveShadow = true; scene.add(baseMesh);
  if (propGeos.length) {
    const propMesh = new THREE.Mesh(mergeGeometries(propGeos, false), new THREE.MeshStandardMaterial({ color: 0x7c828b, roughness: 0.55, metalness: 0.5 }));
    propMesh.castShadow = true; scene.add(propMesh);
  }
  if (shopGeos.length) {
    const shopMesh = new THREE.Mesh(mergeGeometries(shopGeos, false), new THREE.MeshBasicMaterial({ vertexColors: true, toneMapped: true }));
    scene.add(shopMesh);
  }

  // ---------------- Trees ----------------
  function makeTreeGeometry() {
    const geos = [];
    const trunk = new THREE.CylinderGeometry(0.19, 0.3, 4.4, 6);
    trunk.translate(0, 2.2, 0);
    geos.push(colorize(trunk, new THREE.Color('#5a4030')));
    const greens = ['#3f6b35', '#4c7a3c', '#365f31', '#5b8446'];
    for (let i = 0; i < 3; i++) {
      const blob = new THREE.IcosahedronGeometry(1.42 - i * 0.2, 0);
      blob.scale(1, 1.12, 1);
      blob.translate((rng() - 0.5) * 1.0, 5.3 + i * 0.95, (rng() - 0.5) * 1.0);
      geos.push(colorize(blob, new THREE.Color(greens[i % greens.length])));
    }
    return mergeMixed(geos);
  }
  const treeGeo = makeTreeGeometry();
  const treeMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.86, flatShading: true });
  const treePositions = [];

  // park trees
  for (const key of parks) {
    const [i, j] = key.split(',').map(Number);
    const x0 = roads[i] + CITY.margin; const x1 = roads[i + 1] - CITY.margin;
    const z0 = roads[j] + CITY.margin; const z1 = roads[j + 1] - CITY.margin;
    for (let k = 0; k < 18; k++) {
      treePositions.push({ x: x0 + 3 + rng() * (x1 - x0 - 6), z: z0 + 3 + rng() * (z1 - z0 - 6), s: 0.75 + rng() * 0.45 });
    }
  }
  // plaza trees + boulevard trees
  {
    const x0 = roads[4] + CITY.margin, x1 = roads[5] - CITY.margin;
    const z0 = roads[4] + CITY.margin, z1 = roads[5] - CITY.margin;
    for (let k = 0; k < 10; k++) {
      const side = k % 4;
      treePositions.push({
        x: side < 2 ? x0 + 4 + rng() * 5 : x1 - 4 - rng() * 5,
        z: z0 + 6 + rng() * (z1 - z0 - 12),
        s: 0.7 + rng() * 0.35,
      });
    }
  }
  for (const r of roads) {
    for (let k = 0; k < 8; k++) {
      if (rng() < 0.45) continue;
      const along = roads[0] + 30 + k * 60 + (rng() - 0.5) * 6;
      if (rng() < 0.5) treePositions.push({ x: along, z: r + 9.8, s: 0.6 + rng() * 0.25 });
      else treePositions.push({ x: r + 9.8, z: along, s: 0.6 + rng() * 0.25 });
    }
  }
  const clearedTrees = treePositions.filter((p) => Math.hypot(p.x - 9.5, p.z - 24) > 16);
  treePositions.length = 0;
  treePositions.push(...clearedTrees);
  const treeMesh = new THREE.InstancedMesh(treeGeo, treeMat, treePositions.length);
  const dummy = new THREE.Object3D();
  treePositions.forEach((p, i) => {
    dummy.position.set(p.x, 0, p.z);
    dummy.rotation.y = rng() * Math.PI * 2;
    dummy.scale.setScalar(p.s);
    dummy.updateMatrix();
    treeMesh.setMatrixAt(i, dummy.matrix);
  });
  treeMesh.castShadow = true;
  treeMesh.receiveShadow = true;
  treeMesh.instanceMatrix.needsUpdate = true;
  scene.add(treeMesh);

  // ---------------- Palms ----------------
  function makePalmGeometry() {
    const geos = [];
    const trunk = new THREE.CylinderGeometry(0.17, 0.32, 6.5, 6);
    trunk.translate(0, 3.2, 0);
    geos.push(colorize(trunk, new THREE.Color('#6b5038')));
    for (let i = 0; i < 8; i++) {
      const leaf = new THREE.BoxGeometry(0.35, 0.08, 3.6);
      leaf.translate(0, 0, 1.8);
      leaf.rotateX(-0.28);
      leaf.rotateY((i / 8) * Math.PI * 2);
      leaf.translate(0, 6.5, 0);
      geos.push(colorize(leaf, new THREE.Color(i % 2 ? '#3f7a3a' : '#4d8b42')));
    }
    const crown = new THREE.IcosahedronGeometry(0.7, 0);
    crown.scale(1, 0.7, 1);
    crown.translate(0, 6.4, 0);
    geos.push(colorize(crown, new THREE.Color('#4c7a3c')));
    return mergeMixed(geos);
  }
  const palmGeo = makePalmGeometry();
  const palmMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.85, flatShading: true });
  const palmCount = mobile ? 34 : 52;
  const palmMesh = new THREE.InstancedMesh(palmGeo, palmMat, palmCount);
  for (let i = 0; i < palmCount; i++) {
    const side = i % 4;
    const t = rng();
    let x, z;
    const edge = CITY.island / 2 - 18 - rng() * 34;
    if (side === 0) { x = -edge; z = (t - 0.5) * (CITY.island - 80); }
    else if (side === 1) { x = edge; z = (t - 0.5) * (CITY.island - 80); }
    else if (side === 2) { z = -edge; x = (t - 0.5) * (CITY.island - 80); }
    else { z = edge; x = (t - 0.5) * (CITY.island - 80); }
    dummy.position.set(x, 0, z);
    dummy.rotation.y = rng() * Math.PI * 2;
    dummy.scale.setScalar(0.8 + rng() * 0.55);
    dummy.updateMatrix();
    palmMesh.setMatrixAt(i, dummy.matrix);
  }
  palmMesh.castShadow = true;
  palmMesh.instanceMatrix.needsUpdate = true;
  scene.add(palmMesh);

  // ---------------- Street lights ----------------
  const lightPositions = [];
  for (let ri = 0; ri < roads.length; ri++) {
    for (let k = 0; k < 8; k++) {
      const along = roads[0] + 30 + k * 60;
      for (const side of [-1, 1]) {
        lightPositions.push({ x: along, z: roads[ri] + side * 9.6, axis: 'x', side });
        lightPositions.push({ x: roads[ri] + side * 9.6, z: along, axis: 'z', side });
      }
    }
  }
  for (let i = lightPositions.length - 1; i >= 0; i--) {
    if (Math.hypot(lightPositions[i].x - 9.5, lightPositions[i].z - 24) < 15) lightPositions.splice(i, 1);
  }
  const poleGeo = new THREE.CylinderGeometry(0.1, 0.16, 7.2, 6);
  poleGeo.translate(0, 3.6, 0);
  const poleMat = new THREE.MeshStandardMaterial({ color: 0x30353c, roughness: 0.55, metalness: 0.7 });
  const poleMesh = new THREE.InstancedMesh(poleGeo, poleMat, lightPositions.length);
  const armGeo = new THREE.BoxGeometry(0.12, 0.12, 1.9);
  const armMesh = new THREE.InstancedMesh(armGeo, poleMat, lightPositions.length);
  const lampGeo = new THREE.BoxGeometry(0.5, 0.14, 0.95);
  const lampMat = new THREE.MeshStandardMaterial({ color: 0x2b2d30, emissive: 0xffc46b, emissiveIntensity: 0.4 });
  const lampMesh = new THREE.InstancedMesh(lampGeo, lampMat, lightPositions.length);
  lightPositions.forEach((p, i) => {
    dummy.position.set(p.x, 0, p.z);
    dummy.rotation.set(0, p.axis === 'x' ? (p.side > 0 ? Math.PI : 0) : (p.side > 0 ? -Math.PI / 2 : Math.PI / 2), 0);
    dummy.scale.setScalar(1);
    dummy.updateMatrix();
    poleMesh.setMatrixAt(i, dummy.matrix);
    // arm extends toward the road
    const arm = new THREE.Object3D();
    arm.position.set(p.x, 7.1, p.z);
    if (p.axis === 'x') arm.position.z -= p.side * 0.95;
    else arm.position.x -= p.side * 0.95;
    arm.rotation.y = p.axis === 'x' ? 0 : Math.PI / 2;
    arm.updateMatrix();
    armMesh.setMatrixAt(i, arm.matrix);
    const lamp = new THREE.Object3D();
    lamp.position.set(p.x, 7.05, p.z);
    if (p.axis === 'x') lamp.position.z -= p.side * 1.9;
    else lamp.position.x -= p.side * 1.9;
    lamp.rotation.y = p.axis === 'x' ? 0 : Math.PI / 2;
    lamp.updateMatrix();
    lampMesh.setMatrixAt(i, lamp.matrix);
  });
  poleMesh.castShadow = true;
  poleMesh.instanceMatrix.needsUpdate = true;
  armMesh.instanceMatrix.needsUpdate = true;
  lampMesh.instanceMatrix.needsUpdate = true;
  scene.add(poleMesh, armMesh, lampMesh);

  // warm pools of light on the ground
  const poolCanvas = makeCanvas(128, 128);
  const pctx = poolCanvas.getContext('2d');
  const pg = pctx.createRadialGradient(64, 64, 2, 64, 64, 64);
  pg.addColorStop(0, 'rgba(255,205,130,0.85)');
  pg.addColorStop(0.4, 'rgba(255,190,110,0.28)');
  pg.addColorStop(1, 'rgba(255,180,90,0)');
  pctx.fillStyle = pg; pctx.fillRect(0, 0, 128, 128);
  const poolTex = canvasTexture(poolCanvas, { repeat: false });
  const poolMat = new THREE.MeshBasicMaterial({
    map: poolTex, transparent: true, opacity: 0, depthWrite: false,
    blending: THREE.AdditiveBlending, color: 0xffc06a, side: THREE.DoubleSide,
  });
  const poolMesh = new THREE.InstancedMesh(new THREE.PlaneGeometry(11, 11), poolMat, lightPositions.length);
  lightPositions.forEach((p, i) => {
    dummy.position.set(p.x + (p.axis === 'x' ? 0 : -p.side * 1.9), 0.09, p.z + (p.axis === 'x' ? -p.side * 1.9 : 0));
    dummy.rotation.set(-Math.PI / 2, 0, 0);
    dummy.scale.setScalar(1);
    dummy.updateMatrix();
    poolMesh.setMatrixAt(i, dummy.matrix);
  });
  poolMesh.instanceMatrix.needsUpdate = true;
  scene.add(poolMesh);

  // ---------------- Crossing / props ----------------
  // Traffic signal poles at a few central intersections
  const signalMat = new THREE.MeshStandardMaterial({ color: 0x23262b, roughness: 0.6, metalness: 0.5 });
  const signalGreen = new THREE.MeshStandardMaterial({ color: 0x0b2014, emissive: 0x53ff94, emissiveIntensity: 1.2 });
  const signalGroup = new THREE.Group();
  for (const rx of [-120, 0, 120]) {
    for (const rz of [-120, 0, 120]) {
      if (Math.abs(rx) === 120 && Math.abs(rz) === 120 && rng() < 0.5) continue;
      const post = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.09, 5, 6), signalMat);
      post.position.set(rx + 8.4, 2.5, rz + 8.4);
      const head = new THREE.Mesh(new THREE.BoxGeometry(0.4, 1.0, 0.28), signalMat);
      head.position.set(rx + 8.4, 5.1, rz + 8.4);
      const lightSmall = new THREE.Mesh(new THREE.CircleGeometry(0.11, 8), signalGreen);
      lightSmall.position.set(rx + 8.4, 5.35, rz + 8.56);
      signalGroup.add(post, head, lightSmall);
    }
  }
  scene.add(signalGroup);

  // Plaza fountain
  const fountainX = 30, fountainZ = 30;
  const stoneMat = new THREE.MeshStandardMaterial({ color: 0x9a958a, roughness: 0.8 });
  const fountain = new THREE.Group();
  const basin = new THREE.Mesh(new THREE.CylinderGeometry(6.2, 6.5, 0.9, 28), stoneMat);
  basin.position.y = 0.45; basin.castShadow = true; basin.receiveShadow = true;
  const waterDisc = new THREE.Mesh(
    new THREE.CylinderGeometry(5.5, 5.5, 0.12, 28),
    new THREE.MeshStandardMaterial({ color: 0x2f7f96, roughness: 0.16, metalness: 0.6 }),
  );
  waterDisc.position.y = 0.9;
  const column = new THREE.Mesh(new THREE.CylinderGeometry(0.7, 1.15, 3.4, 12), stoneMat);
  column.position.y = 2.4; column.castShadow = true;
  const bowl = new THREE.Mesh(new THREE.CylinderGeometry(2.1, 1.1, 0.5, 20), stoneMat);
  bowl.position.y = 4.0; bowl.castShadow = true;
  const spout = new THREE.Mesh(
    new THREE.CylinderGeometry(0.22, 0.32, 2.4, 8),
    new THREE.MeshStandardMaterial({ color: 0x6fc7d8, transparent: true, opacity: 0.55, roughness: 0.1 }),
  );
  spout.position.y = 5.1;
  fountain.add(basin, waterDisc, column, bowl, spout);
  fountain.position.set(fountainX, 0, fountainZ);
  scene.add(fountain);
  colliders.push({ minX: fountainX - 6.8, maxX: fountainX + 6.8, minZ: fountainZ - 6.8, maxZ: fountainZ + 6.8, tall: 1 });

  // Benches around the plaza
  const benchMat = new THREE.MeshStandardMaterial({ color: 0x5b4632, roughness: 0.8 });
  const benchSeat = new THREE.BoxGeometry(2.2, 0.18, 0.6);
  const benchBack = new THREE.BoxGeometry(2.2, 0.6, 0.14);
  const benchGeos = [];
  for (let i = 0; i < 10; i++) {
    const a = (i / 10) * Math.PI * 2;
    const bx = fountainX + Math.cos(a) * 10.5;
    const bz = fountainZ + Math.sin(a) * 10.5;
    const seat = benchSeat.clone(); seat.rotateY(-a + Math.PI / 2); seat.translate(bx, 0.52, bz);
    const back = benchBack.clone(); back.rotateY(-a + Math.PI / 2);
    back.translate(bx - Math.sin(a) * 0.26, 0.84, bz + Math.cos(a) * 0.26);
    benchGeos.push(seat, back);
  }
  const benchMesh = new THREE.Mesh(mergeGeometries(benchGeos, false), benchMat);
  benchMesh.castShadow = true; benchMesh.receiveShadow = true;
  scene.add(benchMesh);

  // ---------------- Clouds ----------------
  const cloudCanvas = makeCanvas(256, 128);
  const cc = cloudCanvas.getContext('2d');
  for (let i = 0; i < 26; i++) {
    const x = 40 + rng() * 176;
    const y = 42 + rng() * 52;
    const r = 16 + rng() * 38;
    const g = cc.createRadialGradient(x, y, 1, x, y, r);
    g.addColorStop(0, 'rgba(255,255,255,0.42)');
    g.addColorStop(0.55, 'rgba(255,255,255,0.18)');
    g.addColorStop(1, 'rgba(255,255,255,0)');
    cc.fillStyle = g;
    cc.beginPath(); cc.arc(x, y, r, 0, Math.PI * 2); cc.fill();
  }
  const cloudTex = canvasTexture(cloudCanvas, { repeat: false });
  const cloudMat = new THREE.SpriteMaterial({ map: cloudTex, transparent: true, opacity: 0.6, depthWrite: false, fog: false });
  const clouds = [];
  for (let i = 0; i < 16; i++) {
    const s = new THREE.Sprite(cloudMat.clone());
    s.position.set((rng() - 0.5) * 1100, 110 + rng() * 80, (rng() - 0.5) * 1100);
    const sc = 120 + rng() * 160;
    s.scale.set(sc, sc * 0.45, 1);
    s.material.opacity = 0.34 + rng() * 0.28;
    scene.add(s);
    clouds.push(s);
  }

  // ---------------- Parking spots ----------------
  for (const r of roads) {
    for (let k = 0; k < 8; k++) {
      const mid = roads[0] + 30 + k * 60;
      if (rng() < 0.24) {
        parkingSpots.push({ x: mid + (rng() - 0.5) * 12, z: r + 6.1 * (rng() < 0.5 ? 1 : -1), heading: rng() < 0.5 ? Math.PI / 2 : -Math.PI / 2 });
      }
      if (rng() < 0.24) {
        parkingSpots.push({ x: r + 6.1 * (rng() < 0.5 ? 1 : -1), z: mid + (rng() - 0.5) * 12, heading: rng() < 0.5 ? 0 : Math.PI });
      }
    }
  }

  // ---------------- Update ----------------
  const sunDir = new THREE.Vector3();
  const tmpColor = new THREE.Color();
  const topDay = new THREE.Color('#4a83c4');
  const topNight = new THREE.Color('#050b1c');
  const horizonDay = new THREE.Color('#cfe3f2');
  const horizonNight = new THREE.Color('#0e1a30');
  const goldHorizon = new THREE.Color('#ffb066');
  const sunWarm = new THREE.Color('#ffb45e');
  const sunWhite = new THREE.Color('#fff4dc');
  const dayCycle = 700;
  let timeOfDay = 0.275;
  let elapsed = 0;
  let lastNight = -1;

  const world = {
    colliders,
    parkingSpots,
    roads,
    spawn: { x: 9.5, z: 24, yaw: Math.PI + 0.1 },
    fountain: { x: fountainX, z: fountainZ },
    minimapBase,
    minimapWorldSpan: 540,
    buildingCount,
    timeOfDay,
    sun,
    sky,
    water,
    update(dt, t, focus) {
      elapsed += dt;
      timeOfDay = (0.275 + elapsed / dayCycle) % 1;
      world.timeOfDay = timeOfDay;

      const angle = (timeOfDay - 0.25) * Math.PI * 2;
      sunDir.set(Math.cos(angle) * 0.55, Math.sin(angle), Math.cos(angle) * 0.84).normalize();

      const elev = sunDir.y;
      const dayF = smoothstep(-0.04, 0.3, elev);
      const gold = Math.exp(-Math.pow((elev - 0.08) / 0.13, 2));
      const night = 1 - smoothstep(-0.12, 0.1, elev);
      const nightF = smoothstep(0.15, 0.85, night);

      tmpColor.copy(topNight).lerp(topDay, dayF);
      skyUniforms.topColor.value.copy(tmpColor);
      tmpColor.copy(horizonNight).lerp(horizonDay, dayF).lerp(goldHorizon, gold * 0.8);
      skyUniforms.horizonColor.value.copy(tmpColor);
      skyUniforms.sunColor.value.copy(sunWarm).lerp(sunWhite, smoothstep(0.08, 0.55, elev));
      skyUniforms.sunDir.value.copy(sunDir);
      skyUniforms.nightMix.value = nightF;

      scene.fog.color.copy(tmpColor).multiplyScalar(0.92);
      scene.fog.near = 120;
      scene.fog.far = 640;

      sun.color.copy(skyUniforms.sunColor.value);
      sun.intensity = Math.max(0.05, smoothstep(-0.04, 0.24, elev) * 2.35);
      hemi.intensity = 0.28 + dayF * 0.72;
      hemi.color.copy(tmpColor).lerp(new THREE.Color('#ffffff'), 0.4);
      hemi.groundColor.set(0x393a34);

      const focusX = focus ? focus.x : 0;
      const focusZ = focus ? focus.z : 0;
      sun.position.set(focusX + sunDir.x * 190, sunDir.y * 190, focusZ + sunDir.z * 190);
      sun.target.position.set(focusX, 0, focusZ);
      sun.target.updateMatrixWorld();

      sky.position.set(focusX, 0, focusZ);
      stars.position.set(focusX, 0, focusZ);
      stars.rotation.y = elapsed * 0.002;
      starMat.opacity = nightF * 0.9;
      moon.position.set(focusX - sunDir.x * 1300, Math.max(90, -sunDir.y * 700 + 260), focusZ - sunDir.z * 1300);
      moonMat.opacity = nightF * 0.95;

      waterBump.offset.x = elapsed * 0.004;
      waterBump.offset.y = elapsed * 0.0025;
      waterMat.envMapIntensity = 0.35 + dayF * 0.8;

      const winGlow = 0.18 + nightF * 1.85;
      for (const style of Object.keys(facadeMats)) facadeMats[style].emissiveIntensity = winGlow;
      lampMat.emissiveIntensity = 0.25 + nightF * 3.2;
      poolMat.opacity = nightF * 0.42 + gold * 0.08;

      cloudMat.opacity = 0.5;
      for (let i = 0; i < clouds.length; i++) {
        const c = clouds[i];
        c.position.x += dt * (1.2 + i * 0.15);
        if (c.position.x > 620) c.position.x = -620;
        c.material.color.copy(tmpColor).lerp(new THREE.Color('#ffffff'), 0.78 + dayF * 0.18);
        c.material.opacity = 0.13 + dayF * 0.22;
      }

      // Slow bobbing on the water surface
      water.position.y = -0.55 + Math.sin(elapsed * 0.5) * 0.02;
      foam.scale.setScalar(1 + Math.sin(elapsed * 0.7) * 0.004);
      lastNight = nightF;
      return { nightF, dayF, gold };
    },
    get night() { return lastNight; },
  };

  // Initial sky/light state
  world.update(0, 0, { x: 0, z: 0 });
  return world;
}
