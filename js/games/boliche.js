// Boliche: 5 frames por jogador, 2 arremessos por frame. Pontuação
// simplificada: pinos derrubados + bônus (strike +5, spare +3).
import { stepBall, collideBalls, AimControl, drawAim, throttler, roundRect, clamp, drawFrame, Trail, Fx, shade } from '../engine.js';

const FRAMES = 5;
const BALL_R = 12;
const PIN_R = 8;
const LANE_TOP = 168;
const LANE_BOT = 360;

function pinSpots(W) {
  const spots = [];
  const bx = W - 210;
  const gap = 30;
  for (let row = 0; row < 4; row++) {
    for (let i = 0; i <= row; i++) {
      spots.push([bx + row * gap * 0.9, (LANE_TOP + LANE_BOT) / 2 + (i - row / 2) * gap]);
    }
  }
  return spots;
}

export default {
  id: 'boliche',
  name: 'Boliche',
  icon: '🎳',
  desc: `${FRAMES} frames, strike vale bônus.`,
  local: true,
  create(env) {
    let st = null;
    let aim = null;
    const sendFrame = throttler(40);
    const controls = (seat) => env.isLocal || env.seat === seat;
    const trail = new Trail(9);
    const fx = new Fx();
    const fallAt = new Map(); // índice do pino -> timestamp da queda (animação)

    function myThrow() {
      return st && !st.over && st.phase === 'aim' && controls(st.turn);
    }

    function resetPins(fresh) {
      const spots = pinSpots(env.W);
      if (fresh) {
        st.pins = spots.map(([x, y]) => ({ x, y, ox: x, oy: y, vx: 0, vy: 0, up: true }));
      } else {
        for (const p of st.pins) {
          if (p.up) { p.x = p.ox; p.y = p.oy; p.vx = 0; p.vy = 0; }
        }
      }
      st.ball = { x: 120, y: (LANE_TOP + LANE_BOT) / 2, vx: 0, vy: 0, gutter: false };
    }

    function frameScore(rolls) {
      const total = rolls.reduce((a, b) => a + b, 0);
      if (rolls[0] === 10) return total + 5; // strike
      if (rolls.length > 1 && total === 10) return total + 3; // spare
      return total;
    }

    function totalScore(seat) {
      return st.cards[seat].reduce((a, f) => a + frameScore(f), 0);
    }

    function marksHtml(seat) {
      let h = '';
      for (let f = 0; f < FRAMES; f++) {
        const rolls = st.cards[seat][f];
        let mark = '·';
        if (rolls) {
          if (rolls[0] === 10) mark = 'X';
          else if (rolls.length > 1) mark = rolls[0] + rolls[1] === 10 ? `${rolls[0]}/` : `${rolls[0]}·${rolls[1]}`;
          else mark = `${rolls[0]}`;
        }
        h += `<span class="frame-mark">${mark}</span>`;
      }
      return `${h} <b>${totalScore(seat)}</b>`;
    }

    function setUi() {
      env.setSub(0, marksHtml(0));
      env.setSub(1, marksHtml(1));
      if (!st.over) {
        env.setMsg(`Frame ${st.frame[st.turn] + 1}/${FRAMES} — ${env.names[st.turn]} (${st.roll + 1}º arremesso)`);
        env.setHint(myThrow()
          ? 'Pressione e puxe para trás para lançar a bola contra os pinos.'
          : env.seat === -1 ? '👁 Assistindo' : `Aguardando ${env.names[st.turn]}…`);
      }
    }

    function shoot(dx, dy, power) {
      // trava a direção para a frente
      const ang = clamp(Math.atan2(dy, Math.max(dx, 0.35)), -0.5, 0.5);
      st.ball.vx = Math.cos(ang) * (450 + power * 900);
      st.ball.vy = Math.sin(ang) * (450 + power * 900);
      st.phase = 'rolling';
      st.shooter = st.turn;
      env.sfx('click', 0.5 + power * 0.5);
    }

    function serialize() {
      return {
        pins: st.pins.map((p) => [Math.round(p.x), Math.round(p.y), p.up ? 1 : 0]),
        cards: st.cards, frame: st.frame, roll: st.roll, turn: st.turn, over: st.over, phase: 'aim',
      };
    }

    function applyFull(s) {
      const spots = pinSpots(env.W);
      st.pins = s.pins.map(([x, y, up], i) => ({ x, y, ox: spots[i][0], oy: spots[i][1], vx: 0, vy: 0, up: !!up }));
      st.cards = s.cards;
      st.frame = s.frame;
      st.roll = s.roll;
      st.turn = s.turn;
      st.over = s.over;
      st.phase = 'aim';
      resetPins(false);
      setUi();
    }

    function endRoll() {
      trail.clear();
      // pinos deslocados caem
      let knocked = 0;
      for (let i = 0; i < st.pins.length; i++) {
        const p = st.pins[i];
        if (p.up && Math.hypot(p.x - p.ox, p.y - p.oy) > 11) {
          p.up = false;
          fallAt.set(i, performance.now());
          knocked++;
        }
      }
      if (knocked) env.sfx('pocket', 0.8);
      const seatNow = st.shooter;
      const rollsNow = st.cards[seatNow][st.frame[seatNow]] || [];
      if (knocked === 10 && rollsNow.length === 0) {
        fx.banner('STRIKE! 🎳', { color: '#ffd54d' });
      } else if (rollsNow.length === 1 && rollsNow[0] + knocked === 10) {
        fx.banner('SPARE!', { color: '#9be49b' });
      } else if (knocked >= 6) {
        fx.text(env.W - 210, (LANE_TOP + LANE_BOT) / 2 - 40, `${knocked} pinos!`, { color: '#ffd54d', size: 24 });
      }
      const seat = st.shooter;
      const f = st.frame[seat];
      if (!st.cards[seat][f]) st.cards[seat][f] = [];
      st.cards[seat][f].push(knocked);
      const rolls = st.cards[seat][f];
      const frameDone = rolls[0] === 10 || rolls.length >= 2;
      if (frameDone) {
        st.frame[seat]++;
        st.roll = 0;
        st.turn = 1 - seat;
        if (st.frame[0] >= FRAMES && st.frame[1] >= FRAMES) {
          st.over = true;
        } else if (st.frame[st.turn] >= FRAMES) {
          st.turn = 1 - st.turn; // o outro ainda tem frames
        }
        resetPins(true);
      } else {
        st.roll = 1;
        resetPins(false);
      }
      st.phase = 'aim';
      env.send({ k: 'e', s: serialize() });
      setUi();
      if (st.over) {
        const t0 = totalScore(0);
        const t1 = totalScore(1);
        const w = t0 === t1 ? null : t0 > t1 ? 0 : 1;
        env.finish(w, w === null ? `Empate: ${t0} × ${t1}!` : `${env.names[w]} venceu no boliche: ${t0} × ${t1}!`);
      }
    }

    return {
      st: null,
      start() {
        st = this.st = {
          pins: [], ball: null, cards: [[], []], frame: [0, 0], roll: 0,
          turn: 0, shooter: 0, phase: 'aim', over: false,
        };
        resetPins(true);
        aim = new AimControl({
          getPos: () => st.ball,
          canAim: () => myThrow(),
          onShoot: shoot,
        });
        setUi();
      },
      snapshot() { return serialize(); },
      restore(s) {
        this.start();
        applyFull(s);
      },
      msg(m) {
        if (m.k === 'f') {
          st.phase = 'watch';
          st.ball.x = m.b[0]; st.ball.y = m.b[1];
          for (let i = 0; i < m.p.length && i < st.pins.length; i++) {
            st.pins[i].x = m.p[i][0];
            st.pins[i].y = m.p[i][1];
          }
        } else if (m.k === 'e') {
          applyFull(m.s);
        }
      },
      pointer(type, x, y) { aim && aim.pointer(type, x, y); },
      key() {},
      tick(dt) {
        fx.tick(dt);
        if (!st || st.phase !== 'rolling') return;
        trail.push(st.ball.x, st.ball.y);
        const sub = 1 / 240;
        let acc = dt;
        while (acc > 0) {
          const h = Math.min(sub, acc);
          acc -= h;
          stepBall(st.ball, h, { slide: 90, roll: 40, thresh: 400, stop: 8 });
          // sarjeta
          if (st.ball.y < LANE_TOP + BALL_R) { st.ball.y = LANE_TOP + BALL_R; st.ball.gutter = true; st.ball.vy = 0; }
          if (st.ball.y > LANE_BOT - BALL_R) { st.ball.y = LANE_BOT - BALL_R; st.ball.gutter = true; st.ball.vy = 0; }
          for (const p of st.pins) {
            if (!p.up) continue;
            stepBall(p, h, { slide: 700, roll: 500, thresh: 1e9, stop: 10 });
            p.y = clamp(p.y, LANE_TOP + PIN_R, LANE_BOT - PIN_R);
            p.x = clamp(p.x, 64 + PIN_R, env.W - 64 - PIN_R);
            if (!st.ball.gutter) {
              const hit = collideBalls(st.ball, p, BALL_R, PIN_R, 0.5);
              if (hit > 80) env.sfx('click', Math.min(1, hit / 900));
            }
            for (const q of st.pins) {
              if (q !== p && q.up) collideBalls(p, q, PIN_R, PIN_R, 0.5);
            }
          }
        }
        if (!env.isLocal && sendFrame()) {
          env.send({
            k: 'f',
            b: [Math.round(st.ball.x), Math.round(st.ball.y)],
            p: st.pins.map((p) => [Math.round(p.x), Math.round(p.y)]),
          });
        }
        const stopped = st.ball.vx === 0 && st.ball.vy === 0 && st.pins.every((p) => !p.up || (p.vx === 0 && p.vy === 0));
        if (st.ball.x > env.W + BALL_R || stopped) endRoll();
      },
      draw(ctx) {
        if (!st) return;
        const now = performance.now();
        drawFrame(ctx, 56, LANE_TOP - 30, env.W - 112, LANE_BOT - LANE_TOP + 60, 34, {
          felt: '#221d2c', woodA: '#4a3a58', woodB: '#241c30', vignette: 0.28, pad: 10,
        });
        // sarjetas (canaletas)
        for (const [gy] of [[LANE_TOP - 26], [LANE_BOT + 4]]) {
          const gg = ctx.createLinearGradient(0, gy, 0, gy + 22);
          gg.addColorStop(0, '#0c0a12');
          gg.addColorStop(0.5, '#1e1a28');
          gg.addColorStop(1, '#0c0a12');
          ctx.fillStyle = gg;
          ctx.fillRect(64, gy, env.W - 128, 22);
        }
        // pista de madeira com tábuas e verniz
        const wood = ctx.createLinearGradient(0, LANE_TOP, 0, LANE_BOT);
        wood.addColorStop(0, '#c99b62');
        wood.addColorStop(0.5, '#e6bd85');
        wood.addColorStop(1, '#c99b62');
        ctx.fillStyle = wood;
        ctx.fillRect(64, LANE_TOP, env.W - 128, LANE_BOT - LANE_TOP);
        ctx.strokeStyle = 'rgba(120,80,40,0.3)';
        ctx.lineWidth = 1;
        for (let i = 1; i < 12; i++) {
          const y = LANE_TOP + ((LANE_BOT - LANE_TOP) * i) / 12;
          ctx.beginPath(); ctx.moveTo(64, y); ctx.lineTo(env.W - 64, y); ctx.stroke();
        }
        // brilho do verniz
        const sheen = ctx.createLinearGradient(64, 0, env.W - 64, 0);
        sheen.addColorStop(0, 'rgba(255,255,255,0.12)');
        sheen.addColorStop(0.3, 'rgba(255,255,255,0)');
        sheen.addColorStop(0.75, 'rgba(255,255,255,0.1)');
        sheen.addColorStop(1, 'rgba(255,255,255,0)');
        ctx.fillStyle = sheen;
        ctx.fillRect(64, LANE_TOP, env.W - 128, LANE_BOT - LANE_TOP);
        // linha de falta + setas de mira
        ctx.fillStyle = 'rgba(60,30,20,0.55)';
        ctx.fillRect(176, LANE_TOP, 4, LANE_BOT - LANE_TOP);
        ctx.fillStyle = 'rgba(140,70,45,0.7)';
        for (let i = 0; i < 5; i++) {
          const y = LANE_TOP + 30 + i * ((LANE_BOT - LANE_TOP - 60) / 4);
          const x = 380 + (i === 2 ? 26 : 0);
          ctx.save();
          ctx.translate(x, y);
          ctx.beginPath();
          ctx.moveTo(10, 0);
          ctx.lineTo(-6, -6);
          ctx.lineTo(-6, 6);
          ctx.closePath();
          ctx.fill();
          ctx.restore();
        }
        // área dos pinos (deck)
        ctx.fillStyle = 'rgba(0,0,0,0.14)';
        ctx.fillRect(env.W - 290, LANE_TOP, 226, LANE_BOT - LANE_TOP);
        // pino de boliche com formato real
        const drawPin = (x, y, alpha = 1, rot = 0, scale = 1) => {
          ctx.save();
          ctx.globalAlpha = alpha;
          ctx.translate(x, y);
          ctx.rotate(rot);
          ctx.scale(scale, scale);
          ctx.beginPath();
          ctx.ellipse(1.5, 4, 8, 4.5, 0, 0, Math.PI * 2);
          ctx.fillStyle = 'rgba(0,0,0,0.28)';
          ctx.fill();
          const pg = ctx.createRadialGradient(-3, -4, 1, 0, 0, 11);
          pg.addColorStop(0, '#ffffff');
          pg.addColorStop(0.65, '#f1ead6');
          pg.addColorStop(1, '#c9c0a4');
          // corpo: barriga + gargalo + cabeça
          ctx.beginPath();
          ctx.ellipse(0, 2.4, 7.4, 6.2, 0, 0, Math.PI * 2);
          ctx.fillStyle = pg;
          ctx.fill();
          ctx.beginPath();
          ctx.ellipse(0, -5.5, 4.2, 5.4, 0, 0, Math.PI * 2);
          ctx.fill();
          ctx.beginPath();
          ctx.arc(0, -9.5, 3.4, 0, Math.PI * 2);
          ctx.fill();
          // listras vermelhas no gargalo
          ctx.strokeStyle = '#d8342c';
          ctx.lineWidth = 1.6;
          ctx.beginPath(); ctx.moveTo(-4, -4.4); ctx.lineTo(4, -4.4); ctx.stroke();
          ctx.beginPath(); ctx.moveTo(-3.6, -6.6); ctx.lineTo(3.6, -6.6); ctx.stroke();
          ctx.restore();
        };
        // pinos em pé (ordenados por y para sobreposição correta)
        const standing = st.pins
          .map((p, i) => ({ p, i }))
          .filter(({ p }) => p.up)
          .sort((a, b) => a.p.y - b.p.y);
        for (const { p } of standing) drawPin(p.x, p.y);
        // pinos caindo (animação)
        for (const [i, t0] of fallAt) {
          const k = (now - t0) / 550;
          if (k >= 1) { fallAt.delete(i); continue; }
          const p = st.pins[i];
          drawPin(p.x + k * 14, p.y + k * 6, 1 - k, k * 1.9, 1 - k * 0.25);
        }
        // rastro + bola com furos
        trail.draw(ctx, BALL_R, '#7a9cf0');
        if (st.ball) {
          const b = st.ball;
          const color = st.phase !== 'aim' || st.turn === 0 ? '#3d55c0' : '#b03a30';
          ctx.beginPath();
          ctx.ellipse(b.x + 2, b.y + 4, BALL_R * 0.95, BALL_R * 0.7, 0, 0, Math.PI * 2);
          ctx.fillStyle = 'rgba(0,0,0,0.3)';
          ctx.fill();
          const bg = ctx.createRadialGradient(b.x - 4, b.y - 5, 1, b.x, b.y, BALL_R + 1);
          bg.addColorStop(0, shade(color, 0.5));
          bg.addColorStop(0.6, color);
          bg.addColorStop(1, shade(color, -0.45));
          ctx.beginPath();
          ctx.arc(b.x, b.y, BALL_R, 0, Math.PI * 2);
          ctx.fillStyle = bg;
          ctx.fill();
          ctx.fillStyle = 'rgba(0,0,0,0.5)';
          for (const [hx, hy] of [[-3, -3], [2, -4], [0, 0]]) {
            ctx.beginPath();
            ctx.arc(b.x + hx, b.y + hy, 1.4, 0, Math.PI * 2);
            ctx.fill();
          }
        }
        if (myThrow() && aim) drawAim(ctx, st.ball.x, st.ball.y, aim.current(), BALL_R);
        fx.draw(ctx, env.W, env.H);
      },
    };
  },
};
