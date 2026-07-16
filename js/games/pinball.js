// Pinball: DUAS máquinas, uma para cada jogador. Online os dois jogam ao
// mesmo tempo (corrida de pontos); no modo local os turnos alternam.
// Cada máquina tem bumpers, slingshots, pistas de rollover e alvos que
// caem (com bônus ao derrubar os três). 2 bolas por jogador; maior
// pontuação vence.
import { collideCircleStatic, collideSegment, throttler, roundRect, clamp, Trail, Fx, shade } from '../engine.js';

const BALLS_EACH = 2;
const BALL_R = 9;
const GRAV = 1050;
const MW = 380; // largura de cada máquina
const MT = 24; // topo
const DRAIN_Y = 516;

export default {
  id: 'pinball',
  name: 'Pinball',
  icon: '🪩',
  desc: `2 máquinas! ${BALLS_EACH} bolas cada, corrida de pontos.`,
  local: true,
  create(env) {
    const GAP = 48;
    const OX = [(env.W - MW * 2 - GAP) / 2, (env.W - MW * 2 - GAP) / 2 + MW + GAP];
    let st = null;
    const sendFrame = [throttler(40), throttler(40)];
    const trails = [new Trail(8), new Trail(8)];
    const fx = new Fx();
    const controls = (seat) => env.isLocal || env.seat === seat;

    // layout relativo de uma máquina
    const L = {
      bumpers: [[105, 208, 19], [275, 208, 19], [190, 288, 19]],
      lanes: [120, 190, 260], // rollover x rel
      lanePosts: [85, 155, 225, 295],
      laneY: 112,
      targets: [[243, 154], [277, 154], [311, 154]], // x,y rel; w 26 h 10
      slings: [
        [42, 372, 122, 446], // x1,y1,x2,y2 rel (esquerda)
        [338, 372, 258, 446],
      ],
      pivL: [120, 462],
      pivR: [260, 462],
      flipLen: 58,
      rest: 0.55,
      up: -0.5,
    };

    function machineState() {
      return {
        score: 0, ballsUsed: 0, phase: 'wait', ball: null,
        flip: [L.rest, L.rest], flipTarget: [L.rest, L.rest], flipV: [0, 0],
        targets: [true, true, true], targetResetAt: 0,
        laneCd: 0, slingCd: [0, 0], time: 0, stallT: 0,
        laneLit: [0, 0, 0],
      };
    }

    // eu simulo a máquina m?
    function simFor(m) {
      if (!st || st.over) return false;
      if (env.isLocal) return m === st.player;
      return env.seat === m;
    }

    const myFlippers = () => (env.isLocal ? st.player : env.seat);

    function setUi() {
      for (const s of [0, 1]) {
        const ms = st.m[s];
        env.setSub(s, `<b class="big-score">${ms.score}</b> pts · ${ms.ballsUsed}/${BALLS_EACH} bolas${ms.phase === 'done' ? ' ✔' : ''}`);
      }
      if (!st.over) {
        if (env.isLocal) {
          env.setMsg(`Bola de ${env.names[st.player]} (${st.m[st.player].ballsUsed + 1}ª de ${BALLS_EACH})`);
          env.setHint('Flippers: ◄ ► (ou A/L) ou toque na metade esquerda/direita.');
        } else {
          env.setMsg(`Corrida de pontos — ${BALLS_EACH} bolas para cada um!`);
          env.setHint(env.seat === -1
            ? '👁 Assistindo às duas máquinas'
            : st.m[env.seat].phase === 'done'
              ? 'Você terminou! Aguardando o adversário…'
              : 'Sua máquina: flippers com ◄ ► (ou A/L) ou toque nas metades.');
        }
      }
    }

    function launch(m) {
      const ms = st.m[m];
      ms.ball = { x: OX[m] + 190 + (Math.random() * 60 - 30), y: 88, vx: Math.random() * 120 - 60, vy: 0 };
      ms.phase = 'play';
      ms.time = 0;
      ms.stallT = 0;
      trails[m].clear();
      setUi();
    }

    function serialize() {
      return {
        m: st.m.map((ms) => ({ score: ms.score, ballsUsed: ms.ballsUsed, phase: ms.phase === 'play' ? 'wait' : ms.phase })),
        player: st.player, over: st.over,
      };
    }

    function applyFull(s) {
      for (const i of [0, 1]) {
        st.m[i].score = s.m[i].score;
        st.m[i].ballsUsed = s.m[i].ballsUsed;
        st.m[i].phase = s.m[i].phase;
      }
      st.player = s.player;
      st.over = s.over;
      setUi();
    }

    function maybeFinish() {
      if (st.over || !env.isHost) return;
      if (st.m[0].phase === 'done' && st.m[1].phase === 'done') {
        st.over = true;
        const [a, b] = [st.m[0].score, st.m[1].score];
        const w = a === b ? null : a > b ? 0 : 1;
        env.finish(w, w === null ? `Empate: ${a} pontos!` : `${env.names[w]} venceu no pinball: ${a} × ${b} pts!`);
      }
    }

    function drainBall(m) {
      const ms = st.m[m];
      trails[m].clear();
      fx.text(OX[m] + 190, 470, 'Bola perdida!', { color: '#f2a09d', size: 20 });
      ms.ballsUsed++;
      ms.ball = null;
      ms.phase = ms.ballsUsed >= BALLS_EACH ? 'done' : 'wait';
      env.sfx('pocket', 0.8);
      if (!env.isLocal) {
        env.send({ k: 'd', m, sc: ms.score, used: ms.ballsUsed, done: ms.phase === 'done' });
        if (ms.phase === 'wait') {
          setTimeout(() => { if (st && !st.over && simFor(m) && st.m[m].phase === 'wait') launch(m); }, 900);
        }
        maybeFinish(); // o anfitrião declara quando os dois terminarem
      } else {
        // local: alterna para quem ainda tem bolas
        const other = 1 - m;
        if (st.m[other].ballsUsed < BALLS_EACH) st.player = other;
        else if (ms.phase !== 'done') st.player = m;
        if (st.m[0].phase === 'done' && st.m[1].phase === 'done') {
          st.over = true;
          const [a, b] = [st.m[0].score, st.m[1].score];
          const w = a === b ? null : a > b ? 0 : 1;
          env.finish(w, w === null ? `Empate: ${a} pontos!` : `${env.names[w]} venceu no pinball: ${a} × ${b} pts!`);
        } else {
          setTimeout(() => { if (st && !st.over && st.m[st.player].phase === 'wait') launch(st.player); }, 900);
        }
      }
      setUi();
    }

    function addScore(m, pts, x, y) {
      st.m[m].score += pts;
      fx.text(x, y - 24, `+${pts}`, { color: '#ffd54d', size: 17 });
    }

    function flipperEnds(m, side) {
      const ms = st.m[m];
      const piv = side === 0 ? L.pivL : L.pivR;
      const ang = ms.flip[side];
      const dir = side === 0 ? 1 : -1;
      const px = OX[m] + piv[0];
      return [px, piv[1], px + Math.cos(ang) * L.flipLen * dir, piv[1] + Math.sin(ang) * L.flipLen];
    }

    function physics(m, h, now) {
      const ms = st.m[m];
      const b = ms.ball;
      const ox = OX[m];
      b.vy += GRAV * h;
      b.x += b.vx * h;
      b.y += b.vy * h;
      // paredes internas
      if (b.x < ox + 14 + BALL_R && b.vx < 0) { b.x = ox + 14 + BALL_R; b.vx = -b.vx * 0.7; }
      if (b.x > ox + MW - 14 - BALL_R && b.vx > 0) { b.x = ox + MW - 14 - BALL_R; b.vx = -b.vx * 0.7; }
      if (b.y < MT + 14 + BALL_R && b.vy < 0) { b.y = MT + 14 + BALL_R; b.vy = -b.vy * 0.7; }
      // rollover lanes (postes + premiação ao passar)
      for (const px of L.lanePosts) {
        collideCircleStatic(b, BALL_R, ox + px, L.laneY, 6, 0.7);
      }
      if (b.vy > 0 && b.y > L.laneY + 12 && b.y < L.laneY + 26 && now > ms.laneCd) {
        for (let i = 0; i < L.lanes.length; i++) {
          if (Math.abs(b.x - (ox + L.lanes[i])) < 24) {
            ms.laneCd = now + 700;
            ms.laneLit[i] = now;
            addScore(m, 50, b.x, b.y);
            env.sfx('score', 0.35);
            break;
          }
        }
      }
      // bumpers
      for (const [bx, by, br] of L.bumpers) {
        const hit = collideCircleStatic(b, BALL_R, ox + bx, by, br, 1.0, 1);
        if (hit > 0) {
          const d = Math.hypot(b.x - (ox + bx), b.y - by) || 1;
          b.vx = ((b.x - (ox + bx)) / d) * 470;
          b.vy = ((b.y - by) / d) * 470;
          addScore(m, 100, b.x, b.y);
          env.sfx('bumper', 0.9);
          ms[`hot${bx}`] = now;
        }
      }
      // alvos que caem
      let targetsHit = false;
      for (let i = 0; i < L.targets.length; i++) {
        if (!ms.targets[i]) continue;
        const [tx, ty] = L.targets[i];
        const before = { x: b.x, y: b.y };
        const hit = ((bb) => {
          const cx = clamp(bb.x, ox + tx, ox + tx + 26);
          const cy = clamp(bb.y, ty, ty + 10);
          return Math.hypot(bb.x - cx, bb.y - cy) < BALL_R;
        })(b);
        if (hit) {
          ms.targets[i] = false;
          targetsHit = true;
          addScore(m, 150, before.x, before.y);
          b.vy = Math.abs(b.vy) * 0.6 + 120;
          env.sfx('bumper', 0.6);
        }
      }
      if (targetsHit && ms.targets.every((t) => !t)) {
        addScore(m, 500, ox + 277, 150);
        fx.text(ox + 190, 200, 'BÔNUS +500!', { color: '#7cff9a', size: 24 });
        ms.targetResetAt = now + 1200;
        env.sfx('score', 0.9);
      }
      if (ms.targetResetAt && now > ms.targetResetAt) {
        ms.targets = [true, true, true];
        ms.targetResetAt = 0;
      }
      // slingshots
      for (let i = 0; i < 2; i++) {
        const [x1, y1, x2, y2] = L.slings[i];
        const kick = now > ms.slingCd[i] ? 430 : 0;
        const hit = collideSegment(b, BALL_R, ox + x1, y1, ox + x2, y2, 7, 0.6, 0);
        if (hit > 120 && kick) {
          ms.slingCd[i] = now + 200;
          const nx = i === 0 ? 0.55 : -0.55;
          b.vx += nx * 380;
          b.vy -= 300;
          addScore(m, 25, b.x, b.y);
          env.sfx('cushion', 0.7);
        }
      }
      // flippers
      for (const side of [0, 1]) {
        const [x1, y1, x2, y2] = flipperEnds(m, side);
        const kicking = Math.abs(ms.flipV[side]) > 2 && ms.flipV[side] < 0;
        const hit = collideSegment(b, BALL_R, x1, y1, x2, y2, 8, 0.5, kicking ? 640 : 0);
        if (hit > 200) env.sfx('click', 0.5);
      }
      // anti-travamento
      if (Math.hypot(b.vx, b.vy) < 12) ms.stallT += h;
      else ms.stallT = 0;
      if (ms.stallT > 2.5) {
        b.vx += Math.random() * 160 - 80;
        b.vy -= 150;
        ms.stallT = 0;
      }
      ms.time += h;
      if (b.y > DRAIN_Y + BALL_R || ms.time > 75) drainBall(m);
    }

    function setFlip(m, side, active) {
      if (!st || !st.m[m]) return;
      st.m[m].flipTarget[side] = active ? L.up : L.rest;
    }

    // ---------- desenho ----------
    function drawMachine(ctx, m, now) {
      const ms = st.m[m];
      const ox = OX[m];
      const cx = ox + 190;
      const mine = !env.isLocal && env.seat === m;
      const active = env.isLocal && st.player === m && !st.over;
      // gabinete
      roundRect(ctx, ox - 10, MT - 10, MW + 20, env.H - MT - 2, 16);
      ctx.fillStyle = m === 0 ? '#4c3358' : '#2c3a63';
      ctx.fill();
      const felt = ctx.createLinearGradient(0, MT, 0, env.H);
      felt.addColorStop(0, m === 0 ? '#231433' : '#131b33');
      felt.addColorStop(1, m === 0 ? '#150c22' : '#0b1020');
      roundRect(ctx, ox, MT, MW, env.H - MT - 12, 12);
      ctx.fillStyle = felt;
      ctx.fill();
      // estrelas
      for (let i = 0; i < 26; i++) {
        const sx2 = ox + 20 + ((i * 97) % (MW - 40));
        const sy2 = MT + 30 + ((i * 61) % (env.H - MT - 80));
        const tw = 0.25 + 0.5 * Math.abs(Math.sin(now / 700 + i + m * 7));
        ctx.fillStyle = `rgba(220,220,255,${tw * 0.5})`;
        ctx.fillRect(sx2, sy2, 1.6, 1.6);
      }
      // trilho neon interno (destaque se for minha máquina/ativa)
      ctx.strokeStyle = mine || active
        ? 'rgba(124,255,154,0.75)'
        : 'rgba(150,120,255,0.5)';
      ctx.lineWidth = 3;
      roundRect(ctx, ox + 8, MT + 8, MW - 16, env.H - MT - 28, 10);
      ctx.stroke();
      // nome do dono
      ctx.fillStyle = 'rgba(255,255,255,0.75)';
      ctx.font = 'bold 13px system-ui';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(`${env.names[m]}${mine ? ' (você)' : ''}`, cx, MT + 20);
      // placar digital
      roundRect(ctx, cx - 70, MT + 30, 140, 28, 6);
      ctx.fillStyle = '#0a0714';
      ctx.fill();
      ctx.strokeStyle = 'rgba(150,120,255,0.5)';
      ctx.lineWidth = 1.5;
      ctx.stroke();
      ctx.fillStyle = '#ffb64d';
      ctx.shadowColor = '#ffb64d';
      ctx.shadowBlur = 9;
      ctx.font = 'bold 19px "Courier New", monospace';
      ctx.fillText(String(ms.score).padStart(6, '0'), cx, MT + 45);
      ctx.shadowBlur = 0;
      // postes e luzes das rollover lanes
      for (const px of L.lanePosts) {
        ctx.beginPath();
        ctx.arc(ox + px, L.laneY, 6, 0, Math.PI * 2);
        ctx.fillStyle = '#5b4a8a';
        ctx.fill();
        ctx.strokeStyle = 'rgba(255,255,255,0.35)';
        ctx.lineWidth = 1.5;
        ctx.stroke();
      }
      for (let i = 0; i < L.lanes.length; i++) {
        const lit = ms.laneLit[i] && now - ms.laneLit[i] < 500;
        ctx.beginPath();
        ctx.arc(ox + L.lanes[i], L.laneY + 20, 5, 0, Math.PI * 2);
        ctx.fillStyle = lit ? '#ffd54d' : 'rgba(255,213,77,0.22)';
        if (lit) { ctx.shadowColor = '#ffd54d'; ctx.shadowBlur = 10; }
        ctx.fill();
        ctx.shadowBlur = 0;
      }
      // alvos
      for (let i = 0; i < L.targets.length; i++) {
        const [tx, ty] = L.targets[i];
        if (ms.targets[i]) {
          ctx.fillStyle = '#7cff9a';
          ctx.shadowColor = '#7cff9a';
          ctx.shadowBlur = 6;
          ctx.fillRect(ox + tx, ty, 26, 10);
          ctx.shadowBlur = 0;
        } else {
          ctx.strokeStyle = 'rgba(124,255,154,0.3)';
          ctx.lineWidth = 1.5;
          ctx.strokeRect(ox + tx, ty, 26, 10);
        }
      }
      // bumpers
      for (const [bx, by, br] of L.bumpers) {
        const hot = ms[`hot${bx}`] && now - ms[`hot${bx}`] < 160;
        const glow = hot ? 1 : 0.35 + 0.15 * Math.sin(now / 500 + bx);
        ctx.beginPath();
        ctx.arc(ox + bx, by, br + 6, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(255,120,80,${glow * 0.25})`;
        ctx.fill();
        const bg = ctx.createRadialGradient(ox + bx - 6, by - 7, 2, ox + bx, by, br + 1);
        bg.addColorStop(0, hot ? '#ffe9a0' : shade('#d8342c', 0.4));
        bg.addColorStop(0.7, hot ? '#ffd54d' : '#d8342c');
        bg.addColorStop(1, hot ? '#e0a020' : shade('#d8342c', -0.4));
        ctx.beginPath();
        ctx.arc(ox + bx, by, br, 0, Math.PI * 2);
        ctx.fillStyle = bg;
        ctx.fill();
        ctx.strokeStyle = 'rgba(255,255,255,0.55)';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(ox + bx, by, br - 5, 0, Math.PI * 2);
        ctx.stroke();
        ctx.fillStyle = '#fff';
        ctx.font = 'bold 9px system-ui';
        ctx.fillText('100', ox + bx, by + 0.5);
      }
      // slingshots
      for (const [x1, y1, x2, y2] of L.slings) {
        ctx.strokeStyle = 'rgba(150,120,255,0.28)';
        ctx.lineCap = 'round';
        ctx.lineWidth = 15;
        ctx.beginPath(); ctx.moveTo(ox + x1, y1); ctx.lineTo(ox + x2, y2); ctx.stroke();
        ctx.strokeStyle = '#a48ef0';
        ctx.lineWidth = 8;
        ctx.beginPath(); ctx.moveTo(ox + x1, y1); ctx.lineTo(ox + x2, y2); ctx.stroke();
      }
      // flippers
      for (const side of [0, 1]) {
        const [x1, y1, x2, y2] = flipperEnds(m, side);
        ctx.strokeStyle = 'rgba(0,0,0,0.4)';
        ctx.lineCap = 'round';
        ctx.lineWidth = 17;
        ctx.beginPath(); ctx.moveTo(x1 + 2, y1 + 4); ctx.lineTo(x2 + 2, y2 + 4); ctx.stroke();
        const fg = ctx.createLinearGradient(x1, y1 - 8, x1, y1 + 8);
        fg.addColorStop(0, '#ffe9a0');
        fg.addColorStop(0.5, '#ffd54d');
        fg.addColorStop(1, '#c09020');
        ctx.strokeStyle = fg;
        ctx.lineWidth = 14;
        ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke();
        ctx.beginPath();
        ctx.arc(x1, y1, 5.5, 0, Math.PI * 2);
        ctx.fillStyle = '#2c2048';
        ctx.fill();
      }
      // dreno
      const dg = ctx.createLinearGradient(0, env.H - 44, 0, env.H - 14);
      dg.addColorStop(0, 'rgba(0,0,0,0)');
      dg.addColorStop(1, 'rgba(0,0,0,0.8)');
      ctx.fillStyle = dg;
      ctx.fillRect(ox + 8, env.H - 44, MW - 16, 30);
      // bolas restantes
      for (let i = 0; i < BALLS_EACH - ms.ballsUsed - (ms.phase === 'play' ? 1 : 0); i++) {
        ctx.beginPath();
        ctx.arc(ox + 26 + i * 14, MT + 24, 5, 0, Math.PI * 2);
        ctx.fillStyle = '#c8d0dd';
        ctx.fill();
      }
      // rastro + bola cromada
      trails[m].draw(ctx, BALL_R, '#c9d4ff');
      if (ms.ball && ms.phase !== 'done') {
        const b = ms.ball;
        ctx.beginPath();
        ctx.ellipse(b.x + 2, b.y + 4, BALL_R * 0.9, BALL_R * 0.6, 0, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(0,0,0,0.4)';
        ctx.fill();
        const cg = ctx.createRadialGradient(b.x - 3.5, b.y - 4, 0.5, b.x, b.y, BALL_R + 1);
        cg.addColorStop(0, '#ffffff');
        cg.addColorStop(0.4, '#c8d0dd');
        cg.addColorStop(0.75, '#767f8f');
        cg.addColorStop(1, '#3c4350');
        ctx.beginPath();
        ctx.arc(b.x, b.y, BALL_R, 0, Math.PI * 2);
        ctx.fillStyle = cg;
        ctx.fill();
      }
      if (ms.phase === 'done') {
        ctx.fillStyle = 'rgba(255,255,255,0.55)';
        ctx.font = 'bold 22px system-ui';
        ctx.fillText('FIM ✔', cx, 300);
      }
    }

    return {
      st: null,
      start() {
        st = this.st = { m: [machineState(), machineState()], player: 0, over: false };
        setUi();
        if (env.isLocal) {
          launch(0);
        } else if (env.seat === 0 || env.seat === 1) {
          setTimeout(() => { if (st && !st.over && st.m[env.seat].phase === 'wait') launch(env.seat); }, 700);
        }
      },
      snapshot() { return serialize(); },
      restore(s) { applyFull(s); },
      msg(m) {
        if (!st) return;
        if (m.k === 'f') {
          const ms = st.m[m.m];
          if (simFor(m.m)) return; // eco da própria máquina
          if (!ms.ball) ms.ball = { x: 0, y: 0, vx: 0, vy: 0 };
          ms.phase = 'play';
          ms.ball.x = m.b[0];
          ms.ball.y = m.b[1];
          ms.flip = m.fl;
          trails[m.m].push(m.b[0], m.b[1]);
          if (m.sc !== ms.score) { ms.score = m.sc; setUi(); }
        } else if (m.k === 'd') {
          const ms = st.m[m.m];
          if (!simFor(m.m)) {
            ms.score = m.sc;
            ms.ballsUsed = m.used;
            ms.ball = null;
            ms.phase = m.done ? 'done' : 'wait';
            setUi();
          }
          maybeFinish();
        }
      },
      pointer(type, x) {
        const m = myFlippers();
        if (m == null || m < 0 || !st || st.over || st.m[m].phase !== 'play') return;
        if (type === 'down') setFlip(m, x < env.W / 2 ? 0 : 1, true);
        else if (type === 'up') { setFlip(m, 0, false); setFlip(m, 1, false); }
      },
      key(type, k) {
        const m = myFlippers();
        if (m == null || m < 0 || !st || st.over) return;
        const down = type === 'down';
        if (k === 'ArrowLeft' || k === 'a' || k === 'A') setFlip(m, 0, down);
        if (k === 'ArrowRight' || k === 'l' || k === 'L') setFlip(m, 1, down);
      },
      tick(dt) {
        fx.tick(dt);
        if (!st) return;
        const now = performance.now();
        for (const m of [0, 1]) {
          const ms = st.m[m];
          const iSim = simFor(m);
          if (iSim || env.isLocal) {
            // animação dos flippers (dono anima; espectador recebe nos quadros)
            for (const side of [0, 1]) {
              const prev = ms.flip[side];
              const target = ms.flipTarget[side];
              const maxStep = 14 * dt;
              ms.flip[side] = prev + clamp(target - prev, -maxStep, maxStep);
              ms.flipV[side] = (ms.flip[side] - prev) / Math.max(dt, 0.001);
            }
          }
          if (!iSim || ms.phase !== 'play' || !ms.ball) continue;
          trails[m].push(ms.ball.x, ms.ball.y);
          let acc = dt;
          while (acc > 0 && ms.phase === 'play') {
            const h = Math.min(1 / 240, acc);
            acc -= h;
            physics(m, h, now);
          }
          if (ms.phase === 'play' && !env.isLocal && sendFrame[m]()) {
            env.send({
              k: 'f', m,
              b: [Math.round(ms.ball.x), Math.round(ms.ball.y)],
              fl: [Math.round(ms.flip[0] * 100) / 100, Math.round(ms.flip[1] * 100) / 100],
              sc: ms.score,
            });
          }
        }
      },
      draw(ctx) {
        if (!st) return;
        const now = performance.now();
        drawMachine(ctx, 0, now);
        drawMachine(ctx, 1, now);
        fx.draw(ctx, env.W, env.H);
      },
    };
  },
};
