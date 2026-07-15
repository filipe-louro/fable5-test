// Damas (regras simplificadas): peões andam 1 casa na diagonal para frente e
// capturam saltando em qualquer diagonal; damas andam/capturam 1 casa em
// qualquer diagonal. Captura é opcional. Vence quem deixa o rival sem peças
// ou sem movimentos; 50 lances sem captura dá empate.
export default {
  id: 'damas',
  name: 'Damas',
  icon: '⚫',
  desc: 'Clássico de tabuleiro, capturas e damas.',
  local: true,
  create(env) {
    const CELL = 56;
    const OX = (env.W - CELL * 8) / 2;
    const OY = (env.H - CELL * 8) / 2;
    let st = null;

    const controls = (seat) => env.isLocal || env.seat === seat;
    const inside = (r, c) => r >= 0 && r < 8 && c >= 0 && c < 8;
    const ownerOf = (v) => (v > 0 ? 0 : v < 0 ? 1 : null);

    // seat0 (positivo) anda para cima (r-1); seat1 (negativo) para baixo.
    function movesFor(r, c) {
      const v = st.board[r][c];
      if (!v) return [];
      const seat = ownerOf(v);
      const king = Math.abs(v) === 2;
      const fwd = seat === 0 ? -1 : 1;
      const out = [];
      const dirs = king ? [[-1, -1], [-1, 1], [1, -1], [1, 1]] : [[fwd, -1], [fwd, 1]];
      for (const [dr, dc] of dirs) {
        const nr = r + dr, nc = c + dc;
        if (inside(nr, nc) && st.board[nr][nc] === 0) out.push({ to: [nr, nc], cap: null });
      }
      // capturas em qualquer diagonal (peão e dama)
      for (const [dr, dc] of [[-1, -1], [-1, 1], [1, -1], [1, 1]]) {
        const mr = r + dr, mc = c + dc;
        const nr = r + dr * 2, nc = c + dc * 2;
        if (inside(nr, nc) && st.board[nr][nc] === 0 && inside(mr, mc)) {
          const mid = st.board[mr][mc];
          if (mid !== 0 && ownerOf(mid) !== seat) out.push({ to: [nr, nc], cap: [mr, mc] });
        }
      }
      return out;
    }

    function anyMove(seat) {
      for (let r = 0; r < 8; r++) {
        for (let c = 0; c < 8; c++) {
          if (ownerOf(st.board[r][c]) === seat && movesFor(r, c).length) return true;
        }
      }
      return false;
    }

    function countPieces(seat) {
      let n = 0;
      for (const row of st.board) for (const v of row) if (ownerOf(v) === seat) n++;
      return n;
    }

    function setUi() {
      env.setSub(0, `⚪ ${countPieces(0)} peças`);
      env.setSub(1, `⚫ ${countPieces(1)} peças`);
      if (!st.over) {
        env.setMsg(`Vez de ${env.names[st.turn]}`);
        env.setHint(controls(st.turn) ? 'Toque numa peça sua e depois no destino.' : 'Aguardando a jogada…');
      } else {
        env.setHint('');
      }
    }

    function applyMove(fr, to, mover) {
      if (st.over || mover !== st.turn) return false;
      const [r, c] = fr;
      if (!inside(r, c) || ownerOf(st.board[r][c]) !== mover) return false;
      const mv = movesFor(r, c).find((m) => m.to[0] === to[0] && m.to[1] === to[1]);
      if (!mv) return false;
      st.board[to[0]][to[1]] = st.board[r][c];
      st.board[r][c] = 0;
      if (mv.cap) {
        st.board[mv.cap[0]][mv.cap[1]] = 0;
        st.quiet = 0;
        env.sfx('pocket', 0.7);
      } else {
        st.quiet++;
        env.sfx('click', 0.6);
      }
      // promoção
      if (Math.abs(st.board[to[0]][to[1]]) === 1) {
        if ((mover === 0 && to[0] === 0) || (mover === 1 && to[0] === 7)) {
          st.board[to[0]][to[1]] = mover === 0 ? 2 : -2;
          env.sfx('score', 0.6);
        }
      }
      const other = 1 - mover;
      if (countPieces(other) === 0 || !anyMove(other)) {
        st.over = true;
        st.winner = mover;
      } else if (st.quiet >= 50) {
        st.over = true;
        st.winner = null;
      } else {
        st.turn = other;
      }
      st.sel = null;
      setUi();
      return true;
    }

    return {
      st: null,
      start() {
        const board = Array.from({ length: 8 }, () => Array(8).fill(0));
        for (let r = 0; r < 3; r++) {
          for (let c = 0; c < 8; c++) if ((r + c) % 2 === 1) board[r][c] = -1;
        }
        for (let r = 5; r < 8; r++) {
          for (let c = 0; c < 8; c++) if ((r + c) % 2 === 1) board[r][c] = 1;
        }
        st = this.st = { board, turn: 0, sel: null, quiet: 0, over: false, winner: null };
        setUi();
      },
      snapshot() { return { board: st.board, turn: st.turn, quiet: st.quiet, over: st.over, winner: st.winner }; },
      restore(s) { st = this.st = { ...s, sel: null }; setUi(); },
      msg(m) {
        if (m.k === 'm') applyMove(m.fr, m.to, m.s);
      },
      pointer(type, x, y) {
        if (type !== 'up' || !st || st.over || !controls(st.turn)) return;
        const c = Math.floor((x - OX) / CELL);
        const r = Math.floor((y - OY) / CELL);
        if (!inside(r, c)) { st.sel = null; return; }
        if (ownerOf(st.board[r][c]) === st.turn) {
          st.sel = [r, c];
          return;
        }
        if (st.sel) {
          const mover = st.turn;
          const fr = st.sel;
          if (applyMove(fr, [r, c], mover)) {
            env.send({ k: 'm', fr, to: [r, c], s: mover });
            if (st.over) {
              env.finish(st.winner, st.winner === null ? 'Empate (50 lances sem captura).' : `${env.names[st.winner]} venceu nas damas!`);
            }
          }
        }
      },
      key() {},
      tick() {},
      draw(ctx) {
        if (!st) return;
        for (let r = 0; r < 8; r++) {
          for (let c = 0; c < 8; c++) {
            ctx.fillStyle = (r + c) % 2 === 1 ? '#4a5a74' : '#c8d3e3';
            ctx.fillRect(OX + c * CELL, OY + r * CELL, CELL, CELL);
          }
        }
        ctx.strokeStyle = 'rgba(255,255,255,0.3)';
        ctx.lineWidth = 3;
        ctx.strokeRect(OX - 1.5, OY - 1.5, CELL * 8 + 3, CELL * 8 + 3);

        // destinos possíveis da seleção
        if (st.sel && !st.over) {
          const [sr, sc] = st.sel;
          ctx.fillStyle = 'rgba(255,213,77,0.35)';
          ctx.fillRect(OX + sc * CELL, OY + sr * CELL, CELL, CELL);
          for (const mv of movesFor(sr, sc)) {
            ctx.beginPath();
            ctx.arc(OX + mv.to[1] * CELL + CELL / 2, OY + mv.to[0] * CELL + CELL / 2, 9, 0, Math.PI * 2);
            ctx.fillStyle = 'rgba(255,213,77,0.75)';
            ctx.fill();
          }
        }

        for (let r = 0; r < 8; r++) {
          for (let c = 0; c < 8; c++) {
            const v = st.board[r][c];
            if (!v) continue;
            const cx = OX + c * CELL + CELL / 2;
            const cy = OY + r * CELL + CELL / 2;
            const light = v > 0;
            const g = ctx.createRadialGradient(cx - 6, cy - 7, 3, cx, cy, 22);
            g.addColorStop(0, light ? '#ffffff' : '#5a5a66');
            g.addColorStop(1, light ? '#c9c2ae' : '#17171d');
            ctx.beginPath();
            ctx.arc(cx, cy, 21, 0, Math.PI * 2);
            ctx.fillStyle = g;
            ctx.fill();
            ctx.strokeStyle = 'rgba(0,0,0,0.4)';
            ctx.lineWidth = 1.5;
            ctx.stroke();
            if (Math.abs(v) === 2) {
              ctx.fillStyle = '#e3b13a';
              ctx.font = 'bold 18px system-ui';
              ctx.textAlign = 'center';
              ctx.textBaseline = 'middle';
              ctx.fillText('♛', cx, cy + 1);
            }
          }
        }
      },
    };
  },
};
