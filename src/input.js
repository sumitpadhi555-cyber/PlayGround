import { clamp } from './utils.js';

export class Input {
  constructor(canvas) {
    this.canvas = canvas;
    this.keys = new Set();
    this.touchDirections = new Set();
    this.directionPointers = new Map();
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
    this._bindMovementButtons();
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
      this.touchDirections.clear();
      this.directionPointers.clear();
      document.querySelectorAll('#movePad .direction').forEach((el) => el.classList.remove('down'));
      this.fireHeld = false;
    });
  }

  _bindMovementButtons() {
    const directions = [
      ['moveUp', 'up'],
      ['moveLeft', 'left'],
      ['moveRight', 'right'],
      ['moveDown', 'down'],
    ];

    directions.forEach(([id, direction]) => {
      const button = document.getElementById(id);
      if (!button) return;
      button.addEventListener('pointerdown', (e) => {
        e.preventDefault();
        e.stopPropagation();
        button.setPointerCapture?.(e.pointerId);
        this.directionPointers.set(e.pointerId, direction);
        this.touchDirections.add(direction);
        button.classList.add('down');
      });

      const end = (e) => {
        if (this.directionPointers.get(e.pointerId) !== direction) return;
        e.preventDefault();
        this.directionPointers.delete(e.pointerId);
        const stillHeld = [...this.directionPointers.values()].includes(direction);
        if (!stillHeld) {
          this.touchDirections.delete(direction);
          button.classList.remove('down');
        }
      };
      button.addEventListener('pointerup', end);
      button.addEventListener('pointercancel', end);
    });
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

  // Combined keyboard + touch-button movement, in local screen space.
  moveVector() {
    let x = 0;
    let y = 0;
    if (this.keys.has('KeyW') || this.keys.has('ArrowUp') || this.touchDirections.has('up')) y += 1;
    if (this.keys.has('KeyS') || this.keys.has('ArrowDown') || this.touchDirections.has('down')) y -= 1;
    if (this.keys.has('KeyA') || this.keys.has('ArrowLeft') || this.touchDirections.has('left')) x -= 1;
    if (this.keys.has('KeyD') || this.keys.has('ArrowRight') || this.touchDirections.has('right')) x += 1;
    const len = Math.hypot(x, y);
    if (len > 1) { x /= len; y /= len; }
    return { x: clamp(x, -1, 1), y: clamp(y, -1, 1), len: Math.min(1, len) };
  }

  isSprinting() {
    return this.keys.has('ShiftLeft') || this.keys.has('ShiftRight') || this.runToggle;
  }
}
