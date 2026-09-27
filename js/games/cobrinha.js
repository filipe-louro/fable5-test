// Cobrinha .IO (Snake Battle Multiplayer)
// Batalha de cobras neon em tempo real inspirada nos clássicos .io.
// Colete orbes para crescer, use Turbo/Boost para cortar a trajetória do rival e force colisões.
// Anfitrião arbitra a física e sincroniza os orbes; suporte completo a 2P local e online P2P.
import { clamp, dist, throttler, roundRect, Fx, shade } from '../engine.js';

const WIN_ROUNDS = 3;
const ARENA_PAD = 36;
const BASE_SPEED = 165;
const BOOST_SPEED = 285;
const TURN_SPEED = 5.2;
const SEG_DIST = 9;
const HEAD_R = 12;
const SEG_R = 9.5;
const MAX_ORBS = 42;

const ORB_COLORS = ['#22c55e', '#fbbf24', '#a855f7', '#06b6d4', '#f43f5e', '#ec4899'];

export default {
  id: 'cobrinha',
  name: 'Cobrinha .IO',
  icon: '🐍',
  desc: 'Batalha de cobras neon! Use turbo, colete orbes e corte o rival.',
  local: true,
  create(env) {
    const L = ARENA_PAD, T = ARENA_PAD, R = env.W - ARENA_PAD, B = env.H - ARENA_PAD;
    let st = null;
    const sendInp = throttler(30);
    const sendSnap = throttler(30);
    const sim = () => env.isLocal || env.isHost;
    const fx = new Fx();

    // Estado local de controles de teclado e ponteiros (mouse/toque)
    const keysDown = new Set();
    const activePointers = new Map(); // pointerId -> { x, y, down, seat }
    // Última direção desejada por ponteiro para cada cobra
    const pointerSteer = [
      { active: false, x: env.W / 2, y: env.H / 2, down: false },
      { active: false, x: env.W / 2, y: env.H / 2, down: false },
    ];

    function createOrb(id, x, y, val = 1, color = null) {
      return {
        id,
        x: x ?? (L + 35 + Math.random() * (R - L - 70)),
        y: y ?? (T + 35 + Math.random() * (B - T - 70)),
        r: val > 1 ? 5.5 : 4,
        val,
        color: color || ORB_COLORS[Math.floor(Math.random() * ORB_COLORS.length)],
        pulse: Math.random() * Math.PI * 2,
      };
    }

    function spawnInitialOrbs() {
      const orbs = [];
      const s0x = L + 160, s1x = R - 160, sy = (T + B) / 2;
      for (let i = 0; i < MAX_ORBS; i++) {
        let x, y, tries = 0;
        do {
          x = L + 35 + Math.random() * (R - L - 70);
          y = T + 35 + Math.random() * (B - T - 70);
          tries++;
        } while (tries < 15 && (dist(x, y, s0x, sy) < 95 || dist(x, y, s1x, sy) < 95));
        orbs.push(createOrb(i, x, y));
      }
      return orbs;
    }

    function createSnake(seat) {
      const startX = seat === 0 ? L + 160 : R - 160;
      const startY = (T + B) / 2;
      const startAngle = seat === 0 ? 0 : Math.PI;
      const initLen = 20;

      // Cria histórico inicial de pontos em linha reta atrás da cabeça
      const history = [];
      for (let i = 0; i <= initLen * SEG_DIST + 20; i += 2) {
        history.push({
          x: startX - Math.cos(startAngle) * i,
          y: startY - Math.sin(startAngle) * i,
        });
      }

      return {
        seat,
        x: startX,
        y: startY,
        angle: startAngle,
        targetAngle: startAngle,
        targetLen: initLen,
        history,
        segments: [],
        boosting: false,
        boostTimer: 0,
        alive: true,
        controlSource: 'keys', // 'keys' | 'pointer'
        color: seat === 0 ? '#00f0ff' : '#ff007f',
        glow: seat === 0 ? 'rgba(0, 240, 255, 0.45)' : 'rgba(255, 0, 127, 0.45)',
      };
    }

    function updateSegments(snake) {
      const segs = [{ x: snake.x, y: snake.y }];
      const needed = Math.floor(snake.targetLen);
      let distAcc = 0;
      let histIdx = 0;

      for (let i = 1; i < needed && histIdx < snake.history.length; i++) {
        const targetD = i * SEG_DIST;
        while (histIdx < snake.history.length - 1 && distAcc < targetD) {
          const p1 = snake.history[histIdx];
          const p2 = snake.history[histIdx + 1];
          const d = dist(p1.x, p1.y, p2.x, p2.y);
          distAcc += d;
          histIdx++;
        }
        if (histIdx < snake.history.length) {
          segs.push({ x: snake.history[histIdx].x, y: snake.history[histIdx].y });
        }
      }
      snake.segments = segs;
    }

    function setUi() {
      if (!st) return;
      env.setSub(0, `<b class="big-score">${st.wins[0]}</b> · Tam: ${Math.floor(st.snakes[0].targetLen)}`);
      env.setSub(1, `<b class="big-score">${st.wins[1]}</b> · Tam: ${Math.floor(st.snakes[1].targetLen)}`);
      env.setMsg(st.over ? '' : `Rodadas: ${st.wins[0]} × ${st.wins[1]} — Primeiro a ${WIN_ROUNDS} vitórias`);
      if (!st.over) {
        if (env.seat === -1) {
          env.setHint('Modo Espectador · Batalha de Cobras .IO');
        } else if (env.isLocal) {
          env.setHint('P1: WASD + Espaço (Turbo) | P2: Setas + Enter (Turbo). Corte a cabeça do rival!');
        } else {
          env.setHint('Mova o cursor para guiar. Segure o clique ou ESPAÇO para Turbo!');
        }
      }
    }

    function resetRound(winner) {
      if (winner !== null && winner !== undefined) {
        st.wins[winner]++;
        env.sfx('score', 0.9);
        fx.banner(`${env.names[winner]} PONTUOU!`, { color: winner === 0 ? '#00f0ff' : '#ff007f' });
      }

      setUi();

      if (winner !== null && st.wins[winner] >= WIN_ROUNDS) {
        st.over = true;
        env.finish(winner, `${env.names[winner]} dominou a arena .IO por ${st.wins[0]} × ${st.wins[1]}!`);
        return;
      }

      // Reinicia posições das cobras
      st.snakes[0] = createSnake(0);
      st.snakes[1] = createSnake(1);
      updateSegments(st.snakes[0]);
      updateSegments(st.snakes[1]);
      st.roundState = 'starting';
      st.roundTimer = 1.3;
    }

    function explodeSnake(deadSeat, killerSeat) {
      const snake = st.snakes[deadSeat];
      if (!snake.alive) return;
      snake.alive = false;

      // Dispersa dezenas de orbes valiosos ao longo dos segmentos da cobra morta
      let orbId = st.nextOrbId;
      for (let i = 0; i < snake.segments.length; i += 2) {
        const seg = snake.segments[i];
        const spreadX = seg.x + (Math.random() - 0.5) * 26;
        const spreadY = seg.y + (Math.random() - 0.5) * 26;
        st.orbs.push(createOrb(orbId++, spreadX, spreadY, 2, snake.color));
      }
      st.nextOrbId = orbId;

      // Efeitos espetaculares de destruição: partículas + anéis + chuva de confetes
      fx.burst(snake.x, snake.y, snake.color, 42, 390);
      fx.burst(snake.x, snake.y, '#ffffff', 20, 260);
      fx.confetti(snake.x, snake.y, 48);
      fx.ring(snake.x, snake.y, snake.color, 44);
      st.shake = 0.55;
      env.sfx('explosion', 0.95);

      // Transição de rodada
      st.roundState = 'exploded';
      st.roundTimer = 1.7;
      st.roundWinner = killerSeat;
    }

    return {
      st: null,
      activeSeat: null,
      start() {
        st = this.st = {
          snakes: [createSnake(0), createSnake(1)],
          orbs: spawnInitialOrbs(),
          nextOrbId: MAX_ORBS,
          wins: [0, 0],
          over: false,
          shake: 0,
          roundState: 'active', // active | exploded | starting
          roundTimer: 0,
          roundWinner: null,
        };
        updateSegments(st.snakes[0]);
        updateSegments(st.snakes[1]);
        setUi();
      },
      snapshot() {
        return {
          snk: st.snakes.map((s) => ({
            x: Math.round(s.x * 10) / 10,
            y: Math.round(s.y * 10) / 10,
            a: Math.round(s.angle * 100) / 100,
            l: Math.round(s.targetLen * 10) / 10,
            b: s.boosting ? 1 : 0,
            v: s.alive ? 1 : 0,
            seg: s.segments.slice(0, 40).map((p) => [Math.round(p.x), Math.round(p.y)]),
          })),
          orb: st.orbs.slice(0, 50).map((o) => [Math.round(o.x), Math.round(o.y), o.val, o.color]),
          w: st.wins.slice(),
          o: st.over,
          rs: st.roundState,
        };
      },
      restore(s) {
        if (!st) return;
        st.wins = s.w.slice();
        st.over = s.o;
        st.roundState = s.rs;
        setUi();
      },
      msg(m) {
        if (m.k === 'inp' && sim()) {
          // Input do convidado (Seat 1) recebido pelo anfitrião
          const s1 = st.snakes[1];
          if (s1 && s1.alive) {
            s1.targetAngle = m.a;
            s1.boosting = !!m.b;
          }
        } else if (m.k === 's' && !sim()) {
          // Snapshot autoritativo do anfitrião recebido pelo convidado/espectador
          if (!m.snk) return;
          for (let i = 0; i < 2; i++) {
            const remote = m.snk[i];
            const localS = st.snakes[i];
            localS.x = remote.x;
            localS.y = remote.y;
            localS.angle = remote.a;
            localS.targetLen = remote.l;
            localS.boosting = !!remote.b;
            localS.alive = !!remote.v;
            if (remote.seg) {
              localS.segments = remote.seg.map(([x, y]) => ({ x, y }));
            }
          }
          if (m.orb) {
            st.orbs = m.orb.map(([x, y, val, color], idx) => ({
              id: idx, x, y, r: val > 1 ? 5.5 : 4, val, color, pulse: 0,
            }));
          }
          st.roundState = m.rs || st.roundState;
          if (m.w[0] !== st.wins[0] || m.w[1] !== st.wins[1] || m.o !== st.over) {
            st.wins = m.w.slice();
            st.over = m.o;
            setUi();
          }
        }
      },
      pointer(type, x, y, pointerId = 0) {
        if (!st || st.over) return;
        const down = type === 'down';
        const isUp = type === 'up' || type === 'cancel';

        let targetSeat = env.seat === -1 ? 0 : env.seat;
        if (env.isLocal) {
          targetSeat = x < env.W / 2 ? 0 : 1;
        }

        if (isUp) {
          activePointers.delete(pointerId);
          if (pointerSteer[targetSeat]) {
            pointerSteer[targetSeat].down = false;
          }
        } else {
          activePointers.set(pointerId, { x, y, down, seat: targetSeat });
          pointerSteer[targetSeat] = { active: true, x, y, down };
        }

        // Atualiza imediatamente o controle da cobra
        const s = st.snakes[targetSeat];
        if (s && s.alive) {
          s.controlSource = 'pointer';
          s.targetAngle = Math.atan2(y - s.y, x - s.x);
          s.boosting = down;

          if (!env.isLocal && env.seat === 1 && !env.isHost && sendInp()) {
            env.send({ k: 'inp', a: s.targetAngle, b: s.boosting ? 1 : 0 });
          }
        }
      },
      key(type, key) {
        if (!st || st.over) return;
        const down = type === 'down';
        const k = key.toLowerCase();

        if (down) keysDown.add(k);
        else keysDown.delete(k);

        if (env.isLocal) {
          // Player 1 (Seat 0): WASD + Espaço
          const s0 = st.snakes[0];
          if (s0 && s0.alive) {
            let dx = 0, dy = 0;
            if (keysDown.has('w')) dy -= 1;
            if (keysDown.has('s')) dy += 1;
            if (keysDown.has('a')) dx -= 1;
            if (keysDown.has('d')) dx += 1;
            if (dx !== 0 || dy !== 0) {
              s0.controlSource = 'keys';
              s0.targetAngle = Math.atan2(dy, dx);
            }
            s0.boosting = keysDown.has(' ');
          }

          // Player 2 (Seat 1): Setas + Enter / Shift
          const s1 = st.snakes[1];
          if (s1 && s1.alive) {
            let dx = 0, dy = 0;
            if (keysDown.has('arrowup')) dy -= 1;
            if (keysDown.has('arrowdown')) dy += 1;
            if (keysDown.has('arrowleft')) dx -= 1;
            if (keysDown.has('arrowright')) dx += 1;
            if (dx !== 0 || dy !== 0) {
              s1.controlSource = 'keys';
              s1.targetAngle = Math.atan2(dy, dx);
            }
            s1.boosting = keysDown.has('enter') || keysDown.has('shift');
          }
        } else {
          // Online: controla o próprio assento
          const mySeat = env.seat === -1 ? 0 : env.seat;
          const s = st.snakes[mySeat];
          if (s && s.alive) {
            let dx = 0, dy = 0;
            if (keysDown.has('w') || keysDown.has('arrowup')) dy -= 1;
            if (keysDown.has('s') || keysDown.has('arrowdown')) dy += 1;
            if (keysDown.has('a') || keysDown.has('arrowleft')) dx -= 1;
            if (keysDown.has('d') || keysDown.has('arrowright')) dx += 1;
            if (dx !== 0 || dy !== 0) {
              s.controlSource = 'keys';
              s.targetAngle = Math.atan2(dy, dx);
            }
            s.boosting = keysDown.has(' ') || keysDown.has('shift') || keysDown.has('enter');

            if (mySeat === 1 && !env.isHost && sendInp()) {
              env.send({ k: 'inp', a: s.targetAngle, b: s.boosting ? 1 : 0 });
            }
          }
        }
      },
      tick(dt) {
        if (!st) return;
        fx.tick(dt);

        if (st.shake > 0) {
          st.shake = Math.max(0, st.shake - dt * 2.2);
        }

        // Transição de rodada
        if (st.roundState === 'exploded') {
          st.roundTimer -= dt;
          if (st.roundTimer <= 0) {
            resetRound(st.roundWinner);
          }
          return;
        }

        if (st.roundState === 'starting') {
          st.roundTimer -= dt;
          if (st.roundTimer <= 0) {
            st.roundState = 'active';
          }
          return;
        }

        if (st.over) return;

        // Atualização contínua de mira por ponteiro (cursor imóvel continua guiando a cobra)
        for (let i = 0; i < 2; i++) {
          const s = st.snakes[i];
          if (!s || !s.alive) continue;
          const steer = pointerSteer[i];
          if (s.controlSource === 'pointer' && steer && steer.active) {
            const d = dist(s.x, s.y, steer.x, steer.y);
            if (d > 16) {
              s.targetAngle = Math.atan2(steer.y - s.y, steer.x - s.x);
            }
            s.boosting = steer.down;
          }
        }

        // Transmissão periódica contínua do cliente Guest para o Host (garante WebRTC fluido)
        if (!env.isLocal && !env.isHost && env.seat === 1 && sendInp()) {
          const s1 = st.snakes[1];
          if (s1) {
            env.send({ k: 'inp', a: s1.targetAngle, b: s1.boosting ? 1 : 0 });
          }
        }

        // Simulação física autoritativa no Anfitrião / Local
        if (sim()) {
          // Atualiza cada cobra
          for (let i = 0; i < 2; i++) {
            const s = st.snakes[i];
            if (!s.alive) continue;

            // Rotação suave em direção ao ângulo alvo
            let diff = s.targetAngle - s.angle;
            while (diff < -Math.PI) diff += Math.PI * 2;
            while (diff > Math.PI) diff -= Math.PI * 2;
            s.angle += Math.sign(diff) * Math.min(Math.abs(diff), TURN_SPEED * dt);

            // Determina velocidade atual com mecânica de Turbo
            const isBoost = s.boosting && s.targetLen > 12;
            const speed = isBoost ? BOOST_SPEED : BASE_SPEED;

            // Consumo de comprimento no Turbo e dispersão de orbes
            if (isBoost) {
              s.boostTimer += dt;
              if (s.boostTimer >= 0.12) {
                s.boostTimer = 0;
                s.targetLen = Math.max(12, s.targetLen - 0.7);
                // Solta orbe menor no rastro atrás da cauda
                const tail = s.segments[s.segments.length - 1] || s;
                st.orbs.push(createOrb(st.nextOrbId++, tail.x, tail.y, 1, s.color));
                fx.burst(tail.x, tail.y, s.color, 2, 70);
                env.sfx('boost', 0.2);
              }
            }

            // Movimenta cabeça
            const moveDist = speed * dt;
            s.x += Math.cos(s.angle) * moveDist;
            s.y += Math.sin(s.angle) * moveDist;

            // Registra histórico de posições
            s.history.unshift({ x: s.x, y: s.y });
            const maxHist = Math.ceil(s.targetLen * SEG_DIST * 2.5);
            if (s.history.length > maxHist) {
              s.history.length = maxHist;
            }

            // Recalcula posições dos segmentos corporais
            updateSegments(s);
          }

          // Checagem de coleta de orbes
          for (let i = 0; i < 2; i++) {
            const s = st.snakes[i];
            if (!s.alive) continue;

            for (let j = st.orbs.length - 1; j >= 0; j--) {
              const orb = st.orbs[j];
              const d = dist(s.x, s.y, orb.x, orb.y);
              if (d < HEAD_R + orb.r + 5) {
                // Comeu orbe!
                s.targetLen += orb.val * 1.35;
                fx.burst(orb.x, orb.y, orb.color, 5, 120);
                env.sfx('pickup', 0.5);
                st.orbs.splice(j, 1);
                // Repõe comidinhas na arena se abaixo do limite
                if (st.orbs.length < MAX_ORBS) {
                  st.orbs.push(createOrb(st.nextOrbId++));
                }
              }
            }
          }

          // Checagem de colisões fatais (Paredes e Armadilhas de corte)
          const s0 = st.snakes[0];
          const s1 = st.snakes[1];

          let dead0 = false;
          let dead1 = false;

          // 1. Colisão com as bordas da arena
          if (s0.alive && (s0.x < L + 10 || s0.x > R - 10 || s0.y < T + 10 || s0.y > B - 10)) {
            dead0 = true;
          }
          if (s1.alive && (s1.x < L + 10 || s1.x > R - 10 || s1.y < T + 10 || s1.y > B - 10)) {
            dead1 = true;
          }

          // 2. Colisão de corte: cabeça de S0 contra o corpo de S1 (a partir de k=3 para não colidir com o pescoço)
          if (s0.alive && s1.alive) {
            for (let k = 3; k < s1.segments.length; k++) {
              if (dist(s0.x, s0.y, s1.segments[k].x, s1.segments[k].y) < HEAD_R + SEG_R - 3) {
                dead0 = true;
                break;
              }
            }
            // Cabeça de S1 contra o corpo de S0
            for (let k = 3; k < s0.segments.length; k++) {
              if (dist(s1.x, s1.y, s0.segments[k].x, s0.segments[k].y) < HEAD_R + SEG_R - 3) {
                dead1 = true;
                break;
              }
            }

            // Colisão frontal (cabeça com cabeça)
            if (dist(s0.x, s0.y, s1.x, s1.y) < HEAD_R * 2 - 2) {
              if (s0.targetLen > s1.targetLen + 3) dead1 = true;
              else if (s1.targetLen > s0.targetLen + 3) dead0 = true;
              else { dead0 = true; dead1 = true; }
            }
          }

          // Executa explosão se houver morte
          if (dead0 && dead1) {
            explodeSnake(0, null);
            explodeSnake(1, null);
            st.roundWinner = null;
          } else if (dead0) {
            explodeSnake(0, 1);
          } else if (dead1) {
            explodeSnake(1, 0);
          }

          // Envia snapshot de rede para convidados
          if (!env.isLocal && sendSnap()) {
            env.send({ k: 's', ...this.snapshot() });
          }
        }
      },
      draw(ctx) {
        if (!st) return;

        ctx.save();

        // Screen shake com atenuação suave
        if (st.shake > 0) {
          const sx = (Math.random() - 0.5) * 18 * st.shake;
          const sy = (Math.random() - 0.5) * 18 * st.shake;
          ctx.translate(sx, sy);
        }

        const now = performance.now() * 0.001;

        // Fundo futurista escuro (Obsidian Cyber Arena)
        const bgGrad = ctx.createRadialGradient(env.W / 2, env.H / 2, 80, env.W / 2, env.H / 2, env.W * 0.65);
        bgGrad.addColorStop(0, '#0c111d');
        bgGrad.addColorStop(1, '#06080e');
        ctx.fillStyle = bgGrad;
        ctx.fillRect(0, 0, env.W, env.H);

        // Grade cibernética com pontos de cruzamento e coordenadas discretas
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.028)';
        ctx.lineWidth = 1;
        const GRID_STEP = 36;
        ctx.beginPath();
        for (let x = L; x <= R; x += GRID_STEP) {
          ctx.moveTo(x, T); ctx.lineTo(x, B);
        }
        for (let y = T; y <= B; y += GRID_STEP) {
          ctx.moveTo(L, y); ctx.lineTo(R, y);
        }
        ctx.stroke();

        // Micro-cruzes nos vértices da grade para profundidade estética
        ctx.fillStyle = 'rgba(255, 255, 255, 0.08)';
        for (let x = L + GRID_STEP; x < R; x += GRID_STEP * 2) {
          for (let y = T + GRID_STEP; y < B; y += GRID_STEP * 2) {
            ctx.fillRect(x - 2, y - 0.5, 4, 1);
            ctx.fillRect(x - 0.5, y - 2, 1, 4);
          }
        }

        // Borda laser cibernética com feixe de energia pulsante
        const arenaW = R - L;
        const arenaH = B - T;
        const perim = 2 * (arenaW + arenaH);
        const pulsePos = (now * 220) % perim;

        // Glow externo da barreira
        ctx.strokeStyle = 'rgba(0, 240, 255, 0.25)';
        ctx.lineWidth = 6;
        roundRect(ctx, L, T, arenaW, arenaH, 16);
        ctx.stroke();

        ctx.strokeStyle = '#00f0ff';
        ctx.lineWidth = 2;
        roundRect(ctx, L, T, arenaW, arenaH, 16);
        ctx.stroke();

        // Feixe pulsante ao redor da borda
        ctx.save();
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 3;
        ctx.setLineDash([40, perim - 40]);
        ctx.lineDashOffset = -pulsePos;
        roundRect(ctx, L, T, arenaW, arenaH, 16);
        ctx.stroke();
        ctx.restore();

        // Cantoneiras de proteção tática
        const cornerSize = 22;
        const corners = [
          [L, T, 1, 1], [R, T, -1, 1], [L, B, 1, -1], [R, B, -1, -1]
        ];
        ctx.strokeStyle = '#ff007f';
        ctx.lineWidth = 2.5;
        for (const [cx, cy, dx, dy] of corners) {
          ctx.beginPath();
          ctx.moveTo(cx + dx * cornerSize, cy);
          ctx.lineTo(cx, cy);
          ctx.lineTo(cx, cy + dy * cornerSize);
          ctx.stroke();
        }

        // Linha tracejada sutil divisória no modo local para indicar lados de controle
        if (env.isLocal) {
          ctx.strokeStyle = 'rgba(255, 255, 255, 0.07)';
          ctx.lineWidth = 1.5;
          ctx.setLineDash([6, 8]);
          ctx.beginPath();
          ctx.moveTo(env.W / 2, T);
          ctx.lineTo(env.W / 2, B);
          ctx.stroke();
          ctx.setLineDash([]);
        }

        // Desenha Orbes de comida pulsantes celestiais (Slither.io style)
        for (const orb of st.orbs) {
          const pulse = 1 + 0.22 * Math.sin(now * 3.5 + orb.pulse);
          const r = orb.r * pulse;

          // 1. Halo suave de iluminação ambiente
          const haloGrad = ctx.createRadialGradient(orb.x, orb.y, r * 0.4, orb.x, orb.y, r * 2.8);
          haloGrad.addColorStop(0, orb.color);
          haloGrad.addColorStop(1, 'rgba(0,0,0,0)');
          ctx.globalAlpha = 0.35;
          ctx.fillStyle = haloGrad;
          ctx.beginPath();
          ctx.arc(orb.x, orb.y, r * 2.8, 0, Math.PI * 2);
          ctx.fill();

          // 2. Núcleo cromático
          const orbGrad = ctx.createRadialGradient(orb.x - r * 0.3, orb.y - r * 0.3, r * 0.1, orb.x, orb.y, r);
          orbGrad.addColorStop(0, '#ffffff');
          orbGrad.addColorStop(0.35, shade(orb.color, 0.4));
          orbGrad.addColorStop(0.85, orb.color);
          orbGrad.addColorStop(1, shade(orb.color, -0.35));

          ctx.globalAlpha = 0.95;
          ctx.fillStyle = orbGrad;
          ctx.beginPath();
          ctx.arc(orb.x, orb.y, r, 0, Math.PI * 2);
          ctx.fill();

          // 3. Brilho especular diamante no centro
          ctx.globalAlpha = 0.85;
          ctx.fillStyle = '#ffffff';
          ctx.beginPath();
          ctx.arc(orb.x - r * 0.32, orb.y - r * 0.32, r * 0.35, 0, Math.PI * 2);
          ctx.fill();
        }
        ctx.globalAlpha = 1;

        // Desenha as duas cobras com renderização contínua de alta fidelidade
        for (let sIdx = 1; sIdx >= 0; sIdx--) {
          const s = st.snakes[sIdx];
          if (!s.alive) continue;

          // 1. Efeito de Turbo: chamas de plasma, faíscas e rastro de alta velocidade
          if (s.boosting && s.segments.length > 2) {
            const tail = s.segments[s.segments.length - 1];
            const prev = s.segments[s.segments.length - 2];
            const tAngle = Math.atan2(tail.y - prev.y, tail.x - prev.x);
            ctx.save();
            ctx.translate(tail.x, tail.y);
            ctx.rotate(tAngle);

            // Chamas de plasma estendidas
            const flameLen = 22 + Math.random() * 16;
            const flameGrad = ctx.createLinearGradient(0, 0, flameLen, 0);
            flameGrad.addColorStop(0, '#ffffff');
            flameGrad.addColorStop(0.3, s.color);
            flameGrad.addColorStop(1, 'rgba(0,0,0,0)');

            ctx.fillStyle = flameGrad;
            ctx.beginPath();
            ctx.moveTo(0, -7);
            ctx.lineTo(flameLen, 0);
            ctx.lineTo(0, 7);
            ctx.closePath();
            ctx.fill();

            // Partículas de faísca saindo do turbo
            ctx.fillStyle = '#ffffff';
            ctx.beginPath();
            ctx.arc(flameLen * 0.6 + Math.random() * 8, (Math.random() - 0.5) * 6, 1.8, 0, Math.PI * 2);
            ctx.fill();

            ctx.restore();
          }

          // 2. Traço de corpo unificado (Glow contínuo sob a cobra)
          if (s.segments.length > 1) {
            ctx.save();
            ctx.lineCap = 'round';
            ctx.lineJoin = 'round';

            // Glow amplo e difuso
            ctx.strokeStyle = s.glow;
            ctx.lineWidth = SEG_R * 2.6;
            ctx.beginPath();
            ctx.moveTo(s.x, s.y);
            for (let i = 0; i < s.segments.length; i++) {
              ctx.lineTo(s.segments[i].x, s.segments[i].y);
            }
            ctx.stroke();

            // Faixa de cor base sólida conectada
            ctx.strokeStyle = shade(s.color, -0.2);
            ctx.lineWidth = SEG_R * 2.1;
            ctx.beginPath();
            ctx.moveTo(s.x, s.y);
            for (let i = 0; i < s.segments.length; i++) {
              ctx.lineTo(s.segments[i].x, s.segments[i].y);
            }
            ctx.stroke();

            // Espinha dorsal brilhante que cria o aspecto líquido contínuo
            ctx.strokeStyle = shade(s.color, 0.45);
            ctx.lineWidth = SEG_R * 0.75;
            ctx.beginPath();
            ctx.moveTo(s.x, s.y);
            for (let i = 0; i < s.segments.length; i++) {
              ctx.lineTo(s.segments[i].x, s.segments[i].y);
            }
            ctx.stroke();

            ctx.restore();
          }

          // 3. Segmentos volumétricos com padrão de escamas em anel e shading 3D
          for (let i = s.segments.length - 1; i >= 0; i--) {
            const seg = s.segments[i];
            const taper = Math.max(0.55, 1 - (i / s.segments.length) * 0.48);
            const r = SEG_R * taper;

            // Esfera com gradiente radial e anel de escama
            const segGrad = ctx.createRadialGradient(
              seg.x - r * 0.35, seg.y - r * 0.35, r * 0.1,
              seg.x, seg.y, r
            );
            const isPattern = i % 2 === 0;
            const primaryColor = isPattern ? s.color : shade(s.color, -0.15);
            segGrad.addColorStop(0, '#ffffff');
            segGrad.addColorStop(0.35, shade(primaryColor, 0.35));
            segGrad.addColorStop(0.85, primaryColor);
            segGrad.addColorStop(1, shade(primaryColor, -0.45));

            ctx.beginPath();
            ctx.arc(seg.x, seg.y, r, 0, Math.PI * 2);
            ctx.fillStyle = segGrad;
            ctx.fill();

            // Anel metálico de costura entre escamas
            if (i % 3 === 0) {
              ctx.beginPath();
              ctx.arc(seg.x, seg.y, r * 0.88, 0, Math.PI * 2);
              ctx.strokeStyle = 'rgba(255, 255, 255, 0.3)';
              ctx.lineWidth = 1;
              ctx.stroke();
            }
          }

          // 4. Cabeça esculpida em forma de serpente com profundidade 3D
          ctx.save();
          ctx.translate(s.x, s.y);
          ctx.rotate(s.angle);

          // Glow da cabeça
          ctx.beginPath();
          ctx.arc(0, 0, HEAD_R + 8, 0, Math.PI * 2);
          ctx.fillStyle = s.glow;
          ctx.fill();

          // Geometria aerodinâmica da cabeça de serpente (Apex + Cheeks)
          ctx.beginPath();
          ctx.moveTo(HEAD_R * 1.25, 0); // Focinho
          ctx.bezierCurveTo(HEAD_R * 1.15, -HEAD_R * 0.75, HEAD_R * 0.35, -HEAD_R * 1.15, -HEAD_R * 0.4, -HEAD_R * 0.95);
          ctx.bezierCurveTo(-HEAD_R * 0.9, -HEAD_R * 0.75, -HEAD_R * 1.1, -HEAD_R * 0.3, -HEAD_R * 1.1, 0);
          ctx.bezierCurveTo(-HEAD_R * 1.1, HEAD_R * 0.3, -HEAD_R * 0.9, HEAD_R * 0.75, -HEAD_R * 0.4, HEAD_R * 0.95);
          ctx.bezierCurveTo(HEAD_R * 0.35, HEAD_R * 1.15, HEAD_R * 1.15, HEAD_R * 0.75, HEAD_R * 1.25, 0);
          ctx.closePath();

          const headGrad = ctx.createRadialGradient(-HEAD_R * 0.2, -HEAD_R * 0.3, HEAD_R * 0.15, 0, 0, HEAD_R * 1.2);
          headGrad.addColorStop(0, '#ffffff');
          headGrad.addColorStop(0.3, shade(s.color, 0.45));
          headGrad.addColorStop(0.8, s.color);
          headGrad.addColorStop(1, shade(s.color, -0.4));
          ctx.fillStyle = headGrad;
          ctx.fill();

          ctx.strokeStyle = 'rgba(255, 255, 255, 0.45)';
          ctx.lineWidth = 1.2;
          ctx.stroke();

          // Crista de cyber-serpente no topo da cabeça
          ctx.fillStyle = 'rgba(255, 255, 255, 0.35)';
          ctx.beginPath();
          ctx.moveTo(HEAD_R * 0.8, 0);
          ctx.lineTo(-HEAD_R * 0.3, -HEAD_R * 0.35);
          ctx.lineTo(-HEAD_R * 0.1, 0);
          ctx.lineTo(-HEAD_R * 0.3, HEAD_R * 0.35);
          ctx.closePath();
          ctx.fill();

          // Olhos estilizados Slither.io (Expressivos com esclera, íris e pupila 3D)
          const eyeOffX = HEAD_R * 0.3;
          const eyeOffY = HEAD_R * 0.55;
          const eyeR = HEAD_R * 0.36;

          // Esclera branca perolada com sombra de pálpebra
          for (const sign of [-1, 1]) {
            const ey = sign * eyeOffY;
            // Sombra da órbita ocular
            ctx.beginPath();
            ctx.arc(eyeOffX, ey, eyeR + 1.2, 0, Math.PI * 2);
            ctx.fillStyle = 'rgba(0, 0, 0, 0.45)';
            ctx.fill();

            // Esclera branca
            const eyeGrad = ctx.createRadialGradient(eyeOffX, ey - sign * 1, eyeR * 0.2, eyeOffX, ey, eyeR);
            eyeGrad.addColorStop(0, '#ffffff');
            eyeGrad.addColorStop(0.85, '#e2e8f0');
            eyeGrad.addColorStop(1, '#94a3b8');
            ctx.beginPath();
            ctx.arc(eyeOffX, ey, eyeR, 0, Math.PI * 2);
            ctx.fillStyle = eyeGrad;
            ctx.fill();

            // Íris vibrante colorida
            ctx.beginPath();
            ctx.arc(eyeOffX + 1.4, ey, eyeR * 0.65, 0, Math.PI * 2);
            ctx.fillStyle = s.color;
            ctx.fill();

            // Pupila vertical de predador (Slit pupil)
            ctx.beginPath();
            ctx.ellipse(eyeOffX + 1.8, ey, eyeR * 0.45, eyeR * 0.25, 0, 0, Math.PI * 2);
            ctx.fillStyle = '#05070c';
            ctx.fill();

            // Ponto de luz especular (Gleam)
            ctx.beginPath();
            ctx.arc(eyeOffX + 0.8, ey - sign * 1.2, eyeR * 0.25, 0, Math.PI * 2);
            ctx.fillStyle = '#ffffff';
            ctx.fill();
          }

          // Língua bifurcada de serpente com animação de flicking suave
          const tongueCycle = Math.sin(now * 12 + sIdx * 3);
          if (tongueCycle > 0.35) {
            const tLen = 9 + (tongueCycle - 0.35) * 14;
            ctx.strokeStyle = '#f43f5e';
            ctx.lineWidth = 1.8;
            ctx.lineCap = 'round';
            ctx.beginPath();
            ctx.moveTo(HEAD_R * 1.2, 0);
            ctx.lineTo(HEAD_R * 1.2 + tLen, 0);
            ctx.lineTo(HEAD_R * 1.2 + tLen + 4, -3.5);
            ctx.moveTo(HEAD_R * 1.2 + tLen, 0);
            ctx.lineTo(HEAD_R * 1.2 + tLen + 4, 3.5);
            ctx.stroke();
          }

          ctx.restore();

          // Placa de apelido e comprimento com estilo esportivo
          ctx.save();
          ctx.font = '800 11px system-ui, -apple-system, sans-serif';
          ctx.textAlign = 'center';
          const tagText = `${env.names[sIdx]} · ${Math.floor(s.targetLen)}`;
          const tagW = ctx.measureText(tagText).width + 16;
          const tagH = 18;
          const tagY = s.y - 24;

          ctx.fillStyle = 'rgba(10, 14, 24, 0.78)';
          roundRect(ctx, s.x - tagW / 2, tagY - tagH / 2, tagW, tagH, 9);
          ctx.fill();
          ctx.strokeStyle = s.color;
          ctx.lineWidth = 1;
          roundRect(ctx, s.x - tagW / 2, tagY - tagH / 2, tagW, tagH, 9);
          ctx.stroke();

          ctx.fillStyle = '#f8fafc';
          ctx.fillText(tagText, s.x, tagY + 3.8);
          ctx.restore();
        }

        // Desenha efeitos visuais, confetes e partículas
        fx.draw(ctx, env.W, env.H);

        // Mensagem de início de rodada com tipografia esportiva
        if (st.roundState === 'starting') {
          ctx.fillStyle = 'rgba(6, 9, 15, 0.7)';
          ctx.fillRect(0, 0, env.W, env.H);
          ctx.font = '900 36px system-ui, -apple-system, sans-serif';
          ctx.fillStyle = '#ffffff';
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillText(`RODADA ${st.wins[0] + st.wins[1] + 1} — PREPARE-SE!`, env.W / 2, env.H / 2);
        }

        ctx.restore();
      },
    };
  },
};
