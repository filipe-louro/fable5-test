import {
  W, H, RAIL, R, POCKETS, TOP_SEGS, LEFT_SEGS, MAX_SHOT_SPEED,
  step, allStopped, predictShot, validCuePosition,
} from './physics.js';
import {
  makeInitialState, evaluateShot, serializeState, deserializeState, isSolid,
} from './rules.js';
import { Net, makeRoomCode } from './net.js';

const TW = W + RAIL * 2;
const TH = H + RAIL * 2;
const PULL_RANGE = 220; // px de puxada para força máxima
const MAX_SPECTATORS = 8;

const COLORS = {
  1: '#f6c445', 2: '#2f6fd0', 3: '#d8342c', 4: '#7e3f9d',
  5: '#ef7d20', 6: '#2e9d5b', 7: '#8d3b2f', 8: '#20242c',
};
const ballColor = (id) => COLORS[id > 8 ? id - 8 : id];

function shade(hex, f) {
  const n = parseInt(hex.slice(1), 16);
  let r = (n >> 16) & 255;
  let g = (n >> 8) & 255;
  let b = n & 255;
  if (f >= 0) {
    r += (255 - r) * f;
    g += (255 - g) * f;
    b += (255 - b) * f;
  } else {
    r *= 1 + f;
    g *= 1 + f;
    b *= 1 + f;
  }
  return `rgb(${r | 0},${g | 0},${b | 0})`;
}

// ---------- DOM ----------
const $ = (id) => document.getElementById(id);
const canvas = $('table');
const ctx = canvas.getContext('2d');
const els = {
  menu: $('menu'), panelMain: $('panel-main'), panelWait: $('panel-wait'),
  name: $('inp-name'), code: $('inp-code'), status: $('net-status'),
  waitCode: $('wait-code'), waitStatus: $('wait-status'),
  hud: $('hud'), msg: $('msg'), hint: $('hint'),
  roomChip: $('room-chip'), roomCode: $('room-code'),
  specChip: $('spec-chip'), specN: $('spec-n'),
  end: $('end'), endMsg: $('end-msg'), btnRematch: $('btn-rematch'),
  toast: $('toast'),
  cards: [
    { root: $('card-0'), name: $('name-0'), group: $('group-0'), balls: $('balls-0') },
    { root: $('card-1'), name: $('name-1'), group: $('group-1'), balls: $('balls-1') },
  ],
};

// ---------- Estado da aplicação ----------
let mode = 'menu'; // menu | local | host | guest | spectator
let mySeat = 0; // -1 para espectador
let names = ['Jogador 1', 'Jogador 2'];
let state = makeInitialState(0, names);
let net = null;
let roomCode = '';
let gameStarted = false;

// anfitrião: papéis das conexões
let playerConnId = null;
const spectatorIds = new Set();
let specCount = 0;

let shooting = false; // eu estou simulando uma tacada
let remoteShooting = false; // o jogador remoto está simulando
let shotSeat = 0;
let ev = null; // eventos da tacada em curso

let pointer = { x: -999, y: -999, inside: false, down: false };
// mira: hover segue o cursor; ao pressionar trava a direção e a puxada dá a força
let aim = { charging: false, dirX: 1, dirY: 0, pressX: 0, pressY: 0, power: 0 };
let remoteAim = null; // {dx, dy, pow, ch}
let ghostCue = null; // prévia da bola na mão (local ou remota)
const sinkAnims = new Map(); // id -> {x0,y0,px,py,t0}
let lastAimSent = 0;
let lastFrameSent = 0;

const myTurn = () =>
  !state.over && gameStarted && mode !== 'spectator' && (mode === 'local' || state.turn === mySeat);
const canAim = () =>
  myTurn() && !shooting && !remoteShooting && !state.ballInHand && !state.balls[0].pocketed;

// ---------- Áudio ----------
let audioCtx = null;
function ensureAudio() {
  if (!audioCtx) {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (AC) audioCtx = new AC();
  }
  if (audioCtx && audioCtx.state === 'suspended') audioCtx.resume();
}
function sfx(kind, vol = 1) {
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
  }
}
function drainShotEvents() {
  if (!ev) return;
  let played = 0;
  for (const s of ev.sounds) {
    if (played++ >= 3) break;
    sfx(s.kind, s.vol);
  }
  ev.sounds.length = 0;
  for (const s of ev.sunk) {
    sinkAnims.set(s.id, { x0: s.x, y0: s.y, px: s.px, py: s.py, t0: performance.now() });
  }
  ev.sunk.length = 0;
}

function nearestPocketTo(x, y) {
  let best = POCKETS[0];
  let bd = Infinity;
  for (const p of POCKETS) {
    const d = Math.hypot(x - p.x, y - p.y);
    if (d < bd) { bd = d; best = p; }
  }
  return best;
}

// ---------- Ciclo da tacada ----------
function shoot(dirX, dirY, power) {
  const cue = state.balls[0];
  const speed = 150 + power * (MAX_SHOT_SPEED - 150);
  cue.vx = dirX * speed;
  cue.vy = dirY * speed;
  shotSeat = state.turn;
  ev = { firstHit: null, pocketed: [], sunk: [], sounds: [] };
  shooting = true;
  remoteAim = null;
  sfx('click', 0.4 + power * 0.6);
}

function finishShot() {
  shooting = false;
  sendFrame(true);
  evaluateShot(state, shotSeat, ev, names);
  ev = null;
  broadcast({ t: 'e', s: serializeState(state) });
  updateHud();
  if (state.over) showEnd(state.msg);
}

function sendFrame(force) {
  if (!net || !net.connected) return;
  const now = performance.now();
  if (!force && now - lastFrameSent < 40) return;
  lastFrameSent = now;
  broadcast({
    t: 'f',
    b: state.balls.map((b) => [
      Math.round(b.x * 10) / 10,
      Math.round(b.y * 10) / 10,
      b.pocketed ? 1 : 0,
    ]),
  });
}

// envia mensagem de jogo para todos os interessados
function broadcast(msg) {
  if (net && net.connected) net.send(msg);
}

function sendAim(force) {
  if (!net || !net.connected || !canAim()) return;
  const now = performance.now();
  if (!force && now - lastAimSent < 50) return;
  lastAimSent = now;
  const cue = state.balls[0];
  let dx;
  let dy;
  if (aim.charging) {
    dx = aim.dirX;
    dy = aim.dirY;
  } else {
    const vx = pointer.x - cue.x;
    const vy = pointer.y - cue.y;
    const d = Math.hypot(vx, vy);
    if (d < 4 || !pointer.inside) return;
    dx = vx / d;
    dy = vy / d;
  }
  broadcast({ t: 'a', dx, dy, pow: aim.charging ? aim.power : 0, ch: aim.charging ? 1 : 0 });
}

// ---------- Rede ----------
function makeNet() {
  return new Net({
    onMessage: handleMessage,
    onOpen: (connId) => {
      if (mode === 'guest') net.send({ t: 'hello', name: names[1] });
      void connId;
    },
    onConnClose: (connId) => {
      if (mode === 'host') {
        if (connId === playerConnId && gameStarted) {
          showEnd('O outro jogador saiu da partida.', true);
        } else if (spectatorIds.delete(connId)) {
          setSpectators(spectatorIds.size);
        }
      } else if (gameStarted) {
        showEnd(mode === 'spectator' ? 'A transmissão terminou.' : 'O outro jogador saiu da partida.', true);
      } else if (mode === 'guest') {
        setStatus('error', 'Não foi possível entrar na sala.');
        showPanel('main');
      }
    },
    onStatus: setStatus,
    onCodeChange: (fresh) => {
      roomCode = fresh;
      els.waitCode.textContent = fresh;
      els.roomCode.textContent = fresh;
    },
  });
}

function setSpectators(n) {
  specCount = n;
  updateSpecChip();
  if (mode === 'host') broadcast({ t: 'spec', n });
}

function updateSpecChip() {
  els.specChip.classList.toggle('hidden', specCount <= 0);
  els.specN.textContent = specCount;
}

function handleMessage(m, connId) {
  if (!m || typeof m !== 'object') return;
  if (mode === 'host') handleHostMessage(m, connId);
  else handleClientMessage(m);
}

function handleHostMessage(m, connId) {
  if (m.t === 'hello') {
    const name = String(m.name || '').slice(0, 14);
    if (playerConnId === null && !gameStarted) {
      playerConnId = connId;
      names[1] = name || 'Jogador 2';
      state = makeInitialState(0, names);
      net.sendTo(connId, { t: 'welcome', role: 'player', n: names, s: serializeState(state), spec: specCount });
      startGame();
    } else if (spectatorIds.size < MAX_SPECTATORS) {
      spectatorIds.add(connId);
      net.sendTo(connId, { t: 'welcome', role: 'spectator', n: names, s: serializeState(state), spec: spectatorIds.size });
      setSpectators(spectatorIds.size);
      toast(`${name || 'Alguém'} entrou para assistir 👁`);
    } else {
      net.sendTo(connId, { t: 'full' });
      net.closeConn(connId);
    }
    return;
  }
  if (connId !== playerConnId) {
    if (m.t === 'bye' && spectatorIds.delete(connId)) {
      net.closeConn(connId);
      setSpectators(spectatorIds.size);
    }
    return; // espectadores não interferem no jogo
  }
  if (m.t === 'bye') {
    showEnd('O outro jogador saiu da partida.', true);
    return;
  }
  if (m.t === 'wr') {
    doRematch();
    return;
  }
  // repassa a transmissão do jogador para os espectadores
  if (m.t === 'f' || m.t === 'e' || m.t === 'a' || m.t === 'ph' || m.t === 'pf') {
    net.sendExcept(connId, m);
  }
  applyGameMessage(m);
}

function handleClientMessage(m) {
  switch (m.t) {
    case 'welcome':
      names = m.n;
      state = deserializeState(m.s);
      specCount = m.spec || 0;
      if (m.role === 'spectator') {
        mode = 'spectator';
        mySeat = -1;
      }
      startGame();
      updateSpecChip();
      if (mode === 'spectator') toast('Partida em andamento — você está assistindo 👁');
      break;
    case 'full':
      setStatus('error', 'Sala cheia (jogo + espectadores). Tente mais tarde.');
      if (net) net.close();
      net = null;
      mode = 'menu';
      showPanel('main');
      break;
    case 'spec':
      specCount = m.n;
      updateSpecChip();
      break;
    case 'r': // anfitrião reiniciou
      state = deserializeState(m.s);
      remoteShooting = false;
      ghostCue = null;
      remoteAim = null;
      sinkAnims.clear();
      hideEnd();
      updateHud();
      break;
    case 'bye':
      showEnd(mode === 'spectator' ? 'A transmissão terminou.' : 'O outro jogador saiu da partida.', true);
      break;
    default:
      applyGameMessage(m);
  }
}

// mensagens de jogo comuns a convidado, espectador e anfitrião
function applyGameMessage(m) {
  switch (m.t) {
    case 'a': // prévia de mira do jogador remoto
      remoteAim = m.off ? null : { dx: m.dx, dy: m.dy, pow: m.pow || 0, ch: !!m.ch };
      break;
    case 'f': { // quadro de animação da tacada remota
      remoteShooting = true;
      remoteAim = null;
      for (let i = 0; i < m.b.length && i < state.balls.length; i++) {
        const b = state.balls[i];
        const [x, y, p] = m.b[i];
        if (p && !b.pocketed) {
          b.pocketed = true;
          const pk = nearestPocketTo(b.x, b.y);
          sinkAnims.set(b.id, { x0: b.x, y0: b.y, px: pk.x, py: pk.y, t0: performance.now() });
          sfx('pocket', 1);
        }
        b.x = x; b.y = y;
      }
      break;
    }
    case 'e': // estado autoritativo ao fim da tacada
      remoteShooting = false;
      state = deserializeState(m.s);
      remoteAim = null;
      ghostCue = null;
      updateHud();
      if (state.over) showEnd(state.msg);
      break;
    case 'ph': // prévia da bola na mão
      ghostCue = { x: m.x, y: m.y, valid: true, remote: true };
      break;
    case 'pf': { // bola na mão posicionada
      const cue = state.balls[0];
      cue.pocketed = false;
      cue.x = m.x; cue.y = m.y;
      cue.vx = 0; cue.vy = 0;
      state.ballInHand = false;
      ghostCue = null;
      updateHud();
      break;
    }
  }
}

// ---------- Fluxo de telas ----------
function setStatus(kind, text) {
  els.status.textContent = text;
  els.status.className = kind;
  els.waitStatus.textContent = text;
}

function showPanel(which) {
  els.panelMain.classList.toggle('hidden', which !== 'main');
  els.panelWait.classList.toggle('hidden', which !== 'wait');
}

function inviteLink() {
  return `${location.origin}${location.pathname}?sala=${roomCode}`;
}

function toast(text) {
  els.toast.textContent = text;
  els.toast.classList.add('show');
  clearTimeout(toast._t);
  toast._t = setTimeout(() => els.toast.classList.remove('show'), 2200);
}

function myName() {
  return els.name.value.trim().slice(0, 14) || 'Jogador';
}

function startGame() {
  gameStarted = true;
  els.menu.classList.add('hidden');
  els.end.classList.add('hidden');
  els.hud.classList.remove('hidden');
  document.body.classList.add('in-game');
  if (mode !== 'local') {
    els.roomChip.classList.remove('hidden');
    els.roomCode.textContent = roomCode;
  }
  updateHud();
}

function showEnd(text, disconnected = false) {
  els.endMsg.textContent = text;
  els.btnRematch.classList.toggle('hidden', !!disconnected || mode === 'spectator');
  els.btnRematch.disabled = false;
  els.btnRematch.textContent = 'Revanche';
  els.end.classList.remove('hidden');
  if (disconnected && net) {
    net.close();
    gameStarted = false;
  }
}

function hideEnd() {
  els.end.classList.add('hidden');
}

function doRematch() {
  const nextBreaker = 1 - state.breaker;
  state = makeInitialState(nextBreaker, names);
  shooting = false;
  remoteShooting = false;
  ghostCue = null;
  remoteAim = null;
  ev = null;
  sinkAnims.clear();
  if (mode === 'host') broadcast({ t: 'r', s: serializeState(state) });
  hideEnd();
  updateHud();
}

// ---------- HUD ----------
function groupLabel(g) {
  if (g === 'solid') return 'Lisas (1–7)';
  if (g === 'stripe') return 'Listradas (9–15)';
  return 'Grupo em aberto';
}

function miniBallsHtml(seat) {
  const g = state.groups[seat];
  if (!g) return '';
  const test = g === 'solid' ? isSolid : (id) => id >= 9 && id <= 15;
  const left = state.balls.filter((b) => !b.pocketed && test(b.id));
  if (left.length === 0) {
    return '<span class="mini eight">8</span>';
  }
  return left
    .map((b) => {
      const c = ballColor(b.id);
      const style =
        g === 'stripe'
          ? `background:linear-gradient(180deg,#fff 0 22%,${c} 22% 78%,#fff 78%)`
          : `background:${c}`;
      return `<span class="mini" style="${style}"></span>`;
    })
    .join('');
}

function updateHud() {
  for (const seat of [0, 1]) {
    const c = els.cards[seat];
    c.name.textContent = names[seat] + (mode !== 'local' && seat === mySeat ? ' (você)' : '');
    c.group.textContent = state.over ? '' : groupLabel(state.groups[seat]);
    c.balls.innerHTML = miniBallsHtml(seat);
    c.root.classList.toggle('active', !state.over && state.turn === seat);
  }
  els.msg.textContent = state.msg || '';
  let hint = '';
  if (!state.over) {
    if (mode === 'spectator') {
      hint = `👁 Você está assistindo. ${names[state.turn]} joga.`;
    } else if (state.ballInHand && myTurn()) {
      hint = 'Bola na mão: toque na mesa para posicionar a branca.';
    } else if (myTurn() && !shooting && !remoteShooting) {
      hint = 'Mire com o cursor, pressione e puxe para trás para dar força; solte para tacar.';
    } else if (!myTurn() && mode !== 'local') {
      hint = `Aguardando ${names[state.turn]}…`;
    }
  }
  els.hint.textContent = hint;
}

// ---------- Entrada ----------
function toPlay(e) {
  const rect = canvas.getBoundingClientRect();
  return {
    x: ((e.clientX - rect.left) * TW) / rect.width - RAIL,
    y: ((e.clientY - rect.top) * TH) / rect.height - RAIL,
  };
}

canvas.addEventListener('pointermove', (e) => {
  const p = toPlay(e);
  pointer.x = p.x;
  pointer.y = p.y;
  pointer.inside = true;
  if (state.ballInHand && myTurn()) {
    ghostCue = { x: p.x, y: p.y, valid: validCuePosition(state.balls, p.x, p.y), remote: false };
    if (net && net.connected) {
      const now = performance.now();
      if (now - lastAimSent > 60) {
        lastAimSent = now;
        broadcast({ t: 'ph', x: p.x, y: p.y });
      }
    }
    return;
  }
  if (canAim()) {
    if (aim.charging) {
      const proj = (aim.pressX - p.x) * aim.dirX + (aim.pressY - p.y) * aim.dirY;
      aim.power = Math.min(1, Math.max(0, proj / PULL_RANGE));
    }
    sendAim(false);
  }
});

canvas.addEventListener('pointerdown', (e) => {
  ensureAudio();
  const p = toPlay(e);
  pointer.x = p.x;
  pointer.y = p.y;
  pointer.inside = true;
  pointer.down = true;
  try {
    canvas.setPointerCapture(e.pointerId);
  } catch (_) { /* ignore */ }
  if (canAim() && !state.ballInHand) {
    const cue = state.balls[0];
    const dx = p.x - cue.x;
    const dy = p.y - cue.y;
    const d = Math.hypot(dx, dy);
    if (d > R + 2) {
      aim.charging = true;
      aim.dirX = dx / d;
      aim.dirY = dy / d;
      aim.pressX = p.x;
      aim.pressY = p.y;
      aim.power = 0;
      sendAim(true);
    }
  }
  e.preventDefault();
});

canvas.addEventListener('pointerup', (e) => {
  const p = toPlay(e);
  pointer.x = p.x;
  pointer.y = p.y;
  const wasDown = pointer.down;
  pointer.down = false;
  const wasCharging = aim.charging;
  aim.charging = false;
  if (!wasDown || !gameStarted || state.over) return;

  if (state.ballInHand && myTurn()) {
    if (validCuePosition(state.balls, p.x, p.y)) {
      const cue = state.balls[0];
      cue.pocketed = false;
      cue.x = p.x; cue.y = p.y;
      cue.vx = 0; cue.vy = 0;
      state.ballInHand = false;
      ghostCue = null;
      broadcast({ t: 'pf', x: p.x, y: p.y });
      updateHud();
    }
    return;
  }

  if (wasCharging && canAim()) {
    if (aim.power >= 0.02) {
      shoot(aim.dirX, aim.dirY, aim.power);
      broadcast({ t: 'a', off: true });
      updateHud();
    } else {
      sendAim(true); // puxada cancelada: volta à mira de hover
    }
  }
});

canvas.addEventListener('pointercancel', () => {
  pointer.down = false;
  aim.charging = false;
});

canvas.addEventListener('pointerleave', () => {
  pointer.inside = false;
  if (!aim.charging && net && net.connected && canAim()) broadcast({ t: 'a', off: true });
});

// ---------- Desenho ----------
function roundRect(x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

const FELT_PAD = 14;

function drawCushions() {
  // trapézios com pontas cortadas junto às caçapas (casa com a física dos queixos)
  ctx.fillStyle = '#0a5d40';
  const trap = (ax, ay, bx, by, cx, cy, dx, dy) => {
    ctx.beginPath();
    ctx.moveTo(ax, ay);
    ctx.lineTo(bx, by);
    ctx.lineTo(cx, cy);
    ctx.lineTo(dx, dy);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,0.05)';
    ctx.lineWidth = 1;
    ctx.stroke();
  };
  for (const [a, b] of TOP_SEGS) {
    trap(a - 9, -FELT_PAD, b + 9, -FELT_PAD, b - 3, 0, a + 3, 0);
    trap(a - 9, H + FELT_PAD, b + 9, H + FELT_PAD, b - 3, H, a + 3, H);
  }
  for (const [a, b] of LEFT_SEGS) {
    trap(-FELT_PAD, a - 9, -FELT_PAD, b + 9, 0, b - 3, 0, a + 3);
    trap(W + FELT_PAD, a - 9, W + FELT_PAD, b + 9, W, b - 3, W, a + 3);
  }
}

function drawTable() {
  // moldura de madeira com verniz
  const wood = ctx.createLinearGradient(0, 0, 0, TH);
  wood.addColorStop(0, '#8a5a2b');
  wood.addColorStop(0.5, '#6d4322');
  wood.addColorStop(1, '#54311a');
  ctx.fillStyle = wood;
  roundRect(0, 0, TW, TH, 22);
  ctx.fill();
  ctx.strokeStyle = 'rgba(255,235,200,0.18)';
  ctx.lineWidth = 2;
  roundRect(1.5, 1.5, TW - 3, TH - 3, 21);
  ctx.stroke();

  // filete dourado
  ctx.strokeStyle = 'rgba(230,195,120,0.35)';
  ctx.lineWidth = 1.5;
  roundRect(RAIL - FELT_PAD - 5, RAIL - FELT_PAD - 5, W + (FELT_PAD + 5) * 2, H + (FELT_PAD + 5) * 2, 14);
  ctx.stroke();

  // feltro
  ctx.fillStyle = '#0c6b4a';
  roundRect(RAIL - FELT_PAD, RAIL - FELT_PAD, W + FELT_PAD * 2, H + FELT_PAD * 2, 10);
  ctx.fill();

  ctx.save();
  ctx.translate(RAIL, RAIL);
  drawCushions();

  // linha da cabeceira + ponto do triângulo
  ctx.strokeStyle = 'rgba(255,255,255,0.13)';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(W * 0.25, 6);
  ctx.lineTo(W * 0.25, H - 6);
  ctx.stroke();
  ctx.fillStyle = 'rgba(255,255,255,0.17)';
  ctx.beginPath();
  ctx.arc(W * 0.72, H / 2, 3, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();

  // vinheta do feltro
  const felt = ctx.createRadialGradient(
    RAIL + W / 2, RAIL + H / 2, 80,
    RAIL + W / 2, RAIL + H / 2, W * 0.64
  );
  felt.addColorStop(0, 'rgba(255,255,255,0.05)');
  felt.addColorStop(1, 'rgba(0,0,0,0.22)');
  ctx.fillStyle = felt;
  roundRect(RAIL - FELT_PAD, RAIL - FELT_PAD, W + FELT_PAD * 2, H + FELT_PAD * 2, 10);
  ctx.fill();

  // losangos de madrepérola nos trilhos
  ctx.fillStyle = 'rgba(240,225,195,0.55)';
  const diamond = (x, y) => {
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(Math.PI / 4);
    ctx.fillRect(-2.4, -2.4, 4.8, 4.8);
    ctx.restore();
  };
  for (let i = 1; i < 8; i++) {
    if (i === 4) continue;
    const x = RAIL + (W * i) / 8;
    diamond(x, RAIL / 2 - 5);
    diamond(x, TH - RAIL / 2 + 5);
  }
  for (let i = 1; i < 4; i++) {
    const y = RAIL + (H * i) / 4;
    diamond(RAIL / 2 - 5, y);
    diamond(TW - RAIL / 2 + 5, y);
  }

  // caçapas com anel de couro
  for (const p of POCKETS) {
    const px = RAIL + p.x;
    const py = RAIL + p.y;
    const vis = p.r - 3;
    ctx.beginPath();
    ctx.arc(px, py, vis + 3, 0, Math.PI * 2);
    ctx.strokeStyle = '#2e1c10';
    ctx.lineWidth = 6;
    ctx.stroke();
    const hole = ctx.createRadialGradient(px, py, 2, px, py, vis);
    hole.addColorStop(0, '#000');
    hole.addColorStop(0.75, '#07090c');
    hole.addColorStop(1, '#12181e');
    ctx.beginPath();
    ctx.arc(px, py, vis, 0, Math.PI * 2);
    ctx.fillStyle = hole;
    ctx.fill();
  }
}

function drawBall(x, y, id, alpha = 1, scale = 1) {
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.translate(RAIL + x, RAIL + y);
  ctx.scale(scale, scale);

  ctx.beginPath();
  ctx.ellipse(1.5, 2.8, R * 0.95, R * 0.8, 0, 0, Math.PI * 2);
  ctx.fillStyle = 'rgba(0,0,0,0.25)';
  ctx.fill();

  const base = id === 0 ? '#f2eee0' : id <= 8 ? ballColor(id) : '#f2eee0';
  const body = ctx.createRadialGradient(-R * 0.4, -R * 0.45, R * 0.15, 0, 0, R * 1.08);
  body.addColorStop(0, shade(base, 0.55));
  body.addColorStop(0.5, base);
  body.addColorStop(1, shade(base, -0.45));
  ctx.beginPath();
  ctx.arc(0, 0, R, 0, Math.PI * 2);
  ctx.fillStyle = body;
  ctx.fill();

  if (id > 8) {
    ctx.save();
    ctx.beginPath();
    ctx.arc(0, 0, R, 0, Math.PI * 2);
    ctx.clip();
    const c = ballColor(id);
    const band = ctx.createLinearGradient(0, -R * 0.5, 0, R * 0.5);
    band.addColorStop(0, shade(c, 0.25));
    band.addColorStop(0.5, c);
    band.addColorStop(1, shade(c, -0.3));
    ctx.fillStyle = band;
    ctx.fillRect(-R, -R * 0.5, R * 2, R);
    ctx.restore();
  }

  if (id !== 0) {
    ctx.beginPath();
    ctx.arc(0, 0, R * 0.5, 0, Math.PI * 2);
    ctx.fillStyle = '#f4f1e8';
    ctx.fill();
    ctx.fillStyle = '#20242c';
    ctx.font = `bold ${id > 9 ? 7 : 8}px system-ui, sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(String(id), 0, 0.5);
  }

  const shine = ctx.createRadialGradient(-R * 0.38, -R * 0.5, 0.5, -R * 0.38, -R * 0.5, R * 0.9);
  shine.addColorStop(0, 'rgba(255,255,255,0.7)');
  shine.addColorStop(0.3, 'rgba(255,255,255,0.1)');
  shine.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.beginPath();
  ctx.arc(0, 0, R, 0, Math.PI * 2);
  ctx.fillStyle = shine;
  ctx.fill();
  ctx.restore();
}

function drawCueStick(cue, dirX, dirY, power, charging, alpha) {
  const pull = charging ? 14 + power * 70 : 12;
  const tipD = R + pull;
  const buttD = tipD + 245;
  const tx = cue.x - dirX * tipD;
  const ty = cue.y - dirY * tipD;
  const bx = cue.x - dirX * buttD;
  const by = cue.y - dirY * buttD;
  ctx.save();
  ctx.translate(RAIL, RAIL);
  ctx.globalAlpha = alpha;
  const grad = ctx.createLinearGradient(tx, ty, bx, by);
  grad.addColorStop(0, '#e9dfc6');
  grad.addColorStop(0.06, '#d9b47c');
  grad.addColorStop(0.6, '#a76b34');
  grad.addColorStop(1, '#53341c');
  ctx.strokeStyle = grad;
  ctx.lineWidth = 5;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(tx, ty);
  ctx.lineTo(bx, by);
  ctx.stroke();
  // ponteira azul (giz)
  ctx.beginPath();
  ctx.arc(tx, ty, 2.7, 0, Math.PI * 2);
  ctx.fillStyle = '#5b8fc7';
  ctx.fill();
  ctx.restore();
}

function drawAim(dirX, dirY, power, charging, dim) {
  const cue = state.balls[0];
  if (cue.pocketed) return;
  const pred = predictShot(state.balls, cue, dirX, dirY);
  const alpha = dim ? 0.45 : 1;

  drawCueStick(cue, dirX, dirY, power, charging, alpha * 0.95);

  if (!pred) return;
  ctx.save();
  ctx.translate(RAIL, RAIL);
  ctx.globalAlpha = alpha;

  ctx.setLineDash([7, 7]);
  ctx.strokeStyle = 'rgba(255,255,255,0.75)';
  ctx.lineWidth = 1.6;
  ctx.beginPath();
  ctx.moveTo(cue.x + dirX * (R + 2), cue.y + dirY * (R + 2));
  ctx.lineTo(pred.x, pred.y);
  ctx.stroke();
  ctx.setLineDash([]);

  // bola fantasma no ponto de contato
  ctx.beginPath();
  ctx.arc(pred.x, pred.y, R, 0, Math.PI * 2);
  ctx.strokeStyle = 'rgba(255,255,255,0.8)';
  ctx.lineWidth = 1.4;
  ctx.stroke();

  // direção prevista da bola alvo
  if (pred.ballId != null) {
    const target = state.balls[pred.ballId];
    ctx.strokeStyle = 'rgba(255,255,255,0.5)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(target.x, target.y);
    ctx.lineTo(target.x + pred.tx * 44, target.y + pred.ty * 44);
    ctx.stroke();
  }
  ctx.restore();

  if (charging) drawPowerBar(power, alpha);
}

function drawPowerBar(power, alpha) {
  const bw = 190;
  const bh = 10;
  const bx = RAIL + W / 2 - bw / 2;
  const by = TH - RAIL / 2 - bh / 2 + 8;
  ctx.save();
  ctx.globalAlpha = alpha;
  roundRect(bx, by, bw, bh, 5);
  ctx.fillStyle = 'rgba(0,0,0,0.45)';
  ctx.fill();
  if (power > 0.01) {
    const grad = ctx.createLinearGradient(bx, 0, bx + bw, 0);
    grad.addColorStop(0, '#37b96c');
    grad.addColorStop(0.55, '#e3c53a');
    grad.addColorStop(1, '#d8342c');
    roundRect(bx + 1.5, by + 1.5, (bw - 3) * power, bh - 3, 3.5);
    ctx.fillStyle = grad;
    ctx.fill();
  }
  ctx.strokeStyle = 'rgba(255,255,255,0.4)';
  ctx.lineWidth = 1;
  roundRect(bx, by, bw, bh, 5);
  ctx.stroke();
  ctx.restore();
}

function render() {
  const now = performance.now();
  ctx.clearRect(0, 0, TW, TH);
  drawTable();

  const animating = shooting || remoteShooting;
  if (canAim() && (pointer.inside || aim.charging)) {
    if (aim.charging) {
      drawAim(aim.dirX, aim.dirY, aim.power, true, false);
    } else {
      const cue = state.balls[0];
      const dx = pointer.x - cue.x;
      const dy = pointer.y - cue.y;
      const d = Math.hypot(dx, dy);
      if (d > 4) drawAim(dx / d, dy / d, 0, false, false);
    }
  } else if (remoteAim && !myTurn() && !animating && !state.ballInHand && !state.over) {
    drawAim(remoteAim.dx, remoteAim.dy, remoteAim.pow, remoteAim.ch, true);
  }

  // bolas afundando nas caçapas
  for (const [id, s] of sinkAnims) {
    const t = (now - s.t0) / 380;
    if (t >= 1) {
      sinkAnims.delete(id);
      continue;
    }
    const ease = t * t * (3 - 2 * t);
    const x = s.x0 + (s.px - s.x0) * ease;
    const y = s.y0 + (s.py - s.y0) * ease;
    drawBall(x, y, id, 1 - ease * 0.9, 1 - ease * 0.65);
  }

  for (const b of state.balls) {
    if (b.pocketed || b.id === 0) continue;
    drawBall(b.x, b.y, b.id);
  }
  const cue = state.balls[0];
  if (!cue.pocketed && !state.ballInHand) drawBall(cue.x, cue.y, 0);

  if (state.ballInHand && ghostCue) {
    ctx.save();
    if (!ghostCue.remote && !ghostCue.valid) ctx.filter = 'grayscale(1) brightness(1.2)';
    drawBall(ghostCue.x, ghostCue.y, 0, 0.55);
    ctx.restore();
  } else if (state.ballInHand && !cue.pocketed) {
    drawBall(cue.x, cue.y, 0, 0.55);
  }
}

// ---------- Loop principal ----------
let last = performance.now();
let acc = 0;
const STEP_DT = 1 / 240;

function loop(now) {
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;
  if (shooting) {
    acc += dt;
    let n = 0;
    while (acc >= STEP_DT && n < 60) {
      step(state.balls, STEP_DT, ev);
      acc -= STEP_DT;
      n++;
    }
    drainShotEvents();
    sendFrame(false);
    if (allStopped(state.balls)) finishShot();
  } else {
    acc = 0;
  }
  render();
  requestAnimationFrame(loop);
}

// ---------- Ações do menu ----------
$('btn-local').addEventListener('click', () => {
  ensureAudio();
  mode = 'local';
  const n = myName();
  names = [n === 'Jogador' ? 'Jogador 1' : n, 'Jogador 2'];
  state = makeInitialState(0, names);
  startGame();
});

$('btn-create').addEventListener('click', () => {
  ensureAudio();
  mode = 'host';
  mySeat = 0;
  names = [myName(), 'Jogador 2'];
  roomCode = makeRoomCode();
  els.waitCode.textContent = roomCode;
  showPanel('wait');
  net = makeNet();
  net.host(roomCode);
});

$('btn-join').addEventListener('click', () => {
  ensureAudio();
  const code = els.code.value.trim().toUpperCase();
  if (code.length < 4) {
    setStatus('error', 'Digite o código da sala (5 letras/números).');
    return;
  }
  mode = 'guest';
  mySeat = 1;
  names = ['Jogador 1', myName()];
  roomCode = code;
  net = makeNet();
  net.join(code);
});

$('btn-copy-wait').addEventListener('click', async () => {
  try {
    await navigator.clipboard.writeText(inviteLink());
    toast('Link copiado! Envie para seu amigo.');
  } catch (_) {
    toast('Copie o código: ' + roomCode);
  }
});

$('btn-cancel-wait').addEventListener('click', () => {
  if (net) net.close();
  net = null;
  mode = 'menu';
  setStatus('', '');
  showPanel('main');
});

$('btn-copy').addEventListener('click', async () => {
  try {
    await navigator.clipboard.writeText(inviteLink());
    toast('Link copiado!');
  } catch (_) {
    toast('Código da sala: ' + roomCode);
  }
});

$('btn-leave').addEventListener('click', () => {
  if (net) {
    net.send({ t: 'bye' });
    net.close();
  }
  location.href = location.pathname;
});

els.btnRematch.addEventListener('click', () => {
  if (mode === 'guest') {
    net.send({ t: 'wr' });
    els.btnRematch.disabled = true;
    els.btnRematch.textContent = 'Aguardando o anfitrião…';
  } else {
    doRematch();
  }
});

$('btn-menu').addEventListener('click', () => {
  if (net) {
    net.send({ t: 'bye' });
    net.close();
  }
  location.href = location.pathname;
});

window.addEventListener('beforeunload', () => {
  if (net) net.send({ t: 'bye' });
});

// ---------- Inicialização ----------
function setupCanvas() {
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  canvas.width = TW * dpr;
  canvas.height = TH * dpr;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
}
window.addEventListener('resize', setupCanvas);
setupCanvas();

const params = new URLSearchParams(location.search);
const salaParam = (params.get('sala') || '').toUpperCase();
if (salaParam) {
  els.code.value = salaParam;
  $('btn-join').classList.add('primary');
}

requestAnimationFrame(loop);

// gancho somente-leitura para depuração/testes automatizados
window.__sinuca = {
  get state() { return state; },
  get shooting() { return shooting; },
  get mode() { return mode; },
  get specCount() { return specCount; },
  get aim() { return aim; },
};
