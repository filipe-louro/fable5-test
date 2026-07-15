// Sinuca (bola 8) — módulo do hub. Física própria em physics.js e regras em
// rules.js. Quem taca simula e transmite; o estado final da tacada é
// autoritativo. Quebra alterna conforme o índice da partida no torneio.
import {
  W, H, RAIL, R, POCKETS, TOP_SEGS, LEFT_SEGS, MAX_SHOT_SPEED,
  step, allStopped, predictShot, validCuePosition,
} from '../physics.js';
import {
  makeInitialState, evaluateShot, serializeState, deserializeState, isSolid,
} from '../rules.js';
import { throttler, shade } from '../engine.js';

const PULL_RANGE = 220;
const FELT_PAD = 14;
const COLORS = {
  1: '#f6c445', 2: '#2f6fd0', 3: '#d8342c', 4: '#7e3f9d',
  5: '#ef7d20', 6: '#2e9d5b', 7: '#8d3b2f', 8: '#20242c',
};
const ballColor = (id) => COLORS[id > 8 ? id - 8 : id];

export default {
  id: 'sinuca',
  name: 'Sinuca',
  icon: '🎱',
  desc: 'Bola 8 com física completa e faltas.',
  local: true,
  create(env) {
    let state = null;
    let shooting = false;
    let remoteShooting = false;
    let shotSeat = 0;
    let ev = null;
    let acc = 0;
    let pointer = { x: -999, y: -999, inside: false };
    let aim = { charging: false, dirX: 1, dirY: 0, pressX: 0, pressY: 0, power: 0 };
    let remoteAim = null;
    let ghostCue = null;
    const sinkAnims = new Map();
    const frameT = throttler(40);
    const aimT = throttler(50);

    const controls = (seat) => env.isLocal || env.seat === seat;
    const myTurn = () => state && !state.over && controls(state.turn);
    const canAim = () => myTurn() && !shooting && !remoteShooting && !state.ballInHand && !state.balls[0].pocketed;

    function setUi() {
      for (const seat of [0, 1]) {
        const g = state.groups[seat];
        const label = g === 'solid' ? 'Lisas (1–7)' : g === 'stripe' ? 'Listradas (9–15)' : 'Grupo em aberto';
        env.setSub(seat, `${label}<br>${miniBalls(seat)}`);
      }
      env.setMsg(state.msg || '');
      let hint = '';
      if (!state.over) {
        if (env.seat === -1) hint = `👁 Assistindo. ${env.names[state.turn]} joga.`;
        else if (state.ballInHand && myTurn()) hint = 'Bola na mão: toque na mesa para posicionar a branca.';
        else if (myTurn() && !shooting && !remoteShooting) hint = 'Mire com o cursor, pressione e puxe para trás; solte para tacar.';
        else if (!myTurn() && !env.isLocal) hint = `Aguardando ${env.names[state.turn]}…`;
      }
      env.setHint(hint);
    }

    function miniBalls(seat) {
      const g = state.groups[seat];
      if (!g) return '';
      const test = g === 'solid' ? isSolid : (id) => id >= 9 && id <= 15;
      const left = state.balls.filter((b) => !b.pocketed && test(b.id));
      if (!left.length) return '<span class="mini eight">8</span>';
      return left.map((b) => {
        const c = ballColor(b.id);
        const s = g === 'stripe'
          ? `background:linear-gradient(180deg,#fff 0 22%,${c} 22% 78%,#fff 78%)`
          : `background:${c}`;
        return `<span class="mini" style="${s}"></span>`;
      }).join('');
    }

    function shoot(dirX, dirY, power) {
      const cue = state.balls[0];
      cue.vx = dirX * (150 + power * (MAX_SHOT_SPEED - 150));
      cue.vy = dirY * (150 + power * (MAX_SHOT_SPEED - 150));
      shotSeat = state.turn;
      ev = { firstHit: null, pocketed: [], sunk: [], sounds: [] };
      shooting = true;
      remoteAim = null;
      env.sfx('click', 0.4 + power * 0.6);
      env.send({ k: 'a', off: 1 });
    }

    function sendFrame(force) {
      if (env.isLocal) return;
      if (!force && !frameT()) return;
      env.send({
        k: 'f',
        b: state.balls.map((b) => [Math.round(b.x * 10) / 10, Math.round(b.y * 10) / 10, b.pocketed ? 1 : 0]),
      });
    }

    function finishShot() {
      shooting = false;
      sendFrame(true);
      evaluateShot(state, shotSeat, ev, env.names);
      ev = null;
      env.send({ k: 'e', s: serializeState(state) });
      setUi();
      if (state.over) {
        env.finish(state.winner, state.msg);
      }
    }

    function drainEvents() {
      if (!ev) return;
      let played = 0;
      for (const s of ev.sounds) {
        if (played++ >= 3) break;
        env.sfx(s.kind, s.vol);
      }
      ev.sounds.length = 0;
      for (const s of ev.sunk) {
        sinkAnims.set(s.id, { x0: s.x, y0: s.y, px: s.px, py: s.py, t0: performance.now() });
      }
      ev.sunk.length = 0;
    }

    function sendAim(force) {
      if (env.isLocal || !canAim()) return;
      if (!force && !aimT()) return;
      const cue = state.balls[0];
      let dx, dy;
      if (aim.charging) {
        dx = aim.dirX; dy = aim.dirY;
      } else {
        const vx = pointer.x - cue.x;
        const vy = pointer.y - cue.y;
        const d = Math.hypot(vx, vy);
        if (d < 4 || !pointer.inside) return;
        dx = vx / d; dy = vy / d;
      }
      env.send({ k: 'a', dx, dy, pow: aim.charging ? aim.power : 0, ch: aim.charging ? 1 : 0 });
    }

    function nearestPocketTo(x, y) {
      let best = POCKETS[0];
      let bd = Infinity;
      for (const p of POCKETS) {
        const d = Math.hypot(x - p.x, y - p.y);
        if (d < bd) { bd = d; best = p; }
      }
      return best;
    }

    // ---------- desenho ----------
    function rr(ctx, x, y, w, h, rad) {
      ctx.beginPath();
      ctx.moveTo(x + rad, y);
      ctx.arcTo(x + w, y, x + w, y + h, rad);
      ctx.arcTo(x + w, y + h, x, y + h, rad);
      ctx.arcTo(x, y + h, x, y, rad);
      ctx.arcTo(x, y, x + w, y, rad);
      ctx.closePath();
    }

    function drawTable(ctx) {
      const wood = ctx.createLinearGradient(0, 0, 0, env.H);
      wood.addColorStop(0, '#8a5a2b');
      wood.addColorStop(0.5, '#6d4322');
      wood.addColorStop(1, '#54311a');
      ctx.fillStyle = wood;
      rr(ctx, 0, 0, env.W, env.H, 22);
      ctx.fill();
      ctx.strokeStyle = 'rgba(230,195,120,0.35)';
      ctx.lineWidth = 1.5;
      rr(ctx, RAIL - FELT_PAD - 5, RAIL - FELT_PAD - 5, W + (FELT_PAD + 5) * 2, H + (FELT_PAD + 5) * 2, 14);
      ctx.stroke();
      ctx.fillStyle = '#0c6b4a';
      rr(ctx, RAIL - FELT_PAD, RAIL - FELT_PAD, W + FELT_PAD * 2, H + FELT_PAD * 2, 10);
      ctx.fill();

      ctx.save();
      ctx.translate(RAIL, RAIL);
      ctx.fillStyle = '#0a5d40';
      const trap = (ax, ay, bx, by, cx, cy, dx, dy) => {
        ctx.beginPath();
        ctx.moveTo(ax, ay); ctx.lineTo(bx, by); ctx.lineTo(cx, cy); ctx.lineTo(dx, dy);
        ctx.closePath();
        ctx.fill();
      };
      for (const [a, b] of TOP_SEGS) {
        trap(a - 9, -FELT_PAD, b + 9, -FELT_PAD, b - 3, 0, a + 3, 0);
        trap(a - 9, H + FELT_PAD, b + 9, H + FELT_PAD, b - 3, H, a + 3, H);
      }
      for (const [a, b] of LEFT_SEGS) {
        trap(-FELT_PAD, a - 9, -FELT_PAD, b + 9, 0, b - 3, 0, a + 3);
        trap(W + FELT_PAD, a - 9, W + FELT_PAD, b + 9, W, b - 3, W, a + 3);
      }
      ctx.strokeStyle = 'rgba(255,255,255,0.13)';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(W * 0.25, 6);
      ctx.lineTo(W * 0.25, H - 6);
      ctx.stroke();
      ctx.restore();

      const felt = ctx.createRadialGradient(RAIL + W / 2, RAIL + H / 2, 80, RAIL + W / 2, RAIL + H / 2, W * 0.64);
      felt.addColorStop(0, 'rgba(255,255,255,0.05)');
      felt.addColorStop(1, 'rgba(0,0,0,0.22)');
      ctx.fillStyle = felt;
      rr(ctx, RAIL - FELT_PAD, RAIL - FELT_PAD, W + FELT_PAD * 2, H + FELT_PAD * 2, 10);
      ctx.fill();

      ctx.fillStyle = 'rgba(240,225,195,0.55)';
      const diamond = (x, y) => {
        ctx.save();
        ctx.translate(x, y);
        ctx.rotate(Math.PI / 4);
        ctx.fillRect(-2.4, -2.4, 4.8, 4.8);
        ctx.restore();
      };
      for (let i = 1; i < 8; i++) {
        if (i === 4) continue;
        diamond(RAIL + (W * i) / 8, RAIL / 2 - 5);
        diamond(RAIL + (W * i) / 8, env.H - RAIL / 2 + 5);
      }
      for (let i = 1; i < 4; i++) {
        diamond(RAIL / 2 - 5, RAIL + (H * i) / 4);
        diamond(env.W - RAIL / 2 + 5, RAIL + (H * i) / 4);
      }

      for (const p of POCKETS) {
        const px = RAIL + p.x;
        const py = RAIL + p.y;
        const vis = p.r - 3;
        ctx.beginPath();
        ctx.arc(px, py, vis + 3, 0, Math.PI * 2);
        ctx.strokeStyle = '#2e1c10';
        ctx.lineWidth = 6;
        ctx.stroke();
        const hole = ctx.createRadialGradient(px, py, 2, px, py, vis);
        hole.addColorStop(0, '#000');
        hole.addColorStop(0.75, '#07090c');
        hole.addColorStop(1, '#12181e');
        ctx.beginPath();
        ctx.arc(px, py, vis, 0, Math.PI * 2);
        ctx.fillStyle = hole;
        ctx.fill();
      }
    }

    function drawBall(ctx, x, y, id, alpha = 1, scale = 1) {
      ctx.save();
      ctx.globalAlpha = alpha;
      ctx.translate(RAIL + x, RAIL + y);
      ctx.scale(scale, scale);
      ctx.beginPath();
      ctx.ellipse(1.5, 2.8, R * 0.95, R * 0.8, 0, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(0,0,0,0.25)';
      ctx.fill();
      const base = id === 0 || id > 8 ? '#f2eee0' : ballColor(id);
      const body = ctx.createRadialGradient(-R * 0.4, -R * 0.45, R * 0.15, 0, 0, R * 1.08);
      body.addColorStop(0, shade(base, 0.55));
      body.addColorStop(0.5, base);
      body.addColorStop(1, shade(base, -0.45));
      ctx.beginPath();
      ctx.arc(0, 0, R, 0, Math.PI * 2);
      ctx.fillStyle = body;
      ctx.fill();
      if (id > 8) {
        ctx.save();
        ctx.beginPath();
        ctx.arc(0, 0, R, 0, Math.PI * 2);
        ctx.clip();
        ctx.fillStyle = ballColor(id);
        ctx.fillRect(-R, -R * 0.5, R * 2, R);
        ctx.restore();
      }
      if (id !== 0) {
        ctx.beginPath();
        ctx.arc(0, 0, R * 0.5, 0, Math.PI * 2);
        ctx.fillStyle = '#f4f1e8';
        ctx.fill();
        ctx.fillStyle = '#20242c';
        ctx.font = `bold ${id > 9 ? 7 : 8}px system-ui, sans-serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(String(id), 0, 0.5);
      }
      const shine = ctx.createRadialGradient(-R * 0.38, -R * 0.5, 0.5, -R * 0.38, -R * 0.5, R * 0.9);
      shine.addColorStop(0, 'rgba(255,255,255,0.7)');
      shine.addColorStop(0.3, 'rgba(255,255,255,0.1)');
      shine.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.beginPath();
      ctx.arc(0, 0, R, 0, Math.PI * 2);
      ctx.fillStyle = shine;
      ctx.fill();
      ctx.restore();
    }

    function drawAimAll(ctx, dirX, dirY, power, charging, dim) {
      const cue = state.balls[0];
      if (cue.pocketed) return;
      const alpha = dim ? 0.45 : 1;
      // taco
      const pull = charging ? 14 + power * 70 : 12;
      const tipD = R + pull;
      const buttD = tipD + 245;
      ctx.save();
      ctx.translate(RAIL, RAIL);
      ctx.globalAlpha = alpha * 0.95;
      const tx = cue.x - dirX * tipD;
      const ty = cue.y - dirY * tipD;
      const bx = cue.x - dirX * buttD;
      const by = cue.y - dirY * buttD;
      const grad = ctx.createLinearGradient(tx, ty, bx, by);
      grad.addColorStop(0, '#e9dfc6');
      grad.addColorStop(0.06, '#d9b47c');
      grad.addColorStop(0.6, '#a76b34');
      grad.addColorStop(1, '#53341c');
      ctx.strokeStyle = grad;
      ctx.lineWidth = 5;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(tx, ty);
      ctx.lineTo(bx, by);
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(tx, ty, 2.7, 0, Math.PI * 2);
      ctx.fillStyle = '#5b8fc7';
      ctx.fill();
      ctx.restore();

      const pred = predictShot(state.balls, cue, dirX, dirY);
      if (pred) {
        ctx.save();
        ctx.translate(RAIL, RAIL);
        ctx.globalAlpha = alpha;
        ctx.setLineDash([7, 7]);
        ctx.strokeStyle = 'rgba(255,255,255,0.75)';
        ctx.lineWidth = 1.6;
        ctx.beginPath();
        ctx.moveTo(cue.x + dirX * (R + 2), cue.y + dirY * (R + 2));
        ctx.lineTo(pred.x, pred.y);
        ctx.stroke();
        ctx.setLineDash([]);
        ctx.beginPath();
        ctx.arc(pred.x, pred.y, R, 0, Math.PI * 2);
        ctx.strokeStyle = 'rgba(255,255,255,0.8)';
        ctx.lineWidth = 1.4;
        ctx.stroke();
        if (pred.ballId != null) {
          const target = state.balls[pred.ballId];
          ctx.strokeStyle = 'rgba(255,255,255,0.5)';
          ctx.lineWidth = 2;
          ctx.beginPath();
          ctx.moveTo(target.x, target.y);
          ctx.lineTo(target.x + pred.tx * 44, target.y + pred.ty * 44);
          ctx.stroke();
        }
        ctx.restore();
      }
      if (charging && power > 0.01) {
        const bw = 190;
        const bx2 = RAIL + W / 2 - bw / 2;
        const by2 = env.H - RAIL / 2 + 3;
        ctx.save();
        ctx.globalAlpha = alpha;
        rr(ctx, bx2, by2, bw, 10, 5);
        ctx.fillStyle = 'rgba(0,0,0,0.45)';
        ctx.fill();
        const g = ctx.createLinearGradient(bx2, 0, bx2 + bw, 0);
        g.addColorStop(0, '#37b96c');
        g.addColorStop(0.55, '#e3c53a');
        g.addColorStop(1, '#d8342c');
        rr(ctx, bx2 + 1.5, by2 + 1.5, (bw - 3) * power, 7, 3.5);
        ctx.fillStyle = g;
        ctx.fill();
        ctx.restore();
      }
    }

    return {
      st: null,
      start() {
        state = makeInitialState((env.idx || 0) % 2, env.names);
        this.st = state;
        shooting = false;
        remoteShooting = false;
        ghostCue = null;
        remoteAim = null;
        sinkAnims.clear();
        setUi();
      },
      snapshot() { return serializeState(state); },
      restore(s) {
        state = deserializeState(s);
        this.st = state;
        setUi();
      },
      msg(m) {
        switch (m.k) {
          case 'a':
            remoteAim = m.off ? null : { dx: m.dx, dy: m.dy, pow: m.pow || 0, ch: !!m.ch };
            break;
          case 'f': {
            remoteShooting = true;
            remoteAim = null;
            for (let i = 0; i < m.b.length && i < state.balls.length; i++) {
              const b = state.balls[i];
              const [x, y, p] = m.b[i];
              if (p && !b.pocketed) {
                b.pocketed = true;
                const pk = nearestPocketTo(b.x, b.y);
                sinkAnims.set(b.id, { x0: b.x, y0: b.y, px: pk.x, py: pk.y, t0: performance.now() });
                env.sfx('pocket', 1);
              }
              b.x = x; b.y = y;
            }
            break;
          }
          case 'e':
            remoteShooting = false;
            state = deserializeState(m.s);
            this.st = state;
            remoteAim = null;
            ghostCue = null;
            setUi();
            break;
          case 'ph':
            ghostCue = { x: m.x, y: m.y, valid: true };
            break;
          case 'pf': {
            const cue = state.balls[0];
            cue.pocketed = false;
            cue.x = m.x; cue.y = m.y;
            cue.vx = 0; cue.vy = 0;
            state.ballInHand = false;
            ghostCue = null;
            setUi();
            break;
          }
        }
      },
      pointer(type, cx, cy) {
        const x = cx - RAIL;
        const y = cy - RAIL;
        if (type === 'move') {
          pointer.x = x; pointer.y = y; pointer.inside = true;
          if (state.ballInHand && myTurn()) {
            ghostCue = { x, y, valid: validCuePosition(state.balls, x, y) };
            if (!env.isLocal && aimT()) env.send({ k: 'ph', x, y });
            return;
          }
          if (canAim()) {
            if (aim.charging) {
              const proj = (aim.pressX - x) * aim.dirX + (aim.pressY - y) * aim.dirY;
              aim.power = Math.min(1, Math.max(0, proj / PULL_RANGE));
            }
            sendAim(false);
          }
          return;
        }
        if (type === 'down') {
          pointer.x = x; pointer.y = y; pointer.inside = true;
          if (canAim() && !state.ballInHand) {
            const cue = state.balls[0];
            const dx = x - cue.x;
            const dy = y - cue.y;
            const d = Math.hypot(dx, dy);
            if (d > R + 2) {
              aim.charging = true;
              aim.dirX = dx / d;
              aim.dirY = dy / d;
              aim.pressX = x;
              aim.pressY = y;
              aim.power = 0;
              sendAim(true);
            }
          }
          return;
        }
        if (type === 'up') {
          const wasCharging = aim.charging;
          aim.charging = false;
          if (state.over) return;
          if (state.ballInHand && myTurn()) {
            if (validCuePosition(state.balls, x, y)) {
              const cue = state.balls[0];
              cue.pocketed = false;
              cue.x = x; cue.y = y;
              cue.vx = 0; cue.vy = 0;
              state.ballInHand = false;
              ghostCue = null;
              env.send({ k: 'pf', x, y });
              setUi();
            }
            return;
          }
          if (wasCharging && canAim()) {
            if (aim.power >= 0.02) {
              shoot(aim.dirX, aim.dirY, aim.power);
              setUi();
            } else {
              sendAim(true);
            }
          }
        }
      },
      key() {},
      tick(dt) {
        if (!shooting) { acc = 0; return; }
        acc += dt;
        let n = 0;
        while (acc >= 1 / 240 && n < 60) {
          step(state.balls, 1 / 240, ev);
          acc -= 1 / 240;
          n++;
        }
        drainEvents();
        sendFrame(false);
        if (allStopped(state.balls)) finishShot();
      },
      draw(ctx) {
        if (!state) return;
        const now = performance.now();
        drawTable(ctx);
        const animating = shooting || remoteShooting;
        if (canAim() && (pointer.inside || aim.charging)) {
          if (aim.charging) {
            drawAimAll(ctx, aim.dirX, aim.dirY, aim.power, true, false);
          } else {
            const cue = state.balls[0];
            const dx = pointer.x - cue.x;
            const dy = pointer.y - cue.y;
            const d = Math.hypot(dx, dy);
            if (d > 4) drawAimAll(ctx, dx / d, dy / d, 0, false, false);
          }
        } else if (remoteAim && !myTurn() && !animating && !state.ballInHand && !state.over) {
          drawAimAll(ctx, remoteAim.dx, remoteAim.dy, remoteAim.pow, remoteAim.ch, true);
        }
        for (const [id, s] of sinkAnims) {
          const t = (now - s.t0) / 380;
          if (t >= 1) { sinkAnims.delete(id); continue; }
          const ease = t * t * (3 - 2 * t);
          drawBall(ctx, s.x0 + (s.px - s.x0) * ease, s.y0 + (s.py - s.y0) * ease, id, 1 - ease * 0.9, 1 - ease * 0.65);
        }
        for (const b of state.balls) {
          if (b.pocketed || b.id === 0) continue;
          drawBall(ctx, b.x, b.y, b.id);
        }
        const cue = state.balls[0];
        if (!cue.pocketed && !state.ballInHand) drawBall(ctx, cue.x, cue.y, 0);
        if (state.ballInHand && ghostCue) {
          ctx.save();
          if (ghostCue.valid === false) ctx.filter = 'grayscale(1) brightness(1.2)';
          drawBall(ctx, ghostCue.x, ghostCue.y, 0, 0.55);
          ctx.restore();
        } else if (state.ballInHand && !cue.pocketed) {
          drawBall(ctx, cue.x, cue.y, 0, 0.55);
        }
      },
    };
  },
};
