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

  tick(dt) {
    for (const f of this.items) {
      f.t += dt;
      if (f.kind === 'p') {
        f.vy += 700 * dt;
        f.x += f.vx * dt;
        f.y += f.vy * dt;
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
export function ensureAudio() {
  if (!audioCtx) {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (AC) audioCtx = new AC();
  }
  if (audioCtx && audioCtx.state === 'suspended') audioCtx.resume();
}

export function sfx(kind, vol = 1) {
  if (!audioCtx || audioCtx.state !== 'running') return;
  const t = audioCtx.currentTime;
  const g = audioCtx.createGain();
  g.connect(audioCtx.destination);
  const o = audioCtx.createOscillator();
  o.connect(g);
  if (kind === 'click') {
    o.type = 'triangle';
    o.frequency.value = 700 + Math.random() * 350;
    g.gain.setValueAtTime(0.22 * vol, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.06);
    o.start(t); o.stop(t + 0.07);
  } else if (kind === 'cushion') {
    o.type = 'sine';
    o.frequency.value = 150;
    g.gain.setValueAtTime(0.18 * vol, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.09);
    o.start(t); o.stop(t + 0.1);
  } else if (kind === 'pocket') {
    o.type = 'sine';
    o.frequency.setValueAtTime(430, t);
    o.frequency.exponentialRampToValueAtTime(85, t + 0.16);
    g.gain.setValueAtTime(0.3 * vol, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.18);
    o.start(t); o.stop(t + 0.2);
  } else if (kind === 'score') {
    o.type = 'triangle';
    o.frequency.setValueAtTime(520, t);
    o.frequency.setValueAtTime(660, t + 0.09);
    o.frequency.setValueAtTime(880, t + 0.18);
    g.gain.setValueAtTime(0.22 * vol, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.35);
    o.start(t); o.stop(t + 0.36);
  } else if (kind === 'bumper') {
    o.type = 'square';
    o.frequency.value = 300 + Math.random() * 200;
    g.gain.setValueAtTime(0.12 * vol, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.08);
    o.start(t); o.stop(t + 0.09);
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
