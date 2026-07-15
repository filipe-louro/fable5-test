// Ping Pong em tempo real: o anfitrião simula a bola e transmite snapshots;
// cada jogador controla sua raquete (mouse/toque ou teclado) e envia a posição.
import { clamp, throttler, roundRect, drawFrame, Trail, Fx, shade } from '../engine.js';

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
    const trail = new Trail(9);
    const fx = new Fx();

    function pointFx(who) {
      fx.banner('PONTO!', { color: who === 0 ? '#ff8a5c' : '#59b7ff' });
      fx.burst(who === 0 ? env.W - 60 : 60, (TOP + BOT) / 2, who === 0 ? '#ff8a5c' : '#59b7ff', 18);
      trail.clear();
    }

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
      pointFx(who);
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
            const who = m.sc[0] !== st.sc[0] ? 0 : 1;
            st.sc = m.sc.slice();
            env.sfx('score', 0.7);
            pointFx(who);
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
        fx.tick(dt);
        if (!st || st.over) return;
        if (st.pause <= 0) trail.push(st.ball.x, st.ball.y);
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
        drawFrame(ctx, 44, TOP - 8, env.W - 88, BOT - TOP + 16, 34, {
          felt: '#175f8d', woodA: '#4a5566', woodB: '#262d38', vignette: 0.24,
        });
        // superfície da mesa com brilho diagonal
        const sheen = ctx.createLinearGradient(44, TOP, env.W - 44, BOT);
        sheen.addColorStop(0, 'rgba(255,255,255,0.07)');
        sheen.addColorStop(0.45, 'rgba(255,255,255,0)');
        sheen.addColorStop(0.55, 'rgba(255,255,255,0.05)');
        sheen.addColorStop(1, 'rgba(255,255,255,0)');
        ctx.fillStyle = sheen;
        ctx.fillRect(44, TOP - 8, env.W - 88, BOT - TOP + 16);
        // linhas oficiais
        ctx.strokeStyle = 'rgba(255,255,255,0.85)';
        ctx.lineWidth = 3;
        ctx.strokeRect(52, TOP, env.W - 104, BOT - TOP);
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.moveTo(52, (TOP + BOT) / 2);
        ctx.lineTo(env.W - 52, (TOP + BOT) / 2);
        ctx.stroke();
        // rede com postes e sombra
        ctx.fillStyle = 'rgba(0,0,0,0.18)';
        ctx.fillRect(env.W / 2 + 3, TOP - 6, 7, BOT - TOP + 12);
        ctx.strokeStyle = 'rgba(230,235,245,0.9)';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(env.W / 2, TOP - 10);
        ctx.lineTo(env.W / 2, BOT + 10);
        ctx.stroke();
        ctx.strokeStyle = 'rgba(230,235,245,0.35)';
        ctx.lineWidth = 1;
        for (let y = TOP - 8; y < BOT + 8; y += 7) {
          ctx.beginPath();
          ctx.moveTo(env.W / 2 - 3, y);
          ctx.lineTo(env.W / 2 + 3, y + 4);
          ctx.stroke();
        }
        for (const py of [TOP - 12, BOT + 12]) {
          ctx.beginPath();
          ctx.arc(env.W / 2, py, 4.5, 0, Math.PI * 2);
          ctx.fillStyle = '#20242c';
          ctx.fill();
        }
        // placar grande na mesa
        ctx.fillStyle = 'rgba(255,255,255,0.16)';
        ctx.font = 'bold 72px system-ui';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(String(st.sc[0]), env.W / 2 - 110, (TOP + BOT) / 2);
        ctx.fillText(String(st.sc[1]), env.W / 2 + 110, (TOP + BOT) / 2);
        // contagem de saque
        if (st.pause > 0 && !st.over) {
          ctx.fillStyle = 'rgba(255,255,255,0.6)';
          ctx.font = 'bold 20px system-ui';
          ctx.fillText(`Saque de ${env.names[st.serveTo === 0 ? 1 : 0]}…`, env.W / 2, TOP - 28);
        }
        // rastro + bola
        trail.draw(ctx, BALL_R, '#fff3c0');
        if (st.pause <= 0 || st.over) {
          ctx.beginPath();
          ctx.ellipse(st.ball.x + 2, st.ball.y + 4, BALL_R * 0.9, BALL_R * 0.55, 0, 0, Math.PI * 2);
          ctx.fillStyle = 'rgba(0,0,0,0.25)';
          ctx.fill();
          const bg = ctx.createRadialGradient(st.ball.x - 3, st.ball.y - 3, 1, st.ball.x, st.ball.y, BALL_R + 1);
          bg.addColorStop(0, '#ffffff');
          bg.addColorStop(0.6, '#f4efdc');
          bg.addColorStop(1, '#c9c0a0');
          ctx.beginPath();
          ctx.arc(st.ball.x, st.ball.y, BALL_R, 0, Math.PI * 2);
          ctx.fillStyle = bg;
          ctx.fill();
        }
        // raquetes: borracha redonda + cabo
        const racket = (x, y, color, side) => {
          const dir = side === 0 ? -1 : 1;
          ctx.save();
          ctx.beginPath();
          ctx.ellipse(x + 3, y + 6, 24, 30, 0, 0, Math.PI * 2);
          ctx.fillStyle = 'rgba(0,0,0,0.25)';
          ctx.fill();
          // cabo
          ctx.rotate(0);
          const hx = x + dir * 16;
          const hg = ctx.createLinearGradient(hx, y + 20, hx, y + 52);
          hg.addColorStop(0, '#d9b47c');
          hg.addColorStop(1, '#8a5a2b');
          roundRect(ctx, hx - 6, y + 18, 12, 36, 6);
          ctx.fillStyle = hg;
          ctx.fill();
          // borracha
          const rg = ctx.createRadialGradient(x - 7, y - 9, 3, x, y, 30);
          rg.addColorStop(0, shade(color, 0.35));
          rg.addColorStop(0.75, color);
          rg.addColorStop(1, shade(color, -0.35));
          ctx.beginPath();
          ctx.ellipse(x, y, 22, PAD_H / 2, 0, 0, Math.PI * 2);
          ctx.fillStyle = rg;
          ctx.fill();
          ctx.strokeStyle = 'rgba(0,0,0,0.35)';
          ctx.lineWidth = 2;
          ctx.stroke();
          ctx.beginPath();
          ctx.ellipse(x, y, 15, PAD_H / 2 - 8, 0, 0, Math.PI * 2);
          ctx.strokeStyle = 'rgba(255,255,255,0.22)';
          ctx.lineWidth = 1.5;
          ctx.stroke();
          ctx.restore();
        };
        racket(X0, st.py[0], '#e04a3a', 0);
        racket(X1, st.py[1], '#2f6fd0', 1);
        fx.draw(ctx, env.W, env.H);
      },
    };
  },
};
