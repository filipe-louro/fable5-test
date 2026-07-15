// Damas (regras simplificadas): peões andam 1 casa na diagonal para frente e
// capturam saltando em qualquer diagonal; damas andam/capturam 1 casa em
// qualquer diagonal. Captura é opcional. Vence quem deixa o rival sem peças
// ou sem movimentos; 50 lances sem captura dá empate.
import { drawFrame, shade, Fx } from '../engine.js';

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
    let lastMove = null; // {fr, to}
    const fx = new Fx();

    const controls = (seat) => env.isLocal || env.seat === seat;
    const inside = (r, c) => r >= 0 && r < 8 && c >= 0 && c < 8;
    const ownerOf = (v) => (v > 0 ? 0 : v < 0 ? 1 : null);
    const center = (r, c) => [OX + c * CELL + CELL / 2, OY + r * CELL + CELL / 2];

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
      lastMove = { fr, to };
      if (mv.cap) {
        st.board[mv.cap[0]][mv.cap[1]] = 0;
        st.quiet = 0;
        const [cx, cy] = center(mv.cap[0], mv.cap[1]);
        fx.burst(cx, cy, mover === 0 ? '#d9d4c4' : '#3c3c48', 12, 180);
        env.sfx('pocket', 0.7);
      } else {
        st.quiet++;
        env.sfx('click', 0.6);
      }
      if (Math.abs(st.board[to[0]][to[1]]) === 1) {
        if ((mover === 0 && to[0] === 0) || (mover === 1 && to[0] === 7)) {
          st.board[to[0]][to[1]] = mover === 0 ? 2 : -2;
          const [cx, cy] = center(to[0], to[1]);
          fx.text(cx, cy - 20, '♛ DAMA!', { color: '#ffd54d', size: 22 });
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

    function drawPiece(ctx, cx, cy, v, lifted = false) {
      const light = v > 0;
      const R = 21;
      const lift = lifted ? 5 : 0;
      const y = cy - lift;
      ctx.save();
      // sombra de contato
      ctx.beginPath();
      ctx.ellipse(cx + 2, cy + 5, R * (lifted ? 1.06 : 0.96), R * 0.5, 0, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(0,0,0,${lifted ? 0.4 : 0.32})`;
      ctx.fill();
      // corpo (lateral da peça)
      const side = light ? '#a89e85' : '#0c0c12';
      ctx.beginPath();
      ctx.ellipse(cx, y + 5, R, R * 0.82, 0, 0, Math.PI * 2);
      ctx.fillStyle = side;
      ctx.fill();
      // topo
      const base = light ? '#efe9d8' : '#2e2e3a';
      const g = ctx.createRadialGradient(cx - 7, y - 8, 3, cx, y, R + 3);
      g.addColorStop(0, shade(base, 0.35));
      g.addColorStop(0.7, base);
      g.addColorStop(1, shade(base, -0.35));
      ctx.beginPath();
      ctx.ellipse(cx, y, R, R * 0.82, 0, 0, Math.PI * 2);
      ctx.fillStyle = g;
      ctx.fill();
      // ranhuras concêntricas
      ctx.strokeStyle = light ? 'rgba(120,105,75,0.5)' : 'rgba(150,150,175,0.3)';
      ctx.lineWidth = 1.2;
      for (const rr of [0.72, 0.5]) {
        ctx.beginPath();
        ctx.ellipse(cx, y, R * rr, R * 0.82 * rr, 0, 0, Math.PI * 2);
        ctx.stroke();
      }
      // brilho
      const spec = ctx.createRadialGradient(cx - R * 0.4, y - R * 0.4, 1, cx - R * 0.4, y - R * 0.4, R);
      spec.addColorStop(0, 'rgba(255,255,255,0.5)');
      spec.addColorStop(0.5, 'rgba(255,255,255,0.05)');
      spec.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.beginPath();
      ctx.ellipse(cx, y, R, R * 0.82, 0, 0, Math.PI * 2);
      ctx.fillStyle = spec;
      ctx.fill();
      if (Math.abs(v) === 2) {
        ctx.fillStyle = '#e3b13a';
        ctx.shadowColor = '#ffd54d';
        ctx.shadowBlur = 8;
        ctx.font = 'bold 19px system-ui';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('♛', cx, y);
      }
      ctx.restore();
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
        lastMove = null;
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
          env.sfx('click', 0.3);
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
      tick(dt) { fx.tick(dt); },
      draw(ctx) {
        if (!st) return;
        drawFrame(ctx, OX, OY, CELL * 8, CELL * 8, 38, {
          felt: '#3a2a18', woodA: '#7c5228', woodB: '#4a2f16', vignette: 0.18,
        });
        // coordenadas
        ctx.fillStyle = 'rgba(235,215,180,0.55)';
        ctx.font = 'bold 11px system-ui';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        for (let i = 0; i < 8; i++) {
          ctx.fillText('abcdefgh'[i], OX + i * CELL + CELL / 2, OY + CELL * 8 + 19);
          ctx.fillText(String(8 - i), OX - 19, OY + i * CELL + CELL / 2);
        }
        // casas com veios de madeira
        for (let r = 0; r < 8; r++) {
          for (let c = 0; c < 8; c++) {
            const dark = (r + c) % 2 === 1;
            const x = OX + c * CELL;
            const y = OY + r * CELL;
            const g = ctx.createLinearGradient(x, y, x + CELL, y + CELL);
            if (dark) {
              g.addColorStop(0, '#6d4826');
              g.addColorStop(1, '#54351a');
            } else {
              g.addColorStop(0, '#e9d9b8');
              g.addColorStop(1, '#d3bd94');
            }
            ctx.fillStyle = g;
            ctx.fillRect(x, y, CELL, CELL);
            ctx.strokeStyle = 'rgba(0,0,0,0.12)';
            ctx.lineWidth = 1;
            ctx.strokeRect(x + 0.5, y + 0.5, CELL - 1, CELL - 1);
          }
        }
        // último lance
        if (lastMove) {
          ctx.fillStyle = 'rgba(120,190,255,0.18)';
          for (const [r, c] of [lastMove.fr, lastMove.to]) {
            ctx.fillRect(OX + c * CELL, OY + r * CELL, CELL, CELL);
          }
        }
        // seleção + destinos
        if (st.sel && !st.over) {
          const [sr, sc] = st.sel;
          ctx.fillStyle = 'rgba(255,213,77,0.28)';
          ctx.fillRect(OX + sc * CELL, OY + sr * CELL, CELL, CELL);
          const pulse = 0.6 + Math.sin(performance.now() / 240) * 0.25;
          for (const mv of movesFor(sr, sc)) {
            const [tx, ty] = center(mv.to[0], mv.to[1]);
            ctx.beginPath();
            ctx.arc(tx, ty, 9, 0, Math.PI * 2);
            ctx.fillStyle = `rgba(255,213,77,${pulse})`;
            ctx.fill();
            if (mv.cap) {
              ctx.strokeStyle = 'rgba(255,90,80,0.8)';
              ctx.lineWidth = 3;
              ctx.beginPath();
              ctx.arc(tx, ty, 15, 0, Math.PI * 2);
              ctx.stroke();
            }
          }
        }
        // peças
        for (let r = 0; r < 8; r++) {
          for (let c = 0; c < 8; c++) {
            const v = st.board[r][c];
            if (!v) continue;
            const [cx, cy] = center(r, c);
            const lifted = st.sel && st.sel[0] === r && st.sel[1] === c;
            drawPiece(ctx, cx, cy, v, lifted);
          }
        }
        fx.draw(ctx, env.W, env.H);
      },
    };
  },
};
