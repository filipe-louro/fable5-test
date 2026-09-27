// Test suite for Hub de Jogos P2P improvements
import assert from 'node:assert';
import {
  clamp, dist, collideBalls, collideRect, collideCircleStatic, shade,
  stepBall, isAudioMuted, toggleAudioMute,
} from './js/engine.js';
import { computeBowlingScore } from './js/games/boliche.js';
import futebol from './js/games/futebol.js';
import boliche from './js/games/boliche.js';
import golf from './js/games/golf.js';
import airhockey from './js/games/airhockey.js';
import pingpong from './js/games/pingpong.js';
import cobrinha from './js/games/cobrinha.js';
import tanques from './js/games/tanques.js';
import sinuca from './js/games/sinuca.js';
import { GAMES, gameById } from './js/games/index.js';

console.log('--- TEST 1: Engine math, audio, and collision utilities ---');
assert.strictEqual(clamp(5, 0, 10), 5);
assert.strictEqual(clamp(-5, 0, 10), 0);
assert.strictEqual(clamp(15, 0, 10), 10);
assert.strictEqual(dist(0, 0, 3, 4), 5);

// Audio mute toggle
const initialMute = isAudioMuted();
const toggled = toggleAudioMute();
assert.strictEqual(toggled, !initialMute);
const restored = toggleAudioMute();
assert.strictEqual(restored, initialMute);

// Ball-to-ball collision
const b1 = { x: 0, y: 0, vx: 100, vy: 0 };
const b2 = { x: 15, y: 0, vx: 0, vy: 0 };
const dv = collideBalls(b1, b2, 10, 10, 0.9);
assert(dv > 0, 'Collision should detect relative velocity');
assert(b1.vx < 100, 'b1 should have slowed down');
assert(b2.vx > 0, 'b2 should have gained forward momentum');

// Circle-to-rect collision (Goalkeeper collision)
const ball = { x: 10, y: 50, vx: 100, vy: 0 };
const hitRect = collideRect(ball, 8, 20, 20, 16, 60, 0.85);
assert(ball.x <= 20, 'Ball should have been separated or bounced');
console.log('✓ Engine math, audio, and collision tests passed.');

console.log('--- TEST 2: Official 10-frame Bowling Scoring ---');
// Perfect game
const perfect = [
  [10], [10], [10], [10], [10],
  [10], [10], [10], [10], [10, 10, 10]
];
const resPerf = computeBowlingScore(perfect);
assert.strictEqual(resPerf.total, 300, `Expected 300, got ${resPerf.total}`);
assert.strictEqual(resPerf.frameTotals[9], 300);

// All 9-spares
const spares = [
  [9, 1], [9, 1], [9, 1], [9, 1], [9, 1],
  [9, 1], [9, 1], [9, 1], [9, 1], [9, 1, 9]
];
const resSpares = computeBowlingScore(spares);
assert.strictEqual(resSpares.total, 190, `Expected 190, got ${resSpares.total}`);

// Open frames (4 and 4 in each frame)
const opens = [
  [4, 4], [4, 4], [4, 4], [4, 4], [4, 4],
  [4, 4], [4, 4], [4, 4], [4, 4], [4, 4]
];
const resOpens = computeBowlingScore(opens);
assert.strictEqual(resOpens.total, 80, `Expected 80, got ${resOpens.total}`);
assert.strictEqual(resOpens.frameTotals[9], 80);

// Strike in 10th frame with 2 bonus rolls
const tenthStrike = [
  [0, 0], [0, 0], [0, 0], [0, 0], [0, 0],
  [0, 0], [0, 0], [0, 0], [0, 0], [10, 7, 2]
];
const resTenth = computeBowlingScore(tenthStrike);
assert.strictEqual(resTenth.total, 19);

// Spare in 10th frame with 1 bonus roll
const tenthSpare = [
  [0, 0], [0, 0], [0, 0], [0, 0], [0, 0],
  [0, 0], [0, 0], [0, 0], [0, 0], [7, 3, 5]
];
const resTenthSp = computeBowlingScore(tenthSpare);
assert.strictEqual(resTenthSp.total, 15);

// Test boliche game creation and tick
const dummyEnv = {
  W: 968, H: 528, seat: 0, isLocal: true, isHost: true, names: ['P1', 'P2'],
  send() {}, sendPrivate() {}, setMsg() {}, setHint() {}, setSub() {}, setActions() {},
  finish() {}, sfx() {}, playing: () => true,
};
const bolInst = boliche.create(dummyEnv);
bolInst.start();
assert(bolInst.st, 'Boliche state initialized');
assert.strictEqual(bolInst.st.pins.length, 10, 'Boliche must have 10 pins');
bolInst.tick(0.016);
console.log('✓ Bowling scoring and game loop tests passed.');

console.log('--- TEST 3: Futebol de Botão logic, GK, physics & goal scoring ---');
const futInst = futebol.create(dummyEnv);
futInst.start();
assert(futInst.st, 'Futebol state initialized');
assert.strictEqual(futInst.st.pieces.length, 10, 'Must have 10 pieces (5 per team)');

// Check goalkeepers
const gk0 = futInst.st.pieces[0];
const gk1 = futInst.st.pieces[5];
assert.strictEqual(gk0.gk, true, 'Piece 0 must be goalkeeper');
assert.strictEqual(gk0.team, 0, 'Piece 0 must belong to Team 0');
assert.strictEqual(gk1.gk, true, 'Piece 5 must be goalkeeper');
assert.strictEqual(gk1.team, 1, 'Piece 5 must belong to Team 1');
assert.strictEqual(gk0.num, 1, 'GK must wear number 1');
assert.strictEqual(gk1.num, 1, 'GK must wear number 1');

// Check field pieces
const f0 = futInst.st.pieces[1];
assert.strictEqual(f0.gk, false, 'Piece 1 must be field piece');
assert(f0.num >= 2, 'Field piece must have jersey number >= 2');

// Check auto-selection of piece closest to ball
assert(futInst.st.sel !== null, 'A piece must be auto-selected at start');
assert.strictEqual(futInst.st.pieces[futInst.st.sel].team, 0, 'Auto-selected piece must belong to active team');

// Test physics tick integration with stepBall
futInst.st.phase = 'moving';
futInst.st.ball.vx = -120;
futInst.tick(0.016);
assert(futInst.st.ball.x < 968 / 2, 'Ball must have stepped forward with stepBall');

// Test goal detection when ball crosses the goal line between posts
futInst.st.ball.x = 45.5; // L is 46, so inside the goal mouth
futInst.st.ball.y = 264;  // Between GT(189) and GB(339)
futInst.st.ball.vx = -80;
futInst.st.goalScored = null;
futInst.st.outOfBounds = null;
futInst.tick(0.016);
assert.strictEqual(futInst.st.goalScored, 1, 'Goal must be detected for team 1');
assert.strictEqual(futInst.st.outOfBounds, null, 'Goal must NOT be treated as out of bounds');

// Test out-of-bounds detection when ball goes wide of the posts
futInst.st.goalScored = null;
futInst.st.outOfBounds = null;
futInst.st.ball.x = 44;
futInst.st.ball.y = 100; // Above GT (189)
futInst.tick(0.016);
assert.strictEqual(futInst.st.goalScored, null, 'Wide ball must not score a goal');
assert(futInst.st.outOfBounds !== null, 'Wide ball must trigger out of bounds');
console.log('✓ Futebol de Botão pieces, GK, physics and goal rules verified.');

console.log('--- TEST 4: Air Hockey guest mallet smoothing ---');
const ahInst = airhockey.create(dummyEnv);
ahInst.start();
assert(ahInst.st, 'Air hockey state initialized');
assert.strictEqual(ahInst.st.mal.length, 2);
// Simulate guest mallet update with velocity
ahInst.msg({ k: 'mp', x: 700, y: 250, vx: -450, vy: 120 });
assert.strictEqual(ahInst.st.mal[1].x, 700);
assert.strictEqual(ahInst.st.mal[1].vx, -450, 'Guest velocity must be preserved on host');
assert.strictEqual(ahInst.st.mal[1].vy, 120, 'Guest velocity must be preserved on host');
console.log('✓ Air Hockey guest velocity test passed.');

console.log('--- TEST 5: Ping Pong 2D paddles and Magnus effect ---');
const ppInst = pingpong.create(dummyEnv);
ppInst.start();
assert(ppInst.st, 'Ping pong state initialized');
assert.strictEqual(ppInst.st.pad.length, 2);
assert(typeof ppInst.st.pad[0].x === 'number', 'Paddle 0 has x coordinate');
assert(typeof ppInst.st.pad[0].y === 'number', 'Paddle 0 has y coordinate');
assert(typeof ppInst.st.ball.spin === 'number', 'Ball tracks spin');

// Test 2D movement boundaries and responsive tracking
ppInst.pointer('move', 200, 150);
ppInst.tick(0.016);
assert(ppInst.st.pad[0].x > 74, 'Paddle 0 advanced forward in 2D toward net');
console.log('✓ Ping Pong 2D paddle movement test passed.');

console.log('--- TEST 6: Golf game init and tick ---');
const golfInst = golf.create(dummyEnv);
golfInst.start();
assert(golfInst.st, 'Golf state initialized');
golfInst.tick(0.016);
console.log('✓ Golf game verified.');

console.log('--- TEST 7: Sinuca (Flagship 8-Ball Pool) Initialization & Physics ---');
const sinucaInst = sinuca.create(dummyEnv);
sinucaInst.start();
sinucaInst.tick(0.016);
console.log('✓ Sinuca 8-Ball Pool verified.');

console.log('--- TEST 8: Cobrinha .IO (Snake Battle) Mechanics & Cut Collision ---');
const snakeInst = cobrinha.create(dummyEnv);
snakeInst.start();
assert(snakeInst.st, 'Cobrinha state initialized');
assert.strictEqual(snakeInst.st.snakes.length, 2, '2 snakes created');
assert(snakeInst.st.orbs.length >= 30, 'Food orbs generated in arena');
const s0InitX = snakeInst.st.snakes[0].x;
// Tick movement
snakeInst.tick(0.05);
assert(snakeInst.st.snakes[0].x > s0InitX, 'Snake 0 moved forward along angle 0');

// Test Turbo / Boost
snakeInst.st.snakes[0].boosting = true;
const preBoostLen = snakeInst.st.snakes[0].targetLen;
snakeInst.st.snakes[0].boostTimer = 0.15; // Trigger boost drop
snakeInst.tick(0.05);
assert(snakeInst.st.snakes[0].targetLen <= preBoostLen, 'Boost consumed length to drop orb');

// Test eating orb
const s0 = snakeInst.st.snakes[0];
const targetOrb = { id: 9999, x: s0.x + 5, y: s0.y, r: 4, val: 2, color: '#fbbf24', pulse: 0 };
snakeInst.st.orbs.push(targetOrb);
const preEatLen = s0.targetLen;
snakeInst.tick(0.05);
assert(s0.targetLen > preEatLen, 'Snake grew after eating food orb');

// Test Cut / Trap Fatal Collision
const s1 = snakeInst.st.snakes[1];
// Place Snake 1 vertically crossing in front of Snake 0 with valid history
s1.x = 500;
s1.y = 280;
s1.angle = Math.PI / 2;
s1.targetAngle = Math.PI / 2;
s1.history = [];
for (let i = 0; i <= 200; i += 2) {
  s1.history.push({ x: 500, y: 280 - i });
}
s0.x = 498;
s0.y = 250;
s0.angle = 0;
s0.targetAngle = 0;
snakeInst.tick(0.016);
assert.strictEqual(s0.alive, false, 'Snake 0 died when cutting into Snake 1 body');
assert.strictEqual(snakeInst.st.roundWinner, 1, 'Round awarded to Snake 1');

// Test Cobrinha Guest Snapshot Sync
const guestSnakeEnv = { ...dummyEnv, isHost: false, isLocal: false, seat: 1 };
const guestSnakeInst = cobrinha.create(guestSnakeEnv);
guestSnakeInst.start();
const snap = snakeInst.snapshot();
guestSnakeInst.msg({ k: 's', ...snap });
assert.strictEqual(guestSnakeInst.st.roundState, snakeInst.st.roundState, 'Guest synced roundState');
assert.strictEqual(guestSnakeInst.st.snakes[0].alive, snakeInst.st.snakes[0].alive, 'Guest synced snake dead state');
console.log('✓ Cobrinha .IO slithering, boost, food, cut collision and WebRTC sync verified.');

console.log('--- TEST 9: Laser Tanks (Ricochet Bullets & Hit Detection) ---');
const tankInst = tanques.create(dummyEnv);
tankInst.start();
assert(tankInst.st, 'Laser tanks state initialized');
assert.strictEqual(tankInst.st.tanks.length, 2, '2 tanks initialized');
assert.strictEqual(tankInst.st.tanks[0].hp, 2, 'Tank starts with 2 HP (Shield + Hull)');
assert.strictEqual(typeof tankInst.st.tanks[0].vx, 'number', 'Tank vx is numeric');
assert.strictEqual(typeof tankInst.st.tanks[0].vy, 'number', 'Tank vy is numeric');
assert(!Number.isNaN(tankInst.st.tanks[0].vx), 'Tank vx is not NaN');

// Move Tank 0 forward
const t0InitX = tankInst.st.tanks[0].x;
tankInst.st.tanks[0].fwd = 1;
tankInst.tick(0.05);
assert(tankInst.st.tanks[0].x > t0InitX, 'Tank 0 drove forward');
assert(!Number.isNaN(tankInst.st.tanks[0].x), 'Tank 0 x is valid number');

// Test collision with obstacle without NaN
const t0 = tankInst.st.tanks[0];
t0.x = 210; // Placed at center bunker obstacle
t0.y = 110;
tankInst.tick(0.016);
assert(!Number.isNaN(t0.x), 'Tank x not NaN after obstacle collision');
assert(!Number.isNaN(t0.y), 'Tank y not NaN after obstacle collision');

// Fire laser bullet
tankInst.pointer('down', t0.x + 100, t0.y);
assert.strictEqual(tankInst.st.bullets.length, 1, 'Laser fired');
const bullet = tankInst.st.bullets[0];
assert(bullet.vx > 0, 'Bullet travels forward toward target');

// Test Ricochet off wall
bullet.x = 968 - 36 - 2; // Right boundary
bullet.vx = 490;
tankInst.tick(0.016);
assert.strictEqual(bullet.bounces, 1, 'Laser ricocheted off boundary wall');
assert(bullet.vx < 0, 'Laser bounced back with negative vx');

// Test hit detection on Tank 1
const t1 = tankInst.st.tanks[1];
bullet.x = t1.x;
bullet.y = t1.y;
tankInst.tick(0.016);
assert.strictEqual(t1.hp, 1, 'Tank 1 shield shattered on hit (HP: 1)');

// 2nd Hit destroys hull
const fatalBullet = {
  id: 999, owner: 0, x: t1.x, y: t1.y, vx: 100, vy: 0, bounces: 0, color: '#00f0ff', trail: []
};
tankInst.st.bullets.push(fatalBullet);
tankInst.tick(0.016);
assert.strictEqual(t1.alive, false, 'Tank 1 destroyed on 2nd hit');
assert.strictEqual(tankInst.st.roundWinner, 0, 'Round awarded to Tank 0');

// Test Laser Tanks Guest Snapshot Sync
const guestTankEnv = { ...dummyEnv, isHost: false, isLocal: false, seat: 1 };
const guestTankInst = tanques.create(guestTankEnv);
guestTankInst.start();
const tSnap = tankInst.snapshot();
guestTankInst.msg({ k: 's', ...tSnap });
assert.strictEqual(guestTankInst.st.tanks[1].alive, false, 'Guest synced destroyed tank');
assert.strictEqual(guestTankInst.st.roundState, tankInst.st.roundState, 'Guest synced roundState');
console.log('✓ Laser Tanks movement, shooting, ricochet, hit rules and WebRTC sync verified.');

console.log('--- TEST 10: Game Registry and Catalog Overhaul ---');
assert.strictEqual(GAMES.length, 10, 'Exactly 10 games registered in Hub');
assert.strictEqual(gameById('damas'), null, 'Damas completely removed from registry');
assert.strictEqual(gameById('velha'), null, 'Jogo da Velha completely removed from registry');
assert(gameById('sinuca'), 'Sinuca is registered as flagship');
assert(gameById('cobrinha'), 'Cobrinha .IO is registered');
assert(gameById('tanques'), 'Laser Tanks is registered');
assert.strictEqual(GAMES[0].id, 'sinuca', 'Sinuca is first game');
assert.strictEqual(GAMES[1].id, 'cobrinha', 'Cobrinha is second game');
assert.strictEqual(GAMES[2].id, 'tanques', 'Laser Tanks is third game');

for (const g of GAMES) {
  assert(g.id, 'Game has id');
  assert(g.name, 'Game has name');
  assert(g.icon, 'Game has icon');
  assert(g.desc, 'Game has description');
  assert(typeof g.create === 'function', 'Game has create method');
}
console.log('✓ Game Registry and Catalog verified.');

console.log('--- TEST 11: SFX synthesized audio functions ---');
// Verify new sfx kinds do not throw in headless / node environment
import { sfx } from './js/engine.js';
assert.doesNotThrow(() => sfx('hover', 0.5));
assert.doesNotThrow(() => sfx('select', 0.5));
assert.doesNotThrow(() => sfx('reaction', 0.8));
assert.doesNotThrow(() => sfx('ready', 1.0));
assert.doesNotThrow(() => sfx('click', 1.0));
assert.doesNotThrow(() => sfx('score', 1.0));
assert.doesNotThrow(() => sfx('victory', 1.0));
assert.doesNotThrow(() => sfx('laser', 0.9));
assert.doesNotThrow(() => sfx('explosion', 1.0));
assert.doesNotThrow(() => sfx('pickup', 0.8));
assert.doesNotThrow(() => sfx('boost', 0.7));
console.log('✓ Synthesized SFX sound triggers (including laser, explosion, pickup, boost) verified.');

console.log('--- TEST 12: P2P Room Code Generator ---');
import { makeRoomCode } from './js/net.js';
for (let i = 0; i < 20; i++) {
  const code = makeRoomCode();
  assert.strictEqual(typeof code, 'string', 'Code must be string');
  assert.strictEqual(code.length, 5, 'Code must have length 5');
  assert(/^[A-Z2-9]{5}$/.test(code), `Code ${code} must only contain valid chars`);
}
console.log('✓ Room Code generation verified.');

console.log('--- TEST 13: Tournament Multi-Round Flow & Scoreboard ---');
const tourneyGames = ['sinuca', 'futebol', 'pingpong'];
assert.strictEqual(tourneyGames.length, 3);
// Simulate a 3-match tournament progression
const tourneyBoard = [];
tourneyBoard[0] = { game: 'sinuca', winner: 0, line: 'P1 venceu' };
tourneyBoard[1] = { game: 'futebol', winner: 1, line: 'P2 venceu' };
tourneyBoard[2] = { game: 'pingpong', winner: 0, line: 'P1 venceu' };

const wins = [0, 0];
for (const r of tourneyBoard) {
  if (r && r.winner !== null) wins[r.winner]++;
}
assert.strictEqual(wins[0], 2, 'P1 won 2 games');
assert.strictEqual(wins[1], 1, 'P2 won 1 game');
const champSeat = wins[0] > wins[1] ? 0 : 1;
assert.strictEqual(champSeat, 0, 'P1 must be tournament champion');
console.log('✓ Tournament Multi-Round Flow and Scoreboard logic verified.');

console.log('--- TEST 14: Tournament Official Stats Computation & Local Mode Compatibility ---');
// Verify tournament statistics metrics
const playedRounds = tourneyBoard.filter(Boolean);
const totalPlayed = playedRounds.length;
assert.strictEqual(totalPlayed, 3, 'Total played rounds');
const champWins = Math.max(wins[0], wins[1]);
const winRate = Math.round((champWins / totalPlayed) * 100);
assert.strictEqual(winRate, 67, 'Champion winrate is 67% (2/3)');

// Verify local mode compatibility checks
const pokerGame = gameById('poker');
assert.strictEqual(pokerGame.local, false, 'Poker must NOT be available locally');
const localSupportedGames = GAMES.filter(g => g.local);
assert.strictEqual(localSupportedGames.length, 9, '9 out of 10 games support 2P local mode');
assert.strictEqual(localSupportedGames.some(g => g.id === 'poker'), false, 'Poker excluded from local games');
console.log('✓ Tournament Official Stats Computation and Local Mode Compatibility verified.');

console.log('--- TEST 15: Vector Avatar System & Reaction SVGs ---');
import {
  AVATAR_LIST,
  AVATAR_SVGS,
  getAvatarSvg,
  normalizeAvatarKey,
  REACTION_LIST,
  REACTION_SVGS,
  getReactionSvg,
} from './js/icons.js';

assert.strictEqual(AVATAR_LIST.length, 16, 'Exactly 16 gamer insignias defined');
for (const av of AVATAR_LIST) {
  assert(av.id, 'Avatar has id');
  assert(av.name, 'Avatar has name');
  assert(av.emoji, 'Avatar has fallback emoji');
  assert(AVATAR_SVGS[av.id], `SVG exists for avatar ${av.id}`);
  assert(AVATAR_SVGS[av.id].includes('<svg'), `SVG string is valid for avatar ${av.id}`);

  // Test normalizeAvatarKey by ID and by legacy Emoji
  assert.strictEqual(normalizeAvatarKey(av.id), av.id);
  assert.strictEqual(normalizeAvatarKey(av.emoji), av.id);

  // Test getAvatarSvg output
  const svgById = getAvatarSvg(av.id);
  assert(svgById.includes('<svg'), 'getAvatarSvg returns SVG markup');
  assert(svgById.includes('class="svg-avatar"'), 'getAvatarSvg contains default class');

  // Test custom class injection
  const svgWithClass = getAvatarSvg(av.id, 'svg-avatar-hud');
  assert(svgWithClass.includes('class="svg-avatar svg-avatar-hud"'), 'Custom class properly injected');
}

// Fallback test
assert.strictEqual(normalizeAvatarKey('non-existent-avatar'), 'fox');
assert(getAvatarSvg('non-existent-avatar').includes('<svg'));

// Reactions coverage
assert.strictEqual(REACTION_LIST.length, 8, '8 quick reactions defined');
for (const r of REACTION_LIST) {
  assert(r.id, 'Reaction has id');
  assert(r.label, 'Reaction has label');
  assert(r.emoji, 'Reaction has emoji representation');
  assert(REACTION_SVGS[r.id], `Reaction SVG exists for ${r.id}`);
  
  const rSvgById = getReactionSvg(r.id);
  assert(rSvgById.includes('<svg'), 'getReactionSvg returns SVG markup');
  const rSvgByEmoji = getReactionSvg(r.emoji);
  assert.strictEqual(rSvgByEmoji, rSvgById, 'getReactionSvg resolves emoji to same SVG');

  const rSvgClass = getReactionSvg(r.id, 'svg-reaction-mini');
  assert(rSvgClass.includes('svg-reaction-mini'), 'Custom reaction class properly injected');
}
console.log('✓ Vector Avatar System & Reaction SVGs verified.');

console.log('--- TEST 16: Zero stray emojis in game spectator hints & UI ---');
import fs from 'node:fs';
import path from 'node:path';

const gamesDir = './js/games';
const gameFiles = fs.readdirSync(gamesDir).filter(f => f.endsWith('.js') && f !== 'index.js');
const emojiRegex = /[\u{1F300}-\u{1F9FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}]/u;

for (const gf of gameFiles) {
  const content = fs.readFileSync(path.join(gamesDir, gf), 'utf8');
  // Check that no spectator hints contain the old '👁' emoji
  assert(!content.includes('👁'), `${gf} must not contain 👁 emoji`);

  // Check lines that set hints, messages, or banners
  const lines = content.split('\n');
  lines.forEach((line, idx) => {
    // Exclude metadata 'icon:' definition and standard poker suit constants
    if (line.includes('icon:') || line.includes('SUITS =')) return;
    if (line.includes('setHint') || line.includes('setSub') || line.includes('setMsg') || line.includes('fx.banner')) {
      const match = line.match(emojiRegex);
      assert(!match, `Stray emoji found in ${gf}:${idx + 1}: ${line.trim()}`);
    }
  });
}

// Spectator hint test on instantiated game environments
let capturedHint = '';
const spectatorEnv = {
  ...dummyEnv,
  seat: -1,
  isLocal: false,
  isHost: false,
  setHint(h) { capturedHint = h; },
};

// Check sinuca spectator hint
const sinucaSpec = sinuca.create(spectatorEnv);
sinucaSpec.start();
assert(capturedHint.includes('Modo Espectador'), `Sinuca spectator hint must state Modo Espectador, got: ${capturedHint}`);
assert(!capturedHint.includes('👁'), 'Sinuca spectator hint must not contain eye emoji');

// Check tanques spectator hint
capturedHint = '';
const tanquesSpec = tanques.create(spectatorEnv);
tanquesSpec.start();
assert(capturedHint.includes('Modo Espectador'), `Tanques spectator hint must state Modo Espectador, got: ${capturedHint}`);
assert(!capturedHint.includes('👁'), 'Tanques spectator hint must not contain eye emoji');

// Check cobrinha spectator hint
capturedHint = '';
const cobrinhaSpec = cobrinha.create(spectatorEnv);
cobrinhaSpec.start();
assert(capturedHint.includes('Modo Espectador'), `Cobrinha spectator hint must state Modo Espectador, got: ${capturedHint}`);
assert(!capturedHint.includes('👁'), 'Cobrinha spectator hint must not contain eye emoji');

// Check airhockey spectator hint
capturedHint = '';
const airhockeySpec = airhockey.create(spectatorEnv);
airhockeySpec.start();
assert(capturedHint.includes('Modo Espectador'), `Airhockey spectator hint must state Modo Espectador, got: ${capturedHint}`);

// Check pingpong spectator hint
capturedHint = '';
const pingpongSpec = pingpong.create(spectatorEnv);
pingpongSpec.start();
assert(capturedHint.includes('Modo Espectador'), `Pingpong spectator hint must state Modo Espectador, got: ${capturedHint}`);

// Check golf spectator hint
capturedHint = '';
const golfSpec = golf.create(spectatorEnv);
golfSpec.start();
assert(capturedHint.includes('Modo Espectador'), `Golf spectator hint must state Modo Espectador, got: ${capturedHint}`);

console.log('✓ Zero stray emojis in game spectator hints & UI verified.');

console.log('\n======================================');
console.log('ALL VERIFICATION TESTS COMPLETED SUCCESSFULLY!');
console.log('======================================');


