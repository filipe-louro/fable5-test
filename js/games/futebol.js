// Futebol de botão: cada time tem 5 peças (círculos). Na sua vez, escolha uma
// peça e arremesse-a para empurrar a bola ao gol adversário. Primeiro a 3
// gols (ou melhor placar após 24 jogadas).
import { stepBall, collideBalls, AimControl, drawAim, throttler, drawFrame, Trail, Fx, shade } from '../engine.js';

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
    const trail = new Trail(8);
    const fx = new Fx();

    function goalFx(who) {
      fx.banner('⚽ GOL!', { color: who === 0 ? '#ff8a5c' : '#59b7ff' });
      fx.burst(who === 0 ? Rr : L, (T + B) / 2, '#ffd54d', 26, 340);
      trail.clear();
    }

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
      if (s.sc[0] !== st.sc[0]) goalFx(0);
      else if (s.sc[1] !== st.sc[1]) goalFx(1);
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
        goalFx(st.goalScored);
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
        fx.tick(dt);
        if (!st || st.phase !== 'moving') return;
        trail.push(st.ball.x, st.ball.y);
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
        drawFrame(ctx, L, T, Rr - L, B - T, 40, {
          felt: '#1c6e38', woodA: '#3f5a45', woodB: '#22322a', vignette: 0.2, pad: 12,
        });
        // faixas do gramado
        for (let i = 0; i < 10; i++) {
          ctx.fillStyle = i % 2 ? 'rgba(255,255,255,0.045)' : 'rgba(0,0,0,0.045)';
          ctx.fillRect(L + ((Rr - L) * i) / 10, T, (Rr - L) / 10, B - T);
        }
        // marcações
        ctx.strokeStyle = 'rgba(255,255,255,0.85)';
        ctx.lineWidth = 2.5;
        ctx.strokeRect(L, T, Rr - L, B - T);
        ctx.beginPath(); ctx.moveTo(env.W / 2, T); ctx.lineTo(env.W / 2, B); ctx.stroke();
        ctx.beginPath(); ctx.arc(env.W / 2, (T + B) / 2, 62, 0, Math.PI * 2); ctx.stroke();
        ctx.beginPath(); ctx.arc(env.W / 2, (T + B) / 2, 4, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(255,255,255,0.85)';
        ctx.fill();
        // grandes áreas + pequenas áreas + meia-luas + marca do pênalti
        for (const side of [0, 1]) {
          const dir = side === 0 ? 1 : -1;
          const gx = side === 0 ? L : Rr;
          ctx.strokeRect(side === 0 ? gx : gx - 96, (T + B) / 2 - 112, 96, 224);
          ctx.strokeRect(side === 0 ? gx : gx - 40, (T + B) / 2 - 62, 40, 124);
          ctx.beginPath();
          ctx.arc(gx + dir * 96, (T + B) / 2, 36, side === 0 ? -Math.PI / 2.6 : Math.PI - Math.PI / 2.6, side === 0 ? Math.PI / 2.6 : Math.PI + Math.PI / 2.6);
          ctx.stroke();
          ctx.beginPath();
          ctx.arc(gx + dir * 66, (T + B) / 2, 2.5, 0, Math.PI * 2);
          ctx.fill();
        }
        // arcos de escanteio
        for (const [cx, cy, a0] of [[L, T, 0], [Rr, T, Math.PI / 2], [Rr, B, Math.PI], [L, B, -Math.PI / 2]]) {
          ctx.beginPath();
          ctx.arc(cx, cy, 12, a0, a0 + Math.PI / 2);
          ctx.stroke();
        }
        // gols com rede
        for (const [gx, dir] of [[L, -1], [Rr, 1]]) {
          const x0 = dir === -1 ? gx - 24 : gx;
          ctx.fillStyle = 'rgba(10,16,12,0.55)';
          ctx.fillRect(x0, GT, 24, GOAL_H);
          ctx.strokeStyle = 'rgba(235,240,245,0.5)';
          ctx.lineWidth = 1;
          for (let x = x0 + 4; x < x0 + 24; x += 6) {
            ctx.beginPath(); ctx.moveTo(x, GT); ctx.lineTo(x, GB); ctx.stroke();
          }
          for (let y = GT + 5; y < GB; y += 9) {
            ctx.beginPath(); ctx.moveTo(x0, y); ctx.lineTo(x0 + 24, y); ctx.stroke();
          }
          ctx.strokeStyle = '#f2f5f8';
          ctx.lineWidth = 4;
          ctx.strokeRect(x0, GT, 24, GOAL_H);
        }
        // rastro da bola
        trail.draw(ctx, BALL_R, '#ffffff');
        // peças estilo botão (disco com anel e número)
        st.pieces.forEach((p, i) => {
          const color = p.team === 0 ? '#e04a3a' : '#2f6fd0';
          const myTeamTurn = !st.over && st.phase === 'aim' && p.team === st.turn && controls(st.turn);
          ctx.beginPath();
          ctx.ellipse(p.x + 2, p.y + 4, PIECE_R, PIECE_R * 0.72, 0, 0, Math.PI * 2);
          ctx.fillStyle = 'rgba(0,0,0,0.3)';
          ctx.fill();
          ctx.beginPath();
          ctx.ellipse(p.x, p.y + 3, PIECE_R, PIECE_R * 0.9, 0, 0, Math.PI * 2);
          ctx.fillStyle = shade(color, -0.5);
          ctx.fill();
          const g = ctx.createRadialGradient(p.x - 6, p.y - 7, 2, p.x, p.y, PIECE_R + 2);
          g.addColorStop(0, shade(color, 0.45));
          g.addColorStop(0.7, color);
          g.addColorStop(1, shade(color, -0.3));
          ctx.beginPath();
          ctx.arc(p.x, p.y, PIECE_R, 0, Math.PI * 2);
          ctx.fillStyle = g;
          ctx.fill();
          ctx.strokeStyle = 'rgba(255,255,255,0.55)';
          ctx.lineWidth = 2;
          ctx.beginPath();
          ctx.arc(p.x, p.y, PIECE_R - 4, 0, Math.PI * 2);
          ctx.stroke();
          ctx.fillStyle = '#fff';
          ctx.font = 'bold 11px system-ui';
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillText(String((i % 5) + 1), p.x, p.y + 0.5);
          if (myTeamTurn) {
            const pulse = 0.45 + Math.sin(performance.now() / 260) * 0.2;
            ctx.strokeStyle = `rgba(255,213,77,${i === st.sel ? 1 : pulse * 0.5})`;
            ctx.lineWidth = i === st.sel ? 3.5 : 2;
            ctx.beginPath();
            ctx.arc(p.x, p.y, PIECE_R + 5, 0, Math.PI * 2);
            ctx.stroke();
          }
        });
        // bola de futebol (gomos)
        const b = st.ball;
        ctx.beginPath();
        ctx.ellipse(b.x + 1.5, b.y + 3, BALL_R * 0.95, BALL_R * 0.7, 0, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(0,0,0,0.28)';
        ctx.fill();
        const bg2 = ctx.createRadialGradient(b.x - 3, b.y - 3.5, 1, b.x, b.y, BALL_R + 1);
        bg2.addColorStop(0, '#ffffff');
        bg2.addColorStop(0.7, '#eceada');
        bg2.addColorStop(1, '#b9b49c');
        ctx.beginPath();
        ctx.arc(b.x, b.y, BALL_R, 0, Math.PI * 2);
        ctx.fillStyle = bg2;
        ctx.fill();
        ctx.fillStyle = '#20242c';
        ctx.beginPath();
        ctx.arc(b.x, b.y, 2.6, 0, Math.PI * 2);
        ctx.fill();
        for (let k = 0; k < 5; k++) {
          const a = (k / 5) * Math.PI * 2 - Math.PI / 2;
          ctx.beginPath();
          ctx.arc(b.x + Math.cos(a) * BALL_R * 0.72, b.y + Math.sin(a) * BALL_R * 0.72, 1.7, 0, Math.PI * 2);
          ctx.fill();
        }
        if (myMove() && st.sel !== null && aim) {
          drawAim(ctx, st.pieces[st.sel].x, st.pieces[st.sel].y, aim.current(), PIECE_R);
        }
        fx.draw(ctx, env.W, env.H);
      },
    };
  },
};
