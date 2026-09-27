// Sistema de Ícones Vetoriais SVG Profissionais para o Hub Arcade.
// Elimina emojis do sistema, garantindo visual moderno, sóbrio e idêntico em qualquer OS.

export const ICONS = {
  // Logo Principal do Hub (Gamepad Cibernético)
  brand: `
    <svg viewBox="0 0 28 28" fill="none" xmlns="http://www.w3.org/2000/svg" class="svg-icon brand-svg">
      <path d="M4 10C4 7.79086 5.79086 6 8 6H20C22.2091 6 24 7.79086 24 10V18C24 20.2091 22.2091 22 20 22H18L15 20H13L10 22H8C5.79086 22 4 20.2091 4 18V10Z" fill="url(#brandGrad)" stroke="rgba(255,255,255,0.2)" stroke-width="1.2"/>
      <path d="M8 13H12M10 11V15" stroke="#ffffff" stroke-width="1.8" stroke-linecap="round"/>
      <circle cx="17.5" cy="12" r="1.3" fill="#00f0ff"/>
      <circle cx="19.5" cy="14" r="1.3" fill="#10b981"/>
      <circle cx="17.5" cy="16" r="1.3" fill="#fbbf24"/>
      <circle cx="15.5" cy="14" r="1.3" fill="#f43f5e"/>
      <defs>
        <linearGradient id="brandGrad" x1="4" y1="6" x2="24" y2="22" gradientUnits="userSpaceOnUse">
          <stop stop-color="#1e293b"/>
          <stop offset="1" stop-color="#0f172a"/>
        </linearGradient>
      </defs>
    </svg>`,

  // Áudio Ligado
  audioOn: `
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="svg-icon">
      <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"></polygon>
      <path d="M15.54 8.46a5 5 0 0 1 0 7.07"></path>
      <path d="M19.07 4.93a10 10 0 0 1 0 14.14"></path>
    </svg>`,

  // Áudio Mudo
  audioMuted: `
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="svg-icon muted-svg">
      <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"></polygon>
      <line x1="23" y1="9" x2="17" y2="15"></line>
      <line x1="17" y1="9" x2="23" y2="15"></line>
    </svg>`,

  // Espectador / Olho
  eye: `
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="svg-icon">
      <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path>
      <circle cx="12" cy="12" r="3"></circle>
    </svg>`,

  // Editar Perfil (Lápis / Caneta)
  edit: `
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="svg-icon">
      <path d="M12 20h9"></path>
      <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"></path>
    </svg>`,

  // Criar Sala (Raio / Foguete Gamer)
  create: `
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" class="svg-icon btn-action-svg">
      <path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z"></path>
    </svg>`,

  // Entrar em Sala (Seta de Acesso)
  join: `
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" class="svg-icon">
      <line x1="5" y1="12" x2="19" y2="12"></line>
      <polyline points="12 5 19 12 12 19"></polyline>
    </svg>`,

  // Jogar Local 2P (Controles em Duelo)
  local2p: `
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="svg-icon">
      <rect x="2" y="6" width="20" height="12" rx="4"></rect>
      <line x1="6" y1="12" x2="10" y2="12"></line>
      <line x1="8" y1="10" x2="8" y2="14"></line>
      <circle cx="15" cy="11" r="1" fill="currentColor"></circle>
      <circle cx="17" cy="13" r="1" fill="currentColor"></circle>
    </svg>`,

  // Atualizar Lista (Sincronização Circular)
  refresh: `
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="svg-icon">
      <polyline points="23 4 23 10 17 10"></polyline>
      <polyline points="1 20 1 14 7 14"></polyline>
      <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"></path>
    </svg>`,

  // Copiar Link / Prancheta
  copy: `
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="svg-icon">
      <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
      <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
    </svg>`,

  // Fechar Modal
  close: `
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" class="svg-icon">
      <line x1="18" y1="6" x2="6" y2="18"></line>
      <line x1="6" y1="6" x2="18" y2="18"></line>
    </svg>`,

  // Modo Casual (Alvo / Dardo)
  modeCasual: `
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="svg-icon">
      <circle cx="12" cy="12" r="10"></circle>
      <circle cx="12" cy="12" r="6"></circle>
      <circle cx="12" cy="12" r="2"></circle>
    </svg>`,

  // Modo Torneio (Troféu Esports)
  modeTorneio: `
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="svg-icon">
      <path d="M6 9H4.5a2.5 2.5 0 0 1 0-5H6"></path>
      <path d="M18 9h1.5a2.5 2.5 0 0 0 0-5H18"></path>
      <path d="M4 22h16"></path>
      <path d="M10 14.66V18c0 .55-.45 1-1 1H8v3h8v-3h-1c-.55 0-1-.45-1-1v-3.34"></path>
      <path d="M6 4h12v6a6 6 0 0 1-12 0V4z"></path>
    </svg>`,

  // Troféu Grande Campeão
  grandTrophy: `
    <svg viewBox="0 0 64 64" fill="none" xmlns="http://www.w3.org/2000/svg" class="grand-trophy-svg">
      <defs>
        <linearGradient id="goldGrad" x1="10" y1="8" x2="54" y2="56" gradientUnits="userSpaceOnUse">
          <stop stop-color="#fff3b0"/>
          <stop offset="0.3" stop-color="#f59e0b"/>
          <stop offset="0.7" stop-color="#d97706"/>
          <stop offset="1" stop-color="#78350f"/>
        </linearGradient>
        <linearGradient id="goldGleam" x1="0" y1="0" x2="64" y2="0" gradientUnits="userSpaceOnUse">
          <stop stop-color="rgba(255,255,255,0.8)"/>
          <stop offset="1" stop-color="rgba(255,255,255,0)"/>
        </linearGradient>
      </defs>
      <!-- Base e Pedestal -->
      <rect x="18" y="52" width="28" height="6" rx="2" fill="#1e293b" stroke="#334155" stroke-width="1.5"/>
      <path d="M24 44H40L38 52H26L24 44Z" fill="url(#goldGrad)"/>
      <path d="M28 34H36V44H28V34Z" fill="url(#goldGrad)"/>
      <!-- Bojo da Taça -->
      <path d="M16 10H48V26C48 34.8366 40.8366 42 32 42C23.1634 42 16 34.8366 16 26V10Z" fill="url(#goldGrad)"/>
      <!-- Alças Laterais -->
      <path d="M16 14H10C7.79086 14 6 15.7909 6 18V22C6 26.4183 9.58172 30 14 30H16" stroke="url(#goldGrad)" stroke-width="4" stroke-linecap="round"/>
      <path d="M48 14H54C56.2091 14 58 15.7909 58 18V22C58 26.4183 54.4183 30 50 30H48" stroke="url(#goldGrad)" stroke-width="4" stroke-linecap="round"/>
      <!-- Estrela Central -->
      <polygon points="32,16 34.5,23 42,23 36,27.5 38.5,34.5 32,30 25.5,34.5 28,27.5 22,23 29.5,23" fill="#ffffff" opacity="0.95"/>
    </svg>`,

  // Play / Iniciar
  play: `
    <svg viewBox="0 0 24 24" fill="currentColor" class="svg-icon play-svg">
      <polygon points="5 3 19 12 5 21 5 3"></polygon>
    </svg>`,
};

// Badges Vetoriais dos 10 Jogos — Substituem os emojis toscos por ilustrações SVG vetoriais afiadas
export const GAME_BADGES = {
  sinuca: `
    <svg viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg" class="game-badge-svg">
      <rect width="48" height="48" rx="12" fill="#0f291e"/>
      <circle cx="24" cy="24" r="16" fill="#1b2438"/>
      <!-- Bola 8 com highlight 3D -->
      <circle cx="24" cy="24" r="14" fill="#181b22"/>
      <ellipse cx="20" cy="18" rx="5" ry="3" fill="rgba(255,255,255,0.22)"/>
      <circle cx="24" cy="24" r="6" fill="#ffffff"/>
      <text x="24" y="27.5" font-size="9" font-family="system-ui, sans-serif" font-weight="900" fill="#111827" text-anchor="middle">8</text>
      <!-- Taco sutil estilizado -->
      <line x1="8" y1="40" x2="16" y2="32" stroke="#d97706" stroke-width="2.5" stroke-linecap="round"/>
      <line x1="16" y1="32" x2="18" y2="30" stroke="#f8fafc" stroke-width="2" stroke-linecap="round"/>
    </svg>`,

  cobrinha: `
    <svg viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg" class="game-badge-svg">
      <rect width="48" height="48" rx="12" fill="#0c1e28"/>
      <!-- Cyber serpent corpo -->
      <path d="M12 36C12 28 20 28 20 20C20 12 28 12 32 16C36 20 34 26 28 26C22 26 22 34 16 36H12Z" fill="url(#snakeGrad)"/>
      <!-- Cabeça com olhos de serpente -->
      <circle cx="34" cy="17" r="7" fill="#00f0ff"/>
      <circle cx="36" cy="15" r="2.2" fill="#ffffff"/>
      <circle cx="36.5" cy="15" r="1.1" fill="#090d16"/>
      <!-- Orbe de comida neon -->
      <circle cx="16" cy="14" r="3.5" fill="#f43f5e"/>
      <circle cx="16" cy="14" r="1.5" fill="#ffffff"/>
      <defs>
        <linearGradient id="snakeGrad" x1="12" y1="36" x2="36" y2="14" gradientUnits="userSpaceOnUse">
          <stop stop-color="#00f0ff"/>
          <stop offset="0.5" stop-color="#10b981"/>
          <stop offset="1" stop-color="#06b6d4"/>
        </linearGradient>
      </defs>
    </svg>`,

  tanques: `
    <svg viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg" class="game-badge-svg">
      <rect width="48" height="48" rx="12" fill="#241410"/>
      <!-- Esteiras do tanque -->
      <rect x="12" y="13" width="24" height="6" rx="2" fill="#334155" stroke="#475569" stroke-width="1"/>
      <rect x="12" y="29" width="24" height="6" rx="2" fill="#334155" stroke="#475569" stroke-width="1"/>
      <!-- Casco blindado -->
      <rect x="15" y="16" width="18" height="16" rx="3" fill="#ff5533" stroke="#ff7755" stroke-width="1.2"/>
      <!-- Torre e canhão duplo de laser -->
      <circle cx="24" cy="24" r="6" fill="#1e293b" stroke="#94a3b8" stroke-width="1.2"/>
      <line x1="28" y1="22.5" x2="39" y2="22.5" stroke="#00f0ff" stroke-width="2.5" stroke-linecap="round"/>
      <line x1="28" y1="25.5" x2="39" y2="25.5" stroke="#00f0ff" stroke-width="2.5" stroke-linecap="round"/>
    </svg>`,

  airhockey: `
    <svg viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg" class="game-badge-svg">
      <rect width="48" height="48" rx="12" fill="#0d1f2d"/>
      <!-- Rink lines -->
      <line x1="24" y1="8" x2="24" y2="40" stroke="rgba(255,255,255,0.15)" stroke-width="2"/>
      <circle cx="24" cy="24" r="8" stroke="rgba(255,255,255,0.15)" stroke-width="2"/>
      <!-- Malho / Striker -->
      <circle cx="16" cy="24" r="9" fill="#ef4444" stroke="#fca5a5" stroke-width="1.5"/>
      <circle cx="16" cy="24" r="4.5" fill="#991b1b"/>
      <!-- Disco / Puck em velocidade -->
      <circle cx="34" cy="24" r="6" fill="#0f172a" stroke="#00f0ff" stroke-width="2"/>
      <line x1="26" y1="21" x2="30" y2="21" stroke="#00f0ff" stroke-width="1.5" stroke-linecap="round"/>
      <line x1="25" y1="27" x2="29" y2="27" stroke="#00f0ff" stroke-width="1.5" stroke-linecap="round"/>
    </svg>`,

  pingpong: `
    <svg viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg" class="game-badge-svg">
      <rect width="48" height="48" rx="12" fill="#132338"/>
      <!-- Raquete Azul -->
      <circle cx="20" cy="20" r="10" fill="#3b82f6" stroke="#60a5fa" stroke-width="1.5"/>
      <line x1="14" y1="26" x2="8" y2="34" stroke="#d97706" stroke-width="3" stroke-linecap="round"/>
      <!-- Bola com rastro -->
      <circle cx="34" cy="18" r="4" fill="#fbbf24"/>
      <path d="M26 26C30 24 32 20 34 18" stroke="rgba(251, 191, 36, 0.4)" stroke-width="2" stroke-linecap="round"/>
    </svg>`,

  futebol: `
    <svg viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg" class="game-badge-svg">
      <rect width="48" height="48" rx="12" fill="#0f2b1d"/>
      <!-- Disco de Botão Dourado/Verde -->
      <circle cx="24" cy="24" r="15" fill="#15803d" stroke="#4ade80" stroke-width="2"/>
      <circle cx="24" cy="24" r="11" fill="#166534"/>
      <text x="24" y="28" font-size="11" font-family="system-ui, sans-serif" font-weight="900" fill="#ffffff" text-anchor="middle">10</text>
      <!-- Mini bola clássica -->
      <circle cx="37" cy="13" r="4" fill="#ffffff" stroke="#0f172a" stroke-width="1"/>
    </svg>`,

  boliche: `
    <svg viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg" class="game-badge-svg">
      <rect width="48" height="48" rx="12" fill="#2d1c08"/>
      <!-- Pino clássico -->
      <path d="M24 10C21.5 10 21 14 22 17C20 20 18 24 18 32C18 36 21 37 24 37C27 37 30 36 30 32C30 24 28 20 26 17C27 14 26.5 10 24 10Z" fill="#f8fafc"/>
      <rect x="21" y="16" width="6" height="2" fill="#ef4444"/>
      <rect x="20.5" y="19.5" width="7" height="2" fill="#ef4444"/>
      <!-- Bola azul de boliche -->
      <circle cx="34" cy="31" r="7" fill="#1d4ed8"/>
      <circle cx="32" cy="29" r="1" fill="#ffffff"/>
      <circle cx="35" cy="28" r="1" fill="#ffffff"/>
      <circle cx="34" cy="32" r="1" fill="#ffffff"/>
    </svg>`,

  golf: `
    <svg viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg" class="game-badge-svg">
      <rect width="48" height="48" rx="12" fill="#0d2b22"/>
      <!-- Bandeira no buraco -->
      <ellipse cx="24" cy="36" rx="9" ry="4" fill="#064e3b"/>
      <ellipse cx="24" cy="36" rx="4" ry="2" fill="#022c22"/>
      <line x1="24" y1="12" x2="24" y2="36" stroke="#e2e8f0" stroke-width="2" stroke-linecap="round"/>
      <polygon points="24,12 36,17 24,22" fill="#ef4444"/>
      <!-- Bola com covinhas -->
      <circle cx="15" cy="34" r="3.5" fill="#f8fafc"/>
    </svg>`,

  pinball: `
    <svg viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg" class="game-badge-svg">
      <rect width="48" height="48" rx="12" fill="#2d0f25"/>
      <!-- Bumper estelar neon -->
      <circle cx="24" cy="18" r="9" fill="#ec4899" stroke="#f472b6" stroke-width="2"/>
      <circle cx="24" cy="18" r="4.5" fill="#ffffff"/>
      <!-- Flippers metálicos -->
      <path d="M12 36L21 34" stroke="#38bdf8" stroke-width="3.5" stroke-linecap="round"/>
      <path d="M36 36L27 34" stroke="#38bdf8" stroke-width="3.5" stroke-linecap="round"/>
      <!-- Esfera cromada -->
      <circle cx="24" cy="29" r="3.5" fill="#e2e8f0" stroke="#94a3b8" stroke-width="1"/>
    </svg>`,

  poker: `
    <svg viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg" class="game-badge-svg">
      <rect width="48" height="48" rx="12" fill="#29150b"/>
      <!-- Carta de Ás -->
      <rect x="12" y="11" width="18" height="26" rx="3" fill="#f8fafc" stroke="#cbd5e1" stroke-width="1.2"/>
      <text x="21" y="27" font-size="14" font-family="system-ui, sans-serif" fill="#0f172a" text-anchor="middle">♠</text>
      <!-- Ficha de poker dourada -->
      <circle cx="33" cy="27" r="8" fill="#d97706" stroke="#fbbf24" stroke-width="2"/>
      <circle cx="33" cy="27" r="4.5" fill="#78350f"/>
    </svg>`,
};

export function getGameBadge(gameId) {
  return GAME_BADGES[gameId] || ICONS.brand;
}

// ---------------------------------------------------------------------------
// 16 Insígnias / Avatares Vetoriais de Esports
// Substituem integralmente emojis toscos por gráficos SVG estilizados em alta definição.
// ---------------------------------------------------------------------------
export const AVATAR_LIST = [
  { id: 'fox', name: 'Ronin Fox', emoji: '🦊' },
  { id: 'bot', name: 'Cyber Droid', emoji: '🤖' },
  { id: 'ghost', name: 'Pixel Phantom', emoji: '👾' },
  { id: 'cat', name: 'Neon Panther', emoji: '🐱' },
  { id: 'lion', name: 'Apex Lion', emoji: '🦁' },
  { id: 'tiger', name: 'Cyber Striker', emoji: '🐯' },
  { id: 'panda', name: 'Mecha Bear', emoji: '🐼' },
  { id: 'bolt', name: 'Overcharge', emoji: '⚡' },
  { id: 'dragon', name: 'Draco Synth', emoji: '🐲' },
  { id: 'ninja', name: 'Shadow Shinobi', emoji: '🥷' },
  { id: 'rocket', name: 'Hyper Orbit', emoji: '🚀' },
  { id: 'crown', name: 'Royale Sovereign', emoji: '👑' },
  { id: 'target', name: 'Deadshot', emoji: '🎯' },
  { id: 'fire', name: 'Solar Flare', emoji: '🔥' },
  { id: 'pool8', name: 'Master Cue', emoji: '🎱' },
  { id: 'striker', name: 'Golden Striker', emoji: '⚽' },
];

export const AVATAR_SVGS = {
  fox: `
    <svg viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg" class="svg-avatar">
      <rect width="48" height="48" rx="14" fill="#181326"/>
      <rect x="1" y="1" width="46" height="46" rx="13" stroke="rgba(255, 107, 0, 0.35)" stroke-width="1.5"/>
      <polygon points="12,24 16,8 24,19" fill="#ff6b00"/>
      <polygon points="36,24 32,8 24,19" fill="#ff6b00"/>
      <polygon points="14,21 17,12 22,18" fill="#1e1b2e"/>
      <polygon points="34,21 31,12 26,18" fill="#1e1b2e"/>
      <polygon points="10,24 24,37 38,24 24,18" fill="#ff7a1a"/>
      <polygon points="10,24 16,33 24,37 17,27" fill="#f8fafc"/>
      <polygon points="38,24 32,33 24,37 31,27" fill="#f8fafc"/>
      <polygon points="21,34 27,34 24,38" fill="#0f172a"/>
      <polygon points="16,23 22,25 21,27 15,25" fill="#00f0ff"/>
      <polygon points="32,23 26,25 27,27 33,25" fill="#00f0ff"/>
      <circle cx="18" cy="24.5" r="1" fill="#ffffff"/>
      <circle cx="30" cy="24.5" r="1" fill="#ffffff"/>
    </svg>`,

  bot: `
    <svg viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg" class="svg-avatar">
      <rect width="48" height="48" rx="14" fill="#0c1a29"/>
      <rect x="1" y="1" width="46" height="46" rx="13" stroke="rgba(0, 240, 255, 0.35)" stroke-width="1.5"/>
      <line x1="24" y1="6" x2="24" y2="13" stroke="#00f0ff" stroke-width="2.5" stroke-linecap="round"/>
      <circle cx="24" cy="6" r="3" fill="#00f0ff"/>
      <rect x="7" y="21" width="4" height="12" rx="2" fill="#334155" stroke="#00f0ff" stroke-width="1"/>
      <rect x="37" y="21" width="4" height="12" rx="2" fill="#334155" stroke="#00f0ff" stroke-width="1"/>
      <rect x="10" y="14" width="28" height="26" rx="6" fill="#1e293b" stroke="#475569" stroke-width="1.5"/>
      <rect x="13" y="19" width="22" height="11" rx="4" fill="#020617"/>
      <rect x="15" y="21" width="18" height="7" rx="2" fill="#00f0ff"/>
      <circle cx="19" cy="24.5" r="1.5" fill="#ffffff"/>
      <circle cx="29" cy="24.5" r="1.5" fill="#ffffff"/>
      <line x1="17" y1="34" x2="19" y2="34" stroke="#64748b" stroke-width="2" stroke-linecap="round"/>
      <line x1="23" y1="34" x2="25" y2="34" stroke="#64748b" stroke-width="2" stroke-linecap="round"/>
      <line x1="29" y1="34" x2="31" y2="34" stroke="#64748b" stroke-width="2" stroke-linecap="round"/>
    </svg>`,

  ghost: `
    <svg viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg" class="svg-avatar">
      <rect width="48" height="48" rx="14" fill="#1a0e2e"/>
      <rect x="1" y="1" width="46" height="46" rx="13" stroke="rgba(168, 85, 247, 0.4)" stroke-width="1.5"/>
      <path d="M12 25C12 16.1634 17.3726 9 24 9C30.6274 9 36 16.1634 36 25V39L32 35L28 39L24 35L20 39L16 35L12 39V25Z" fill="url(#ghGrad)" stroke="#c084fc" stroke-width="1.5"/>
      <rect x="17" y="20" width="4" height="6" rx="1.5" fill="#00f0ff"/>
      <rect x="27" y="20" width="4" height="6" rx="1.5" fill="#00f0ff"/>
      <rect x="18" y="21" width="2" height="2" fill="#ffffff"/>
      <rect x="28" y="21" width="2" height="2" fill="#ffffff"/>
      <defs>
        <linearGradient id="ghGrad" x1="12" y1="9" x2="36" y2="39" gradientUnits="userSpaceOnUse">
          <stop stop-color="#a855f7"/>
          <stop offset="1" stop-color="#6366f1"/>
        </linearGradient>
      </defs>
    </svg>`,

  cat: `
    <svg viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg" class="svg-avatar">
      <rect width="48" height="48" rx="14" fill="#0d1b1e"/>
      <rect x="1" y="1" width="46" height="46" rx="13" stroke="rgba(16, 185, 129, 0.4)" stroke-width="1.5"/>
      <polygon points="12,22 13,8 23,17" fill="#1e293b"/>
      <polygon points="36,22 35,8 25,17" fill="#1e293b"/>
      <polygon points="14,20 15,12 21,17" fill="#10b981"/>
      <polygon points="34,20 33,12 27,17" fill="#10b981"/>
      <polygon points="12,22 24,38 36,22 29,18 19,18" fill="#0f172a" stroke="#334155" stroke-width="1.2"/>
      <polygon points="16,23 21,24 17,27" fill="#10b981"/>
      <polygon points="32,23 27,24 31,27" fill="#10b981"/>
      <line x1="18.5" y1="23.5" x2="18.5" y2="26.5" stroke="#000000" stroke-width="1.2"/>
      <line x1="29.5" y1="23.5" x2="29.5" y2="26.5" stroke="#000000" stroke-width="1.2"/>
      <polygon points="22.5,31 25.5,31 24,33" fill="#10b981"/>
      <line x1="10" y1="28" x2="18" y2="29" stroke="rgba(255,255,255,0.4)" stroke-width="1"/>
      <line x1="38" y1="28" x2="30" y2="29" stroke="rgba(255,255,255,0.4)" stroke-width="1"/>
    </svg>`,

  lion: `
    <svg viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg" class="svg-avatar">
      <rect width="48" height="48" rx="14" fill="#241505"/>
      <rect x="1" y="1" width="46" height="46" rx="13" stroke="rgba(245, 158, 11, 0.4)" stroke-width="1.5"/>
      <polygon points="24,6 30,12 39,10 38,19 44,25 38,31 40,39 31,38 24,44 17,38 8,39 10,31 4,25 10,19 9,10 18,12" fill="#d97706"/>
      <polygon points="24,10 28,15 35,13 34,20 39,25 34,29 36,35 29,34 24,39 19,34 12,35 14,29 9,25 14,20 13,13 20,15" fill="#f59e0b"/>
      <polygon points="17,19 31,19 33,28 24,36 15,28" fill="#1e293b"/>
      <polygon points="18,23 22,24 19,26" fill="#fbbf24"/>
      <polygon points="30,23 26,24 29,26" fill="#fbbf24"/>
      <circle cx="20" cy="24.5" r="0.8" fill="#000"/>
      <circle cx="28" cy="24.5" r="0.8" fill="#000"/>
      <polygon points="22,30 26,30 24,33" fill="#fbbf24"/>
    </svg>`,

  tiger: `
    <svg viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg" class="svg-avatar">
      <rect width="48" height="48" rx="14" fill="#221008"/>
      <rect x="1" y="1" width="46" height="46" rx="13" stroke="rgba(255, 107, 0, 0.4)" stroke-width="1.5"/>
      <polygon points="10,21 12,9 22,17" fill="#ff6b00"/>
      <polygon points="38,21 36,9 26,17" fill="#ff6b00"/>
      <polygon points="10,21 24,38 38,21 34,16 14,16" fill="#ea580c"/>
      <polygon points="24,16 22,21 26,21" fill="#0f172a"/>
      <polygon points="12,20 18,22 14,24" fill="#0f172a"/>
      <polygon points="36,20 30,22 34,24" fill="#0f172a"/>
      <polygon points="14,27 20,28 17,31" fill="#0f172a"/>
      <polygon points="34,27 28,28 31,31" fill="#0f172a"/>
      <polygon points="17,22 22,23 18,25" fill="#facc15"/>
      <polygon points="31,22 26,23 30,25" fill="#facc15"/>
      <circle cx="19.5" cy="23.5" r="1" fill="#000"/>
      <circle cx="28.5" cy="23.5" r="1" fill="#000"/>
    </svg>`,

  panda: `
    <svg viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg" class="svg-avatar">
      <rect width="48" height="48" rx="14" fill="#0c1722"/>
      <rect x="1" y="1" width="46" height="46" rx="13" stroke="rgba(6, 182, 212, 0.4)" stroke-width="1.5"/>
      <circle cx="14" cy="14" r="6" fill="#0f172a" stroke="#06b6d4" stroke-width="1.2"/>
      <circle cx="34" cy="14" r="6" fill="#0f172a" stroke="#06b6d4" stroke-width="1.2"/>
      <rect x="11" y="15" width="26" height="24" rx="8" fill="#f8fafc"/>
      <ellipse cx="18" cy="24" rx="4.5" ry="5.5" transform="rotate(-15 18 24)" fill="#0f172a"/>
      <ellipse cx="30" cy="24" rx="4.5" ry="5.5" transform="rotate(15 30 24)" fill="#0f172a"/>
      <circle cx="18" cy="24" r="2" fill="#00f0ff"/>
      <circle cx="30" cy="24" r="2" fill="#00f0ff"/>
      <circle cx="18.5" cy="23.5" r="0.7" fill="#ffffff"/>
      <circle cx="30.5" cy="23.5" r="0.7" fill="#ffffff"/>
      <ellipse cx="24" cy="31" rx="2.5" ry="1.8" fill="#0f172a"/>
    </svg>`,

  bolt: `
    <svg viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg" class="svg-avatar">
      <rect width="48" height="48" rx="14" fill="#241e06"/>
      <rect x="1" y="1" width="46" height="46" rx="13" stroke="rgba(251, 191, 36, 0.45)" stroke-width="1.5"/>
      <polygon points="24,8 38,15 38,33 24,40 10,33 10,15" fill="#1e1b2e" stroke="#fbbf24" stroke-width="1.8"/>
      <polygon points="27,11 16,24 23,24 21,37 32,23 25,23" fill="url(#boltAvGrad)"/>
      <polygon points="26,14 18,24 23,24 21,34 29,24 25,24" fill="#ffffff" opacity="0.85"/>
      <defs>
        <linearGradient id="boltAvGrad" x1="16" y1="11" x2="32" y2="37" gradientUnits="userSpaceOnUse">
          <stop stop-color="#fffbeb"/>
          <stop offset="0.3" stop-color="#fbbf24"/>
          <stop offset="1" stop-color="#f59e0b"/>
        </linearGradient>
      </defs>
    </svg>`,

  dragon: `
    <svg viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg" class="svg-avatar">
      <rect width="48" height="48" rx="14" fill="#0a2118"/>
      <rect x="1" y="1" width="46" height="46" rx="13" stroke="rgba(16, 185, 129, 0.4)" stroke-width="1.5"/>
      <path d="M16 16L10 8C14 10 17 12 19 15" fill="#10b981"/>
      <path d="M32 16L38 8C34 10 31 12 29 15" fill="#10b981"/>
      <polygon points="15,16 33,16 36,26 24,40 12,26" fill="#047857" stroke="#34d399" stroke-width="1.2"/>
      <polygon points="18,17 30,17 33,24 24,34 15,24" fill="#065f46"/>
      <polygon points="24,19 21,24 24,27 27,24" fill="#10b981"/>
      <polygon points="16,21 21,22 17,25" fill="#34d399"/>
      <polygon points="32,21 27,22 31,25" fill="#34d399"/>
      <line x1="18.5" y1="21.5" x2="18.5" y2="24.5" stroke="#000000" stroke-width="1.2"/>
      <line x1="29.5" y1="21.5" x2="29.5" y2="24.5" stroke="#000000" stroke-width="1.2"/>
    </svg>`,

  ninja: `
    <svg viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg" class="svg-avatar">
      <rect width="48" height="48" rx="14" fill="#14141e"/>
      <rect x="1" y="1" width="46" height="46" rx="13" stroke="rgba(239, 68, 68, 0.4)" stroke-width="1.5"/>
      <ellipse cx="24" cy="24" rx="15" ry="16" fill="#0f172a" stroke="#334155" stroke-width="1.5"/>
      <path d="M9 18C13 16 35 16 39 18V21C35 19 13 19 9 21V18Z" fill="#ef4444"/>
      <circle cx="24" cy="19" r="2.2" fill="#ffffff"/>
      <rect x="14" y="22" width="20" height="7" rx="3" fill="#020617"/>
      <polygon points="16,24.5 21,25.5 17,26.5" fill="#f43f5e"/>
      <polygon points="32,24.5 27,25.5 31,26.5" fill="#f43f5e"/>
      <circle cx="18" cy="25.5" r="0.8" fill="#ffffff"/>
      <circle cx="30" cy="25.5" r="0.8" fill="#ffffff"/>
      <path d="M12 28C16 31 32 31 36 28V33C32 37 16 37 12 33V28Z" fill="#1e293b"/>
    </svg>`,

  rocket: `
    <svg viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg" class="svg-avatar">
      <rect width="48" height="48" rx="14" fill="#0c182b"/>
      <rect x="1" y="1" width="46" height="46" rx="13" stroke="rgba(56, 189, 248, 0.4)" stroke-width="1.5"/>
      <path d="M24 7C19 14 17 25 17 31H31C31 25 29 14 24 7Z" fill="#e2e8f0" stroke="#94a3b8" stroke-width="1.2"/>
      <polygon points="17,26 9,33 17,32" fill="#38bdf8"/>
      <polygon points="31,26 39,33 31,32" fill="#38bdf8"/>
      <circle cx="24" cy="18" r="4.5" fill="#0284c7" stroke="#38bdf8" stroke-width="1.2"/>
      <circle cx="25" cy="17" r="1.5" fill="#ffffff"/>
      <rect x="20" y="31" width="8" height="3" fill="#64748b"/>
      <polygon points="21,34 27,34 24,43" fill="#f59e0b"/>
      <polygon points="22.5,34 25.5,34 24,39" fill="#ffffff"/>
    </svg>`,

  crown: `
    <svg viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg" class="svg-avatar">
      <rect width="48" height="48" rx="14" fill="#241a06"/>
      <rect x="1" y="1" width="46" height="46" rx="13" stroke="rgba(251, 191, 36, 0.45)" stroke-width="1.5"/>
      <polygon points="10,34 38,34 38,20 31,27 24,14 17,27 10,20" fill="url(#crAvGrad)" stroke="#fef08a" stroke-width="1.2"/>
      <rect x="10" y="32" width="28" height="5" rx="1.5" fill="#b45309" stroke="#fbbf24" stroke-width="1"/>
      <circle cx="16" cy="34.5" r="1.5" fill="#00f0ff"/>
      <circle cx="24" cy="34.5" r="1.5" fill="#10b981"/>
      <circle cx="32" cy="34.5" r="1.5" fill="#ef4444"/>
      <circle cx="24" cy="14" r="2" fill="#ffffff"/>
      <circle cx="10" cy="20" r="1.5" fill="#fef08a"/>
      <circle cx="38" cy="20" r="1.5" fill="#fef08a"/>
      <defs>
        <linearGradient id="crAvGrad" x1="10" y1="14" x2="38" y2="37" gradientUnits="userSpaceOnUse">
          <stop stop-color="#fde047"/>
          <stop offset="0.5" stop-color="#f59e0b"/>
          <stop offset="1" stop-color="#d97706"/>
        </linearGradient>
      </defs>
    </svg>`,

  target: `
    <svg viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg" class="svg-avatar">
      <rect width="48" height="48" rx="14" fill="#240c14"/>
      <rect x="1" y="1" width="46" height="46" rx="13" stroke="rgba(244, 63, 94, 0.45)" stroke-width="1.5"/>
      <circle cx="24" cy="24" r="15" stroke="rgba(244, 63, 94, 0.3)" stroke-width="2"/>
      <circle cx="24" cy="24" r="10" stroke="#f43f5e" stroke-width="2"/>
      <line x1="24" y1="6" x2="24" y2="15" stroke="#f43f5e" stroke-width="2.5" stroke-linecap="round"/>
      <line x1="24" y1="33" x2="24" y2="42" stroke="#f43f5e" stroke-width="2.5" stroke-linecap="round"/>
      <line x1="6" y1="24" x2="15" y2="24" stroke="#f43f5e" stroke-width="2.5" stroke-linecap="round"/>
      <line x1="33" y1="24" x2="42" y2="24" stroke="#f43f5e" stroke-width="2.5" stroke-linecap="round"/>
      <circle cx="24" cy="24" r="3" fill="#ffffff"/>
      <circle cx="24" cy="24" r="1.5" fill="#f43f5e"/>
    </svg>`,

  fire: `
    <svg viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg" class="svg-avatar">
      <rect width="48" height="48" rx="14" fill="#240f06"/>
      <rect x="1" y="1" width="46" height="46" rx="13" stroke="rgba(249, 115, 22, 0.45)" stroke-width="1.5"/>
      <path d="M24 7C24 7 28 14 26 19C28 17 31 16 33 19C36 23 35 29 32 34C29 38 24 41 20 40C14 38 11 31 13 25C14 21 17 19 18 16C19 20 22 21 23 18C25 14 24 7 24 7Z" fill="url(#fireAvGrad)" stroke="#fdba74" stroke-width="1.2"/>
      <path d="M24 19C25 24 28 25 28 29C28 32 26 35 23 35C20 35 18 32 19 28C19 26 21 24 22 22C22 25 24 25 24 19Z" fill="#ffffff" opacity="0.9"/>
      <defs>
        <linearGradient id="fireAvGrad" x1="12" y1="7" x2="35" y2="41" gradientUnits="userSpaceOnUse">
          <stop stop-color="#fed7aa"/>
          <stop offset="0.3" stop-color="#f97316"/>
          <stop offset="0.8" stop-color="#ea580c"/>
          <stop offset="1" stop-color="#b91c1c"/>
        </linearGradient>
      </defs>
    </svg>`,

  pool8: `
    <svg viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg" class="svg-avatar">
      <rect width="48" height="48" rx="14" fill="#0b1e16"/>
      <rect x="1" y="1" width="46" height="46" rx="13" stroke="rgba(16, 185, 129, 0.4)" stroke-width="1.5"/>
      <line x1="8" y1="40" x2="40" y2="8" stroke="#d97706" stroke-width="2.5" stroke-linecap="round"/>
      <line x1="8" y1="8" x2="40" y2="40" stroke="#d97706" stroke-width="2.5" stroke-linecap="round"/>
      <circle cx="24" cy="24" r="14" fill="#181b22" stroke="#334155" stroke-width="1.2"/>
      <ellipse cx="20" cy="18" rx="5" ry="3" fill="rgba(255,255,255,0.25)"/>
      <circle cx="24" cy="24" r="6" fill="#ffffff"/>
      <text x="24" y="27.5" font-size="9" font-family="system-ui, sans-serif" font-weight="900" fill="#0f172a" text-anchor="middle">8</text>
    </svg>`,

  striker: `
    <svg viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg" class="svg-avatar">
      <rect width="48" height="48" rx="14" fill="#091f12"/>
      <rect x="1" y="1" width="46" height="46" rx="13" stroke="rgba(34, 197, 94, 0.4)" stroke-width="1.5"/>
      <circle cx="24" cy="24" r="14" fill="#f8fafc" stroke="#15803d" stroke-width="2"/>
      <polygon points="24,14 27.5,17 26,21 22,21 20.5,17" fill="#0f172a"/>
      <polygon points="14,24 16,21 20,23 20,27 16,28" fill="#0f172a"/>
      <polygon points="34,24 32,21 28,23 28,27 32,28" fill="#0f172a"/>
      <polygon points="18,33 21,29 27,29 30,33 24,35" fill="#0f172a"/>
      <polygon points="24,5 25.5,9 30,9 26.5,11.5 28,15.5 24,13 20,15.5 21.5,11.5 18,9 22.5,9" fill="#fbbf24"/>
    </svg>`,
};

const AVATAR_KEY_MAP = {};
for (const a of AVATAR_LIST) {
  AVATAR_KEY_MAP[a.id] = a.id;
  AVATAR_KEY_MAP[a.emoji] = a.id;
}

export function normalizeAvatarKey(key) {
  if (!key) return 'fox';
  return AVATAR_KEY_MAP[key] || 'fox';
}

export function getAvatarSvg(key, className = 'svg-avatar') {
  const normKey = normalizeAvatarKey(key);
  const rawSvg = AVATAR_SVGS[normKey] || AVATAR_SVGS.fox;
  if (!className || className === 'svg-avatar') return rawSvg;
  return rawSvg.replace('class="svg-avatar"', `class="svg-avatar ${className}"`);
}

// ---------------------------------------------------------------------------
// Reações Rápidas P2P (Quick Reactions & Chat)
// Substituem botões de emojis crus por crachás táticos vetoriais
// ---------------------------------------------------------------------------
export const REACTION_LIST = [
  { id: 'fire', label: 'Fogo', emoji: '🔥', title: 'Pegando fogo!' },
  { id: 'target', label: 'Na Mosca', emoji: '🎯', title: 'Na mosca!' },
  { id: 'crown', label: 'Mestre', emoji: '👑', title: 'Jogada de Mestre!' },
  { id: 'gg', label: 'GG', emoji: '🤝', title: 'Bom jogo!' },
  { id: 'clap', label: 'Palmas', emoji: '👏', title: 'Palmas!' },
  { id: 'bolt', label: 'Incrível', emoji: '⚡', title: 'Inacreditável!' },
  { id: 'skull', label: 'Que Fase', emoji: '💀', title: 'Que fase!' },
  { id: 'sparkle', label: 'Show', emoji: '✨', title: 'Espetacular!' },
];

export const REACTION_SVGS = {
  fire: `
    <svg viewBox="0 0 24 24" fill="none" stroke="#f97316" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="svg-reaction">
      <path d="M8.5 14.5A2.5 2.5 0 0 0 11 12c0-1.38-.5-2-1-3-1.072-2.143-.224-4.054 2-6 .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7 7 0 1 1-14 0c0-1.153.433-2.294 1-3a2.5 2.5 0 0 0 2.5 2.5z"/>
    </svg>`,

  target: `
    <svg viewBox="0 0 24 24" fill="none" stroke="#f43f5e" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="svg-reaction">
      <circle cx="12" cy="12" r="10"/>
      <circle cx="12" cy="12" r="6"/>
      <circle cx="12" cy="12" r="2"/>
    </svg>`,

  crown: `
    <svg viewBox="0 0 24 24" fill="none" stroke="#fbbf24" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="svg-reaction">
      <path d="M2 19h20v2H2zM3 5l4 6 5-8 5 8 4-6v11H3z"/>
    </svg>`,

  gg: `
    <svg viewBox="0 0 24 24" fill="none" stroke="#10b981" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="svg-reaction">
      <path d="M18 11l-4.5 4.5a3.5 3.5 0 0 1-5 0L4 11"/>
      <path d="M14 6l4 4"/>
      <path d="M6 14l-2-2a3 3 0 0 1 0-4.24l2-2a3 3 0 0 1 4.24 0L12 7.5"/>
      <path d="M16 11.5l2 2a3 3 0 0 1 0 4.24l-2 2a3 3 0 0 1-4.24 0L10 18"/>
    </svg>`,

  clap: `
    <svg viewBox="0 0 24 24" fill="none" stroke="#38bdf8" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="svg-reaction">
      <path d="M14 11V6a2 2 0 0 0-4 0v9"/>
      <path d="M10 9a2 2 0 0 0-4 0v6a6 6 0 0 0 12 0v-4a2 2 0 0 0-4 0"/>
      <path d="M4 14l-2-2"/>
      <path d="M6 6l-2-2"/>
      <path d="M18 4l2-2"/>
    </svg>`,

  bolt: `
    <svg viewBox="0 0 24 24" fill="none" stroke="#eab308" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="svg-reaction">
      <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/>
    </svg>`,

  skull: `
    <svg viewBox="0 0 24 24" fill="none" stroke="#94a3b8" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="svg-reaction">
      <path d="M9 18v3h6v-3"/>
      <path d="M10 21h4"/>
      <circle cx="9" cy="12" r="1.5" fill="currentColor"/>
      <circle cx="15" cy="12" r="1.5" fill="currentColor"/>
      <path d="M6 12a6 6 0 1 1 12 0c0 3.5-2.5 6-3 6H9c-.5 0-3-2.5-3-6z"/>
    </svg>`,

  sparkle: `
    <svg viewBox="0 0 24 24" fill="none" stroke="#c084fc" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="svg-reaction">
      <path d="M12 3l1.9 5.8a2 2 0 0 0 1.3 1.3L21 12l-5.8 1.9a2 2 0 0 0-1.3 1.3L12 21l-1.9-5.8a2 2 0 0 0-1.3-1.3L3 12l5.8-1.9a2 2 0 0 0 1.3-1.3L12 3z"/>
    </svg>`,
};

const REACTION_KEY_MAP = {};
for (const r of REACTION_LIST) {
  REACTION_KEY_MAP[r.id] = r.id;
  REACTION_KEY_MAP[r.emoji] = r.id;
}

export function getReactionSvg(key, className = 'svg-reaction') {
  const norm = REACTION_KEY_MAP[key] || 'sparkle';
  const rawSvg = REACTION_SVGS[norm] || REACTION_SVGS.sparkle;
  if (!className || className === 'svg-reaction') return rawSvg;
  return rawSvg.replace('class="svg-reaction"', `class="svg-reaction ${className}"`);
}

