// Jogo da Velha — painel de vidro com marcas neon animadas.
import { drawFrame, roundRect, Fx } from '../engine.js';

const LINES = [
  [0, 1, 2], [3, 4, 5], [6, 7, 8],
  [0, 3, 6], [1, 4, 7], [2, 5, 8],
  [0, 4, 8], [2, 4, 6],
];

export default {
  id: 'velha',
  name: 'Jogo da Velha',
  icon: '❌',
  desc: 'Três em linha. Rápido e traiçoeiro.',
  local: true,
  create(env) {
    const CELL = 130;
    const OX = (env.W - CELL * 3) / 2;
    const OY = (env.H - CELL * 3) / 2 + 6;
    let st = null;
    let hover = null;
    let winAt = 0;
    const placedAt = new Map();
    const fx = new Fx();

    const controls = (seat) => env.isLocal || env.seat === seat;

    function setUi() {
      env.setMsg(st.over ? '' : `Vez de ${env.names[st.turn]} (${st.turn === 0 ? '✕' : '◯'})`);
      env.setHint(st.over ? '' : controls(st.turn) ? 'Toque numa casa vazia.' : 'Aguardando a jogada…');
      env.setSub(0, '<span class="mark-x">✕</span>');
      env.setSub(1, '<span class="mark-o">◯</span>');
    }

    function winnerLine() {
      for (const [a, b, c] of LINES) {
        if (st.cells[a] !== null && st.cells[a] === st.cells[b] && st.cells[b] === st.cells[c]) {
          return { seat: st.cells[a], line: [a, b, c] };
        }
      }
      return null;
    }

    const cellCenter = (i) => [OX + (i % 3) * CELL + CELL / 2, OY + Math.floor(i / 3) * CELL + CELL / 2];

    function applyMove(i, mover) {
      if (st.over || st.cells[i] !== null || mover !== st.turn) return false;
      st.cells[i] = mover;
      placedAt.set(i, performance.now());
      env.sfx('click', 0.7);
      const w = winnerLine();
      if (w) {
        st.over = true;
        st.win = w.line;
        winAt = performance.now();
        const [cx, cy] = cellCenter(w.line[1]);
        fx.burst(cx, cy, mover === 0 ? '#59b7ff' : '#ff8a5c', 22);
      } else if (st.cells.every((c) => c !== null)) {
        st.over = true;
        st.draw = true;
      } else {
        st.turn = 1 - st.turn;
      }
      setUi();
      return true;
    }

    function drawMark(ctx, i, v, prog, ghost = false) {
      const [cx, cy] = cellCenter(i);
      const color = v === 0 ? '#59b7ff' : '#ff8a5c';
      const hot = st.win && st.win.includes(i);
      ctx.save();
      ctx.globalAlpha = ghost ? 0.22 : 1;
      ctx.strokeStyle = hot ? '#ffd54d' : color;
      ctx.lineWidth = 9;
      ctx.lineCap = 'round';
      ctx.shadowColor = hot ? '#ffd54d' : color;
      ctx.shadowBlur = ghost ? 0 : 16;
      if (v === 0) {
        const p1 = Math.min(1, prog * 2);
        const p2 = Math.max(0, Math.min(1, prog * 2 - 1));
        ctx.beginPath();
        ctx.moveTo(cx - 32, cy - 32);
        ctx.lineTo(cx - 32 + 64 * p1, cy - 32 + 64 * p1);
        ctx.stroke();
        if (p2 > 0) {
          ctx.beginPath();
          ctx.moveTo(cx + 32, cy - 32);
          ctx.lineTo(cx + 32 - 64 * p2, cy - 32 + 64 * p2);
          ctx.stroke();
        }
      } else {
        ctx.beginPath();
        ctx.arc(cx, cy, 36, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * prog);
        ctx.stroke();
      }
      ctx.restore();
    }

    return {
      st: null,
      start() {
        st = this.st = { cells: Array(9).fill(null), turn: 0, over: false, win: null, draw: false };
        placedAt.clear();
        hover = null;
        setUi();
      },
      snapshot() { return st; },
      restore(s) { st = this.st = s; setUi(); },
      msg(m) {
        if (m.k === 'm') applyMove(m.i, m.s); // quem moveu é quem declara o fim
      },
      pointer(type, x, y) {
        const c = Math.floor((x - OX) / CELL);
        const r = Math.floor((y - OY) / CELL);
        const inside = c >= 0 && c <= 2 && r >= 0 && r <= 2;
        hover = inside && !st.over && controls(st.turn) ? r * 3 + c : null;
        if (type !== 'up' || !st || st.over || !controls(st.turn) || !inside) return;
        const i = r * 3 + c;
        const mover = st.turn;
        if (applyMove(i, mover)) {
          env.send({ k: 'm', i, s: mover });
          if (st.over) {
            env.finish(st.draw ? null : mover, st.draw ? 'Empate!' : `${env.names[mover]} fez três em linha!`);
          }
        }
      },
      key() {},
      tick(dt) { fx.tick(dt); },
      draw(ctx) {
        if (!st) return;
        const now = performance.now();
        drawFrame(ctx, OX, OY, CELL * 3, CELL * 3, 40, {
          felt: '#141a28', woodA: '#3d4a66', woodB: '#232c40', vignette: 0.3,
        });
        // painel de vidro
        roundRect(ctx, OX - 4, OY - 4, CELL * 3 + 8, CELL * 3 + 8, 10);
        const glass = ctx.createLinearGradient(OX, OY, OX + CELL * 3, OY + CELL * 3);
        glass.addColorStop(0, 'rgba(120,150,220,0.10)');
        glass.addColorStop(0.5, 'rgba(120,150,220,0.03)');
        glass.addColorStop(1, 'rgba(120,150,220,0.10)');
        ctx.fillStyle = glass;
        ctx.fill();
        // grade
        ctx.save();
        ctx.strokeStyle = 'rgba(190,210,255,0.5)';
        ctx.shadowColor = 'rgba(120,160,255,0.8)';
        ctx.shadowBlur = 10;
        ctx.lineWidth = 4;
        ctx.lineCap = 'round';
        for (let i = 1; i < 3; i++) {
          ctx.beginPath();
          ctx.moveTo(OX + CELL * i, OY + 10);
          ctx.lineTo(OX + CELL * i, OY + CELL * 3 - 10);
          ctx.stroke();
          ctx.beginPath();
          ctx.moveTo(OX + 10, OY + CELL * i);
          ctx.lineTo(OX + CELL * 3 - 10, OY + CELL * i);
          ctx.stroke();
        }
        ctx.restore();
        // hover fantasma
        if (hover !== null && st.cells[hover] === null && !st.over) {
          drawMark(ctx, hover, st.turn, 1, true);
        }
        // marcas com animação de traço
        for (let i = 0; i < 9; i++) {
          const v = st.cells[i];
          if (v === null) continue;
          const t0 = placedAt.get(i);
          const prog = t0 ? Math.min(1, (now - t0) / 260) : 1;
          drawMark(ctx, i, v, prog);
        }
        // risco da vitória
        if (st.win) {
          const p = Math.min(1, (now - winAt) / 300);
          const [x1, y1] = cellCenter(st.win[0]);
          const [x2, y2] = cellCenter(st.win[2]);
          const dx = x2 - x1;
          const dy = y2 - y1;
          const sx = x1 - dx * 0.15;
          const sy = y1 - dy * 0.15;
          const ex = x2 + dx * 0.15;
          const ey = y2 + dy * 0.15;
          ctx.save();
          ctx.strokeStyle = '#ffd54d';
          ctx.shadowColor = '#ffd54d';
          ctx.shadowBlur = 18;
          ctx.lineWidth = 7;
          ctx.lineCap = 'round';
          ctx.beginPath();
          ctx.moveTo(sx, sy);
          ctx.lineTo(sx + (ex - sx) * p, sy + (ey - sy) * p);
          ctx.stroke();
          ctx.restore();
        }
        fx.draw(ctx, env.W, env.H);
      },
    };
  },
};
