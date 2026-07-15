// Mini-golf: 3 buracos com obstáculos. Tacadas alternadas; menos tacadas
// vence. A bola só cai no buraco se chegar devagar.
import { stepBall, collideBalls, collideRect, AimControl, drawAim, drawOrb, throttler, roundRect } from '../engine.js';

const BALL_R = 9;
const HOLE_R = 14;
const MAX_STROKES = 8;

const HOLES = (W, H) => [
  {
    name: 'Reta', par: 2,
    tee: [130, H / 2], hole: [W - 130, H / 2],
    walls: [],
  },
  {
    name: 'Contorno', par: 3,
    tee: [130, H - 120], hole: [W - 130, 130],
    walls: [{ x: W / 2 - 35, y: 180, w: 70, h: H - 180 - 46 }],
  },
  {
    name: 'Zigue-zague', par: 3,
    tee: [130, H / 2], hole: [W - 130, H / 2],
    walls: [
      { x: 330, y: 66, w: 44, h: 220 },
      { x: 570, y: H - 66 - 220, w: 44, h: 220 },
    ],
  },
];

export default {
  id: 'golf',
  name: 'Mini-Golf',
  icon: '⛳',
  desc: '3 buracos, menos tacadas vence.',
  local: true,
  create(env) {
    const L = 46, T = 66, Rr = env.W - 46, B = env.H - 46;
    const courses = HOLES(env.W, env.H);
    let st = null;
    let aim = null;
    const sendFrame = throttler(40);
    const controls = (seat) => env.isLocal || env.seat === seat;
    const myMove = () => st && !st.over && st.phase === 'aim' && controls(st.turn) && !st.holed[st.turn];

    function course() { return courses[st.hole]; }

    function resetHole() {
      const c = course();
      st.balls = [
        { x: c.tee[0], y: c.tee[1] - 14, vx: 0, vy: 0 },
        { x: c.tee[0], y: c.tee[1] + 14, vx: 0, vy: 0 },
      ];
      st.holed = [false, false];
      st.hs = [0, 0]; // tacadas neste buraco
      st.turn = st.hole % 2; // alterna quem começa
    }

    function totals(seat) {
      return st.cards[seat].reduce((a, b) => a + b, 0);
    }

    function setUi() {
      env.setSub(0, `${st.cards[0].map((s) => `<span class="frame-mark">${s}</span>`).join('')} <b>${totals(0)}</b>`);
      env.setSub(1, `${st.cards[1].map((s) => `<span class="frame-mark">${s}</span>`).join('')} <b>${totals(1)}</b>`);
      if (!st.over) {
        const c = course();
        env.setMsg(`Buraco ${st.hole + 1}/3 (${c.name}, par ${c.par}) — vez de ${env.names[st.turn]} · tacada ${st.hs[st.turn] + 1}`);
        env.setHint(myMove()
          ? 'Pressione e puxe para trás para dar a tacada. Chegue devagar no buraco!'
          : env.seat === -1 ? '👁 Assistindo' : `Aguardando ${env.names[st.turn]}…`);
      }
    }

    function serialize() {
      return {
        balls: st.balls.map((b) => [Math.round(b.x), Math.round(b.y)]),
        holed: st.holed, hs: st.hs, cards: st.cards, hole: st.hole, turn: st.turn, over: st.over,
      };
    }

    function applyFull(s) {
      st.hole = s.hole;
      st.balls = s.balls.map(([x, y]) => ({ x, y, vx: 0, vy: 0 }));
      st.holed = s.holed.slice();
      st.hs = s.hs.slice();
      st.cards = s.cards.map((c) => c.slice());
      st.turn = s.turn;
      st.over = s.over;
      st.phase = 'aim';
      setUi();
    }

    function shoot(dx, dy, power) {
      const b = st.balls[st.turn];
      const speed = 180 + power * 1050;
      b.vx = dx * speed;
      b.vy = dy * speed;
      st.hs[st.turn]++;
      st.shooter = st.turn;
      st.phase = 'moving';
      env.sfx('click', 0.4 + power * 0.5);
    }

    function nextTurnOrHole() {
      const bothDone = st.holed[0] && st.holed[1];
      if (bothDone) {
        st.cards[0].push(st.hs[0]);
        st.cards[1].push(st.hs[1]);
        if (st.hole >= courses.length - 1) {
          st.over = true;
        } else {
          st.hole++;
          resetHole();
        }
      } else {
        const other = 1 - st.shooter;
        st.turn = st.holed[other] ? st.shooter : other;
      }
      st.phase = 'aim';
      env.send({ k: 'e', s: serialize() });
      setUi();
      if (st.over) {
        const t0 = totals(0);
        const t1 = totals(1);
        const w = t0 === t1 ? null : t0 < t1 ? 0 : 1;
        env.finish(w, w === null ? `Empate em ${t0} tacadas!` : `${env.names[w]} venceu no golf: ${t0} × ${t1} tacadas.`);
      }
    }

    function physics(h) {
      const c = course();
      const mover = st.balls[st.shooter];
      for (let i = 0; i < 2; i++) {
        const b = st.balls[i];
        if (st.holed[i]) continue;
        stepBall(b, h, { slide: 200, roll: 85, thresh: 320, stop: 6 });
        if (b.x < L + BALL_R && b.vx < 0) { b.x = L + BALL_R; b.vx = -b.vx * 0.75; }
        if (b.x > Rr - BALL_R && b.vx > 0) { b.x = Rr - BALL_R; b.vx = -b.vx * 0.75; }
        if (b.y < T + BALL_R && b.vy < 0) { b.y = T + BALL_R; b.vy = -b.vy * 0.75; }
        if (b.y > B - BALL_R && b.vy > 0) { b.y = B - BALL_R; b.vy = -b.vy * 0.75; }
        for (const w of c.walls) {
          const hit = collideRect(b, BALL_R, w.x, w.y, w.w, w.h, 0.75);
          if (hit > 80) env.sfx('cushion', Math.min(1, hit / 800));
        }
        // buraco
        const d = Math.hypot(b.x - c.hole[0], b.y - c.hole[1]);
        const sp = Math.hypot(b.vx, b.vy);
        if (d < HOLE_R - 2 && sp < 320) {
          st.holed[i] = true;
          b.vx = 0; b.vy = 0;
          b.x = c.hole[0]; b.y = c.hole[1];
          env.sfx('pocket', 0.9);
        } else if (d < HOLE_R + 4 && sp < 500 && d > 0.001) {
          // borda do buraco puxa levemente
          b.vx += ((c.hole[0] - b.x) / d) * 520 * h;
          b.vy += ((c.hole[1] - b.y) / d) * 520 * h;
        }
      }
      if (!st.holed[0] && !st.holed[1]) collideBalls(st.balls[0], st.balls[1], BALL_R, BALL_R, 0.9);
      void mover;
    }

    return {
      st: null,
      start() {
        st = this.st = { hole: 0, balls: [], holed: [false, false], hs: [0, 0], cards: [[], []], turn: 0, shooter: 0, phase: 'aim', over: false };
        resetHole();
        aim = new AimControl({
          getPos: () => st.balls[st.turn],
          canAim: () => myMove(),
          onShoot: shoot,
        });
        setUi();
      },
      snapshot() { return serialize(); },
      restore(s) { this.start(); applyFull(s); },
      msg(m) {
        if (m.k === 'f') {
          st.phase = 'watch';
          for (let i = 0; i < 2; i++) {
            st.balls[i].x = m.b[i][0];
            st.balls[i].y = m.b[i][1];
          }
        } else if (m.k === 'e') {
          applyFull(m.s);
        }
      },
      pointer(type, x, y) { aim && aim.pointer(type, x, y); },
      key() {},
      tick(dt) {
        if (!st || st.phase !== 'moving') return;
        let acc = dt;
        while (acc > 0) {
          const h = Math.min(1 / 240, acc);
          acc -= h;
          physics(h);
        }
        if (!env.isLocal && sendFrame()) {
          env.send({ k: 'f', b: st.balls.map((b) => [Math.round(b.x), Math.round(b.y)]) });
        }
        const stopped = st.balls.every((b, i) => st.holed[i] || (b.vx === 0 && b.vy === 0));
        if (stopped) {
          // desistência automática no limite de tacadas
          if (!st.holed[st.shooter] && st.hs[st.shooter] >= MAX_STROKES) {
            st.holed[st.shooter] = true;
          }
          nextTurnOrHole();
        }
      },
      draw(ctx) {
        if (!st) return;
        const c = course();
        roundRect(ctx, L - 14, T - 14, Rr - L + 28, B - T + 28, 14);
        ctx.fillStyle = '#256e46';
        ctx.fill();
        roundRect(ctx, L, T, Rr - L, B - T, 8);
        ctx.fillStyle = '#3f9a63';
        ctx.fill();
        // paredes
        for (const w of c.walls) {
          ctx.fillStyle = '#7a4a26';
          ctx.fillRect(w.x, w.y, w.w, w.h);
          ctx.fillStyle = 'rgba(255,255,255,0.15)';
          ctx.fillRect(w.x, w.y, w.w, 5);
        }
        // buraco + bandeira
        ctx.beginPath();
        ctx.arc(c.hole[0], c.hole[1], HOLE_R, 0, Math.PI * 2);
        ctx.fillStyle = '#12241a';
        ctx.fill();
        ctx.strokeStyle = 'rgba(0,0,0,0.5)';
        ctx.lineWidth = 3;
        ctx.stroke();
        ctx.strokeStyle = '#e8e2d0';
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.moveTo(c.hole[0], c.hole[1]);
        ctx.lineTo(c.hole[0], c.hole[1] - 44);
        ctx.stroke();
        ctx.fillStyle = '#d8342c';
        ctx.beginPath();
        ctx.moveTo(c.hole[0], c.hole[1] - 44);
        ctx.lineTo(c.hole[0] + 22, c.hole[1] - 36);
        ctx.lineTo(c.hole[0], c.hole[1] - 28);
        ctx.closePath();
        ctx.fill();
        // tee
        ctx.fillStyle = 'rgba(255,255,255,0.25)';
        ctx.fillRect(c.tee[0] - 3, c.tee[1] - 26, 6, 52);
        // bolas
        if (!st.holed[0]) drawOrb(ctx, st.balls[0].x, st.balls[0].y, BALL_R, '#ff8a5c');
        if (!st.holed[1]) drawOrb(ctx, st.balls[1].x, st.balls[1].y, BALL_R, '#59b7ff');
        if (myMove() && aim) {
          const b = st.balls[st.turn];
          drawAim(ctx, b.x, b.y, aim.current(), BALL_R);
        }
      },
    };
  },
};
