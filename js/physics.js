// Física 2D da mesa de sinuca.
// Todas as coordenadas são relativas à área de jogo (feltro), em pixels.

export const W = 880; // largura da área de jogo
export const H = 440; // altura da área de jogo
export const RAIL = 44; // espessura da madeira ao redor
export const R = 11; // raio das bolas

// Geometria das bocas das caçapas.
export const CORNER_CUT = 32; // onde a tabela termina perto das caçapas de canto
export const SIDE_HALF = 26; // metade da boca das caçapas laterais
export const JAW_R = 7; // raio do "queixo" (ponta arredondada da tabela)

// Caçapas: centro levemente para fora da mesa; `r` é o raio de captura
// (a bola cai quando o CENTRO dela cruza o lábio, entrando de verdade na boca).
export const POCKETS = [
  { x: -7, y: -7, r: 24 },
  { x: W + 7, y: -7, r: 24 },
  { x: -7, y: H + 7, r: 24 },
  { x: W + 7, y: H + 7, r: 24 },
  { x: W / 2, y: -11, r: 20 },
  { x: W / 2, y: H + 11, r: 20 },
];

// Trechos de tabela (cushion) por parede — fora deles a bola passa (boca de caçapa).
export const TOP_SEGS = [
  [CORNER_CUT, W / 2 - SIDE_HALF],
  [W / 2 + SIDE_HALF, W - CORNER_CUT],
];
export const BOTTOM_SEGS = TOP_SEGS;
export const LEFT_SEGS = [[CORNER_CUT, H - CORNER_CUT]];
export const RIGHT_SEGS = LEFT_SEGS;

// Queixos: círculos estáticos tangentes à face da tabela, nas pontas de cada trecho.
export const JAWS = [];
for (const segs of [TOP_SEGS]) {
  for (const [a, b] of segs) {
    JAWS.push({ x: a, y: -JAW_R, r: JAW_R });
    JAWS.push({ x: b, y: -JAW_R, r: JAW_R });
  }
}
for (const segs of [BOTTOM_SEGS]) {
  for (const [a, b] of segs) {
    JAWS.push({ x: a, y: H + JAW_R, r: JAW_R });
    JAWS.push({ x: b, y: H + JAW_R, r: JAW_R });
  }
}
for (const [a, b] of LEFT_SEGS) {
  JAWS.push({ x: -JAW_R, y: a, r: JAW_R });
  JAWS.push({ x: -JAW_R, y: b, r: JAW_R });
}
for (const [a, b] of RIGHT_SEGS) {
  JAWS.push({ x: W + JAW_R, y: a, r: JAW_R });
  JAWS.push({ x: W + JAW_R, y: b, r: JAW_R });
}

// Fricção em duas fases: a bola desliza (freia forte) e depois rola (freia pouco).
const SLIDE_FRICTION = 280; // px/s² acima do limiar
const ROLL_FRICTION = 102; // px/s² abaixo do limiar
const ROLL_THRESHOLD = 330; // px/s
const STOP_SPEED = 6; // abaixo disso a bola para (px/s)

const WALL_RESTITUTION = 0.82;
const WALL_TANGENT_FRICTION = 0.92;
const JAW_RESTITUTION = 0.78;
const JAW_TANGENT_FRICTION = 0.95;
const BALL_RESTITUTION = 0.94;
const BALL_THROW = 0.015; // transferência tangencial ("throw")
export const MAX_SHOT_SPEED = 1500; // px/s

export function makeBall(id, x, y) {
  return { id, x, y, vx: 0, vy: 0, pocketed: false };
}

const inSegs = (segs, v) => segs.some(([a, b]) => v >= a && v <= b);

function nearestPocket(x, y) {
  let best = POCKETS[0];
  let bd = Infinity;
  for (const p of POCKETS) {
    const d = Math.hypot(x - p.x, y - p.y);
    if (d < bd) {
      bd = d;
      best = p;
    }
  }
  return best;
}

function capture(b, p, ev) {
  b.pocketed = true;
  b.vx = 0;
  b.vy = 0;
  ev.pocketed.push(b.id);
  ev.sunk.push({ id: b.id, x: b.x, y: b.y, px: p.x, py: p.y });
  ev.sounds.push({ kind: 'pocket', vol: 1 });
}

// Avança a simulação em `dt` segundos. Registra em `ev`:
//   ev.firstHit  – id da primeira bola tocada pela branca (ou null)
//   ev.pocketed  – ids encaçapados, na ordem
//   ev.sunk      – [{id,x,y,px,py}] para a animação de queda
//   ev.sounds    – [{kind, vol}] para efeitos sonoros
export function step(balls, dt, ev) {
  for (const b of balls) {
    if (b.pocketed) continue;
    const sp = Math.hypot(b.vx, b.vy);
    if (sp > 0) {
      const dec = (sp > ROLL_THRESHOLD ? SLIDE_FRICTION : ROLL_FRICTION) * dt;
      const ns = Math.max(0, sp - dec);
      if (ns < STOP_SPEED) {
        b.vx = 0;
        b.vy = 0;
      } else {
        b.vx *= ns / sp;
        b.vy *= ns / sp;
      }
    }
    b.x += b.vx * dt;
    b.y += b.vy * dt;
  }

  // caçapas: a bola cai quando o centro entra na boca
  for (const b of balls) {
    if (b.pocketed) continue;
    for (const p of POCKETS) {
      if (Math.hypot(b.x - p.x, b.y - p.y) < p.r) {
        capture(b, p, ev);
        break;
      }
    }
    if (b.pocketed) continue;
    // segurança: se escapar da mesa pela garganta da caçapa, conta como encaçapada
    if (b.x < -R * 1.5 || b.x > W + R * 1.5 || b.y < -R * 1.5 || b.y > H + R * 1.5) {
      capture(b, nearestPocket(b.x, b.y), ev);
    }
  }

  // queixos das caçapas (pontas arredondadas das tabelas)
  for (const b of balls) {
    if (b.pocketed) continue;
    for (const j of JAWS) {
      const dx = b.x - j.x;
      const dy = b.y - j.y;
      const d = Math.hypot(dx, dy);
      const minD = R + j.r;
      if (d >= minD || d < 0.0001) continue;
      const nx = dx / d;
      const ny = dy / d;
      b.x = j.x + nx * minD;
      b.y = j.y + ny * minD;
      const vn = b.vx * nx + b.vy * ny;
      if (vn < 0) {
        const vtx = b.vx - vn * nx;
        const vty = b.vy - vn * ny;
        b.vx = vtx * JAW_TANGENT_FRICTION - vn * JAW_RESTITUTION * nx;
        b.vy = vty * JAW_TANGENT_FRICTION - vn * JAW_RESTITUTION * ny;
        if (-vn > 60) ev.sounds.push({ kind: 'cushion', vol: Math.min(1, -vn / 1000) });
      }
    }
  }

  // tabelas (apenas nos trechos com cushion; nas bocas a bola passa)
  for (const b of balls) {
    if (b.pocketed) continue;
    let hit = 0;
    if (b.y < R && b.y > -R && b.vy < 0 && inSegs(TOP_SEGS, b.x)) {
      b.y = R;
      b.vy = -b.vy * WALL_RESTITUTION;
      b.vx *= WALL_TANGENT_FRICTION;
      hit = Math.abs(b.vy);
    } else if (b.y > H - R && b.y < H + R && b.vy > 0 && inSegs(BOTTOM_SEGS, b.x)) {
      b.y = H - R;
      b.vy = -b.vy * WALL_RESTITUTION;
      b.vx *= WALL_TANGENT_FRICTION;
      hit = Math.abs(b.vy);
    }
    if (b.x < R && b.x > -R && b.vx < 0 && inSegs(LEFT_SEGS, b.y)) {
      b.x = R;
      b.vx = -b.vx * WALL_RESTITUTION;
      b.vy *= WALL_TANGENT_FRICTION;
      hit = Math.max(hit, Math.abs(b.vx));
    } else if (b.x > W - R && b.x < W + R && b.vx > 0 && inSegs(RIGHT_SEGS, b.y)) {
      b.x = W - R;
      b.vx = -b.vx * WALL_RESTITUTION;
      b.vy *= WALL_TANGENT_FRICTION;
      hit = Math.max(hit, Math.abs(b.vx));
    }
    if (hit > 40) ev.sounds.push({ kind: 'cushion', vol: Math.min(1, hit / 900) });
  }

  // colisões bola–bola
  for (let i = 0; i < balls.length; i++) {
    const a = balls[i];
    if (a.pocketed) continue;
    for (let j = i + 1; j < balls.length; j++) {
      const b = balls[j];
      if (b.pocketed) continue;
      let dx = b.x - a.x;
      let dy = b.y - a.y;
      let d = Math.hypot(dx, dy);
      if (d >= R * 2) continue;
      if (d < 0.0001) {
        dx = 1;
        dy = 0;
        d = 1;
      }
      const nx = dx / d;
      const ny = dy / d;
      const overlap = R * 2 - d;
      a.x -= (nx * overlap) / 2;
      a.y -= (ny * overlap) / 2;
      b.x += (nx * overlap) / 2;
      b.y += (ny * overlap) / 2;
      const dvn = (a.vx - b.vx) * nx + (a.vy - b.vy) * ny;
      if (dvn <= 0) continue;
      const imp = (dvn * (1 + BALL_RESTITUTION)) / 2;
      a.vx -= imp * nx;
      a.vy -= imp * ny;
      b.vx += imp * nx;
      b.vy += imp * ny;
      // leve arrasto tangencial entre as bolas ("throw")
      const tx = -ny;
      const ty = nx;
      const dvt = (a.vx - b.vx) * tx + (a.vy - b.vy) * ty;
      const tImp = dvt * BALL_THROW;
      a.vx -= tImp * tx;
      a.vy -= tImp * ty;
      b.vx += tImp * tx;
      b.vy += tImp * ty;
      if (ev.firstHit === null && (a.id === 0 || b.id === 0)) {
        ev.firstHit = a.id === 0 ? b.id : a.id;
      }
      if (dvn > 30) ev.sounds.push({ kind: 'click', vol: Math.min(1, dvn / 1200) });
    }
  }
}

export function allStopped(balls) {
  return balls.every((b) => b.pocketed || (b.vx === 0 && b.vy === 0));
}

// Trajetória prevista da branca: primeiro alvo (bola ou tabela).
export function predictShot(balls, cue, dirX, dirY) {
  let bestT = Infinity;
  let bestBall = null;
  for (const b of balls) {
    if (b.pocketed || b.id === 0) continue;
    const rx = b.x - cue.x;
    const ry = b.y - cue.y;
    const proj = rx * dirX + ry * dirY;
    if (proj <= 0) continue;
    const perp2 = rx * rx + ry * ry - proj * proj;
    const rr = (R * 2) * (R * 2);
    if (perp2 > rr) continue;
    const t = proj - Math.sqrt(rr - perp2);
    if (t > 0 && t < bestT) {
      bestT = t;
      bestBall = b;
    }
  }
  // tabelas
  const tWall = [];
  if (dirX < 0) tWall.push((R - cue.x) / dirX);
  if (dirX > 0) tWall.push((W - R - cue.x) / dirX);
  if (dirY < 0) tWall.push((R - cue.y) / dirY);
  if (dirY > 0) tWall.push((H - R - cue.y) / dirY);
  const wallT = Math.min(...tWall.filter((t) => t > 0), Infinity);

  if (bestBall && bestT <= wallT) {
    const hx = cue.x + dirX * bestT;
    const hy = cue.y + dirY * bestT;
    const tx = bestBall.x - hx;
    const ty = bestBall.y - hy;
    const tl = Math.hypot(tx, ty) || 1;
    return { x: hx, y: hy, ballId: bestBall.id, tx: tx / tl, ty: ty / tl };
  }
  if (wallT !== Infinity) {
    return { x: cue.x + dirX * wallT, y: cue.y + dirY * wallT, ballId: null };
  }
  return null;
}

// Posição válida para colocar a bola branca (bola na mão).
export function validCuePosition(balls, x, y) {
  if (x < R + 1 || x > W - R - 1 || y < R + 1 || y > H - R - 1) return false;
  for (const p of POCKETS) {
    if (Math.hypot(x - p.x, y - p.y) < p.r + R) return false;
  }
  for (const b of balls) {
    if (b.pocketed || b.id === 0) continue;
    if (Math.hypot(x - b.x, y - b.y) < R * 2 + 1) return false;
  }
  return true;
}
