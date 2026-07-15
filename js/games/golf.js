// Mini-golf: 3 buracos com obstáculos. Tacadas alternadas; menos tacadas
// vence. A bola só cai no buraco se chegar devagar.
import { stepBall, collideBalls, collideRect, AimControl, drawAim, drawOrb, throttler, drawFrame, Trail, Fx } from '../engine.js';

const BALL_R = 9;
const HOLE_R = 14;
const MAX_STROKES = 8;

const HOLES = (W, H) => [
  {
    name: 'Reta', par: 2,
    tee: [130, H / 2], hole: [W - 130, H / 2],
    walls: [],
    sand: [{ x: W / 2 - 70, y: H / 2 - 150, w: 140, h: 90 }],
  },
  {
    name: 'Contorno', par: 3,
    tee: [130, H - 120], hole: [W - 130, 130],
    walls: [{ x: W / 2 - 35, y: 180, w: 70, h: H - 180 - 46 }],
    sand: [{ x: W / 2 + 90, y: H - 190, w: 150, h: 100 }],
  },
  {
    name: 'Zigue-zague', par: 3,
    tee: [130, H / 2], hole: [W - 130, H / 2],
    walls: [
      { x: 330, y: 66, w: 44, h: 220 },
      { x: 570, y: H - 66 - 220, w: 44, h: 220 },
    ],
    sand: [{ x: 420, y: H / 2 + 40, w: 120, h: 110 }],
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
    const trails = [new Trail(8), new Trail(8)];
    const fx = new Fx();
    const inSand = (c, b) => c.sand.some((s) => b.x > s.x && b.x < s.x + s.w && b.y > s.y && b.y < s.y + s.h);

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
      trails.forEach((t) => t.clear());
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
        const sandy = inSand(c, b);
        stepBall(b, h, { slide: sandy ? 640 : 200, roll: sandy ? 420 : 85, thresh: 320, stop: 6 });
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
          fx.text(c.hole[0], c.hole[1] - 26, `${env.names[i]}: ${st.hs[i]} tacada${st.hs[i] > 1 ? 's' : ''}!`, { color: '#9be49b', size: 20 });
          fx.burst(c.hole[0], c.hole[1], '#9be49b', 16, 220);
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
        fx.tick(dt);
        if (!st || st.phase !== 'moving') return;
        for (let i = 0; i < 2; i++) {
          if (!st.holed[i]) trails[i].push(st.balls[i].x, st.balls[i].y);
        }
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
        const now = performance.now();
        drawFrame(ctx, L, T, Rr - L, B - T, 40, {
          felt: '#3f9a63', woodA: '#6d5a35', woodB: '#3c3220', vignette: 0.16, pad: 12,
        });
        // grama quadriculada (corte)
        const sq = 54;
        for (let x = L; x < Rr; x += sq) {
          for (let y = T; y < B; y += sq) {
            if (((x - L) / sq + (y - T) / sq) % 2 < 1) {
              ctx.fillStyle = 'rgba(255,255,255,0.045)';
              ctx.fillRect(x, y, Math.min(sq, Rr - x), Math.min(sq, B - y));
            }
          }
        }
        // bancos de areia
        for (const s of c.sand) {
          ctx.save();
          ctx.beginPath();
          ctx.ellipse(s.x + s.w / 2, s.y + s.h / 2, s.w / 2, s.h / 2, 0, 0, Math.PI * 2);
          const sg = ctx.createRadialGradient(s.x + s.w / 2 - 10, s.y + s.h / 2 - 10, 4, s.x + s.w / 2, s.y + s.h / 2, s.w / 2);
          sg.addColorStop(0, '#eddaa6');
          sg.addColorStop(1, '#cdb379');
          ctx.fillStyle = sg;
          ctx.fill();
          ctx.strokeStyle = 'rgba(90,70,30,0.35)';
          ctx.lineWidth = 3;
          ctx.stroke();
          ctx.clip();
          ctx.strokeStyle = 'rgba(160,130,70,0.4)';
          ctx.lineWidth = 1;
          for (let y = s.y + 6; y < s.y + s.h; y += 8) {
            ctx.beginPath();
            ctx.moveTo(s.x, y);
            ctx.quadraticCurveTo(s.x + s.w / 2, y + 4, s.x + s.w, y);
            ctx.stroke();
          }
          ctx.restore();
        }
        // paredes 3D (madeira com topo iluminado e sombra)
        for (const w of c.walls) {
          ctx.fillStyle = 'rgba(0,0,0,0.28)';
          ctx.fillRect(w.x + 4, w.y + 6, w.w, w.h);
          const wg = ctx.createLinearGradient(w.x, w.y, w.x + w.w, w.y);
          wg.addColorStop(0, '#8a5a2b');
          wg.addColorStop(0.5, '#6d4322');
          wg.addColorStop(1, '#54311a');
          ctx.fillStyle = wg;
          ctx.fillRect(w.x, w.y, w.w, w.h);
          ctx.fillStyle = 'rgba(255,230,180,0.28)';
          ctx.fillRect(w.x, w.y, w.w, 6);
          ctx.strokeStyle = 'rgba(0,0,0,0.3)';
          ctx.lineWidth = 1.5;
          ctx.strokeRect(w.x, w.y, w.w, w.h);
        }
        // tee (tapete)
        ctx.fillStyle = 'rgba(20,50,32,0.65)';
        ctx.fillRect(c.tee[0] - 26, c.tee[1] - 34, 52, 68);
        ctx.strokeStyle = 'rgba(255,255,255,0.25)';
        ctx.lineWidth = 2;
        ctx.strokeRect(c.tee[0] - 26, c.tee[1] - 34, 52, 68);
        // buraco com profundidade + bandeira ao vento
        ctx.beginPath();
        ctx.ellipse(c.hole[0], c.hole[1] + 2, HOLE_R + 2, HOLE_R * 0.8, 0, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(0,0,0,0.3)';
        ctx.fill();
        const hg = ctx.createRadialGradient(c.hole[0], c.hole[1] - 3, 2, c.hole[0], c.hole[1], HOLE_R);
        hg.addColorStop(0, '#000');
        hg.addColorStop(1, '#17301f');
        ctx.beginPath();
        ctx.arc(c.hole[0], c.hole[1], HOLE_R, 0, Math.PI * 2);
        ctx.fillStyle = hg;
        ctx.fill();
        const wave = Math.sin(now / 300) * 6;
        ctx.strokeStyle = '#e8e2d0';
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.moveTo(c.hole[0], c.hole[1]);
        ctx.lineTo(c.hole[0], c.hole[1] - 52);
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(c.hole[0], c.hole[1] - 52);
        ctx.quadraticCurveTo(c.hole[0] + 14 + wave, c.hole[1] - 48, c.hole[0] + 26 + wave, c.hole[1] - 42);
        ctx.lineTo(c.hole[0] + 2, c.hole[1] - 36);
        ctx.closePath();
        ctx.fillStyle = '#d8342c';
        ctx.fill();
        // rastros + bolas
        trails[0].draw(ctx, BALL_R, '#ffb08c');
        trails[1].draw(ctx, BALL_R, '#8fc6ff');
        if (!st.holed[0]) drawOrb(ctx, st.balls[0].x, st.balls[0].y, BALL_R, '#f0ede0');
        if (!st.holed[1]) drawOrb(ctx, st.balls[1].x, st.balls[1].y, BALL_R, '#ffd54d');
        // marcador de dono das bolas
        ctx.font = 'bold 10px system-ui';
        ctx.textAlign = 'center';
        if (!st.holed[0]) { ctx.fillStyle = '#e04a3a'; ctx.fillText('1', st.balls[0].x, st.balls[0].y - BALL_R - 5); }
        if (!st.holed[1]) { ctx.fillStyle = '#2f6fd0'; ctx.fillText('2', st.balls[1].x, st.balls[1].y - BALL_R - 5); }
        if (myMove() && aim) {
          const b = st.balls[st.turn];
          drawAim(ctx, b.x, b.y, aim.current(), BALL_R);
        }
        fx.draw(ctx, env.W, env.H);
      },
    };
  },
};
