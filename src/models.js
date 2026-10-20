import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/BufferGeometryUtils.js';

function colorize(geo, hex) {
  const c = new THREE.Color(hex);
  const n = geo.attributes.position.count;
  const arr = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) { arr[i * 3] = c.r; arr[i * 3 + 1] = c.g; arr[i * 3 + 2] = c.b; }
  geo.setAttribute('color', new THREE.BufferAttribute(arr, 3));
  return geo;
}

function mergeAny(geos) {
  const cleaned = geos.map((g) => (g.index ? g.toNonIndexed() : g));
  return mergeGeometries(cleaned, false);
}

function box(w, h, d, x, y, z, hex) {
  const g = new THREE.BoxGeometry(w, h, d);
  g.translate(x, y, z);
  if (hex) colorize(g, hex);
  return g;
}

const carGeoCache = new Map();

function buildCarGeometries(type) {
  const body = [];
  const trim = [];
  const lights = [];
  const glass = [];

  if (type === 'van') {
    body.push(box(2.0, 0.92, 4.7, 0, 0.76, 0));
    body.push(box(1.94, 0.2, 1.1, 0, 1.18, 1.85));
    body.push(box(1.96, 0.14, 3.95, 0, 1.84, -0.25));
    glass.push(box(1.88, 0.58, 3.9, 0, 1.5, -0.25));
    trim.push(box(2.04, 0.22, 0.34, 0, 0.42, 2.42));
    trim.push(box(2.04, 0.22, 0.34, 0, 0.42, -2.42));
    trim.push(box(1.8, 0.18, 0.1, 0, 0.72, 2.38));
    for (const px of [0.92, -0.92]) {
      for (const pz of [-2.14, 1.62]) trim.push(box(0.09, 0.64, 0.09, px, 1.52, pz));
      trim.push(box(0.09, 0.64, 0.09, px, 1.52, -0.3));
    }
    lights.push(box(0.42, 0.2, 0.08, 0.64, 0.8, 2.38, '#fff3cf'));
    lights.push(box(0.42, 0.2, 0.08, -0.64, 0.8, 2.38, '#fff3cf'));
    lights.push(box(0.38, 0.24, 0.08, 0.7, 0.8, -2.38, '#ff2a20'));
    lights.push(box(0.38, 0.24, 0.08, -0.7, 0.8, -2.38, '#ff2a20'));
  } else if (type === 'sports') {
    body.push(box(1.96, 0.46, 4.55, 0, 0.55, 0));
    body.push(box(1.86, 0.2, 1.5, 0, 0.82, 1.38));
    body.push(box(1.86, 0.18, 0.9, 0, 0.8, -1.7));
    body.push(box(1.5, 0.09, 1.44, 0, 1.31, -0.25));
    body.push(box(1.7, 0.09, 0.38, 0, 1.0, -2.02));
    glass.push(box(1.47, 0.46, 1.5, 0, 1.06, -0.25));
    trim.push(box(2.0, 0.16, 0.3, 0, 0.34, 2.28));
    trim.push(box(2.0, 0.16, 0.3, 0, 0.34, -2.28));
    trim.push(box(0.3, 0.12, 0.9, 1.02, 0.95, 0.55));
    trim.push(box(0.3, 0.12, 0.9, -1.02, 0.95, 0.55));
    for (const px of [0.71, -0.71]) {
      trim.push(box(0.07, 0.48, 0.07, px, 1.07, -0.98));
      trim.push(box(0.07, 0.48, 0.07, px, 1.07, 0.48));
    }
    lights.push(box(0.5, 0.12, 0.08, 0.58, 0.72, 2.29, '#f4f8ff'));
    lights.push(box(0.5, 0.12, 0.08, -0.58, 0.72, 2.29, '#f4f8ff'));
    lights.push(box(0.46, 0.1, 0.08, 0.62, 0.72, -2.28, '#ff2418'));
    lights.push(box(0.46, 0.1, 0.08, -0.62, 0.72, -2.28, '#ff2418'));
  } else {
    // sedan / taxi / police
    body.push(box(1.92, 0.55, 4.4, 0, 0.63, 0));
    body.push(box(1.82, 0.24, 1.15, 0, 0.97, 1.4));
    body.push(box(1.82, 0.2, 0.95, 0, 0.95, -1.55));
    body.push(box(1.56, 0.1, 1.82, 0, 1.43, -0.12));
    glass.push(box(1.52, 0.52, 1.86, 0, 1.17, -0.12));
    trim.push(box(1.98, 0.17, 0.3, 0, 0.42, 2.2));
    trim.push(box(1.98, 0.17, 0.3, 0, 0.42, -2.2));
    trim.push(box(1.22, 0.19, 0.08, 0, 0.68, 2.31));
    trim.push(box(0.26, 0.13, 0.55, 1.05, 1.15, 0.62));
    trim.push(box(0.26, 0.13, 0.55, -1.05, 1.15, 0.62));
    for (const px of [0.74, -0.74]) {
      trim.push(box(0.07, 0.54, 0.07, px, 1.18, -1.05));
      trim.push(box(0.07, 0.54, 0.07, px, 1.18, 0.81));
      trim.push(box(0.07, 0.54, 0.07, px, 1.18, -0.12));
    }
    lights.push(box(0.4, 0.14, 0.08, 0.6, 0.8, 2.28, '#fff4d6'));
    lights.push(box(0.4, 0.14, 0.08, -0.6, 0.8, 2.28, '#fff4d6'));
    lights.push(box(0.42, 0.13, 0.08, 0.62, 0.82, -2.22, '#ff2b1e'));
    lights.push(box(0.42, 0.13, 0.08, -0.62, 0.82, -2.22, '#ff2b1e'));
  }

  // wheels (single merged mesh)
  const isVan = type === 'van';
  const wheels = [];
  const wheelPositions = isVan
    ? [[1.0, 0.38, 1.62], [-1.0, 0.38, 1.62], [1.0, 0.38, -1.55], [-1.0, 0.38, -1.55]]
    : [[0.94, 0.34, 1.42], [-0.94, 0.34, 1.42], [0.94, 0.34, -1.42], [-0.94, 0.34, -1.42]];
  const radius = isVan ? 0.4 : 0.35;
  for (const [wx, wy, wz] of wheelPositions) {
    const w = new THREE.CylinderGeometry(radius, radius, 0.27, 12);
    w.rotateZ(Math.PI / 2);
    w.translate(wx, wy, wz);
    wheels.push(colorize(w, '#121316'));
    const hub = new THREE.CylinderGeometry(radius * 0.5, radius * 0.5, 0.29, 8);
    hub.rotateZ(Math.PI / 2);
    hub.translate(wx, wy, wz);
    wheels.push(colorize(hub, '#7b8088'));
  }

  return {
    body: mergeGeometries(body, false),
    glass: mergeGeometries(glass, false),
    trim: mergeGeometries(trim, false),
    lights: mergeAny(lights),
    wheels: mergeAny(wheels),
  };
}

const glassMat = new THREE.MeshPhysicalMaterial({
  color: 0x8fb7cc, metalness: 0.4, roughness: 0.08, transmission: 0, opacity: 0.82,
  transparent: true, envMapIntensity: 1.6, side: THREE.DoubleSide,
});
const trimMat = new THREE.MeshStandardMaterial({ color: 0x17191d, metalness: 0.75, roughness: 0.35 });
const wheelMat = new THREE.MeshStandardMaterial({ vertexColors: true, metalness: 0.5, roughness: 0.55 });
const lightMat = new THREE.MeshBasicMaterial({ vertexColors: true, toneMapped: false });
const bodyMatCache = new Map();

function bodyMaterial(color) {
  const key = color >>> 0;
  if (!bodyMatCache.has(key)) {
    bodyMatCache.set(key, new THREE.MeshPhysicalMaterial({
      color, metalness: 0.62, roughness: 0.26, envMapIntensity: 1.25,
      clearcoat: 0.85, clearcoatRoughness: 0.16,
    }));
  }
  return bodyMatCache.get(key);
}

export function createCar({ type = 'sedan', color = 0xcf3a2e, police = false } = {}) {
  const group = new THREE.Group();
  if (!carGeoCache.has(type)) carGeoCache.set(type, buildCarGeometries(type));
  const geos = carGeoCache.get(type);

  const body = new THREE.Mesh(geos.body, bodyMaterial(color));
  body.castShadow = true; body.receiveShadow = true;
  group.add(body);

  const glass = new THREE.Mesh(geos.glass, glassMat);
  glass.castShadow = false;
  group.add(glass);

  const trim = new THREE.Mesh(geos.trim, trimMat);
  trim.castShadow = true;
  group.add(trim);

  const lights = new THREE.Mesh(geos.lights, lightMat);
  group.add(lights);

  const wheels = new THREE.Mesh(geos.wheels, wheelMat);
  group.add(wheels);

  let lightbar = null;
  let taxiSign = null;
  if (police) {
    lightbar = new THREE.Group();
    const barBase = new THREE.Mesh(new THREE.BoxGeometry(1.15, 0.08, 0.28), trimMat);
    barBase.position.set(0, 1.51, -0.1);
    const redMat = new THREE.MeshStandardMaterial({ color: 0x300302, emissive: 0xff2418, emissiveIntensity: 2.2, toneMapped: false });
    const blueMat = new THREE.MeshStandardMaterial({ color: 0x020a30, emissive: 0x2b6bff, emissiveIntensity: 2.2, toneMapped: false });
    const redL = new THREE.Mesh(new THREE.BoxGeometry(0.48, 0.15, 0.24), redMat);
    const blueL = new THREE.Mesh(new THREE.BoxGeometry(0.48, 0.15, 0.24), blueMat);
    redL.position.set(-0.3, 1.58, -0.1);
    blueL.position.set(0.3, 1.58, -0.1);
    lightbar.add(barBase, redL, blueL);
    group.add(lightbar);
    group.userData.redMat = redMat;
    group.userData.blueMat = blueMat;
  }
  if (type === 'taxi') {
    taxiSign = new THREE.Mesh(
      new THREE.BoxGeometry(0.6, 0.18, 0.28),
      new THREE.MeshStandardMaterial({ color: 0xffe7a0, emissive: 0xffc84d, emissiveIntensity: 1.6 }),
    );
    taxiSign.position.set(0, 1.56, -0.1);
    group.add(taxiSign);
  }

  group.userData.type = type;
  group.userData.isPolice = police;
  group.traverse((o) => { if (o.isMesh) { o.updateMatrix(); o.matrixAutoUpdate = false; } });
  group.userData.length = type === 'van' ? 4.7 : type === 'sports' ? 4.55 : 4.4;
  return group;
}

const charGeoCache = new Map();
function limbGeos() {
  if (charGeoCache.has('limbs')) return charGeoCache.get('limbs');
  const arm = new THREE.BoxGeometry(0.17, 0.6, 0.19);
  arm.translate(0, -0.3, 0);
  const leg = new THREE.BoxGeometry(0.21, 0.62, 0.24);
  leg.translate(0, -0.31, 0);
  const shoe = new THREE.BoxGeometry(0.23, 0.12, 0.36);
  shoe.translate(0, -0.6, 0.05);
  const result = { arm, leg: mergeGeometries([leg, shoe], false) };
  charGeoCache.set('limbs', result);
  return result;
}

const skinMats = [
  new THREE.MeshStandardMaterial({ color: 0xc98b62, roughness: 0.72 }),
  new THREE.MeshStandardMaterial({ color: 0x8a5a3c, roughness: 0.72 }),
  new THREE.MeshStandardMaterial({ color: 0x6c432b, roughness: 0.72 }),
  new THREE.MeshStandardMaterial({ color: 0xe0b08a, roughness: 0.72 }),
];
const hairMatShared = new THREE.MeshStandardMaterial({ color: 0x1b1613, roughness: 0.9 });
const upperMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.74, metalness: 0.02 });
const shoeMat = new THREE.MeshStandardMaterial({ color: 0x191a1e, roughness: 0.85 });

export function createCharacter({
  shirt = 0x2f6bb5, pants = 0x23262c, skin = 0, hat = false,
} = {}) {
  const group = new THREE.Group();
  const skinMat = skinMats[skin % skinMats.length];
  const shirtMat = new THREE.MeshStandardMaterial({ color: shirt, roughness: 0.72 });
  const pantsMat = new THREE.MeshStandardMaterial({ color: pants, roughness: 0.82 });

  const torso = colorize(new THREE.BoxGeometry(0.58, 0.66, 0.32), new THREE.Color(shirt));
  torso.translate(0, 1.2, 0);
  const hips = colorize(new THREE.BoxGeometry(0.5, 0.3, 0.3), new THREE.Color(pants));
  hips.translate(0, 0.83, 0);
  const neck = colorize(new THREE.CylinderGeometry(0.075, 0.085, 0.12, 6), new THREE.Color(0xb57e58));
  neck.translate(0, 1.58, 0);
  const head = colorize(new THREE.SphereGeometry(0.2, 12, 10), new THREE.Color(skinMats[skin % skinMats.length].color));
  head.translate(0, 1.78, 0);
  const hair = colorize(new THREE.SphereGeometry(0.207, 12, 7, 0, Math.PI * 2, 0, Math.PI * 0.55), new THREE.Color(0x1b1613));
  hair.translate(0, 1.8, -0.01);
  const upper = mergeAny([torso, hips, neck, head, hair]);

  const upperMesh = new THREE.Mesh(upper, upperMat);
  upperMesh.castShadow = true;
  group.add(upperMesh);

  const { arm, leg } = limbGeos();
  const leftArm = new THREE.Mesh(arm, shirtMat);
  const rightArm = new THREE.Mesh(arm, shirtMat);
  leftArm.position.set(0.4, 1.45, 0);
  rightArm.position.set(-0.4, 1.45, 0);
  const handGeo = new THREE.BoxGeometry(0.19, 0.16, 0.2);
  handGeo.translate(0, -0.63, 0.01);
  for (const arm of [leftArm, rightArm]) {
    const hand = new THREE.Mesh(handGeo, skinMat);
    hand.castShadow = true;
    arm.add(hand);
  }
  leftArm.castShadow = rightArm.castShadow = true;
  group.add(leftArm, rightArm);

  const leftLeg = new THREE.Mesh(leg, pantsMat);
  const rightLeg = new THREE.Mesh(leg, pantsMat);
  leftLeg.position.set(0.15, 0.82, 0);
  rightLeg.position.set(-0.15, 0.82, 0);
  leftLeg.castShadow = rightLeg.castShadow = true;
  group.add(leftLeg, rightLeg);

  if (hat) {
    const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.205, 0.215, 0.1, 12), hairMatShared);
    cap.position.set(0, 1.93, 0);
    const brim = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.04, 0.22), hairMatShared);
    brim.position.set(0, 1.9, 0.19);
    group.add(cap, brim);
  }

  // A sidearm carried in the right hand; hidden while driving.
  const gun = new THREE.Group();
  const grip = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.18, 0.09), trimMat);
  const barrel = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.08, 0.28), trimMat);
  barrel.position.set(0, 0.1, 0.1);
  gun.add(grip, barrel);
  gun.position.set(0, -0.56, 0.14);
  gun.rotation.x = -0.15;
  rightArm.add(gun);

  group.userData.leftArm = leftArm;
  group.userData.rightArm = rightArm;
  group.userData.leftLeg = leftLeg;
  group.userData.rightLeg = rightLeg;
  group.userData.gun = gun;
  group.userData.phase = Math.random() * Math.PI * 2;
  return group;
}

export function animateCharacter(character, dt, speed, grounded = true) {
  const d = character.userData;
  const moving = speed > 0.2;
  d.phase += dt * (moving ? (4.2 + speed * 0.85) : 1.6);
  const amt = Math.min(1, speed / 4.5);
  const swing = Math.sin(d.phase) * 0.62 * amt;
  d.leftLeg.rotation.x = grounded ? swing : -0.4;
  d.rightLeg.rotation.x = grounded ? -swing : 0.5;
  d.leftArm.rotation.x = grounded ? -swing * 0.8 : -0.9;
  d.rightArm.rotation.x = grounded ? swing * 0.8 : -0.9;
  d.bob = grounded ? Math.abs(Math.sin(d.phase)) * 0.025 * amt : 0;
}

export function createBarrel() {
  const group = new THREE.Group();
  const mat = new THREE.MeshStandardMaterial({ color: 0xb02a1e, metalness: 0.55, roughness: 0.42, emissive: 0x330000, emissiveIntensity: 0.5 });
  const drum = new THREE.Mesh(new THREE.CylinderGeometry(0.45, 0.45, 1.25, 14), mat);
  drum.position.y = 0.63; drum.castShadow = true;
  const ringMat = new THREE.MeshStandardMaterial({ color: 0x30100c, metalness: 0.7, roughness: 0.35 });
  const ring1 = new THREE.Mesh(new THREE.TorusGeometry(0.46, 0.055, 6, 14), ringMat);
  ring1.rotation.x = Math.PI / 2; ring1.position.y = 0.95;
  const ring2 = ring1.clone(); ring2.position.y = 0.3;
  const band = new THREE.Mesh(new THREE.BoxGeometry(0.66, 0.2, 0.01), new THREE.MeshStandardMaterial({ color: 0xf3c44a, roughness: 0.5 }));
  band.position.set(0, 0.75, 0.451);
  group.add(drum, ring1, ring2, band);
  return group;
}

export function createWaypoint() {
  const group = new THREE.Group();
  const beamMat = new THREE.MeshBasicMaterial({
    color: 0xffc247, transparent: true, opacity: 0.16, depthWrite: false,
    blending: THREE.AdditiveBlending, side: THREE.DoubleSide, fog: false,
  });
  const beam = new THREE.Mesh(new THREE.CylinderGeometry(3.4, 3.4, 46, 24, 1, true), beamMat);
  beam.position.y = 23;
  const ringMat = new THREE.MeshBasicMaterial({ color: 0xffd36a, transparent: true, opacity: 0.9, fog: false });
  const ring = new THREE.Mesh(new THREE.TorusGeometry(4.2, 0.16, 6, 40), ringMat);
  ring.rotation.x = -Math.PI / 2;
  ring.position.y = 0.32;
  const inner = new THREE.Mesh(
    new THREE.CircleGeometry(4.1, 32),
    new THREE.MeshBasicMaterial({ color: 0xffb52e, transparent: true, opacity: 0.1, depthWrite: false, fog: false }),
  );
  inner.rotation.x = -Math.PI / 2;
  inner.position.y = 0.2;
  group.add(beam, ring, inner);
  group.userData.ring = ring;
  group.userData.beam = beam;
  group.userData.inner = inner;
  return group;
}
