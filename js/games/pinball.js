// Pinball: cada jogador joga 2 bolas (alternando); maior pontuação vence.
// Flippers: setas ◄ ► (ou A / L), ou toque na metade esquerda/direita.
import { collideCircleStatic, collideSegment, throttler, roundRect, drawOrb, clamp } from '../engine.js';

const BALLS_EACH = 2;
const BALL_R = 9;
const GRAV = 1050;

export default {
  id: 'pinball',
  name: 'Pinball',
  icon: '🪩',
  desc: `${BALLS_EACH} bolas cada, maior pontuação vence.`,
  local: true,
  create(env) {
    const MW = 400;
    const MX = (env.W - MW) / 2;
    const MY = 24;
    const MB = env.H - 6; // fundo (dreno)
    const CX = MX + MW / 2;
    const BUMPERS = [
      { x: CX - 85, y: 150, r: 21 },
      { x: CX + 85, y: 150, r: 21 },
      { x: CX, y: 245, r: 21 },
    ];
    // guias que afunilam para os flippers
    const GUIDES = [
      [MX + 12, 350, MX + 118, 442],
      [MX + MW - 12, 350, MX + MW - 118, 442],
    ];
    const FLIP_LEN = 64;
    const PIV_L = { x: MX + 122, y: 452 };
    const PIV_R = { x: MX + MW - 122, y: 452 };
    const REST = 0.55; // rad abaixo da horizontal
    const UP = -0.5; // rad acima quando acionado

    let st = null;
    const sendFrame = throttler(40);
    const controls = (seat) => env.isLocal || env.seat === seat;
    const myBall = () => st && !st.over && controls(st.player) && st.phase === 'play';

    function setUi() {
      env.setSub(0, `<b class="big-score">${st.score[0]}</b> pts · ${st.ballsUsed[0]}/${BALLS_EACH} bolas`);
      env.setSub(1, `<b class="big-score">${st.score[1]}</b> pts · ${st.ballsUsed[1]}/${BALLS_EACH} bolas`);
      if (!st.over) {
        env.setMsg(`Bola de ${env.names[st.player]} (${st.ballsUsed[st.player] + 1}ª de ${BALLS_EACH})`);
        env.setHint(myBall()
          ? 'Flippers: ◄ ► (ou A/L) ou toque na metade esquerda/direita.'
          : env.seat === -1 ? '👁 Assistindo' : `Aguardando ${env.names[st.player]}…`);
      }
    }

    function launch() {
      st.ball = { x: CX + (Math.random() * 60 - 30), y: 70, vx: Math.random() * 120 - 60, vy: 0 };
      st.phase = 'play';
      st.time = 0;
      st.stallT = 0;
    }

    function serialize() {
      return { score: st.score, ballsUsed: st.ballsUsed, player: st.player, over: st.over };
    }

    function applyFull(s) {
      st.score = s.score.slice();
      st.ballsUsed = s.ballsUsed.slice();
      st.player = s.player;
      st.over = s.over;
      st.ball = null;
      st.phase = 'wait';
      if (!st.over && controls(st.player)) launch();
      setUi();
    }

    function drainBall() {
      st.ballsUsed[st.player]++;
      env.sfx('pocket', 0.8);
      st.ball = null;
      st.phase = 'wait';
      const total = st.ballsUsed[0] + st.ballsUsed[1];
      if (total >= BALLS_EACH * 2) {
        st.over = true;
      } else {
        st.player = st.ballsUsed[0] <= st.ballsUsed[1] ? 0 : 1;
      }
      env.send({ k: 'e', s: serialize() });
      setUi();
      if (st.over) {
        const [a, b] = st.score;
        const w = a === b ? null : a > b ? 0 : 1;
        env.finish(w, w === null ? `Empate: ${a} pontos!` : `${env.names[w]} venceu no pinball: ${a} × ${b} pts!`);
      } else if (controls(st.player)) {
        setTimeout(() => { if (st && !st.over && st.phase === 'wait' && controls(st.player)) launch(); }, 900);
      }
    }

    function flipperEnds(side) {
      const piv = side === 0 ? PIV_L : PIV_R;
      const ang = st.flip[side];
      const dir = side === 0 ? 1 : -1;
      return [piv.x, piv.y, piv.x + Math.cos(ang) * FLIP_LEN * dir, piv.y + Math.sin(ang) * FLIP_LEN];
    }

    function physics(h) {
      const b = st.ball;
      b.vy += GRAV * h;
      b.x += b.vx * h;
      b.y += b.vy * h;
      // paredes internas
      if (b.x < MX + 12 + BALL_R && b.vx < 0) { b.x = MX + 12 + BALL_R; b.vx = -b.vx * 0.7; }
      if (b.x > MX + MW - 12 - BALL_R && b.vx > 0) { b.x = MX + MW - 12 - BALL_R; b.vx = -b.vx * 0.7; }
      if (b.y < MY + 12 + BALL_R && b.vy < 0) { b.y = MY + 12 + BALL_R; b.vy = -b.vy * 0.7; st.score[st.player] += 50; env.sfx('score', 0.4); }
      // bumpers
      for (const bp of BUMPERS) {
        const hit = collideCircleStatic(b, BALL_R, bp.x, bp.y, bp.r, 1.0, 1);
        if (hit > 0) {
          const d = Math.hypot(b.x - bp.x, b.y - bp.y) || 1;
          const sp = 470;
          b.vx = ((b.x - bp.x) / d) * sp;
          b.vy = ((b.y - bp.y) / d) * sp;
          st.score[st.player] += 100;
          env.sfx('bumper', 0.9);
          bp.hot = performance.now();
        }
      }
      // guias
      for (const [x1, y1, x2, y2] of GUIDES) {
        collideSegment(b, BALL_R, x1, y1, x2, y2, 6, 0.6);
      }
      // flippers
      for (const side of [0, 1]) {
        const [x1, y1, x2, y2] = flipperEnds(side);
        const kicking = Math.abs(st.flipV[side]) > 2;
        const kick = kicking && st.flipV[side] < 0 ? 620 : 0;
        const hit = collideSegment(b, BALL_R, x1, y1, x2, y2, 8, 0.5, kick);
        if (hit > 200) env.sfx('click', 0.5);
      }
      // anti-travamento
      if (Math.hypot(b.vx, b.vy) < 12) st.stallT += h;
      else st.stallT = 0;
      if (st.stallT > 2.5) {
        b.vx += Math.random() * 160 - 80;
        b.vy -= 140;
        st.stallT = 0;
      }
      st.time += h;
      if (b.y > MB + BALL_R || st.time > 75) {
        drainBall();
      }
    }

    function setFlip(side, active) {
      if (!st) return;
      st.flipTarget[side] = active ? UP : REST;
    }

    return {
      st: null,
      start() {
        st = this.st = {
          score: [0, 0], ballsUsed: [0, 0], player: 0, over: false,
          ball: null, phase: 'wait', time: 0, stallT: 0,
          flip: [REST, REST], flipTarget: [REST, REST], flipV: [0, 0],
        };
        setUi();
        if (controls(0)) launch();
      },
      snapshot() { return serialize(); },
      restore(s) { this.start(); applyFull(s); },
      msg(m) {
        if (m.k === 'f') {
          st.phase = 'watch';
          if (!st.ball) st.ball = { x: 0, y: 0, vx: 0, vy: 0 };
          st.ball.x = m.b[0];
          st.ball.y = m.b[1];
          st.flip = m.fl;
          if (m.sc[0] !== st.score[0] || m.sc[1] !== st.score[1]) {
            st.score = m.sc.slice();
            setUi();
          }
        } else if (m.k === 'e') {
          applyFull(m.s);
        }
      },
      pointer(type, x) {
        if (!myBall()) return;
        if (type === 'down') setFlip(x < env.W / 2 ? 0 : 1, true);
        else if (type === 'up') { setFlip(0, false); setFlip(1, false); }
      },
      key(type, k) {
        if (!myBall()) return;
        const down = type === 'down';
        if (k === 'ArrowLeft' || k === 'a' || k === 'A') setFlip(0, down);
        if (k === 'ArrowRight' || k === 'l' || k === 'L') setFlip(1, down);
      },
      tick(dt) {
        if (!st) return;
        if (st.phase === 'watch') return; // remoto: flippers vêm nos quadros
        // animação dos flippers
        for (const side of [0, 1]) {
          const prev = st.flip[side];
          const target = st.flipTarget[side];
          const d = target - prev;
          const maxStep = 14 * dt;
          st.flip[side] = prev + clamp(d, -maxStep, maxStep);
          st.flipV[side] = (st.flip[side] - prev) / Math.max(dt, 0.001);
        }
        if (st.phase !== 'play' || !myBall()) return;
        let acc = dt;
        while (acc > 0 && st.phase === 'play') {
          const h = Math.min(1 / 240, acc);
          acc -= h;
          physics(h);
        }
        if (st.phase === 'play' && !env.isLocal && sendFrame()) {
          env.send({
            k: 'f',
            b: [Math.round(st.ball.x), Math.round(st.ball.y)],
            fl: [Math.round(st.flip[0] * 100) / 100, Math.round(st.flip[1] * 100) / 100],
            sc: st.score,
          });
        }
      },
      draw(ctx) {
        if (!st) return;
        // gabinete
        roundRect(ctx, MX - 14, MY - 14, MW + 28, env.H - MY, 18);
        ctx.fillStyle = '#3a2a55';
        ctx.fill();
        const felt = ctx.createLinearGradient(0, MY, 0, env.H);
        felt.addColorStop(0, '#241a3d');
        felt.addColorStop(1, '#171029');
        roundRect(ctx, MX, MY, MW, env.H - MY - 6, 12);
        ctx.fillStyle = felt;
        ctx.fill();
        ctx.strokeStyle = 'rgba(255,255,255,0.2)';
        ctx.lineWidth = 3;
        roundRect(ctx, MX + 6, MY + 6, MW - 12, env.H - MY - 16, 10);
        ctx.stroke();
        // bumpers
        for (const bp of BUMPERS) {
          const hot = bp.hot && performance.now() - bp.hot < 140;
          drawOrb(ctx, bp.x, bp.y, bp.r, hot ? '#ffd54d' : '#d8342c');
          ctx.fillStyle = '#fff';
          ctx.font = 'bold 11px system-ui';
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillText('100', bp.x, bp.y);
        }
        // guias
        ctx.strokeStyle = '#8f7bd8';
        ctx.lineCap = 'round';
        ctx.lineWidth = 12;
        for (const [x1, y1, x2, y2] of GUIDES) {
          ctx.beginPath();
          ctx.moveTo(x1, y1);
          ctx.lineTo(x2, y2);
          ctx.stroke();
        }
        // flippers
        ctx.strokeStyle = '#ffd54d';
        ctx.lineWidth = 16;
        for (const side of [0, 1]) {
          const [x1, y1, x2, y2] = flipperEnds(side);
          ctx.beginPath();
          ctx.moveTo(x1, y1);
          ctx.lineTo(x2, y2);
          ctx.stroke();
        }
        // pontuação no vidro
        ctx.fillStyle = 'rgba(255,255,255,0.14)';
        ctx.font = 'bold 40px system-ui';
        ctx.textAlign = 'center';
        ctx.fillText(String(st.score[st.player]), CX, MY + 46);
        // bola
        if (st.ball && (st.phase === 'play' || st.phase === 'watch')) {
          drawOrb(ctx, st.ball.x, st.ball.y, BALL_R, '#d9d9e2');
        }
      },
    };
  },
};
