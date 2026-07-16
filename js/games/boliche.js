// Boliche: 5 frames por jogador, 2 arremessos por frame. Pontuação
// simplificada: pinos derrubados + bônus (strike +5, spare +3).
// Renderização 3D real via Three.js (vendorizado); se WebGL não estiver
// disponível, cai para a visão 2D de cima. A física e o multiplayer são
// os mesmos nos dois modos (simulação 2D na pista).
import { stepBall, collideBalls, AimControl, drawAim, throttler, clamp, drawFrame, Trail, Fx, shade } from '../engine.js';

const FRAMES = 5;
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

export default {
  id: 'boliche',
  name: 'Boliche',
  icon: '🎳',
  desc: `Pista 3D! ${FRAMES} frames, strike vale bônus.`,
  local: true,
  create(env) {
    let st = null;
    let aim = null; // fallback 2D
    const sendFrame = throttler(40);
    const controls = (seat) => env.isLocal || env.seat === seat;
    const trail = new Trail(9);
    const fx = new Fx();
    const fallAt = new Map();

    // ---------- 3D ----------
    let T3 = null; // módulo three
    let gl = null; // {renderer, scene, camera, ball, pins[], arrow, canvas, ...}
    let drag = null; // gesto 3D: {sy}
    let aim3d = { angle: 0, power: 0 };
    let lastDraw = 0;
    let destroyed = false;
    const tableEl = document.getElementById('table');

    function myThrow() {
      return st && !st.over && st.phase === 'aim' && controls(st.turn);
    }

    async function init3d() {
      let mod;
      try {
        mod = await import('../vendor/three.module.js');
      } catch (_) {
        return; // sem three → modo 2D
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
        wrap.insertBefore(renderer.domElement, tableEl);
        tableEl.style.background = 'transparent';
        T3 = mod;
        gl = buildScene(mod, renderer);
      } catch (err) {
        console.error('WebGL indisponível, usando visão 2D', err);
        T3 = null;
        gl = null;
        tableEl.style.background = '';
      }
      setUi();
    }

    function laneTexture(mod) {
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
      // tábuas
      g.strokeStyle = 'rgba(120,80,40,0.4)';
      g.lineWidth = 2;
      for (let i = 1; i < 14; i++) {
        const y = (256 * i) / 14;
        g.beginPath(); g.moveTo(0, y); g.lineTo(1024, y); g.stroke();
      }
      // brilho do verniz
      const sheen = g.createLinearGradient(0, 0, 1024, 0);
      sheen.addColorStop(0, 'rgba(255,255,255,0.16)');
      sheen.addColorStop(0.3, 'rgba(255,255,255,0)');
      sheen.addColorStop(0.7, 'rgba(255,255,255,0.12)');
      sheen.addColorStop(1, 'rgba(255,255,255,0)');
      g.fillStyle = sheen;
      g.fillRect(0, 0, 1024, 256);
      // linha de falta
      g.fillStyle = 'rgba(70,35,20,0.7)';
      g.fillRect(135, 0, 6, 256);
      // setas de mira
      g.fillStyle = 'rgba(140,70,45,0.8)';
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
      scene.background = new mod.Color(0x0d0a16);
      scene.fog = new mod.Fog(0x0d0a16, 700, 1500);

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
      const deck = new mod.PointLight(0xff9cf0, 2.2, 650, 1);
      deck.position.set(800, 130, 0);
      scene.add(deck);

      // pista (superfície + espessura)
      const laneW = 840;
      const laneD = LANE_BOT - LANE_TOP; // 192
      const top = new mod.Mesh(
        new mod.PlaneGeometry(laneW, laneD),
        new mod.MeshStandardMaterial({ map: laneTexture(mod), roughness: 0.32, metalness: 0.06 })
      );
      top.rotation.x = -Math.PI / 2;
      top.position.set(64 + laneW / 2, 0, 0);
      top.receiveShadow = true;
      scene.add(top);
      const side = new mod.Mesh(
        new mod.BoxGeometry(laneW, 14, laneD),
        new mod.MeshStandardMaterial({ color: 0x53341c, roughness: 0.7 })
      );
      side.position.set(64 + laneW / 2, -7.2, 0);
      scene.add(side);

      // sarjetas + trilhos de madeira
      for (const s of [-1, 1]) {
        const gutter = new mod.Mesh(
          new mod.BoxGeometry(laneW, 8, 26),
          new mod.MeshStandardMaterial({ color: 0x11101c, roughness: 0.55 })
        );
        gutter.position.set(64 + laneW / 2, -7, s * (laneD / 2 + 14));
        gutter.receiveShadow = true;
        scene.add(gutter);
        const railMat = new mod.MeshStandardMaterial({ color: 0x6d4322, roughness: 0.6 });
        const rail = new mod.Mesh(new mod.BoxGeometry(laneW, 22, 12), railMat);
        rail.position.set(64 + laneW / 2, -1, s * (laneD / 2 + 33));
        rail.castShadow = true;
        scene.add(rail);
      }

      // fundo do pit + neon
      const pit = new mod.Mesh(
        new mod.BoxGeometry(40, 90, laneD + 90),
        new mod.MeshStandardMaterial({ color: 0x090711, roughness: 0.9 })
      );
      pit.position.set(944, 30, 0);
      scene.add(pit);
      const neon = new mod.Mesh(
        new mod.BoxGeometry(5, 5, laneD + 60),
        new mod.MeshStandardMaterial({ color: 0xff7ce8, emissive: 0xff4cd8, emissiveIntensity: 2.2 })
      );
      neon.position.set(920, 62, 0);
      scene.add(neon);

      // pinos
      const pinProto = makePin(mod);
      const pins = [];
      for (let i = 0; i < 10; i++) {
        const p = pinProto.clone(true);
        p.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.material = o.material.clone(); } });
        scene.add(p);
        pins.push(p);
      }

      // bola
      const ball = new mod.Mesh(
        new mod.SphereGeometry(BALL_R, 32, 24),
        new mod.MeshPhysicalMaterial({ color: 0x2b3fb0, roughness: 0.15, clearcoat: 1, clearcoatRoughness: 0.1 })
      );
      ball.castShadow = true;
      scene.add(ball);

      // seta de mira
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
      // bola
      gl.ball.position.set(b.x, BALL_R, z(b.y));
      gl.rollAngle -= (Math.hypot(b.vx, b.vy) * dt) / BALL_R;
      gl.ball.rotation.z = gl.rollAngle;
      // pinos
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
          // tomba na direção do empurrão
          const axis = new T3.Vector3(dz / len, 0, -dx / len);
          mesh.setRotationFromAxisAngle(axis, k * Math.PI * 0.52);
          mesh.traverse((o) => {
            if (o.isMesh) { o.material.transparent = true; o.material.opacity = 1 - k * 0.8; }
          });
        } else {
          mesh.visible = false;
        }
      }
      // seta de mira
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
        gl.arrow.rotation.y = aim3d.angle; // +angle vira para -z? rotação Y positiva gira x→-z ✓ (tela-direita)
      }
      // câmera: atrás da bola, segue durante o arremesso
      const targetX = st.phase === 'rolling' || st.phase === 'watch' ? b.x - 190 : b.x - 150;
      gl.camX += (targetX - gl.camX) * Math.min(1, dt * 4);
      const camZ = z(b.y) * 0.35;
      gl.camera.position.set(gl.camX, 128, camZ);
      gl.camera.lookAt(gl.camX + 420, -6, camZ * 0.4);
      gl.renderer.render(gl.scene, gl.camera);
    }

    // ---------- lógica (igual nos dois modos) ----------
    function resetPins(fresh) {
      const spots = pinSpots(env.W);
      if (fresh) {
        st.pins = spots.map(([x, y]) => ({ x, y, ox: x, oy: y, vx: 0, vy: 0, up: true }));
        fallAt.clear();
      } else {
        for (const p of st.pins) {
          if (p.up) { p.x = p.ox; p.y = p.oy; p.vx = 0; p.vy = 0; }
        }
      }
      st.ball = { x: 120, y: LANE_CY, vx: 0, vy: 0, gutter: false };
    }

    function frameScore(rolls) {
      const total = rolls.reduce((a, b) => a + b, 0);
      if (rolls[0] === 10) return total + 5;
      if (rolls.length > 1 && total === 10) return total + 3;
      return total;
    }

    function totalScore(seat) {
      return st.cards[seat].reduce((a, f) => a + frameScore(f), 0);
    }

    function marksHtml(seat) {
      let h = '';
      for (let f = 0; f < FRAMES; f++) {
        const rolls = st.cards[seat][f];
        let mark = '·';
        if (rolls) {
          if (rolls[0] === 10) mark = 'X';
          else if (rolls.length > 1) mark = rolls[0] + rolls[1] === 10 ? `${rolls[0]}/` : `${rolls[0]}·${rolls[1]}`;
          else mark = `${rolls[0]}`;
        }
        h += `<span class="frame-mark">${mark}</span>`;
      }
      return `${h} <b>${totalScore(seat)}</b>`;
    }

    function setUi() {
      env.setSub(0, marksHtml(0));
      env.setSub(1, marksHtml(1));
      if (!st.over) {
        env.setMsg(`Frame ${st.frame[st.turn] + 1}/${FRAMES} — ${env.names[st.turn]} (${st.roll + 1}º arremesso)`);
        env.setHint(myThrow()
          ? (T3
            ? 'Arraste para baixo para dar força, para os lados para mirar; solte para lançar.'
            : 'Pressione e puxe para trás para lançar a bola contra os pinos.')
          : env.seat === -1 ? '👁 Assistindo' : `Aguardando ${env.names[st.turn]}…`);
      }
    }

    function shoot(dx, dy, power) {
      const ang = clamp(Math.atan2(dy, Math.max(dx, 0.35)), -0.5, 0.5);
      st.ball.vx = Math.cos(ang) * (450 + power * 900);
      st.ball.vy = Math.sin(ang) * (450 + power * 900);
      st.phase = 'rolling';
      st.shooter = st.turn;
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
      st.pins = s.pins.map(([x, y, up], i) => ({ x, y, ox: spots[i][0], oy: spots[i][1], vx: 0, vy: 0, up: !!up }));
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
        if (p.up && Math.hypot(p.x - p.ox, p.y - p.oy) > 11) {
          p.up = false;
          fallAt.set(i, performance.now());
          knocked++;
        }
      }
      if (knocked) env.sfx('pocket', 0.8);
      const seatNow = st.shooter;
      const rollsNow = st.cards[seatNow][st.frame[seatNow]] || [];
      if (knocked === 10 && rollsNow.length === 0) {
        fx.banner('STRIKE! 🎳', { color: '#ffd54d' });
      } else if (rollsNow.length === 1 && rollsNow[0] + knocked === 10) {
        fx.banner('SPARE!', { color: '#9be49b' });
      } else if (knocked >= 6) {
        fx.text(env.W / 2, 130, `${knocked} pinos!`, { color: '#ffd54d', size: 26 });
      }
      const seat = st.shooter;
      const f = st.frame[seat];
      if (!st.cards[seat][f]) st.cards[seat][f] = [];
      st.cards[seat][f].push(knocked);
      const rolls = st.cards[seat][f];
      const frameDone = rolls[0] === 10 || rolls.length >= 2;
      if (frameDone) {
        st.frame[seat]++;
        st.roll = 0;
        st.turn = 1 - seat;
        if (st.frame[0] >= FRAMES && st.frame[1] >= FRAMES) {
          st.over = true;
        } else if (st.frame[st.turn] >= FRAMES) {
          st.turn = 1 - st.turn;
        }
        resetPins(true);
      } else {
        st.roll = 1;
        resetPins(false);
      }
      st.phase = 'aim';
      env.send({ k: 'e', s: serialize() });
      setUi();
      if (st.over) {
        const t0 = totalScore(0);
        const t1 = totalScore(1);
        const w = t0 === t1 ? null : t0 > t1 ? 0 : 1;
        env.finish(w, w === null ? `Empate: ${t0} × ${t1}!` : `${env.names[w]} venceu no boliche: ${t0} × ${t1}!`);
      }
    }

    // ---------- desenho 2D (fallback sem WebGL) ----------
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
      ctx.fillStyle = 'rgba(60,30,20,0.55)';
      ctx.fillRect(176, LANE_TOP, 4, LANE_BOT - LANE_TOP);
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
          onShoot: shoot,
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
          } catch (_) { /* ignore */ }
          gl = null;
        }
        tableEl.style.background = '';
      },
      snapshot() { return serialize(); },
      restore(s) {
        this.start();
        applyFull(s);
      },
      msg(m) {
        if (m.k === 'f') {
          st.phase = 'watch';
          st.ball.x = m.b[0]; st.ball.y = m.b[1];
          for (let i = 0; i < m.p.length && i < st.pins.length; i++) {
            st.pins[i].x = m.p[i][0];
            st.pins[i].y = m.p[i][1];
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
        // gesto 3D: lados = mira, arrastar para baixo = força
        if (!myThrow()) { drag = null; aim3d.power = 0; return; }
        aim3d.angle = clamp(((x - env.W / 2) / (env.W / 2)) * 0.45, -0.5, 0.5);
        if (type === 'down') {
          drag = { sy: y };
          aim3d.power = 0;
        } else if (type === 'move' && drag) {
          aim3d.power = clamp((y - drag.sy) / 200, 0, 1);
        } else if (type === 'up') {
          const p = aim3d.power;
          const a = aim3d.angle;
          drag = null;
          aim3d.power = 0;
          if (p >= 0.04) shoot(Math.cos(a), Math.sin(a), p);
        }
      },
      key() {},
      tick(dt) {
        fx.tick(dt);
        if (!st || st.phase !== 'rolling') return;
        trail.push(st.ball.x, st.ball.y);
        const sub = 1 / 240;
        let acc = dt;
        while (acc > 0) {
          const h = Math.min(sub, acc);
          acc -= h;
          stepBall(st.ball, h, { slide: 90, roll: 40, thresh: 400, stop: 8 });
          if (st.ball.y < LANE_TOP + BALL_R) { st.ball.y = LANE_TOP + BALL_R; st.ball.gutter = true; st.ball.vy = 0; }
          if (st.ball.y > LANE_BOT - BALL_R) { st.ball.y = LANE_BOT - BALL_R; st.ball.gutter = true; st.ball.vy = 0; }
          for (const p of st.pins) {
            if (!p.up) continue;
            stepBall(p, h, { slide: 700, roll: 500, thresh: 1e9, stop: 10 });
            p.y = clamp(p.y, LANE_TOP + PIN_R, LANE_BOT - PIN_R);
            p.x = clamp(p.x, 64 + PIN_R, env.W - 64 - PIN_R);
            if (!st.ball.gutter) {
              const hit = collideBalls(st.ball, p, BALL_R, PIN_R, 0.5);
              if (hit > 80) env.sfx('click', Math.min(1, hit / 900));
            }
            for (const q of st.pins) {
              if (q !== p && q.up) collideBalls(p, q, PIN_R, PIN_R, 0.5);
            }
          }
        }
        if (!env.isLocal && sendFrame()) {
          env.send({
            k: 'f',
            b: [Math.round(st.ball.x), Math.round(st.ball.y)],
            p: st.pins.map((p) => [Math.round(p.x), Math.round(p.y)]),
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
          // barra de força sobre a cena
          if (myThrow() && drag && aim3d.power > 0.01) {
            const bw = 220;
            const bx = env.W / 2 - bw / 2;
            const by = env.H - 34;
            ctx.fillStyle = 'rgba(0,0,0,0.5)';
            ctx.fillRect(bx, by, bw, 12);
            const g = ctx.createLinearGradient(bx, 0, bx + bw, 0);
            g.addColorStop(0, '#37b96c');
            g.addColorStop(0.55, '#e3c53a');
            g.addColorStop(1, '#d8342c');
            ctx.fillStyle = g;
            ctx.fillRect(bx + 2, by + 2, (bw - 4) * aim3d.power, 8);
            ctx.strokeStyle = 'rgba(255,255,255,0.5)';
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
