// Utilitários compartilhados entre os jogos: física de círculos, controle de
// mira (pressionar e puxar para trás), sons e RNG determinístico.

export const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
export const dist = (ax, ay, bx, by) => Math.hypot(bx - ax, by - ay);

// mulberry32
export function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Fricção em duas fases + integração de posição.
export function stepBall(b, dt, opt = {}) {
  const slide = opt.slide ?? 280;
  const roll = opt.roll ?? 102;
  const thresh = opt.thresh ?? 330;
  const stop = opt.stop ?? 6;
  const sp = Math.hypot(b.vx, b.vy);
  if (sp > 0) {
    const dec = (sp > thresh ? slide : roll) * dt;
    const ns = Math.max(0, sp - dec);
    if (ns < stop) {
      b.vx = 0; b.vy = 0;
    } else {
      b.vx *= ns / sp; b.vy *= ns / sp;
    }
  }
  b.x += b.vx * dt;
  b.y += b.vy * dt;
}

// Colisão elástica entre dois círculos com massa proporcional a r²
// (ou massas explícitas ma/mb). Retorna a velocidade normal do impacto.
export function collideBalls(a, b, ra, rb, rest = 0.94, ma = null, mb = null) {
  let dx = b.x - a.x;
  let dy = b.y - a.y;
  let d = Math.hypot(dx, dy);
  const min = ra + rb;
  if (d >= min) return 0;
  if (d < 0.0001) { dx = 1; dy = 0; d = 1; }
  const nx = dx / d;
  const ny = dy / d;
  ma = ma ?? ra * ra;
  mb = mb ?? rb * rb;
  const tot = ma + mb;
  const overlap = min - d;
  a.x -= nx * overlap * (mb / tot);
  a.y -= ny * overlap * (mb / tot);
  b.x += nx * overlap * (ma / tot);
  b.y += ny * overlap * (ma / tot);
  const dvn = (a.vx - b.vx) * nx + (a.vy - b.vy) * ny;
  if (dvn <= 0) return 0;
  const imp = (dvn * (1 + rest)) / tot;
  a.vx -= imp * mb * nx;
  a.vy -= imp * mb * ny;
  b.vx += imp * ma * nx;
  b.vy += imp * ma * ny;
  return dvn;
}

// Círculo móvel contra círculo estático. Retorna velocidade de impacto.
export function collideCircleStatic(b, br, cx, cy, cr, rest = 0.8, tf = 0.95) {
  const dx = b.x - cx;
  const dy = b.y - cy;
  const d = Math.hypot(dx, dy);
  const min = br + cr;
  if (d >= min || d < 0.0001) return 0;
  const nx = dx / d;
  const ny = dy / d;
  b.x = cx + nx * min;
  b.y = cy + ny * min;
  const vn = b.vx * nx + b.vy * ny;
  if (vn >= 0) return 0;
  const vtx = b.vx - vn * nx;
  const vty = b.vy - vn * ny;
  b.vx = vtx * tf - vn * rest * nx;
  b.vy = vty * tf - vn * rest * ny;
  return -vn;
}

// Círculo contra retângulo (AABB) sólido. Retorna velocidade de impacto.
export function collideRect(b, br, rx, ry, rw, rh, rest = 0.8) {
  const cx = clamp(b.x, rx, rx + rw);
  const cy = clamp(b.y, ry, ry + rh);
  const dx = b.x - cx;
  const dy = b.y - cy;
  const d = Math.hypot(dx, dy);
  if (d >= br) return 0;
  if (d > 0.0001) {
    const nx = dx / d;
    const ny = dy / d;
    b.x = cx + nx * br;
    b.y = cy + ny * br;
    const vn = b.vx * nx + b.vy * ny;
    if (vn < 0) {
      b.vx -= (1 + rest) * vn * nx;
      b.vy -= (1 + rest) * vn * ny;
      return -vn;
    }
    return 0;
  }
  // centro dentro do retângulo: expulsa pelo eixo mais próximo
  const left = b.x - rx, right = rx + rw - b.x, top = b.y - ry, bot = ry + rh - b.y;
  const m = Math.min(left, right, top, bot);
  if (m === left) { b.x = rx - br; b.vx = -Math.abs(b.vx) * rest; }
  else if (m === right) { b.x = rx + rw + br; b.vx = Math.abs(b.vx) * rest; }
  else if (m === top) { b.y = ry - br; b.vy = -Math.abs(b.vy) * rest; }
  else { b.y = ry + rh + br; b.vy = Math.abs(b.vy) * rest; }
  return Math.hypot(b.vx, b.vy);
}

// Círculo contra segmento-cápsula (x1,y1)-(x2,y2) com raio segR.
// extraV: velocidade adicional aplicada ao longo da normal (chute de flipper).
export function collideSegment(b, br, x1, y1, x2, y2, segR = 0, rest = 0.8, extraV = 0) {
  const ex = x2 - x1;
  const ey = y2 - y1;
  const len2 = ex * ex + ey * ey || 1;
  const t = clamp(((b.x - x1) * ex + (b.y - y1) * ey) / len2, 0, 1);
  const px = x1 + ex * t;
  const py = y1 + ey * t;
  let dx = b.x - px;
  let dy = b.y - py;
  let d = Math.hypot(dx, dy);
  const min = br + segR;
  if (d >= min) return 0;
  if (d < 0.0001) { dx = -ey / Math.sqrt(len2); dy = ex / Math.sqrt(len2); d = 1; }
  const nx = dx / d;
  const ny = dy / d;
  b.x = px + nx * min;
  b.y = py + ny * min;
  const vn = b.vx * nx + b.vy * ny;
  if (vn < 0) {
    b.vx -= (1 + rest) * vn * nx;
    b.vy -= (1 + rest) * vn * ny;
  }
  if (extraV > 0) {
    b.vx += nx * extraV;
    b.vy += ny * extraV;
  }
  return Math.abs(Math.min(vn, 0)) + extraV;
}

// Controle de mira "pressionar e puxar para trás" (mesma mecânica da sinuca).
// getPos(): posição da bola/peça; canAim(): se pode mirar agora;
// onShoot(dirX, dirY, power): dispara ao soltar com força suficiente.
export class AimControl {
  constructor({ getPos, canAim, onShoot, onChange, range = 220 }) {
    this.getPos = getPos;
    this.canAim = canAim;
    this.onShoot = onShoot;
    this.onChange = onChange || (() => {});
    this.range = range;
    this.charging = false;
    this.dirX = 1;
    this.dirY = 0;
    this.power = 0;
    this.hover = null; // {x,y} último cursor
  }

  reset() {
    this.charging = false;
    this.power = 0;
    this.hover = null;
  }

  pointer(type, x, y) {
    if (!this.canAim()) {
      this.charging = false;
      return false;
    }
    const pos = this.getPos();
    if (!pos) return false;
    if (type === 'move') {
      this.hover = { x, y };
      if (this.charging) {
        const proj = (this.pressX - x) * this.dirX + (this.pressY - y) * this.dirY;
        this.power = clamp(proj / this.range, 0, 1);
      }
      this.onChange();
      return true;
    }
    if (type === 'down') {
      const dx = x - pos.x;
      const dy = y - pos.y;
      const d = Math.hypot(dx, dy);
      if (d > 4) {
        this.charging = true;
        this.dirX = dx / d;
        this.dirY = dy / d;
        this.pressX = x;
        this.pressY = y;
        this.power = 0;
        this.onChange();
        return true;
      }
      return false;
    }
    if (type === 'up') {
      if (!this.charging) return false;
      this.charging = false;
      const p = this.power;
      this.power = 0;
      if (p >= 0.02) {
        this.onShoot(this.dirX, this.dirY, p);
        return true;
      }
      this.onChange();
      return false;
    }
    return false;
  }

  // Mira atual para desenhar: hover (direção até o cursor) ou carga travada.
  current() {
    if (this.charging) return { dx: this.dirX, dy: this.dirY, power: this.power, charging: true };
    const pos = this.getPos();
    if (!pos || !this.hover) return null;
    const dx = this.hover.x - pos.x;
    const dy = this.hover.y - pos.y;
    const d = Math.hypot(dx, dy);
    if (d < 5) return null;
    return { dx: dx / d, dy: dy / d, power: 0, charging: false };
  }
}

// Seta de mira + medidor de força genéricos (jogos que não têm taco próprio).
export function drawAim(ctx, x, y, a, r, color = 'rgba(255,255,255,0.85)') {
  if (!a) return;
  const len = 60 + a.power * 90;
  ctx.save();
  ctx.strokeStyle = color;
  ctx.lineWidth = 2;
  ctx.setLineDash([6, 6]);
  ctx.beginPath();
  ctx.moveTo(x + a.dx * (r + 3), y + a.dy * (r + 3));
  ctx.lineTo(x + a.dx * (r + len), y + a.dy * (r + len));
  ctx.stroke();
  ctx.setLineDash([]);
  // ponta
  const tx = x + a.dx * (r + len);
  const ty = y + a.dy * (r + len);
  ctx.beginPath();
  ctx.moveTo(tx, ty);
  ctx.lineTo(tx - a.dx * 10 - a.dy * 5, ty - a.dy * 10 + a.dx * 5);
  ctx.lineTo(tx - a.dx * 10 + a.dy * 5, ty - a.dy * 10 - a.dx * 5);
  ctx.closePath();
  ctx.fillStyle = color;
  ctx.fill();
  if (a.charging && a.power > 0.01) {
    const hue = 120 - a.power * 120;
    ctx.strokeStyle = `hsl(${hue} 85% 55%)`;
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.arc(x, y, r + 7, -Math.PI / 2, -Math.PI / 2 + a.power * Math.PI * 2);
    ctx.stroke();
  }
  ctx.restore();
}

export function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

export function shade(hex, f) {
  const n = parseInt(hex.slice(1), 16);
  let r = (n >> 16) & 255;
  let g = (n >> 8) & 255;
  let b = n & 255;
  if (f >= 0) {
    r += (255 - r) * f; g += (255 - g) * f; b += (255 - b) * f;
  } else {
    r *= 1 + f; g *= 1 + f; b *= 1 + f;
  }
  return `rgb(${r | 0},${g | 0},${b | 0})`;
}

// bola/círculo com sombreamento pseudo-3D (sombra de contato + corpo + brilho)
export function drawOrb(ctx, x, y, r, color, alpha = 1) {
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.beginPath();
  ctx.ellipse(x + r * 0.13, y + r * 0.24, r * 0.95, r * 0.8, 0, 0, Math.PI * 2);
  ctx.fillStyle = 'rgba(0,0,0,0.28)';
  ctx.fill();
  const g = ctx.createRadialGradient(x - r * 0.4, y - r * 0.45, r * 0.15, x, y, r * 1.08);
  g.addColorStop(0, shade(color, 0.55));
  g.addColorStop(0.5, color);
  g.addColorStop(1, shade(color, -0.5));
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fillStyle = g;
  ctx.fill();
  const spec = ctx.createRadialGradient(x - r * 0.38, y - r * 0.48, 0.5, x - r * 0.38, y - r * 0.48, r * 0.8);
  spec.addColorStop(0, 'rgba(255,255,255,0.65)');
  spec.addColorStop(0.35, 'rgba(255,255,255,0.08)');
  spec.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fillStyle = spec;
  ctx.fill();
  ctx.restore();
}

// Moldura de mesa no padrão da sinuca: madeira envernizada + filete dourado +
// superfície com vinheta. (px,py,pw,ph) é a área de jogo; rail é a espessura.
export function drawFrame(ctx, px, py, pw, ph, rail, opts = {}) {
  const {
    felt = '#0c6b4a', radius = 22, pad = 12,
    woodA = '#8a5a2b', woodB = '#54311a', vignette = 0.22,
  } = opts;
  const wood = ctx.createLinearGradient(0, py - rail, 0, py + ph + rail);
  wood.addColorStop(0, woodA);
  wood.addColorStop(0.5, shade(woodA, -0.25));
  wood.addColorStop(1, woodB);
  roundRect(ctx, px - rail, py - rail, pw + rail * 2, ph + rail * 2, radius);
  ctx.fillStyle = wood;
  ctx.fill();
  ctx.strokeStyle = 'rgba(255,235,200,0.16)';
  ctx.lineWidth = 2;
  roundRect(ctx, px - rail + 1.5, py - rail + 1.5, pw + rail * 2 - 3, ph + rail * 2 - 3, radius - 1);
  ctx.stroke();
  ctx.strokeStyle = 'rgba(230,195,120,0.35)';
  ctx.lineWidth = 1.5;
  roundRect(ctx, px - pad - 5, py - pad - 5, pw + (pad + 5) * 2, ph + (pad + 5) * 2, 14);
  ctx.stroke();
  roundRect(ctx, px - pad, py - pad, pw + pad * 2, ph + pad * 2, 10);
  ctx.fillStyle = felt;
  ctx.fill();
  if (vignette > 0) {
    const v = ctx.createRadialGradient(px + pw / 2, py + ph / 2, Math.min(pw, ph) * 0.2, px + pw / 2, py + ph / 2, Math.max(pw, ph) * 0.62);
    v.addColorStop(0, 'rgba(255,255,255,0.05)');
    v.addColorStop(1, `rgba(0,0,0,${vignette})`);
    roundRect(ctx, px - pad, py - pad, pw + pad * 2, ph + pad * 2, 10);
    ctx.fillStyle = v;
    ctx.fill();
  }
}

// Rastro de movimento: guarde as últimas posições e desenhe.
export class Trail {
  constructor(max = 10) {
    this.max = max;
    this.pts = [];
  }

  push(x, y) {
    const last = this.pts[this.pts.length - 1];
    if (last && Math.hypot(x - last.x, y - last.y) < 2) return;
    this.pts.push({ x, y });
    if (this.pts.length > this.max) this.pts.shift();
  }

  clear() { this.pts.length = 0; }

  draw(ctx, r, color) {
    for (let i = 0; i < this.pts.length; i++) {
      const t = (i + 1) / this.pts.length;
      ctx.beginPath();
      ctx.arc(this.pts[i].x, this.pts[i].y, r * t * 0.8, 0, Math.PI * 2);
      ctx.fillStyle = color;
      ctx.globalAlpha = 0.16 * t;
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  }
}

// Efeitos: textos flutuantes, anéis e explosões de partículas.
export class Fx {
  constructor() { this.items = []; }

  text(x, y, str, { color = '#ffd54d', size = 26 } = {}) {
    this.items.push({ kind: 't', x, y, str, color, size, t: 0, life: 1.1 });
  }

  ring(x, y, color = '#ffffff', r = 18) {
    this.items.push({ kind: 'r', x, y, color, r, t: 0, life: 0.45 });
  }

  burst(x, y, color = '#ffd54d', n = 14, speed = 260) {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2;
      const s = speed * (0.4 + Math.random() * 0.6);
      this.items.push({
        kind: 'p', x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s - 60,
        color, t: 0, life: 0.6 + Math.random() * 0.4, size: 2 + Math.random() * 3,
      });
    }
  }

  banner(str, { color = '#ffd54d' } = {}) {
    this.items.push({ kind: 'b', str, color, t: 0, life: 1.5 });
  }

  confetti(x, y, n = 36) {
    const colors = ['#00f0ff', '#ff007f', '#ffd54d', '#22c55e', '#a855f7', '#ff5533', '#ffffff'];
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2;
      const s = 140 + Math.random() * 320;
      this.items.push({
        kind: 'c', x, y,
        vx: Math.cos(a) * s,
        vy: Math.sin(a) * s - 160,
        color: colors[Math.floor(Math.random() * colors.length)],
        t: 0, life: 0.9 + Math.random() * 0.7,
        size: 5 + Math.random() * 4,
        rot: Math.random() * Math.PI * 2,
        rotSpeed: (Math.random() - 0.5) * 14,
      });
    }
  }

  tick(dt) {
    for (const f of this.items) {
      f.t += dt;
      if (f.kind === 'p') {
        f.vy += 700 * dt;
        f.x += f.vx * dt;
        f.y += f.vy * dt;
      } else if (f.kind === 'c') {
        f.vy += 480 * dt;
        f.x += f.vx * dt;
        f.y += f.vy * dt;
        f.rot += f.rotSpeed * dt;
      }
    }
    this.items = this.items.filter((f) => f.t < f.life);
  }

  draw(ctx, W, H) {
    for (const f of this.items) {
      const k = f.t / f.life;
      ctx.save();
      if (f.kind === 't') {
        ctx.globalAlpha = 1 - k;
        ctx.fillStyle = f.color;
        ctx.font = `bold ${f.size}px system-ui`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(f.str, f.x, f.y - k * 42);
      } else if (f.kind === 'r') {
        ctx.globalAlpha = (1 - k) * 0.8;
        ctx.strokeStyle = f.color;
        ctx.lineWidth = 3 * (1 - k);
        ctx.beginPath();
        ctx.arc(f.x, f.y, f.r + k * 46, 0, Math.PI * 2);
        ctx.stroke();
      } else if (f.kind === 'p') {
        ctx.globalAlpha = 1 - k;
        ctx.fillStyle = f.color;
        ctx.fillRect(f.x - f.size / 2, f.y - f.size / 2, f.size, f.size);
      } else if (f.kind === 'c') {
        ctx.globalAlpha = 1 - k;
        ctx.fillStyle = f.color;
        ctx.translate(f.x, f.y);
        ctx.rotate(f.rot);
        ctx.fillRect(-f.size / 2, -f.size / 4, f.size, f.size * 0.55);
      } else if (f.kind === 'b') {
        const pop = Math.min(1, f.t / 0.18);
        ctx.globalAlpha = Math.min(1, (f.life - f.t) / 0.4);
        ctx.translate(W / 2, H / 2 - 30);
        ctx.scale(0.6 + pop * 0.4, 0.6 + pop * 0.4);
        ctx.font = 'bold 64px system-ui';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.lineWidth = 8;
        ctx.strokeStyle = 'rgba(0,0,0,0.55)';
        ctx.strokeText(f.str, 0, 0);
        ctx.fillStyle = f.color;
        ctx.fillText(f.str, 0, 0);
      }
      ctx.restore();
    }
  }
}

// ---------- Áudio ----------
let audioCtx = null;
let masterGain = null;
let compressor = null;
let muted = typeof localStorage !== 'undefined' ? localStorage.getItem('hub_audio_muted') === 'true' : false;

export function ensureAudio() {
  if (typeof window === 'undefined') return;
  if (!audioCtx) {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (AC) {
      audioCtx = new AC();
      compressor = audioCtx.createDynamicsCompressor();
      compressor.threshold.setValueAtTime(-12, audioCtx.currentTime);
      compressor.knee.setValueAtTime(30, audioCtx.currentTime);
      compressor.ratio.setValueAtTime(8, audioCtx.currentTime);
      compressor.attack.setValueAtTime(0.003, audioCtx.currentTime);
      compressor.release.setValueAtTime(0.15, audioCtx.currentTime);

      masterGain = audioCtx.createGain();
      masterGain.gain.setValueAtTime(muted ? 0 : 0.85, audioCtx.currentTime);
      masterGain.connect(compressor);
      compressor.connect(audioCtx.destination);
    }
  }
  if (audioCtx && audioCtx.state === 'suspended') audioCtx.resume();
}

export function isAudioMuted() {
  return muted;
}

export function toggleAudioMute() {
  muted = !muted;
  if (typeof localStorage !== 'undefined') {
    try { localStorage.setItem('hub_audio_muted', String(muted)); } catch (_) {}
  }
  if (masterGain && audioCtx) {
    masterGain.gain.setValueAtTime(muted ? 0 : 0.85, audioCtx.currentTime);
  }
  return muted;
}

export function sfx(kind, vol = 1) {
  if (!audioCtx || audioCtx.state === 'closed' || muted) return;
  if (audioCtx.state === 'suspended') {
    try { audioCtx.resume(); } catch (_) {}
  }
  const t = audioCtx.currentTime;

  // Rota de áudio via masterGain -> compressor -> destination
  const g = audioCtx.createGain();
  g.connect(masterGain);

  if (kind === 'hover') {
    const o = audioCtx.createOscillator();
    o.connect(g);
    o.type = 'sine';
    o.frequency.value = 1100;
    g.gain.setValueAtTime(0.04 * vol, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.02);
    o.start(t); o.stop(t + 0.025);
  } else if (kind === 'select') {
    const o = audioCtx.createOscillator();
    o.connect(g);
    o.type = 'triangle';
    o.frequency.setValueAtTime(520, t);
    o.frequency.exponentialRampToValueAtTime(880, t + 0.06);
    g.gain.setValueAtTime(0.18 * vol, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.07);
    o.start(t); o.stop(t + 0.08);
  } else if (kind === 'reaction') {
    const o = audioCtx.createOscillator();
    o.connect(g);
    o.type = 'sine';
    o.frequency.setValueAtTime(420, t);
    o.frequency.exponentialRampToValueAtTime(1100, t + 0.08);
    g.gain.setValueAtTime(0.25 * vol, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.1);
    o.start(t); o.stop(t + 0.11);
  } else if (kind === 'ready') {
    [587.33, 880.00].forEach((freq, idx) => {
      const o = audioCtx.createOscillator();
      const og = audioCtx.createGain();
      o.type = 'sine';
      o.frequency.value = freq;
      const st = t + idx * 0.08;
      og.gain.setValueAtTime(0.16 * vol, st);
      og.gain.exponentialRampToValueAtTime(0.001, st + 0.18);
      o.connect(og);
      og.connect(masterGain);
      o.start(st); o.stop(st + 0.19);
    });
  } else if (kind === 'click') {
    const o = audioCtx.createOscillator();
    o.connect(g);
    o.type = 'triangle';
    o.frequency.value = 650 + Math.random() * 250;
    g.gain.setValueAtTime(0.24 * vol, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.05);
    o.start(t); o.stop(t + 0.06);
  } else if (kind === 'cushion') {
    const o = audioCtx.createOscillator();
    o.connect(g);
    o.type = 'sine';
    o.frequency.value = 140;
    g.gain.setValueAtTime(0.18 * vol, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.09);
    o.start(t); o.stop(t + 0.1);
  } else if (kind === 'pocket') {
    const o = audioCtx.createOscillator();
    o.connect(g);
    o.type = 'sine';
    o.frequency.setValueAtTime(430, t);
    o.frequency.exponentialRampToValueAtTime(85, t + 0.16);
    g.gain.setValueAtTime(0.3 * vol, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.18);
    o.start(t); o.stop(t + 0.2);
  } else if (kind === 'score') {
    const notes = [523.25, 659.25, 783.99, 1046.50]; // Dó maior brilhante
    notes.forEach((freq, idx) => {
      const o = audioCtx.createOscillator();
      const og = audioCtx.createGain();
      o.type = 'triangle';
      o.frequency.value = freq;
      const st = t + idx * 0.07;
      og.gain.setValueAtTime(0.18 * vol, st);
      og.gain.exponentialRampToValueAtTime(0.001, st + 0.22);
      o.connect(og);
      og.connect(masterGain);
      o.start(st); o.stop(st + 0.23);
    });
  } else if (kind === 'bumper') {
    const o = audioCtx.createOscillator();
    o.connect(g);
    o.type = 'square';
    o.frequency.value = 280 + Math.random() * 200;
    g.gain.setValueAtTime(0.12 * vol, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.08);
    o.start(t); o.stop(t + 0.09);
  } else if (kind === 'laser') {
    const o = audioCtx.createOscillator();
    o.connect(g);
    o.type = 'sawtooth';
    o.frequency.setValueAtTime(950, t);
    o.frequency.exponentialRampToValueAtTime(140, t + 0.08);
    g.gain.setValueAtTime(0.24 * vol, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.09);
    o.start(t); o.stop(t + 0.1);
  } else if (kind === 'explosion') {
    const o = audioCtx.createOscillator();
    o.connect(g);
    o.type = 'triangle';
    o.frequency.setValueAtTime(160, t);
    o.frequency.exponentialRampToValueAtTime(30, t + 0.35);
    g.gain.setValueAtTime(0.4 * vol, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.4);
    o.start(t); o.stop(t + 0.42);

    const pop = audioCtx.createOscillator();
    const popG = audioCtx.createGain();
    pop.type = 'square';
    pop.frequency.setValueAtTime(90, t);
    pop.frequency.exponentialRampToValueAtTime(20, t + 0.12);
    popG.gain.setValueAtTime(0.22 * vol, t);
    popG.gain.exponentialRampToValueAtTime(0.001, t + 0.14);
    pop.connect(popG);
    popG.connect(masterGain);
    pop.start(t); pop.stop(t + 0.15);
  } else if (kind === 'pickup') {
    [784, 1175].forEach((freq, idx) => {
      const o = audioCtx.createOscillator();
      const og = audioCtx.createGain();
      o.type = 'sine';
      o.frequency.value = freq;
      const st = t + idx * 0.04;
      og.gain.setValueAtTime(0.18 * vol, st);
      og.gain.exponentialRampToValueAtTime(0.001, st + 0.1);
      o.connect(og);
      og.connect(masterGain);
      o.start(st); o.stop(st + 0.11);
    });
  } else if (kind === 'boost') {
    const o = audioCtx.createOscillator();
    o.connect(g);
    o.type = 'sine';
    o.frequency.setValueAtTime(260, t);
    o.frequency.exponentialRampToValueAtTime(540, t + 0.07);
    g.gain.setValueAtTime(0.12 * vol, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.08);
    o.start(t); o.stop(t + 0.09);
  } else if (kind === 'whistle' || kind === 'foul') {
    // Apito esportivo realista: dois tons dissonantes próximos com LFO vibrato
    const isDouble = kind === 'foul';
    const bursts = isDouble ? [0, 0.14] : [0];
    bursts.forEach((offset) => {
      const st = t + offset;
      const dur = isDouble ? 0.11 : 0.26;
      [2750, 3080].forEach((freq) => {
        const o = audioCtx.createOscillator();
        const og = audioCtx.createGain();
        o.type = 'sine';
        o.frequency.setValueAtTime(freq, st);

        // LFO vibrato para o trinado de esfera do apito
        const lfo = audioCtx.createOscillator();
        const lfoGain = audioCtx.createGain();
        lfo.frequency.value = 28;
        lfoGain.gain.value = 90;
        lfo.connect(o.frequency);

        og.gain.setValueAtTime(0.001, st);
        og.gain.linearRampToValueAtTime(0.16 * vol, st + 0.02);
        og.gain.exponentialRampToValueAtTime(0.001, st + dur);

        o.connect(og);
        og.connect(masterGain);
        lfo.start(st); lfo.stop(st + dur);
        o.start(st); o.stop(st + dur);
      });
    });
  } else if (kind === 'tt_paddle') {
    // Ping pong: batida oca de raquete emborrachada
    const o = audioCtx.createOscillator();
    o.type = 'sine';
    o.frequency.setValueAtTime(490, t);
    o.frequency.exponentialRampToValueAtTime(210, t + 0.045);
    g.gain.setValueAtTime(0.3 * vol, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.05);
    o.connect(g);
    o.start(t); o.stop(t + 0.055);
  } else if (kind === 'tt_table') {
    // Ping pong: batida oca no tampo de madeira da mesa
    const o = audioCtx.createOscillator();
    o.type = 'sine';
    o.frequency.setValueAtTime(360, t);
    o.frequency.exponentialRampToValueAtTime(170, t + 0.06);
    g.gain.setValueAtTime(0.24 * vol, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.07);
    o.connect(g);
    o.start(t); o.stop(t + 0.075);
  } else if (kind === 'puck_hit') {
    // Air hockey: estalo plástico nítido e seco de impacto do malho
    const o = audioCtx.createOscillator();
    o.type = 'triangle';
    o.frequency.setValueAtTime(1300, t);
    o.frequency.exponentialRampToValueAtTime(300, t + 0.035);
    g.gain.setValueAtTime(0.32 * vol, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.04);
    o.connect(g);
    o.start(t); o.stop(t + 0.045);
  } else if (kind === 'puck_wall') {
    // Air hockey: batida na borda de alumínio
    const o = audioCtx.createOscillator();
    o.type = 'sine';
    o.frequency.setValueAtTime(840, t);
    o.frequency.exponentialRampToValueAtTime(280, t + 0.06);
    g.gain.setValueAtTime(0.22 * vol, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.07);
    o.connect(g);
    o.start(t); o.stop(t + 0.075);
  } else if (kind === 'pins' || kind === 'pin_hit') {
    // Boliche: dispersão e estalo de pinos de madeira
    const isFullScatter = kind === 'pins';
    const freqs = isFullScatter ? [1050, 1420, 1850, 2200, 780] : [1250, 1720];
    // Baque grave inicial da bola pesada
    if (isFullScatter) {
      const thud = audioCtx.createOscillator();
      const thudG = audioCtx.createGain();
      thud.type = 'sine';
      thud.frequency.setValueAtTime(110, t);
      thud.frequency.exponentialRampToValueAtTime(45, t + 0.12);
      thudG.gain.setValueAtTime(0.35 * vol, t);
      thudG.gain.exponentialRampToValueAtTime(0.001, t + 0.14);
      thud.connect(thudG);
      thudG.connect(masterGain);
      thud.start(t); thud.stop(t + 0.15);
    }
    // Múltiplos estalos de pinos ressonantes defasados
    freqs.forEach((freq, i) => {
      const st = t + (isFullScatter ? i * 0.025 + Math.random() * 0.02 : 0);
      const o = audioCtx.createOscillator();
      const og = audioCtx.createGain();
      o.type = 'triangle';
      o.frequency.setValueAtTime(freq, st);
      o.frequency.exponentialRampToValueAtTime(freq * 0.5, st + 0.09);
      og.gain.setValueAtTime(0.22 * vol, st);
      og.gain.exponentialRampToValueAtTime(0.001, st + 0.11);
      o.connect(og);
      og.connect(masterGain);
      o.start(st); o.stop(st + 0.12);
    });
  } else if (kind === 'victory') {
    // Fanfarra triunfal para o campeão
    const chord = [
      { f: 523.25, d: 0.12, w: 0 },
      { f: 659.25, d: 0.12, w: 0.1 },
      { f: 783.99, d: 0.15, w: 0.2 },
      { f: 1046.50, d: 0.55, w: 0.32 },
      { f: 1318.51, d: 0.55, w: 0.34 },
    ];
    chord.forEach(({ f, d, w }) => {
      const st = t + w;
      const o = audioCtx.createOscillator();
      const og = audioCtx.createGain();
      o.type = 'triangle';
      o.frequency.value = f;
      og.gain.setValueAtTime(0.25 * vol, st);
      og.gain.exponentialRampToValueAtTime(0.001, st + d);
      o.connect(og);
      og.connect(masterGain);
      o.start(st); o.stop(st + d + 0.02);
    });
  }
}

// throttle simples para envio de mensagens
export function throttler(ms) {
  let lastT = 0;
  return (force) => {
    const now = performance.now();
    if (!force && now - lastT < ms) return false;
    lastT = now;
    return true;
  };
}
