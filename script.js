// ============================================================
//  霓虹彈力球實驗室 — Physics Simulation Engine
// ============================================================

(() => {
  'use strict';

  // ── Canvas Setup ────────────────────────────────────────────
  const canvas = document.getElementById('canvas');
  const ctx    = canvas.getContext('2d');

  let W, H;
  function resize() {
    W = canvas.width  = window.innerWidth;
    H = canvas.height = window.innerHeight;
  }
  window.addEventListener('resize', resize);
  resize();

  // ── DOM refs ────────────────────────────────────────────────
  const elBallCount   = document.getElementById('ball-count');
  const elFps         = document.getElementById('fps-display');
  const elCollisions  = document.getElementById('collision-count');
  const elMousePos    = document.getElementById('mouse-pos');
  const btnPause      = document.getElementById('btn-pause');
  const btnReset      = document.getElementById('btn-reset');
  const btnExplode    = document.getElementById('btn-explode');

  // ── Config ──────────────────────────────────────────────────
  const INITIAL_COUNT     = 50;
  const BALL_RADIUS_MIN   = 6;
  const BALL_RADIUS_MAX   = 12;
  const BALL_SPEED_MIN    = 1.2;
  const BALL_SPEED_MAX    = 3.5;
  const TRAIL_LENGTH      = 18;          // 拖尾殘影幀數
  const CONNECTION_DIST   = 130;         // 發光連線閾值距離
  const MOUSE_ATTRACT_R   = 180;         // 鼠標吸引半徑
  const MOUSE_ATTRACT_F   = 0.015;       // 吸引係數
  const COLLISION_DAMPING = 0.95;        // 碰撞能量損耗

  // ── Neon palette ───────────────────────────────────────────
  const PALETTE = [
    '#00ffff', // cyan
    '#ff00ff', // magenta
    '#00ff88', // green
    '#ffaa00', // amber
    '#ff3232', // red
    '#4488ff', // blue
    '#88ff00', // lime
    '#ff6644', // orange-red
  ];

  // ── State ───────────────────────────────────────────────────
  let balls           = [];
  let collisionCount  = 0;
  let paused          = false;
  let mouse           = { x: -9999, y: -9999 };
  let frameCount      = 0;
  let lastFpsTime     = performance.now();
  let currentFps      = 60;

  // ── Explosion effect ───────────────────────────────────────
  let explosionActive = false;
  let explosionRadius = 0;
  let explosionAlpha  = 0;

  // ── Ball class ──────────────────────────────────────────────
  class Ball {
    constructor(x, y, vx, vy, radius, color) {
      this.x  = x;
      this.y  = y;
      this.vx = vx;
      this.vy = vy;
      this.r  = radius;
      this.color = color;
      this.trail = [];   // {x, y} history
    }

    pushTrail() {
      this.trail.push({ x: this.x, y: this.y });
      if (this.trail.length > TRAIL_LENGTH) {
        this.trail.shift();
      }
    }

    drawTrail() {
      const len = this.trail.length;
      for (let i = 0; i < len; i++) {
        const t = this.trail[i];
        const alpha = (i / len) * 0.25;
        ctx.beginPath();
        ctx.arc(t.x, t.y, this.r * 0.6, 0, Math.PI * 2);
        ctx.fillStyle = this.hexToRGBA(this.color, alpha);
        ctx.fill();
      }
    }

    draw() {
      // Glow layer
      ctx.save();
      ctx.shadowColor = this.color;
      ctx.shadowBlur  = 20;
      ctx.beginPath();
      ctx.arc(this.x, this.y, this.r, 0, Math.PI * 2);
      ctx.fillStyle = this.color;
      ctx.fill();
      ctx.restore();

      // Core (bright white center)
      ctx.beginPath();
      ctx.arc(this.x, this.y, this.r * 0.45, 0, Math.PI * 2);
      ctx.fillStyle = '#ffffff';
      ctx.globalAlpha = 0.7;
      ctx.fill();
      ctx.globalAlpha = 1;
    }

    hexToRGBA(hex, alpha) {
      const r = parseInt(hex.slice(1, 3), 16);
      const g = parseInt(hex.slice(3, 5), 16);
      const b = parseInt(hex.slice(5, 7), 16);
      return `rgba(${r},${g},${b},${alpha})`;
    }
  }

  // ── Factory ─────────────────────────────────────────────────
  function randomBall(x, y) {
    const r = BALL_RADIUS_MIN + Math.random() * (BALL_RADIUS_MAX - BALL_RADIUS_MIN);
    const speed = BALL_SPEED_MIN + Math.random() * (BALL_SPEED_MAX - BALL_SPEED_MIN);
    const angle = Math.random() * Math.PI * 2;
    const vx = Math.cos(angle) * speed;
    const vy = Math.sin(angle) * speed;
    const color = PALETTE[Math.floor(Math.random() * PALETTE.length)];
    const bx = x ?? r + Math.random() * (W - r * 2);
    const by = y ?? r + Math.random() * (H - r * 2);
    return new Ball(bx, by, vx, vy, r, color);
  }

  function initBalls(count) {
    balls = [];
    for (let i = 0; i < count; i++) {
      balls.push(randomBall());
    }
  }

  // ── Physics ─────────────────────────────────────────────────
  function update() {
    // Mouse attraction
    for (const b of balls) {
      const dx = mouse.x - b.x;
      const dy = mouse.y - b.y;
      const dist = Math.sqrt(dx * dx + dy * dy);
      if (dist < MOUSE_ATTRACT_R && dist > 0) {
        const force = MOUSE_ATTRACT_F * (1 - dist / MOUSE_ATTRACT_R);
        b.vx += dx / dist * force;
        b.vy += dy / dist * force;
      }
    }

    // Move
    for (const b of balls) {
      b.x += b.vx;
      b.y += b.vy;

      // Wall bounce
      if (b.x - b.r < 0)  { b.x = b.r;      b.vx = Math.abs(b.vx); }
      if (b.x + b.r > W)  { b.x = W - b.r;   b.vx = -Math.abs(b.vx); }
      if (b.y - b.r < 0)  { b.y = b.r;       b.vy = Math.abs(b.vy); }
      if (b.y + b.r > H)  { b.y = H - b.r;   b.vy = -Math.abs(b.vy); }

      b.pushTrail();
    }

    // Ball-to-ball collision
    for (let i = 0; i < balls.length; i++) {
      for (let j = i + 1; j < balls.length; j++) {
        const a = balls[i], b = balls[j];
        const dx = b.x - a.x;
        const dy = b.y - a.y;
        const distSq = dx * dx + dy * dy;
        const minDist = a.r + b.r;

        if (distSq < minDist * minDist && distSq > 0) {
          const dist = Math.sqrt(distSq);
          const nx = dx / dist;
          const ny = dy / dist;

          // Separate overlapping balls
          const overlap = (minDist - dist) / 2;
          a.x -= nx * overlap;
          a.y -= ny * overlap;
          b.x += nx * overlap;
          b.y += ny * overlap;

          // Elastic collision response
          const dvx = a.vx - b.vx;
          const dvy = a.vy - b.vy;
          const dot = dvx * nx + dvy * ny;

          if (dot > 0) {
            a.vx -= dot * nx * COLLISION_DAMPING;
            a.vy -= dot * ny * COLLISION_DAMPING;
            b.vx += dot * nx * COLLISION_DAMPING;
            b.vy += dot * ny * COLLISION_DAMPING;
            collisionCount++;
          }
        }
      }
    }
  }

  // ── Connections ─────────────────────────────────────────────
  function drawConnections() {
    for (let i = 0; i < balls.length; i++) {
      for (let j = i + 1; j < balls.length; j++) {
        const a = balls[i], b = balls[j];
        const dx = b.x - a.x;
        const dy = b.y - a.y;
        const dist = Math.sqrt(dx * dx + dy * dy);

        if (dist < CONNECTION_DIST) {
          const alpha = (1 - dist / CONNECTION_DIST) * 0.35;
          ctx.beginPath();
          ctx.moveTo(a.x, a.y);
          ctx.lineTo(b.x, b.y);
          ctx.strokeStyle = a.hexToRGBA(a.color, alpha);
          ctx.lineWidth = 1;
          ctx.stroke();
        }
      }
    }
  }

  // ── Explosion ───────────────────────────────────────────────
  function triggerExplosion() {
    explosionActive = true;
    explosionRadius = 0;
    explosionAlpha  = 1;

    // Impulse all balls away from center
    const cx = W / 2;
    const cy = H / 2;
    for (const b of balls) {
      const dx = b.x - cx;
      const dy = b.y - cy;
      const dist = Math.sqrt(dx * dx + dy * dy) || 1;
      const force = 25 + Math.random() * 15;  // huge impulse
      b.vx += (dx / dist) * force;
      b.vy += (dy / dist) * force;
    }
  }

  function updateExplosion() {
    if (!explosionActive) return;

    explosionRadius += 18;
    explosionAlpha  -= 0.018;

    // Draw shockwave ring
    if (explosionAlpha > 0) {
      ctx.save();
      ctx.beginPath();
      ctx.arc(W / 2, H / 2, explosionRadius, 0, Math.PI * 2);
      ctx.strokeStyle = `rgba(255, 255, 255, ${explosionAlpha})`;
      ctx.lineWidth = 3 + explosionAlpha * 4;
      ctx.shadowColor = '#ffffff';
      ctx.shadowBlur = 30;
      ctx.stroke();
      ctx.restore();
    }

    if (explosionAlpha <= 0) {
      explosionActive = false;
    }
  }

  // ── Background grid ─────────────────────────────────────────
  function drawGrid() {
    ctx.save();
    ctx.strokeStyle = 'rgba(0, 255, 255, 0.025)';
    ctx.lineWidth = 1;
    const step = 50;
    for (let x = 0; x < W; x += step) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, H);
      ctx.stroke();
    }
    for (let y = 0; y < H; y += step) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(W, y);
      ctx.stroke();
    }
    ctx.restore();
  }

  // ── Main loop ───────────────────────────────────────────────
  function loop() {
    // Clear with slight fade for motion-blur feel
    ctx.fillStyle = 'rgba(10, 10, 15, 0.85)';
    ctx.fillRect(0, 0, W, H);

    drawGrid();

    if (!paused) {
      update();
      drawConnections();
    }

    for (const b of balls) {
      b.drawTrail();
      b.draw();
    }

    updateExplosion();

    // FPS calc
    frameCount++;
    const now = performance.now();
    if (now - lastFpsTime >= 500) {
      currentFps = Math.round(frameCount / ((now - lastFpsTime) / 1000));
      frameCount = 0;
      lastFpsTime = now;
    }

    // Update stats
    elBallCount.textContent   = balls.length;
    elFps.textContent         = currentFps;
    elCollisions.textContent  = collisionCount;
    elMousePos.textContent    = `(${mouse.x}, ${mouse.y})`;

    requestAnimationFrame(loop);
  }

  // ── Events ──────────────────────────────────────────────────
  window.addEventListener('mousemove', e => {
    mouse.x = e.clientX;
    mouse.y = e.clientY;
  });

  window.addEventListener('mouseleave', () => {
    mouse.x = -9999;
    mouse.y = -9999;
  });

  // Click to spawn 10 balls
  window.addEventListener('click', e => {
    // Don't spawn if clicking buttons
    if (e.target.tagName === 'BUTTON') return;
    for (let i = 0; i < 10; i++) {
      balls.push(randomBall(e.clientX, e.clientY));
    }
  });

  // Pause / Resume
  btnPause.addEventListener('click', () => {
    paused = !paused;
    btnPause.textContent = paused ? '繼續' : '暫停';
  });

  // Reset
  btnReset.addEventListener('click', () => {
    collisionCount = 0;
    explosionActive = false;
    explosionRadius = 0;
    explosionAlpha = 0;
    initBalls(INITIAL_COUNT);
  });

  // Explode
  btnExplode.addEventListener('click', () => {
    triggerExplosion();
  });

  // ── Init ────────────────────────────────────────────────────
  initBalls(INITIAL_COUNT);
  loop();

})();
