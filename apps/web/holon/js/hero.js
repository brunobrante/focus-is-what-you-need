/* ============================================================
   HOLON hero — a screen exploding into its component tree
   Three.js line-frame scene, ember subject, bone context
   ============================================================ */
import * as THREE from 'three';

const canvas = document.getElementById('gl');
const FLAT = document.documentElement.classList.contains('flat') ||
  document.documentElement.classList.contains('no-motion');

if (canvas && !FLAT) {
  try { init(); } catch (e) { canvas.style.display = 'none'; }
}

function init() {
  const INK = new THREE.Color('#0c0b09');
  const BONE = new THREE.Color('#f2efe6');
  const EMBER = new THREE.Color('#ff5a2d');
  const BLUE = new THREE.Color('#6f8dff');

  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  renderer.setClearColor(INK, 1);

  const scene = new THREE.Scene();
  scene.fog = new THREE.Fog(INK, 9, 20);

  const camera = new THREE.PerspectiveCamera(35, 1, 0.1, 60);
  camera.position.set(0, 0, 12.5);

  const root = new THREE.Group();
  scene.add(root);

  /* ----- rounded-rect frame factory ----- */
  function roundedRectShape(w, h, r) {
    const s = new THREE.Shape();
    const x = -w / 2, y = -h / 2;
    s.moveTo(x + r, y);
    s.lineTo(x + w - r, y);
    s.quadraticCurveTo(x + w, y, x + w, y + r);
    s.lineTo(x + w, y + h - r);
    s.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
    s.lineTo(x + r, y + h);
    s.quadraticCurveTo(x, y + h, x, y + h - r);
    s.lineTo(x, y + r);
    s.quadraticCurveTo(x, y, x + r, y);
    return s;
  }

  function frame({ x = 0, y = 0, w, h, layer = 0, color = BONE, borderOp = 0.35, fillOp = 0.03, fillColor = null }) {
    const g = new THREE.Group();
    const shape = roundedRectShape(w, h, Math.min(0.16, h / 3));
    const pts = shape.getPoints(10);
    const line = new THREE.LineLoop(
      new THREE.BufferGeometry().setFromPoints(pts),
      new THREE.LineBasicMaterial({ color, transparent: true, opacity: borderOp })
    );
    g.add(line);
    if (fillOp > 0) {
      const fill = new THREE.Mesh(
        new THREE.ShapeGeometry(shape),
        new THREE.MeshBasicMaterial({
          color: fillColor || color, transparent: true, opacity: fillOp,
          side: THREE.DoubleSide, depthWrite: false
        })
      );
      g.add(fill);
    }
    g.position.set(x, y, 0);
    g.userData.layer = layer;
    root.add(g);
    return g;
  }

  /* ----- the screen tree ----- */
  frame({ w: 3.9, h: 7.0, layer: 0, borderOp: 0.5, fillOp: 0.02 });                              // screen (root)
  frame({ y: 3.0, w: 3.5, h: 0.6, layer: 1, borderOp: 0.4, fillOp: 0.04 });                      // header
  frame({ x: -1.28, y: 3.0, w: 0.7, h: 0.34, layer: 2, borderOp: 0.35 });                        // logo
  frame({ y: 1.7, w: 3.5, h: 2.0, layer: 1, color: EMBER, borderOp: 0.9, fillOp: 0.07, fillColor: EMBER }); // hero — the subject
  frame({ x: -0.9, y: 1.12, w: 1.3, h: 0.44, layer: 2, color: EMBER, borderOp: 1, fillOp: 0.22, fillColor: EMBER }); // button
  frame({ x: -0.925, y: -0.35, w: 1.65, h: 1.5, layer: 1, borderOp: 0.35, fillOp: 0.03 });       // card A
  frame({ x: 0.925, y: -0.35, w: 1.65, h: 1.5, layer: 1, color: BLUE, borderOp: 0.5, fillOp: 0.04, fillColor: BLUE }); // card B (linked)
  frame({ y: -1.95, w: 3.5, h: 1.3, layer: 1, borderOp: 0.35, fillOp: 0.03 });                   // list
  frame({ y: -3.05, w: 3.5, h: 0.5, layer: 1, borderOp: 0.3 });                                  // tab bar

  /* ----- dust ----- */
  const N = 260;
  const pos = new Float32Array(N * 3);
  const col = new Float32Array(N * 3);
  for (let i = 0; i < N; i++) {
    pos[i * 3] = (Math.random() - 0.5) * 18;
    pos[i * 3 + 1] = (Math.random() - 0.5) * 12;
    pos[i * 3 + 2] = (Math.random() - 0.5) * 10 - 1;
    const c = Math.random() < 0.12 ? EMBER : BONE;
    col[i * 3] = c.r; col[i * 3 + 1] = c.g; col[i * 3 + 2] = c.b;
  }
  const dustGeo = new THREE.BufferGeometry();
  dustGeo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  dustGeo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  const dust = new THREE.Points(dustGeo, new THREE.PointsMaterial({
    size: 0.035, vertexColors: true, transparent: true, opacity: 0.5,
    blending: THREE.AdditiveBlending, depthWrite: false
  }));
  scene.add(dust);

  /* ----- layout / interaction state ----- */
  let W = 0, H = 0, wide = true;
  function resize() {
    W = innerWidth; H = innerHeight;
    wide = W / H > 0.9;
    renderer.setSize(W, H);
    camera.aspect = W / H;
    camera.updateProjectionMatrix();
    root.position.x = wide ? 2.6 : 0;
    root.position.y = wide ? 0.2 : 1.7;
    root.scale.setScalar(wide ? 1 : 0.62);
  }
  resize();
  addEventListener('resize', resize);

  let mx = 0, my = 0, tmx = 0, tmy = 0;
  addEventListener('pointermove', (e) => {
    tmx = (e.clientX / W - 0.5) * 2;
    tmy = (e.clientY / H - 0.5) * 2;
  }, { passive: true });

  let explode = 0, tExplode = 0, fade = 1;
  function onScroll() {
    const s = scrollY || 0;
    tExplode = Math.min(1, s / (H * 0.85));
    fade = Math.max(0, 1 - s / (H * 1.25));
    canvas.style.opacity = fade.toFixed(3);
  }
  addEventListener('scroll', onScroll, { passive: true });
  onScroll();

  /* ----- render loop ----- */
  const clock = new THREE.Clock();
  const BASE_Y = -0.55, BASE_X = 0.12;
  function tick() {
    requestAnimationFrame(tick);
    if (fade <= 0.005) return; // parked below the hero — skip work
    const t = clock.getElapsedTime();
    mx += (tmx - mx) * 0.04;
    my += (tmy - my) * 0.04;
    explode += (tExplode - explode) * 0.06;

    const spread = 0.42 + explode * 1.35 + Math.sin(t * 0.8) * 0.05;
    root.children.forEach((g) => {
      g.position.z = g.userData.layer * spread;
    });
    root.rotation.y = BASE_Y + mx * 0.1 + Math.sin(t * 0.35) * 0.035;
    root.rotation.x = BASE_X + my * 0.07 + Math.cos(t * 0.28) * 0.02;
    root.position.z = explode * -1.6;
    dust.rotation.y = t * 0.014;

    renderer.render(scene, camera);
  }
  tick();
}
