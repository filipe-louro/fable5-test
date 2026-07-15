// Air Hockey em tempo real: anfitrião simula o disco; cada jogador arrasta
// seu malho dentro da própria metade. Primeiro a 5 gols.
import { clamp, throttler, roundRect, collideBalls, drawFrame, Trail, Fx, shade } from '../engine.js';

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
    const trail = new Trail(10);
    const fx = new Fx();

    function goalFx(who) {
      fx.banner('GOL!', { color: who === 0 ? '#ff8a5c' : '#59b7ff' });
      fx.burst(who === 0 ? Rr : L, (T + B) / 2, who === 0 ? '#ff8a5c' : '#59b7ff', 24, 320);
      trail.clear();
    }

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
      goalFx(who);
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
            const who = m.sc[0] !== st.sc[0] ? 0 : 1;
            st.sc = m.sc.slice();
            env.sfx('score', 0.7);
            goalFx(who);
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
        fx.tick(dt);
        if (!st || st.over) return;
        trail.push(st.puck.x, st.puck.y);
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
        drawFrame(ctx, L, T, Rr - L, B - T, 36, {
          felt: '#e9eef4', woodA: '#5a6b85', woodB: '#2c3546', vignette: 0, pad: 10,
        });
        // superfície com brilho de vidro
        const glass = ctx.createLinearGradient(L, T, Rr, B);
        glass.addColorStop(0, 'rgba(255,255,255,0.5)');
        glass.addColorStop(0.35, 'rgba(255,255,255,0)');
        glass.addColorStop(0.7, 'rgba(160,190,225,0.14)');
        glass.addColorStop(1, 'rgba(255,255,255,0.25)');
        roundRect(ctx, L, T, Rr - L, B - T, 8);
        ctx.fillStyle = glass;
        ctx.fill();
        // furos de ar
        ctx.fillStyle = 'rgba(90,110,140,0.22)';
        for (let x = L + 24; x < Rr - 10; x += 38) {
          for (let y = T + 24; y < B - 10; y += 38) {
            ctx.beginPath();
            ctx.arc(x, y, 1.6, 0, Math.PI * 2);
            ctx.fill();
          }
        }
        // linhas oficiais
        ctx.strokeStyle = '#d0413a';
        ctx.lineWidth = 4;
        ctx.beginPath(); ctx.moveTo(env.W / 2, T); ctx.lineTo(env.W / 2, B); ctx.stroke();
        ctx.beginPath(); ctx.arc(env.W / 2, (T + B) / 2, 58, 0, Math.PI * 2); ctx.stroke();
        ctx.beginPath(); ctx.arc(env.W / 2, (T + B) / 2, 7, 0, Math.PI * 2);
        ctx.fillStyle = '#d0413a';
        ctx.fill();
        ctx.lineWidth = 3;
        for (const gx of [L, Rr]) {
          ctx.beginPath();
          ctx.arc(gx, (T + B) / 2, 86, gx === L ? -Math.PI / 2 : Math.PI / 2, gx === L ? Math.PI / 2 : Math.PI * 1.5);
          ctx.strokeStyle = '#3a78bd';
          ctx.stroke();
        }
        // bocas dos gols com profundidade
        for (const [gx, dir] of [[L, -1], [Rr, 1]]) {
          const g = ctx.createLinearGradient(gx, 0, gx + dir * 22, 0);
          g.addColorStop(0, 'rgba(20,26,36,0.9)');
          g.addColorStop(1, 'rgba(20,26,36,0.2)');
          ctx.fillStyle = g;
          ctx.fillRect(dir === -1 ? gx - 20 : gx, GT, 20, GOAL_H);
          ctx.strokeStyle = '#2a72b5';
          ctx.lineWidth = 5;
          ctx.beginPath();
          ctx.moveTo(gx + dir * 2, GT - 4);
          ctx.lineTo(gx + dir * 2, GB + 4);
          ctx.stroke();
        }
        // placar
        ctx.fillStyle = 'rgba(30,40,60,0.18)';
        ctx.font = 'bold 62px system-ui';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(`${st.sc[0]}   ${st.sc[1]}`, env.W / 2, T + 44);
        // rastro do disco
        trail.draw(ctx, PUCK_R, '#4a5568');
        // disco (corpo com espessura)
        const p = st.puck;
        ctx.beginPath();
        ctx.ellipse(p.x + 2, p.y + 4, PUCK_R, PUCK_R * 0.7, 0, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(0,0,0,0.3)';
        ctx.fill();
        ctx.beginPath();
        ctx.ellipse(p.x, p.y + 3, PUCK_R, PUCK_R * 0.85, 0, 0, Math.PI * 2);
        ctx.fillStyle = '#14161c';
        ctx.fill();
        const pg = ctx.createRadialGradient(p.x - 4, p.y - 5, 1, p.x, p.y, PUCK_R + 2);
        pg.addColorStop(0, '#4d5464');
        pg.addColorStop(0.7, '#262b36');
        pg.addColorStop(1, '#14161c');
        ctx.beginPath();
        ctx.ellipse(p.x, p.y, PUCK_R, PUCK_R * 0.85, 0, 0, Math.PI * 2);
        ctx.fillStyle = pg;
        ctx.fill();
        // malhos: base + pegador com brilho
        const mallet = (m, color) => {
          ctx.beginPath();
          ctx.ellipse(m.x + 3, m.y + 6, MAL_R, MAL_R * 0.72, 0, 0, Math.PI * 2);
          ctx.fillStyle = 'rgba(0,0,0,0.28)';
          ctx.fill();
          ctx.beginPath();
          ctx.ellipse(m.x, m.y + 4, MAL_R, MAL_R * 0.85, 0, 0, Math.PI * 2);
          ctx.fillStyle = shade(color, -0.45);
          ctx.fill();
          const bg = ctx.createRadialGradient(m.x - 8, m.y - 8, 2, m.x, m.y, MAL_R + 2);
          bg.addColorStop(0, shade(color, 0.4));
          bg.addColorStop(0.75, color);
          bg.addColorStop(1, shade(color, -0.3));
          ctx.beginPath();
          ctx.ellipse(m.x, m.y, MAL_R, MAL_R * 0.85, 0, 0, Math.PI * 2);
          ctx.fillStyle = bg;
          ctx.fill();
          // pegador
          const kg = ctx.createRadialGradient(m.x - 4, m.y - 8, 1, m.x, m.y - 4, 12);
          kg.addColorStop(0, shade(color, 0.55));
          kg.addColorStop(1, shade(color, -0.15));
          ctx.beginPath();
          ctx.ellipse(m.x, m.y - 4, 11, 9, 0, 0, Math.PI * 2);
          ctx.fillStyle = kg;
          ctx.fill();
          ctx.strokeStyle = 'rgba(0,0,0,0.25)';
          ctx.lineWidth = 1.5;
          ctx.stroke();
        };
        mallet(st.mal[0], '#e04a3a');
        mallet(st.mal[1], '#2f6fd0');
        fx.draw(ctx, env.W, env.H);
      },
    };
  },
};
