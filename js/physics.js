// Física 2D da mesa de sinuca.
// Todas as coordenadas são relativas à área de jogo (feltro), em pixels.

export const W = 880; // largura da área de jogo
export const H = 440; // altura da área de jogo
export const RAIL = 44; // espessura da madeira ao redor
export const R = 11; // raio das bolas

// Caçapas: 4 cantos + 2 laterais (centro levemente para fora da mesa).
// `r` é o raio de captura (bola cai quando o centro entra nesse raio).
export const POCKETS = [
  { x: 0, y: 0, r: 25 },
  { x: W, y: 0, r: 25 },
  { x: 0, y: H, r: 25 },
  { x: W, y: H, r: 25 },
  { x: W / 2, y: -9, r: 22 },
  { x: W / 2, y: H + 9, r: 22 },
];

const FRICTION = 150; // desaceleração (px/s²)
const STOP_SPEED = 7; // abaixo disso a bola para (px/s)
const WALL_RESTITUTION = 0.85;
const BALL_RESTITUTION = 0.96;
export const MAX_SHOT_SPEED = 1500; // px/s

export function makeBall(id, x, y) {
  return { id, x, y, vx: 0, vy: 0, pocketed: false };
}

function nearPocketMouth(b) {
  for (const p of POCKETS) {
    if (Math.hypot(b.x - p.x, b.y - p.y) < p.r + R * 0.8) return true;
  }
  return false;
}

function nearestPocket(b) {
  let best = POCKETS[0];
  let bd = Infinity;
  for (const p of POCKETS) {
    const d = Math.hypot(b.x - p.x, b.y - p.y);
    if (d < bd) {
      bd = d;
      best = p;
    }
  }
  return best;
}

// Avança a simulação em `dt` segundos. Registra em `ev`:
//   ev.firstHit  – id da primeira bola tocada pela branca (ou null)
//   ev.pocketed  – ids encaçapados, na ordem
//   ev.sounds    – [{kind, vol}] para efeitos sonoros
export function step(balls, dt, ev) {
  for (const b of balls) {
    if (b.pocketed) continue;
    const sp = Math.hypot(b.vx, b.vy);
    if (sp > 0) {
      const ns = Math.max(0, sp - FRICTION * dt);
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

  // caçapas
  for (const b of balls) {
    if (b.pocketed) continue;
    for (const p of POCKETS) {
      if (Math.hypot(b.x - p.x, b.y - p.y) < p.r) {
        b.pocketed = true;
        b.vx = 0;
        b.vy = 0;
        ev.pocketed.push(b.id);
        ev.sounds.push({ kind: 'pocket', vol: 1 });
        break;
      }
    }
    if (b.pocketed) continue;
    // segurança: se escapar da mesa por uma boca de caçapa, conta como encaçapada
    if (b.x < -R || b.x > W + R || b.y < -R || b.y > H + R) {
      const p = nearestPocket(b);
      b.x = p.x;
      b.y = p.y;
      b.pocketed = true;
      b.vx = 0;
      b.vy = 0;
      ev.pocketed.push(b.id);
      ev.sounds.push({ kind: 'pocket', vol: 1 });
    }
  }

  // tabelas (com aberturas nas bocas das caçapas)
  for (const b of balls) {
    if (b.pocketed || nearPocketMouth(b)) continue;
    let hit = 0;
    if (b.x < R && b.vx < 0) {
      b.x = R;
      b.vx = -b.vx * WALL_RESTITUTION;
      hit = Math.abs(b.vx);
    } else if (b.x > W - R && b.vx > 0) {
      b.x = W - R;
      b.vx = -b.vx * WALL_RESTITUTION;
      hit = Math.abs(b.vx);
    }
    if (b.y < R && b.vy < 0) {
      b.y = R;
      b.vy = -b.vy * WALL_RESTITUTION;
      hit = Math.max(hit, Math.abs(b.vy));
    } else if (b.y > H - R && b.vy > 0) {
      b.y = H - R;
      b.vy = -b.vy * WALL_RESTITUTION;
      hit = Math.max(hit, Math.abs(b.vy));
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
// Retorna { hit: {x,y} posição da branca no contato, ballId, dir: direção do alvo } ou contato com a tabela.
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
