// Mini-golf: 3 buracos com obstáculos e areia. Tacadas alternadas; menos
// tacadas vence. Renderização 3D real (Three.js): na sua vez a câmera fica
// atrás da bola e gira com a mira; nos outros momentos, vista aérea do
// campo. Sem WebGL cai para a visão 2D. Física/multiplayer inalterados.
import { stepBall, collideBalls, collideRect, AimControl, drawAim, drawOrb, throttler, drawFrame, Trail, Fx, clamp } from '../engine.js';

const BALL_R = 9;
const HOLE_R = 14;
const MAX_STROKES = 8;

const HOLES = (W, H) => [
  {
    name: 'Reta', par: 2,
    tee: [130, H / 2], hole: [W - 130, H / 2],
    walls: [],
    sand: [{ x: W / 2 - 70, y: H / 2 - 150, w: 140, h: 90 }],
  },
  {
    name: 'Contorno', par: 3,
    tee: [130, H - 120], hole: [W - 130, 130],
    walls: [{ x: W / 2 - 35, y: 180, w: 70, h: H - 180 - 46 }],
    sand: [{ x: W / 2 + 90, y: H - 190, w: 150, h: 100 }],
  },
  {
    name: 'Zigue-zague', par: 3,
    tee: [130, H / 2], hole: [W - 130, H / 2],
    walls: [
      { x: 330, y: 66, w: 44, h: 220 },
      { x: 570, y: H - 66 - 220, w: 44, h: 220 },
    ],
    sand: [{ x: 420, y: H / 2 + 40, w: 120, h: 110 }],
  },
];

export default {
  id: 'golf',
  name: 'Mini-Golf',
  icon: '⛳',
  desc: '3D! 3 buracos, menos tacadas vence.',
  local: true,
  create(env) {
    const L = 46, T = 66, Rr = env.W - 46, B = env.H - 46;
    const CY = (T + B) / 2;
    const courses = HOLES(env.W, env.H);
    let st = null;
    let aim = null; // fallback 2D
    const sendFrame = throttler(40);
    const controls = (seat) => env.isLocal || env.seat === seat;
    const myMove = () => st && !st.over && st.phase === 'aim' && controls(st.turn) && !st.holed[st.turn];
    const trails = [new Trail(8), new Trail(8)];
    const fx = new Fx();
    const inSand = (c, b) => c.sand.some((s) => b.x > s.x && b.x < s.x + s.w && b.y > s.y && b.y < s.y + s.h);

    // ---------- 3D ----------
    let T3 = null;
    let gl = null;
    let destroyed = false;
    let builtHole = -1;
    let drag = null; // {sy, lastX}
    let aim3d = { angle: 0, power: 0 };
    let lastDraw = 0;
    const tableEl = document.getElementById('table');
    const zOf = (y2) => -(y2 - CY);

    function course() { return courses[st.hole]; }

    async function init3d() {
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
        document.getElementById('table-wrap').insertBefore(renderer.domElement, tableEl);
        tableEl.style.background = 'transparent';
        T3 = mod;
        gl = buildScene(mod, renderer);
        buildHole(st.hole);
      } catch (err) {
        console.error('WebGL indisponível, usando visão 2D', err);
        T3 = null;
        gl = null;
        tableEl.style.background = '';
      }
      setUi();
    }

    function groundTexture(mod, c) {
      const cv = document.createElement('canvas');
      cv.width = 1024;
      cv.height = 512;
      const g = cv.getContext('2d');
      const sx = 1024 / (Rr - L);
      const sy = 512 / (B - T);
      g.fillStyle = '#3f9a63';
      g.fillRect(0, 0, 1024, 512);
      // corte quadriculado
      const sq = 54 * sx;
      for (let x = 0; x < 1024; x += sq) {
        for (let y = 0; y < 512; y += sq) {
          if ((Math.round(x / sq) + Math.round(y / sq)) % 2 === 0) {
            g.fillStyle = 'rgba(255,255,255,0.05)';
            g.fillRect(x, y, sq, sq);
          }
        }
      }
      const px = (x2) => (x2 - L) * sx;
      const py = (y2) => (y2 - T) * sy;
      // areia
      for (const s of c.sand) {
        g.beginPath();
        g.ellipse(px(s.x + s.w / 2), py(s.y + s.h / 2), (s.w / 2) * sx, (s.h / 2) * sy, 0, 0, Math.PI * 2);
        const sg = g.createRadialGradient(px(s.x + s.w / 2) - 8, py(s.y + s.h / 2) - 8, 4, px(s.x + s.w / 2), py(s.y + s.h / 2), (s.w / 2) * sx);
        sg.addColorStop(0, '#eddaa6');
        sg.addColorStop(1, '#cdb379');
        g.fillStyle = sg;
        g.fill();
        g.strokeStyle = 'rgba(90,70,30,0.4)';
        g.lineWidth = 3;
        g.stroke();
      }
      // tapete do tee
      g.fillStyle = 'rgba(20,50,32,0.7)';
      g.fillRect(px(c.tee[0]) - 28, py(c.tee[1]) - 36, 56, 72);
      g.strokeStyle = 'rgba(255,255,255,0.3)';
      g.lineWidth = 2;
      g.strokeRect(px(c.tee[0]) - 28, py(c.tee[1]) - 36, 56, 72);
      // buraco
      g.beginPath();
      g.arc(px(c.hole[0]), py(c.hole[1]), HOLE_R * sx * 1.05, 0, Math.PI * 2);
      g.fillStyle = '#0a1810';
      g.fill();
      g.strokeStyle = 'rgba(0,0,0,0.5)';
      g.lineWidth = 3;
      g.stroke();
      const tex = new mod.CanvasTexture(cv);
      tex.anisotropy = 4;
      tex.colorSpace = mod.SRGBColorSpace;
      return tex;
    }

    function buildScene(mod, renderer) {
      const scene = new mod.Scene();
      scene.background = new mod.Color(0x0e1420);
      scene.fog = new mod.Fog(0x0e1420, 900, 1900);
      const camera = new mod.PerspectiveCamera(52, 968 / 528, 1, 2600);
      scene.add(new mod.AmbientLight(0xe8f0e0, 0.6));
      scene.add(new mod.HemisphereLight(0xcfe8ff, 0x1e3324, 0.45));
      const key = new mod.DirectionalLight(0xfff4dd, 1.5);
      key.position.set(300, 520, 260);
      key.castShadow = true;
      key.shadow.mapSize.set(1024, 1024);
      key.shadow.camera.left = -560;
      key.shadow.camera.right = 560;
      key.shadow.camera.top = 360;
      key.shadow.camera.bottom = -360;
      key.shadow.camera.far = 1400;
      key.target.position.set(484, 0, 0);
      scene.add(key, key.target);

      // bolas
      const balls = [0, 1].map((i) => {
        const b = new mod.Mesh(
          new mod.SphereGeometry(BALL_R, 28, 20),
          new mod.MeshPhysicalMaterial({
            color: i === 0 ? 0xf3efe2 : 0xffd54d,
            roughness: 0.25, clearcoat: 0.8, clearcoatRoughness: 0.2,
          })
        );
        b.castShadow = true;
        scene.add(b);
        return b;
      });

      // seta de mira
      const arrow = new mod.Group();
      const shaftMat = new mod.MeshBasicMaterial({ color: 0x7cff9a, transparent: true, opacity: 0.9 });
      const shaft = new mod.Mesh(new mod.CylinderGeometry(1.5, 1.5, 1, 8), shaftMat);
      shaft.rotation.z = -Math.PI / 2;
      const head = new mod.Mesh(new mod.ConeGeometry(4.5, 13, 12), shaftMat.clone());
      head.rotation.z = -Math.PI / 2;
      arrow.add(shaft, head);
      arrow.visible = false;
      scene.add(arrow);

      return {
        renderer, scene, camera, balls, arrow, shaft, head,
        holeGroup: null, flag: null,
        camPos: new mod.Vector3(484, 430, 330),
        camLook: new mod.Vector3(484, 0, 10),
      };
    }

    function buildHole(idx) {
      if (!gl || !T3) return;
      const mod = T3;
      const c = courses[idx];
      if (gl.holeGroup) {
        gl.scene.remove(gl.holeGroup);
        gl.holeGroup.traverse((o) => {
          if (o.isMesh) {
            o.geometry.dispose();
            if (o.material.map) o.material.map.dispose();
            o.material.dispose();
          }
        });
      }
      const grp = new mod.Group();
      // gramado
      const ground = new mod.Mesh(
        new mod.PlaneGeometry(Rr - L, B - T),
        new mod.MeshStandardMaterial({ map: groundTexture(mod, c), roughness: 0.85 })
      );
      ground.rotation.x = -Math.PI / 2;
      ground.position.set((L + Rr) / 2, 0, 0);
      ground.receiveShadow = true;
      grp.add(ground);
      // base de madeira
      const base = new mod.Mesh(
        new mod.BoxGeometry(Rr - L + 36, 16, B - T + 36),
        new mod.MeshStandardMaterial({ color: 0x53341c, roughness: 0.7 })
      );
      base.position.set((L + Rr) / 2, -8.2, 0);
      grp.add(base);
      // bordas
      const wallMat = new mod.MeshStandardMaterial({ color: 0x7a4a26, roughness: 0.55 });
      const mkWall = (x, y2, w, h) => {
        const box = new mod.Mesh(new mod.BoxGeometry(w, 24, h), wallMat);
        box.position.set(x + w / 2, 12, zOf(y2 + h / 2));
        box.castShadow = true;
        box.receiveShadow = true;
        grp.add(box);
      };
      mkWall(L - 12, T - 12, Rr - L + 24, 12);
      mkWall(L - 12, B, Rr - L + 24, 12);
      mkWall(L - 12, T, 12, B - T);
      mkWall(Rr, T, 12, B - T);
      for (const w of c.walls) mkWall(w.x, w.y, w.w, w.h);
      // bandeira
      const pole = new mod.Mesh(
        new mod.CylinderGeometry(1.4, 1.4, 64, 10),
        new mod.MeshStandardMaterial({ color: 0xe8e2d0, roughness: 0.4 })
      );
      pole.position.set(c.hole[0], 32, zOf(c.hole[1]));
      pole.castShadow = true;
      grp.add(pole);
      const flag = new mod.Mesh(
        new mod.PlaneGeometry(26, 15),
        new mod.MeshStandardMaterial({ color: 0xd8342c, side: mod.DoubleSide, roughness: 0.6 })
      );
      flag.position.set(c.hole[0] + 13, 54, zOf(c.hole[1]));
      grp.add(flag);
      gl.flag = flag;
      gl.flagBaseX = c.hole[0];
      gl.holeGroup = grp;
      gl.scene.add(grp);
      builtHole = idx;
    }

    function render3d(now) {
      const mod = T3;
      const dt = Math.min(0.05, (now - lastDraw) / 1000) || 0.016;
      if (builtHole !== st.hole) buildHole(st.hole);
      const c = course();
      // bolas
      for (const i of [0, 1]) {
        const b = st.balls[i];
        gl.balls[i].visible = !st.holed[i];
        gl.balls[i].position.set(b.x, BALL_R, zOf(b.y));
      }
      // bandeira ao vento
      if (gl.flag) {
        gl.flag.position.x = gl.flagBaseX + 13 + Math.sin(now / 320) * 2;
        gl.flag.rotation.y = Math.sin(now / 320) * 0.25;
      }
      // seta de mira
      const show = myMove();
      gl.arrow.visible = show;
      if (show) {
        const b = st.balls[st.turn];
        const len = 46 + aim3d.power * 170;
        const hue = 0.33 - aim3d.power * 0.33;
        gl.shaft.material.color.setHSL(hue, 0.9, 0.6);
        gl.head.material.color.setHSL(hue, 0.9, 0.6);
        gl.shaft.scale.y = len;
        gl.shaft.position.set(len / 2, 0, 0);
        gl.head.position.set(len + 6, 0, 0);
        gl.arrow.position.set(b.x, 5, zOf(b.y));
        gl.arrow.rotation.y = aim3d.angle;
      }
      // câmera: atrás da bola na minha vez; senão vista aérea
      const target = new mod.Vector3();
      const look = new mod.Vector3();
      if (show) {
        const b = st.balls[st.turn];
        const a = aim3d.angle;
        target.set(b.x - Math.cos(a) * 175, 115, zOf(b.y) + Math.sin(a) * 175);
        look.set(b.x + Math.cos(a) * 240, -10, zOf(b.y) - Math.sin(a) * 240);
      } else if (st.phase === 'moving' || st.phase === 'watch') {
        const b = st.balls[st.phase === 'watch' ? st.turn : st.shooter] || st.balls[0];
        target.set(484, 400, 330);
        look.set(b.x * 0.55 + 484 * 0.45, 0, zOf(b.y) * 0.55);
      } else {
        target.set(484, 400, 330);
        look.set(484, 0, 10);
      }
      const k = Math.min(1, dt * 5);
      gl.camPos.lerp(target, k);
      gl.camLook.lerp(look, k);
      gl.camera.position.copy(gl.camPos);
      gl.camera.lookAt(gl.camLook);
      gl.renderer.render(gl.scene, gl.camera);
    }

    // ---------- lógica (igual nos dois modos) ----------
    function resetHole() {
      const c = course();
      st.balls = [
        { x: c.tee[0], y: c.tee[1] - 14, vx: 0, vy: 0 },
        { x: c.tee[0], y: c.tee[1] + 14, vx: 0, vy: 0 },
      ];
      st.holed = [false, false];
      st.hs = [0, 0];
      st.turn = st.hole % 2;
      resetAimToHole();
    }

    function resetAimToHole() {
      if (!st) return;
      const c = course();
      const b = st.balls[st.turn];
      aim3d.angle = Math.atan2(c.hole[1] - b.y, c.hole[0] - b.x);
      aim3d.power = 0;
    }

    function totals(seat) {
      return st.cards[seat].reduce((a, b) => a + b, 0);
    }

    function setUi() {
      env.setSub(0, `${st.cards[0].map((s) => `<span class="frame-mark">${s}</span>`).join('')} <b>${totals(0)}</b>`);
      env.setSub(1, `${st.cards[1].map((s) => `<span class="frame-mark">${s}</span>`).join('')} <b>${totals(1)}</b>`);
      if (!st.over) {
        const c = course();
        env.setMsg(`Buraco ${st.hole + 1}/3 (${c.name}, par ${c.par}) — vez de ${env.names[st.turn]} · tacada ${st.hs[st.turn] + 1}`);
        env.setHint(myMove()
          ? (T3
            ? 'Arraste para os lados para girar a mira e para baixo para dar força; solte para tacar.'
            : 'Pressione e puxe para trás para dar a tacada. Chegue devagar no buraco!')
          : env.seat === -1 ? '👁 Assistindo' : `Aguardando ${env.names[st.turn]}…`);
      }
    }

    function serialize() {
      return {
        balls: st.balls.map((b) => [Math.round(b.x), Math.round(b.y)]),
        holed: st.holed, hs: st.hs, cards: st.cards, hole: st.hole, turn: st.turn, over: st.over,
      };
    }

    function applyFull(s) {
      st.hole = s.hole;
      st.balls = s.balls.map(([x, y]) => ({ x, y, vx: 0, vy: 0 }));
      st.holed = s.holed.slice();
      st.hs = s.hs.slice();
      st.cards = s.cards.map((c) => c.slice());
      st.turn = s.turn;
      st.over = s.over;
      st.phase = 'aim';
      resetAimToHole();
      setUi();
    }

    function shoot(dx, dy, power) {
      const b = st.balls[st.turn];
      const speed = 180 + power * 1050;
      b.vx = dx * speed;
      b.vy = dy * speed;
      st.hs[st.turn]++;
      st.shooter = st.turn;
      st.phase = 'moving';
      env.sfx('click', 0.4 + power * 0.5);
    }

    function nextTurnOrHole() {
      trails.forEach((t) => t.clear());
      const bothDone = st.holed[0] && st.holed[1];
      if (bothDone) {
        st.cards[0].push(st.hs[0]);
        st.cards[1].push(st.hs[1]);
        if (st.hole >= courses.length - 1) {
          st.over = true;
        } else {
          st.hole++;
          resetHole();
        }
      } else {
        const other = 1 - st.shooter;
        st.turn = st.holed[other] ? st.shooter : other;
      }
      st.phase = 'aim';
      resetAimToHole();
      env.send({ k: 'e', s: serialize() });
      setUi();
      if (st.over) {
        const t0 = totals(0);
        const t1 = totals(1);
        const w = t0 === t1 ? null : t0 < t1 ? 0 : 1;
        env.finish(w, w === null ? `Empate em ${t0} tacadas!` : `${env.names[w]} venceu no golf: ${t0} × ${t1} tacadas.`);
      }
    }

    function physics(h) {
      const c = course();
      for (let i = 0; i < 2; i++) {
        const b = st.balls[i];
        if (st.holed[i]) continue;
        const sandy = inSand(c, b);
        stepBall(b, h, { slide: sandy ? 640 : 200, roll: sandy ? 420 : 85, thresh: 320, stop: 6 });
        if (b.x < L + BALL_R && b.vx < 0) { b.x = L + BALL_R; b.vx = -b.vx * 0.75; }
        if (b.x > Rr - BALL_R && b.vx > 0) { b.x = Rr - BALL_R; b.vx = -b.vx * 0.75; }
        if (b.y < T + BALL_R && b.vy < 0) { b.y = T + BALL_R; b.vy = -b.vy * 0.75; }
        if (b.y > B - BALL_R && b.vy > 0) { b.y = B - BALL_R; b.vy = -b.vy * 0.75; }
        for (const w of c.walls) {
          const hit = collideRect(b, BALL_R, w.x, w.y, w.w, w.h, 0.75);
          if (hit > 80) env.sfx('cushion', Math.min(1, hit / 800));
        }
        const d = Math.hypot(b.x - c.hole[0], b.y - c.hole[1]);
        const sp = Math.hypot(b.vx, b.vy);
        if (d < HOLE_R - 2 && sp < 320) {
          st.holed[i] = true;
          b.vx = 0; b.vy = 0;
          b.x = c.hole[0]; b.y = c.hole[1];
          fx.text(env.W / 2, 130, `${env.names[i]}: ${st.hs[i]} tacada${st.hs[i] > 1 ? 's' : ''}!`, { color: '#9be49b', size: 22 });
          env.sfx('pocket', 0.9);
        } else if (d < HOLE_R + 4 && sp < 500 && d > 0.001) {
          b.vx += ((c.hole[0] - b.x) / d) * 520 * h;
          b.vy += ((c.hole[1] - b.y) / d) * 520 * h;
        }
      }
      if (!st.holed[0] && !st.holed[1]) collideBalls(st.balls[0], st.balls[1], BALL_R, BALL_R, 0.9);
    }

    // ---------- desenho 2D (fallback sem WebGL) ----------
    function draw2d(ctx) {
      const c = course();
      drawFrame(ctx, L, T, Rr - L, B - T, 40, {
        felt: '#3f9a63', woodA: '#6d5a35', woodB: '#3c3220', vignette: 0.16, pad: 12,
      });
      for (const s of c.sand) {
        ctx.beginPath();
        ctx.ellipse(s.x + s.w / 2, s.y + s.h / 2, s.w / 2, s.h / 2, 0, 0, Math.PI * 2);
        ctx.fillStyle = '#e0c58c';
        ctx.fill();
      }
      for (const w of c.walls) {
        ctx.fillStyle = '#7a4a26';
        ctx.fillRect(w.x, w.y, w.w, w.h);
      }
      ctx.beginPath();
      ctx.arc(c.hole[0], c.hole[1], HOLE_R, 0, Math.PI * 2);
      ctx.fillStyle = '#12241a';
      ctx.fill();
      if (!st.holed[0]) drawOrb(ctx, st.balls[0].x, st.balls[0].y, BALL_R, '#f0ede0');
      if (!st.holed[1]) drawOrb(ctx, st.balls[1].x, st.balls[1].y, BALL_R, '#ffd54d');
      if (myMove() && aim) {
        const b = st.balls[st.turn];
        drawAim(ctx, b.x, b.y, aim.current(), BALL_R);
      }
    }

    return {
      st: null,
      start() {
        st = this.st = { hole: 0, balls: [], holed: [false, false], hs: [0, 0], cards: [[], []], turn: 0, shooter: 0, phase: 'aim', over: false };
        resetHole();
        aim = new AimControl({
          getPos: () => st.balls[st.turn],
          canAim: () => myMove() && !T3,
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
      restore(s) { applyFull(s); },
      msg(m) {
        if (m.k === 'f') {
          st.phase = 'watch';
          for (let i = 0; i < 2; i++) {
            st.balls[i].x = m.b[i][0];
            st.balls[i].y = m.b[i][1];
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
        if (!myMove()) { drag = null; aim3d.power = 0; return; }
        if (type === 'down') {
          drag = { sy: y, lastX: x };
          aim3d.power = 0;
        } else if (type === 'move' && drag) {
          aim3d.angle += (x - drag.lastX) * 0.0045;
          drag.lastX = x;
          aim3d.power = clamp((y - drag.sy) / 190, 0, 1);
        } else if (type === 'up' && drag) {
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
        if (!st || st.phase !== 'moving') return;
        for (let i = 0; i < 2; i++) {
          if (!st.holed[i]) trails[i].push(st.balls[i].x, st.balls[i].y);
        }
        let acc = dt;
        while (acc > 0) {
          const h = Math.min(1 / 240, acc);
          acc -= h;
          physics(h);
        }
        if (!env.isLocal && sendFrame()) {
          env.send({ k: 'f', b: st.balls.map((b) => [Math.round(b.x), Math.round(b.y)]) });
        }
        const stopped = st.balls.every((b, i) => st.holed[i] || (b.vx === 0 && b.vy === 0));
        if (stopped) {
          if (!st.holed[st.shooter] && st.hs[st.shooter] >= MAX_STROKES) {
            st.holed[st.shooter] = true;
          }
          nextTurnOrHole();
        }
      },
      draw(ctx) {
        if (!st) return;
        const now = performance.now();
        if (gl && T3) {
          render3d(now);
          if (myMove() && drag && aim3d.power > 0.01) {
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
