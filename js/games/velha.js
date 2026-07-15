// Jogo da Velha — turno puro, o mais simples dos módulos.
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

    const controls = (seat) => env.isLocal || env.seat === seat;

    function setUi() {
      env.setMsg(st.over ? '' : `Vez de ${env.names[st.turn]} (${st.turn === 0 ? '✕' : '◯'})`);
      env.setHint(st.over ? '' : controls(st.turn) ? 'Toque numa casa vazia.' : 'Aguardando a jogada…');
      env.setSub(0, '✕');
      env.setSub(1, '◯');
    }

    function winnerLine() {
      for (const [a, b, c] of LINES) {
        if (st.cells[a] !== null && st.cells[a] === st.cells[b] && st.cells[b] === st.cells[c]) {
          return { seat: st.cells[a], line: [a, b, c] };
        }
      }
      return null;
    }

    function applyMove(i, mover) {
      if (st.over || st.cells[i] !== null || mover !== st.turn) return false;
      st.cells[i] = mover;
      env.sfx('click', 0.7);
      const w = winnerLine();
      if (w) {
        st.over = true;
        st.win = w.line;
      } else if (st.cells.every((c) => c !== null)) {
        st.over = true;
        st.draw = true;
      } else {
        st.turn = 1 - st.turn;
      }
      setUi();
      return true;
    }

    return {
      st: null,
      start() {
        st = this.st = { cells: Array(9).fill(null), turn: 0, over: false, win: null, draw: false };
        setUi();
      },
      snapshot() { return st; },
      restore(s) { st = this.st = s; setUi(); },
      msg(m) {
        if (m.k === 'm') applyMove(m.i, m.s); // quem moveu é quem declara o fim
      },
      pointer(type, x, y) {
        if (type !== 'up' || !st || st.over || !controls(st.turn)) return;
        const c = Math.floor((x - OX) / CELL);
        const r = Math.floor((y - OY) / CELL);
        if (c < 0 || c > 2 || r < 0 || r > 2) return;
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
      tick() {},
      draw(ctx) {
        if (!st) return;
        ctx.strokeStyle = 'rgba(255,255,255,0.35)';
        ctx.lineWidth = 4;
        ctx.lineCap = 'round';
        for (let i = 1; i < 3; i++) {
          ctx.beginPath();
          ctx.moveTo(OX + CELL * i, OY + 8);
          ctx.lineTo(OX + CELL * i, OY + CELL * 3 - 8);
          ctx.stroke();
          ctx.beginPath();
          ctx.moveTo(OX + 8, OY + CELL * i);
          ctx.lineTo(OX + CELL * 3 - 8, OY + CELL * i);
          ctx.stroke();
        }
        for (let i = 0; i < 9; i++) {
          const v = st.cells[i];
          if (v === null) continue;
          const cx = OX + (i % 3) * CELL + CELL / 2;
          const cy = OY + Math.floor(i / 3) * CELL + CELL / 2;
          const hot = st.win && st.win.includes(i);
          ctx.strokeStyle = v === 0
            ? (hot ? '#ffd54d' : '#59b7ff')
            : (hot ? '#ffd54d' : '#ff8a5c');
          ctx.lineWidth = 8;
          if (v === 0) {
            ctx.beginPath();
            ctx.moveTo(cx - 32, cy - 32); ctx.lineTo(cx + 32, cy + 32);
            ctx.moveTo(cx + 32, cy - 32); ctx.lineTo(cx - 32, cy + 32);
            ctx.stroke();
          } else {
            ctx.beginPath();
            ctx.arc(cx, cy, 36, 0, Math.PI * 2);
            ctx.stroke();
          }
        }
      },
    };
  },
};
