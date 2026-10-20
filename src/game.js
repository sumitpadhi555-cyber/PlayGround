import * as THREE from 'three';
import { createWorld, CITY } from './world.js';
import { createCar, createCharacter, animateCharacter, createBarrel, createWaypoint } from './models.js';
import { Input } from './input.js';
import { Effects } from './effects.js';
import {
  clamp, damp, angleLerp, dist, rand, randInt, choice, formatCash, formatTime,
  resolveCircleRect, pointInRect, rectDistance, smoothstep, mulberry32,
} from './utils.js';

const CAR_COLORS = [0xb8342a, 0x27384d, 0xd8d9d5, 0x2a6f9e, 0xd99a2b, 0x2e7d54, 0x64357c, 0x70767e, 0x158a8a, 0xbf5a1e, 0x1c1e22, 0xe4e0d0];
const SHIRTS = [0x2c5d8a, 0x8a3d3d, 0x3d7a52, 0x7a6a3d, 0x5c3f7a, 0x2f3338, 0xb8b3a6, 0x356e6e, 0x9c5a2e, 0x585f68];
const PANTS = [0x22252b, 0x2d3038, 0x3a3d42, 0x1b1d22, 0x40444a, 0x2b303a];
const TOTAL = { onFoot: 6.8 };

function rayAABB(o, d, box, maxT = 140) {
  let tmin = 0;
  let tmax = maxT;
  const min = [box.minX, 0, box.minZ];
  const max = [box.maxX, box.tall, box.maxZ];
  const oo = [o.x, o.y, o.z];
  const dd = [d.x, d.y, d.z];
  for (let i = 0; i < 3; i++) {
    if (Math.abs(dd[i]) < 1e-7) {
      if (oo[i] < min[i] || oo[i] > max[i]) return Infinity;
    } else {
      let t1 = (min[i] - oo[i]) / dd[i];
      let t2 = (max[i] - oo[i]) / dd[i];
      if (t1 > t2) { const tmp = t1; t1 = t2; t2 = tmp; }
      tmin = Math.max(tmin, t1);
      tmax = Math.min(tmax, t2);
      if (tmin > tmax) return Infinity;
    }
  }
  return tmin > 0 ? tmin : tmax > 0 ? tmax : Infinity;
}

function raySphere(o, d, cx, cy, cz, radius, maxT = 140) {
  const ox = o.x - cx; const oy = o.y - cy; const oz = o.z - cz;
  const b = ox * d.x + oy * d.y + oz * d.z;
  const c = ox * ox + oy * oy + oz * oz - radius * radius;
  const h = b * b - c;
  if (h < 0) return Infinity;
  const t = -b - Math.sqrt(h);
  return t > 0 && t < maxT ? t : Infinity;
}

export class Game {
  constructor(container, audio) {
    this.container = container;
    this.audio = audio;
    this.mobile = matchMedia('(pointer: coarse)').matches || innerWidth < 820;
    this.clock = 0;
    this.fireCd = 0;
    this.cameraShake = 0;
    this.collideCd = 0;
    this.started = false;
    this.playing = false;
    this.wasted = false;
    this.wasteTimer = 0;
    this.camYaw = Math.PI + 0.1;
    this.camPitch = 0.22;
    this.camManual = 0;
    this.cameraBlend = 0;
    this.cameraBlendFrom = new THREE.Vector3();
    this.cameraBlendLook = new THREE.Vector3();
    this.attractT = 0;

    this.player = {
      pos: new THREE.Vector3(9.5, 0, 24),
      y: 0, vy: 0, grounded: true, yaw: Math.PI + 0.1, speed: 0,
      health: 100, cash: 250, inCar: null, sinceDamage: 99, panic: 0,
    };
    this.wanted = 0;
    this.lastCrime = -99;
    this.evadeTimer = 0;
    this.spawnCopTimer = 0;
    this.mission = { active: false, pos: new THREE.Vector3(), timeLeft: 0, reward: 400, cooldown: 0 };
    this.mapTimer = 0;
    this.vehicles = [];
    this.traffic = [];
    this.police = [];
    this.peds = [];
    this.barrels = [];
    this.healthPacks = [];
    this.temp = { x: 0, z: 0 };
    this._tmpV = new THREE.Vector3();
    this._tmpV2 = new THREE.Vector3();
  }

  init() {
    const renderer = new THREE.WebGLRenderer({ antialias: !this.mobile, powerPreference: 'high-performance' });
    renderer.setSize(innerWidth, innerHeight);
    renderer.setPixelRatio(Math.min(devicePixelRatio || 1, this.mobile ? 1.5 : 2));
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.08;
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer = renderer;
    this.container.appendChild(renderer.domElement);

    const scene = new THREE.Scene();
    this.scene = scene;
    this.camera = new THREE.PerspectiveCamera(62, innerWidth / innerHeight, 0.1, 2600);

    this.world = createWorld(scene, renderer, { mobile: this.mobile });
    this.effects = new Effects(scene);

    this.playerMesh = createCharacter({ shirt: 0x24455e, pants: 0x2a2e35, skin: 0, hat: true });
    this.playerMesh.position.copy(this.player.pos);
    this.playerMesh.rotation.y = this.player.yaw;
    scene.add(this.playerMesh);

    this.playerCarLight = new THREE.SpotLight(0xffe9c0, 0, 70, 0.55, 0.45, 1.4);
    this.playerCarLight.castShadow = false;
    this.playerCarLightTarget = new THREE.Object3D();
    scene.add(this.playerCarLight, this.playerCarLightTarget);
    this.playerCarLight.target = this.playerCarLightTarget;

    this.buildVehicles();
    this.buildTraffic();
    this.buildPeds();
    this.buildBarrels();
    this.buildHealthPacks();

    this.waypoint = createWaypoint();
    this.waypoint.visible = false;
    scene.add(this.waypoint);

    this.input = new Input(renderer.domElement);
    this.cacheHud();
    this.bindUi();

    this.world.update(0, 0, this.player.pos);

    window.addEventListener('resize', () => this.onResize());
    document.addEventListener('visibilitychange', () => { this.lastFrame = performance.now(); });

    this.lastFrame = performance.now();
    requestAnimationFrame((t) => this.frame(t));
    const boot = document.getElementById('boot');
    setTimeout(() => boot?.classList.add('done'), 350);
  }

  cacheHud() {
    const $ = (id) => document.getElementById(id);
    this.hud = {
      root: $('hud'),
      minimap: $('minimap'),
      wanted: $('wanted'),
      stars: [...document.querySelectorAll('#wanted .star')],
      health: $('healthFill'),
      cash: $('cash'),
      missionPanel: $('missionPanel'),
      missionText: $('missionText'),
      missionDist: $('missionDist'),
      missionTime: $('missionTime'),
      speedo: $('speedo'),
      speedVal: $('speedVal'),
      crosshair: $('crosshair'),
      toast: $('toast'),
      action: $('btnAction'),
      damage: $('damage'),
      start: $('start'),
      wasted: $('wasted'),
      sound: $('btnSound'),
    };
    this.mapCtx = this.hud.minimap.getContext('2d');
    this.hudMissionCooldown = 0;
  }

  bindUi() {
    document.getElementById('playBtn').addEventListener('click', () => this.begin());
    this.hud.sound?.addEventListener('click', () => this.toggleSound());
    window.addEventListener('keydown', (e) => {
      if (e.code === 'KeyM') this.toggleSound();
      if (e.code === 'KeyE' && this.started) this.interactPressed = true;
    });
  }

  toggleSound() {
    this.audio.init();
    this.audio.setMuted(!this.audio.muted);
    this.hud.sound?.classList.toggle('muted', this.audio.muted);
    if (this.audio.muted) this.audio.musicOn = false; else this.audio.musicOn = true;
  }

  begin() {
    if (this.started) return;
    this.started = true;
    this.playing = true;
    this.audio.init();
    this.audio.musicOn = true;
    this.audio.horn();
    this.hud.start.classList.add('gone');
    this.hud.root.classList.remove('hidden');
    this.cameraBlend = 1;
    this.cameraBlendFrom.copy(this.camera.position);
    this.cameraBlendLook.set(0, 12, 0);
    this.camYaw = this.player.yaw;
    this.camPitch = 0.22;
    this.newMission(true);
    this.toast('Reach the gold marker — the clock is running', 'gold', 3400);
    if (this.mobile && document.documentElement.requestFullscreen) {
      document.documentElement.requestFullscreen().catch(() => {});
    }
    this.lastFrame = performance.now();
  }

  onResize() {
    this.camera.aspect = innerWidth / innerHeight;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(innerWidth, innerHeight);
    this.renderer.setPixelRatio(Math.min(devicePixelRatio || 1, this.mobile ? 1.5 : 2));
  }

  // ---------------------------------------------------------------- world setup
  makeVehicle(type, color, x, z, heading, police = false) {
    const group = createCar({ type, color, police });
    group.position.set(x, 0, z);
    group.rotation.y = heading;
    this.scene.add(group);
    const specs = type === 'sports'
      ? { maxSpeed: 42, accel: 21 }
      : type === 'van'
        ? { maxSpeed: 27, accel: 10 }
        : { maxSpeed: 34, accel: 15 };
    return {
      group, pos: new THREE.Vector3(x, 0, z), heading, speed: 0,
      type, color, police, health: police ? 55 : 130, isPlayer: false,
      maxSpeed: specs.maxSpeed, accel: specs.accel,
    };
  }

  buildVehicles() {
    const hero = this.makeVehicle('sports', 0xe8e6df, 5.6, 17, Math.PI);
    this.vehicles.push(hero);
    this.vehicles.push(this.makeVehicle('sedan', 0x2a6f9e, 5.8, -16, Math.PI));
    this.vehicles.push(this.makeVehicle('taxi', 0xe6bb2f, -5.8, -42, 0));

    const spots = [...this.world.parkingSpots];
    for (let i = spots.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [spots[i], spots[j]] = [spots[j], spots[i]];
    }
    let attempts = 0;
    while (this.vehicles.length < 17 && attempts < spots.length) {
      const s = spots[attempts++];
      if (dist(s.x, s.z, 5.6, 17) < 12) continue;
      const type = Math.random() < 0.14 ? 'van' : Math.random() < 0.24 ? 'sports' : Math.random() < 0.18 ? 'taxi' : 'sedan';
      const color = type === 'taxi' ? 0xe6bb2f : choice(CAR_COLORS);
      this.vehicles.push(this.makeVehicle(type, color, s.x, s.z, s.heading));
    }
  }

  lanePoint(ai, aj, bi, bj, t) {
    const roads = CITY.roads;
    const ax = roads[ai]; const az = roads[aj];
    const bx = roads[bi]; const bz = roads[bj];
    const dx = bx - ax; const dz = bz - az;
    const len = Math.hypot(dx, dz);
    const rx = (-dz / len) * 3.5; const rz = (dx / len) * 3.5;
    return {
      x: ax + dx * t + rx,
      z: az + dz * t + rz,
      heading: Math.atan2(dx, dz),
      len,
    };
  }

  buildTraffic() {
    const roads = CITY.roads;
    for (let n = 0; n < 12; n++) {
      let ai, aj, bi, bj;
      do {
        ai = randInt(0, 7); aj = randInt(0, 8);
        if (Math.random() < 0.5) { bi = ai + 1; bj = aj; } else { bi = ai; bj = aj + 1; }
      } while (bi > 8 || bj > 8);
      const type = Math.random() < 0.16 ? 'van' : Math.random() < 0.2 ? 'taxi' : 'sedan';
      const color = type === 'taxi' ? 0xe6bb2f : choice(CAR_COLORS);
      const p = this.lanePoint(ai, aj, bi, bj, Math.random());
      const car = this.makeVehicle(type, color, p.x, p.z, p.heading);
      car.a = { i: ai, j: aj };
      car.b = { i: bi, j: bj };
      car.t = Math.random();
      car.baseSpeed = rand(8.5, 13) * (type === 'van' ? 0.85 : 1);
      car.speed = car.baseSpeed;
      car.commute = true;
      this.traffic.push(car);
    }
    const seed = (ai, aj, bi, bj, t, type, color) => {
      const p = this.lanePoint(ai, aj, bi, bj, t);
      const car = this.makeVehicle(type, color, p.x, p.z, p.heading);
      car.a = { i: ai, j: aj };
      car.b = { i: bi, j: bj };
      car.t = t;
      car.len = p.len;
      car.baseSpeed = rand(9, 12);
      car.speed = car.baseSpeed;
      car.commute = true;
      this.traffic.push(car);
    };
    seed(4, 4, 4, 3, 0.38, 'sedan', 0x9e3230);
    seed(4, 2, 4, 3, 0.72, 'taxi', 0xe6bb2f);
    seed(3, 4, 4, 4, 0.6, 'sports', 0x1d3d5c);
    seed(5, 4, 4, 4, 0.3, 'sedan', 0xcfd2d4);
  }

  buildPeds() {
    const roads = CITY.roads;
    for (let i = 0; i < 18; i++) {
      const ch = createCharacter({
        shirt: choice(SHIRTS), pants: choice(PANTS), skin: randInt(0, 3), hat: Math.random() < 0.18,
      });
      const road = choice(roads);
      const axis = Math.random() < 0.5;
      const x = axis ? road + choice([-1, 1]) * rand(8.8, 10.2) : rand(-220, 220);
      const z = axis ? rand(-220, 220) : road + choice([-1, 1]) * rand(8.8, 10.2);
      ch.position.set(x, 0, z);
      this.scene.add(ch);
      this.peds.push({
        mesh: ch, x, z, targetX: x, targetZ: z, speed: rand(1.1, 1.8),
        dir: rand(0, Math.PI * 2), panic: 0, idle: rand(0, 2),
      });
      this.pickPedTarget(this.peds[this.peds.length - 1]);
    }
    for (const [x, z] of [[9.9, 2], [-9.6, -24], [10.2, -46], [-10.2, 36], [8.9, -78]]) {
      const ch = createCharacter({ shirt: choice(SHIRTS), pants: choice(PANTS), skin: randInt(0, 3), hat: Math.random() < 0.2 });
      ch.position.set(x, 0, z);
      this.scene.add(ch);
      const ped = { mesh: ch, x, z, targetX: x, targetZ: z, speed: rand(1.1, 1.7), dir: rand(0, Math.PI * 2), panic: 0, idle: rand(0, 0.8) };
      this.peds.push(ped);
      this.pickPedTarget(ped);
    }
  }

  pickPedTarget(ped) {
    const roads = CITY.roads;
    const axis = Math.random() < 0.5;
    const road = choice(roads);
    for (let tries = 0; tries < 6; tries++) {
      const tx = axis ? road + choice([-1, 1]) * rand(8.8, 10.2) : clamp(ped.x + rand(-45, 45), -235, 235);
      const tz = axis ? clamp(ped.z + rand(-45, 45), -235, 235) : road + choice([-1, 1]) * rand(8.8, 10.2);
      if (dist(tx, tz, ped.x, ped.z) > 8) { ped.targetX = tx; ped.targetZ = tz; return; }
    }
    ped.targetX = clamp(ped.x + rand(-30, 30), -235, 235);
    ped.targetZ = clamp(ped.z + rand(-30, 30), -235, 235);
  }

  buildBarrels() {
    const places = [];
    const roads = CITY.roads;
    for (let i = 0; i < 20; i++) {
      const road = choice(roads);
      const along = rand(-200, 200);
      const axis = Math.random() < 0.5;
      const off = choice([-1, 1]) * rand(8.6, 10.1);
      places.push(axis ? { x: road + off, z: along } : { x: along, z: road + off });
    }
    places.push({ x: 22, z: 35 }, { x: 38, z: 24 });
    for (const p of places) {
      if (dist(p.x, p.z, this.player.pos.x, this.player.pos.z) < 9) continue;
      const g = createBarrel();
      g.position.set(p.x, 0, p.z);
      g.rotation.y = rand(0, Math.PI * 2);
      this.scene.add(g);
      this.barrels.push({ group: g, pos: new THREE.Vector3(p.x, 0, p.z), alive: true, respawn: 0 });
    }
  }

  buildHealthPacks() {
    const spots = [
      { x: 10.4, z: -8 }, { x: -9.4, z: -30 }, { x: 30, z: -9.4 },
      { x: -30, z: 9.4 }, { x: 129.4, z: 30 },
    ];
    for (const s of spots) {
      const group = new THREE.Group();
      const box = new THREE.Mesh(
        new THREE.BoxGeometry(0.9, 0.9, 0.9),
        new THREE.MeshStandardMaterial({ color: 0xe8eef0, roughness: 0.4, metalness: 0.2 }),
      );
      const crossMat = new THREE.MeshStandardMaterial({ color: 0x1d7f45, emissive: 0x35ff7a, emissiveIntensity: 1.1 });
      const c1 = new THREE.Mesh(new THREE.BoxGeometry(0.52, 0.16, 0.02), crossMat);
      const c2 = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.52, 0.02), crossMat);
      c1.position.z = c2.position.z = 0.46;
      const c3 = c1.clone(); c3.position.z = -0.46;
      const c4 = c2.clone(); c4.position.z = -0.46;
      group.add(box, c1, c2, c3, c4);
      group.position.set(s.x, 0.55, s.z);
      this.scene.add(group);
      this.healthPacks.push({ group, pos: new THREE.Vector3(s.x, 0, s.z), active: true, respawn: 0 });
    }
  }

  // ---------------------------------------------------------------- main loop
  frame(now) {
    requestAnimationFrame((t) => this.frame(t));
    const dt = Math.min(0.05, Math.max(0, (now - this.lastFrame) / 1000));
    this.lastFrame = now;
    this.clock += dt;
    this.update(dt);
    this.renderer.render(this.scene, this.camera);
  }

  update(dt) {
    const p = this.player;
    this.world.update(dt, this.clock, p.inCar ? p.inCar.pos : p.pos);
    this.effects.update(dt);
    this.updateTraffic(dt);
    this.updatePeds(dt);
    this.updateBarrels(dt);
    this.updateHealthPacks(dt);

    if (!this.started) {
      this.updateAttract(dt);
    } else if (this.wasted) {
      this.wasteTimer -= dt;
      this.updateCamera(dt);
      this.updateMissionVisuals(dt);
      if (this.wasteTimer <= 0) this.respawn();
    } else if (this.playing) {
      this.updatePlaying(dt);
    }

    this.fireCd = Math.max(0, this.fireCd - dt);
    this.collideCd = Math.max(0, this.collideCd - dt);
    this.cameraShake = Math.max(0, this.cameraShake - dt * 2.6);
    this.updateAudio(dt);
    if (this.started) this.updateHud(dt);
  }

  updateAttract(dt) {
    this.attractT += dt;
    const a = this.attractT * 0.055;
    const r = 188;
    this.camera.position.set(Math.cos(a) * r, 58 + Math.sin(a * 1.6) * 12, Math.sin(a) * r);
    this.camera.lookAt(0, 14 + Math.sin(a * 0.7) * 4, 0);
    this.updateMissionVisuals(dt);
  }

  updatePlaying(dt) {
    const p = this.player;
    const cam = this.input.consumeCamera();
    this.camYaw -= cam.dx * 0.0052;
    this.camPitch = clamp(this.camPitch - cam.dy * 0.0038, -0.06, 0.92);
    if (Math.abs(cam.dx) + Math.abs(cam.dy) > 0.5) this.camManual = 2.4;
    this.camManual = Math.max(0, this.camManual - dt);

    this.spawnCopTimer -= dt;
    if (this.wanted > 0) {
      this.updateWanted(dt);
      if (this.spawnCopTimer <= 0 && this.police.length < this.wanted) {
        this.spawnCop();
        this.spawnCopTimer = Math.max(1.6, 4.2 - this.wanted * 0.45);
      }
    }
    this.updatePolice(dt);

    const action = this.input.consumeAction() || this.interactPressed;
    this.interactPressed = false;
    if (action) this.toggleVehicle();

    if (p.inCar) {
      this.updateDriving(dt);
      if (this.input.consumeFire() || this.input.fireHeld) {
        if (this.fireCd <= 0) { this.fireCd = 0.5; this.audio.horn(); }
      }
      this.input.consumeJump();
    } else {
      this.updateOnFoot(dt);
      if (this.input.consumeJump()) {
        if (p.grounded) { p.vy = 7.7; p.grounded = false; this.audio.thud(); }
      }
      if (this.input.consumeFire() || this.input.fireHeld) this.tryFire();
    }

    this.updateMission(dt);
    this.updateCamera(dt);
    this.updateMissionVisuals(dt);

    p.sinceDamage += dt;
    if (p.sinceDamage > 8 && p.health < 100 && !p.inCar) {
      p.health = Math.min(100, p.health + 5.5 * dt);
    }
  }

  updateOnFoot(dt) {
    const p = this.player;
    const mv = this.input.moveVector();
    const fwdX = Math.sin(this.camYaw); const fwdZ = Math.cos(this.camYaw);
    const rightX = Math.cos(this.camYaw); const rightZ = -Math.sin(this.camYaw);
    let dx = fwdX * mv.y + rightX * mv.x;
    let dz = fwdZ * mv.y + rightZ * mv.x;
    const len = Math.hypot(dx, dz);
    const sprint = this.input.isSprinting();
    const maxSpeed = sprint ? 8.1 : 4.6;
    if (len > 0.02) {
      dx /= len; dz /= len;
      p.yaw = angleLerp(p.yaw, Math.atan2(dx, dz), 1 - Math.exp(-13 * dt));
    }
    const target = len > 0.02 ? maxSpeed * Math.min(1, len) : 0;
    p.speed = damp(p.speed, target, 10, dt);

    if (p.speed > 0.05) {
      p.pos.x += dx * p.speed * dt;
      p.pos.z += dz * p.speed * dt;
    }

    // gravity / jump
    if (!p.grounded) {
      p.y += p.vy * dt;
      p.vy -= 23 * dt;
      if (p.y <= 0) { p.y = 0; p.vy = 0; p.grounded = true; }
    }

    // building collisions
    const pos = this.temp;
    pos.x = p.pos.x; pos.z = p.pos.z;
    for (const c of this.world.colliders) {
      if (Math.abs(pos.x - (c.minX + c.maxX) / 2) > 20 || Math.abs(pos.z - (c.minZ + c.maxZ) / 2) > 20) continue;
      if (resolveCircleRect(pos, 0.5, c)) {
        p.pos.x = pos.x; p.pos.z = pos.z;
      }
    }

    // vehicle collisions
    const allCars = [...this.vehicles, ...this.traffic, ...this.police];
    for (const car of allCars) {
      const dx2 = p.pos.x - car.pos.x;
      const dz2 = p.pos.z - car.pos.z;
      const d = Math.hypot(dx2, dz2);
      const min = car.type === 'van' ? 2.1 : 1.85;
      if (d < min && d > 0.0001) {
        p.pos.x = car.pos.x + (dx2 / d) * min;
        p.pos.z = car.pos.z + (dz2 / d) * min;
        if (car.commute && car.speed > 3 && this.collideCd <= 0) {
          this.collideCd = 0.8;
          p.health -= 6;
          this.hurt(0.2);
          p.pos.x += (dx2 / d) * 0.4;
          p.pos.z += (dz2 / d) * 0.4;
        }
      }
    }

    // world bounds
    p.pos.x = clamp(p.pos.x, -332, 332);
    p.pos.z = clamp(p.pos.z, -332, 332);

    const bob = this.playerMesh.userData.bob || 0;
    this.playerMesh.visible = true;
    this.playerMesh.position.set(p.pos.x, p.y + bob, p.pos.z);
    this.playerMesh.rotation.y = p.yaw;
    this.playerMesh.userData.gun.visible = true;
    animateCharacter(this.playerMesh, dt, p.speed, p.grounded);

    // interact hint
    const near = this.nearestVehicle(5.2);
    this.hud.action.textContent = near ? 'ENTER' : 'ENTER';
    if (near) this.hud.action.classList.add('ready');
    else this.hud.action.classList.remove('ready');
  }

  nearestVehicle(maxDist) {
    let best = null; let bestD = maxDist;
    for (const car of [...this.vehicles, ...this.traffic]) {
      const d = dist(car.pos.x, car.pos.z, this.player.pos.x, this.player.pos.z);
      if (d < bestD) { bestD = d; best = car; }
    }
    return best;
  }

  toggleVehicle() {
    const p = this.player;
    if (p.inCar) {
      const car = p.inCar;
      car.isPlayer = false;
      car.speed = 0;
      const side = new THREE.Vector3(Math.cos(car.heading), 0, -Math.sin(car.heading)).multiplyScalar(2.4);
      p.pos.set(car.pos.x + side.x, 0, car.pos.z + side.z);
      p.y = 0; p.vy = 0; p.grounded = true;
      p.inCar = null;
      p.speed = 0;
      this.playerMesh.visible = true;
      this.playerMesh.userData.gun.visible = true;
      this.hud.speedo.classList.remove('show');
      this.toast('On foot');
      this.audio.horn();
      return;
    }
    const car = this.nearestVehicle(5.2);
    if (!car) { this.toast('No vehicle nearby', 'red'); return; }
    p.inCar = car;
    car.isPlayer = true;
    car.speed = 0;
    if (car.commute) {
      car.commute = false;
      const idx = this.traffic.indexOf(car);
      if (idx >= 0) this.traffic.splice(idx, 1);
      this.crime(1);
      this.toast('Carjacked — witnesses called the cops', 'red', 2600);
    } else {
      this.toast('Vehicle acquired');
    }
    p.pos.copy(car.pos);
    this.playerMesh.visible = false;
    this.playerMesh.userData.gun.visible = false;
    this.hud.speedo.classList.add('show');
    this.camYaw = car.heading;
    this.camPitch = 0.24;
    this.updateCamera(0.001);
    this.audio.horn();
  }

  updateDriving(dt) {
    const p = this.player;
    const car = p.inCar;
    const mv = this.input.moveVector();
    const throttle = mv.y;
    const steer = mv.x;
    const braking = throttle < -0.1 && car.speed > 1;

    if (throttle > 0.05) {
      car.speed += car.accel * throttle * dt;
    } else if (throttle < -0.05) {
      if (car.speed > 0.4) car.speed -= 30 * Math.abs(throttle) * dt;
      else car.speed -= car.accel * 0.5 * Math.abs(throttle) * dt;
    } else {
      car.speed -= Math.sign(car.speed) * Math.min(Math.abs(car.speed), (2.1 + Math.abs(car.speed) * 0.055) * dt);
    }
    car.speed = clamp(car.speed, -12, car.maxSpeed);

    const speedFactor = clamp(Math.abs(car.speed) / 14, 0, 1);
    car.heading += steer * 1.95 * speedFactor * Math.sign(car.speed || 1) * dt;
    const fx = Math.sin(car.heading);
    const fz = Math.cos(car.heading);
    const nx = car.pos.x + fx * car.speed * dt;
    const nz = car.pos.z + fz * car.speed * dt;

    // building collisions
    const pos = this.temp;
    pos.x = nx; pos.z = nz;
    let hit = false;
    for (const c of this.world.colliders) {
      if (Math.abs(pos.x - (c.minX + c.maxX) / 2) > 24 || Math.abs(pos.z - (c.minZ + c.maxZ) / 2) > 24) continue;
      if (resolveCircleRect(pos, 1.9, c)) hit = true;
    }
    if (hit) {
      car.speed *= -0.12;
      if (Math.abs(car.speed) > 2 && this.collideCd <= 0) {
        this.collideCd = 0.35;
        this.audio.thud();
        this.cameraShake = Math.min(1, this.cameraShake + 0.45);
        this.effects.impact(pos.x, 0.8, pos.z);
        this.hurt(0.4);
      }
    }
    car.pos.x = clamp(pos.x, -330, 330);
    car.pos.z = clamp(pos.z, -330, 330);

    // traffic / parked collisions
    for (const other of [...this.vehicles, ...this.traffic]) {
      if (other === car) continue;
      const dx = car.pos.x - other.pos.x;
      const dz = car.pos.z - other.pos.z;
      const d = Math.hypot(dx, dz);
      if (d < 2.9 && d > 0.001) {
        car.pos.x = other.pos.x + (dx / d) * 2.9;
        car.pos.z = other.pos.z + (dz / d) * 2.9;
        if (this.collideCd <= 0 && Math.abs(car.speed) > 3) {
          this.collideCd = 0.35;
          const impact = Math.abs(car.speed);
          car.speed *= -0.18;
          other.speed *= 0.4;
          this.cameraShake = Math.min(1, this.cameraShake + Math.min(0.8, impact / 45));
          this.effects.impact((car.pos.x + other.pos.x) / 2, 0.75, (car.pos.z + other.pos.z) / 2);
          this.audio.thud();
          this.hurt(Math.min(8, impact * 0.35));
        }
      }
    }

    // police rams
    for (const cop of this.police) {
      const d = dist(cop.pos.x, cop.pos.z, car.pos.x, car.pos.z);
      if (d < 3.1 && this.collideCd <= 0 && cop.speed > 3) {
        this.collideCd = 0.4;
        car.speed *= 0.45;
        cop.speed *= 0.4;
        this.cameraShake = Math.min(1, this.cameraShake + 0.6);
        this.effects.impact((car.pos.x + cop.pos.x) / 2, 0.8, (car.pos.z + cop.pos.z) / 2);
        this.audio.thud();
        this.hurt(7);
      }
    }

    p.pos.copy(car.pos);
    car.group.position.set(car.pos.x, 0, car.pos.z);
    car.group.rotation.set(
      -clamp(throttle, 0, 1) * 0.025 + (braking ? 0.035 : 0),
      car.heading,
      -steer * 0.05 * speedFactor,
    );

    if (this.camManual <= 0) this.camYaw = damp(this.camYaw, car.heading, 2.4, dt);

    // headlights
    const night = this.world.night || 0;
    this.playerCarLight.intensity = night * 26;
    this.playerCarLight.position.set(car.pos.x + fx * 2, 0.9, car.pos.z + fz * 2);
    this.playerCarLightTarget.position.set(car.pos.x + fx * 22, 0.2, car.pos.z + fz * 22);
  }

  hurt(amount) {
    const p = this.player;
    p.sinceDamage = 0;
    if (p.inCar) {
      p.inCar.health -= amount;
      this.flashDamage();
      if (p.inCar.health <= 0) this.destroyPlayerCar();
    } else {
      p.health -= amount;
      this.flashDamage();
      this.cameraShake = Math.min(1.2, this.cameraShake + 0.35);
      if (p.health <= 0) this.die();
    }
  }

  flashDamage() {
    const el = this.hud.damage;
    if (!el) return;
    el.classList.add('hit');
    clearTimeout(this.damageTimer);
    this.damageTimer = setTimeout(() => el.classList.remove('hit'), 110);
  }

  destroyPlayerCar() {
    const p = this.player;
    const car = p.inCar;
    if (!car) return;
    this.effects.explosion(car.pos.x, 1, car.pos.z, 1.25);
    this.audio.explosion();
    this.cameraShake = 1.4;
    car.group.visible = false;
    p.inCar = null;
    p.pos.set(car.pos.x + 2.5, 0, car.pos.z + 2.5);
    p.y = 0; p.vy = 1; p.grounded = false;
    this.playerMesh.visible = true;
    this.playerMesh.userData.gun.visible = true;
    this.hud.speedo.classList.remove('show');
    this.hurt(30);
    this.toast('Vehicle destroyed', 'red');
  }

  die() {
    if (this.wasted) return;
    this.wasted = true;
    this.playing = false;
    this.wasteTimer = 3.4;
    this.hud.wasted.classList.remove('hidden');
    this.player.inCar = null;
    this.playerMesh.visible = false;
    this.hud.speedo.classList.remove('show');
    this.wanted = 0;
    for (const cop of this.police) this.scene.remove(cop.group);
    this.police = [];
    this.audio.updateSiren(false, this.clock);
  }

  respawn() {
    const p = this.player;
    this.wasted = false;
    this.playing = true;
    this.hud.wasted.classList.add('hidden');
    p.health = 100;
    p.cash = Math.max(0, p.cash - 100);
    p.inCar = null;
    p.pos.set(9.5, 0, 24);
    p.y = 0; p.vy = 0; p.grounded = true; p.speed = 0;
    this.playerMesh.visible = true;
    this.playerMesh.userData.gun.visible = true;
    this.wanted = 0;
    this.evadeTimer = 0;
    this.camYaw = Math.PI + 0.1;
    this.camPitch = 0.22;
    this.camera.position.set(30, 10, 30);
    this.newMission(true);
    this.toast('Patched up. One hundred dollars lighter.', '', 2600);
  }

  // ---------------------------------------------------------------- shooting
  tryFire() {
    if (!this.playing || this.player.inCar || this.fireCd > 0) return;
    this.fireCd = 0.155;
    this.audio.gunshot();
    this.crime(1);
    this.playerMesh.userData.rightArm.rotation.x = -1.2;
    this.cameraShake = Math.min(1, this.cameraShake + 0.18);

    const dir = new THREE.Vector3();
    this.camera.getWorldDirection(dir);
    const origin = new THREE.Vector3();
    this.camera.getWorldPosition(origin);
    const playerFocus = this.currentPos().clone();
    playerFocus.y += 1.35;

    // Aim assist: snap toward the nearest target close to the crosshair ray.
    let best = null; let bestScore = Infinity;
    const candidates = [];
    for (const cop of this.police) candidates.push({ kind: 'cop', obj: cop, x: cop.pos.x, y: 1.05, z: cop.pos.z });
    for (const b of this.barrels) if (b.alive) candidates.push({ kind: 'barrel', obj: b, x: b.pos.x, y: 0.6, z: b.pos.z });
    const tmp = new THREE.Vector3();
    for (const c of candidates) {
      tmp.set(c.x, c.y, c.z);
      const to = tmp.clone().sub(origin);
      const t = to.dot(dir);
      if (t <= 0 || t > 70) continue;
      const closest = origin.clone().addScaledVector(dir, t);
      const miss = closest.distanceTo(tmp);
      const ang = Math.abs(Math.atan2(miss, t));
      if (ang < 0.26 && miss < 4.5) {
        const score = ang * 10 + t * 0.01;
        if (score < bestScore) { bestScore = score; best = c; }
      }
    }
    if (best) {
      const aim = new THREE.Vector3(best.x, best.y, best.z).sub(origin).normalize();
      dir.lerp(aim, this.mobile ? 0.92 : 0.62).normalize();
    }

    // nearest wall along the shot
    let wallT = 140;
    for (const c of this.world.colliders) {
      const t = rayAABB(origin, dir, c);
      if (t < wallT) wallT = t;
    }
    if (dir.y < -0.001) {
      const t = (0.03 - origin.y) / dir.y;
      if (t > 0 && t < wallT) wallT = t;
    }
    const end = origin.clone().addScaledVector(dir, Math.min(wallT, 120));

    let hitKind = null; let hitObj = null; let hitT = wallT;
    for (const c of candidates) {
      const t = raySphere(origin, dir, c.x, c.y, c.z, c.kind === 'cop' ? 2.1 : 1.15, Math.min(wallT, 120));
      if (t < hitT) { hitT = t; hitKind = c.kind; hitObj = c.obj; }
    }
    if (hitKind === 'cop') {
      hitObj.health -= 16;
      this.effects.impact(hitObj.pos.x, 1.1, hitObj.pos.z, 0xffc27a);
      this.audio.hit();
      this.crime(1);
      if (hitObj.health <= 0) this.destroyCop(hitObj);
      end.copy(origin).addScaledVector(dir, hitT);
    } else if (hitKind === 'barrel') {
      this.explodeBarrel(hitObj);
      end.copy(origin).addScaledVector(dir, hitT);
    } else {
      this.effects.impact(end.x, Math.max(0.3, end.y), end.z, 0xffd9a0);
    }

    const muzzle = new THREE.Vector3();
    this.playerMesh.userData.gun.getWorldPosition(muzzle);
    muzzle.y += 0.08;
    this.effects.muzzle(muzzle.x, muzzle.y, muzzle.z, dir.x, dir.y, dir.z);
    this.effects.tracer(muzzle.x, muzzle.y, muzzle.z, end.x, end.y, end.z);
    this.player.panic = 0;

    // nearby pedestrians panic
    for (const ped of this.peds) {
      if (dist(ped.x, ped.z, this.player.pos.x, this.player.pos.z) < 34) {
        ped.panic = 5;
        const a = Math.atan2(ped.x - this.player.pos.x, ped.z - this.player.pos.z);
        ped.targetX = clamp(ped.x + Math.sin(a) * 30, -235, 235);
        ped.targetZ = clamp(ped.z + Math.cos(a) * 30, -235, 235);
      }
    }
  }

  // ---------------------------------------------------------------- traffic
  updateTraffic(dt) {
    const roads = CITY.roads;
    for (const car of this.traffic) {
      if (!car.commute) continue;
      const lane = this.lanePoint(car.a.i, car.a.j, car.b.i, car.b.j, car.t);
      car.len = lane.len;
      car.t += (car.speed * dt) / Math.max(2, lane.len);
      if (car.t >= 1) {
        const oldA = car.a;
        car.a = car.b;
        const options = [];
        const { i, j } = car.a;
        if (i + 1 <= 8) options.push({ i: i + 1, j });
        if (i - 1 >= 0) options.push({ i: i - 1, j });
        if (j + 1 <= 8) options.push({ i, j: j + 1 });
        if (j - 1 >= 0) options.push({ i, j: j - 1 });
        const filtered = options.filter((o) => !(o.i === oldA.i && o.j === oldA.j));
        const next = filtered.length ? choice(filtered) : options[0];
        car.a = car.b;
        car.b = { i: next.i, j: next.j };
        car.t = 0;
      }
      const p = this.lanePoint(car.a.i, car.a.j, car.b.i, car.b.j, car.t);
      car.pos.set(p.x, 0, p.z);
      car.heading = angleLerp(car.heading, p.heading, 1 - Math.exp(-6 * dt));

      // Slow for cars ahead and for the player.
      let targetSpeed = car.baseSpeed;
      for (const other of this.traffic) {
        if (other === car) continue;
        const dx = other.pos.x - car.pos.x;
        const dz = other.pos.z - car.pos.z;
        const d = Math.hypot(dx, dz);
        if (d < 10 && dx * Math.sin(car.heading) + dz * Math.cos(car.heading) > 0) {
          targetSpeed = Math.min(targetSpeed, d * 1.2);
        }
      }
      const targetPos = this.currentPos();
      const pd = dist(targetPos.x, targetPos.z, car.pos.x, car.pos.z);
      if (pd < 9) targetSpeed = Math.min(targetSpeed, pd * 1.1);
      car.speed = damp(car.speed, targetSpeed, 3, dt);

      car.group.position.set(car.pos.x, 0, car.pos.z);
      car.group.rotation.y = car.heading;
    }
  }

  // ---------------------------------------------------------------- pedestrians
  updatePeds(dt) {
    for (const ped of this.peds) {
      ped.idle = Math.max(0, ped.idle - dt);
      let tx = ped.targetX; let tz = ped.targetZ;
      if (ped.panic > 0) {
        ped.panic -= dt;
        tx = ped.targetX; tz = ped.targetZ;
      }
      const dx = tx - ped.x; const dz = tz - ped.z;
      const d = Math.hypot(dx, dz);
      let moving = 0;
      if (d < 2) {
        if (ped.idle <= 0) { this.pickPedTarget(ped); ped.idle = rand(0.4, 2.4); }
      } else if (ped.idle <= 0) {
        const speed = ped.panic > 0 ? 5.4 : ped.speed;
        const nx = dx / d; const nz = dz / d;
        ped.x += nx * speed * dt;
        ped.z += nz * speed * dt;
        ped.dir = Math.atan2(nx, nz);
        moving = speed;
      }
      const pos = this.temp;
      pos.x = ped.x; pos.z = ped.z;
      for (const c of this.world.colliders) {
        if (Math.abs(pos.x - (c.minX + c.maxX) / 2) > 14 || Math.abs(pos.z - (c.minZ + c.maxZ) / 2) > 14) continue;
        resolveCircleRect(pos, 0.38, c);
      }
      ped.x = clamp(pos.x, -245, 245);
      ped.z = clamp(pos.z, -245, 245);
      ped.mesh.position.set(ped.x, 0, ped.z);
      ped.mesh.rotation.y = angleLerp(ped.mesh.rotation.y, ped.dir, 1 - Math.exp(-8 * dt));
      animateCharacter(ped.mesh, dt, moving, true);
      ped.mesh.position.y = ped.mesh.userData.bob || 0;
    }
  }

  // ---------------------------------------------------------------- police
  crime(level = 1) {
    if (!this.started || this.wasted) return;
    if (this.wanted < level) this.wanted = level;
    this.lastCrime = this.clock;
    this.evadeTimer = 0;
    if (this.spawnCopTimer > 3) this.spawnCopTimer = 1.2;
  }

  updateWanted(dt) {
    if (this.clock - this.lastCrime < 8) { this.evadeTimer = 0; return; }
    let nearest = Infinity;
    for (const cop of this.police) nearest = Math.min(nearest, dist(cop.pos.x, cop.pos.z, this.currentPos().x, this.currentPos().z));
    if (nearest > 85) {
      this.evadeTimer += dt;
      if (this.evadeTimer > 8) {
        this.wanted = Math.max(0, this.wanted - 1);
        this.evadeTimer = 0;
        this.lastCrime = this.clock;
        if (this.wanted === 0) {
          for (const cop of this.police) this.scene.remove(cop.group);
          this.police = [];
          this.toast('You lost the cops', '', 2600);
        } else {
          this.toast('Heat is dropping', '', 1800);
        }
      }
    } else {
      this.evadeTimer = 0;
    }
  }

  spawnCop() {
    const roads = CITY.roads;
    const target = this.currentPos();
    for (let tries = 0; tries < 30; tries++) {
      const i = randInt(0, 8); const j = randInt(0, 8);
      const x = roads[i]; const z = roads[j];
      const d = dist(x, z, target.x, target.z);
      if (d < 60 || d > 220) continue;
      const heading = Math.atan2(target.x - x, target.z - z);
      const car = this.makeVehicle('sedan', 0xe8e8ea, x, z, heading, true);
      car.health = 55;
      car.maxSpeed = 31;
      car.accel = 18;
      car.fireTimer = rand(1.2, 2.4);
      car.commute = false;
      car.isPolice = true;
      this.police.push(car);
      return;
    }
  }

  updatePolice(dt) {
    const target = this.currentPos();
    const night = this.world.night || 0;
    for (const cop of [...this.police]) {
      const dx = target.x - cop.pos.x;
      const dz = target.z - cop.pos.z;
      const d = Math.hypot(dx, dz);
      const desired = Math.atan2(dx, dz);
      cop.heading = angleLerp(cop.heading, desired, 1 - Math.exp(-2.6 * dt));
      const wantSpeed = d > 16 ? cop.maxSpeed : d > 9 ? 10 : 0;
      cop.speed = damp(cop.speed, wantSpeed, 2.4, dt);
      const fx = Math.sin(cop.heading); const fz = Math.cos(cop.heading);
      const pos = this.temp;
      pos.x = cop.pos.x + fx * cop.speed * dt;
      pos.z = cop.pos.z + fz * cop.speed * dt;
      let blocked = false;
      for (const c of this.world.colliders) {
        if (Math.abs(pos.x - (c.minX + c.maxX) / 2) > 18 || Math.abs(pos.z - (c.minZ + c.maxZ) / 2) > 18) continue;
        if (resolveCircleRect(pos, 1.85, c)) blocked = true;
      }
      if (blocked) {
        cop.heading += 0.5 + rand(-0.2, 0.2);
        cop.speed *= 0.35;
      }
      cop.pos.x = clamp(pos.x, -330, 330);
      cop.pos.z = clamp(pos.z, -330, 330);
      cop.group.position.set(cop.pos.x, 0, cop.pos.z);
      cop.group.rotation.y = cop.heading;

      // flashing bar
      const red = cop.group.userData.redMat;
      const blue = cop.group.userData.blueMat;
      if (red && blue) {
        const blink = Math.sin(this.clock * 12 + cop.pos.x) > 0;
        red.emissiveIntensity = blink ? 4 : 0.35;
        blue.emissiveIntensity = blink ? 0.35 : 4;
      }

      // fire at the player
      cop.fireTimer -= dt;
      if (d < 36 && cop.fireTimer <= 0 && d > 3.5) {
        cop.fireTimer = rand(1.3, 2.2);
        const origin = new THREE.Vector3(cop.pos.x, 1.25, cop.pos.z);
        const aim = new THREE.Vector3(target.x + rand(-1.2, 1.2), 1.15, target.z + rand(-1.2, 1.2));
        this.effects.tracer(origin.x, origin.y, origin.z, aim.x, aim.y, aim.z);
        this.effects.muzzle(origin.x, origin.y, origin.z, dx / d, 0, dz / d);
        this.audio.gunshot();
        if (Math.random() < 0.55) this.hurt(this.player.inCar ? 6 : 8);
      }

      // despawn when the heat is gone
      if (this.wanted === 0) {
        this.scene.remove(cop.group);
        this.police.splice(this.police.indexOf(cop), 1);
      }
    }
    // headlights / siren glow at night
    if (night < 0.05) { /* daytime, nothing to do */ }
  }

  destroyCop(cop) {
    this.effects.explosion(cop.pos.x, 1, cop.pos.z, 1.15);
    this.audio.explosion();
    this.cameraShake = Math.min(1.3, this.cameraShake + 0.8);
    this.scene.remove(cop.group);
    const idx = this.police.indexOf(cop);
    if (idx >= 0) this.police.splice(idx, 1);
    this.wanted = Math.min(5, this.wanted + 1);
    this.lastCrime = this.clock;
    this.toast('Police cruiser destroyed — heat rising', 'red', 2400);
  }

  // ---------------------------------------------------------------- barrels / pickups
  updateBarrels(dt) {
    for (const b of this.barrels) {
      if (b.alive) continue;
      b.respawn -= dt;
      if (b.respawn <= 0) {
        const roads = CITY.roads;
        const road = choice(roads);
        const along = rand(-210, 210);
        const off = choice([-1, 1]) * rand(8.6, 10.1);
        if (Math.random() < 0.5) { b.pos.set(road + off, 0, along); }
        else { b.pos.set(along, 0, road + off); }
        if (dist(b.pos.x, b.pos.z, this.currentPos().x, this.currentPos().z) < 40) { b.respawn = 2; continue; }
        b.group.position.set(b.pos.x, 0, b.pos.z);
        b.group.visible = true;
        b.alive = true;
      }
    }
  }

  explodeBarrel(barrel) {
    if (!barrel.alive) return;
    barrel.alive = false;
    barrel.group.visible = false;
    barrel.respawn = rand(22, 38);
    this.effects.explosion(barrel.pos.x, 0.8, barrel.pos.z, 1.2);
    this.audio.explosion();
    const d = dist(barrel.pos.x, barrel.pos.z, this.currentPos().x, this.currentPos().z);
    this.cameraShake = Math.min(1.5, this.cameraShake + clamp(1.2 - d / 30, 0.2, 1.2));
    if (d < 9) this.hurt(clamp(24 - d * 1.8, 4, 24));

    for (const cop of [...this.police]) {
      if (dist(cop.pos.x, cop.pos.z, barrel.pos.x, barrel.pos.z) < 11) this.destroyCop(cop);
    }
    for (const b of this.barrels) {
      if (b !== barrel && b.alive && dist(b.pos.x, b.pos.z, barrel.pos.x, barrel.pos.z) < 8) {
        setTimeout(() => this.explodeBarrel(b), 120);
      }
    }
    for (const t of this.traffic) {
      if (dist(t.pos.x, t.pos.z, barrel.pos.x, barrel.pos.z) < 10) t.speed *= 0.2;
    }
    this.crime(this.wanted > 0 ? this.wanted : 1);
  }

  updateHealthPacks(dt) {
    for (const hp of this.healthPacks) {
      if (!hp.active) {
        hp.respawn -= dt;
        if (hp.respawn <= 0) { hp.active = true; hp.group.visible = true; }
        continue;
      }
      hp.group.rotation.y += dt * 1.4;
      hp.group.position.y = 0.55 + Math.sin(this.clock * 2.4 + hp.pos.x) * 0.14;
      if (this.player.inCar) continue;
      if (dist(hp.pos.x, hp.pos.z, this.player.pos.x, this.player.pos.z) < 2.4) {
        hp.active = false;
        hp.group.visible = false;
        hp.respawn = 30;
        this.player.health = Math.min(100, this.player.health + 45);
        this.audio.pickup();
        this.effects.impact(hp.pos.x, 1, hp.pos.z, 0x6dffa0);
        this.toast('Health +45', '', 1600);
      }
    }
  }

  // ---------------------------------------------------------------- missions
  newMission(first = false) {
    const target = this.currentPos();
    let best = null;
    for (let tries = 0; tries < 40; tries++) {
      const x = choice(CITY.roads);
      const z = choice(CITY.roads);
      const d = dist(x, z, target.x, target.z);
      if (d > 55 && d < 215) { best = { x, z }; break; }
    }
    if (!best) best = { x: choice(CITY.roads), z: choice(CITY.roads) };
    this.mission.active = true;
    this.mission.pos.set(best.x, 0, best.z);
    this.mission.timeLeft = first ? 120 : 105;
    this.mission.reward = first ? 400 : Math.min(1800, this.mission.reward + 120);
    this.mission.cooldown = 0;
    this.waypoint.position.set(best.x, 0, best.z);
    this.waypoint.visible = true;
    this.hud.missionPanel.classList.remove('done');
    this.hud.missionText.textContent = 'Reach the drop-off';
  }

  updateMission(dt) {
    const m = this.mission;
    if (!m.active) {
      m.cooldown -= dt;
      if (m.cooldown <= 0) this.newMission();
      return;
    }
    m.timeLeft -= dt;
    const here = this.currentPos();
    const d = dist(here.x, here.z, m.pos.x, m.pos.z);
    if (d < 6.5) {
      const bonus = Math.round(m.timeLeft * 3);
      const total = m.reward + bonus;
      this.player.cash += total;
      this.audio.pickup();
      this.effects.impact(m.pos.x, 1.2, m.pos.z, 0xffd166);
      this.toast(`Delivery complete  +$${total}`, 'gold', 2600);
      this.crime(0);
      m.active = false;
      m.cooldown = 2.2;
      this.waypoint.visible = false;
      this.hud.missionText.textContent = 'Delivery complete';
    } else if (m.timeLeft <= 0) {
      m.active = false;
      m.cooldown = 2.5;
      this.waypoint.visible = false;
      this.toast('Delivery missed — new contract incoming', 'red', 2400);
      this.hud.missionText.textContent = 'Delivery missed';
    }
  }

  updateMissionVisuals(dt) {
    if (!this.waypoint.visible) return;
    const ring = this.waypoint.userData.ring;
    const beam = this.waypoint.userData.beam;
    ring.rotation.z += dt * 1.2;
    const pulse = 1 + Math.sin(this.clock * 3.2) * 0.06;
    ring.scale.setScalar(pulse);
    beam.material.opacity = 0.11 + Math.sin(this.clock * 2.1) * 0.035;
  }

  // ---------------------------------------------------------------- camera
  currentPos() {
    return this.player.inCar ? this.player.inCar.pos : this.player.pos;
  }

  updateCamera(dt) {
    const p = this.player;
    const car = p.inCar;
    const focus = this._tmpV.set(
      this.currentPos().x,
      car ? 1.35 : p.y + 1.45,
      this.currentPos().z,
    );
    const distCam = car ? 10.2 : TOTAL.onFoot;
    const pitch = this.camPitch;
    const horiz = Math.cos(pitch) * distCam;
    const desired = this._tmpV2.set(
      focus.x - Math.sin(this.camYaw) * horiz,
      focus.y + 0.5 + Math.sin(pitch) * distCam,
      focus.z - Math.cos(this.camYaw) * horiz,
    );

    const target = this.resolveCamera(focus, desired);
    if (this.cameraBlend > 0) {
      this.cameraBlend = Math.max(0, this.cameraBlend - dt / 0.45);
      const t = 1 - this.cameraBlend;
      const e = smoothstep(0, 1, t);
      this.camera.position.lerpVectors(this.cameraBlendFrom, target, e);
      const look = new THREE.Vector3().lerpVectors(this.cameraBlendLook, focus, e);
      this.camera.lookAt(look);
    } else {
      const k = 1 - Math.exp(-13 * dt);
      this.camera.position.lerp(target, k);
      this.camera.lookAt(focus);
    }

    if (this.cameraShake > 0.01) {
      const s = this.cameraShake;
      this.camera.position.x += rand(-s, s) * 0.16;
      this.camera.position.y += rand(-s, s) * 0.12;
      this.camera.rotation.z += rand(-s, s) * 0.015;
    }
  }

  resolveCamera(focus, desired) {
    const steps = 9;
    let lastX = focus.x; let lastY = focus.y; let lastZ = focus.z;
    for (let i = 1; i <= steps; i++) {
      const t = i / steps;
      const x = focus.x + (desired.x - focus.x) * t;
      const y = focus.y + (desired.y - focus.y) * t;
      const z = focus.z + (desired.z - focus.z) * t;
      let blocked = false;
      if (y < 130) {
        for (const c of this.world.colliders) {
          if (c.tall < y - 0.4) continue;
          if (pointInRect(x, z, c, 0.45)) { blocked = true; break; }
        }
      }
      if (blocked) break;
      lastX = x; lastY = y; lastZ = z;
    }
    if (!this._camOut) this._camOut = new THREE.Vector3();
    return this._camOut.set(lastX, lastY, lastZ);
  }

  // ---------------------------------------------------------------- audio
  updateAudio(dt) {
    const p = this.player;
    if (this.audio.ctx) {
      this.audio.engineOn = !!p.inCar && this.playing;
      if (p.inCar) {
        this.audio.updateEngine(Math.abs(p.inCar.speed) * 3.6, this.input?.moveVector().y || 0, p.inCar.speed < 0);
      } else {
        this.audio.updateEngine(0, 0, false);
      }
      this.audio.updateSiren(this.wanted > 0 && this.playing, this.clock);
      this.audio.updateMusic();
    }
  }

  // ---------------------------------------------------------------- HUD
  toast(text, cls = '', duration = 2000) {
    const el = this.hud.toast;
    if (!el) return;
    el.textContent = text;
    el.className = 'toast show' + (cls ? ' ' + cls : '');
    clearTimeout(this.toastTimer);
    this.toastTimer = setTimeout(() => el.classList.remove('show'), duration);
  }

  updateHud(dt) {
    const p = this.player;
    const health = clamp(p.health, 0, 100);
    this.hud.health.style.width = health + '%';
    this.hud.health.style.background = health > 55
      ? 'linear-gradient(90deg,#46e6a5,#8bf06a)'
      : health > 25
        ? 'linear-gradient(90deg,#ffb52e,#ffd56a)'
        : 'linear-gradient(90deg,#ff3b2f,#ff7a5e)';
    this.hud.cash.textContent = formatCash(p.cash);
    this.hud.stars.forEach((s, i) => s.classList.toggle('on', i < this.wanted));
    this.hud.wanted.classList.toggle('hot', this.wanted >= 4);

    const m = this.mission;
    if (m.active) {
      const here = this.currentPos();
      const d = dist(here.x, here.z, m.pos.x, m.pos.z);
      this.hud.missionText.textContent = 'Reach the drop-off';
      this.hud.missionDist.textContent = Math.round(d) + ' m';
      this.hud.missionTime.textContent = formatTime(m.timeLeft);
      this.hud.missionPanel.classList.remove('done');
    } else {
      this.hud.missionDist.textContent = '-- m';
      this.hud.missionTime.textContent = '0:00';
    }

    const speed = p.inCar ? Math.round(Math.abs(p.inCar.speed) * 3.6) : 0;
    this.hud.speedVal.textContent = String(speed);
    this.hud.speedo.classList.toggle('show', !!p.inCar);
    this.hud.crosshair.classList.toggle('show', !p.inCar && this.playing && !this.wasted);
    this.hud.action.textContent = p.inCar ? 'EXIT' : 'ENTER';

    this.mapTimer -= dt;
    if (this.mapTimer <= 0) {
      this.mapTimer = 0.06;
      this.drawMinimap();
    }
  }

  drawMinimap() {
    const ctx = this.mapCtx;
    const S = 320;
    const R = S / 2;
    const here = this.currentPos();
    const viewSpan = this.player.inCar ? 300 : 230;
    const s = S / viewSpan;
    const base = this.world.minimapBase;
    const k = s * (540 / base.width);
    const bx = R - ((here.x + 270) / 540) * base.width * k;
    const by = R - ((here.z + 270) / 540) * base.height * k;

    ctx.clearRect(0, 0, S, S);
    ctx.save();
    ctx.beginPath();
    ctx.arc(R, R, R - 2, 0, Math.PI * 2);
    ctx.clip();
    ctx.fillStyle = '#08131d';
    ctx.fillRect(0, 0, S, S);
    ctx.globalAlpha = 0.96;
    ctx.drawImage(base, bx, by, base.width * k, base.height * k);
    ctx.globalAlpha = 1;

    const mark = (wx, wz, color, size, shape = 'dot') => {
      let mx = (wx - here.x) * s + R;
      let my = (wz - here.z) * s + R;
      const dx = mx - R; const dy = my - R;
      const dd = Math.hypot(dx, dy);
      const maxR = R - 14;
      let out = false;
      if (dd > maxR) {
        mx = R + (dx / dd) * maxR;
        my = R + (dy / dd) * maxR;
        out = true;
      }
      ctx.save();
      ctx.translate(mx, my);
      ctx.fillStyle = color;
      ctx.strokeStyle = 'rgba(0,0,0,0.55)';
      ctx.lineWidth = 3;
      if (shape === 'square') {
        ctx.beginPath();
        ctx.rect(-size / 2, -size / 2, size, size);
        ctx.fill(); ctx.stroke();
      } else if (shape === 'diamond') {
        ctx.rotate(Math.PI / 4);
        ctx.beginPath();
        ctx.rect(-size / 2, -size / 2, size, size);
        ctx.fill(); ctx.stroke();
        if (out) {
          ctx.rotate(-Math.PI / 4);
          ctx.beginPath();
          ctx.arc(0, 0, size * 0.22, 0, Math.PI * 2);
          ctx.fillStyle = '#fff'; ctx.fill();
        }
      } else {
        ctx.beginPath();
        ctx.arc(0, 0, size / 2, 0, Math.PI * 2);
        ctx.fill(); ctx.stroke();
      }
      ctx.restore();
    };

    for (const cop of this.police) mark(cop.pos.x, cop.pos.z, '#ff4b3f', 9);
    if (this.mission.active) mark(this.mission.pos.x, this.mission.pos.z, '#ffc247', 15, 'diamond');
    for (const hp of this.healthPacks) if (hp.active) mark(hp.pos.x, hp.pos.z, '#5dff9c', 7);

    // player arrow
    ctx.save();
    ctx.translate(R, R);
    ctx.rotate(Math.PI - (this.player.inCar ? this.player.inCar.heading : this.player.yaw));
    ctx.beginPath();
    ctx.moveTo(0, -13);
    ctx.lineTo(9, 10);
    ctx.lineTo(0, 5);
    ctx.lineTo(-9, 10);
    ctx.closePath();
    ctx.fillStyle = '#eaf7ff';
    ctx.shadowColor = 'rgba(92,225,255,0.9)';
    ctx.shadowBlur = 10;
    ctx.fill();
    ctx.shadowBlur = 0;
    ctx.strokeStyle = '#0b2333';
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.restore();

    ctx.restore();
  }
}
