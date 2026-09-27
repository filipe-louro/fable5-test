// Hub de Jogos P2P — Arcade Console Edition
// O anfitrião é o hub da sala: retransmite mensagens de jogo e reações para os
// espectadores e arbitra o fluxo de partidas do torneio.
import { Net, makeRoomCode } from './net.js';
import { Directory } from './dir.js';
import { GAMES, gameById } from './games/index.js';
import { ensureAudio, sfx, isAudioMuted, toggleAudioMute } from './engine.js';
import {
  ICONS, getGameBadge, AVATAR_LIST, getAvatarSvg, normalizeAvatarKey,
  REACTION_LIST, getReactionSvg,
} from './icons.js';

const CW = 968;
const CH = 528;
const MAX_SPECTATORS = 8;
const AVATARS = AVATAR_LIST.map((a) => a.id);

const GAME_GLOWS = {
  sinuca: 'rgba(46, 157, 91, 0.25)',
  cobrinha: 'rgba(0, 240, 255, 0.32)',
  tanques: 'rgba(255, 85, 51, 0.32)',
  futebol: 'rgba(34, 197, 94, 0.28)',
  pingpong: 'rgba(59, 130, 246, 0.26)',
  airhockey: 'rgba(6, 182, 212, 0.32)',
  boliche: 'rgba(245, 158, 11, 0.28)',
  golf: 'rgba(16, 185, 129, 0.25)',
  pinball: 'rgba(236, 72, 153, 0.28)',
  poker: 'rgba(180, 83, 9, 0.25)',
};

const GAME_TAGS = {
  sinuca: 'Física Real 2D',
  cobrinha: 'Batalha .IO Ágil',
  tanques: 'Ricochete Laser',
  futebol: 'Física & Tática',
  pingpong: 'Efeito Magnus',
  airhockey: 'Alta Velocidade',
  boliche: 'WebGL 3D Real',
  golf: 'Mini-Golf 2D',
  pinball: 'Flippers Retrô',
  poker: 'Heads-Up Poker',
};

function updateGameGlow(gameId) {
  const color = (gameId && GAME_GLOWS[gameId]) || 'rgba(16, 185, 129, 0.2)';
  document.documentElement.style.setProperty('--game-glow', color);
}

// ---------- DOM Elements ----------
const $ = (id) => document.getElementById(id);
const canvas = $('table');
const ctx = canvas.getContext('2d');

const els = {
  // Menu / Launcher
  menu: $('menu'),
  name: $('inp-name'), code: $('inp-code'), status: $('net-status'),
  btnProfile: $('btn-profile'), hdrAvatar: $('hdr-avatar'), hdrName: $('hdr-name'),
  heroAvatarBtn: $('hero-avatar-btn'), menuAvatarDisplay: $('menu-avatar-display'),
  catalogGrid: $('catalog-grid'),
  roomsList: $('rooms-list'), roomsFilter: $('rooms-filter'), roomsStatus: $('rooms-status'), roomsKind: $('rooms-kind'),
  btnRefreshRooms: $('btn-refresh-rooms'),
  
  // Avatar Modal
  modalAvatar: $('modal-avatar'),
  btnAvatarClose: $('btn-avatar-close'),
  btnAvatarDone: $('btn-avatar-done'),
  avatarGrid: $('avatar-grid'),
  modalAvatarPreview: $('modal-avatar-preview'),
  modalNamePreview: $('modal-name-preview'),
  modalInpName: $('modal-inp-name'),

  // Lobby
  lobby: $('lobby'), lobbyCode: $('lobby-code'), lobbySpec: $('lobby-spec'),
  slotP1: $('slot-p1'), lobbyAvatar0: $('lobby-avatar-0'), lobbyName0: $('lobby-name-0'),
  slotP2: $('slot-p2'), lobbyAvatar1: $('lobby-avatar-1'), lobbyName1: $('lobby-name-1'), lobbyStatus1: $('lobby-status-1'),
  lobbyInviteBox: $('lobby-invite-box'), btnQuickInvite: $('btn-quick-invite'),
  gamesGrid: $('games-grid'), btnStart: $('btn-start'), lobbyHint: $('lobby-hint'), chkPublic: $('chk-public'),
  modeBtns: [$('btn-mode-casual'), $('btn-mode-torneio')],
  roadmapContainer: $('tournament-roadmap-container'),
  tournamentTimeline: $('tournament-timeline'),
  roadmapPresets: $('roadmap-presets'),
  gamesPickerCount: $('games-picker-count'),

  // Game & In-Game HUD
  game: $('game'), hud: $('hud'), msg: $('msg'), hint: $('hint'), tourney: $('tourney'), actions: $('actions'),
  roomChip: $('room-chip'), roomCode: $('room-code'), specChip: $('spec-chip'), specN: $('spec-n'),
  reactionsDock: $('quick-reactions'), reactionsLayer: $('reactions-floating-layer'),

  // Overlays
  inter: $('inter'), interTitle: $('inter-title'), interBoard: $('inter-board'), interBtns: $('inter-btns'),
  final: $('final'), finalTitle: $('final-title'), finalPodium: $('final-podium'), finalBoard: $('final-board'), finalBtns: $('final-btns'),
  finalParticles: $('final-particles'),
  end: $('end'), endMsg: $('end-msg'),
  toast: $('toast'),

  cards: [
    { root: $('card-0'), name: $('name-0'), sub: $('sub-0'), avatar: $('hud-avatar-0') },
    { root: $('card-1'), name: $('name-1'), sub: $('sub-1'), avatar: $('hud-avatar-1') },
  ],
};

// ---------- Estado ----------
let mode = 'menu'; // menu | local | host | guest | spectator
let mySeat = 0;
let myAvatar = 'fox';
let names = ['Jogador 1', 'Jogador 2'];
let avatars = ['fox', 'bot'];
let net = null;
let roomCode = '';
let inRoom = false;
let phase = 'lobby'; // lobby | playing | inter | final
let cfg = { mode: 'casual', games: ['sinuca'] };
let board = []; // [{game, winner, line}]
let matchIdx = 0;
let currentGameId = null;
let inst = null;
let instAlive = null;

let playerConnId = null;
const spectatorIds = new Set();
let specCount = 0;
let directory = null;
let roomsTimer = null;
let lastHoverSound = 0;
let lastReactionTime = 0;

const isHostLike = () => mode === 'host' || mode === 'local';

// ---------- Perfil & LocalStorage ----------
function loadProfile() {
  try {
    const savedAvatar = localStorage.getItem('hub_player_avatar');
    if (savedAvatar) {
      myAvatar = normalizeAvatarKey(savedAvatar);
    }
    const savedName = localStorage.getItem('hub_player_name');
    if (savedName) {
      els.name.value = savedName.trim().slice(0, 14);
    }
  } catch (_) {}
  updateProfileDisplays();
}

function saveProfile(newAvatar, newName) {
  if (newAvatar) {
    myAvatar = normalizeAvatarKey(newAvatar);
  }
  const cleanName = (newName || '').trim().slice(0, 14) || 'Jogador';
  els.name.value = cleanName;
  try {
    localStorage.setItem('hub_player_avatar', myAvatar);
    localStorage.setItem('hub_player_name', cleanName);
  } catch (_) {}
  updateProfileDisplays();

  // Se já estiver em sala, sincroniza o perfil atualizado com os outros jogadores
  if (inRoom) {
    if (mode === 'host' || mode === 'local') {
      names[0] = cleanName;
      avatars[0] = myAvatar;
      if (mode === 'host') broadcast({ t: 'profile', seat: 0, name: cleanName, avatar: myAvatar });
    } else if (mode === 'guest') {
      names[1] = cleanName;
      avatars[1] = myAvatar;
      broadcast({ t: 'profile', seat: 1, name: cleanName, avatar: myAvatar });
    }
    renderLobby();
    updateCards();
  }
}

function updateProfileDisplays() {
  const currentName = myName();
  if (els.hdrAvatar) els.hdrAvatar.innerHTML = getAvatarSvg(myAvatar, 'svg-avatar-mini');
  if (els.hdrName) els.hdrName.textContent = currentName;
  if (els.menuAvatarDisplay) els.menuAvatarDisplay.innerHTML = getAvatarSvg(myAvatar, 'svg-avatar-hero');
  if (els.modalAvatarPreview) {
    els.modalAvatarPreview.innerHTML = getAvatarSvg(myAvatar, 'svg-avatar-large');
    els.modalAvatarPreview.dataset.selectedId = myAvatar;
  }
  if (els.modalNamePreview) els.modalNamePreview.textContent = currentName;
  if (els.modalInpName) els.modalInpName.value = currentName;
}

function myName() {
  return els.name.value.trim().slice(0, 14) || 'Jogador';
}

// Microinteração de áudio para hover
function playHoverSound() {
  const now = performance.now();
  if (now - lastHoverSound < 80) return;
  lastHoverSound = now;
  sfx('hover', 0.6);
}

// ---------- UI Utilities ----------
function toast(text) {
  els.toast.textContent = text;
  els.toast.classList.add('show');
  clearTimeout(toast._t);
  toast._t = setTimeout(() => els.toast.classList.remove('show'), 2400);
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

function esc(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

// ---------- Diretório de Salas ----------
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
    hostAvatar: avatars[0],
    mode: cfg.mode,
    game: gameName,
    players: playerConnId !== null ? 2 : 1,
    spec: specCount,
    status: phase === 'lobby' ? 'lobby' : 'playing',
  });
}

function refreshRooms() {
  const d = ensureDirectory();
  els.roomsStatus.textContent = 'Procurando salas ativas…';
  d.list((rooms, err) => {
    if (mode !== 'menu') return;
    if (err || rooms === null) {
      els.roomsStatus.textContent = err || 'Sem resposta no momento.';
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
    : lastRooms.length ? 'Nenhuma sala bate com o filtro.' : 'Nenhuma sala ativa no momento. Crie a primeira!';
  els.roomsList.innerHTML = '';

  for (const r of list) {
    const row = document.createElement('div');
    row.className = 'room-row';
    const vaga = r.players < 2;
    row.innerHTML = `
      <div class="room-info">
        <div class="room-info-top">
          <span class="room-code-tag">${esc(r.code)}</span>
          <span class="room-host">
            <span class="room-host-badge">${getAvatarSvg(r.hostAvatar || 'fox', 'svg-avatar-micro')}</span>
            <span>${esc(r.host)}</span>
          </span>
        </div>
        <div class="room-details">
          <span class="badge-mode"><span class="badge-dot ${r.mode}"></span> ${r.mode === 'torneio' ? 'Torneio' : 'Casual'}</span>
          <span class="room-game-desc">· ${esc(r.game)}</span>
          <span class="badge-status ${vaga ? 'open' : 'busy'}"><span class="status-indicator-dot ${vaga ? 'online' : 'busy'}"></span> ${vaga ? '1 vaga disponível' : 'Em andamento (2/2)'}</span>
          ${r.spec ? `<span class="room-spec-count"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="svg-icon-micro"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg> ${r.spec}</span>` : ''}
        </div>
      </div>
      <button class="small ${vaga ? 'primary' : ''}">${vaga ? 'Entrar' : 'Assistir'}</button>`;
    
    row.addEventListener('mouseenter', playHoverSound);
    row.querySelector('button').addEventListener('click', () => {
      sfx('select');
      els.code.value = r.code;
      joinRoom(r.code);
    });
    els.roomsList.appendChild(row);
  }
}

// ---------- Catálogo de Jogos (Launcher Showcase) ----------
function renderCatalog() {
  els.catalogGrid.innerHTML = '';
  for (const g of GAMES) {
    const card = document.createElement('div');
    card.className = 'catalog-card';
    const glow = GAME_GLOWS[g.id] || 'rgba(16, 185, 129, 0.25)';
    card.style.setProperty('--card-glow', glow);
    card.innerHTML = `
      <div class="catalog-card-header">
        <div class="catalog-card-badge-wrap">${getGameBadge(g.id)}</div>
        <span class="catalog-card-tag">${GAME_TAGS[g.id] || (g.local ? 'Local & Online' : 'Online')}</span>
      </div>
      <div class="catalog-card-body">
        <div class="catalog-card-title">${g.name}</div>
        <div class="catalog-card-desc">${g.desc}</div>
      </div>`;
    
    card.addEventListener('mouseenter', playHoverSound);
    card.addEventListener('click', () => {
      sfx('select');
      cfg.games = [g.id];
      toast(`${g.name} selecionado! Escolha "Criar Sala" ou "Jogar Local".`);
      highlightSelectedCatalogGame(g.id);
    });
    els.catalogGrid.appendChild(card);
  }
}

function highlightSelectedCatalogGame(gameId) {
  const cards = els.catalogGrid.querySelectorAll('.catalog-card');
  cards.forEach((c, idx) => {
    c.style.borderColor = GAMES[idx]?.id === gameId ? 'var(--accent-2)' : '';
  });
}

// ---------- Seletor de Avatar (Modal) ----------
function setupAvatarModal() {
  els.avatarGrid.innerHTML = '';
  AVATAR_LIST.forEach((av) => {
    const btn = document.createElement('button');
    btn.className = `avatar-choice-btn ${av.id === myAvatar ? 'selected' : ''}`;
    btn.dataset.avatarId = av.id;
    btn.title = av.name;
    btn.innerHTML = `
      <div class="avatar-choice-icon">${getAvatarSvg(av.id, 'svg-avatar-choice')}</div>
      <span class="avatar-choice-name">${av.name}</span>
    `;
    btn.addEventListener('mouseenter', playHoverSound);
    btn.addEventListener('click', () => {
      sfx('click');
      els.avatarGrid.querySelectorAll('.avatar-choice-btn').forEach(b => b.classList.remove('selected'));
      btn.classList.add('selected');
      els.modalAvatarPreview.innerHTML = getAvatarSvg(av.id, 'svg-avatar-large');
      els.modalAvatarPreview.dataset.selectedId = av.id;
    });
    els.avatarGrid.appendChild(btn);
  });

  els.btnProfile.addEventListener('click', () => {
    sfx('select');
    openAvatarModal();
  });
  els.heroAvatarBtn.addEventListener('click', () => {
    sfx('select');
    openAvatarModal();
  });
  els.btnAvatarClose.addEventListener('click', closeAvatarModal);
  els.btnAvatarDone.addEventListener('click', () => {
    sfx('select');
    const chosenAvatar = els.modalAvatarPreview.dataset.selectedId || myAvatar;
    const chosenName = els.modalInpName.value.trim() || myName();
    saveProfile(chosenAvatar, chosenName);
    closeAvatarModal();
    toast('Perfil arcade atualizado!');
  });
  els.modalInpName.addEventListener('input', () => {
    els.modalNamePreview.textContent = els.modalInpName.value.trim() || 'Jogador';
  });
}

function openAvatarModal() {
  updateProfileDisplays();
  els.modalAvatar.classList.remove('hidden');
  els.modalAvatarPreview.dataset.selectedId = myAvatar;
  els.avatarGrid.querySelectorAll('.avatar-choice-btn').forEach((b) => {
    b.classList.toggle('selected', b.dataset.avatarId === myAvatar);
  });
}

function closeAvatarModal() {
  els.modalAvatar.classList.add('hidden');
}

// ---------- Quick Chat & Reações P2P ----------
function setupReactions() {
  const container = els.reactionsDock.querySelector('.reaction-buttons');
  if (!container) return;
  container.innerHTML = '';

  REACTION_LIST.forEach((r) => {
    const btn = document.createElement('button');
    btn.className = 'btn-reaction';
    btn.dataset.reactionId = r.id;
    btn.title = r.title;
    btn.innerHTML = `
      <span class="reaction-icon-wrap">${getReactionSvg(r.id, 'svg-reaction-mini')}</span>
      <span class="reaction-label-chip">${r.label}</span>
    `;
    btn.addEventListener('mouseenter', playHoverSound);
    btn.addEventListener('click', () => {
      ensureAudio();
      const now = performance.now();
      if (now - lastReactionTime < 350) return;
      lastReactionTime = now;

      let seat = mode === 'spectator' ? -1 : mySeat;
      let sName = myName();
      let sAvatar = myAvatar;

      if (mode === 'local') {
        const activeTurn = (inst && typeof inst.activeSeat === 'number')
          ? inst.activeSeat
          : (inst && inst.st && typeof inst.st.turn === 'number' ? inst.st.turn : 0);
        seat = activeTurn;
        sName = names[seat] || (seat === 0 ? 'Jogador 1' : 'Jogador 2');
        sAvatar = avatars[seat] || (seat === 0 ? 'fox' : 'bot');
      }

      // Dispara localmente
      triggerReaction(r.id, seat, sName, sAvatar);

      // Dispara pela rede WebRTC
      if (mode !== 'local' && net && net.connected) {
        broadcast({
          t: 'react',
          emoji: r.id,
          seat: mode === 'spectator' ? -1 : mySeat,
          name: myName(),
          avatar: myAvatar,
        });
      }
    });
    container.appendChild(btn);
  });
}

function triggerReaction(emoji, seat, senderName, senderAvatar) {
  sfx('reaction', 0.85);

  const bubble = document.createElement('div');
  bubble.className = 'floating-reaction-bubble';
  
  const drift = Math.round((Math.random() - 0.5) * 40);
  bubble.style.setProperty('--drift-x', `${drift}px`);

  // Posicionamento espacial correspondente ao jogador emissor
  if (seat === 0) {
    bubble.style.left = '14%';
    bubble.style.setProperty('--base-x', '0%');
    bubble.style.bottom = '100px';
  } else if (seat === 1) {
    bubble.style.right = '14%';
    bubble.style.setProperty('--base-x', '0%');
    bubble.style.bottom = '100px';
  } else {
    // Espectador
    bubble.style.left = '50%';
    bubble.style.setProperty('--base-x', '-50%');
    bubble.style.bottom = '120px';
  }

  bubble.innerHTML = `
    <div class="reaction-bubble-avatar">${getAvatarSvg(senderAvatar || 'fox', 'svg-avatar-micro')}</div>
    <div class="reaction-bubble-icon">${getReactionSvg(emoji, 'svg-reaction-bubble')}</div>
    <small class="reaction-bubble-sender">${esc(senderName || '')}</small>`;

  els.reactionsLayer.appendChild(bubble);

  setTimeout(() => {
    if (bubble.parentNode) bubble.parentNode.removeChild(bubble);
  }, 2400);
}

// ---------- Rede P2P ----------
function makeNet() {
  return new Net({
    onMessage: handleMessage,
    onOpen: () => {
      if (mode === 'guest') {
        net.send({ t: 'hello', name: names[1], avatar: myAvatar });
      }
    },
    onConnClose: (connId) => {
      if (mode === 'host') {
        if (connId === playerConnId) {
          playerConnId = null;
          if (inRoom) {
            if (phase === 'lobby') {
              names[1] = 'Jogador 2';
              avatars[1] = 'bot';
              renderLobby();
              toast('O desafiante saiu da sala.');
              announceRoom();
            } else {
              showEnd('O outro jogador saiu da partida.');
            }
          }
        } else if (spectatorIds.delete(connId)) {
          setSpectators(spectatorIds.size);
        }
      } else if (inRoom) {
        showEnd(mode === 'spectator' ? 'A sala foi encerrada pelo anfitrião.' : 'A conexão com a sala caiu.');
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
  els.lobbySpec.innerHTML = specCount > 0
    ? `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="svg-icon-mini"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg> <span>${specCount} espectador(es) ao vivo</span>`
    : '';
}

function broadcast(msg) {
  if (net && net.connected) net.send(msg);
}

function welcomePayload(role) {
  return {
    t: 'welcome',
    role,
    n: names,
    avatars,
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
    const guestName = String(m.name || '').slice(0, 14);
    const guestAvatar = normalizeAvatarKey(m.avatar);

    if (playerConnId === null && phase === 'lobby') {
      playerConnId = connId;
      names[1] = guestName || 'Jogador 2';
      avatars[1] = guestAvatar;
      net.sendTo(connId, welcomePayload('player'));
      renderLobby();
      toast(`${names[1]} entrou para desafiar!`);
      sfx('ready', 1.0);
      announceRoom();
    } else if (spectatorIds.size < MAX_SPECTATORS) {
      spectatorIds.add(connId);
      net.sendTo(connId, welcomePayload('spectator'));
      setSpectators(spectatorIds.size);
      toast(`${guestName || 'Um jogador'} entrou como espectador.`);
    } else {
      net.sendTo(connId, { t: 'full' });
      net.closeConn(connId);
    }
    return;
  }

  // Reações Rápidas (repassa a todos)
  if (m.t === 'react') {
    net.sendExcept(connId, m);
    triggerReaction(m.emoji, m.seat, m.name, m.avatar);
    return;
  }

  // Atualização de Perfil em tempo real
  if (m.t === 'profile' && connId === playerConnId) {
    names[1] = String(m.name || '').slice(0, 14) || 'Jogador 2';
    avatars[1] = normalizeAvatarKey(m.avatar);
    net.sendExcept(connId, m);
    renderLobby();
    updateCards();
    return;
  }

  if (connId !== playerConnId) {
    if (m.t === 'bye' && spectatorIds.delete(connId)) {
      net.closeConn(connId);
      setSpectators(spectatorIds.size);
    }
    return;
  }

  // Mensagens do jogador 2
  switch (m.t) {
    case 'bye':
      playerConnId = null;
      if (phase === 'lobby') {
        names[1] = 'Jogador 2';
        avatars[1] = 'bot';
        renderLobby();
        toast('O desafiante saiu da sala.');
        announceRoom();
      } else {
        showEnd('O outro jogador saiu da partida.');
      }
      break;
    case 'g':
      net.sendExcept(connId, m); // Repassa aos espectadores
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
      if (m.avatars) avatars = m.avatars;
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
      if (mode === 'spectator') toast('Você entrou como espectador na sala.');
      else toast('Conectado à sala! Prepare-se para jogar.');
      updateSpecUi();
      break;
    case 'react':
      triggerReaction(m.emoji, m.seat, m.name, m.avatar);
      break;
    case 'profile':
      if (m.seat === 0) {
        names[0] = m.name;
        avatars[0] = m.avatar;
      } else if (m.seat === 1) {
        names[1] = m.name;
        avatars[1] = m.avatar;
      }
      renderLobby();
      updateCards();
      break;
    case 'full':
      setStatus('error', 'Sala cheia (partida + espectadores). Tente outra sala.');
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
      showEnd(mode === 'spectator' ? 'A sala foi encerrada pelo anfitrião.' : 'O outro jogador saiu da partida.');
      break;
  }
}

// ---------- Fluxo de Sala ----------
function createRoom() {
  ensureAudio();
  if (net) net.close();
  mode = 'host';
  mySeat = 0;
  names = [myName(), 'Jogador 2'];
  avatars = [myAvatar, 'bot'];
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
  avatars = ['fox', myAvatar];
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
  avatars = [myAvatar, 'bot'];
  inRoom = true;
  phase = 'lobby';
  board = [];
  matchIdx = 0;
  if (cfg.games.some(gid => !gameById(gid)?.local)) {
    cfg.games = cfg.games.filter(gid => gameById(gid)?.local);
    if (!cfg.games.length) cfg.games = ['sinuca'];
  }
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

// ---------- Lobby de Torneio & Casual ----------
function showLobby() {
  phase = 'lobby';
  destroyInst();
  hideOverlays();
  updateGameGlow(null);
  show('lobby');
  renderLobby();
  announceRoom();
}

function backToLobby() {
  board = [];
  matchIdx = 0;
  showLobby();
}

function renderLobby() {
  const canEdit = isHostLike();
  els.lobbyCode.textContent = mode === 'local' ? 'LOCAL' : roomCode;
  $('btn-copy-lobby').classList.toggle('hidden', mode === 'local');
  $('lobby-public-row').classList.toggle('hidden', mode !== 'host');

  // Matchup Arena (Player 1 VS Player 2)
  els.lobbyAvatar0.innerHTML = getAvatarSvg(avatars[0], 'svg-avatar-slot');
  els.lobbyName0.textContent = names[0] + (mySeat === 0 && mode !== 'local' ? ' (você)' : '');

  const p2Active = mode === 'local' || mode === 'guest' || playerConnId !== null || mode === 'spectator';
  if (p2Active) {
    els.lobbyAvatar1.innerHTML = getAvatarSvg(avatars[1], 'svg-avatar-slot');
    els.lobbyName1.textContent = names[1] + (mySeat === 1 ? ' (você)' : '');
    els.lobbyStatus1.innerHTML = `<span class="status-indicator-dot online"></span><span>Conectado</span>`;
    els.lobbyStatus1.className = 'slot-status ready';
    els.lobbyInviteBox.classList.add('hidden');
  } else {
    els.lobbyAvatar1.innerHTML = getAvatarSvg('bot', 'svg-avatar-slot');
    els.lobbyName1.textContent = 'Aguardando Desafiante…';
    els.lobbyStatus1.innerHTML = `<span class="status-indicator-dot waiting"></span><span>Aguardando desafiante...</span>`;
    els.lobbyStatus1.className = 'slot-status waiting';
    els.lobbyInviteBox.classList.toggle('hidden', mode === 'local');
  }

  // Modos de Jogo
  els.modeBtns[0].classList.toggle('sel', cfg.mode === 'casual');
  els.modeBtns[1].classList.toggle('sel', cfg.mode === 'torneio');
  els.modeBtns.forEach((b) => { b.disabled = !canEdit; });

  // Timeline do Torneio
  const isTourney = cfg.mode === 'torneio';
  els.roadmapContainer.classList.toggle('hidden', !isTourney);
  if (isTourney) {
    renderTournamentTimeline();
  }

  // Grid de Jogos
  els.gamesPickerCount.textContent = isTourney
    ? `(${cfg.games.length} jogos na sequência do torneio)`
    : '(Clique para selecionar o jogo)';

  els.gamesGrid.innerHTML = '';
  for (const g of GAMES) {
    const card = document.createElement('button');
    card.className = 'game-card';
    const selIdx = cfg.games.indexOf(g.id);
    const blocked = mode === 'local' && !g.local;
    if (selIdx >= 0) card.classList.add('sel');
    if (blocked) card.classList.add('blocked');
    card.innerHTML = `
      <div class="g-card-top">
        <div class="g-badge-wrap">${getGameBadge(g.id)}</div>
        ${cfg.mode === 'torneio' && selIdx >= 0 ? `<span class="g-order">${selIdx + 1}º</span>` : ''}
      </div>
      <div class="g-card-info">
        <span class="g-name">${g.name}</span>
        <span class="g-desc">${blocked ? 'Somente online' : g.desc}</span>
      </div>`;
    
    card.addEventListener('mouseenter', playHoverSound);

    if (canEdit && !blocked) {
      card.addEventListener('click', () => {
        sfx('select');
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

  // Validação de início
  const hasBlocked = mode === 'local' && cfg.games.some(gid => !gameById(gid)?.local);
  const need = cfg.mode === 'torneio' ? 2 : 1;
  const okGames = !hasBlocked && (cfg.mode === 'torneio' ? cfg.games.length >= need : cfg.games.length === 1);
  const okPlayers = mode === 'local' || mode !== 'host' || playerConnId !== null;
  els.btnStart.classList.toggle('hidden', !canEdit);
  els.btnStart.disabled = !(okGames && okPlayers);
  els.btnStart.innerHTML = `
    <svg viewBox="0 0 24 24" fill="currentColor" class="svg-icon-play">
      <polygon points="5 3 19 12 5 21 5 3"/>
    </svg>
    <span>${isTourney ? 'INICIAR TORNEIO' : 'COMEÇAR PARTIDA'}</span>`;

  if (els.roadmapPresets) els.roadmapPresets.classList.toggle('hidden', !canEdit);

  if (!canEdit) {
    els.lobbyHint.textContent = mode === 'spectator'
      ? 'Você é espectador. O anfitrião está organizando as partidas.'
      : 'O anfitrião escolhe os jogos e iniciará a partida. Aguarde!';
  } else if (!okPlayers) {
    els.lobbyHint.textContent = 'Envie o link de convite para um amigo. A sala também está listada no lobby público.';
  } else if (hasBlocked) {
    els.lobbyHint.textContent = 'O Poker não suporta 2P no mesmo aparelho (cartas secretas). Remova-o para continuar.';
  } else if (!okGames) {
    els.lobbyHint.textContent = cfg.mode === 'torneio'
      ? 'Escolha pelo menos 2 jogos para o torneio (a ordem dos cliques define as rodadas).'
      : 'Escolha 1 jogo para a partida casual.';
  } else {
    els.lobbyHint.textContent = cfg.mode === 'torneio'
      ? `Torneio de ${cfg.games.length} partidas montado — quem vencer mais partidas leva o troféu!`
      : 'Tudo pronto! Clique no botão para iniciar.';
  }
}

function renderTournamentTimeline() {
  els.tournamentTimeline.innerHTML = '';
  if (!cfg.games.length) {
    els.tournamentTimeline.innerHTML = '<span class="muted">Nenhum jogo selecionado ainda.</span>';
    return;
  }
  const canEdit = isHostLike();
  cfg.games.forEach((gid, idx) => {
    const g = gameById(gid);
    if (!g) return;
    const item = document.createElement('div');
    item.className = 'timeline-round';
    item.innerHTML = `
      <span class="timeline-round-num">${idx + 1}</span>
      <span class="timeline-badge-mini">${getGameBadge(gid)}</span>
      <span class="timeline-game-title">${g.name}</span>
      ${canEdit ? `<button class="timeline-round-del" data-idx="${idx}" title="Remover da sequência" aria-label="Remover rodada"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" class="svg-icon-micro"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg></button>` : ''}`;

    if (canEdit) {
      const delBtn = item.querySelector('.timeline-round-del');
      if (delBtn) {
        delBtn.addEventListener('click', (e) => {
          e.stopPropagation();
          sfx('click');
          cfg.games.splice(idx, 1);
          pushCfg();
          renderLobby();
        });
      }
    }

    els.tournamentTimeline.appendChild(item);

    if (idx < cfg.games.length - 1) {
      const arrow = document.createElement('span');
      arrow.className = 'timeline-arrow';
      arrow.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" class="svg-icon-micro"><polyline points="9 18 15 12 9 6"/></svg>`;
      els.tournamentTimeline.appendChild(arrow);
    }
  });

  const finalTrophy = document.createElement('div');
  finalTrophy.className = 'timeline-trophy';
  finalTrophy.innerHTML = ICONS.modeTorneio;
  finalTrophy.title = 'Grande Campeão do Torneio';
  els.tournamentTimeline.appendChild(finalTrophy);
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
    avatars,
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
        btn.addEventListener('mouseenter', playHoverSound);
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
  if (inst && typeof inst.destroy === 'function') {
    try { inst.destroy(); } catch (err) { console.error(err); }
  }
  inst = null;
  if (typeof document !== 'undefined') {
    document.querySelectorAll('.gl-layer').forEach((el) => el.remove());
  }
  if (canvas) canvas.style.background = '';
  els.actions.innerHTML = '';
  els.actions.classList.add('hidden');
  els.msg.textContent = '';
  els.hint.textContent = '';
  els.cards[0].sub.innerHTML = '';
  els.cards[1].sub.innerHTML = '';
  if (els.cards[0]?.root) els.cards[0].root.classList.remove('active-turn');
  if (els.cards[1]?.root) els.cards[1].root.classList.remove('active-turn');
}

function startMatch(idx, gameId, snap) {
  const mod = gameById(gameId);
  if (!mod) return;
  destroyInst();
  matchIdx = idx;
  currentGameId = gameId;
  phase = 'playing';
  hideOverlays();
  updateGameGlow(gameId);
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

// Resultado autoritativo (anfitrião/local)
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
      ? '<span class="score-tag tie">Empate</span>'
      : `<span class="score-tag winner"><span class="b-avatar-mini">${getAvatarSvg(avatars[r.winner], 'svg-avatar-micro')}</span> <span>${esc(names[r.winner])}</span></span>`;
    return `<div class="board-row"><span class="board-game-label">${i + 1}. ${g ? g.name : esc(r.game)}</span><span>${res}</span></div>`;
  }).join('');
  return `
    <div class="board-score">
      <span class="b-player"><span class="b-avatar-mini">${getAvatarSvg(avatars[0], 'svg-avatar-micro')}</span> ${esc(names[0])}</span>
      <strong class="b-pts">${w0} × ${w1}</strong>
      <span class="b-player"><span class="b-avatar-mini">${getAvatarSvg(avatars[1], 'svg-avatar-micro')}</span> ${esc(names[1])}</span>
    </div>
    <div class="board-rows">${rows}</div>`;
}

function updateTourneyLine() {
  if (cfg.mode === 'torneio') {
    const [w0, w1] = wins();
    els.tourney.textContent = `Torneio — Rodada ${matchIdx + 1}/${cfg.games.length} · ${names[0]} ${w0} × ${w1} ${names[1]}`;
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
    if (els.cards[seat].avatar) {
      els.cards[seat].avatar.innerHTML = getAvatarSvg(avatars[seat] || (seat === 0 ? 'fox' : 'bot'), 'svg-avatar-hud');
    }
  }
}

// ---------- Overlays ----------
function hideOverlays() {
  els.inter.classList.add('hidden');
  els.final.classList.add('hidden');
  els.end.classList.add('hidden');
  if (els.finalParticles) els.finalParticles.innerHTML = '';
}

function spawnConfetti() {
  if (!els.finalParticles) return;
  els.finalParticles.innerHTML = '';
  const colors = ['#fbbf24', '#34d399', '#38bdf8', '#f43f5e', '#a855f7', '#fb923c', '#facc15'];
  const count = 38;
  for (let i = 0; i < count; i++) {
    const p = document.createElement('div');
    p.className = 'confetti-piece';
    const color = colors[i % colors.length];
    const isRound = i % 3 === 0;
    const isStar = i % 7 === 0;
    const w = isStar ? 12 : (isRound ? 9 : 8 + Math.floor(Math.random() * 6));
    const h = isStar ? 12 : (isRound ? 9 : 14 + Math.floor(Math.random() * 8));
    p.style.width = `${w}px`;
    p.style.height = `${h}px`;
    p.style.backgroundColor = isStar ? 'transparent' : color;
    if (isStar) {
      p.textContent = '✦';
      p.style.color = color;
      p.style.fontSize = '14px';
    } else if (isRound) {
      p.style.borderRadius = '50%';
    }
    const left = Math.floor(Math.random() * 96);
    p.style.left = `${left}%`;
    const dur = (2.2 + Math.random() * 2.2).toFixed(2);
    const delay = (Math.random() * 1.5).toFixed(2);
    const drift = Math.floor((Math.random() - 0.5) * 120);
    p.style.setProperty('--fall-dur', `${dur}s`);
    p.style.setProperty('--fall-delay', `${delay}s`);
    p.style.setProperty('--drift', `${drift}px`);
    els.finalParticles.appendChild(p);
  }
}

function showInter() {
  const r = board[matchIdx];
  const played = board.filter(Boolean).length;
  const isTourney = cfg.mode === 'torneio';
  const more = isTourney && played < cfg.games.length;

  els.interTitle.textContent = r ? r.line : 'Fim da Partida';
  let html = boardHtml();
  if (isTourney && more) {
    const nextGame = gameById(cfg.games[played]);
    if (nextGame) {
      html += `
        <div class="next-match-preview">
          <span class="preview-label">Próxima Rodada (${played + 1}/${cfg.games.length}):</span>
          <span class="preview-game-badge">${getGameBadge(nextGame.id)}</span>
          <b class="preview-game-name">${nextGame.name}</b>
        </div>`;
    }
  }
  els.interBoard.innerHTML = html;
  els.interBtns.innerHTML = '';
  updateTourneyLine();

  if (isHostLike()) {
    const mk = (label, cls, fn) => {
      const b = document.createElement('button');
      b.textContent = label;
      b.className = cls;
      b.addEventListener('mouseenter', playHoverSound);
      b.addEventListener('click', () => { ensureAudio(); fn(); });
      els.interBtns.appendChild(b);
    };
    if (isTourney) {
      if (more) {
        const nextGame = gameById(cfg.games[played]);
        mk(`Começar ${nextGame.name}`, 'primary big', () => sendMs(played, cfg.games[played]));
      } else {
        mk('Ver Resultado do Torneio', 'primary big', () => { broadcast({ t: 'final' }); showFinal(); });
      }
    } else {
      mk('Jogar Novamente', 'primary big', () => sendMs(board.length, cfg.games[0]));
    }
    mk('Voltar ao Lobby', 'ghost', () => { broadcast({ t: 'lobby' }); backToLobby(); });
  } else {
    const waitMsg = isTourney && more
      ? `Aguardando o anfitrião iniciar ${gameById(cfg.games[played]).name}…`
      : 'Aguardando o anfitrião…';
    els.interBtns.innerHTML = `<p class="muted">${waitMsg}</p>`;
  }
  els.inter.classList.remove('hidden');
  sfx('score', 0.85);
}

function showFinal() {
  phase = 'final';
  const [w0, w1] = wins();
  const isTie = w0 === w1;
  const champSeat = w0 > w1 ? 0 : 1;
  const champName = names[champSeat];
  const champAvatar = avatars[champSeat];

  const trophyWrap = $('trophy-glow-wrap');
  if (trophyWrap) {
    trophyWrap.innerHTML = ICONS.grandTrophy;
  }

  els.finalTitle.innerHTML = isTie
    ? `Torneio Empatado em ${w0} × ${w1}!`
    : `<b>${esc(champName)}</b> é o Campeão do Torneio! (${Math.max(w0, w1)} × ${Math.min(w0, w1)})`;

  // Pódio de Campeão
  if (!isTie) {
    const runnerSeat = 1 - champSeat;
    els.finalPodium.innerHTML = `
      <div class="podium-item second">
        <div class="podium-avatar">${getAvatarSvg(avatars[runnerSeat], 'svg-avatar-podium')}</div>
        <div class="podium-pillar">2º</div>
        <div class="podium-name">${esc(names[runnerSeat])} (${Math.min(w0, w1)})</div>
      </div>
      <div class="podium-item first">
        <div class="podium-avatar">
          <span class="podium-crown">
            <svg viewBox="0 0 24 24" fill="#fbbf24" class="svg-icon-mini"><path d="M2 19h20v2H2zM3 5l4 6 5-8 5 8 4-6v11H3z"/></svg>
          </span>
          ${getAvatarSvg(champAvatar, 'svg-avatar-podium')}
        </div>
        <div class="podium-pillar">1º</div>
        <div class="podium-name">${esc(champName)} (${Math.max(w0, w1)})</div>
      </div>`;
  } else {
    els.finalPodium.innerHTML = `
      <div class="podium-item first">
        <div class="podium-avatar" style="display:flex; gap:8px; align-items:center; justify-content:center;">
          ${getAvatarSvg(avatars[0], 'svg-avatar-mini')}
          ${getAvatarSvg(avatars[1], 'svg-avatar-mini')}
        </div>
        <div class="podium-pillar" style="width:160px;">EMPATE</div>
        <div class="podium-name">${w0} × ${w1}</div>
      </div>`;
  }

  // Estatísticas detalhadas do torneio
  const playedRounds = board.filter(Boolean);
  const totalPlayed = playedRounds.length;
  let ties = 0;
  const p1Games = [];
  const p2Games = [];

  playedRounds.forEach((r) => {
    const g = gameById(r.game);
    const gName = g ? g.name : r.game;
    if (r.winner === 0) p1Games.push(gName);
    else if (r.winner === 1) p2Games.push(gName);
    else ties++;
  });

  const champWins = Math.max(w0, w1);
  const winRate = totalPlayed > 0 ? Math.round((champWins / totalPlayed) * 100) : 0;

  const statsHtml = `
    <div class="final-stats-card">
      <div class="stats-card-title">Estatísticas Oficiais do Torneio</div>
      <div class="stats-metrics-row">
        <div class="metric-pill">
          <span class="m-val">${totalPlayed}</span>
          <span class="m-lbl">Rodadas Jogadas</span>
        </div>
        <div class="metric-pill">
          <span class="m-val">${isTie ? '50%' : winRate + '%'}</span>
          <span class="m-lbl">${isTie ? 'Equilíbrio Total' : 'Aproveitamento Campeão'}</span>
        </div>
        <div class="metric-pill">
          <span class="m-val">${ties}</span>
          <span class="m-lbl">Empates</span>
        </div>
      </div>
      <div class="games-conquered-row">
        <div class="conquered-box">
          <div class="conquered-header">${avatars[0]} ${esc(names[0])} (${w0} vitórias):</div>
          <div class="conquered-icons">${p1Games.length ? p1Games.map(t => `<span class="pill-chip">${esc(t)}</span>`).join('') : '<span class="muted">Nenhuma</span>'}</div>
        </div>
        <div class="conquered-box">
          <div class="conquered-header">${avatars[1]} ${esc(names[1])} (${w1} vitórias):</div>
          <div class="conquered-icons">${p2Games.length ? p2Games.map(t => `<span class="pill-chip">${esc(t)}</span>`).join('') : '<span class="muted">Nenhuma</span>'}</div>
        </div>
      </div>
    </div>`;

  els.finalBoard.innerHTML = statsHtml + boardHtml();
  els.finalBtns.innerHTML = '';
  if (isHostLike()) {
    const b = document.createElement('button');
    b.textContent = 'Novo Torneio / Voltar ao Lobby';
    b.className = 'primary big';
    b.addEventListener('mouseenter', playHoverSound);
    b.addEventListener('click', () => { broadcast({ t: 'lobby' }); backToLobby(); });
    els.finalBtns.appendChild(b);
  } else {
    els.finalBtns.innerHTML = '<p class="muted">Aguardando o anfitrião…</p>';
  }
  els.inter.classList.add('hidden');
  els.final.classList.remove('hidden');
  sfx('victory', 1.0);
  spawnConfetti();
  announceRoom();
}

function showEnd(text) {
  destroyInst();
  els.endMsg.textContent = text;
  els.end.classList.remove('hidden');
  if (net) {
    net.close();
    net = null;
  }
  if (directory) directory.unannounce();
  inRoom = false;
}

// ---------- Entrada Canvas ----------
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

// ---------- Loop de Renderização ----------
let last = performance.now();
function loop(now) {
  const dt = Math.min(0.04, (now - last) / 1000);
  last = now;
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  if (inst) {
    if (phase === 'playing') {
      try { inst.tick(dt); } catch (err) { console.error(err); }
      const activeSeat = (typeof inst.activeSeat === 'number')
        ? inst.activeSeat
        : (inst.st && typeof inst.st.turn === 'number' ? inst.st.turn : null);
      if (els.cards[0]?.root) els.cards[0].root.classList.toggle('active-turn', activeSeat === 0);
      if (els.cards[1]?.root) els.cards[1].root.classList.toggle('active-turn', activeSeat === 1);
    }
    ctx.clearRect(0, 0, CW, CH);
    try { inst.draw(ctx); } catch (err) { console.error(err); }
  } else {
    ctx.clearRect(0, 0, CW, CH);
  }
  requestAnimationFrame(loop);
}

// ---------- Ações e Event Listeners ----------
function updateAudioBtn() {
  const btn = $('btn-audio');
  if (!btn) return;
  const m = isAudioMuted();
  btn.innerHTML = m ? ICONS.audioMuted : ICONS.audioOn;
  btn.title = m ? 'Ativar som' : 'Desativar som';
  btn.setAttribute('aria-label', btn.title);
}

const btnAudio = $('btn-audio');
if (btnAudio) {
  btnAudio.addEventListener('click', () => {
    ensureAudio();
    toggleAudioMute();
    updateAudioBtn();
  });
  updateAudioBtn();
}

$('btn-create').addEventListener('mouseenter', playHoverSound);
$('btn-create').addEventListener('click', () => {
  sfx('select');
  createRoom();
});

$('btn-join').addEventListener('mouseenter', playHoverSound);
$('btn-join').addEventListener('click', () => {
  sfx('select');
  joinRoom();
});

$('btn-local').addEventListener('mouseenter', playHoverSound);
$('btn-local').addEventListener('click', () => {
  sfx('select');
  startLocal();
});

$('btn-start').addEventListener('mouseenter', playHoverSound);
$('btn-start').addEventListener('click', () => {
  sfx('select');
  hostStart();
});

els.btnRefreshRooms.addEventListener('mouseenter', playHoverSound);
els.btnRefreshRooms.addEventListener('click', () => {
  sfx('click');
  refreshRooms();
});

els.roomsFilter.addEventListener('input', () => renderRooms(null));
els.roomsKind.addEventListener('change', () => {
  sfx('click');
  renderRooms(null);
});

els.modeBtns[0].addEventListener('mouseenter', playHoverSound);
els.modeBtns[0].addEventListener('click', () => {
  sfx('select');
  cfg.mode = 'casual';
  cfg.games = cfg.games.slice(0, 1);
  pushCfg();
  renderLobby();
});

els.modeBtns[1].addEventListener('mouseenter', playHoverSound);
els.modeBtns[1].addEventListener('click', () => {
  sfx('select');
  cfg.mode = 'torneio';
  if (cfg.games.length < 2) {
    cfg.games = ['sinuca', 'cobrinha', 'tanques'];
  }
  pushCfg();
  renderLobby();
});

// Presets do Torneio
els.roadmapPresets.addEventListener('click', (e) => {
  const btn = e.target.closest('.preset-btn');
  if (!btn || !isHostLike()) return;
  sfx('select');
  const preset = btn.dataset.preset;
  if (preset === 'trio') {
    cfg.games = ['sinuca', 'cobrinha', 'tanques'];
  } else if (preset === 'fast') {
    cfg.games = ['cobrinha', 'tanques', 'airhockey'];
  } else if (preset === 'sports') {
    cfg.games = ['futebol', 'pingpong', 'boliche'];
  } else if (preset === 'all') {
    cfg.games = GAMES.filter(g => mode !== 'local' || g.local).map(g => g.id);
  }
  pushCfg();
  renderLobby();
});

els.chkPublic.addEventListener('change', announceRoom);
$('btn-copy-lobby').addEventListener('click', copyInvite);
$('btn-copy').addEventListener('click', copyInvite);
els.btnQuickInvite.addEventListener('click', copyInvite);
$('btn-leave').addEventListener('click', leaveRoom);
$('btn-leave-lobby').addEventListener('click', leaveRoom);

$('btn-abort').addEventListener('click', () => {
  if (!isHostLike() || phase === 'lobby') return;
  broadcast({ t: 'lobby' });
  backToLobby();
  toast('Partida encerrada — voltando ao lobby.');
});

$('btn-end-menu').addEventListener('click', () => { location.href = location.pathname; });

async function copyInvite() {
  sfx('click');
  try {
    await navigator.clipboard.writeText(inviteLink());
    toast('Link copiado com sucesso! Envie para o desafiante.');
  } catch (_) {
    toast('Código da sala: ' + roomCode);
  }
}

window.addEventListener('beforeunload', () => {
  if (net) net.send({ t: 'bye' });
  if (directory) directory.unannounce();
});

// Atalhos de teclado (Enter para submeter) e sincronização
els.code.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') {
    sfx('select');
    joinRoom();
  }
});
els.code.addEventListener('input', () => {
  els.code.value = els.code.value.toUpperCase();
});

els.modalInpName.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') {
    els.btnAvatarDone.click();
  }
});

// Desbloqueia áudio Web Audio na primeira interação do usuário
window.addEventListener('pointerdown', ensureAudio, { passive: true });
window.addEventListener('keydown', ensureAudio, { passive: true });

// Delegated hover sound universal para console feedback
document.addEventListener('mouseover', (e) => {
  const target = e.target.closest('button, .catalog-card, .game-card, .room-row, .avatar-choice-btn, .preset-btn, .mode-btn');
  if (target && !target.disabled) {
    playHoverSound();
  }
});

// Salva apelido ao digitar
els.name.addEventListener('change', () => {
  saveProfile(myAvatar, myName());
});
els.name.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') {
    saveProfile(myAvatar, myName());
    els.name.blur();
    toast('Apelido atualizado!');
  }
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

// Inicializa perfil, catálogo, modais e reações
loadProfile();
renderCatalog();
setupAvatarModal();
setupReactions();

const params = new URLSearchParams(location.search);
const salaParam = (params.get('sala') || '').toUpperCase();
if (salaParam) {
  els.code.value = salaParam;
  $('btn-join').classList.add('primary');
}

show('menu');
if (typeof Peer !== 'undefined') startRoomsPolling();
requestAnimationFrame(loop);

// Gancho somente-leitura para depuração/testes automatizados
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
  get avatars() { return avatars; },
  get myAvatar() { return myAvatar; },
  triggerReaction,
};
