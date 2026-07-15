// Boliche: 5 frames por jogador, 2 arremessos por frame. Pontuação
// simplificada: pinos derrubados + bônus (strike +5, spare +3).
import { stepBall, collideBalls, AimControl, drawAim, drawOrb, throttler, roundRect, clamp } from '../engine.js';

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
      // pinos deslocados caem
      let knocked = 0;
      for (const p of st.pins) {
        if (p.up && Math.hypot(p.x - p.ox, p.y - p.oy) > 11) {
          p.up = false;
          knocked++;
        }
      }
      if (knocked) env.sfx('pocket', 0.8);
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
        if (!st || st.phase !== 'rolling') return;
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
        // pista
        roundRect(ctx, 40, LANE_TOP - 34, env.W - 80, LANE_BOT - LANE_TOP + 68, 12);
        ctx.fillStyle = '#2b2634';
        ctx.fill();
        const wood = ctx.createLinearGradient(0, LANE_TOP, 0, LANE_BOT);
        wood.addColorStop(0, '#c99b62');
        wood.addColorStop(0.5, '#e0b57e');
        wood.addColorStop(1, '#c99b62');
        ctx.fillStyle = wood;
        ctx.fillRect(50, LANE_TOP, env.W - 100, LANE_BOT - LANE_TOP);
        ctx.strokeStyle = 'rgba(90,60,30,0.35)';
        ctx.lineWidth = 1;
        for (let i = 1; i < 10; i++) {
          const y = LANE_TOP + ((LANE_BOT - LANE_TOP) * i) / 10;
          ctx.beginPath(); ctx.moveTo(50, y); ctx.lineTo(env.W - 50, y); ctx.stroke();
        }
        // marcas de mira
        ctx.fillStyle = 'rgba(120,60,40,0.6)';
        for (let i = 0; i < 5; i++) {
          const x = 380;
          ctx.save();
          ctx.translate(x, LANE_TOP + 30 + i * ((LANE_BOT - LANE_TOP - 60) / 4));
          ctx.rotate(Math.PI / 4);
          ctx.fillRect(-4, -4, 8, 8);
          ctx.restore();
        }
        // pinos
        for (const p of st.pins) {
          if (!p.up) continue;
          drawOrb(ctx, p.x, p.y, PIN_R, '#f4f0e4');
          ctx.fillStyle = '#d8342c';
          ctx.fillRect(p.x - 4, p.y - 2, 8, 3);
        }
        // bola
        if (st.ball) drawOrb(ctx, st.ball.x, st.ball.y, BALL_R, st.turn === 0 && st.phase === 'aim' ? '#ff8a5c' : '#4a68d8');
        if (myThrow() && aim) drawAim(ctx, st.ball.x, st.ball.y, aim.current(), BALL_R);
      },
    };
  },
};
