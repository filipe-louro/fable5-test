// Laser Tanks (Duelo de Tanques Arcade Multiplayer)
// Ação rápida e tática em tempo real!
// Tiros laser de alta velocidade com ricochete na parede, destruição de escudo e casco em 2 hits.
// Anfitrião arbitra a física autoritativa; suporte completo a 2P local e online P2P.
import { clamp, dist, throttler, roundRect, Fx, shade } from '../engine.js';

const WIN_ROUNDS = 3;
const ARENA_PAD = 36;
const TANK_R = 18;
const MOVE_SPEED = 180;
const REV_SPEED = 115;
const ROT_SPEED = 3.8;
const LASER_SPEED = 500;
const LASER_R = 3.5;
const MAX_BOUNCES = 2;
const MAX_BULLETS = 3;
const FIRE_COOLDOWN = 0.35;

export default {
  id: 'tanques',
  name: 'Laser Tanks',
  icon: '⚡',
  desc: 'Duelo tático de tanques neon com lasers que ricocheteiam! Primeiro a 3.',
  local: true,
  create(env) {
    const L = ARENA_PAD, T = ARENA_PAD, R = env.W - ARENA_PAD, B = env.H - ARENA_PAD;
    let st = null;
    const sendInp = throttler(30);
    const sendSnap = throttler(30);
    const sim = () => env.isLocal || env.isHost;
    const fx = new Fx();

    // Paredes/Obstáculos táticos simétricos para cobertura e ricochete
    const OBSTACLES = [
      // Bloco Central
      { x: env.W / 2 - 28, y: env.H / 2 - 50, w: 56, h: 100 },
      // 4 Bunkers nos cantos para cobertura e tiros com ângulo
      { x: 210, y: 110, w: 26, h: 90 },
      { x: 210, y: env.H - 200, w: 26, h: 90 },
      { x: env.W - 236, y: 110, w: 26, h: 90 },
      { x: env.W - 236, y: env.H - 200, w: 26, h: 90 },
      // 2 Barreiras horizontais superior/inferior
      { x: env.W / 2 - 60, y: 72, w: 120, h: 22 },
      { x: env.W / 2 - 60, y: env.H - 94, w: 120, h: 22 },
    ];

    const keysDown = new Set();
    const activePointers = new Map(); // pointerId -> { x, y, down, seat }
    const pointerAim = [
      { active: false, x: env.W / 2, y: env.H / 2, down: false },
      { active: false, x: env.W / 2, y: env.H / 2, down: false },
    ];

    function createTank(seat) {
      const startX = seat === 0 ? 115 : env.W - 115;
      const startY = env.H / 2;
      const startAngle = seat === 0 ? 0 : Math.PI;

      return {
        seat,
        x: startX,
        y: startY,
        vx: 0,
        vy: 0,
        angle: startAngle,
        turretAngle: startAngle,
        fwd: 0, // -1, 0, 1
        turn: 0, // -1, 0, 1
        hp: 2, // 2 = Escudo + Casco; 1 = Apenas Casco; 0 = Destruído
        alive: true,
        cooldown: 0,
        recoil: 0,
        color: seat === 0 ? '#00f0ff' : '#ff5533',
        glow: seat === 0 ? 'rgba(0, 240, 255, 0.45)' : 'rgba(255, 85, 51, 0.45)',
      };
    }

    function setUi() {
      const hp0 = st.tanks[0].hp === 2
        ? '<span class="status-shield">ESCUDO + CASCO</span>'
        : st.tanks[0].hp === 1 ? '<span class="status-crit">CASCO CRÍTICO</span>' : '<span class="status-dead">DESTRUÍDO</span>';
      const hp1 = st.tanks[1].hp === 2
        ? '<span class="status-shield">ESCUDO + CASCO</span>'
        : st.tanks[1].hp === 1 ? '<span class="status-crit">CASCO CRÍTICO</span>' : '<span class="status-dead">DESTRUÍDO</span>';
      env.setSub(0, `<b class="big-score">${st.wins[0]}</b> · ${hp0}`);
      env.setSub(1, `<b class="big-score">${st.wins[1]}</b> · ${hp1}`);
      env.setMsg(st.over ? '' : `Rodadas: ${st.wins[0]} × ${st.wins[1]} — Primeiro a ${WIN_ROUNDS} vitórias`);
      if (!st.over) {
        if (env.seat === -1) {
          env.setHint('Modo Espectador · Duelo de Tanques Laser');
        } else if (env.isLocal) {
          env.setHint('P1: WASD + Espaço (Laser) | P2: Setas + Enter (Laser). Use os ricochetes!');
        } else {
          env.setHint('WASD / Setas para mover. MOUSE ou TOQUE para mirar e atirar lasers!');
        }
      }
    }

    function fireTank(seat) {
      const tank = st.tanks[seat];
      if (!tank || !tank.alive || tank.cooldown > 0) return;

      // Conta balas ativas do tanque
      const activeCount = st.bullets.filter((b) => b.owner === seat).length;
      if (activeCount >= MAX_BULLETS) return;

      tank.cooldown = FIRE_COOLDOWN;
      tank.recoil = 5;

      const barrelLen = 22;
      const bx = tank.x + Math.cos(tank.turretAngle) * barrelLen;
      const by = tank.y + Math.sin(tank.turretAngle) * barrelLen;
      const vx = Math.cos(tank.turretAngle) * LASER_SPEED;
      const vy = Math.sin(tank.turretAngle) * LASER_SPEED;

      st.bullets.push({
        id: st.nextBulletId++,
        owner: seat,
        x: bx,
        y: by,
        vx,
        vy,
        bounces: 0,
        color: tank.color,
        trail: [{ x: bx, y: by }],
      });

      // Efeitos de disparo
      fx.burst(bx, by, tank.color, 4, 120);
      env.sfx('laser', 0.85);
    }

    function resetRound(winner) {
      if (winner !== null && winner !== undefined) {
        st.wins[winner]++;
        env.sfx('score', 0.95);
        fx.banner(`${env.names[winner]} VENCEU O ROUND!`, { color: winner === 0 ? '#00f0ff' : '#ff5533' });
      }

      setUi();

      if (winner !== null && st.wins[winner] >= WIN_ROUNDS) {
        st.over = true;
        env.finish(winner, `${env.names[winner]} dominou a arena de tanques por ${st.wins[0]} × ${st.wins[1]}!`);
        return;
      }

      st.tanks[0] = createTank(0);
      st.tanks[1] = createTank(1);
      st.bullets = [];
      st.roundState = 'starting';
      st.roundTimer = 1.3;
    }

    function destroyTank(deadSeat, killerSeat) {
      const tank = st.tanks[deadSeat];
      if (!tank.alive) return;
      tank.alive = false;
      tank.hp = 0;

      // Efeito espetacular de destruição
      fx.burst(tank.x, tank.y, tank.color, 44, 430);
      fx.burst(tank.x, tank.y, '#ffffff', 20, 290);
      fx.confetti(tank.x, tank.y, 36);
      fx.ring(tank.x, tank.y, tank.color, 48);
      st.shake = 0.6;
      env.sfx('explosion', 1.0);

      st.roundState = 'exploded';
      st.roundTimer = 1.7;
      st.roundWinner = killerSeat;
    }

    function resolveTankObstacle(tank, obs) {
      const cx = clamp(tank.x, obs.x, obs.x + obs.w);
      const cy = clamp(tank.y, obs.y, obs.y + obs.h);
      const dx = tank.x - cx;
      const dy = tank.y - cy;
      const d = Math.hypot(dx, dy);
      if (d < TANK_R) {
        if (d > 0.0001) {
          tank.x = cx + (dx / d) * TANK_R;
          tank.y = cy + (dy / d) * TANK_R;
        } else {
          // Centro do tanque dentro do retângulo
          const left = tank.x - obs.x;
          const right = obs.x + obs.w - tank.x;
          const top = tank.y - obs.y;
          const bot = obs.y + obs.h - tank.y;
          const m = Math.min(left, right, top, bot);
          if (m === left) tank.x = obs.x - TANK_R;
          else if (m === right) tank.x = obs.x + obs.w + TANK_R;
          else if (m === top) tank.y = obs.y - TANK_R;
          else tank.y = obs.y + obs.h + TANK_R;
        }
      }
    }

    return {
      st: null,
      activeSeat: null,
      start() {
        st = this.st = {
          tanks: [createTank(0), createTank(1)],
          bullets: [],
          skids: [],
          nextBulletId: 1,
          wins: [0, 0],
          over: false,
          shake: 0,
          roundState: 'active', // active | exploded | starting
          roundTimer: 0,
          roundWinner: null,
        };
        setUi();
      },
      snapshot() {
        return {
          t: st.tanks.map((tank) => ({
            x: Math.round(tank.x * 10) / 10,
            y: Math.round(tank.y * 10) / 10,
            a: Math.round(tank.angle * 100) / 100,
            ta: Math.round(tank.turretAngle * 100) / 100,
            hp: tank.hp,
            al: tank.alive ? 1 : 0,
          })),
          b: st.bullets.slice(0, 16).map((bul) => [
            Math.round(bul.x), Math.round(bul.y),
            Math.round(bul.vx), Math.round(bul.vy),
            bul.owner, bul.bounces, bul.id,
          ]),
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
          // Input do convidado recebido pelo anfitrião
          const t1 = st.tanks[1];
          if (t1 && t1.alive) {
            t1.fwd = m.fwd;
            t1.turn = m.turn;
            t1.turretAngle = m.ta;
            if (m.fire) fireTank(1);
          }
        } else if (m.k === 's' && !sim()) {
          // Snapshot autoritativo do host recebido pelo guest
          if (!m.t) return;
          for (let i = 0; i < 2; i++) {
            const remote = m.t[i];
            const localT = st.tanks[i];
            localT.x = remote.x;
            localT.y = remote.y;
            localT.angle = remote.a;
            localT.turretAngle = remote.ta;
            localT.hp = remote.hp;
            localT.alive = !!remote.al;
          }
          if (m.b) {
            const existingMap = new Map(st.bullets.map((b) => [b.id, b]));
            st.bullets = m.b.map(([x, y, vx, vy, owner, bounces, id]) => {
              const prev = existingMap.get(id);
              const trail = prev ? prev.trail : [];
              trail.unshift({ x, y });
              if (trail.length > 5) trail.pop();
              return {
                id,
                x,
                y,
                vx,
                vy,
                owner,
                bounces,
                color: owner === 0 ? '#00f0ff' : '#ff5533',
                trail,
              };
            });
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
          if (pointerAim[targetSeat]) {
            pointerAim[targetSeat].down = false;
          }
        } else {
          activePointers.set(pointerId, { x, y, down, seat: targetSeat });
          pointerAim[targetSeat] = { active: true, x, y, down };
        }

        const t = st.tanks[targetSeat];
        if (t && t.alive) {
          t.turretAngle = Math.atan2(y - t.y, x - t.x);
          if (down) {
            if (sim()) {
              fireTank(targetSeat);
            } else if (targetSeat === 1) {
              env.send({ k: 'inp', fwd: t.fwd, turn: t.turn, ta: t.turretAngle, fire: 1 });
            }
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
          const t0 = st.tanks[0];
          if (t0 && t0.alive) {
            let fwd = 0;
            if (keysDown.has('w')) fwd += 1;
            if (keysDown.has('s')) fwd -= 1;
            t0.fwd = fwd;

            let turn = 0;
            if (keysDown.has('a')) turn -= 1;
            if (keysDown.has('d')) turn += 1;
            t0.turn = turn;

            if (down && k === ' ') fireTank(0);
          }

          // Player 2 (Seat 1): Setas + Enter
          const t1 = st.tanks[1];
          if (t1 && t1.alive) {
            let fwd = 0;
            if (keysDown.has('arrowup')) fwd += 1;
            if (keysDown.has('arrowdown')) fwd -= 1;
            t1.fwd = fwd;

            let turn = 0;
            if (keysDown.has('arrowleft')) turn -= 1;
            if (keysDown.has('arrowright')) turn += 1;
            t1.turn = turn;

            if (down && (k === 'enter' || k === 'shift')) fireTank(1);
          }
        } else {
          // Online: controla o próprio tanque
          const mySeat = env.seat === -1 ? 0 : env.seat;
          const t = st.tanks[mySeat];
          if (t && t.alive) {
            let fwd = 0;
            if (keysDown.has('w') || keysDown.has('arrowup')) fwd += 1;
            if (keysDown.has('s') || keysDown.has('arrowdown')) fwd -= 1;
            t.fwd = fwd;

            let turn = 0;
            if (keysDown.has('a') || keysDown.has('arrowleft')) turn -= 1;
            if (keysDown.has('d') || keysDown.has('arrowright')) turn += 1;
            t.turn = turn;

            const shouldFire = down && (k === ' ' || k === 'enter');
            if (shouldFire) {
              if (sim()) fireTank(mySeat);
              else if (mySeat === 1) env.send({ k: 'inp', fwd: t.fwd, turn: t.turn, ta: t.turretAngle, fire: 1 });
            }

            if (mySeat === 1 && !env.isHost && sendInp()) {
              env.send({ k: 'inp', fwd: t.fwd, turn: t.turn, ta: t.turretAngle, fire: 0 });
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

        // Animação de recoil e cooldown dos canhões
        for (let i = 0; i < 2; i++) {
          const t = st.tanks[i];
          if (t.cooldown > 0) t.cooldown = Math.max(0, t.cooldown - dt);
          if (t.recoil > 0) t.recoil = Math.max(0, t.recoil - dt * 18);

          // Atualização contínua de rotação da torreta se houver ponteiro ativo
          const aim = pointerAim[i];
          if (aim && aim.active) {
            t.turretAngle = Math.atan2(aim.y - t.y, aim.x - t.x);
          }
        }

        // Transmissão periódica contínua de input do Guest para o Host
        if (!env.isLocal && !env.isHost && env.seat === 1 && sendInp()) {
          const t1 = st.tanks[1];
          if (t1) {
            env.send({ k: 'inp', fwd: t1.fwd, turn: t1.turn, ta: t1.turretAngle, fire: 0 });
          }
        }

        // Simulação física autoritativa
        if (sim()) {
          // Atualiza tanques
          for (let i = 0; i < 2; i++) {
            const t = st.tanks[i];
            if (!t.alive) continue;

            // Rotação do chassi
            if (t.turn !== 0) {
              t.angle += t.turn * ROT_SPEED * dt;
              // Se não estiver com mira do mouse ativa, torreta acompanha chassi
              const aim = pointerAim[i];
              if (!aim || !aim.active) {
                t.turretAngle += t.turn * ROT_SPEED * dt;
              }
            }

            // Movimento linear (Frente / Ré)
            if (t.fwd !== 0) {
              const spd = t.fwd > 0 ? MOVE_SPEED : REV_SPEED;
              t.vx = Math.cos(t.angle) * t.fwd * spd;
              t.vy = Math.sin(t.angle) * t.fwd * spd;
              t.x += t.vx * dt;
              t.y += t.vy * dt;

              // Deixa marcas discretas de esteira
              if (Math.random() < 0.28 && st.skids.length < 90) {
                st.skids.push({ x: t.x, y: t.y, a: t.angle, life: 3.5 });
              }
            } else {
              t.vx = 0;
              t.vy = 0;
            }

            // Colisão com bordas da arena
            t.x = clamp(t.x, L + TANK_R, R - TANK_R);
            t.y = clamp(t.y, T + TANK_R, B - TANK_R);

            // Colisão geométrica robusta com obstáculos retangulares
            for (const obs of OBSTACLES) {
              resolveTankObstacle(t, obs);
            }
          }

          // Separação geométrica entre os tanques
          if (st.tanks[0].alive && st.tanks[1].alive) {
            const t0 = st.tanks[0];
            const t1 = st.tanks[1];
            const d = dist(t0.x, t0.y, t1.x, t1.y);
            if (d < TANK_R * 2 && d > 0.001) {
              const overlap = (TANK_R * 2 - d) * 0.5;
              const nx = (t1.x - t0.x) / d;
              const ny = (t1.y - t0.y) / d;
              t0.x -= nx * overlap;
              t0.y -= ny * overlap;
              t1.x += nx * overlap;
              t1.y += ny * overlap;
            }
          }

          // Atualiza Projéteis Laser & Ricochete
          for (let i = st.bullets.length - 1; i >= 0; i--) {
            const b = st.bullets[i];
            b.x += b.vx * dt;
            b.y += b.vy * dt;

            // Rastro visual
            b.trail.unshift({ x: b.x, y: b.y });
            if (b.trail.length > 5) b.trail.pop();

            let bounced = false;

            // 1. Ricochete nas 4 bordas externas da arena
            if (b.x <= L + LASER_R && b.vx < 0) {
              b.x = L + LASER_R; b.vx = Math.abs(b.vx); bounced = true;
            } else if (b.x >= R - LASER_R && b.vx > 0) {
              b.x = R - LASER_R; b.vx = -Math.abs(b.vx); bounced = true;
            }
            if (b.y <= T + LASER_R && b.vy < 0) {
              b.y = T + LASER_R; b.vy = Math.abs(b.vy); bounced = true;
            } else if (b.y >= B - LASER_R && b.vy > 0) {
              b.y = B - LASER_R; b.vy = -Math.abs(b.vy); bounced = true;
            }

            // 2. Ricochete nos obstáculos internos
            if (!bounced) {
              for (const obs of OBSTACLES) {
                if (b.x >= obs.x - LASER_R && b.x <= obs.x + obs.w + LASER_R &&
                    b.y >= obs.y - LASER_R && b.y <= obs.y + obs.h + LASER_R) {
                  const dLeft = Math.abs(b.x - obs.x);
                  const dRight = Math.abs(b.x - (obs.x + obs.w));
                  const dTop = Math.abs(b.y - obs.y);
                  const dBot = Math.abs(b.y - (obs.y + obs.h));
                  const min = Math.min(dLeft, dRight, dTop, dBot);

                  if (min === dLeft && b.vx > 0) {
                    b.vx = -Math.abs(b.vx);
                    b.x = obs.x - LASER_R;
                  } else if (min === dRight && b.vx < 0) {
                    b.vx = Math.abs(b.vx);
                    b.x = obs.x + obs.w + LASER_R;
                  } else if (min === dTop && b.vy > 0) {
                    b.vy = -Math.abs(b.vy);
                    b.y = obs.y - LASER_R;
                  } else if (min === dBot && b.vy < 0) {
                    b.vy = Math.abs(b.vy);
                    b.y = obs.y + obs.h + LASER_R;
                  } else {
                    // Fallback
                    b.vx = -b.vx;
                    b.vy = -b.vy;
                  }
                  bounced = true;
                  break;
                }
              }
            }

            if (bounced) {
              b.bounces++;
              fx.burst(b.x, b.y, b.color, 6, 140);
              env.sfx('puck_wall', 0.65);

              // Se estourou limite de ricochetes, o laser se dissipa
              if (b.bounces > MAX_BOUNCES) {
                st.bullets.splice(i, 1);
                continue;
              }
            }

            // 3. Checagem de Acerto em Tanques
            let hit = false;
            for (let tIdx = 0; tIdx < 2; tIdx++) {
              const targetTank = st.tanks[tIdx];
              if (!targetTank.alive) continue;

              // O laser só pode atingir o próprio atirador após ricochetear
              if (b.owner === tIdx && b.bounces === 0) continue;

              if (dist(b.x, b.y, targetTank.x, targetTank.y) < TANK_R + LASER_R) {
                hit = true;
                targetTank.hp--;
                setUi();

                if (targetTank.hp === 1) {
                  // Escudo estilhaçado!
                  fx.burst(targetTank.x, targetTank.y, targetTank.color, 18, 260);
                  fx.ring(targetTank.x, targetTank.y, '#ffffff', 30);
                  st.shake = 0.35;
                  env.sfx('bumper', 0.85);
                  env.sfx('cushion', 0.85);
                } else if (targetTank.hp <= 0) {
                  // Casco explodido! Fim de round
                  destroyTank(tIdx, 1 - tIdx);
                }

                st.bullets.splice(i, 1);
                break;
              }
            }

            if (hit) continue;
          }

          // Atualiza marcas de esteira
          for (let k = st.skids.length - 1; k >= 0; k--) {
            st.skids[k].life -= dt;
            if (st.skids[k].life <= 0) st.skids.splice(k, 1);
          }

          // Envia snapshots de rede para clientes
          if (!env.isLocal && sendSnap()) {
            env.send({ k: 's', ...this.snapshot() });
          }
        }
      },
      draw(ctx) {
        if (!st) return;

        ctx.save();

        // Screen shake com atenuação
        if (st.shake > 0) {
          const sx = (Math.random() - 0.5) * 16 * st.shake;
          const sy = (Math.random() - 0.5) * 16 * st.shake;
          ctx.translate(sx, sy);
        }

        const now = performance.now() * 0.001;

        // Fundo metálico escuro com grid militar (Tactical Obsidian Proving Ground)
        const arenaGrad = ctx.createRadialGradient(env.W / 2, env.H / 2, 80, env.W / 2, env.H / 2, env.W * 0.7);
        arenaGrad.addColorStop(0, '#101624');
        arenaGrad.addColorStop(1, '#080a11');
        ctx.fillStyle = arenaGrad;
        ctx.fillRect(0, 0, env.W, env.H);

        // Grade tática militar com linhas sutis
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.035)';
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

        // Marcas de esteira com profundidade (Tread Skids)
        for (const sk of st.skids) {
          ctx.save();
          ctx.translate(sk.x, sk.y);
          ctx.rotate(sk.a);
          const alpha = Math.min(0.65, sk.life / 2.5);
          ctx.fillStyle = `rgba(0, 0, 0, ${alpha * 0.5})`;
          ctx.fillRect(-10, -14, 20, 5);
          ctx.fillRect(-10, 9, 20, 5);

          // Ranhuras de dente da esteira
          ctx.fillStyle = `rgba(255, 255, 255, ${alpha * 0.08})`;
          for (let tx = -8; tx <= 8; tx += 4) {
            ctx.fillRect(tx, -14, 2, 5);
            ctx.fillRect(tx, 9, 2, 5);
          }
          ctx.restore();
        }

        // Bunkers e Obstáculos Militares com Textura de Aço Blindado e Faixas de Aviso
        for (const obs of OBSTACLES) {
          // Sombra projetada do bunker
          ctx.fillStyle = 'rgba(0, 0, 0, 0.55)';
          roundRect(ctx, obs.x + 4, obs.y + 6, obs.w, obs.h, 6);
          ctx.fill();

          // Corpo de aço blindado
          const steelGrad = ctx.createLinearGradient(obs.x, obs.y, obs.x + obs.w, obs.y + obs.h);
          steelGrad.addColorStop(0, '#2a3547');
          steelGrad.addColorStop(0.3, '#1c2536');
          steelGrad.addColorStop(0.7, '#131b28');
          steelGrad.addColorStop(1, '#0e1520');
          ctx.fillStyle = steelGrad;
          roundRect(ctx, obs.x, obs.y, obs.w, obs.h, 6);
          ctx.fill();

          // Borda chanfrada de metal com reflexo no topo e sombra na base
          ctx.strokeStyle = 'rgba(255, 255, 255, 0.2)';
          ctx.lineWidth = 1.2;
          roundRect(ctx, obs.x, obs.y, obs.w, obs.h, 6);
          ctx.stroke();

          // Faixas diagonais de perigo/aviso tático (Hazard Stripes)
          if (obs.w >= 40 && obs.h >= 40) {
            ctx.save();
            ctx.beginPath();
            roundRect(ctx, obs.x + 3, obs.y + 3, obs.w - 6, obs.h - 6, 4);
            ctx.clip();

            // Placa central rebaixada
            ctx.fillStyle = '#0f1724';
            ctx.fillRect(obs.x + 3, obs.y + 3, obs.w - 6, obs.h - 6);

            // Faixas amarelas e pretas em ângulo 45°
            ctx.strokeStyle = 'rgba(245, 158, 11, 0.35)';
            ctx.lineWidth = 6;
            const stripeStep = 16;
            for (let sx = -obs.h; sx <= obs.w + obs.h; sx += stripeStep) {
              ctx.beginPath();
              ctx.moveTo(obs.x + sx, obs.y);
              ctx.lineTo(obs.x + sx + obs.h, obs.y + obs.h);
              ctx.stroke();
            }

            // Rebites nos 4 cantos
            ctx.fillStyle = '#94a3b8';
            const rivets = [
              [obs.x + 6, obs.y + 6], [obs.x + obs.w - 6, obs.y + 6],
              [obs.x + 6, obs.y + obs.h - 6], [obs.x + obs.w - 6, obs.y + obs.h - 6]
            ];
            for (const [rx, ry] of rivets) {
              ctx.beginPath();
              ctx.arc(rx, ry, 1.8, 0, Math.PI * 2);
              ctx.fill();
            }
            ctx.restore();
          } else {
            // Obstáculo estreito com ranhura central de metal reforçado
            ctx.strokeStyle = 'rgba(0, 240, 255, 0.25)';
            ctx.lineWidth = 1.5;
            ctx.strokeRect(obs.x + 2, obs.y + 2, obs.w - 4, obs.h - 4);
          }
        }

        // Borda perimetral de defesa eletrificada da arena
        ctx.strokeStyle = 'rgba(255, 85, 51, 0.25)';
        ctx.lineWidth = 6;
        roundRect(ctx, L, T, R - L, B - T, 16);
        ctx.stroke();

        ctx.strokeStyle = '#ff5533';
        ctx.lineWidth = 2;
        roundRect(ctx, L, T, R - L, B - T, 16);
        ctx.stroke();

        // Linha divisória sutil no modo local
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

        // Desenha Projéteis Laser com Iluminação e Rastro Intenso
        for (const b of st.bullets) {
          // Rastro contínuo de energia
          if (b.trail && b.trail.length > 1) {
            ctx.beginPath();
            ctx.moveTo(b.x, b.y);
            for (const pt of b.trail) {
              ctx.lineTo(pt.x, pt.y);
            }
            ctx.strokeStyle = b.color;
            ctx.lineWidth = 4;
            ctx.globalAlpha = 0.35;
            ctx.stroke();
            ctx.globalAlpha = 1;
          }

          // Núcleo brilhante e feixe de plasma concentrado
          ctx.save();
          ctx.translate(b.x, b.y);
          const bAng = Math.atan2(b.vy, b.vx);
          ctx.rotate(bAng);

          // Corona de iluminação volumétrica ao redor do projétil
          const boltBloom = ctx.createRadialGradient(0, 0, 1, 0, 0, 14);
          boltBloom.addColorStop(0, b.color);
          boltBloom.addColorStop(1, 'rgba(0,0,0,0)');
          ctx.globalAlpha = 0.45;
          ctx.fillStyle = boltBloom;
          ctx.beginPath();
          ctx.arc(0, 0, 14, 0, Math.PI * 2);
          ctx.fill();

          // Feixe externo neon
          ctx.globalAlpha = 0.9;
          ctx.fillStyle = b.color;
          roundRect(ctx, -14, -4, 28, 8, 4);
          ctx.fill();

          // Núcleo superaquecido branco
          ctx.globalAlpha = 1;
          ctx.fillStyle = '#ffffff';
          roundRect(ctx, -10, -2, 20, 4, 2);
          ctx.fill();
          ctx.restore();
        }

        // Desenha Tanques de Combate Blindados
        for (let i = 0; i < 2; i++) {
          const t = st.tanks[i];
          if (!t.alive) continue;

          ctx.save();
          ctx.translate(t.x, t.y);

          // 1. Escudo de Energia Eletromagnético (quando HP === 2)
          if (t.hp === 2) {
            const shieldPulse = 1 + 0.06 * Math.sin(now * 6 + i);
            const sR = (TANK_R + 7) * shieldPulse;

            // Halo suave
            const shGrad = ctx.createRadialGradient(0, 0, sR * 0.6, 0, 0, sR);
            shGrad.addColorStop(0, 'rgba(0,0,0,0)');
            shGrad.addColorStop(0.7, t.glow);
            shGrad.addColorStop(1, t.color);

            ctx.beginPath();
            ctx.arc(0, 0, sR, 0, Math.PI * 2);
            ctx.fillStyle = shGrad;
            ctx.globalAlpha = 0.22;
            ctx.fill();

            // Anel do escudo com feixes hexagonais
            ctx.globalAlpha = 0.85;
            ctx.strokeStyle = t.color;
            ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.arc(0, 0, sR, 0, Math.PI * 2);
            ctx.stroke();

            // Padrão de anéis de energia
            ctx.strokeStyle = 'rgba(255, 255, 255, 0.4)';
            ctx.lineWidth = 1;
            ctx.setLineDash([8, 12]);
            ctx.lineDashOffset = now * 20;
            ctx.beginPath();
            ctx.arc(0, 0, sR - 2, 0, Math.PI * 2);
            ctx.stroke();
            ctx.setLineDash([]);
            ctx.globalAlpha = 1;
          }

          // 2. Fumaça e faíscas de dano crítico no casco (quando HP === 1)
          if (t.hp === 1 && Math.random() < 0.4) {
            fx.burst(t.x + (Math.random() - 0.5) * 16, t.y + (Math.random() - 0.5) * 16, '#64748b', 1, 35);
            if (Math.random() < 0.25) {
              fx.burst(t.x, t.y, '#f59e0b', 2, 80);
            }
          }

          // 3. Sombra do tanque no solo
          ctx.fillStyle = 'rgba(0, 0, 0, 0.4)';
          ctx.beginPath();
          ctx.ellipse(3, 5, TANK_R + 3, TANK_R - 2, t.angle, 0, Math.PI * 2);
          ctx.fill();

          // 4. Chassi do Tanque (rotaciona com angle)
          ctx.save();
          ctx.rotate(t.angle);

          // Esteiras mecânicas blindadas (Treads)
          const treadW = 36;
          const treadH = 7.5;
          const treadX = -treadW / 2;

          for (const ty of [-15, 7.5]) {
            // Base da esteira
            ctx.fillStyle = '#0f172a';
            roundRect(ctx, treadX, ty, treadW, treadH, 3);
            ctx.fill();

            // Carcaça externa da esteira
            ctx.strokeStyle = '#334155';
            ctx.lineWidth = 1;
            roundRect(ctx, treadX, ty, treadW, treadH, 3);
            ctx.stroke();

            // Sapatas metálicas da esteira (Track Links)
            ctx.fillStyle = '#475569';
            for (let lx = treadX + 3; lx < treadX + treadW - 2; lx += 4) {
              ctx.fillRect(lx, ty, 2, treadH);
            }

            // Rodas guias e roletes no interior da esteira
            ctx.fillStyle = '#1e293b';
            for (const rx of [-10, 0, 10]) {
              ctx.beginPath();
              ctx.arc(rx, ty + treadH / 2, 2.2, 0, Math.PI * 2);
              ctx.fill();
            }
          }

          // Casco principal angular blindado (Sloped Armor Hull)
          const hullW = 28;
          const hullH = 21;
          const hullGrad = ctx.createLinearGradient(0, -hullH / 2, 0, hullH / 2);
          hullGrad.addColorStop(0, '#334155');
          hullGrad.addColorStop(0.3, '#1e293b');
          hullGrad.addColorStop(0.7, '#0f172a');
          hullGrad.addColorStop(1, '#090d16');
          ctx.fillStyle = hullGrad;

          // Geometria angular com chanfro frontal para efeito militar
          ctx.beginPath();
          ctx.moveTo(-hullW / 2, -hullH / 2 + 3);
          ctx.lineTo(hullW / 2 - 4, -hullH / 2 + 1);
          ctx.lineTo(hullW / 2, 0);
          ctx.lineTo(hullW / 2 - 4, hullH / 2 - 1);
          ctx.lineTo(-hullW / 2, hullH / 2 - 3);
          ctx.closePath();
          ctx.fill();

          // Borda chanfrada de aço com reflexo de luz
          ctx.strokeStyle = 'rgba(255, 255, 255, 0.25)';
          ctx.lineWidth = 1.2;
          ctx.stroke();

          // Faixa de identificação neon do time no casco
          ctx.fillStyle = t.color;
          ctx.fillRect(-10, -hullH / 2 + 4, 18, 2.5);
          ctx.fillRect(-10, hullH / 2 - 6.5, 18, 2.5);

          // Grade de ventilação do motor traseiro
          ctx.fillStyle = '#090d16';
          ctx.fillRect(-hullW / 2 + 2, -5, 4, 10);
          ctx.fillStyle = '#475569';
          for (let gy = -4; gy <= 4; gy += 2) {
            ctx.fillRect(-hullW / 2 + 2.5, gy, 3, 1);
          }

          ctx.restore();

          // 5. Torreta e Canhão Laser (rotaciona com turretAngle)
          ctx.save();
          ctx.rotate(t.turretAngle);

          // Canhão com animação de recoil elástico ao atirar
          const barrelRecoil = t.recoil || 0;
          const barrelLen = 19;
          const barrelY = -3;
          const barrelH = 6;
          const barrelX = 5 - barrelRecoil;

          // Cano de aço reforçado
          const barrelGrad = ctx.createLinearGradient(0, barrelY, 0, barrelY + barrelH);
          barrelGrad.addColorStop(0, '#64748b');
          barrelGrad.addColorStop(0.5, '#334155');
          barrelGrad.addColorStop(1, '#1e293b');
          ctx.fillStyle = barrelGrad;
          roundRect(ctx, barrelX, barrelY, barrelLen, barrelH, 2);
          ctx.fill();

          // Freio de boca cilíndrico na ponta do canhão (Muzzle Brake)
          ctx.fillStyle = t.color;
          roundRect(ctx, barrelX + barrelLen - 3, barrelY - 1, 4.5, barrelH + 2, 1.5);
          ctx.fill();

          // Efeito de Muzzle Flash ao disparar
          if (barrelRecoil > 4.5) {
            const flashX = barrelX + barrelLen + 4;
            ctx.fillStyle = '#ffffff';
            ctx.beginPath();
            ctx.arc(flashX, 0, 5, 0, Math.PI * 2);
            ctx.fill();

            // Estrela de plasma
            ctx.fillStyle = t.color;
            ctx.beginPath();
            ctx.moveTo(flashX + 10, 0);
            ctx.lineTo(flashX + 2, -4);
            ctx.lineTo(flashX, -10);
            ctx.lineTo(flashX - 2, -4);
            ctx.lineTo(flashX - 6, 0);
            ctx.lineTo(flashX - 2, 4);
            ctx.lineTo(flashX, 10);
            ctx.lineTo(flashX + 2, 4);
            ctx.closePath();
            ctx.fill();
          }

          // Cúpula central da torreta com anel e escotilha
          const turR = 9;
          const turGrad = ctx.createRadialGradient(-3, -3, 2, 0, 0, turR);
          turGrad.addColorStop(0, '#ffffff');
          turGrad.addColorStop(0.25, shade(t.color, 0.3));
          turGrad.addColorStop(0.75, t.color);
          turGrad.addColorStop(1, shade(t.color, -0.45));

          ctx.beginPath();
          ctx.arc(0, 0, turR, 0, Math.PI * 2);
          ctx.fillStyle = turGrad;
          ctx.fill();
          ctx.strokeStyle = '#0f172a';
          ctx.lineWidth = 1.5;
          ctx.stroke();

          // Escotilha do comandante no topo da torre
          ctx.fillStyle = '#1e293b';
          ctx.beginPath();
          ctx.arc(-2, -2, 3.5, 0, Math.PI * 2);
          ctx.fill();
          ctx.strokeStyle = '#475569';
          ctx.lineWidth = 1;
          ctx.stroke();

          ctx.restore();

          // 6. Placa de apelido e status do tanque
          ctx.save();
          ctx.font = '800 11px system-ui, -apple-system, sans-serif';
          ctx.textAlign = 'center';
          const hpTag = t.hp === 2 ? 'SHIELD' : t.hp === 1 ? 'HULL CRITICAL' : 'DEAD';
          const tagText = `${env.names[i]} · ${hpTag}`;
          const tagW = ctx.measureText(tagText).width + 16;
          const tagH = 18;
          const tagY = -28;

          ctx.fillStyle = 'rgba(10, 14, 24, 0.78)';
          roundRect(ctx, -tagW / 2, tagY - tagH / 2, tagW, tagH, 9);
          ctx.fill();
          ctx.strokeStyle = t.color;
          ctx.lineWidth = 1;
          roundRect(ctx, -tagW / 2, tagY - tagH / 2, tagW, tagH, 9);
          ctx.stroke();

          ctx.fillStyle = '#f8fafc';
          ctx.fillText(tagText, 0, tagY + 3.8);
          ctx.restore();

          ctx.restore();
        }

        // Desenha efeitos visuais de partículas, banners e confetes
        fx.draw(ctx, env.W, env.H);

        // Mensagem de início de rodada
        if (st.roundState === 'starting') {
          ctx.fillStyle = 'rgba(0, 0, 0, 0.45)';
          ctx.fillRect(0, 0, env.W, env.H);
          ctx.font = '900 38px system-ui';
          ctx.fillStyle = '#f8fafc';
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillText(`RODADA ${st.wins[0] + st.wins[1] + 1} — PREPARE-SE!`, env.W / 2, env.H / 2);
        }

        ctx.restore();
      },
    };
  },
};
