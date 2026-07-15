// Poker Texas Hold'em heads-up simplificado. O anfitrião é o dealer
// autoritativo: embaralha, distribui e resolve. As cartas fechadas do
// convidado viajam por mensagem privada (espectadores não recebem).
// Termina quando alguém zera as fichas ou após 16 mãos (mais fichas vence).
import { roundRect } from '../engine.js';

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
      roundRect(ctx, x, y, w, h, 6);
      if (!faceUp) {
        ctx.fillStyle = '#39518f';
        ctx.fill();
        ctx.strokeStyle = 'rgba(255,255,255,0.5)';
        ctx.lineWidth = 1.5;
        ctx.stroke();
        roundRect(ctx, x + 5, y + 5, w - 10, h - 10, 4);
        ctx.strokeStyle = 'rgba(255,255,255,0.3)';
        ctx.stroke();
        return;
      }
      ctx.fillStyle = '#f7f4ea';
      ctx.fill();
      ctx.strokeStyle = 'rgba(0,0,0,0.35)';
      ctx.lineWidth = 1.5;
      ctx.stroke();
      const r = rankOf(card);
      const s = suitOf(card);
      ctx.fillStyle = s === 1 || s === 2 ? '#c22b26' : '#20242c';
      ctx.font = 'bold 19px system-ui';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(RANK_TXT[r] || String(r), x + w / 2, y + 22);
      ctx.font = '20px system-ui';
      ctx.fillText(SUITS[s], x + w / 2, y + 46);
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
        // mesa oval
        ctx.save();
        ctx.beginPath();
        ctx.ellipse(env.W / 2, env.H / 2 + 10, 400, 210, 0, 0, Math.PI * 2);
        ctx.fillStyle = '#274e13';
        ctx.fill();
        ctx.lineWidth = 14;
        ctx.strokeStyle = '#5d3a1e';
        ctx.stroke();
        ctx.beginPath();
        ctx.ellipse(env.W / 2, env.H / 2 + 10, 360, 175, 0, 0, Math.PI * 2);
        ctx.strokeStyle = 'rgba(255,255,255,0.12)';
        ctx.lineWidth = 2;
        ctx.stroke();
        ctx.restore();
        if (!v) return;
        // pote e mão
        ctx.fillStyle = 'rgba(255,255,255,0.85)';
        ctx.font = 'bold 17px system-ui';
        ctx.textAlign = 'center';
        ctx.fillText(`Pote: ${v.pot}`, env.W / 2, env.H / 2 - 62);
        ctx.fillStyle = 'rgba(255,255,255,0.4)';
        ctx.font = '13px system-ui';
        ctx.fillText(`Mão ${v.hand}/${MAX_HANDS}`, env.W / 2, 74);
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
        // cartas dos jogadores
        for (const seat of [0, 1]) {
          const bx = seat === 0 ? 150 : env.W - 150 - 104;
          const by = env.H / 2 + 62;
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
          // dealer/turno
          ctx.font = 'bold 13px system-ui';
          ctx.textAlign = 'center';
          if (v.dealer === seat) {
            ctx.fillStyle = '#ffd54d';
            ctx.fillText('D', bx + 52, by - 12);
          }
          if (v.phase === 'bet' && v.toAct === seat) {
            ctx.fillStyle = '#59ffa0';
            ctx.fillText('● vez', bx + 52, by + 82);
          }
          if (v.folded === seat) {
            ctx.fillStyle = 'rgba(255,255,255,0.6)';
            ctx.fillText('desistiu', bx + 52, by + 82);
          }
        }
      },
    };
  },
};
