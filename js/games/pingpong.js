// Ping Pong em tempo real: o anfitrião simula a bola e transmite snapshots;
// cada jogador controla sua raquete (mouse/toque ou teclado) e envia a posição.
import { clamp, throttler, roundRect } from '../engine.js';

const WIN = 7;
const PAD_H = 92;
const PAD_W = 12;
const BALL_R = 8;

export default {
  id: 'pingpong',
  name: 'Ping Pong',
  icon: '🏓',
  desc: `Tempo real! Primeiro a ${WIN} pontos.`,
  local: true,
  create(env) {
    const TOP = 60;
    const BOT = env.H - 40;
    const X0 = 56;
    const X1 = env.W - 56;
    let st = null;
    let keys = {};
    let padTargets = [null, null];
    const sendPad = throttler(33);
    const sendSnap = throttler(33);
    const sim = () => env.isLocal || env.isHost;

    function serve() {
      st.ball.x = env.W / 2;
      st.ball.y = (TOP + BOT) / 2;
      const dir = st.serveTo === 0 ? -1 : 1;
      st.ball.vx = 430 * dir;
      st.ball.vy = (Math.random() * 2 - 1) * 200;
      st.pause = 0;
    }

    function setUi() {
      env.setSub(0, `<b class="big-score">${st.sc[0]}</b>`);
      env.setSub(1, `<b class="big-score">${st.sc[1]}</b>`);
      env.setMsg(st.over ? '' : `${st.sc[0]} × ${st.sc[1]} — primeiro a ${WIN}`);
      if (!st.over) {
        env.setHint(env.seat === -1
          ? '👁 Assistindo'
          : env.isLocal
            ? 'Esquerda: W/S ou toque à esquerda · Direita: setas ou toque à direita'
            : 'Mova o mouse/dedo ou use W/S · setas para mover sua raquete.');
      }
    }

    function score(who) {
      st.sc[who]++;
      env.sfx('score', 0.8);
      st.serveTo = 1 - who; // saque para quem perdeu o ponto
      st.pause = 1.0;
      st.ball.vx = 0;
      st.ball.vy = 0;
      st.ball.x = env.W / 2;
      st.ball.y = (TOP + BOT) / 2;
      setUi();
      if (st.sc[who] >= WIN) {
        st.over = true;
        env.finish(who, `${env.names[who]} venceu por ${st.sc[0]} × ${st.sc[1]}!`);
      }
    }

    function movePaddles(dt) {
      const SPEED = 560;
      for (const seat of [0, 1]) {
        const canControl = env.isLocal || env.seat === seat;
        if (!canControl) continue;
        let target = padTargets[seat];
        const upKey = seat === 0 || !env.isLocal ? keys.w : false;
        const dnKey = seat === 0 || !env.isLocal ? keys.s : false;
        const upA = seat === 1 || !env.isLocal ? keys.ArrowUp : false;
        const dnA = seat === 1 || !env.isLocal ? keys.ArrowDown : false;
        if (upKey || upA) { st.py[seat] -= SPEED * dt; target = null; padTargets[seat] = null; }
        if (dnKey || dnA) { st.py[seat] += SPEED * dt; target = null; padTargets[seat] = null; }
        if (target != null) {
          const d = target - st.py[seat];
          st.py[seat] += clamp(d, -SPEED * dt * 1.6, SPEED * dt * 1.6);
        }
        st.py[seat] = clamp(st.py[seat], TOP + PAD_H / 2, BOT - PAD_H / 2);
      }
      if (!env.isLocal && !env.isHost && env.seat === 1 && sendPad()) {
        env.send({ k: 'pd', y: Math.round(st.py[1]) });
      }
    }

    return {
      st: null,
      start() {
        st = this.st = {
          ball: { x: env.W / 2, y: (TOP + BOT) / 2, vx: 0, vy: 0 },
          py: [(TOP + BOT) / 2, (TOP + BOT) / 2],
          sc: [0, 0],
          serveTo: Math.random() < 0.5 ? 0 : 1,
          pause: 1.2,
          over: false,
        };
        keys = {};
        setUi();
      },
      snapshot() { return { b: [st.ball.x, st.ball.y, st.ball.vx, st.ball.vy], py: st.py, sc: st.sc, serveTo: st.serveTo, pause: st.pause, over: st.over }; },
      restore(s) {
        st = this.st = {
          ball: { x: s.b[0], y: s.b[1], vx: s.b[2], vy: s.b[3] },
          py: s.py.slice(), sc: s.sc.slice(), serveTo: s.serveTo, pause: s.pause, over: s.over,
        };
        setUi();
      },
      msg(m) {
        if (m.k === 'pd' && sim()) {
          st.py[1] = clamp(m.y, TOP + PAD_H / 2, BOT - PAD_H / 2);
        } else if (m.k === 's' && !sim()) {
          st.ball.x = m.b[0]; st.ball.y = m.b[1];
          if (env.seat !== 0) st.py[0] = m.p[0];
          if (env.seat !== 1) st.py[1] = m.p[1];
          if (m.sc[0] !== st.sc[0] || m.sc[1] !== st.sc[1]) {
            st.sc = m.sc.slice();
            env.sfx('score', 0.7);
            setUi();
          }
        }
      },
      pointer(type, x, y, pid) {
        if (env.seat === -1) return;
        if (env.isLocal) {
          const seat = x < env.W / 2 ? 0 : 1;
          padTargets[seat] = y;
        } else {
          padTargets[env.seat] = y;
        }
        void type; void pid;
      },
      key(type, k) {
        if (env.seat === -1) return;
        const map = { w: 'w', W: 'w', s: 's', S: 's', ArrowUp: 'ArrowUp', ArrowDown: 'ArrowDown' };
        if (map[k]) keys[map[k]] = type === 'down';
      },
      tick(dt) {
        if (!st || st.over) return;
        movePaddles(dt);
        if (!sim()) return;
        if (st.pause > 0) {
          st.pause -= dt;
          if (st.pause <= 0) serve();
        } else {
          const b = st.ball;
          let acc = dt;
          while (acc > 0 && !st.over) {
            const h = Math.min(1 / 120, acc);
            acc -= h;
            b.x += b.vx * h;
            b.y += b.vy * h;
            if (b.y < TOP + BALL_R && b.vy < 0) { b.y = TOP + BALL_R; b.vy = -b.vy; env.sfx('cushion', 0.4); }
            if (b.y > BOT - BALL_R && b.vy > 0) { b.y = BOT - BALL_R; b.vy = -b.vy; env.sfx('cushion', 0.4); }
            // raquetes
            if (b.vx < 0 && b.x < X0 + PAD_W / 2 + BALL_R && b.x > X0 - 24 && Math.abs(b.y - st.py[0]) < PAD_H / 2 + BALL_R) {
              b.x = X0 + PAD_W / 2 + BALL_R;
              b.vx = Math.min(950, -b.vx * 1.06);
              b.vy += (b.y - st.py[0]) * 5.2;
              env.sfx('click', 0.7);
            }
            if (b.vx > 0 && b.x > X1 - PAD_W / 2 - BALL_R && b.x < X1 + 24 && Math.abs(b.y - st.py[1]) < PAD_H / 2 + BALL_R) {
              b.x = X1 - PAD_W / 2 - BALL_R;
              b.vx = Math.max(-950, -b.vx * 1.06);
              b.vy += (b.y - st.py[1]) * 5.2;
              env.sfx('click', 0.7);
            }
            if (b.x < 8) { score(1); break; }
            if (b.x > env.W - 8) { score(0); break; }
          }
        }
        if (!env.isLocal && sendSnap()) {
          env.send({ k: 's', b: [Math.round(st.ball.x), Math.round(st.ball.y)], p: [Math.round(st.py[0]), Math.round(st.py[1])], sc: st.sc });
        }
      },
      draw(ctx) {
        if (!st) return;
        // mesa
        roundRect(ctx, 30, TOP - 22, env.W - 60, BOT - TOP + 44, 14);
        ctx.fillStyle = '#155e8a';
        ctx.fill();
        ctx.strokeStyle = 'rgba(255,255,255,0.5)';
        ctx.lineWidth = 3;
        roundRect(ctx, 38, TOP - 14, env.W - 76, BOT - TOP + 28, 10);
        ctx.stroke();
        ctx.setLineDash([10, 12]);
        ctx.beginPath();
        ctx.moveTo(env.W / 2, TOP - 14);
        ctx.lineTo(env.W / 2, BOT + 14);
        ctx.stroke();
        ctx.setLineDash([]);
        // placar grande
        ctx.fillStyle = 'rgba(255,255,255,0.18)';
        ctx.font = 'bold 64px system-ui';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(String(st.sc[0]), env.W / 2 - 90, TOP + 40);
        ctx.fillText(String(st.sc[1]), env.W / 2 + 90, TOP + 40);
        // raquetes
        ctx.fillStyle = '#ff8a5c';
        roundRect(ctx, X0 - PAD_W / 2, st.py[0] - PAD_H / 2, PAD_W, PAD_H, 6);
        ctx.fill();
        ctx.fillStyle = '#59b7ff';
        roundRect(ctx, X1 - PAD_W / 2, st.py[1] - PAD_H / 2, PAD_W, PAD_H, 6);
        ctx.fill();
        // bola
        ctx.beginPath();
        ctx.arc(st.ball.x, st.ball.y, BALL_R, 0, Math.PI * 2);
        ctx.fillStyle = '#f6f3e8';
        ctx.fill();
      },
    };
  },
};
