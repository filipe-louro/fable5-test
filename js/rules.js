// Regras do jogo de bola 8 (simplificadas para partidas casuais).
import { W, H, R, makeBall, validCuePosition } from './physics.js';

export const isSolid = (id) => id >= 1 && id <= 7;
export const isStripe = (id) => id >= 9 && id <= 15;

const FOOT_X = W * 0.72; // ponto do triângulo
const HEAD_X = W * 0.25; // posição inicial da branca

// Triângulo: 8 no centro da 3ª fileira, cantos da última fileira com grupos diferentes.
const RACK_ORDER = [1, 9, 2, 3, 8, 10, 4, 11, 5, 12, 6, 13, 14, 7, 15];

export function rackBalls() {
  const balls = [makeBall(0, HEAD_X, H / 2)];
  const gap = R * 2 + 0.6;
  let k = 0;
  for (let row = 0; row < 5; row++) {
    for (let i = 0; i <= row; i++) {
      const x = FOOT_X + row * gap * 0.866;
      const y = H / 2 + (i - row / 2) * gap;
      balls.push(makeBall(RACK_ORDER[k++], x, y));
    }
  }
  balls.sort((a, b) => a.id - b.id);
  return balls;
}

// Estado completo de uma partida.
export function makeInitialState(breaker, names) {
  return {
    balls: rackBalls(),
    turn: breaker, // 0 ou 1 (assento de quem joga)
    breaker,
    breakShot: true, // próxima tacada é a quebra
    open: true, // mesa aberta (grupos não definidos)
    groups: [null, null], // 'solid' | 'stripe' por assento
    ballInHand: false, // quem tem a vez pode posicionar a branca
    over: false,
    winner: null,
    msg: `Quebra de ${names[breaker]}`,
  };
}

export function remaining(balls, group) {
  const test = group === 'solid' ? isSolid : isStripe;
  return balls.filter((b) => !b.pocketed && test(b.id)).length;
}

function groupLabel(g) {
  return g === 'solid' ? 'lisas' : 'listradas';
}

function respotEight(balls) {
  const eight = balls.find((b) => b.id === 8);
  eight.pocketed = false;
  eight.vx = 0;
  eight.vy = 0;
  let x = FOOT_X;
  while (!validCuePosition(balls.filter((b) => b.id !== 8), x, H / 2) && x < W - R * 2) x += R;
  eight.x = x;
  eight.y = H / 2;
}

// Avalia o resultado de uma tacada. `ev` vem da simulação física.
// Muta `state` (vez, grupos, faltas, fim de jogo) e define state.msg.
export function evaluateShot(state, shooter, ev, names) {
  const other = 1 - shooter;
  const { balls } = state;
  let potted = ev.pocketed.slice();
  const cueScratch = potted.includes(0);
  const group = state.groups[shooter];

  // grupo do atirador estava limpo ANTES desta tacada?
  const myPotsNow = group ? potted.filter((id) => (group === 'solid' ? isSolid(id) : isStripe(id))).length : 0;
  const remainingBefore = group ? remaining(balls, group) + myPotsNow : null;

  // 8 na quebra: recoloca na mesa, sem derrota
  if (state.breakShot && potted.includes(8)) {
    respotEight(balls);
    potted = potted.filter((id) => id !== 8);
  }

  // falta: primeira bola tocada
  let legalFirst = true;
  if (ev.firstHit === null) {
    legalFirst = false;
  } else if (!state.breakShot && !state.open) {
    if (remainingBefore > 0) {
      legalFirst = group === 'solid' ? isSolid(ev.firstHit) : isStripe(ev.firstHit);
    } else {
      legalFirst = ev.firstHit === 8;
    }
  } else if (!state.breakShot && state.open) {
    legalFirst = ev.firstHit !== 8;
  }
  const foul = cueScratch || !legalFirst;

  const wasBreak = state.breakShot;
  state.breakShot = false;

  // bola 8 encaçapada (fora da quebra) encerra o jogo
  if (potted.includes(8)) {
    state.over = true;
    const legalWin = group !== null && remainingBefore === 0 && !foul;
    state.winner = legalWin ? shooter : other;
    state.msg = legalWin
      ? `${names[shooter]} venceu! Bola 8 no buraco.`
      : `${names[shooter]} derrubou a 8 na hora errada — ${names[other]} venceu!`;
    return;
  }

  // A branca encaçapada fica fora da mesa até o adversário posicioná-la (bola na mão).

  const objectPots = potted.filter((id) => id !== 0 && id !== 8);

  // define grupos (mesa aberta, fora da quebra, sem falta)
  let justAssigned = false;
  if (state.open && !wasBreak && !foul && objectPots.length > 0) {
    const firstPot = objectPots[0];
    const g = isSolid(firstPot) ? 'solid' : 'stripe';
    state.groups[shooter] = g;
    state.groups[other] = g === 'solid' ? 'stripe' : 'solid';
    state.open = false;
    justAssigned = true;
  }

  if (foul) {
    state.turn = other;
    state.ballInHand = true;
    const reason = cueScratch ? 'a branca caiu' : ev.firstHit === null ? 'não tocou em nenhuma bola' : 'tocou primeiro na bola errada';
    state.msg = `Falta (${reason})! Bola na mão para ${names[other]}.`;
    return;
  }

  // continua na mesa se encaçapou bola válida
  let keepTurn;
  if (wasBreak || state.open) {
    keepTurn = objectPots.length > 0;
  } else {
    const g = state.groups[shooter];
    keepTurn = objectPots.some((id) => (g === 'solid' ? isSolid(id) : isStripe(id)));
  }

  state.ballInHand = false;
  state.turn = keepTurn ? shooter : other;

  const myGroup = state.groups[shooter];
  if (justAssigned) {
    state.msg = `${names[shooter]} ficou com as ${groupLabel(myGroup)}!`;
  } else if (keepTurn && myGroup && remaining(balls, myGroup) === 0) {
    state.msg = `${names[shooter]} agora na bola 8!`;
  } else if (keepTurn) {
    state.msg = `Boa! ${names[shooter]} continua.`;
  } else {
    state.msg = `Vez de ${names[other]}.`;
  }
}

export function serializeState(state) {
  return {
    balls: state.balls.map((b) => [b.id, Math.round(b.x * 10) / 10, Math.round(b.y * 10) / 10, b.pocketed ? 1 : 0]),
    turn: state.turn,
    breaker: state.breaker,
    breakShot: state.breakShot,
    open: state.open,
    groups: state.groups,
    ballInHand: state.ballInHand,
    over: state.over,
    winner: state.winner,
    msg: state.msg,
  };
}

export function deserializeState(s) {
  return {
    balls: s.balls.map(([id, x, y, p]) => ({ id, x, y, vx: 0, vy: 0, pocketed: !!p })),
    turn: s.turn,
    breaker: s.breaker,
    breakShot: s.breakShot,
    open: s.open,
    groups: s.groups,
    ballInHand: s.ballInHand,
    over: s.over,
    winner: s.winner,
    msg: s.msg,
  };
}
