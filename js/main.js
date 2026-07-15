// Hub de Jogos P2P: sala → lobby (escolha de modo e jogos) → partidas com
// placar. O anfitrião é o hub da sala: retransmite mensagens de jogo para os
// espectadores e arbitra o fluxo de partidas do torneio.
import { Net, makeRoomCode } from './net.js';
import { Directory } from './dir.js';
import { GAMES, gameById } from './games/index.js';
import { ensureAudio, sfx } from './engine.js';

const CW = 968;
const CH = 528;
const MAX_SPECTATORS = 8;

// ---------- DOM ----------
const $ = (id) => document.getElementById(id);
const canvas = $('table');
const ctx = canvas.getContext('2d');
const els = {
  menu: $('menu'),
  name: $('inp-name'), code: $('inp-code'), status: $('net-status'),
  roomsList: $('rooms-list'), roomsFilter: $('rooms-filter'), roomsStatus: $('rooms-status'), roomsKind: $('rooms-kind'),
  lobby: $('lobby'), lobbyCode: $('lobby-code'), lobbyPlayers: $('lobby-players'), lobbySpec: $('lobby-spec'),
  gamesGrid: $('games-grid'), btnStart: $('btn-start'), lobbyHint: $('lobby-hint'), chkPublic: $('chk-public'),
  modeBtns: [$('btn-mode-casual'), $('btn-mode-torneio')],
  game: $('game'), hud: $('hud'), msg: $('msg'), hint: $('hint'), tourney: $('tourney'), actions: $('actions'),
  roomChip: $('room-chip'), roomCode: $('room-code'), specChip: $('spec-chip'), specN: $('spec-n'),
  inter: $('inter'), interTitle: $('inter-title'), interBoard: $('inter-board'), interBtns: $('inter-btns'),
  final: $('final'), finalTitle: $('final-title'), finalBoard: $('final-board'), finalBtns: $('final-btns'),
  end: $('end'), endMsg: $('end-msg'),
  toast: $('toast'),
  cards: [
    { root: $('card-0'), name: $('name-0'), sub: $('sub-0') },
    { root: $('card-1'), name: $('name-1'), sub: $('sub-1') },
  ],
};

// ---------- Estado ----------
let mode = 'menu'; // menu | local | host | guest | spectator
let mySeat = 0;
let names = ['Jogador 1', 'Jogador 2'];
let net = null;
let roomCode = '';
let inRoom = false;
let phase = 'lobby'; // lobby | playing | inter | final
let cfg = { mode: 'casual', games: ['sinuca'] };
let board = []; // [{game, winner, line}]
let matchIdx = 0;
let currentGameId = null;
let inst = null;
let instAlive = null; // {ok:true} da instância atual

let playerConnId = null;
const spectatorIds = new Set();
let specCount = 0;
let directory = null;
let roomsTimer = null;

const isHostLike = () => mode === 'host' || mode === 'local';

// ---------- Utilidades de UI ----------
function toast(text) {
  els.toast.textContent = text;
  els.toast.classList.add('show');
  clearTimeout(toast._t);
  toast._t = setTimeout(() => els.toast.classList.remove('show'), 2400);
}

function myName() {
  return els.name.value.trim().slice(0, 14) || 'Jogador';
}

function setStatus(kind, text) {
  els.status.textContent = text || '';
  els.status.className = kind || '';
}

function show(section) {
  // section: 'menu' | 'lobby' | 'game'
  els.menu.classList.toggle('hidden', section !== 'menu');
  els.lobby.classList.toggle('hidden', section !== 'lobby');
  els.game.classList.toggle('hidden', section !== 'game');
  document.body.classList.toggle('in-game', section === 'game');
}

function inviteLink() {
  return `${location.origin}${location.pathname}?sala=${roomCode}`;
}

// ---------- Diretório de salas ----------
function ensureDirectory() {
  if (!directory) directory = new Directory();
  return directory;
}

function announceRoom() {
  if (mode !== 'host' || !inRoom) return;
  const d = ensureDirectory();
  if (!els.chkPublic.checked) {
    d.unannounce();
    return;
  }
  const gameName = cfg.mode === 'torneio'
    ? `Torneio (${cfg.games.length} jogos)`
    : (gameById(cfg.games[0])?.name || 'A escolher');
  d.announce({
    code: roomCode,
    host: names[0],
    mode: cfg.mode,
    game: gameName,
    players: playerConnId !== null ? 2 : 1,
    spec: specCount,
    status: phase === 'lobby' ? 'lobby' : 'playing',
  });
}

function refreshRooms() {
  const d = ensureDirectory();
  els.roomsStatus.textContent = 'Procurando salas…';
  d.list((rooms, err) => {
    if (mode !== 'menu') return;
    if (err || rooms === null) {
      els.roomsStatus.textContent = err || 'Sem resposta.';
      return;
    }
    renderRooms(rooms);
  });
}

let lastRooms = [];
function renderRooms(rooms) {
  if (rooms) lastRooms = rooms;
  const q = els.roomsFilter.value.trim().toLowerCase();
  const kind = els.roomsKind.value;
  const list = lastRooms.filter((r) => {
    if (kind === 'lobby' && (r.status !== 'lobby' || r.players >= 2)) return false;
    if (kind === 'playing' && r.status !== 'playing') return false;
    if (!q) return true;
    return `${r.code} ${r.host} ${r.game} ${r.mode}`.toLowerCase().includes(q);
  });
  els.roomsStatus.textContent = list.length
    ? `${list.length} sala(s) encontrada(s)`
    : lastRooms.length ? 'Nenhuma sala bate com o filtro.' : 'Nenhuma sala ativa agora. Crie a primeira!';
  els.roomsList.innerHTML = '';
  for (const r of list) {
    const row = document.createElement('div');
    row.className = 'room-row';
    const vaga = r.players < 2;
    row.innerHTML = `
      <div class="room-info">
        <b>${esc(r.code)}</b> · ${esc(r.host)}
        <span class="muted">${r.mode === 'torneio' ? '🏆 Torneio' : '🎲 Casual'} · ${esc(r.game)}
        · ${r.players}/2${r.spec ? ` · 👁 ${r.spec}` : ''} · ${r.status === 'lobby' ? 'no lobby' : 'jogando'}</span>
      </div>
      <button class="small ${vaga ? 'primary' : ''}">${vaga ? 'Entrar' : 'Assistir'}</button>`;
    row.querySelector('button').addEventListener('click', () => {
      els.code.value = r.code;
      joinRoom(r.code);
    });
    els.roomsList.appendChild(row);
  }
}

function esc(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

// ---------- Rede ----------
function makeNet() {
  return new Net({
    onMessage: handleMessage,
    onOpen: () => {
      if (mode === 'guest') net.send({ t: 'hello', name: names[1] });
    },
    onConnClose: (connId) => {
      if (mode === 'host') {
        if (connId === playerConnId) {
          playerConnId = null;
          if (inRoom) {
            if (phase === 'lobby') {
              names[1] = 'Jogador 2';
              renderLobby();
              toast('O jogador saiu da sala.');
              announceRoom();
            } else {
              showEnd('O outro jogador saiu da partida.');
            }
          }
        } else if (spectatorIds.delete(connId)) {
          setSpectators(spectatorIds.size);
        }
      } else if (inRoom) {
        showEnd(mode === 'spectator' ? 'A sala foi encerrada.' : 'A conexão com a sala caiu.');
      } else if (mode === 'guest') {
        setStatus('error', 'Não foi possível entrar na sala.');
        mode = 'menu';
      }
    },
    onStatus: setStatus,
    onCodeChange: (fresh) => {
      roomCode = fresh;
      els.lobbyCode.textContent = fresh;
      els.roomCode.textContent = fresh;
    },
  });
}

function setSpectators(n) {
  specCount = n;
  updateSpecUi();
  if (mode === 'host') {
    broadcast({ t: 'spec', n });
    announceRoom();
  }
}

function updateSpecUi() {
  els.specChip.classList.toggle('hidden', specCount <= 0);
  els.specN.textContent = specCount;
  els.lobbySpec.textContent = specCount > 0 ? `👁 ${specCount} espectador(es)` : '';
}

function broadcast(msg) {
  if (net && net.connected) net.send(msg);
}

function welcomePayload(role) {
  return {
    t: 'welcome',
    role,
    n: names,
    spec: specCount,
    phase,
    cfg,
    board,
    idx: matchIdx,
    game: currentGameId,
    gsnap: phase === 'playing' && inst && inst.snapshot ? inst.snapshot() : null,
  };
}

function handleMessage(m, connId) {
  if (!m || typeof m !== 'object') return;
  if (mode === 'host') handleHostMessage(m, connId);
  else handleClientMessage(m);
}

function handleHostMessage(m, connId) {
  if (m.t === 'hello') {
    const name = String(m.name || '').slice(0, 14);
    if (playerConnId === null && phase === 'lobby') {
      playerConnId = connId;
      names[1] = name || 'Jogador 2';
      net.sendTo(connId, welcomePayload('player'));
      renderLobby();
      toast(`${names[1]} entrou na sala!`);
      sfx('score', 0.5);
      announceRoom();
    } else if (spectatorIds.size < MAX_SPECTATORS) {
      spectatorIds.add(connId);
      net.sendTo(connId, welcomePayload('spectator'));
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
    return;
  }
  // mensagens do jogador
  switch (m.t) {
    case 'bye':
      playerConnId = null;
      if (phase === 'lobby') {
        names[1] = 'Jogador 2';
        renderLobby();
        toast('O jogador saiu da sala.');
        announceRoom();
      } else {
        showEnd('O outro jogador saiu da partida.');
      }
      break;
    case 'g':
      net.sendExcept(connId, m); // repassa aos espectadores
      if (inst && phase !== 'lobby') inst.msg(m.p);
      break;
    case 'gres':
      applyResult(m.idx, m.winner, m.line);
      break;
  }
}

function handleClientMessage(m) {
  switch (m.t) {
    case 'welcome':
      names = m.n;
      specCount = m.spec || 0;
      cfg = m.cfg;
      board = m.board || [];
      if (m.role === 'spectator') {
        mode = 'spectator';
        mySeat = -1;
      }
      inRoom = true;
      enterRoomUi();
      if (m.phase === 'playing' && m.game) {
        startMatch(m.idx, m.game, m.gsnap);
      } else if (m.phase === 'inter') {
        matchIdx = m.idx;
        currentGameId = m.game;
        showInter();
      } else if (m.phase === 'final') {
        showFinal();
      } else {
        showLobby();
      }
      if (mode === 'spectator') toast('Você entrou como espectador 👁');
      updateSpecUi();
      break;
    case 'full':
      setStatus('error', 'Sala cheia (jogo + espectadores). Tente outra.');
      if (net) net.close();
      net = null;
      mode = 'menu';
      break;
    case 'spec':
      specCount = m.n;
      updateSpecUi();
      break;
    case 'cfg':
      cfg = m.cfg;
      if (phase === 'lobby') renderLobby();
      break;
    case 'ms':
      startMatch(m.idx, m.game, null);
      break;
    case 'g':
      if (inst && phase !== 'lobby') inst.msg(m.p);
      break;
    case 'gend':
      board[m.idx] = { game: currentGameId, winner: m.winner, line: m.line };
      phase = 'inter';
      showInter();
      break;
    case 'final':
      showFinal();
      break;
    case 'lobby':
      backToLobby();
      break;
    case 'bye':
      showEnd(mode === 'spectator' ? 'A sala foi encerrada.' : 'O outro jogador saiu da partida.');
      break;
  }
}

// ---------- Fluxo de sala ----------
function createRoom() {
  ensureAudio();
  if (net) net.close();
  mode = 'host';
  mySeat = 0;
  names = [myName(), 'Jogador 2'];
  roomCode = makeRoomCode();
  inRoom = true;
  phase = 'lobby';
  board = [];
  net = makeNet();
  net.host(roomCode);
  enterRoomUi();
  showLobby();
  announceRoom();
}

function joinRoom(code) {
  ensureAudio();
  code = (typeof code === 'string' ? code : els.code.value).trim().toUpperCase();
  if (code.length < 4) {
    setStatus('error', 'Digite o código da sala (5 letras/números).');
    return;
  }
  if (net) net.close();
  mode = 'guest';
  mySeat = 1;
  names = ['Jogador 1', myName()];
  roomCode = code;
  net = makeNet();
  net.join(code);
}

function startLocal() {
  ensureAudio();
  mode = 'local';
  mySeat = 0;
  const n = myName();
  names = [n === 'Jogador' ? 'Jogador 1' : n, 'Jogador 2'];
  inRoom = true;
  phase = 'lobby';
  board = [];
  enterRoomUi();
  showLobby();
}

function enterRoomUi() {
  stopRoomsPolling();
  if (mode !== 'local') {
    els.roomChip.classList.remove('hidden');
    els.roomCode.textContent = roomCode;
  } else {
    els.roomChip.classList.add('hidden');
  }
  updateSpecUi();
}

function leaveRoom() {
  if (net) {
    net.send({ t: 'bye' });
    net.close();
  }
  if (directory) directory.unannounce();
  location.href = location.pathname;
}

// ---------- Lobby ----------
function showLobby() {
  phase = 'lobby';
  destroyInst();
  hideOverlays();
  show('lobby');
  renderLobby();
  announceRoom();
}

function backToLobby() {
  board = [];
  showLobby();
}

function renderLobby() {
  const canEdit = isHostLike();
  els.lobbyCode.textContent = mode === 'local' ? 'LOCAL' : roomCode;
  $('btn-copy-lobby').classList.toggle('hidden', mode === 'local');
  $('lobby-public-row').classList.toggle('hidden', mode !== 'host');

  const p2 = mode === 'local' || mode === 'guest' || playerConnId !== null || mode === 'spectator';
  els.lobbyPlayers.innerHTML = `
    <span class="pill p1">🟠 ${esc(names[0])}${mySeat === 0 && mode !== 'local' ? ' (você)' : ''}</span>
    <span class="pill ${p2 ? 'p2' : 'empty'}">${p2 ? `🔵 ${esc(names[1])}${mySeat === 1 ? ' (você)' : ''}` : '💤 aguardando jogador…'}</span>`;

  els.modeBtns[0].classList.toggle('sel', cfg.mode === 'casual');
  els.modeBtns[1].classList.toggle('sel', cfg.mode === 'torneio');
  els.modeBtns.forEach((b) => { b.disabled = !canEdit; });

  els.gamesGrid.innerHTML = '';
  for (const g of GAMES) {
    const card = document.createElement('button');
    card.className = 'game-card';
    const selIdx = cfg.games.indexOf(g.id);
    const blocked = mode === 'local' && !g.local;
    if (selIdx >= 0) card.classList.add('sel');
    if (blocked) card.classList.add('blocked');
    card.innerHTML = `
      <span class="g-icon">${g.icon}</span>
      <span class="g-name">${g.name}</span>
      <span class="g-desc">${blocked ? 'Somente online' : g.desc}</span>
      ${cfg.mode === 'torneio' && selIdx >= 0 ? `<span class="g-order">${selIdx + 1}º</span>` : ''}`;
    if (canEdit && !blocked) {
      card.addEventListener('click', () => {
        if (cfg.mode === 'casual') {
          cfg.games = [g.id];
        } else if (selIdx >= 0) {
          cfg.games.splice(selIdx, 1);
        } else {
          cfg.games.push(g.id);
        }
        pushCfg();
        renderLobby();
      });
    } else {
      card.disabled = true;
    }
    els.gamesGrid.appendChild(card);
  }

  const need = cfg.mode === 'torneio' ? 2 : 1;
  const okGames = cfg.mode === 'torneio' ? cfg.games.length >= need : cfg.games.length === 1;
  const okPlayers = mode === 'local' || mode !== 'host' || playerConnId !== null;
  els.btnStart.classList.toggle('hidden', !canEdit);
  els.btnStart.disabled = !(okGames && okPlayers);
  if (!canEdit) {
    els.lobbyHint.textContent = mode === 'spectator'
      ? '👁 Você é espectador. O anfitrião escolhe o modo e os jogos.'
      : 'O anfitrião escolhe o modo e os jogos. Aguarde o início!';
  } else if (!okPlayers) {
    els.lobbyHint.textContent = 'Convide alguém: copie o link e envie. A sala também aparece na lista pública.';
  } else if (!okGames) {
    els.lobbyHint.textContent = cfg.mode === 'torneio'
      ? 'Escolha 2 ou mais jogos para o torneio (a ordem dos cliques define a sequência).'
      : 'Escolha 1 jogo para a partida casual.';
  } else {
    els.lobbyHint.textContent = cfg.mode === 'torneio'
      ? `Torneio de ${cfg.games.length} partidas — cada vitória vale 1 ponto no placar.`
      : 'Tudo pronto!';
  }
}

function pushCfg() {
  if (mode === 'host') {
    broadcast({ t: 'cfg', cfg });
    announceRoom();
  }
}

// ---------- Partidas ----------
function makeEnv(idx) {
  const alive = { ok: true };
  instAlive = alive;
  return {
    W: CW,
    H: CH,
    seat: mode === 'spectator' ? -1 : mySeat,
    isLocal: mode === 'local',
    isHost: isHostLike(),
    names,
    idx,
    send(p) {
      if (alive.ok && mode !== 'local' && net) broadcast({ t: 'g', p });
    },
    sendPrivate(p) {
      if (alive.ok && mode === 'host' && playerConnId !== null) net.sendTo(playerConnId, { t: 'g', p });
    },
    setMsg(t) { if (alive.ok) els.msg.textContent = t || ''; },
    setHint(t) { if (alive.ok) els.hint.textContent = t || ''; },
    setSub(seat, html) { if (alive.ok && els.cards[seat]) els.cards[seat].sub.innerHTML = html || ''; },
    setActions(list) {
      if (!alive.ok) return;
      els.actions.innerHTML = '';
      els.actions.classList.toggle('hidden', !list || !list.length);
      for (const b of list || []) {
        const btn = document.createElement('button');
        btn.textContent = b.label;
        btn.disabled = !!b.disabled;
        btn.addEventListener('click', () => { ensureAudio(); b.onClick(); });
        els.actions.appendChild(btn);
      }
    },
    finish(winner, line) {
      if (!alive.ok || phase !== 'playing') return;
      if (mode === 'guest') net.send({ t: 'gres', idx, winner, line });
      else applyResult(idx, winner, line);
    },
    sfx,
    playing: () => alive.ok && phase === 'playing',
  };
}

function destroyInst() {
  if (instAlive) instAlive.ok = false;
  inst = null;
  els.actions.innerHTML = '';
  els.actions.classList.add('hidden');
  els.msg.textContent = '';
  els.hint.textContent = '';
  els.cards[0].sub.innerHTML = '';
  els.cards[1].sub.innerHTML = '';
}

function startMatch(idx, gameId, snap) {
  const mod = gameById(gameId);
  if (!mod) return;
  destroyInst();
  matchIdx = idx;
  currentGameId = gameId;
  phase = 'playing';
  hideOverlays();
  show('game');
  $('btn-abort').classList.toggle('hidden', !isHostLike());
  updateCards();
  inst = mod.create(makeEnv(idx));
  inst.start();
  if (snap) inst.restore(snap);
  updateTourneyLine();
  announceRoom();
}

function hostStart() {
  if (!isHostLike()) return;
  board = [];
  sendMs(0, cfg.games[0]);
}

function sendMs(idx, gameId) {
  broadcast({ t: 'ms', idx, game: gameId });
  startMatch(idx, gameId, null);
}

// resultado autoritativo (anfitrião/local)
function applyResult(idx, winner, line) {
  if (!isHostLike()) return;
  if (phase !== 'playing' || idx !== matchIdx || board[idx]) return;
  board[idx] = { game: currentGameId, winner, line };
  broadcast({ t: 'gend', idx, winner, line });
  phase = 'inter';
  showInter();
  announceRoom();
}

function wins() {
  const w = [0, 0];
  for (const r of board) {
    if (r && r.winner !== null && r.winner !== undefined) w[r.winner]++;
  }
  return w;
}

function boardHtml() {
  if (!board.length) return '';
  const [w0, w1] = wins();
  let rows = board.map((r, i) => {
    if (!r) return '';
    const g = gameById(r.game);
    const res = r.winner === null || r.winner === undefined
      ? '🤝 Empate'
      : `🏅 ${esc(names[r.winner])}`;
    return `<div class="board-row"><span>${i + 1}. ${g ? g.icon + ' ' + g.name : esc(r.game)}</span><span>${res}</span></div>`;
  }).join('');
  return `
    <div class="board-score">${esc(names[0])} <b>${w0} × ${w1}</b> ${esc(names[1])}</div>
    <div class="board-rows">${rows}</div>`;
}

function updateTourneyLine() {
  if (cfg.mode === 'torneio') {
    const [w0, w1] = wins();
    els.tourney.textContent = `🏆 Torneio — partida ${matchIdx + 1}/${cfg.games.length} · ${names[0]} ${w0} × ${w1} ${names[1]}`;
    els.tourney.classList.remove('hidden');
  } else if (board.length > 0) {
    const [w0, w1] = wins();
    els.tourney.textContent = `Série: ${names[0]} ${w0} × ${w1} ${names[1]}`;
    els.tourney.classList.remove('hidden');
  } else {
    els.tourney.classList.add('hidden');
  }
}

function updateCards() {
  for (const seat of [0, 1]) {
    els.cards[seat].name.textContent = names[seat] + (mode !== 'local' && seat === mySeat ? ' (você)' : '');
  }
}

// ---------- Overlays ----------
function hideOverlays() {
  els.inter.classList.add('hidden');
  els.final.classList.add('hidden');
  els.end.classList.add('hidden');
}

function showInter() {
  const r = board[matchIdx];
  els.interTitle.textContent = r ? r.line : 'Fim da partida';
  els.interBoard.innerHTML = boardHtml();
  els.interBtns.innerHTML = '';
  updateTourneyLine();
  if (isHostLike()) {
    const isTourney = cfg.mode === 'torneio';
    const played = board.filter(Boolean).length;
    const more = isTourney && played < cfg.games.length;
    const mk = (label, cls, fn) => {
      const b = document.createElement('button');
      b.textContent = label;
      b.className = cls;
      b.addEventListener('click', () => { ensureAudio(); fn(); });
      els.interBtns.appendChild(b);
    };
    if (isTourney) {
      if (more) mk(`Próxima partida (${gameById(cfg.games[played]).name})`, 'primary big', () => sendMs(played, cfg.games[played]));
      else mk('Ver resultado final 🏆', 'primary big', () => { broadcast({ t: 'final' }); showFinal(); });
    } else {
      mk('Jogar novamente', 'primary big', () => sendMs(board.length, cfg.games[0]));
      const gname = gameById(cfg.games[0]).name;
      void gname;
    }
    mk('Voltar ao lobby', 'ghost', () => { broadcast({ t: 'lobby' }); backToLobby(); });
  } else {
    els.interBtns.innerHTML = '<p class="muted">Aguardando o anfitrião…</p>';
  }
  els.inter.classList.remove('hidden');
  sfx('score', 0.6);
}

function showFinal() {
  phase = 'final';
  const [w0, w1] = wins();
  els.finalTitle.textContent = w0 === w1
    ? `🤝 Torneio empatado: ${w0} × ${w1}!`
    : `🏆 ${names[w0 > w1 ? 0 : 1]} é o campeão do torneio! (${Math.max(w0, w1)} × ${Math.min(w0, w1)})`;
  els.finalBoard.innerHTML = boardHtml();
  els.finalBtns.innerHTML = '';
  if (isHostLike()) {
    const b = document.createElement('button');
    b.textContent = 'Voltar ao lobby';
    b.className = 'primary big';
    b.addEventListener('click', () => { broadcast({ t: 'lobby' }); backToLobby(); });
    els.finalBtns.appendChild(b);
  } else {
    els.finalBtns.innerHTML = '<p class="muted">Aguardando o anfitrião…</p>';
  }
  els.inter.classList.add('hidden');
  els.final.classList.remove('hidden');
  announceRoom();
}

function showEnd(text) {
  els.endMsg.textContent = text;
  els.end.classList.remove('hidden');
  if (net) {
    net.close();
    net = null;
  }
  if (directory) directory.unannounce();
  inRoom = false;
}

// ---------- Entrada ----------
function toCanvas(e) {
  const rect = canvas.getBoundingClientRect();
  return {
    x: ((e.clientX - rect.left) * CW) / rect.width,
    y: ((e.clientY - rect.top) * CH) / rect.height,
  };
}

canvas.addEventListener('pointermove', (e) => {
  if (phase !== 'playing' || !inst) return;
  const p = toCanvas(e);
  inst.pointer('move', p.x, p.y, e.pointerId);
});
canvas.addEventListener('pointerdown', (e) => {
  ensureAudio();
  if (phase !== 'playing' || !inst) return;
  try { canvas.setPointerCapture(e.pointerId); } catch (_) { /* ignore */ }
  const p = toCanvas(e);
  inst.pointer('down', p.x, p.y, e.pointerId);
  e.preventDefault();
});
canvas.addEventListener('pointerup', (e) => {
  if (phase !== 'playing' || !inst) return;
  const p = toCanvas(e);
  inst.pointer('up', p.x, p.y, e.pointerId);
});
canvas.addEventListener('pointercancel', () => {
  if (inst) inst.pointer('up', -999, -999, 0);
});
window.addEventListener('keydown', (e) => {
  if (phase !== 'playing' || !inst) return;
  if (e.target && (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA')) return;
  inst.key('down', e.key);
  if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', ' '].includes(e.key)) e.preventDefault();
});
window.addEventListener('keyup', (e) => {
  if (phase !== 'playing' || !inst) return;
  inst.key('up', e.key);
});

// ---------- Loop ----------
let last = performance.now();
function loop(now) {
  const dt = Math.min(0.04, (now - last) / 1000);
  last = now;
  if (inst) {
    if (phase === 'playing') {
      try { inst.tick(dt); } catch (err) { console.error(err); }
    }
    ctx.clearRect(0, 0, CW, CH);
    try { inst.draw(ctx); } catch (err) { console.error(err); }
  } else {
    ctx.clearRect(0, 0, CW, CH);
  }
  requestAnimationFrame(loop);
}

// ---------- Ações ----------
$('btn-create').addEventListener('click', createRoom);
$('btn-join').addEventListener('click', () => joinRoom());
$('btn-local').addEventListener('click', startLocal);
$('btn-start').addEventListener('click', hostStart);
$('btn-refresh-rooms').addEventListener('click', refreshRooms);
els.roomsFilter.addEventListener('input', () => renderRooms(null));
els.roomsKind.addEventListener('change', () => renderRooms(null));
els.modeBtns[0].addEventListener('click', () => {
  cfg.mode = 'casual';
  cfg.games = cfg.games.slice(0, 1);
  pushCfg();
  renderLobby();
});
els.modeBtns[1].addEventListener('click', () => {
  cfg.mode = 'torneio';
  pushCfg();
  renderLobby();
});
els.chkPublic.addEventListener('change', announceRoom);
$('btn-copy-lobby').addEventListener('click', copyInvite);
$('btn-copy').addEventListener('click', copyInvite);
$('btn-leave').addEventListener('click', leaveRoom);
$('btn-leave-lobby').addEventListener('click', leaveRoom);
$('btn-abort').addEventListener('click', () => {
  if (!isHostLike() || phase === 'lobby') return;
  broadcast({ t: 'lobby' });
  backToLobby();
  toast('Partida encerrada — de volta ao lobby.');
});
$('btn-end-menu').addEventListener('click', () => { location.href = location.pathname; });

async function copyInvite() {
  try {
    await navigator.clipboard.writeText(inviteLink());
    toast('Link copiado! Envie para os amigos.');
  } catch (_) {
    toast('Código da sala: ' + roomCode);
  }
}

window.addEventListener('beforeunload', () => {
  if (net) net.send({ t: 'bye' });
  if (directory) directory.unannounce();
});

// ---------- Inicialização ----------
function setupCanvas() {
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  canvas.width = CW * dpr;
  canvas.height = CH * dpr;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
}
window.addEventListener('resize', setupCanvas);
setupCanvas();

function startRoomsPolling() {
  refreshRooms();
  stopRoomsPolling();
  roomsTimer = setInterval(() => {
    if (mode === 'menu') refreshRooms();
  }, 5000);
}
function stopRoomsPolling() {
  if (roomsTimer) clearInterval(roomsTimer);
  roomsTimer = null;
}

const params = new URLSearchParams(location.search);
const salaParam = (params.get('sala') || '').toUpperCase();
if (salaParam) {
  els.code.value = salaParam;
  $('btn-join').classList.add('primary');
}
show('menu');
if (typeof Peer !== 'undefined') startRoomsPolling();
requestAnimationFrame(loop);

// gancho somente-leitura para depuração/testes automatizados
window.__hub = {
  get phase() { return phase; },
  get mode() { return mode; },
  get cfg() { return cfg; },
  get board() { return board; },
  get gameId() { return currentGameId; },
  get inst() { return inst; },
  get seat() { return mode === 'spectator' ? -1 : mySeat; },
  get roomCode() { return roomCode; },
  get specCount() { return specCount; },
  get names() { return names; },
};
