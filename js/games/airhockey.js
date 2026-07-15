// Air Hockey em tempo real: anfitrião simula o disco; cada jogador arrasta
// seu malho dentro da própria metade. Primeiro a 5 gols.
import { clamp, throttler, roundRect, drawOrb, collideBalls } from '../engine.js';

const WIN = 5;
const PUCK_R = 13;
const MAL_R = 24;

export default {
  id: 'airhockey',
  name: 'Air Hockey',
  icon: '🏒',
  desc: `Tempo real! Primeiro a ${WIN} gols.`,
  local: true,
  create(env) {
    const L = 40, T = 60, Rr = env.W - 40, B = env.H - 40;
    const GOAL_H = 150;
    const GT = (T + B) / 2 - GOAL_H / 2;
    const GB = (T + B) / 2 + GOAL_H / 2;
    let st = null;
    const sendPos = throttler(33);
    const sendSnap = throttler(33);
    const sim = () => env.isLocal || env.isHost;

    function setUi() {
      env.setSub(0, `<b class="big-score">${st.sc[0]}</b>`);
      env.setSub(1, `<b class="big-score">${st.sc[1]}</b>`);
      env.setMsg(st.over ? '' : `${st.sc[0]} × ${st.sc[1]} — primeiro a ${WIN}`);
      if (!st.over) {
        env.setHint(env.seat === -1 ? '👁 Assistindo' : 'Arraste seu malho para rebater o disco.');
      }
    }

    function resetPuck(toward) {
      st.puck.x = env.W / 2 + (toward === 0 ? -60 : 60);
      st.puck.y = (T + B) / 2;
      st.puck.vx = 0;
      st.puck.vy = 0;
    }

    function score(who) {
      st.sc[who]++;
      env.sfx('score', 0.9);
      resetPuck(1 - who);
      setUi();
      if (st.sc[who] >= WIN) {
        st.over = true;
        env.finish(who, `${env.names[who]} venceu por ${st.sc[0]} × ${st.sc[1]}!`);
      }
    }

    function clampMallet(seat) {
      const m = st.mal[seat];
      const [minX, maxX] = seat === 0 ? [L + MAL_R, env.W / 2 - MAL_R] : [env.W / 2 + MAL_R, Rr - MAL_R];
      m.x = clamp(m.x, minX, maxX);
      m.y = clamp(m.y, T + MAL_R, B - MAL_R);
    }

    return {
      st: null,
      start() {
        st = this.st = {
          puck: { x: env.W / 2, y: (T + B) / 2, vx: 0, vy: 0 },
          mal: [
            { x: L + 90, y: (T + B) / 2, vx: 0, vy: 0, px: L + 90, py: (T + B) / 2 },
            { x: Rr - 90, y: (T + B) / 2, vx: 0, vy: 0, px: Rr - 90, py: (T + B) / 2 },
          ],
          sc: [0, 0],
          over: false,
        };
        setUi();
      },
      snapshot() {
        return { p: [st.puck.x, st.puck.y, st.puck.vx, st.puck.vy], m: st.mal.map((m) => [m.x, m.y]), sc: st.sc, over: st.over };
      },
      restore(s) {
        st = this.st = {
          puck: { x: s.p[0], y: s.p[1], vx: s.p[2], vy: s.p[3] },
          mal: s.m.map(([x, y]) => ({ x, y, vx: 0, vy: 0, px: x, py: y })),
          sc: s.sc.slice(),
          over: s.over,
        };
        setUi();
      },
      msg(m) {
        if (m.k === 'mp' && sim()) {
          st.mal[1].x = m.x;
          st.mal[1].y = m.y;
          clampMallet(1);
        } else if (m.k === 's' && !sim()) {
          st.puck.x = m.p[0]; st.puck.y = m.p[1];
          if (env.seat !== 0) { st.mal[0].x = m.m[0][0]; st.mal[0].y = m.m[0][1]; }
          if (env.seat !== 1) { st.mal[1].x = m.m[1][0]; st.mal[1].y = m.m[1][1]; }
          if (m.sc[0] !== st.sc[0] || m.sc[1] !== st.sc[1]) {
            st.sc = m.sc.slice();
            env.sfx('score', 0.7);
            setUi();
          }
        }
      },
      pointer(type, x, y) {
        if (env.seat === -1 || !st || st.over) return;
        let seat;
        if (env.isLocal) seat = x < env.W / 2 ? 0 : 1;
        else seat = env.seat;
        st.mal[seat].x = x;
        st.mal[seat].y = y;
        clampMallet(seat);
        if (!env.isLocal && env.seat === 1 && sendPos()) {
          env.send({ k: 'mp', x: Math.round(st.mal[1].x), y: Math.round(st.mal[1].y) });
        }
        void type;
      },
      key() {},
      tick(dt) {
        if (!st || st.over) return;
        // velocidade dos malhos por diferença finita
        for (const m of st.mal) {
          m.vx = (m.x - m.px) / Math.max(dt, 0.001);
          m.vy = (m.y - m.py) / Math.max(dt, 0.001);
          m.px = m.x;
          m.py = m.y;
        }
        if (!sim()) return;
        const p = st.puck;
        let acc = dt;
        while (acc > 0 && !st.over) {
          const h = Math.min(1 / 120, acc);
          acc -= h;
          p.x += p.vx * h;
          p.y += p.vy * h;
          const damp = Math.exp(-0.35 * h);
          p.vx *= damp;
          p.vy *= damp;
          // paredes (respeitando as bocas dos gols)
          const inMouth = p.y > GT && p.y < GB;
          if (p.y < T + PUCK_R && p.vy < 0) { p.y = T + PUCK_R; p.vy = -p.vy * 0.92; env.sfx('cushion', 0.4); }
          if (p.y > B - PUCK_R && p.vy > 0) { p.y = B - PUCK_R; p.vy = -p.vy * 0.92; env.sfx('cushion', 0.4); }
          if (!inMouth) {
            if (p.x < L + PUCK_R && p.vx < 0) { p.x = L + PUCK_R; p.vx = -p.vx * 0.92; env.sfx('cushion', 0.4); }
            if (p.x > Rr - PUCK_R && p.vx > 0) { p.x = Rr - PUCK_R; p.vx = -p.vx * 0.92; env.sfx('cushion', 0.4); }
          } else {
            if (p.x < L - PUCK_R) { score(1); return; }
            if (p.x > Rr + PUCK_R) { score(0); return; }
          }
          // malhos (massa alta = quase imóveis no impacto)
          for (const m of st.mal) {
            const ghost = { x: m.x, y: m.y, vx: m.vx, vy: m.vy };
            const hit = collideBalls(ghost, p, MAL_R, PUCK_R, 0.9, 1e6, PUCK_R * PUCK_R);
            if (hit > 60) env.sfx('click', Math.min(1, hit / 900));
          }
        }
        const spd = Math.hypot(p.vx, p.vy);
        if (spd > 1100) { p.vx *= 1100 / spd; p.vy *= 1100 / spd; }
        if (!env.isLocal && sendSnap()) {
          env.send({
            k: 's',
            p: [Math.round(p.x), Math.round(p.y)],
            m: st.mal.map((mm) => [Math.round(mm.x), Math.round(mm.y)]),
            sc: st.sc,
          });
        }
      },
      draw(ctx) {
        if (!st) return;
        roundRect(ctx, L - 12, T - 12, Rr - L + 24, B - T + 24, 18);
        ctx.fillStyle = '#e8edf2';
        ctx.fill();
        roundRect(ctx, L, T, Rr - L, B - T, 12);
        ctx.fillStyle = '#f7fafc';
        ctx.fill();
        // linhas
        ctx.strokeStyle = '#c33';
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.moveTo(env.W / 2, T);
        ctx.lineTo(env.W / 2, B);
        ctx.stroke();
        ctx.beginPath();
        ctx.arc(env.W / 2, (T + B) / 2, 55, 0, Math.PI * 2);
        ctx.stroke();
        // gols
        ctx.strokeStyle = '#2a72b5';
        ctx.lineWidth = 8;
        ctx.beginPath(); ctx.moveTo(L - 2, GT); ctx.lineTo(L - 2, GB); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(Rr + 2, GT); ctx.lineTo(Rr + 2, GB); ctx.stroke();
        // placar
        ctx.fillStyle = 'rgba(30,40,60,0.25)';
        ctx.font = 'bold 60px system-ui';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(`${st.sc[0]}  ×  ${st.sc[1]}`, env.W / 2, T + 40);
        // malhos e disco
        drawOrb(ctx, st.mal[0].x, st.mal[0].y, MAL_R, '#ff8a5c');
        drawOrb(ctx, st.mal[1].x, st.mal[1].y, MAL_R, '#59b7ff');
        drawOrb(ctx, st.puck.x, st.puck.y, PUCK_R, '#2b2f38');
      },
    };
  },
};
