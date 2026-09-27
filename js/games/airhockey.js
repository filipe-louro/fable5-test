// Air Hockey em tempo real: anfitrião simula o disco; cada jogador arrasta
// seu malho dentro da própria metade. Velocidade do malho do convidado é
// amostrada, suavizada e sincronizada com precisão física para garantir impacto real.
import { clamp, throttler, roundRect, collideBalls, drawFrame, Trail, Fx, shade } from '../engine.js';

const WIN = 5;
const PUCK_R = 13;
const MAL_R = 24;

export default {
  id: 'airhockey',
  name: 'Air Hockey',
  icon: '🏒',
  desc: `Tempo real! Física tátil do malho. Primeiro a ${WIN} gols.`,
  local: true,
  create(env) {
    const L = 40, T = 60, Rr = env.W - 40, B = env.H - 40;
    const GOAL_H = 150;
    const GT = (T + B) / 2 - GOAL_H / 2;
    const GB = (T + B) / 2 + GOAL_H / 2;
    let st = null;
    const sendPos = throttler(30);
    const sendSnap = throttler(30);
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
        env.setHint(env.seat === -1 ? 'Modo Espectador' : 'Arraste seu malho para rebater o disco com impacto.');
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
      env.sfx('whistle', 0.85);
      env.sfx('score', 0.95);
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
        const now = performance.now();
        st = this.st = {
          puck: { x: env.W / 2, y: (T + B) / 2, vx: 0, vy: 0 },
          mal: [
            { x: L + 90, y: (T + B) / 2, vx: 0, vy: 0, px: L + 90, py: (T + B) / 2, remoteVx: 0, remoteVy: 0, lastMoveT: now },
            { x: Rr - 90, y: (T + B) / 2, vx: 0, vy: 0, px: Rr - 90, py: (T + B) / 2, remoteVx: 0, remoteVy: 0, lastMoveT: now },
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
        const now = performance.now();
        st = this.st = {
          puck: { x: s.p[0], y: s.p[1], vx: s.p[2], vy: s.p[3] },
          mal: s.m.map(([x, y]) => ({ x, y, vx: 0, vy: 0, px: x, py: y, remoteVx: 0, remoteVy: 0, lastMoveT: now })),
          sc: s.sc.slice(),
          over: s.over,
        };
        setUi();
      },
      msg(m) {
        if (m.k === 'mp' && sim()) {
          st.mal[1].x = m.x;
          st.mal[1].y = m.y;
          st.mal[1].remoteVx = m.vx || 0;
          st.mal[1].remoteVy = m.vy || 0;
          st.mal[1].vx = st.mal[1].remoteVx;
          st.mal[1].vy = st.mal[1].remoteVy;
          clampMallet(1);
        } else if (m.k === 's' && !sim()) {
          st.puck.x = m.p[0]; st.puck.y = m.p[1];
          if (env.seat !== 0) { st.mal[0].x = m.m[0][0]; st.mal[0].y = m.m[0][1]; }
          if (env.seat !== 1) { st.mal[1].x = m.m[1][0]; st.mal[1].y = m.m[1][1]; }
          if (m.sc[0] !== st.sc[0] || m.sc[1] !== st.sc[1]) {
            const who = m.sc[0] !== st.sc[0] ? 0 : 1;
            st.sc = m.sc.slice();
            env.sfx('whistle', 0.8);
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

        const m = st.mal[seat];
        const now = performance.now();
        const dt = Math.max(0.001, (now - (m.lastMoveT || now)) / 1000);
        m.lastMoveT = now;

        const rawVx = (x - m.x) / dt;
        const rawVy = (y - m.y) / dt;
        m.vx = clamp(m.vx * 0.35 + rawVx * 0.65, -1800, 1800);
        m.vy = clamp(m.vy * 0.35 + rawVy * 0.65, -1800, 1800);
        m.x = x;
        m.y = y;
        clampMallet(seat);

        if (!env.isLocal && env.seat === 1 && sendPos()) {
          env.send({
            k: 'mp',
            x: Math.round(st.mal[1].x),
            y: Math.round(st.mal[1].y),
            vx: Math.round(st.mal[1].vx),
            vy: Math.round(st.mal[1].vy),
          });
        }
        void type;
      },
      key() {},
      tick(dt) {
        fx.tick(dt);
        if (!st || st.over) return;
        trail.push(st.puck.x, st.puck.y);

        // Atualização e amortecimento da velocidade dos malhos
        for (let i = 0; i < 2; i++) {
          const m = st.mal[i];
          const isRemoteGuest = !env.isLocal && i === 1;
          if (isRemoteGuest) {
            m.remoteVx = (m.remoteVx || 0) * Math.exp(-5.5 * dt);
            m.remoteVy = (m.remoteVy || 0) * Math.exp(-5.5 * dt);
            m.vx = m.remoteVx;
            m.vy = m.remoteVy;
            m.px = m.x;
            m.py = m.y;
          } else {
            m.vx = (m.x - m.px) / Math.max(dt, 0.001);
            m.vy = (m.y - m.py) / Math.max(dt, 0.001);
            m.px = m.x;
            m.py = m.y;
          }
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

          // Paredes (respeitando as bocas dos gols) com faíscas de impacto
          const inMouth = p.y > GT && p.y < GB;
          if (p.y < T + PUCK_R && p.vy < 0) {
            p.y = T + PUCK_R; p.vy = -p.vy * 0.92;
            env.sfx('puck_wall', 0.55);
            fx.burst(p.x, p.y, '#ffffff', 4, 110);
          }
          if (p.y > B - PUCK_R && p.vy > 0) {
            p.y = B - PUCK_R; p.vy = -p.vy * 0.92;
            env.sfx('puck_wall', 0.55);
            fx.burst(p.x, p.y, '#ffffff', 4, 110);
          }
          if (!inMouth) {
            if (p.x < L + PUCK_R && p.vx < 0) {
              p.x = L + PUCK_R; p.vy = p.vy * 0.96; p.vx = -p.vx * 0.92;
              env.sfx('puck_wall', 0.55);
              fx.burst(p.x, p.y, '#ffffff', 4, 110);
            }
            if (p.x > Rr - PUCK_R && p.vx > 0) {
              p.x = Rr - PUCK_R; p.vy = p.vy * 0.96; p.vx = -p.vx * 0.92;
              env.sfx('puck_wall', 0.55);
              fx.burst(p.x, p.y, '#ffffff', 4, 110);
            }
          } else {
            if (p.x < L - PUCK_R) { score(1); return; }
            if (p.x > Rr + PUCK_R) { score(0); return; }
          }

          // Malhos: impacto sólido transferindo momentum real com faíscas e anel cinético
          for (const m of st.mal) {
            const ghost = { x: m.x, y: m.y, vx: m.vx, vy: m.vy };
            const hit = collideBalls(ghost, p, MAL_R, PUCK_R, 0.92, 1e6, PUCK_R * PUCK_R);
            if (hit > 50) {
              env.sfx('puck_hit', Math.min(1, hit / 800));
              const hitX = (m.x + p.x) / 2;
              const hitY = (m.y + p.y) / 2;
              fx.burst(hitX, hitY, '#38bdf8', Math.min(9, Math.floor(hit / 75)), 150);
              if (hit > 450) {
                fx.ring(hitX, hitY, '#ffffff', 24);
              }
            }
          }
        }

        const spd = Math.hypot(p.vx, p.vy);
        if (spd > 1200) { p.vx *= 1200 / spd; p.vy *= 1200 / spd; }

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

        // Moldura externa da mesa de hóquei com acabamento em alumínio anodizado escuro
        drawFrame(ctx, L, T, Rr - L, B - T, 36, {
          felt: '#e6ecf5', woodA: '#475569', woodB: '#1e293b', vignette: 0, pad: 12,
        });

        // Borda interna de alumínio escovado com brilho metálico
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.35)';
        ctx.lineWidth = 1.5;
        roundRect(ctx, L - 2, T - 2, Rr - L + 4, B - T + 4, 10);
        ctx.stroke();

        // Superfície ultra-lustrosa de policarbonato com reflexos de iluminação de estádio
        const glass = ctx.createLinearGradient(L, T, Rr, B);
        glass.addColorStop(0, 'rgba(255, 255, 255, 0.45)');
        glass.addColorStop(0.3, 'rgba(255, 255, 255, 0.05)');
        glass.addColorStop(0.65, 'rgba(186, 215, 245, 0.15)');
        glass.addColorStop(1, 'rgba(255, 255, 255, 0.28)');
        roundRect(ctx, L, T, Rr - L, B - T, 8);
        ctx.fillStyle = glass;
        ctx.fill();

        // Furos de ar da mesa aerodinâmica
        ctx.fillStyle = 'rgba(100, 116, 139, 0.2)';
        for (let x = L + 24; x < Rr - 10; x += 36) {
          for (let y = T + 24; y < B - 10; y += 36) {
            ctx.beginPath();
            ctx.arc(x, y, 1.5, 0, Math.PI * 2);
            ctx.fill();
          }
        }

        // Marcações oficiais do ringue
        // Linha central
        ctx.strokeStyle = '#ef4444';
        ctx.lineWidth = 4;
        ctx.beginPath(); ctx.moveTo(env.W / 2, T); ctx.lineTo(env.W / 2, B); ctx.stroke();
        // Círculo central com ponto
        ctx.beginPath(); ctx.arc(env.W / 2, (T + B) / 2, 58, 0, Math.PI * 2); ctx.stroke();
        ctx.beginPath(); ctx.arc(env.W / 2, (T + B) / 2, 7, 0, Math.PI * 2);
        ctx.fillStyle = '#ef4444';
        ctx.fill();

        // Áreas dos gols
        ctx.lineWidth = 3.5;
        for (const gx of [L, Rr]) {
          ctx.beginPath();
          ctx.arc(gx, (T + B) / 2, 88, gx === L ? -Math.PI / 2 : Math.PI / 2, gx === L ? Math.PI / 2 : Math.PI * 1.5);
          ctx.strokeStyle = '#3b82f6';
          ctx.stroke();
        }

        // Bocas dos gols com profundidade, moldura metálica e iluminação interna
        for (const [gx, dir] of [[L, -1], [Rr, 1]]) {
          const g = ctx.createLinearGradient(gx, 0, gx + dir * 26, 0);
          g.addColorStop(0, 'rgba(15, 23, 42, 0.95)');
          g.addColorStop(1, 'rgba(15, 23, 42, 0.35)');
          ctx.fillStyle = g;
          ctx.fillRect(dir === -1 ? gx - 24 : gx, GT, 24, GOAL_H);

          // Trave metálica do gol
          ctx.strokeStyle = '#60a5fa';
          ctx.lineWidth = 5;
          ctx.beginPath();
          ctx.moveTo(gx + dir * 2, GT - 5);
          ctx.lineTo(gx + dir * 2, GB + 5);
          ctx.stroke();

          // Luz de sinalização do gol no topo
          ctx.fillStyle = '#ef4444';
          ctx.beginPath();
          ctx.arc(gx + dir * 2, GT - 7, 4, 0, Math.PI * 2);
          ctx.arc(gx + dir * 2, GB + 7, 4, 0, Math.PI * 2);
          ctx.fill();
        }

        // Placar digital estilizado embutido no centro da mesa
        ctx.fillStyle = 'rgba(30, 41, 59, 0.16)';
        ctx.font = '900 68px system-ui, -apple-system, sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(`${st.sc[0]}    ${st.sc[1]}`, env.W / 2, T + 46);

        // Rastro neon do disco em alta velocidade
        trail.draw(ctx, PUCK_R, '#00f0ff');

        // Disco de Alta Densidade (Weighted Competition Puck)
        const p = st.puck;
        const pSpd = Math.hypot(p.vx, p.vy);

        // Sombra realista projetada
        ctx.beginPath();
        ctx.ellipse(p.x + 3, p.y + 5, PUCK_R + 1, PUCK_R * 0.72, 0, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(0, 0, 0, 0.32)';
        ctx.fill();

        // Borda externa de borracha vulcanizada preta
        ctx.beginPath();
        ctx.ellipse(p.x, p.y + 2, PUCK_R, PUCK_R * 0.86, 0, 0, Math.PI * 2);
        ctx.fillStyle = '#0f172a';
        ctx.fill();

        // Corpo com gradiente radial e anéis concêntricos usinados
        const pg = ctx.createRadialGradient(p.x - 4, p.y - 5, 2, p.x, p.y, PUCK_R + 2);
        pg.addColorStop(0, '#64748b');
        pg.addColorStop(0.35, '#334155');
        pg.addColorStop(0.85, '#0f172a');
        pg.addColorStop(1, '#020617');

        ctx.beginPath();
        ctx.ellipse(p.x, p.y, PUCK_R, PUCK_R * 0.86, 0, 0, Math.PI * 2);
        ctx.fillStyle = pg;
        ctx.fill();

        // Ranhuras concêntricas da face superior do disco
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.2)';
        ctx.lineWidth = 1;
        ctx.beginPath(); ctx.ellipse(p.x, p.y, PUCK_R * 0.65, PUCK_R * 0.55, 0, 0, Math.PI * 2); ctx.stroke();

        // Núcleo central fluorescente
        ctx.beginPath(); ctx.ellipse(p.x, p.y, PUCK_R * 0.3, PUCK_R * 0.25, 0, 0, Math.PI * 2);
        ctx.fillStyle = pSpd > 400 ? '#00f0ff' : '#38bdf8';
        ctx.fill();

        // Malhos dos Jogadores (Ergonomic Tournament Strikers)
        const mallet = (m, color) => {
          // Sombra da base de feltro
          ctx.beginPath();
          ctx.ellipse(m.x + 4, m.y + 7, MAL_R, MAL_R * 0.74, 0, 0, Math.PI * 2);
          ctx.fillStyle = 'rgba(0, 0, 0, 0.3)';
          ctx.fill();

          // Base de impacto chanfrada
          ctx.beginPath();
          ctx.ellipse(m.x, m.y + 4, MAL_R, MAL_R * 0.86, 0, 0, Math.PI * 2);
          ctx.fillStyle = shade(color, -0.45);
          ctx.fill();

          // Aba externa do malho com gradiente de alta reflexão
          const bg = ctx.createRadialGradient(m.x - 8, m.y - 8, 2, m.x, m.y, MAL_R + 2);
          bg.addColorStop(0, shade(color, 0.5));
          bg.addColorStop(0.65, color);
          bg.addColorStop(1, shade(color, -0.35));
          ctx.beginPath();
          ctx.ellipse(m.x, m.y, MAL_R, MAL_R * 0.86, 0, 0, Math.PI * 2);
          ctx.fillStyle = bg;
          ctx.fill();

          // Anel metálico de reforço
          ctx.strokeStyle = 'rgba(255, 255, 255, 0.4)';
          ctx.lineWidth = 1.2;
          ctx.beginPath();
          ctx.ellipse(m.x, m.y, MAL_R * 0.72, MAL_R * 0.62, 0, 0, Math.PI * 2);
          ctx.stroke();

          // Pegador anatômico superior (Grip Handle)
          const kg = ctx.createRadialGradient(m.x - 4, m.y - 8, 1, m.x, m.y - 4, 13);
          kg.addColorStop(0, '#ffffff');
          kg.addColorStop(0.4, shade(color, 0.55));
          kg.addColorStop(0.9, shade(color, -0.15));
          kg.addColorStop(1, shade(color, -0.5));

          ctx.beginPath();
          ctx.ellipse(m.x, m.y - 4, 12, 10, 0, 0, Math.PI * 2);
          ctx.fillStyle = kg;
          ctx.fill();

          ctx.strokeStyle = 'rgba(0, 0, 0, 0.35)';
          ctx.lineWidth = 1.5;
          ctx.stroke();
        };

        mallet(st.mal[0], '#ef4444');
        mallet(st.mal[1], '#3b82f6');
        fx.draw(ctx, env.W, env.H);
      },
    };
  },
};
