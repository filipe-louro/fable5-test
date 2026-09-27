// Futebol de Botão: física tátil, goleiro retangular de pequena área,
// linhas laterais, tiro de meta, escanteio, faltas, continuidade de posse e
// mira projetada e sincronizada via rede (padrão sinuca).
import {
  clamp, collideBalls, collideRect, collideCircleStatic, AimControl,
  throttler, drawFrame, Trail, Fx, shade, roundRect, stepBall,
} from '../engine.js';

const GOALS_TO_WIN = 3;
const MAX_FLICKS = 30;
const PIECE_R = 16;
const BALL_R = 8.5;
const GK_W = 16;
const GK_H = 46;
const MAX_STREAK = 3;

export default {
  id: 'futebol',
  name: 'Futebol de Botão',
  icon: '⚽',
  desc: `Goleiro na área, laterais, faltas e mira projetada. Primeiro a ${GOALS_TO_WIN} gols.`,
  local: true,
  create(env) {
    const L = 46, T = 66, Rr = env.W - 46, B = env.H - 46;
    const GOAL_H = 150;
    const GT = (T + B) / 2 - GOAL_H / 2;
    const GB = (T + B) / 2 + GOAL_H / 2;
    const POSTS = [
      { x: L, y: GT }, { x: L, y: GB },
      { x: Rr, y: GT }, { x: Rr, y: GB },
    ];

    let st = null;
    let aim = null;
    let remoteAim = null;
    const sendFrame = throttler(40);
    const sendAimT = throttler(45);
    const controls = (seat) => env.isLocal || env.seat === seat;
    const myMove = () => st && !st.over && st.phase === 'aim' && controls(st.turn);
    const trail = new Trail(10);
    const fx = new Fx();

    function goalFx(who) {
      fx.banner('GOL!', { color: who === 0 ? '#ff8a5c' : '#59b7ff' });
      fx.burst(who === 0 ? Rr : L, (T + B) / 2, '#ffd54d', 28, 360);
      trail.clear();
    }

    function formation() {
      const cy = (T + B) / 2;
      const mk = (x, y, team, num, gk = false) => ({
        x, y, vx: 0, vy: 0, team, num, gk,
        w: gk ? GK_W : PIECE_R * 2,
        h: gk ? GK_H : PIECE_R * 2,
      });
      return [
        // Time 0 (laranja / vermelho)
        mk(L + 20, cy, 0, 1, true), // Goleiro
        mk(L + 140, cy - 88, 0, 2),
        mk(L + 140, cy + 88, 0, 3),
        mk(L + 270, cy - 54, 0, 4),
        mk(L + 270, cy + 54, 0, 5),
        // Time 1 (azul)
        mk(Rr - 20, cy, 1, 1, true), // Goleiro
        mk(Rr - 140, cy - 88, 1, 2),
        mk(Rr - 140, cy + 88, 1, 3),
        mk(Rr - 270, cy - 54, 1, 4),
        mk(Rr - 270, cy + 54, 1, 5),
      ];
    }

    function autoSelectPiece() {
      if (!st || !st.pieces || !st.ball) return;
      let best = null, bd = Infinity;
      st.pieces.forEach((p, i) => {
        if (p.team === st.turn) {
          const d = Math.hypot(p.x - st.ball.x, p.y - st.ball.y);
          if (d < bd) { bd = d; best = i; }
        }
      });
      st.sel = best;
    }

    function resetPositions() {
      st.pieces = formation();
      st.ball = { x: env.W / 2, y: (T + B) / 2, vx: 0, vy: 0 };
      st.streak = 0;
      st.firstHit = null;
      st.foul = false;
      st.touchedBall = false;
      st.outOfBounds = null;
      st.goalScored = null;
      st.lastTouchTeam = null;
      st.delayTimer = 0;
      remoteAim = null;
      autoSelectPiece();
    }

    function setUi() {
      env.setSub(0, `<b class="big-score">${st.sc[0]}</b>`);
      env.setSub(1, `<b class="big-score">${st.sc[1]}</b>`);
      if (!st.over) {
        const streakInfo = st.streak > 0 ? ` · Toque ${st.streak + 1}/${MAX_STREAK}` : '';
        env.setMsg(`${st.sc[0]} × ${st.sc[1]} — lance ${st.flicks + 1}/${MAX_FLICKS} · vez de ${env.names[st.turn]}${streakInfo}`);
        if (myMove()) {
          const hint = st.sel !== null
            ? (st.pieces[st.sel].gk ? 'Goleiro selecionado: puxe para trás para rebater/arremessar.' : 'Arraste para trás e solte para chutar.')
            : 'Toque em um jogador ou goleiro do seu time para mirar.';
          env.setHint(hint);
        } else {
          env.setHint(env.seat === -1 ? 'Modo Espectador' : `Aguardando ${env.names[st.turn]}…`);
        }
      }
    }

    function serialize() {
      return {
        pieces: st.pieces.map((p) => [Math.round(p.x), Math.round(p.y), p.team, p.num, p.gk ? 1 : 0]),
        ball: [Math.round(st.ball.x), Math.round(st.ball.y)],
        sc: st.sc, flicks: st.flicks, turn: st.turn, over: st.over, streak: st.streak,
      };
    }

    function applyFull(s) {
      st.pieces = s.pieces.map(([x, y, team, num, gk]) => ({
        x, y, vx: 0, vy: 0, team, num, gk: !!gk,
        w: gk ? GK_W : PIECE_R * 2,
        h: gk ? GK_H : PIECE_R * 2,
      }));
      st.ball = { x: s.ball[0], y: s.ball[1], vx: 0, vy: 0 };
      if (s.sc[0] !== st.sc[0]) goalFx(0);
      else if (s.sc[1] !== st.sc[1]) goalFx(1);
      st.sc = s.sc.slice();
      st.flicks = s.flicks;
      st.turn = s.turn;
      st.streak = s.streak || 0;
      st.over = s.over;
      st.phase = 'aim';
      st.sel = null;
      st.firstHit = null;
      st.foul = false;
      st.touchedBall = false;
      st.outOfBounds = null;
      st.goalScored = null;
      remoteAim = null;
      setUi();
    }

    function sendAim(force) {
      if (env.isLocal || !myMove() || st.sel === null) return;
      if (!force && !sendAimT()) return;
      const cur = aim.current();
      if (!cur) return;
      env.send({
        k: 'a',
        sel: st.sel,
        dx: cur.dx,
        dy: cur.dy,
        pow: cur.power,
        ch: cur.charging ? 1 : 0,
      });
    }

    function shoot(dx, dy, power) {
      const p = st.pieces[st.sel];
      const baseSpd = p.gk ? 220 : 250;
      const maxSpd = p.gk ? 950 : 1200;
      const speed = baseSpd + power * (maxSpd - baseSpd);
      p.vx = dx * speed;
      p.vy = dy * speed;
      st.phase = 'moving';
      st.shooter = st.turn;
      st.goalScored = null;
      st.outOfBounds = null;
      st.firstHit = null;
      st.foul = false;
      st.touchedBall = false;
      remoteAim = null;
      env.sfx('click', 0.5 + power * 0.5);
      if (!env.isLocal) env.send({ k: 'a_off' });
    }

    function predictFlick(pIndex, dirX, dirY) {
      const p = st.pieces[pIndex];
      if (!p) return null;
      const pr = p.gk ? 14 : PIECE_R;
      let closestT = Infinity;
      let hitTarget = null;
      let hitNormal = { x: 0, y: 0 };

      // Teste contra a bola
      const bx = st.ball.x - p.x;
      const by = st.ball.y - p.y;
      const projB = bx * dirX + by * dirY;
      if (projB > 0) {
        const perp2 = (bx * bx + by * by) - projB * projB;
        const combR = pr + BALL_R;
        if (perp2 < combR * combR) {
          const t = projB - Math.sqrt(Math.max(0, combR * combR - perp2));
          if (t > 0 && t < closestT) {
            closestT = t;
            const cx = p.x + dirX * t;
            const cy = p.y + dirY * t;
            const dist = Math.hypot(st.ball.x - cx, st.ball.y - cy) || 1;
            hitNormal = { x: (st.ball.x - cx) / dist, y: (st.ball.y - cy) / dist };
            hitTarget = { kind: 'ball', bx: st.ball.x, by: st.ball.y };
          }
        }
      }

      // Teste contra outras peças
      st.pieces.forEach((other, i) => {
        if (i === pIndex) return;
        const or = other.gk ? 14 : PIECE_R;
        const ox = other.x - p.x;
        const oy = other.y - p.y;
        const proj = ox * dirX + oy * dirY;
        if (proj <= 0) return;
        const perp2 = (ox * ox + oy * oy) - proj * proj;
        const combR = pr + or;
        if (perp2 < combR * combR) {
          const t = proj - Math.sqrt(Math.max(0, combR * combR - perp2));
          if (t > 0 && t < closestT) {
            closestT = t;
            hitTarget = { kind: 'piece', team: other.team, gk: other.gk };
          }
        }
      });

      // Linhas do campo se nada foi atingido antes
      if (closestT === Infinity) {
        let tWall = Infinity;
        if (dirX > 0) tWall = Math.min(tWall, (Rr - pr - p.x) / dirX);
        else if (dirX < 0) tWall = Math.min(tWall, (L + pr - p.x) / dirX);
        if (dirY > 0) tWall = Math.min(tWall, (B - pr - p.y) / dirY);
        else if (dirY < 0) tWall = Math.min(tWall, (T + pr - p.y) / dirY);
        closestT = Math.max(10, Math.min(tWall, 220));
      } else {
        closestT = Math.min(closestT, 260);
      }

      const hitX = p.x + dirX * closestT;
      const hitY = p.y + dirY * closestT;
      return { hitX, hitY, hitTarget, hitNormal, t: closestT };
    }

    function endTurn() {
      st.flicks++;

      // 1. Gol
      if (st.goalScored !== null) {
        st.sc[st.goalScored]++;
        const nextTurn = 1 - st.goalScored; // quem sofreu recomeça no centro
        resetPositions();
        st.turn = nextTurn;
        autoSelectPiece();
      }
      // 2. Bola fora de campo
      else if (st.outOfBounds !== null) {
        st.streak = 0;
        const ob = st.outOfBounds;
        if (ob.type === 'lateral') {
          st.turn = 1 - (st.lastTouchTeam ?? st.shooter);
          st.ball.x = clamp(ob.x, L + 24, Rr - 24);
          st.ball.y = ob.y === T ? T + 12 : B - 12;
        } else if (ob.type === 'tiro_de_meta') {
          st.turn = ob.side;
          st.ball.x = ob.side === 0 ? L + 28 : Rr - 28;
          st.ball.y = (T + B) / 2;
        } else if (ob.type === 'escanteio') {
          st.turn = 1 - ob.side;
          st.ball.x = ob.side === 0 ? L + 8 : Rr - 8;
          st.ball.y = ob.y < (T + B) / 2 ? T + 8 : B - 8;
        }
        st.ball.vx = 0;
        st.ball.vy = 0;
      }
      // 3. Falta
      else if (st.foul) {
        fx.banner('FALTA!', { color: '#ff5c5c' });
        env.sfx('foul', 1);
        st.turn = 1 - st.shooter;
        st.streak = 0;
      }
      // 4. Continuidade de posse (toque legal na bola)
      else if (st.touchedBall) {
        st.streak++;
        if (st.streak < MAX_STREAK) {
          st.turn = st.shooter; // continua com a bola!
        } else {
          st.streak = 0;
          st.turn = 1 - st.shooter; // limite de 3 toques atingido
        }
      }
      // 5. Errou a bola
      else {
        st.streak = 0;
        st.turn = 1 - st.shooter;
      }

      // Restringe botões que deslizaram para fora
      for (const p of st.pieces) {
        p.x = clamp(p.x, L + 14, Rr - 14);
        p.y = clamp(p.y, T + 14, B - 14);
        p.vx = 0;
        p.vy = 0;
      }

      const done = st.sc[0] >= GOALS_TO_WIN || st.sc[1] >= GOALS_TO_WIN || st.flicks >= MAX_FLICKS;
      if (done) st.over = true;
      st.phase = 'aim';
      st.sel = null;
      st.firstHit = null;
      st.foul = false;
      st.touchedBall = false;
      st.outOfBounds = null;
      st.goalScored = null;
      remoteAim = null;

      env.send({ k: 'e', s: serialize() });
      setUi();
      if (st.over) {
        const w = st.sc[0] === st.sc[1] ? null : st.sc[0] > st.sc[1] ? 0 : 1;
        env.finish(w, w === null ? `Empate ${st.sc[0]} × ${st.sc[1]}!` : `Fim de jogo! ${env.names[w]} venceu por ${st.sc[w]} × ${st.sc[1 - w]}.`);
      }
    }

    function physics(h) {
      const shooterPiece = st.pieces[st.sel];

      // Integração de movimento
      for (const p of st.pieces) {
        stepBall(p, h, { slide: 360, roll: 170, thresh: 340, stop: 8 });
        // Goleiros permanecem confinados à sua área de meta
        if (p.gk) {
          if (p.team === 0) {
            p.x = clamp(p.x, L + 10, L + 38);
            p.y = clamp(p.y, GT + 14, GB - 14);
          } else {
            p.x = clamp(p.x, Rr - 38, Rr - 10);
            p.y = clamp(p.y, GT + 14, GB - 14);
          }
        }
      }
      stepBall(st.ball, h, { slide: 200, roll: 75, thresh: 320, stop: 6 });

      // Colisões entre peças normais (círculo com círculo)
      for (let i = 0; i < st.pieces.length; i++) {
        const pi = st.pieces[i];
        if (pi.gk) continue;
        for (let j = i + 1; j < st.pieces.length; j++) {
          const pj = st.pieces[j];
          if (pj.gk) continue;
          const hit = collideBalls(pi, pj, PIECE_R, PIECE_R, 0.88);
          if (hit > 80) {
            env.sfx('click', Math.min(1, hit / 1000));
            if (pi === shooterPiece || pj === shooterPiece) {
              const other = pi === shooterPiece ? pj : pi;
              if (!st.firstHit) {
                st.firstHit = other.team === st.shooter ? 'teammate' : 'rival';
                if (st.firstHit === 'rival' && !st.touchedBall) st.foul = true;
              }
            }
          }
        }
      }

      // Colisão de botões de linha com o goleiro (círculo contra retângulo sólido)
      for (const p of st.pieces) {
        if (!p.gk) continue;
        const rx = p.x - GK_W / 2;
        const ry = p.y - GK_H / 2;
        for (const f of st.pieces) {
          if (f.gk) continue;
          const hit = collideRect(f, PIECE_R, rx, ry, GK_W, GK_H, 0.6);
          if (hit > 70) {
            env.sfx('click', 0.6);
            if (f === shooterPiece && !st.firstHit) {
              st.firstHit = p.team === st.shooter ? 'teammate' : 'rival';
              if (st.firstHit === 'rival' && !st.touchedBall) st.foul = true;
            }
          }
        }
      }

      // Colisão da bola com as peças de linha (círculo com círculo)
      for (const p of st.pieces) {
        if (p.gk) continue;
        const hit = collideBalls(st.ball, p, BALL_R, PIECE_R, 0.92, BALL_R * BALL_R, PIECE_R * PIECE_R * 2.2);
        if (hit > 70) {
          env.sfx('click', Math.min(1, hit / 900));
          st.lastTouchTeam = p.team;
          if (p === shooterPiece) {
            st.touchedBall = true;
            if (!st.firstHit) st.firstHit = 'ball';
          }
        }
      }

      // Colisão da bola com o goleiro (retângulo sólido do goleiro)
      for (const p of st.pieces) {
        if (!p.gk) continue;
        const hit = collideRect(st.ball, BALL_R, p.x - GK_W / 2, p.y - GK_H / 2, GK_W, GK_H, 0.86);
        if (hit > 60) {
          env.sfx('cushion', 0.75);
          st.lastTouchTeam = p.team;
          if (p === shooterPiece) {
            st.touchedBall = true;
            if (!st.firstHit) st.firstHit = 'ball';
          }
        }
      }

      // Colisão com as traves circulares sólidas (postes)
      for (const post of POSTS) {
        const hitB = collideCircleStatic(st.ball, BALL_R, post.x, post.y, 4, 0.85);
        if (hitB > 50) env.sfx('puck_wall', 0.7);
        for (const p of st.pieces) {
          if (!p.gk) collideCircleStatic(p, PIECE_R, post.x, post.y, 4, 0.8);
        }
      }

      // Paredes da rede do gol (seguram a bola que entrou)
      for (const [side, gx, dir] of [[0, L, -1], [1, Rr, 1]]) {
        const xNet = dir === -1 ? gx - 22 : gx;
        if (st.ball.x < L || st.ball.x > Rr) {
          // Dentro do fundo da rede
          if (st.ball.y > GT && st.ball.y < GB) {
            if (st.ball.x < L - 20 && st.ball.vx < 0) { st.ball.x = L - 20; st.ball.vx = -st.ball.vx * 0.3; }
            if (st.ball.x > Rr + 20 && st.ball.vx > 0) { st.ball.x = Rr + 20; st.ball.vx = -st.ball.vx * 0.3; }
            if (st.ball.y < GT + BALL_R && st.ball.vy < 0) { st.ball.y = GT + BALL_R; st.ball.vy = -st.ball.vy * 0.4; }
            if (st.ball.y > GB - BALL_R && st.ball.vy > 0) { st.ball.y = GB - BALL_R; st.ball.vy = -st.ball.vy * 0.4; }
          }
        }
      }

      // Validação de gol: a bola cruza a linha de fundo dentro das traves
      if (st.goalScored === null) {
        if (st.ball.x <= L && st.ball.y > GT && st.ball.y < GB) {
          st.goalScored = 1; // gol do time 1 (direita)
          st.ball.vx *= 0.25;
          st.ball.vy *= 0.25;
          env.sfx('whistle', 1);
          env.sfx('score', 1);
          goalFx(1);
        } else if (st.ball.x >= Rr && st.ball.y > GT && st.ball.y < GB) {
          st.goalScored = 0; // gol do time 0 (esquerda)
          st.ball.vx *= 0.25;
          st.ball.vy *= 0.25;
          env.sfx('whistle', 1);
          env.sfx('score', 1);
          goalFx(0);
        }
      }

      // Detecção de saída de campo (linhas laterais e linha de fundo FORA do gol)
      if (st.goalScored === null && st.outOfBounds === null) {
        // Lateral (topo e base)
        if (st.ball.y < T) {
          st.outOfBounds = { type: 'lateral', x: clamp(st.ball.x, L + 20, Rr - 20), y: T };
          st.ball.vx = 0; st.ball.vy = 0;
          env.sfx('whistle', 0.85);
          fx.banner('LATERAL', { color: '#ffd54d' });
        } else if (st.ball.y > B) {
          st.outOfBounds = { type: 'lateral', x: clamp(st.ball.x, L + 20, Rr - 20), y: B };
          st.ball.vx = 0; st.ball.vy = 0;
          env.sfx('whistle', 0.85);
          fx.banner('LATERAL', { color: '#ffd54d' });
        }
        // Linha de fundo FORA da trave (acima de GT ou abaixo de GB)
        else if (st.ball.x < L && (st.ball.y <= GT || st.ball.y >= GB)) {
          const isCorner = st.lastTouchTeam === 0;
          st.outOfBounds = { type: isCorner ? 'escanteio' : 'tiro_de_meta', side: 0, y: st.ball.y };
          st.ball.vx = 0; st.ball.vy = 0;
          env.sfx('whistle', 0.85);
          fx.banner(isCorner ? 'ESCANTEIO' : 'TIRO DE META', { color: isCorner ? '#ffd54d' : '#8cd4ff' });
        } else if (st.ball.x > Rr && (st.ball.y <= GT || st.ball.y >= GB)) {
          const isCorner = st.lastTouchTeam === 1;
          st.outOfBounds = { type: isCorner ? 'escanteio' : 'tiro_de_meta', side: 1, y: st.ball.y };
          st.ball.vx = 0; st.ball.vy = 0;
          env.sfx('whistle', 0.85);
          fx.banner(isCorner ? 'ESCANTEIO' : 'TIRO DE META', { color: isCorner ? '#ffd54d' : '#8cd4ff' });
        }
      }
    }

    return {
      st: null,
      start() {
        st = this.st = {
          pieces: [], ball: null, sc: [0, 0], flicks: 0, turn: 0,
          shooter: 0, phase: 'aim', sel: null, over: false,
          goalScored: null, outOfBounds: null, lastTouchTeam: null,
          firstHit: null, foul: false, touchedBall: false, streak: 0,
        };
        resetPositions();
        aim = new AimControl({
          getPos: () => (st.sel !== null ? st.pieces[st.sel] : null),
          canAim: () => myMove() && st.sel !== null,
          onShoot: shoot,
          onChange: () => sendAim(false),
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
        } else if (m.k === 'a') {
          remoteAim = { sel: m.sel, dx: m.dx, dy: m.dy, pow: m.pow, ch: !!m.ch };
        } else if (m.k === 'a_off') {
          remoteAim = null;
        }
      },
      pointer(type, x, y) {
        if (!myMove()) return;
        if (type === 'down') {
          // Se clicou em outro botão do próprio time, troca a seleção
          if (!aim.charging) {
            let other = null;
            let bd = 30;
            st.pieces.forEach((p, i) => {
              if (p.team !== st.turn || i === st.sel) return;
              const d = Math.hypot(x - p.x, y - p.y);
              if (d < bd) { bd = d; other = i; }
            });
            if (other !== null) {
              st.sel = other;
              env.sfx('click', 0.25);
              sendAim(true);
              setUi();
              return;
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
        if (st.goalScored !== null) {
          st.delayTimer = (st.delayTimer || 0) + dt;
          if (st.delayTimer >= 0.7) {
            st.delayTimer = 0;
            endTurn();
          }
        } else if (st.outOfBounds !== null) {
          st.delayTimer = (st.delayTimer || 0) + dt;
          if (st.delayTimer >= 0.45) {
            st.delayTimer = 0;
            endTurn();
          }
        } else if (stopped) {
          endTurn();
        }
      },
      draw(ctx) {
        if (!st) return;
        drawFrame(ctx, L, T, Rr - L, B - T, 40, {
          felt: '#1b6935', woodA: '#38533e', woodB: '#1e2d22', vignette: 0.18, pad: 12,
        });

        // Gramado com listras verticais
        for (let i = 0; i < 10; i++) {
          ctx.fillStyle = i % 2 ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.04)';
          ctx.fillRect(L + ((Rr - L) * i) / 10, T, (Rr - L) / 10, B - T);
        }

        // Marcações oficiais em branco
        ctx.strokeStyle = 'rgba(255,255,255,0.85)';
        ctx.lineWidth = 2.5;
        ctx.strokeRect(L, T, Rr - L, B - T);
        ctx.beginPath(); ctx.moveTo(env.W / 2, T); ctx.lineTo(env.W / 2, B); ctx.stroke();
        ctx.beginPath(); ctx.arc(env.W / 2, (T + B) / 2, 64, 0, Math.PI * 2); ctx.stroke();
        ctx.beginPath(); ctx.arc(env.W / 2, (T + B) / 2, 4, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(255,255,255,0.85)';
        ctx.fill();

        // Grandes e pequenas áreas
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

        // Arcos de escanteio
        for (const [cx, cy, a0] of [[L, T, 0], [Rr, T, Math.PI / 2], [Rr, B, Math.PI], [L, B, -Math.PI / 2]]) {
          ctx.beginPath();
          ctx.arc(cx, cy, 14, a0, a0 + Math.PI / 2);
          ctx.stroke();
        }

        // Gols e redes
        for (const [gx, dir] of [[L, -1], [Rr, 1]]) {
          const x0 = dir === -1 ? gx - 24 : gx;
          ctx.fillStyle = 'rgba(8,12,10,0.6)';
          ctx.fillRect(x0, GT, 24, GOAL_H);
          ctx.strokeStyle = 'rgba(235,240,245,0.5)';
          ctx.lineWidth = 1;
          for (let x = x0 + 4; x < x0 + 24; x += 6) {
            ctx.beginPath(); ctx.moveTo(x, GT); ctx.lineTo(x, GB); ctx.stroke();
          }
          for (let y = GT + 5; y < GB; y += 9) {
            ctx.beginPath(); ctx.moveTo(x0, y); ctx.lineTo(x0 + 24, y); ctx.stroke();
          }
          ctx.strokeStyle = '#ffffff';
          ctx.lineWidth = 4;
          ctx.strokeRect(x0, GT, 24, GOAL_H);
        }

        // Postes do gol
        for (const post of POSTS) {
          ctx.beginPath();
          ctx.arc(post.x, post.y, 4, 0, Math.PI * 2);
          ctx.fillStyle = '#ffffff';
          ctx.fill();
          ctx.strokeStyle = 'rgba(0,0,0,0.4)';
          ctx.lineWidth = 1;
          ctx.stroke();
        }

        // Rastro da bola
        trail.draw(ctx, BALL_R, '#ffffff');

        // Peças
        st.pieces.forEach((p, i) => {
          const isTeamTurn = !st.over && st.phase === 'aim' && p.team === st.turn;
          const myTeamTurn = isTeamTurn && controls(st.turn);
          const color = p.team === 0 ? '#e04a3a' : '#2f6fd0';

          if (p.gk) {
            // GOLEIRO (prisma retangular de botão acrílico)
            ctx.save();
            ctx.translate(p.x, p.y);
            // Sombra
            ctx.fillStyle = 'rgba(0,0,0,0.35)';
            roundRect(ctx, -GK_W / 2 + 2, -GK_H / 2 + 4, GK_W, GK_H, 4);
            ctx.fill();
            // Corpo
            const gkGrad = ctx.createLinearGradient(-GK_W / 2, 0, GK_W / 2, 0);
            const gkBase = p.team === 0 ? '#f09828' : '#28a2a8';
            gkGrad.addColorStop(0, shade(gkBase, 0.45));
            gkGrad.addColorStop(0.5, gkBase);
            gkGrad.addColorStop(1, shade(gkBase, -0.4));
            ctx.fillStyle = gkGrad;
            roundRect(ctx, -GK_W / 2, -GK_H / 2, GK_W, GK_H, 4);
            ctx.fill();
            // Borda interna chanfrada
            ctx.strokeStyle = 'rgba(255,255,255,0.7)';
            ctx.lineWidth = 1.5;
            roundRect(ctx, -GK_W / 2 + 2, -GK_H / 2 + 2, GK_W - 4, GK_H - 4, 3);
            ctx.stroke();
            // Número 1 do goleiro
            ctx.fillStyle = '#ffffff';
            ctx.font = 'bold 12px system-ui';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText('1', 0, 0);
            // Efeito visual de seleção
            if (myTeamTurn) {
              const pulse = 0.45 + Math.sin(performance.now() / 240) * 0.25;
              ctx.strokeStyle = `rgba(255,213,77,${i === st.sel ? 1 : pulse * 0.6})`;
              ctx.lineWidth = i === st.sel ? 3.5 : 2;
              roundRect(ctx, -GK_W / 2 - 4, -GK_H / 2 - 4, GK_W + 8, GK_H + 8, 7);
              ctx.stroke();
            }
            ctx.restore();
          } else {
            // JOGADORES DE LINHA (botão tradicional)
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
            ctx.strokeStyle = 'rgba(255,255,255,0.6)';
            ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.arc(p.x, p.y, PIECE_R - 4, 0, Math.PI * 2);
            ctx.stroke();
            ctx.fillStyle = '#fff';
            ctx.font = 'bold 11px system-ui';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText(String(p.num), p.x, p.y + 0.5);

            if (myTeamTurn) {
              const pulse = 0.45 + Math.sin(performance.now() / 240) * 0.25;
              ctx.strokeStyle = `rgba(255,213,77,${i === st.sel ? 1 : pulse * 0.6})`;
              ctx.lineWidth = i === st.sel ? 3.5 : 2;
              ctx.beginPath();
              ctx.arc(p.x, p.y, PIECE_R + 5, 0, Math.PI * 2);
              ctx.stroke();
            }
          }
        });

        // Bola de futebol com gomos
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

        // Linha de projeção e mira (local ou remota)
        let activeAim = null;
        let aimPieceIdx = null;
        let isRemote = false;

        if (myMove() && st.sel !== null && aim) {
          activeAim = aim.current();
          aimPieceIdx = st.sel;
        } else if (!myMove() && remoteAim && st.phase === 'aim') {
          activeAim = remoteAim;
          aimPieceIdx = remoteAim.sel;
          isRemote = true;
        }

        if (activeAim && aimPieceIdx !== null && st.pieces[aimPieceIdx]) {
          const p = st.pieces[aimPieceIdx];
          const pr = p.gk ? 14 : PIECE_R;
          const pred = predictFlick(aimPieceIdx, activeAim.dx, activeAim.dy);

          if (pred) {
            ctx.save();
            ctx.setLineDash([6, 6]);
            ctx.strokeStyle = isRemote ? 'rgba(255,200,80,0.5)' : 'rgba(255,255,255,0.75)';
            ctx.lineWidth = 1.8;
            ctx.beginPath();
            ctx.moveTo(p.x + activeAim.dx * (pr + 3), p.y + activeAim.dy * (pr + 3));
            ctx.lineTo(pred.hitX, pred.hitY);
            ctx.stroke();
            ctx.setLineDash([]);

            // Círculo/retângulo fantasma no ponto de impacto
            ctx.strokeStyle = isRemote ? 'rgba(255,200,80,0.6)' : 'rgba(255,255,255,0.7)';
            ctx.lineWidth = 1.4;
            if (p.gk) {
              roundRect(ctx, pred.hitX - GK_W / 2, pred.hitY - GK_H / 2, GK_W, GK_H, 4);
              ctx.stroke();
            } else {
              ctx.beginPath();
              ctx.arc(pred.hitX, pred.hitY, PIECE_R, 0, Math.PI * 2);
              ctx.stroke();
            }

            // Se for colidir com a bola, desenha a projeção da trajetória da bola
            if (pred.hitTarget && pred.hitTarget.kind === 'ball') {
              const nx = pred.hitNormal.x;
              const ny = pred.hitNormal.y;
              ctx.strokeStyle = '#ffd54d';
              ctx.lineWidth = 2.2;
              ctx.beginPath();
              ctx.moveTo(st.ball.x, st.ball.y);
              ctx.lineTo(st.ball.x + nx * 55, st.ball.y + ny * 55);
              ctx.stroke();
              // Ponta da seta
              const ax = st.ball.x + nx * 55;
              const ay = st.ball.y + ny * 55;
              ctx.beginPath();
              ctx.moveTo(ax, ay);
              ctx.lineTo(ax - nx * 9 - ny * 5, ay - ny * 9 + nx * 5);
              ctx.lineTo(ax - nx * 9 + ny * 5, ay - ny * 9 - nx * 5);
              ctx.closePath();
              ctx.fillStyle = '#ffd54d';
              ctx.fill();
            }
            ctx.restore();
          }

          // Medidor de força circular ao redor da peça
          if (activeAim.charging && activeAim.power > 0.01) {
            ctx.save();
            const hue = 120 - activeAim.power * 120;
            ctx.strokeStyle = `hsl(${hue} 90% 55%)`;
            ctx.lineWidth = 4;
            ctx.beginPath();
            ctx.arc(p.x, p.y, pr + 8, -Math.PI / 2, -Math.PI / 2 + activeAim.power * Math.PI * 2);
            ctx.stroke();
            ctx.restore();
          }
        }

        fx.draw(ctx, env.W, env.H);
      },
    };
  },
};
