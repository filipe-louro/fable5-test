// Ping Pong em tempo real: movimento 2D das raquetes (avanço para a rede e
// recuo para a linha de fundo), controle de efeito/spin (Efeito Magnus) e
// física acústica realista de tênis de mesa.
import { clamp, throttler, roundRect, drawFrame, Trail, Fx, shade } from '../engine.js';

const WIN = 7;
const PAD_H = 84;
const PAD_W = 16;
const BALL_R = 8;

export default {
  id: 'pingpong',
  name: 'Ping Pong',
  icon: '🏓',
  desc: `Tempo real! Movimento 2D da raquete e curva com efeito Magnus. Primeiro a ${WIN} pontos.`,
  local: true,
  create(env) {
    const TOP = 60;
    const BOT = env.H - 40;
    let st = null;
    let keys = {};
    let padTargets = [null, null];
    const sendPad = throttler(30);
    const sendSnap = throttler(30);
    const sim = () => env.isLocal || env.isHost;
    const trail = new Trail(12);
    const fx = new Fx();

    function pointFx(who) {
      fx.banner('PONTO!', { color: who === 0 ? '#ff8a5c' : '#59b7ff' });
      fx.burst(who === 0 ? env.W - 60 : 60, (TOP + BOT) / 2, who === 0 ? '#ff8a5c' : '#59b7ff', 20);
      trail.clear();
    }

    function serve() {
      st.ball.x = env.W / 2;
      st.ball.y = (TOP + BOT) / 2;
      const dir = st.serveTo === 0 ? -1 : 1;
      st.ball.vx = 440 * dir;
      st.ball.vy = (Math.random() * 2 - 1) * 160;
      st.ball.spin = 0;
      st.pause = 0;
      env.sfx('tt_paddle', 0.6);
    }

    function setUi() {
      env.setSub(0, `<b class="big-score">${st.sc[0]}</b>`);
      env.setSub(1, `<b class="big-score">${st.sc[1]}</b>`);
      env.setMsg(st.over ? '' : `${st.sc[0]} × ${st.sc[1]} — primeiro a ${WIN}`);
      if (!st.over) {
        env.setHint(env.seat === -1
          ? 'Modo Espectador'
          : env.isLocal
            ? 'Esquerda: W/A/S/D ou arraste · Direita: Setas ou arraste. Raspe na bola para dar curva!'
            : 'Mova a raquete em 2D com mouse ou W/A/S/D / Setas. Raspe para cima/baixo para efeito Magnus!');
      }
    }

    function score(who) {
      st.sc[who]++;
      env.sfx('whistle', 0.8);
      env.sfx('score', 0.85);
      pointFx(who);
      st.serveTo = 1 - who;
      st.pause = 1.1;
      st.ball.vx = 0;
      st.ball.vy = 0;
      st.ball.spin = 0;
      st.ball.x = env.W / 2;
      st.ball.y = (TOP + BOT) / 2;
      setUi();
      if (st.sc[who] >= WIN) {
        st.over = true;
        env.finish(who, `${env.names[who]} venceu por ${st.sc[0]} × ${st.sc[1]}!`);
      }
    }

    function clampPad(seat) {
      const p = st.pad[seat];
      const minX = seat === 0 ? 54 : env.W / 2 + 36;
      const maxX = seat === 0 ? env.W / 2 - 36 : env.W - 54;
      p.x = clamp(p.x, minX, maxX);
      p.y = clamp(p.y, TOP + PAD_H / 2, BOT - PAD_H / 2);
    }

    function movePaddles(dt) {
      const SPEED_X = 540;
      const SPEED_Y = 620;

      for (const seat of [0, 1]) {
        const canControl = env.isLocal || env.seat === seat;
        if (!canControl) continue;

        const p = st.pad[seat];
        let target = padTargets[seat];

        // Teclas
        const up = seat === 0 || !env.isLocal ? keys.w : false;
        const dn = seat === 0 || !env.isLocal ? keys.s : false;
        const lf = seat === 0 || !env.isLocal ? keys.a : false;
        const rt = seat === 0 || !env.isLocal ? keys.d : false;

        const up2 = seat === 1 || !env.isLocal ? keys.ArrowUp : false;
        const dn2 = seat === 1 || !env.isLocal ? keys.ArrowDown : false;
        const lf2 = seat === 1 || !env.isLocal ? keys.ArrowLeft : false;
        const rt2 = seat === 1 || !env.isLocal ? keys.ArrowRight : false;

        let kx = 0, ky = 0;
        if (up || up2) ky -= 1;
        if (dn || dn2) ky += 1;
        if (lf || lf2) kx -= 1;
        if (rt || rt2) kx += 1;

        if (kx !== 0 || ky !== 0) {
          p.x += kx * SPEED_X * dt;
          p.y += ky * SPEED_Y * dt;
          target = null;
          padTargets[seat] = null;
        } else if (target) {
          const dx = target.x - p.x;
          const dy = target.y - p.y;
          p.x += clamp(dx, -2600 * dt, 2600 * dt);
          p.y += clamp(dy, -2800 * dt, 2800 * dt);
        }

        clampPad(seat);

        // Velocidade real da raquete por diferenças finitas
        p.vx = (p.x - p.px) / Math.max(0.001, dt);
        p.vy = (p.y - p.py) / Math.max(0.001, dt);
        p.px = p.x;
        p.py = p.y;
      }

      if (!env.isLocal && !env.isHost && env.seat === 1 && sendPad()) {
        env.send({
          k: 'pd',
          x: Math.round(st.pad[1].x),
          y: Math.round(st.pad[1].y),
          vx: Math.round(st.pad[1].vx),
          vy: Math.round(st.pad[1].vy),
        });
      }
    }

    return {
      st: null,
      start() {
        st = this.st = {
          ball: { x: env.W / 2, y: (TOP + BOT) / 2, vx: 0, vy: 0, spin: 0 },
          pad: [
            { x: 74, y: (TOP + BOT) / 2, vx: 0, vy: 0, px: 74, py: (TOP + BOT) / 2 },
            { x: env.W - 74, y: (TOP + BOT) / 2, vx: 0, vy: 0, px: env.W - 74, py: (TOP + BOT) / 2 },
          ],
          sc: [0, 0],
          serveTo: Math.random() < 0.5 ? 0 : 1,
          pause: 1.2,
          over: false,
        };
        keys = {};
        padTargets = [null, null];
        setUi();
      },
      snapshot() {
        return {
          b: [st.ball.x, st.ball.y, st.ball.vx, st.ball.vy, st.ball.spin],
          pad: st.pad.map((p) => [p.x, p.y]),
          sc: st.sc,
          serveTo: st.serveTo,
          pause: st.pause,
          over: st.over,
        };
      },
      restore(s) {
        st = this.st = {
          ball: { x: s.b[0], y: s.b[1], vx: s.b[2], vy: s.b[3], spin: s.b[4] || 0 },
          pad: s.pad.map(([x, y]) => ({ x, y, vx: 0, vy: 0, px: x, py: y })),
          sc: s.sc.slice(),
          serveTo: s.serveTo,
          pause: s.pause,
          over: s.over,
        };
        setUi();
      },
      msg(m) {
        if (m.k === 'pd' && sim()) {
          st.pad[1].x = m.x;
          st.pad[1].y = m.y;
          st.pad[1].vx = m.vx || 0;
          st.pad[1].vy = m.vy || 0;
          clampPad(1);
        } else if (m.k === 's' && !sim()) {
          st.ball.x = m.b[0];
          st.ball.y = m.b[1];
          st.ball.spin = m.b[4] || 0;
          if (env.seat !== 0 && m.p) { st.pad[0].x = m.p[0][0]; st.pad[0].y = m.p[0][1]; }
          if (env.seat !== 1 && m.p) { st.pad[1].x = m.p[1][0]; st.pad[1].y = m.p[1][1]; }
          if (m.sc[0] !== st.sc[0] || m.sc[1] !== st.sc[1]) {
            const who = m.sc[0] !== st.sc[0] ? 0 : 1;
            st.sc = m.sc.slice();
            env.sfx('whistle', 0.8);
            env.sfx('score', 0.7);
            pointFx(who);
            setUi();
          }
        }
      },
      pointer(type, x, y) {
        if (env.seat === -1 || !st || st.over) return;
        let seat;
        if (env.isLocal) seat = x < env.W / 2 ? 0 : 1;
        else seat = env.seat;

        padTargets[seat] = { x, y };
        void type;
      },
      key(type, k) {
        if (env.seat === -1) return;
        const map = {
          w: 'w', W: 'w', s: 's', S: 's', a: 'a', A: 'a', d: 'd', D: 'd',
          ArrowUp: 'ArrowUp', ArrowDown: 'ArrowDown', ArrowLeft: 'ArrowLeft', ArrowRight: 'ArrowRight',
        };
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

            // Efeito Magnus: curva vertical provocada pelo spin
            b.vy += b.spin * 320 * h;
            b.spin *= Math.exp(-0.45 * h);

            b.x += b.vx * h;
            b.y += b.vy * h;

            // Bordas da mesa (topo e base)
            if (b.y < TOP + BALL_R && b.vy < 0) {
              b.y = TOP + BALL_R;
              b.vy = -b.vy * 0.96;
              b.vx += b.spin * 30;
              b.spin = -b.spin * 0.35;
              env.sfx('tt_table', 0.65);
            }
            if (b.y > BOT - BALL_R && b.vy > 0) {
              b.y = BOT - BALL_R;
              b.vy = -b.vy * 0.96;
              b.vx += b.spin * 30;
              b.spin = -b.spin * 0.35;
              env.sfx('tt_table', 0.65);
            }

            // Raquete 0 (esquerda)
            const p0 = st.pad[0];
            const hit0X = b.vx < 0 && b.x <= p0.x + PAD_W / 2 + BALL_R && b.x >= p0.x - PAD_W / 2 - 14;
            const hit0Y = Math.abs(b.y - p0.y) <= PAD_H / 2 + BALL_R;
            if (hit0X && hit0Y) {
              b.x = p0.x + PAD_W / 2 + BALL_R;
              const fwdBonus = Math.max(0, p0.vx * 0.4);
              b.vx = Math.min(1080, (-b.vx + fwdBonus) * 1.05 + 35);
              b.vy = (b.y - p0.y) * 4.6 + p0.vy * 0.35;
              b.spin = clamp(b.spin * 0.2 + (p0.vy * 0.007) + ((b.y - p0.y) * 0.015), -3.2, 3.2);
              env.sfx('tt_paddle', 0.85);
            }

            // Raquete 1 (direita)
            const p1 = st.pad[1];
            const hit1X = b.vx > 0 && b.x >= p1.x - PAD_W / 2 - BALL_R && b.x <= p1.x + PAD_W / 2 + 14;
            const hit1Y = Math.abs(b.y - p1.y) <= PAD_H / 2 + BALL_R;
            if (hit1X && hit1Y) {
              b.x = p1.x - PAD_W / 2 - BALL_R;
              const fwdBonus = Math.max(0, -p1.vx * 0.4);
              b.vx = Math.max(-1080, (-b.vx - fwdBonus) * 1.05 - 35);
              b.vy = (b.y - p1.y) * 4.6 + p1.vy * 0.35;
              b.spin = clamp(b.spin * 0.2 + (p1.vy * 0.007) + ((b.y - p1.y) * 0.015), -3.2, 3.2);
              env.sfx('tt_paddle', 0.85);
            }

            // Ponto
            if (b.x < 8) { score(1); break; }
            if (b.x > env.W - 8) { score(0); break; }
          }
        }

        if (!env.isLocal && sendSnap()) {
          env.send({
            k: 's',
            b: [Math.round(st.ball.x), Math.round(st.ball.y), Math.round(st.ball.vx), Math.round(st.ball.vy), Math.round(st.ball.spin * 10) / 10],
            p: st.pad.map((pp) => [Math.round(pp.x), Math.round(pp.y)]),
            sc: st.sc,
          });
        }
      },
      draw(ctx) {
        if (!st) return;
        drawFrame(ctx, 44, TOP - 8, env.W - 88, BOT - TOP + 16, 34, {
          felt: '#145680', woodA: '#445163', woodB: '#222933', vignette: 0.24,
        });

        // Superfície da mesa com brilho diagonal
        const sheen = ctx.createLinearGradient(44, TOP, env.W - 44, BOT);
        sheen.addColorStop(0, 'rgba(255,255,255,0.08)');
        sheen.addColorStop(0.45, 'rgba(255,255,255,0)');
        sheen.addColorStop(0.55, 'rgba(255,255,255,0.06)');
        sheen.addColorStop(1, 'rgba(255,255,255,0)');
        ctx.fillStyle = sheen;
        ctx.fillRect(44, TOP - 8, env.W - 88, BOT - TOP + 16);

        // Linhas oficiais
        ctx.strokeStyle = 'rgba(255,255,255,0.85)';
        ctx.lineWidth = 3;
        ctx.strokeRect(52, TOP, env.W - 104, BOT - TOP);
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.moveTo(52, (TOP + BOT) / 2);
        ctx.lineTo(env.W - 52, (TOP + BOT) / 2);
        ctx.stroke();

        // Rede com postes e sombra
        ctx.fillStyle = 'rgba(0,0,0,0.2)';
        ctx.fillRect(env.W / 2 + 3, TOP - 6, 7, BOT - TOP + 12);
        ctx.strokeStyle = 'rgba(230,235,245,0.9)';
        ctx.lineWidth = 2.5;
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

        // Placar grande na mesa
        ctx.fillStyle = 'rgba(255,255,255,0.16)';
        ctx.font = 'bold 72px system-ui';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(String(st.sc[0]), env.W / 2 - 110, (TOP + BOT) / 2);
        ctx.fillText(String(st.sc[1]), env.W / 2 + 110, (TOP + BOT) / 2);

        // Contagem de saque
        if (st.pause > 0 && !st.over) {
          ctx.fillStyle = 'rgba(255,255,255,0.65)';
          ctx.font = 'bold 20px system-ui';
          ctx.fillText(`Saque de ${env.names[st.serveTo === 0 ? 1 : 0]}…`, env.W / 2, TOP - 28);
        }

        // Rastro da bola (cor influenciada pelo spin)
        const trailColor = Math.abs(st.ball.spin) > 0.8
          ? (st.ball.spin > 0 ? '#ffea75' : '#85e3ff')
          : '#ffffff';
        trail.draw(ctx, BALL_R, trailColor);

        // Bola
        if (st.pause <= 0 || st.over) {
          const b = st.ball;
          ctx.beginPath();
          ctx.ellipse(b.x + 2, b.y + 4, BALL_R * 0.9, BALL_R * 0.55, 0, 0, Math.PI * 2);
          ctx.fillStyle = 'rgba(0,0,0,0.25)';
          ctx.fill();

          const bg = ctx.createRadialGradient(b.x - 3, b.y - 3, 1, b.x, b.y, BALL_R + 1);
          bg.addColorStop(0, '#ffffff');
          bg.addColorStop(0.6, '#f4efdc');
          bg.addColorStop(1, '#c9c0a0');
          ctx.beginPath();
          ctx.arc(b.x, b.y, BALL_R, 0, Math.PI * 2);
          ctx.fillStyle = bg;
          ctx.fill();

          // Indicador sutil de curva/spin na bola
          if (Math.abs(b.spin) > 0.4) {
            ctx.save();
            ctx.strokeStyle = b.spin > 0 ? 'rgba(255,180,50,0.7)' : 'rgba(80,200,255,0.7)';
            ctx.lineWidth = 1.5;
            ctx.beginPath();
            ctx.arc(b.x, b.y, BALL_R + 3, -Math.PI / 3, Math.PI / 3);
            ctx.stroke();
            ctx.restore();
          }
        }

        // Raquetes em movimento 2D (cabo de madeira + lâmina arredondada com borracha)
        const racket = (p, color, side) => {
          const dir = side === 0 ? -1 : 1;
          ctx.save();
          // Sombra
          ctx.beginPath();
          ctx.ellipse(p.x + 3, p.y + 6, 22, 28, 0, 0, Math.PI * 2);
          ctx.fillStyle = 'rgba(0,0,0,0.25)';
          ctx.fill();

          // Cabo de madeira
          const hx = p.x + dir * 18;
          const hg = ctx.createLinearGradient(hx, p.y + 16, hx, p.y + 48);
          hg.addColorStop(0, '#d9b47c');
          hg.addColorStop(1, '#8a5a2b');
          roundRect(ctx, hx - 5, p.y + 14, 10, 32, 5);
          ctx.fillStyle = hg;
          ctx.fill();

          // Lâmina / borracha
          const rg = ctx.createRadialGradient(p.x - 6, p.y - 8, 3, p.x, p.y, 28);
          rg.addColorStop(0, shade(color, 0.4));
          rg.addColorStop(0.75, color);
          rg.addColorStop(1, shade(color, -0.35));
          ctx.beginPath();
          ctx.ellipse(p.x, p.y, PAD_W, PAD_H / 2, 0, 0, Math.PI * 2);
          ctx.fillStyle = rg;
          ctx.fill();
          ctx.strokeStyle = 'rgba(0,0,0,0.35)';
          ctx.lineWidth = 2;
          ctx.stroke();

          // Borda interna brilhante
          ctx.beginPath();
          ctx.ellipse(p.x, p.y, PAD_W - 4, PAD_H / 2 - 8, 0, 0, Math.PI * 2);
          ctx.strokeStyle = 'rgba(255,255,255,0.25)';
          ctx.lineWidth = 1.5;
          ctx.stroke();
          ctx.restore();
        };

        racket(st.pad[0], '#e04a3a', 0);
        racket(st.pad[1], '#2f6fd0', 1);

        fx.draw(ctx, env.W, env.H);
      },
    };
  },
};
