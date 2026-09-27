// Boliche: 10 frames com regras e pontuação oficial PBA/USBC (cálculo real
// de bônus de Strike e Spare, 3 arremessos no 10º frame se strike/spare).
// Física realista com ricochete em cadeia dos pinos e efeito de curva (hook).
// Renderização 3D real via Three.js (com fallback 2D).
import { stepBall, collideBalls, AimControl, drawAim, throttler, clamp, drawFrame, Trail, Fx, shade } from '../engine.js';

const FRAMES = 10;
const BALL_R = 12;
const PIN_R = 8;
const LANE_TOP = 168;
const LANE_BOT = 360;
const LANE_CY = (LANE_TOP + LANE_BOT) / 2;

function pinSpots(W) {
  const spots = [];
  const bx = W - 210;
  const gap = 30;
  for (let row = 0; row < 4; row++) {
    for (let i = 0; i <= row; i++) {
      spots.push([bx + row * gap * 0.9, LANE_CY + (i - row / 2) * gap]);
    }
  }
  return spots;
}

// Cálculo oficial de pontuação de boliche (USBC / PBA)
export function computeBowlingScore(frames) {
  const flat = [];
  for (let f = 0; f < frames.length; f++) {
    for (let r = 0; r < frames[f].length; r++) {
      flat.push(frames[f][r]);
    }
  }

  let rollIdx = 0;
  let running = 0;
  const frameTotals = [];

  for (let f = 0; f < 10; f++) {
    if (f >= frames.length) break;
    const fr = frames[f];

    if (f < 9) {
      if (fr[0] === 10) { // Strike
        if (flat.length > rollIdx + 2) {
          running += 10 + flat[rollIdx + 1] + flat[rollIdx + 2];
          frameTotals.push(running);
        } else {
          frameTotals.push(null);
        }
        rollIdx += 1;
      } else if (fr.length >= 2) {
        if (fr[0] + fr[1] === 10) { // Spare
          if (flat.length > rollIdx + 2) {
            running += 10 + flat[rollIdx + 2];
            frameTotals.push(running);
          } else {
            frameTotals.push(null);
          }
        } else { // Aberto
          running += fr[0] + fr[1];
          frameTotals.push(running);
        }
        rollIdx += fr.length;
      } else {
        frameTotals.push(null);
        rollIdx += fr.length;
      }
    } else { // 10º Frame
      const sum = fr.reduce((a, b) => a + b, 0);
      const isComplete = (fr.length === 2 && fr[0] + fr[1] < 10) || fr.length === 3;
      running += sum;
      frameTotals.push(isComplete ? running : null);
    }
  }

  // Pontuação cumulativa total conhecida até o momento
  let totalKnown = 0;
  let rIdx = 0;
  for (let f = 0; f < frames.length && f < 10; f++) {
    const fr = frames[f];
    if (f < 9) {
      if (fr[0] === 10) {
        const b1 = flat[rIdx + 1] ?? 0;
        const b2 = flat[rIdx + 2] ?? 0;
        totalKnown += 10 + b1 + b2;
        rIdx += 1;
      } else if (fr.length >= 2 && fr[0] + fr[1] === 10) {
        const b = flat[rIdx + 2] ?? 0;
        totalKnown += 10 + b;
        rIdx += fr.length;
      } else {
        totalKnown += fr.reduce((a, b) => a + b, 0);
        rIdx += fr.length;
      }
    } else {
      totalKnown += fr.reduce((a, b) => a + b, 0);
    }
  }

  return { frameTotals, total: totalKnown };
}

export default {
  id: 'boliche',
  name: 'Boliche',
  icon: '🎳',
  desc: `10 frames oficiais, cálculo real de bônus, hook e ricochete de pinos.`,
  local: true,
  create(env) {
    let st = null;
    let aim = null;
    const sendFrame = throttler(40);
    const controls = (seat) => env.isLocal || env.seat === seat;
    const trail = new Trail(10);
    const fx = new Fx();
    const fallAt = new Map();

    // ---------- 3D ----------
    let T3 = null;
    let gl = null;
    let drag = null;
    let aim3d = { angle: 0, power: 0, spin: 0 };
    let lastDraw = 0;
    let destroyed = false;
    const tableEl = typeof document !== 'undefined' ? document.getElementById('table') : null;

    function myThrow() {
      return st && !st.over && st.phase === 'aim' && controls(st.turn);
    }

    async function init3d() {
      if (typeof window === 'undefined' || typeof document === 'undefined') return;
      let mod;
      try {
        mod = await import('../vendor/three.module.js');
      } catch (_) {
        return;
      }
      if (destroyed) return;
      try {
        const renderer = new mod.WebGLRenderer({ antialias: true });
        renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
        renderer.setSize(968, 528, false);
        renderer.shadowMap.enabled = true;
        renderer.shadowMap.type = mod.PCFSoftShadowMap;
        renderer.domElement.className = 'gl-layer';
        const wrap = document.getElementById('table-wrap');
        if (wrap && tableEl) wrap.insertBefore(renderer.domElement, tableEl);
        if (tableEl) tableEl.style.background = 'transparent';
        T3 = mod;
        gl = buildScene(mod, renderer);
      } catch (err) {
        console.error('WebGL indisponível, usando visão 2D', err);
        T3 = null;
        gl = null;
        if (tableEl) tableEl.style.background = '';
      }
      setUi();
    }

    function laneTexture(mod) {
      if (typeof document === 'undefined') return null;
      const c = document.createElement('canvas');
      c.width = 1024;
      c.height = 256;
      const g = c.getContext('2d');
      const grad = g.createLinearGradient(0, 0, 0, 256);
      grad.addColorStop(0, '#caa068');
      grad.addColorStop(0.5, '#e3bb86');
      grad.addColorStop(1, '#caa068');
      g.fillStyle = grad;
      g.fillRect(0, 0, 1024, 256);
      // Tábuas
      g.strokeStyle = 'rgba(120,80,40,0.4)';
      g.lineWidth = 2;
      for (let i = 1; i < 14; i++) {
        const y = (256 * i) / 14;
        g.beginPath(); g.moveTo(0, y); g.lineTo(1024, y); g.stroke();
      }
      // Verniz e brilho
      const sheen = g.createLinearGradient(0, 0, 1024, 0);
      sheen.addColorStop(0, 'rgba(255,255,255,0.18)');
      sheen.addColorStop(0.35, 'rgba(255,255,255,0)');
      sheen.addColorStop(0.7, 'rgba(255,255,255,0.14)');
      sheen.addColorStop(1, 'rgba(255,255,255,0)');
      g.fillStyle = sheen;
      g.fillRect(0, 0, 1024, 256);
      // Linha de falta
      g.fillStyle = 'rgba(70,35,20,0.7)';
      g.fillRect(135, 0, 6, 256);
      // Setas direcionais
      g.fillStyle = 'rgba(140,70,45,0.85)';
      for (let i = 0; i < 5; i++) {
        const y = 42 + i * 43;
        const x = 380 + (i === 2 ? 30 : 0);
        g.beginPath();
        g.moveTo(x + 16, y);
        g.lineTo(x - 8, y - 8);
        g.lineTo(x - 8, y + 8);
        g.closePath();
        g.fill();
      }
      const tex = new mod.CanvasTexture(c);
      tex.anisotropy = 4;
      tex.colorSpace = mod.SRGBColorSpace;
      return tex;
    }

    function makePin(mod) {
      const pts = [];
      const prof = [
        [0.1, 0], [3.6, 0.4], [6.4, 3], [7.9, 10], [7.4, 16],
        [4.6, 22], [3.5, 26], [3.9, 29], [4.6, 32], [3.6, 36], [0.1, 38],
      ];
      for (const [r, y] of prof) pts.push(new mod.Vector2(r, y));
      const geo = new mod.LatheGeometry(pts, 24);
      const mat = new mod.MeshStandardMaterial({ color: 0xf4efe2, roughness: 0.35, metalness: 0.05 });
      const body = new mod.Mesh(geo, mat);
      body.castShadow = true;
      const group = new mod.Group();
      group.add(body);
      for (const y of [24.4, 27.6]) {
        const ring = new mod.Mesh(
          new mod.CylinderGeometry(3.72, 3.72, 1.3, 20),
          new mod.MeshStandardMaterial({ color: 0xd8342c, roughness: 0.4 })
        );
        ring.position.y = y;
        group.add(ring);
      }
      return group;
    }

    function buildScene(mod, renderer) {
      const scene = new mod.Scene();
      scene.background = new mod.Color(0x0e0c18);
      scene.fog = new mod.Fog(0x0e0c18, 700, 1600);

      const camera = new mod.PerspectiveCamera(50, 968 / 528, 1, 2200);

      scene.add(new mod.AmbientLight(0xf0e6d8, 0.55));
      const hemi = new mod.HemisphereLight(0xbcc7ff, 0x30241a, 0.35);
      scene.add(hemi);
      const key = new mod.DirectionalLight(0xfff2dd, 1.6);
      key.position.set(430, 420, 260);
      key.castShadow = true;
      key.shadow.mapSize.set(1024, 1024);
      key.shadow.camera.left = -520;
      key.shadow.camera.right = 520;
      key.shadow.camera.top = 300;
      key.shadow.camera.bottom = -300;
      key.shadow.camera.far = 1200;
      key.target.position.set(484, 0, 0);
      scene.add(key, key.target);
      const deck = new mod.PointLight(0xffb570, 2.2, 650, 1);
      deck.position.set(800, 130, 0);
      scene.add(deck);

      // Pista
      const laneLen = 968 - 128;
      const laneW = LANE_BOT - LANE_TOP;
      const laneTex = laneTexture(mod);
      const laneMat = new mod.MeshStandardMaterial({ map: laneTex, roughness: 0.28, metalness: 0.05 });
      const laneMesh = new mod.Mesh(new mod.PlaneGeometry(laneLen, laneW), laneMat);
      laneMesh.rotation.x = -Math.PI / 2;
      laneMesh.position.set(64 + laneLen / 2, 0, 0);
      laneMesh.receiveShadow = true;
      scene.add(laneMesh);

      // Canaletas
      const gutMat = new mod.MeshStandardMaterial({ color: 0x141018, roughness: 0.85 });
      for (const sign of [-1, 1]) {
        const gut = new mod.Mesh(new mod.BoxGeometry(laneLen, 8, 28), gutMat);
        gut.position.set(64 + laneLen / 2, -4, sign * (laneW / 2 + 14));
        scene.add(gut);
      }

      // Pinos
      const spots = pinSpots(968);
      const pins = spots.map(([x, y]) => {
        const p = makePin(mod);
        p.position.set(x, 0, -(y - LANE_CY));
        scene.add(p);
        return p;
      });

      // Bola com brilho profundo
      const ball = new mod.Mesh(
        new mod.SphereGeometry(BALL_R, 32, 24),
        new mod.MeshPhysicalMaterial({ color: 0x2438a6, roughness: 0.15, clearcoat: 1, clearcoatRoughness: 0.08 })
      );
      ball.castShadow = true;
      scene.add(ball);

      // Seta de mira
      const arrow = new mod.Group();
      const shaftMat = new mod.MeshBasicMaterial({ color: 0x7cff9a, transparent: true, opacity: 0.85 });
      const shaft = new mod.Mesh(new mod.CylinderGeometry(1.6, 1.6, 1, 8), shaftMat);
      shaft.rotation.z = -Math.PI / 2;
      const head = new mod.Mesh(new mod.ConeGeometry(5, 14, 12), shaftMat.clone());
      head.rotation.z = -Math.PI / 2;
      arrow.add(shaft, head);
      arrow.visible = false;
      scene.add(arrow);

      return { renderer, scene, camera, pins, ball, arrow, shaft, head, camX: -40, rollAngle: 0 };
    }

    function render3d(now) {
      const dt = Math.min(0.05, (now - lastDraw) / 1000) || 0.016;
      const b = st.ball;
      const z = (y2) => -(y2 - LANE_CY);

      // Bola
      gl.ball.position.set(b.x, BALL_R, z(b.y));
      gl.rollAngle -= (Math.hypot(b.vx, b.vy) * dt) / BALL_R;
      gl.ball.rotation.z = gl.rollAngle;

      // Pinos
      const now2 = performance.now();
      for (let i = 0; i < st.pins.length; i++) {
        const p = st.pins[i];
        const mesh = gl.pins[i];
        const falling = fallAt.get(i);
        if (p.up) {
          mesh.visible = true;
          mesh.position.set(p.x, 0, z(p.y));
          mesh.rotation.set(0, 0, 0);
          mesh.traverse((o) => { if (o.isMesh) o.material.opacity = 1; });
        } else if (falling) {
          const k = Math.min(1, (now2 - falling) / 600);
          if (k >= 1) { fallAt.delete(i); mesh.visible = false; continue; }
          mesh.visible = true;
          const dx = p.x - p.ox || 0.4;
          const dz = z(p.y) - z(p.oy);
          const len = Math.hypot(dx, dz) || 1;
          mesh.position.set(p.x, 0, z(p.y));
          const axis = new T3.Vector3(dz / len, 0, -dx / len);
          mesh.setRotationFromAxisAngle(axis, k * Math.PI * 0.52);
          mesh.traverse((o) => {
            if (o.isMesh) { o.material.transparent = true; o.material.opacity = 1 - k * 0.8; }
          });
        } else {
          mesh.visible = false;
        }
      }

      // Seta de mira
      const show = myThrow() && (T3 !== null);
      gl.arrow.visible = show;
      if (show) {
        const len = 60 + aim3d.power * 190;
        const hue = 0.33 - aim3d.power * 0.33;
        gl.shaft.material.color.setHSL(hue, 0.9, 0.6);
        gl.head.material.color.setHSL(hue, 0.9, 0.6);
        gl.shaft.scale.y = len;
        gl.shaft.position.set(len / 2, 0, 0);
        gl.head.position.set(len + 6, 0, 0);
        gl.arrow.position.set(b.x, 6, z(b.y));
        gl.arrow.rotation.y = aim3d.angle;
      }

      // Câmera
      const targetX = st.phase === 'rolling' || st.phase === 'watch' ? b.x - 190 : b.x - 150;
      gl.camX += (targetX - gl.camX) * Math.min(1, dt * 4);
      const camZ = z(b.y) * 0.35;
      gl.camera.position.set(gl.camX, 128, camZ);
      gl.camera.lookAt(gl.camX + 420, -6, camZ * 0.4);
      gl.renderer.render(gl.scene, gl.camera);
    }

    // ---------- Lógica ----------
    function resetPins(fresh) {
      const spots = pinSpots(env.W);
      if (fresh) {
        st.pins = spots.map(([x, y]) => ({ x, y, ox: x, oy: y, vx: 0, vy: 0, up: true, wasUp: true }));
        fallAt.clear();
      } else {
        for (const p of st.pins) {
          if (p.up) {
            p.x = p.ox; p.y = p.oy; p.vx = 0; p.vy = 0; p.wasUp = true;
          } else {
            p.wasUp = false;
          }
        }
      }
      st.ball = { x: 120, y: LANE_CY, vx: 0, vy: 0, spin: 0, gutter: false };
    }

    function totalScore(seat) {
      return computeBowlingScore(st.cards[seat]).total;
    }

    function marksHtml(seat) {
      const { frameTotals, total } = computeBowlingScore(st.cards[seat]);
      let framesHtml = '';

      for (let f = 0; f < FRAMES; f++) {
        const fr = st.cards[seat][f];
        let r0 = '', r1 = '', r2 = '';
        if (fr) {
          if (f < 9) {
            if (fr[0] === 10) {
              r1 = 'X';
            } else {
              r0 = fr[0] === 0 ? '-' : String(fr[0]);
              if (fr.length > 1) {
                r1 = fr[0] + fr[1] === 10 ? '/' : fr[1] === 0 ? '-' : String(fr[1]);
              }
            }
          } else {
            // 10º Frame
            r0 = fr[0] === 10 ? 'X' : fr[0] === 0 ? '-' : String(fr[0] || '');
            if (fr.length > 1) {
              if (fr[0] === 10) {
                r1 = fr[1] === 10 ? 'X' : fr[1] === 0 ? '-' : String(fr[1]);
              } else {
                r1 = fr[0] + fr[1] === 10 ? '/' : fr[1] === 0 ? '-' : String(fr[1]);
              }
            }
            if (fr.length > 2) {
              if (fr[2] === 10) r2 = 'X';
              else if (fr[1] !== 10 && fr[1] + fr[2] === 10) r2 = '/';
              else r2 = fr[2] === 0 ? '-' : String(fr[2]);
            }
          }
        }
        const cumScore = frameTotals[f] != null ? frameTotals[f] : '';
        framesHtml += `
          <div class="b-frame">
            <div class="b-rolls">
              <span class="b-roll">${r0}</span>
              <span class="b-roll">${r1}</span>
              ${f === 9 ? `<span class="b-roll">${r2}</span>` : ''}
            </div>
            <div class="b-score">${cumScore}</div>
          </div>`;
      }

      return `<div class="bowling-card">${framesHtml}<div class="b-tot">${total}</div></div>`;
    }

    function setUi() {
      env.setSub(0, marksHtml(0));
      env.setSub(1, marksHtml(1));
      if (!st.over) {
        const fNum = Math.min(FRAMES, st.frame[st.turn] + 1);
        const spinDesc = Math.abs(aim3d.spin) > 0.05
          ? ` · Curva: ${aim3d.spin < 0 ? '↶ ' + Math.round(-aim3d.spin * 100) + '%' : Math.round(aim3d.spin * 100) + '% ↷'}`
          : ' · Curva: Neutro';
        env.setMsg(`Frame ${fNum}/${FRAMES} — ${env.names[st.turn]} (${st.roll + 1}º arremesso)${spinDesc}`);
        env.setHint(myThrow()
          ? (T3
            ? 'Arraste para baixo para força, lados para mirar/curvar; solte para lançar (ou A/D para curva).'
            : 'Puxe para trás para mirar e solte. Use A/D para efeito.')
          : env.seat === -1 ? 'Modo Espectador' : `Aguardando ${env.names[st.turn]}…`);
      }
    }

    function shoot(dx, dy, power, spin = 0) {
      const ang = clamp(Math.atan2(dy, Math.max(dx, 0.35)), -0.45, 0.45);
      st.ball.vx = Math.cos(ang) * (460 + power * 920);
      st.ball.vy = Math.sin(ang) * (460 + power * 920);
      st.ball.spin = clamp(spin, -1, 1);
      st.phase = 'rolling';
      st.shooter = st.turn;
      for (const p of st.pins) p.wasUp = p.up;
      env.sfx('click', 0.5 + power * 0.5);
    }

    function serialize() {
      return {
        pins: st.pins.map((p) => [Math.round(p.x), Math.round(p.y), p.up ? 1 : 0]),
        cards: st.cards, frame: st.frame, roll: st.roll, turn: st.turn, over: st.over, phase: 'aim',
      };
    }

    function applyFull(s) {
      const spots = pinSpots(env.W);
      st.pins = s.pins.map(([x, y, up], i) => ({
        x, y, ox: spots[i][0], oy: spots[i][1], vx: 0, vy: 0, up: !!up, wasUp: !!up,
      }));
      st.cards = s.cards;
      st.frame = s.frame;
      st.roll = s.roll;
      st.turn = s.turn;
      st.over = s.over;
      st.phase = 'aim';
      resetPins(false);
      setUi();
    }

    function endRoll() {
      trail.clear();
      let knocked = 0;
      for (let i = 0; i < st.pins.length; i++) {
        const p = st.pins[i];
        if (p.up && (fallAt.has(i) || Math.hypot(p.x - p.ox, p.y - p.oy) > 10 || Math.hypot(p.vx, p.vy) > 30)) {
          p.up = false;
          if (!fallAt.has(i)) fallAt.set(i, performance.now());
          knocked++;
        }
      }

      const seat = st.shooter;
      const f = st.frame[seat];
      if (!st.cards[seat][f]) st.cards[seat][f] = [];
      st.cards[seat][f].push(knocked);
      const fr = st.cards[seat][f];

      // Banners e sons de Strike / Spare
      if (f < 9) {
        if (knocked === 10 && fr.length === 1) {
          fx.banner('STRIKE!', { color: '#ffd54d' });
          env.sfx('score', 1.0);
        } else if (fr.length === 2 && fr[0] + fr[1] === 10) {
          fx.banner('SPARE!', { color: '#88e096' });
          env.sfx('score', 0.85);
        } else if (knocked >= 6) {
          fx.text(env.W / 2, 130, `${knocked} pinos!`, { color: '#ffd54d', size: 26 });
        }
      } else {
        // 10º Frame
        if (knocked === 10) {
          fx.banner('STRIKE!', { color: '#ffd54d' });
          env.sfx('score', 1.0);
        } else if (fr.length === 2 && fr[0] !== 10 && fr[0] + fr[1] === 10) {
          fx.banner('SPARE!', { color: '#88e096' });
          env.sfx('score', 0.85);
        }
      }

      // Regras de término de frame e transição
      let frameDone = false;
      let needPinReset = false;

      if (f < 9) {
        if (fr[0] === 10 || fr.length >= 2) {
          frameDone = true;
          needPinReset = true;
        }
      } else {
        // 10º Frame
        if (fr.length === 1) {
          needPinReset = fr[0] === 10;
        } else if (fr.length === 2) {
          if (fr[0] === 10) {
            needPinReset = fr[1] === 10;
          } else if (fr[0] + fr[1] === 10) {
            needPinReset = true; // Spare no 10º dá pinos novos para a 3ª bola
          } else {
            frameDone = true; // Aberto no 10º frame acaba com 2 bolas
          }
        } else if (fr.length >= 3) {
          frameDone = true;
        }
      }

      if (frameDone) {
        st.frame[seat]++;
        st.roll = 0;
        resetPins(true);

        // Alternância de jogadores
        const p0Done = st.frame[0] >= FRAMES;
        const p1Done = st.frame[1] >= FRAMES;
        if (p0Done && p1Done) {
          st.over = true;
        } else if (st.frame[1 - seat] < FRAMES) {
          st.turn = 1 - seat;
        }
      } else {
        st.roll++;
        resetPins(needPinReset);
      }

      st.phase = 'aim';
      env.send({ k: 'e', s: serialize() });
      setUi();

      if (st.over) {
        const t0 = totalScore(0);
        const t1 = totalScore(1);
        const w = t0 === t1 ? null : t0 > t1 ? 0 : 1;
        env.finish(w, w === null ? `Empate histórico: ${t0} × ${t1}!` : `Vitória no boliche! ${env.names[w]} venceu por ${Math.max(t0, t1)} × ${Math.min(t0, t1)}.`);
      }
    }

    // ---------- Desenho 2D ----------
    function draw2d(ctx) {
      drawFrame(ctx, 56, LANE_TOP - 30, env.W - 112, LANE_BOT - LANE_TOP + 60, 34, {
        felt: '#221d2c', woodA: '#4a3a58', woodB: '#241c30', vignette: 0.28, pad: 10,
      });
      const wood = ctx.createLinearGradient(0, LANE_TOP, 0, LANE_BOT);
      wood.addColorStop(0, '#c99b62');
      wood.addColorStop(0.5, '#e6bd85');
      wood.addColorStop(1, '#c99b62');
      ctx.fillStyle = wood;
      ctx.fillRect(64, LANE_TOP, env.W - 128, LANE_BOT - LANE_TOP);
      // Linha de falta
      ctx.fillStyle = 'rgba(60,30,20,0.55)';
      ctx.fillRect(176, LANE_TOP, 4, LANE_BOT - LANE_TOP);

      // Pinos
      for (const p of st.pins) {
        if (!p.up) continue;
        ctx.beginPath();
        ctx.arc(p.x, p.y, PIN_R, 0, Math.PI * 2);
        ctx.fillStyle = '#f4f0e4';
        ctx.fill();
        ctx.fillStyle = '#d8342c';
        ctx.fillRect(p.x - 4, p.y - 2, 8, 3);
      }

      trail.draw(ctx, BALL_R, '#7a9cf0');

      if (st.ball) {
        const b = st.ball;
        const bg = ctx.createRadialGradient(b.x - 4, b.y - 5, 1, b.x, b.y, BALL_R + 1);
        bg.addColorStop(0, shade('#3d55c0', 0.5));
        bg.addColorStop(1, shade('#3d55c0', -0.45));
        ctx.beginPath();
        ctx.arc(b.x, b.y, BALL_R, 0, Math.PI * 2);
        ctx.fillStyle = bg;
        ctx.fill();
      }

      if (myThrow() && aim) drawAim(ctx, st.ball.x, st.ball.y, aim.current(), BALL_R);
    }

    return {
      st: null,
      start() {
        st = this.st = {
          pins: [], ball: null, cards: [[], []], frame: [0, 0], roll: 0,
          turn: 0, shooter: 0, phase: 'aim', over: false,
        };
        resetPins(true);
        aim = new AimControl({
          getPos: () => st.ball,
          canAim: () => myThrow() && !T3,
          onShoot: (dx, dy, pow) => shoot(dx, dy, pow, aim3d.spin),
        });
        init3d();
        setUi();
      },
      destroy() {
        destroyed = true;
        if (gl) {
          try {
            gl.scene.traverse((o) => {
              if (o.isMesh) {
                o.geometry.dispose();
                if (o.material.map) o.material.map.dispose();
                o.material.dispose();
              }
            });
            gl.renderer.dispose();
            gl.renderer.domElement.remove();
          } catch (_) {}
          gl = null;
        }
        if (tableEl) tableEl.style.background = '';
      },
      snapshot() { return serialize(); },
      restore(s) { this.start(); applyFull(s); },
      msg(m) {
        if (m.k === 'f') {
          st.phase = 'watch';
          st.ball.x = m.b[0]; st.ball.y = m.b[1];
          for (let i = 0; i < m.p.length && i < st.pins.length; i++) {
            st.pins[i].x = m.p[i][0];
            st.pins[i].y = m.p[i][1];
            if (m.p[i].length > 2) {
              const wasUp = st.pins[i].up;
              st.pins[i].up = !!m.p[i][2];
              if (wasUp && !st.pins[i].up && !fallAt.has(i)) {
                fallAt.set(i, performance.now());
              }
            }
          }
        } else if (m.k === 'e') {
          applyFull(m.s);
        }
      },
      pointer(type, x, y) {
        if (!T3) {
          aim && aim.pointer(type, x, y);
          return;
        }
        if (!myThrow()) { drag = null; aim3d.power = 0; return; }

        if (type === 'down') {
          drag = { sx: x, sy: y, initialAngle: aim3d.angle, initialSpin: aim3d.spin };
          aim3d.power = 0;
        } else if (type === 'move' && drag) {
          aim3d.power = clamp((y - drag.sy) / 190, 0, 1);
          aim3d.spin = clamp(drag.initialSpin + (x - drag.sx) / 80, -1, 1);
          setUi();
        } else if (type === 'move' && !drag) {
          aim3d.angle = clamp(((x - env.W / 2) / (env.W / 2)) * 0.42, -0.45, 0.45);
        } else if (type === 'up') {
          const p = aim3d.power;
          const a = aim3d.angle;
          const sp = aim3d.spin;
          drag = null;
          aim3d.power = 0;
          if (p >= 0.04) shoot(Math.cos(a), Math.sin(a), p, sp);
        }
      },
      key(type, k) {
        if (type === 'down') {
          if (k === 'ArrowLeft' || k === 'a' || k === 'A') {
            aim3d.spin = clamp(aim3d.spin - 0.25, -1, 1);
            setUi();
          } else if (k === 'ArrowRight' || k === 'd' || k === 'D') {
            aim3d.spin = clamp(aim3d.spin + 0.25, -1, 1);
            setUi();
          }
        }
      },
      tick(dt) {
        fx.tick(dt);
        if (!st || st.phase !== 'rolling') return;
        trail.push(st.ball.x, st.ball.y);
        const sub = 1 / 240;
        let acc = dt;
        while (acc > 0) {
          const h = Math.min(sub, acc);
          acc -= h;

          // Movimento da bola
          stepBall(st.ball, h, { slide: 75, roll: 30, thresh: 400, stop: 6 });

          // Efeito Hook na metade seca da pista
          if (!st.ball.gutter && st.ball.x > env.W * 0.44 && Math.abs(st.ball.spin) > 0.02) {
            st.ball.vy += st.ball.spin * 250 * h;
            st.ball.spin *= Math.exp(-0.7 * h);
          }

          // Canaleta
          if (st.ball.y < LANE_TOP + BALL_R) { st.ball.y = LANE_TOP + BALL_R; st.ball.gutter = true; st.ball.vy = 0; }
          if (st.ball.y > LANE_BOT - BALL_R) { st.ball.y = LANE_BOT - BALL_R; st.ball.gutter = true; st.ball.vy = 0; }

          // Física realista de pinos (ricochete elástico e baixa fricção)
          for (let i = 0; i < st.pins.length; i++) {
            const p = st.pins[i];
            if (!p.up) continue;
            stepBall(p, h, { slide: 140, roll: 70, thresh: 340, stop: 5 });
            p.y = clamp(p.y, LANE_TOP + PIN_R, LANE_BOT - PIN_R);
            p.x = clamp(p.x, 64 + PIN_R, env.W - 64 - PIN_R);

            // Colisão da bola pesada contra os pinos
            if (!st.ball.gutter) {
              const hit = collideBalls(st.ball, p, BALL_R, PIN_R, 0.78, BALL_R * BALL_R * 2.8, PIN_R * PIN_R);
              if (hit > 60) env.sfx('pins', Math.min(1, hit / 800));
            }

            // Ricochete entre pinos (efeito dominó em cadeia)
            for (let j = 0; j < st.pins.length; j++) {
              const q = st.pins[j];
              if (q !== p && q.up) {
                const hitPin = collideBalls(p, q, PIN_R, PIN_R, 0.82);
                if (hitPin > 50) env.sfx('pin_hit', Math.min(0.9, hitPin / 700));
              }
            }

            // Se o pino sofreu impacto ou foi deslocado, tomba
            if (p.up && (Math.hypot(p.vx, p.vy) > 35 || Math.hypot(p.x - p.ox, p.y - p.oy) > 12)) {
              if (!fallAt.has(i)) {
                fallAt.set(i, performance.now());
              }
            }
          }
        }

        if (!env.isLocal && sendFrame()) {
          env.send({
            k: 'f',
            b: [Math.round(st.ball.x), Math.round(st.ball.y)],
            p: st.pins.map((p, i) => [Math.round(p.x), Math.round(p.y), p.up && !fallAt.has(i) ? 1 : 0]),
          });
        }
        const stopped = st.ball.vx === 0 && st.ball.vy === 0 && st.pins.every((p) => !p.up || (p.vx === 0 && p.vy === 0));
        if (st.ball.x > env.W + BALL_R || stopped) endRoll();
      },
      draw(ctx) {
        if (!st) return;
        const now = performance.now();
        if (gl && T3) {
          render3d(now);
          if (myThrow() && drag && aim3d.power > 0.01) {
            const bw = 220;
            const bx = env.W / 2 - bw / 2;
            const by = env.H - 34;
            ctx.fillStyle = 'rgba(0,0,0,0.55)';
            ctx.fillRect(bx, by, bw, 12);
            const g = ctx.createLinearGradient(bx, 0, bx + bw, 0);
            g.addColorStop(0, '#37b96c');
            g.addColorStop(0.55, '#e3c53a');
            g.addColorStop(1, '#d8342c');
            ctx.fillStyle = g;
            ctx.fillRect(bx + 2, by + 2, (bw - 4) * aim3d.power, 8);
            ctx.strokeStyle = 'rgba(255,255,255,0.6)';
            ctx.lineWidth = 1;
            ctx.strokeRect(bx, by, bw, 12);
          }
        } else {
          draw2d(ctx);
        }
        fx.draw(ctx, env.W, env.H);
        lastDraw = now;
      },
    };
  },
};
