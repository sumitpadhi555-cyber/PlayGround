import { clamp } from './utils.js';

export class Input {
  constructor(canvas) {
    this.canvas = canvas;
    this.keys = new Set();
    this.stick = { x: 0, y: 0, active: false };
    this.camDX = 0;
    this.camDY = 0;
    this.fireHeld = false;
    this.firePressed = false;
    this.actionPressed = false;
    this.jumpPressed = false;
    this.runToggle = false;
    this.camPointer = null;
    this.camStart = { x: 0, y: 0, t: 0, moved: 0 };
    this.touch = matchMedia('(pointer: coarse)').matches || navigator.maxTouchPoints > 0;
    document.body.classList.toggle('touch', this.touch);
    this._bindKeyboard();
    this._bindJoystick();
    this._bindButtons();
    this._bindCamera();
  }

  _bindKeyboard() {
    window.addEventListener('keydown', (e) => {
      if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.code)) e.preventDefault();
      if (e.repeat) return;
      this.keys.add(e.code);
      if (e.code === 'KeyE') this.actionPressed = true;
      if (e.code === 'Space') this.jumpPressed = true;
      if (e.code === 'KeyF') this.firePressed = true;
    });
    window.addEventListener('keyup', (e) => this.keys.delete(e.code));
    window.addEventListener('blur', () => {
      this.keys.clear();
      this.fireHeld = false;
    });
  }

  _bindJoystick() {
    const base = document.getElementById('joystick');
    const knob = document.getElementById('stickKnob');
    if (!base) return;
    const radius = 44;
    let pid = null;

    const update = (e) => {
      const r = base.getBoundingClientRect();
      const cx = r.left + r.width / 2;
      const cy = r.top + r.height / 2;
      let dx = e.clientX - cx;
      let dy = e.clientY - cy;
      const len = Math.hypot(dx, dy);
      if (len > radius) { dx = (dx / len) * radius; dy = (dy / len) * radius; }
      knob.style.transform = `translate(${dx}px, ${dy}px)`;
      this.stick.x = dx / radius;
      this.stick.y = -dy / radius;
      this.stick.active = true;
      base.classList.add('active');
    };

    base.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      e.stopPropagation();
      pid = e.pointerId;
      base.setPointerCapture(pid);
      update(e);
    });
    base.addEventListener('pointermove', (e) => {
      if (pid !== e.pointerId) return;
      e.preventDefault();
      update(e);
    });
    const end = (e) => {
      if (pid !== e.pointerId) return;
      pid = null;
      this.stick.x = 0; this.stick.y = 0; this.stick.active = false;
      knob.style.transform = 'translate(0px, 0px)';
      base.classList.remove('active');
    };
    base.addEventListener('pointerup', end);
    base.addEventListener('pointercancel', end);
  }

  _bindButtons() {
    const bindHold = (id, onDown, onUp) => {
      const el = document.getElementById(id);
      if (!el) return;
      el.addEventListener('pointerdown', (e) => {
        e.preventDefault(); e.stopPropagation();
        el.classList.add('down');
        el.setPointerCapture?.(e.pointerId);
        onDown?.();
      });
      const up = (e) => {
        e.preventDefault();
        el.classList.remove('down');
        onUp?.();
      };
      el.addEventListener('pointerup', up);
      el.addEventListener('pointercancel', up);
      el.addEventListener('pointerleave', (e) => { if (e.buttons) up(e); });
    };

    bindHold('btnFire', () => { this.fireHeld = true; this.firePressed = true; }, () => { this.fireHeld = false; });
    bindHold('btnAction', () => { this.actionPressed = true; });
    bindHold('btnJump', () => { this.jumpPressed = true; });
    bindHold('btnRun', () => {
      this.runToggle = !this.runToggle;
      document.getElementById('btnRun')?.classList.toggle('on', this.runToggle);
    });
  }

  _bindCamera() {
    const el = this.canvas;
    el.addEventListener('pointerdown', (e) => {
      if (this.camPointer !== null) return;
      if (e.pointerType === 'mouse' && e.button !== 0) return;
      if (e.pointerType !== 'mouse' && e.clientX < window.innerWidth * 0.34) return;
      this.camPointer = e.pointerId;
      this.camStart = { x: e.clientX, y: e.clientY, t: performance.now(), moved: 0 };
      el.setPointerCapture?.(e.pointerId);
    });
    el.addEventListener('pointermove', (e) => {
      if (this.camPointer !== e.pointerId) return;
      const dx = e.clientX - this.camStart.x;
      const dy = e.clientY - this.camStart.y;
      this.camStart.x = e.clientX;
      this.camStart.y = e.clientY;
      this.camStart.moved += Math.abs(dx) + Math.abs(dy);
      this.camDX += dx;
      this.camDY += dy;
    });
    const end = (e) => {
      if (this.camPointer !== e.pointerId) return;
      const quick = performance.now() - this.camStart.t < 260 && this.camStart.moved < 8;
      if (e.pointerType === 'mouse' && quick) this.firePressed = true;
      this.camPointer = null;
    };
    el.addEventListener('pointerup', end);
    el.addEventListener('pointercancel', (e) => { if (this.camPointer === e.pointerId) this.camPointer = null; });
    el.addEventListener('contextmenu', (e) => e.preventDefault());
  }

  consumeCamera() {
    const dx = this.camDX; const dy = this.camDY;
    this.camDX = 0; this.camDY = 0;
    return { dx, dy };
  }

  consumeFire() { const v = this.firePressed; this.firePressed = false; return v; }
  consumeAction() { const v = this.actionPressed; this.actionPressed = false; return v; }
  consumeJump() { const v = this.jumpPressed; this.jumpPressed = false; return v; }

  // Combined keyboard + touch movement, in local screen space.
  moveVector() {
    let x = this.stick.x;
    let y = this.stick.y;
    if (this.keys.has('KeyW') || this.keys.has('ArrowUp')) y += 1;
    if (this.keys.has('KeyS') || this.keys.has('ArrowDown')) y -= 1;
    if (this.keys.has('KeyA') || this.keys.has('ArrowLeft')) x -= 1;
    if (this.keys.has('KeyD') || this.keys.has('ArrowRight')) x += 1;
    const len = Math.hypot(x, y);
    if (len > 1) { x /= len; y /= len; }
    return { x: clamp(x, -1, 1), y: clamp(y, -1, 1), len: Math.min(1, len) };
  }

  isSprinting() {
    return this.keys.has('ShiftLeft') || this.keys.has('ShiftRight') || this.runToggle || this.stick.y > 0.92;
  }
}
