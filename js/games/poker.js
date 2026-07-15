// Poker Texas Hold'em heads-up simplificado. O anfitrião é o dealer
// autoritativo: embaralha, distribui e resolve. As cartas fechadas do
// convidado viajam por mensagem privada (espectadores não recebem).
// Termina quando alguém zera as fichas ou após 16 mãos (mais fichas vence).
import { roundRect, shade } from '../engine.js';

const START_CHIPS = 1000;
const SB = 10;
const BB = 20;
const MAX_HANDS = 16;
const RANK_TXT = { 11: 'J', 12: 'Q', 13: 'K', 14: 'A' };
const SUITS = ['♠', '♥', '♦', '♣'];
const CATS = ['carta alta', 'par', 'dois pares', 'trinca', 'sequência', 'flush', 'full house', 'quadra', 'straight flush'];

const rankOf = (c) => 2 + (c % 13);
const suitOf = (c) => Math.floor(c / 13);

function eval5(cs) {
  const rs = cs.map(rankOf).sort((a, b) => b - a);
  const flush = cs.every((c) => suitOf(c) === suitOf(cs[0]));
  const uniq = [...new Set(rs)];
  let straightHigh = 0;
  if (uniq.length === 5) {
    if (uniq[0] - uniq[4] === 4) straightHigh = uniq[0];
    else if (uniq[0] === 14 && uniq[1] === 5 && uniq[4] === 2) straightHigh = 5; // roda
  }
  const count = {};
  for (const r of rs) count[r] = (count[r] || 0) + 1;
  const groups = Object.entries(count)
    .map(([r, n]) => [n, +r])
    .sort((a, b) => b[0] - a[0] || b[1] - a[1]);
  if (flush && straightHigh) return [8, straightHigh];
  if (groups[0][0] === 4) return [7, groups[0][1], groups[1][1]];
  if (groups[0][0] === 3 && groups[1][0] === 2) return [6, groups[0][1], groups[1][1]];
  if (flush) return [5, ...rs];
  if (straightHigh) return [4, straightHigh];
  if (groups[0][0] === 3) return [3, groups[0][1], groups[1][1], groups[2][1]];
  if (groups[0][0] === 2 && groups[1][0] === 2) return [2, groups[0][1], groups[1][1], groups[2][1]];
  if (groups[0][0] === 2) return [1, groups[0][1], groups[1][1], groups[2][1], groups[3][1]];
  return [0, ...rs];
}

function cmpRank(a, b) {
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    const d = (a[i] || 0) - (b[i] || 0);
    if (d) return d;
  }
  return 0;
}

function eval7(cs) {
  let best = null;
  for (let i = 0; i < 7; i++) {
    for (let j = i + 1; j < 7; j++) {
      const five = cs.filter((_, k) => k !== i && k !== j);
      const r = eval5(five);
      if (!best || cmpRank(r, best) > 0) best = r;
    }
  }
  return best;
}

export default {
  id: 'poker',
  name: 'Poker (Hold’em)',
  icon: '🃏',
  desc: 'Heads-up, blinds 10/20. Zere as fichas do rival.',
  local: false,
  create(env) {
    let st = null; // estado completo (só no anfitrião)
    let view = null; // estado público (todos)
    let myHole = null;
    const isDealerHost = env.isHost && env.seat === 0;

    function pubFrom() {
      return {
        chips: st.chips.slice(),
        pot: st.committed[0] + st.committed[1],
        comm: st.comm.slice(),
        roundBet: st.roundBet.slice(),
        toAct: st.toAct,
        dealer: st.dealer,
        phase: st.phase,
        hand: st.hand,
        folded: st.folded,
        reveal: st.reveal,
        line: st.line || '',
        over: st.over || false,
      };
    }

    function broadcast() {
      view = pubFrom();
      env.send({ k: 's', pub: view });
      refreshUi();
    }

    function shuffledDeck() {
      const d = Array.from({ length: 52 }, (_, i) => i);
      for (let i = d.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [d[i], d[j]] = [d[j], d[i]];
      }
      return d;
    }

    function startHand() {
      st.deck = shuffledDeck();
      st.holes = [[st.deck.pop(), st.deck.pop()], [st.deck.pop(), st.deck.pop()]];
      st.comm = [];
      st.committed = [0, 0];
      st.roundBet = [0, 0];
      st.acted = [false, false];
      st.street = 0;
      st.folded = null;
      st.reveal = null;
      st.phase = 'bet';
      const sb = st.dealer;
      const bb = 1 - sb;
      pay(sb, Math.min(SB, st.chips[sb]));
      pay(bb, Math.min(BB, st.chips[bb]));
      st.toAct = sb; // heads-up: dealer age primeiro no pré-flop
      st.line = `Mão ${st.hand} — blinds ${SB}/${BB}. ${env.names[sb]} é o dealer.`;
      env.sendPrivate({ k: 'hole', h: st.holes[1], hand: st.hand });
      myHole = st.holes[0];
      broadcast();
    }

    function pay(seat, amount) {
      const a = Math.min(amount, st.chips[seat]);
      st.chips[seat] -= a;
      st.committed[seat] += a;
      st.roundBet[seat] += a;
      return a;
    }

    const allinSomeone = () => st.chips[0] === 0 || st.chips[1] === 0;

    function dealStreet() {
      st.roundBet = [0, 0];
      st.acted = [false, false];
      st.street++;
      if (st.street === 1) st.comm.push(st.deck.pop(), st.deck.pop(), st.deck.pop());
      else if (st.street <= 3) st.comm.push(st.deck.pop());
      st.toAct = 1 - st.dealer; // pós-flop: quem não é dealer age primeiro
      env.sfx('click', 0.5);
    }

    function finishHand(winner, why, showdown) {
      st.phase = 'show';
      const c0 = st.committed[0];
      const c1 = st.committed[1];
      const eff = 2 * Math.min(c0, c1);
      const excessOwner = c0 > c1 ? 0 : 1;
      const excess = Math.abs(c0 - c1);
      if (winner === null) {
        st.chips[0] += c0;
        st.chips[1] += c1;
      } else {
        st.chips[winner] += eff;
        st.chips[excessOwner] += excess;
      }
      if (showdown) st.reveal = [st.holes[0], st.holes[1]];
      st.line = why;
      st.toAct = -1;
      env.sfx('score', 0.7);
      broadcast();
      setTimeout(() => {
        if (!st) return;
        if (st.chips[0] <= 0 || st.chips[1] <= 0 || st.hand >= MAX_HANDS) {
          st.over = true;
          st.phase = 'over';
          const w = st.chips[0] === st.chips[1] ? null : st.chips[0] > st.chips[1] ? 0 : 1;
          st.line = w === null ? 'Empate em fichas!' : `${env.names[w]} venceu no poker!`;
          broadcast();
          env.finish(w, w === null
            ? `Empate: ${st.chips[0]} fichas cada!`
            : `${env.names[w]} venceu no poker com ${st.chips[w]} × ${st.chips[1 - w]} fichas!`);
        } else {
          st.hand++;
          st.dealer = 1 - st.dealer;
          startHand();
        }
      }, 2600);
    }

    function showdown() {
      // completa o bordo se faltarem cartas (all-in)
      while (st.comm.length < 5) st.comm.push(st.deck.pop());
      const r0 = eval7([...st.holes[0], ...st.comm]);
      const r1 = eval7([...st.holes[1], ...st.comm]);
      const c = cmpRank(r0, r1);
      const w = c === 0 ? null : c > 0 ? 0 : 1;
      const why = w === null
        ? `Empate: ${CATS[r0[0]]} dos dois lados.`
        : `${env.names[w]} leva o pote com ${CATS[(w === 0 ? r0 : r1)[0]]}.`;
      finishHand(w, why, true);
    }

    function act(seat, a) {
      if (!isDealerHost || !st || st.phase !== 'bet' || st.toAct !== seat) return;
      const other = 1 - seat;
      const diff = st.roundBet[other] - st.roundBet[seat];
      if (a === 'fold') {
        st.folded = seat;
        finishHand(other, `${env.names[seat]} desistiu — ${env.names[other]} leva o pote.`, false);
        return;
      }
      if (a === 'call') {
        pay(seat, diff);
        st.acted[seat] = true;
        st.line = diff > 0 ? `${env.names[seat]} pagou ${diff}.` : `${env.names[seat]} passou.`;
      } else if (a === 'r40' || a === 'r100' || a === 'allin') {
        const add = a === 'allin' ? st.chips[seat] : diff + (a === 'r40' ? 40 : 100);
        const paid = pay(seat, add);
        if (st.roundBet[seat] > st.roundBet[other]) {
          st.acted = [false, false];
          st.line = `${env.names[seat]} apostou +${paid}.`;
        } else {
          st.line = `${env.names[seat]} pagou all-in.`;
        }
        st.acted[seat] = true;
      } else {
        return;
      }
      env.sfx('click', 0.5);
      // rodada termina?
      const equal = st.roundBet[0] === st.roundBet[1] || allinSomeone();
      if (st.acted[0] && st.acted[1] && equal) {
        if (allinSomeone() || st.street >= 3) {
          if (allinSomeone()) st.reveal = [st.holes[0], st.holes[1]];
          if (st.street >= 3 || allinSomeone()) {
            showdown();
            return;
          }
        }
        dealStreet();
      } else {
        st.toAct = other;
      }
      broadcast();
    }

    function myTurnToAct() {
      const v = view;
      return v && v.phase === 'bet' && v.toAct === env.seat && env.seat >= 0 && !v.over;
    }

    function refreshUi() {
      const v = view;
      if (!v) return;
      env.setSub(0, `💰 ${v.chips[0]} <span class="muted">aposta ${v.roundBet[0]}</span>`);
      env.setSub(1, `💰 ${v.chips[1]} <span class="muted">aposta ${v.roundBet[1]}</span>`);
      env.setMsg(v.line || '');
      if (!v.over) {
        env.setHint(env.seat === -1
          ? '👁 Assistindo (cartas fechadas ocultas até o showdown)'
          : myTurnToAct() ? 'Sua vez de agir.' : v.phase === 'bet' ? `Vez de ${env.names[v.toAct]}…` : '');
      }
      if (myTurnToAct()) {
        const diff = v.roundBet[1 - env.seat] - v.roundBet[env.seat];
        env.setActions([
          { label: 'Desistir', a: 'fold' },
          { label: diff > 0 ? `Pagar ${diff}` : 'Passar', a: 'call' },
          { label: '+40', a: 'r40' },
          { label: '+100', a: 'r100' },
          { label: 'All-in', a: 'allin' },
        ].map((b) => ({
          label: b.label,
          onClick: () => {
            env.setActions(null);
            if (isDealerHost) act(env.seat, b.a);
            else env.send({ k: 'act', a: b.a });
          },
        })));
      } else {
        env.setActions(null);
      }
    }

    function drawCard(ctx, x, y, card, faceUp) {
      const w = 48, h = 66;
      // sombra da carta
      ctx.save();
      ctx.fillStyle = 'rgba(0,0,0,0.35)';
      roundRect(ctx, x + 2, y + 3, w, h, 6);
      ctx.fill();
      if (!faceUp) {
        const bg = ctx.createLinearGradient(x, y, x + w, y + h);
        bg.addColorStop(0, '#3e5aa0');
        bg.addColorStop(1, '#2b3f74');
        roundRect(ctx, x, y, w, h, 6);
        ctx.fillStyle = bg;
        ctx.fill();
        ctx.strokeStyle = 'rgba(255,255,255,0.55)';
        ctx.lineWidth = 1.5;
        ctx.stroke();
        // padrão losango do verso
        ctx.save();
        roundRect(ctx, x + 4, y + 4, w - 8, h - 8, 4);
        ctx.clip();
        ctx.strokeStyle = 'rgba(255,255,255,0.22)';
        ctx.lineWidth = 1;
        for (let d = -h; d < w + h; d += 8) {
          ctx.beginPath(); ctx.moveTo(x + d, y); ctx.lineTo(x + d + h, y + h); ctx.stroke();
          ctx.beginPath(); ctx.moveTo(x + d + h, y); ctx.lineTo(x + d, y + h); ctx.stroke();
        }
        ctx.restore();
        roundRect(ctx, x + 4, y + 4, w - 8, h - 8, 4);
        ctx.strokeStyle = 'rgba(255,255,255,0.4)';
        ctx.stroke();
        ctx.restore();
        return;
      }
      const fg = ctx.createLinearGradient(x, y, x, y + h);
      fg.addColorStop(0, '#ffffff');
      fg.addColorStop(1, '#ece7d6');
      roundRect(ctx, x, y, w, h, 6);
      ctx.fillStyle = fg;
      ctx.fill();
      ctx.strokeStyle = 'rgba(0,0,0,0.35)';
      ctx.lineWidth = 1.5;
      ctx.stroke();
      const r = rankOf(card);
      const s = suitOf(card);
      const color = s === 1 || s === 2 ? '#c22b26' : '#20242c';
      ctx.fillStyle = color;
      const rk = RANK_TXT[r] || String(r);
      // cantos
      ctx.font = 'bold 12px system-ui';
      ctx.textAlign = 'left';
      ctx.textBaseline = 'top';
      ctx.fillText(rk, x + 4, y + 3);
      ctx.font = '11px system-ui';
      ctx.fillText(SUITS[s], x + 4, y + 15);
      ctx.save();
      ctx.translate(x + w - 4, y + h - 3);
      ctx.rotate(Math.PI);
      ctx.font = 'bold 12px system-ui';
      ctx.fillText(rk, 0, 0);
      ctx.font = '11px system-ui';
      ctx.fillText(SUITS[s], 0, 12);
      ctx.restore();
      // centro
      ctx.font = '26px system-ui';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(SUITS[s], x + w / 2, y + h / 2 + 6);
      ctx.font = 'bold 15px system-ui';
      ctx.fillText(rk, x + w / 2, y + h / 2 - 14);
      ctx.restore();
    }

    // pilha de fichas proporcional às fichas do jogador
    function drawChips(ctx, x, y, chips) {
      const denoms = [[500, '#7e3f9d'], [100, '#20242c'], [25, '#2e9d5b'], [5, '#d8342c']];
      let rest = chips;
      let col = 0;
      for (const [val, color] of denoms) {
        let n = Math.min(6, Math.floor(rest / val));
        rest -= n * val;
        if (n <= 0) continue;
        const cx = x + col * 20;
        for (let i = 0; i < n; i++) {
          const cy = y - i * 4;
          ctx.beginPath();
          ctx.ellipse(cx, cy, 9, 5.4, 0, 0, Math.PI * 2);
          ctx.fillStyle = shade(color, -0.3);
          ctx.fill();
          ctx.beginPath();
          ctx.ellipse(cx, cy - 1.6, 9, 5.4, 0, 0, Math.PI * 2);
          ctx.fillStyle = color;
          ctx.fill();
          ctx.strokeStyle = 'rgba(255,255,255,0.55)';
          ctx.lineWidth = 1.4;
          ctx.setLineDash([3, 3]);
          ctx.beginPath();
          ctx.ellipse(cx, cy - 1.6, 6.4, 3.8, 0, 0, Math.PI * 2);
          ctx.stroke();
          ctx.setLineDash([]);
        }
        col++;
      }
    }

    return {
      st: null,
      start() {
        view = null;
        myHole = null;
        if (isDealerHost) {
          st = this.st = {
            chips: [START_CHIPS, START_CHIPS], hand: 1, dealer: Math.random() < 0.5 ? 0 : 1,
            over: false,
          };
          startHand();
        } else {
          env.setMsg('Embaralhando…');
        }
      },
      snapshot() { return view; },
      restore(s) { view = s; refreshUi(); },
      msg(m) {
        if (m.k === 's') {
          view = m.pub;
          if (isDealerHost) return; // anfitrião já tem o estado
          refreshUi();
        } else if (m.k === 'hole' && env.seat === 1) {
          myHole = m.h;
        } else if (m.k === 'act' && isDealerHost) {
          act(1, m.a);
        }
      },
      pointer() {},
      key() {},
      tick() {},
      draw(ctx) {
        const v = view;
        const CXm = env.W / 2;
        const CYm = env.H / 2 + 10;
        // ambiente: luz de cima
        const amb = ctx.createRadialGradient(CXm, CYm - 80, 60, CXm, CYm, 520);
        amb.addColorStop(0, 'rgba(255,240,200,0.07)');
        amb.addColorStop(1, 'rgba(0,0,0,0)');
        ctx.fillStyle = amb;
        ctx.fillRect(0, 0, env.W, env.H);
        // sombra da mesa
        ctx.beginPath();
        ctx.ellipse(CXm + 6, CYm + 16, 408, 214, 0, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(0,0,0,0.4)';
        ctx.fill();
        // borda de couro acolchoado
        const leather = ctx.createRadialGradient(CXm, CYm - 120, 60, CXm, CYm, 430);
        leather.addColorStop(0, '#6b4226');
        leather.addColorStop(0.8, '#4a2c17');
        leather.addColorStop(1, '#33200f');
        ctx.beginPath();
        ctx.ellipse(CXm, CYm, 404, 212, 0, 0, Math.PI * 2);
        ctx.fillStyle = leather;
        ctx.fill();
        ctx.strokeStyle = 'rgba(255,220,160,0.18)';
        ctx.lineWidth = 2;
        ctx.stroke();
        // costura do couro
        ctx.setLineDash([5, 6]);
        ctx.strokeStyle = 'rgba(230,190,130,0.3)';
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.ellipse(CXm, CYm, 384, 194, 0, 0, Math.PI * 2);
        ctx.stroke();
        ctx.setLineDash([]);
        // filete dourado + feltro
        ctx.beginPath();
        ctx.ellipse(CXm, CYm, 366, 178, 0, 0, Math.PI * 2);
        ctx.strokeStyle = 'rgba(230,195,120,0.5)';
        ctx.lineWidth = 3;
        ctx.stroke();
        const felt = ctx.createRadialGradient(CXm, CYm - 40, 40, CXm, CYm, 380);
        felt.addColorStop(0, '#2f6b1e');
        felt.addColorStop(0.7, '#26520f');
        felt.addColorStop(1, '#1c3d0c');
        ctx.beginPath();
        ctx.ellipse(CXm, CYm, 362, 174, 0, 0, Math.PI * 2);
        ctx.fillStyle = felt;
        ctx.fill();
        // arco decorativo do feltro
        ctx.beginPath();
        ctx.ellipse(CXm, CYm, 300, 122, 0, 0, Math.PI * 2);
        ctx.strokeStyle = 'rgba(255,255,255,0.1)';
        ctx.lineWidth = 2;
        ctx.stroke();
        if (!v) return;
        // pote (com pilha de fichas) e mão
        if (v.pot > 0) drawChips(ctx, env.W / 2 - 34, env.H / 2 - 66, v.pot);
        ctx.fillStyle = 'rgba(255,255,255,0.9)';
        ctx.font = 'bold 17px system-ui';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(`Pote: ${v.pot}`, env.W / 2 + 34, env.H / 2 - 70);
        ctx.fillStyle = 'rgba(255,255,255,0.45)';
        ctx.font = '13px system-ui';
        ctx.fillText(`Mão ${v.hand}/${MAX_HANDS} · blinds ${SB}/${BB}`, env.W / 2, 80);
        // cartas comunitárias
        const cw = 48 + 10;
        const cx0 = env.W / 2 - (cw * 5 - 10) / 2;
        for (let i = 0; i < 5; i++) {
          if (i < v.comm.length) drawCard(ctx, cx0 + i * cw, env.H / 2 - 40, v.comm[i], true);
          else {
            roundRect(ctx, cx0 + i * cw, env.H / 2 - 40, 48, 66, 6);
            ctx.strokeStyle = 'rgba(255,255,255,0.15)';
            ctx.lineWidth = 1.5;
            ctx.stroke();
          }
        }
        // jogadores: cartas, fichas, apostas e destaque de vez
        for (const seat of [0, 1]) {
          const bx = seat === 0 ? 170 : env.W - 170 - 104;
          const by = env.H / 2 + 56;
          const cx = bx + 52;
          const active = v.phase === 'bet' && v.toAct === seat;
          if (active) {
            const pulse = 0.4 + Math.sin(performance.now() / 260) * 0.2;
            ctx.beginPath();
            ctx.ellipse(cx, by + 34, 92, 70, 0, 0, Math.PI * 2);
            ctx.strokeStyle = `rgba(89,255,160,${pulse})`;
            ctx.lineWidth = 3;
            ctx.stroke();
          }
          let cards = null;
          let up = false;
          if (v.reveal) { cards = v.reveal[seat]; up = true; }
          else if (env.seat === seat) { cards = seat === 0 && isDealerHost ? (st ? st.holes[0] : null) : myHole; up = true; }
          if (cards && up) {
            drawCard(ctx, bx, by, cards[0], true);
            drawCard(ctx, bx + 54, by, cards[1], true);
          } else if (v.folded !== seat) {
            drawCard(ctx, bx, by, 0, false);
            drawCard(ctx, bx + 54, by, 0, false);
          }
          // fichas do jogador
          drawChips(ctx, seat === 0 ? bx - 46 : bx + 128, by + 52, v.chips[seat]);
          // aposta da rodada em fichas ao lado do centro
          if (v.roundBet[seat] > 0) {
            const betX = seat === 0 ? env.W / 2 - 150 : env.W / 2 + 130;
            drawChips(ctx, betX, env.H / 2 + 26, v.roundBet[seat]);
            ctx.fillStyle = 'rgba(255,255,255,0.75)';
            ctx.font = 'bold 12px system-ui';
            ctx.textAlign = 'center';
            ctx.fillText(String(v.roundBet[seat]), betX + 10, env.H / 2 + 44);
          }
          // botão do dealer
          if (v.dealer === seat) {
            const dx = cx + (seat === 0 ? 78 : -78);
            ctx.beginPath();
            ctx.arc(dx, by - 4, 11, 0, Math.PI * 2);
            const dg = ctx.createRadialGradient(dx - 3, by - 8, 1, dx, by - 4, 11);
            dg.addColorStop(0, '#fff');
            dg.addColorStop(1, '#cfc7ae');
            ctx.fillStyle = dg;
            ctx.fill();
            ctx.strokeStyle = 'rgba(0,0,0,0.4)';
            ctx.lineWidth = 1.5;
            ctx.stroke();
            ctx.fillStyle = '#20242c';
            ctx.font = 'bold 11px system-ui';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText('D', dx, by - 3.5);
          }
          ctx.font = 'bold 13px system-ui';
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          if (active) {
            ctx.fillStyle = '#59ffa0';
            ctx.fillText(env.seat === seat ? '● sua vez' : '● pensando…', cx, by + 84);
          }
          if (v.folded === seat) {
            ctx.fillStyle = 'rgba(255,255,255,0.6)';
            ctx.fillText('desistiu', cx, by + 84);
          }
        }
      },
    };
  },
};
