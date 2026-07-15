// Futebol de botão: cada time tem 5 peças (círculos). Na sua vez, escolha uma
// peça e arremesse-a para empurrar a bola ao gol adversário. Primeiro a 3
// gols (ou melhor placar após 24 jogadas).
import { stepBall, collideBalls, AimControl, drawAim, drawOrb, throttler, roundRect } from '../engine.js';

const GOALS_TO_WIN = 3;
const MAX_FLICKS = 24;
const PIECE_R = 16;
const BALL_R = 9;

export default {
  id: 'futebol',
  name: 'Futebol de Botão',
  icon: '⚽',
  desc: `Arremesse os jogadores. Primeiro a ${GOALS_TO_WIN} gols.`,
  local: true,
  create(env) {
    const L = 46, T = 66, Rr = env.W - 46, B = env.H - 46;
    const GOAL_H = 150;
    const GT = (T + B) / 2 - GOAL_H / 2;
    const GB = (T + B) / 2 + GOAL_H / 2;
    let st = null;
    let aim = null;
    const sendFrame = throttler(40);
    const controls = (seat) => env.isLocal || env.seat === seat;
    const myMove = () => st && !st.over && st.phase === 'aim' && controls(st.turn);

    function formation() {
      const cy = (T + B) / 2;
      const mk = (x, y, team) => ({ x, y, vx: 0, vy: 0, team });
      return [
        mk(L + 60, cy, 0), mk(L + 210, cy - 110, 0), mk(L + 210, cy + 110, 0),
        mk(L + 350, cy - 55, 0), mk(L + 350, cy + 55, 0),
        mk(Rr - 60, cy, 1), mk(Rr - 210, cy - 110, 1), mk(Rr - 210, cy + 110, 1),
        mk(Rr - 350, cy - 55, 1), mk(Rr - 350, cy + 55, 1),
      ];
    }

    function resetPositions() {
      st.pieces = formation();
      st.ball = { x: env.W / 2, y: (T + B) / 2, vx: 0, vy: 0 };
      st.sel = null;
    }

    function setUi() {
      env.setSub(0, `<b class="big-score">${st.sc[0]}</b> ⚽`);
      env.setSub(1, `⚽ <b class="big-score">${st.sc[1]}</b>`);
      if (!st.over) {
        env.setMsg(`${st.sc[0]} × ${st.sc[1]} — jogada ${st.flicks + 1}/${MAX_FLICKS} · vez de ${env.names[st.turn]}`);
        env.setHint(myMove()
          ? 'Toque numa peça do seu time, depois pressione e puxe para arremessá-la.'
          : env.seat === -1 ? '👁 Assistindo' : `Aguardando ${env.names[st.turn]}…`);
      }
    }

    function serialize() {
      return {
        pieces: st.pieces.map((p) => [Math.round(p.x), Math.round(p.y), p.team]),
        ball: [Math.round(st.ball.x), Math.round(st.ball.y)],
        sc: st.sc, flicks: st.flicks, turn: st.turn, over: st.over,
      };
    }

    function applyFull(s) {
      st.pieces = s.pieces.map(([x, y, team]) => ({ x, y, vx: 0, vy: 0, team }));
      st.ball = { x: s.ball[0], y: s.ball[1], vx: 0, vy: 0 };
      st.sc = s.sc.slice();
      st.flicks = s.flicks;
      st.turn = s.turn;
      st.over = s.over;
      st.phase = 'aim';
      st.sel = null;
      setUi();
    }

    function shoot(dx, dy, power) {
      const p = st.pieces[st.sel];
      const speed = 250 + power * 1150;
      p.vx = dx * speed;
      p.vy = dy * speed;
      st.phase = 'moving';
      st.shooter = st.turn;
      st.goalScored = null;
      env.sfx('click', 0.5 + power * 0.5);
    }

    function endTurn() {
      st.flicks++;
      if (st.goalScored !== null) {
        st.sc[st.goalScored]++;
        env.sfx('score', 1);
        resetPositions();
        st.turn = 1 - st.goalScored; // quem sofreu recomeça
      } else {
        st.turn = 1 - st.shooter;
      }
      const done = st.sc[0] >= GOALS_TO_WIN || st.sc[1] >= GOALS_TO_WIN || st.flicks >= MAX_FLICKS;
      if (done) st.over = true;
      st.phase = 'aim';
      st.sel = null;
      env.send({ k: 'e', s: serialize() });
      setUi();
      if (st.over) {
        const w = st.sc[0] === st.sc[1] ? null : st.sc[0] > st.sc[1] ? 0 : 1;
        env.finish(w, w === null ? `Empate ${st.sc[0]} × ${st.sc[1]}!` : `Gol e vitória! ${env.names[w]} fez ${st.sc[w]} × ${st.sc[1 - w]}.`);
      }
    }

    function physics(h) {
      const bodies = [...st.pieces, st.ball];
      for (const p of st.pieces) stepBall(p, h, { slide: 380, roll: 190, thresh: 350, stop: 8 });
      stepBall(st.ball, h, { slide: 220, roll: 90, thresh: 330, stop: 7 });
      for (let i = 0; i < bodies.length; i++) {
        for (let j = i + 1; j < bodies.length; j++) {
          const ri = bodies[i] === st.ball ? BALL_R : PIECE_R;
          const rj = bodies[j] === st.ball ? BALL_R : PIECE_R;
          const hit = collideBalls(bodies[i], bodies[j], ri, rj, 0.9);
          if (hit > 100) env.sfx('click', Math.min(1, hit / 1100));
        }
      }
      for (const b of bodies) {
        const r = b === st.ball ? BALL_R : PIECE_R;
        const isBall = b === st.ball;
        const inMouth = b.y > GT && b.y < GB && isBall;
        if (b.y < T + r && b.vy < 0) { b.y = T + r; b.vy = -b.vy * 0.8; }
        if (b.y > B - r && b.vy > 0) { b.y = B - r; b.vy = -b.vy * 0.8; }
        if (!inMouth) {
          if (b.x < L + r && b.vx < 0) { b.x = L + r; b.vx = -b.vx * 0.8; }
          if (b.x > Rr - r && b.vx > 0) { b.x = Rr - r; b.vx = -b.vx * 0.8; }
        }
      }
      // gol: bola cruza a linha dentro da boca
      if (st.goalScored === null) {
        if (st.ball.x < L - BALL_R) st.goalScored = 1; // gol na esquerda = ponto do time 1
        else if (st.ball.x > Rr + BALL_R) st.goalScored = 0;
        if (st.goalScored !== null) {
          st.ball.vx = 0; st.ball.vy = 0;
        }
      }
    }

    return {
      st: null,
      start() {
        st = this.st = { pieces: [], ball: null, sc: [0, 0], flicks: 0, turn: 0, shooter: 0, phase: 'aim', sel: null, over: false, goalScored: null };
        resetPositions();
        aim = new AimControl({
          getPos: () => (st.sel !== null ? st.pieces[st.sel] : null),
          canAim: () => myMove() && st.sel !== null,
          onShoot: shoot,
        });
        setUi();
      },
      snapshot() { return serialize(); },
      restore(s) { this.start(); applyFull(s); },
      msg(m) {
        if (m.k === 'f') {
          st.phase = 'watch';
          for (let i = 0; i < m.p.length && i < st.pieces.length; i++) {
            st.pieces[i].x = m.p[i][0];
            st.pieces[i].y = m.p[i][1];
          }
          st.ball.x = m.b[0];
          st.ball.y = m.b[1];
        } else if (m.k === 'e') {
          applyFull(m.s);
        }
      },
      pointer(type, x, y) {
        if (!myMove()) return;
        if (type === 'down') {
          // selecionar peça própria (se não estiver mirando)
          if (!aim.charging) {
            let best = null;
            let bd = 30;
            st.pieces.forEach((p, i) => {
              if (p.team !== st.turn) return;
              const d = Math.hypot(x - p.x, y - p.y);
              if (d < bd) { bd = d; best = i; }
            });
            if (best !== null) {
              st.sel = best;
              env.sfx('click', 0.3);
              return; // toque na peça só seleciona
            }
          }
        }
        aim.pointer(type, x, y);
      },
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
          env.send({
            k: 'f',
            p: st.pieces.map((p) => [Math.round(p.x), Math.round(p.y)]),
            b: [Math.round(st.ball.x), Math.round(st.ball.y)],
          });
        }
        const stopped = [...st.pieces, st.ball].every((b) => b.vx === 0 && b.vy === 0);
        if (stopped || st.goalScored !== null) endTurn();
      },
      draw(ctx) {
        if (!st) return;
        // campo
        roundRect(ctx, L - 14, T - 14, Rr - L + 28, B - T + 28, 14);
        ctx.fillStyle = '#1e7a3c';
        ctx.fill();
        for (let i = 0; i < 8; i++) {
          ctx.fillStyle = i % 2 ? 'rgba(255,255,255,0.035)' : 'rgba(0,0,0,0.03)';
          ctx.fillRect(L + ((Rr - L) * i) / 8, T, (Rr - L) / 8, B - T);
        }
        ctx.strokeStyle = 'rgba(255,255,255,0.7)';
        ctx.lineWidth = 2.5;
        ctx.strokeRect(L, T, Rr - L, B - T);
        ctx.beginPath(); ctx.moveTo(env.W / 2, T); ctx.lineTo(env.W / 2, B); ctx.stroke();
        ctx.beginPath(); ctx.arc(env.W / 2, (T + B) / 2, 62, 0, Math.PI * 2); ctx.stroke();
        // áreas
        ctx.strokeRect(L, (T + B) / 2 - 110, 90, 220);
        ctx.strokeRect(Rr - 90, (T + B) / 2 - 110, 90, 220);
        // gols (redes)
        ctx.fillStyle = 'rgba(255,255,255,0.25)';
        ctx.fillRect(L - 22, GT, 22, GOAL_H);
        ctx.fillRect(Rr, GT, 22, GOAL_H);
        ctx.strokeStyle = '#fff';
        ctx.strokeRect(L - 22, GT, 22, GOAL_H);
        ctx.strokeRect(Rr, GT, 22, GOAL_H);
        // peças
        st.pieces.forEach((p, i) => {
          drawOrb(ctx, p.x, p.y, PIECE_R, p.team === 0 ? '#ff8a5c' : '#59b7ff');
          if (i === st.sel && myMove()) {
            ctx.strokeStyle = '#ffd54d';
            ctx.lineWidth = 3;
            ctx.beginPath();
            ctx.arc(p.x, p.y, PIECE_R + 4, 0, Math.PI * 2);
            ctx.stroke();
          }
        });
        drawOrb(ctx, st.ball.x, st.ball.y, BALL_R, '#f6f3e8');
        if (myMove() && st.sel !== null && aim) {
          drawAim(ctx, st.pieces[st.sel].x, st.pieces[st.sel].y, aim.current(), PIECE_R);
        }
      },
    };
  },
};
