import {
  W, H, RAIL, R, POCKETS, MAX_SHOT_SPEED,
  step, allStopped, predictShot, validCuePosition,
} from './physics.js';
import {
  makeInitialState, evaluateShot, serializeState, deserializeState,
  remaining, isSolid,
} from './rules.js';
import { Net, makeRoomCode } from './net.js';

const TW = W + RAIL * 2;
const TH = H + RAIL * 2;

const COLORS = {
  1: '#f6c445', 2: '#2f6fd0', 3: '#d8342c', 4: '#7e3f9d',
  5: '#ef7d20', 6: '#2e9d5b', 7: '#8d3b2f', 8: '#20242c',
};
const ballColor = (id) => COLORS[id > 8 ? id - 8 : id];

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
  end: $('end'), endMsg: $('end-msg'), btnRematch: $('btn-rematch'),
  toast: $('toast'),
  cards: [
    { root: $('card-0'), name: $('name-0'), group: $('group-0'), balls: $('balls-0') },
    { root: $('card-1'), name: $('name-1'), group: $('group-1'), balls: $('balls-1') },
  ],
};

// ---------- Estado da aplicação ----------
let mode = 'menu'; // menu | local | host | guest
let mySeat = 0;
let names = ['Jogador 1', 'Jogador 2'];
let state = makeInitialState(0, names);
let net = null;
let roomCode = '';
let gameStarted = false;

let shooting = false; // eu estou simulando uma tacada
let remoteShooting = false; // o adversário está simulando
let shotSeat = 0;
let ev = null; // eventos da tacada em curso

let pointer = { x: -999, y: -999, inside: false, down: false };
let remoteAim = null; // {x, y, down}
let ghostCue = null; // prévia da bola na mão (local ou remota)
let lastAimSent = 0;
let lastFrameSent = 0;

const myTurn = () =>
  !state.over && gameStarted && (mode === 'local' || state.turn === mySeat);
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
function drainSounds() {
  if (!ev) return;
  let played = 0;
  for (const s of ev.sounds) {
    if (played++ >= 3) break;
    sfx(s.kind, s.vol);
  }
  ev.sounds.length = 0;
}

// ---------- Ciclo da tacada ----------
function shoot(dirX, dirY, power) {
  const cue = state.balls[0];
  const speed = 150 + power * (MAX_SHOT_SPEED - 150);
  cue.vx = dirX * speed;
  cue.vy = dirY * speed;
  shotSeat = state.turn;
  ev = { firstHit: null, pocketed: [], sounds: [] };
  shooting = true;
  remoteAim = null;
  sfx('click', 0.4 + power * 0.6);
}

function finishShot() {
  shooting = false;
  sendFrame(true);
  evaluateShot(state, shotSeat, ev, names);
  ev = null;
  if (net) net.send({ t: 'e', s: serializeState(state) });
  updateHud();
  if (state.over) showEnd(state.msg);
}

function sendFrame(force) {
  if (!net || !net.connected) return;
  const now = performance.now();
  if (!force && now - lastFrameSent < 40) return;
  lastFrameSent = now;
  net.send({
    t: 'f',
    b: state.balls.map((b) => [
      Math.round(b.x * 10) / 10,
      Math.round(b.y * 10) / 10,
      b.pocketed ? 1 : 0,
    ]),
  });
}

// ---------- Rede ----------
function makeNet() {
  return new Net({
    onMessage: handleMessage,
    onOpen: () => {
      if (mode === 'guest') net.send({ t: 'hello', name: names[1] });
    },
    onClose: () => {
      if (gameStarted) {
        showEnd('O outro jogador saiu da partida.', true);
      } else if (mode === 'guest') {
        setStatus('error', 'Não foi possível entrar: sala cheia ou indisponível.');
        showPanel('main');
      }
    },
    onStatus: setStatus,
  });
}

function handleMessage(m) {
  if (!m || typeof m !== 'object') return;
  switch (m.t) {
    case 'hello': // host: convidado chegou
      if (mode !== 'host' || gameStarted) return;
      names[1] = String(m.name || 'Jogador 2').slice(0, 14) || 'Jogador 2';
      state = makeInitialState(0, names);
      net.send({ t: 'welcome', n: names, s: serializeState(state) });
      startGame();
      break;
    case 'welcome': // guest: partida começou
      if (mode !== 'guest') return;
      names = m.n;
      state = deserializeState(m.s);
      startGame();
      break;
    case 'a': // prévia de mira do adversário
      remoteAim = m.off ? null : { x: m.x, y: m.y, down: !!m.d };
      break;
    case 'f': { // quadro de animação da tacada do adversário
      remoteShooting = true;
      remoteAim = null;
      for (let i = 0; i < m.b.length && i < state.balls.length; i++) {
        const b = state.balls[i];
        const [x, y, p] = m.b[i];
        b.x = x; b.y = y;
        if (p && !b.pocketed) {
          b.pocketed = true;
          sfx('pocket', 1);
        }
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
    case 'wr': // convidado pediu revanche — anfitrião aceita
      if (mode === 'host') doRematch();
      break;
    case 'r': // anfitrião reiniciou
      state = deserializeState(m.s);
      remoteShooting = false;
      ghostCue = null;
      hideEnd();
      updateHud();
      break;
    case 'bye':
      showEnd('O outro jogador saiu da partida.', true);
      break;
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
  setTimeout(() => els.toast.classList.remove('show'), 1800);
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
  els.btnRematch.classList.toggle('hidden', !!disconnected);
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
  if (mode === 'host' && net) net.send({ t: 'r', s: serializeState(state) });
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
    if (state.ballInHand && myTurn()) {
      hint = 'Bola na mão: toque na mesa para posicionar a branca.';
    } else if (myTurn() && !shooting && !remoteShooting) {
      hint = 'Arraste a partir da branca para mirar — quanto mais longe, mais força. Solte para tacar.';
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
        net.send({ t: 'ph', x: p.x, y: p.y });
      }
    }
  } else if (canAim() && net && net.connected) {
    const now = performance.now();
    if (now - lastAimSent > 60) {
      lastAimSent = now;
      net.send({ t: 'a', x: p.x, y: p.y, d: pointer.down ? 1 : 0 });
    }
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
  e.preventDefault();
});

canvas.addEventListener('pointerup', (e) => {
  const p = toPlay(e);
  pointer.x = p.x;
  pointer.y = p.y;
  const wasDown = pointer.down;
  pointer.down = false;
  if (!wasDown || !gameStarted || state.over) return;

  if (state.ballInHand && myTurn()) {
    if (validCuePosition(state.balls, p.x, p.y)) {
      const cue = state.balls[0];
      cue.pocketed = false;
      cue.x = p.x; cue.y = p.y;
      cue.vx = 0; cue.vy = 0;
      state.ballInHand = false;
      ghostCue = null;
      if (net) net.send({ t: 'pf', x: p.x, y: p.y });
      updateHud();
    }
    return;
  }

  if (canAim()) {
    const cue = state.balls[0];
    const dx = p.x - cue.x;
    const dy = p.y - cue.y;
    const dist = Math.hypot(dx, dy);
    const power = Math.min(1, Math.max(0, (dist - 25) / 300));
    if (power >= 0.05) {
      shoot(dx / dist, dy / dist, power);
      if (net && net.connected) net.send({ t: 'a', off: true });
      updateHud();
    }
  }
});

canvas.addEventListener('pointerleave', () => {
  pointer.inside = false;
  if (net && net.connected && canAim()) net.send({ t: 'a', off: true });
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

function drawTable() {
  // moldura de madeira
  const wood = ctx.createLinearGradient(0, 0, 0, TH);
  wood.addColorStop(0, '#7b4a22');
  wood.addColorStop(1, '#5d3618');
  ctx.fillStyle = wood;
  roundRect(0, 0, TW, TH, 22);
  ctx.fill();

  // feltro
  const feltPad = 14;
  ctx.fillStyle = '#0c6b4a';
  roundRect(RAIL - feltPad, RAIL - feltPad, W + feltPad * 2, H + feltPad * 2, 10);
  ctx.fill();
  const felt = ctx.createRadialGradient(
    RAIL + W / 2, RAIL + H / 2, 60,
    RAIL + W / 2, RAIL + H / 2, W * 0.62
  );
  felt.addColorStop(0, 'rgba(255,255,255,0.05)');
  felt.addColorStop(1, 'rgba(0,0,0,0.16)');
  ctx.fillStyle = felt;
  roundRect(RAIL - feltPad, RAIL - feltPad, W + feltPad * 2, H + feltPad * 2, 10);
  ctx.fill();

  // linha da cabeceira + ponto do triângulo
  ctx.strokeStyle = 'rgba(255,255,255,0.14)';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(RAIL + W * 0.25, RAIL + 6);
  ctx.lineTo(RAIL + W * 0.25, RAIL + H - 6);
  ctx.stroke();
  ctx.fillStyle = 'rgba(255,255,255,0.18)';
  ctx.beginPath();
  ctx.arc(RAIL + W * 0.72, RAIL + H / 2, 3, 0, Math.PI * 2);
  ctx.fill();

  // marcas nos trilhos
  ctx.fillStyle = 'rgba(240,220,180,0.5)';
  for (let i = 1; i < 8; i++) {
    if (i === 4) continue;
    const x = RAIL + (W * i) / 8;
    ctx.beginPath(); ctx.arc(x, RAIL / 2 - 4, 2.5, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.arc(x, TH - RAIL / 2 + 4, 2.5, 0, Math.PI * 2); ctx.fill();
  }
  for (let i = 1; i < 4; i++) {
    const y = RAIL + (H * i) / 4;
    ctx.beginPath(); ctx.arc(RAIL / 2 - 4, y, 2.5, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.arc(TW - RAIL / 2 + 4, y, 2.5, 0, Math.PI * 2); ctx.fill();
  }

  // caçapas
  for (const p of POCKETS) {
    ctx.beginPath();
    ctx.arc(RAIL + p.x, RAIL + p.y, p.r - 3, 0, Math.PI * 2);
    ctx.fillStyle = '#08090c';
    ctx.fill();
    ctx.strokeStyle = 'rgba(0,0,0,0.55)';
    ctx.lineWidth = 5;
    ctx.stroke();
  }
}

function drawBall(x, y, id, alpha = 1) {
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.translate(RAIL + x, RAIL + y);

  ctx.beginPath();
  ctx.ellipse(1.5, 2.5, R, R * 0.85, 0, 0, Math.PI * 2);
  ctx.fillStyle = 'rgba(0,0,0,0.28)';
  ctx.fill();

  ctx.beginPath();
  ctx.arc(0, 0, R, 0, Math.PI * 2);
  if (id === 0) {
    ctx.fillStyle = '#f4f1e8';
    ctx.fill();
  } else if (id <= 8) {
    ctx.fillStyle = ballColor(id);
    ctx.fill();
  } else {
    ctx.fillStyle = '#f4f1e8';
    ctx.fill();
    ctx.save();
    ctx.clip();
    ctx.fillStyle = ballColor(id);
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

  const shine = ctx.createRadialGradient(-R * 0.35, -R * 0.45, 1, -R * 0.35, -R * 0.45, R);
  shine.addColorStop(0, 'rgba(255,255,255,0.55)');
  shine.addColorStop(0.35, 'rgba(255,255,255,0.08)');
  shine.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.beginPath();
  ctx.arc(0, 0, R, 0, Math.PI * 2);
  ctx.fillStyle = shine;
  ctx.fill();
  ctx.restore();
}

function drawAim(px, py, down, dim) {
  const cue = state.balls[0];
  if (cue.pocketed) return;
  const dx = px - cue.x;
  const dy = py - cue.y;
  const dist = Math.hypot(dx, dy);
  if (dist < 4) return;
  const dirX = dx / dist;
  const dirY = dy / dist;
  const pred = predictShot(state.balls, cue, dirX, dirY);
  if (!pred) return;

  const alpha = dim ? 0.4 : 1;
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

  // medidor de força ao redor da branca
  if (down) {
    const power = Math.min(1, Math.max(0, (dist - 25) / 300));
    if (power > 0) {
      const hue = 120 - power * 120;
      ctx.strokeStyle = `hsl(${hue} 85% 55%)`;
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.arc(cue.x, cue.y, R + 7, -Math.PI / 2, -Math.PI / 2 + power * Math.PI * 2);
      ctx.stroke();
    }
  }
  ctx.restore();
}

function render() {
  ctx.clearRect(0, 0, TW, TH);
  drawTable();

  if (canAim() && pointer.inside) {
    drawAim(pointer.x, pointer.y, pointer.down, false);
  } else if (remoteAim && !myTurn() && !remoteShooting && !state.ballInHand) {
    drawAim(remoteAim.x, remoteAim.y, remoteAim.down, true);
  }

  for (const b of state.balls) {
    if (b.pocketed || b.id === 0) continue;
    drawBall(b.x, b.y, b.id);
  }
  const cue = state.balls[0];
  if (!cue.pocketed && !state.ballInHand) drawBall(cue.x, cue.y, 0);

  if (state.ballInHand && ghostCue) {
    ctx.save();
    if (!ghostCue.remote && !ghostCue.valid) ctx.filter = 'grayscale(1)';
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
    drainSounds();
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
};
