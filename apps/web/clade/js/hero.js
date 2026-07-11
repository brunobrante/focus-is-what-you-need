/* CLADE hero — a screen drawn in ink, dissected into its components on scroll.
   Renders on the fixed #gl canvas; labels are HTML nodes projected from 3D. */
import * as THREE from 'three';

const canvas = document.getElementById('gl');
if (canvas) init();

function init() {
  const INK = 0x1a1d14;
  const MOSS = 0x2e6f33;
  const FILL = 0xfbfaf4;
  const flat = window.__FLAT || window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  const renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true });
  renderer.setClearColor(0x000000, 0);
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(34, 1, 0.1, 100);
  camera.position.set(0, 0, 17.5);

  const root = new THREE.Group();      // world placement (responsive offset)
  const rig = new THREE.Group();       // base iso rotation + mouse parallax
  const tree = new THREE.Group();      // the screen and its parts
  rig.add(tree); root.add(rig); scene.add(root);
  rig.rotation.set(-0.1, 0.42, 0.02);

  // ---------- helpers ----------
  function roundedRectShape(w, h, r) {
    const s = new THREE.Shape();
    const x = -w / 2, y = -h / 2;
    s.moveTo(x + r, y);
    s.lineTo(x + w - r, y); s.quadraticCurveTo(x + w, y, x + w, y + r);
    s.lineTo(x + w, y + h - r); s.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
    s.lineTo(x + r, y + h); s.quadraticCurveTo(x, y + h, x, y + h - r);
    s.lineTo(x, y + r); s.quadraticCurveTo(x, y, x + r, y);
    return s;
  }

  function panel(w, h, r, opts = {}) {
    const g = new THREE.Group();
    const shape = roundedRectShape(w, h, r);
    if (!opts.noFill) {
      const fill = new THREE.Mesh(
        new THREE.ShapeGeometry(shape, 10),
        new THREE.MeshBasicMaterial({
          color: opts.fill ?? FILL, transparent: true,
          opacity: opts.fillOpacity ?? 0.94, side: THREE.DoubleSide,
        })
      );
      g.add(fill);
    }
    const pts = shape.getPoints(48);
    const line = new THREE.Line(
      new THREE.BufferGeometry().setFromPoints(pts),
      new THREE.LineBasicMaterial({
        color: opts.stroke ?? INK, transparent: true, opacity: opts.strokeOpacity ?? 0.9,
      })
    );
    line.position.z = 0.005;
    g.add(line);
    return g;
  }

  // ---------- the screen tree ----------
  // Base: phone frame 3.9 x 8.44 (390x844). Children explode along +Z.
  const parts = [];
  function addPart(mesh, home, out, delay) {
    mesh.position.copy(home);
    tree.add(mesh);
    parts.push({ mesh, home, out, delay });
    return mesh;
  }

  const screenP = panel(3.9, 8.44, 0.42, { strokeOpacity: 1, fillOpacity: 0.9 });
  addPart(screenP, new THREE.Vector3(0, 0, 0), new THREE.Vector3(0, 0, -0.6), 0);

  const headerP = panel(3.34, 0.62, 0.14);
  addPart(headerP, new THREE.Vector3(0, 3.6, 0.02), new THREE.Vector3(-0.35, 4.05, 1.5), 0.05);
  // header children (deeper level, explode later)
  const logoDot = panel(0.3, 0.3, 0.15, { fill: MOSS, fillOpacity: 1, stroke: MOSS });
  addPart(logoDot, new THREE.Vector3(-1.32, 3.6, 0.04), new THREE.Vector3(-2.35, 4.5, 2.6), 0.42);
  const navLine = panel(1.0, 0.12, 0.06, { fill: INK, fillOpacity: 0.36, stroke: INK, strokeOpacity: 0.25 });
  addPart(navLine, new THREE.Vector3(-0.2, 3.6, 0.04), new THREE.Vector3(-0.55, 4.75, 2.6), 0.48);
  const searchPill = panel(0.62, 0.26, 0.13, { fill: 0xe1dcc9, fillOpacity: 1, stroke: INK, strokeOpacity: 0.5 });
  addPart(searchPill, new THREE.Vector3(1.3, 3.6, 0.04), new THREE.Vector3(1.7, 4.7, 2.6), 0.54);

  const heroP = panel(3.34, 2.7, 0.16, { fill: 0xe4ecdd, fillOpacity: 0.97 });
  addPart(heroP, new THREE.Vector3(0, 1.55, 0.02), new THREE.Vector3(-0.85, 1.75, 2.1), 0.14);
  const heroLine = panel(1.9, 0.14, 0.07, { fill: INK, fillOpacity: 0.5, stroke: INK, strokeOpacity: 0.3 });
  addPart(heroLine, new THREE.Vector3(-0.5, 0.9, 0.04), new THREE.Vector3(-1.5, 0.55, 3.1), 0.6);

  const cardXs = [-1.12, 0, 1.12];
  cardXs.forEach((cx, i) => {
    const card = panel(1.02, 1.5, 0.12);
    addPart(card,
      new THREE.Vector3(cx, -0.9, 0.02),
      new THREE.Vector3(cx * 1.9, -1.05 - i * 0.12, 1.4 + i * 0.5),
      0.2 + i * 0.06);
  });

  [0, 1].forEach((i) => {
    const row = panel(3.34, 0.72, 0.12);
    addPart(row,
      new THREE.Vector3(0, -2.35 - i * 0.92, 0.02),
      new THREE.Vector3(0.55 + i * 0.3, -2.9 - i * 1.15, 0.9 + i * 0.35),
      0.3 + i * 0.08);
  });

  // ---------- dust: tiny plus-marks for depth ----------
  const dust = new THREE.Group();
  const dustMat = new THREE.LineBasicMaterial({ color: INK, transparent: true, opacity: 0.28 });
  const rnd = seeded(7);
  for (let i = 0; i < 42; i++) {
    const s = 0.05 + rnd() * 0.06;
    const geo = new THREE.BufferGeometry().setFromPoints([
      new THREE.Vector3(-s, 0, 0), new THREE.Vector3(s, 0, 0),
      new THREE.Vector3(0, 0, 0),
      new THREE.Vector3(0, -s, 0), new THREE.Vector3(0, s, 0),
    ]);
    const m = new THREE.Line(geo, dustMat);
    m.position.set((rnd() - 0.5) * 17, (rnd() - 0.5) * 12, -2 - rnd() * 5);
    dust.add(m);
  }
  scene.add(dust);

  function seeded(a) {
    return function () {
      a |= 0; a = (a + 0x6D2B79F5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  // ---------- HTML labels projected from 3D ----------
  const labelLayer = document.getElementById('hero-labels');
  const labels = [
    { text: 'screen · <b>390 × 844</b>', anchor: new THREE.Vector3(-1.95, 4.22, 0), at: 0.04, obj: screenP },
    { text: 'header · <b>component</b>', anchor: new THREE.Vector3(1.67, 0.31, 0), at: 0.3, obj: headerP },
    { text: 'hero · <b>component</b>', anchor: new THREE.Vector3(1.67, 0, 0), at: 0.42, obj: heroP },
    { text: 'logo · <b>child of header</b>', anchor: new THREE.Vector3(0.15, 0.15, 0), at: 0.72, obj: logoDot },
  ].map((l) => {
    const el = document.createElement('span');
    el.className = 'hero-label';
    el.innerHTML = l.text;
    labelLayer.appendChild(el);
    return { ...l, el };
  });

  const de = document.documentElement;
  const v3 = new THREE.Vector3();
  function placeLabels(p, alpha) {
    const w = de.clientWidth, h = de.clientHeight;
    labels.forEach((l) => {
      const on = p > l.at ? Math.min(1, (p - l.at) / 0.1) : 0;
      const o = on * alpha;
      l.el.style.opacity = o.toFixed(3);
      if (o <= 0.01) return;
      v3.copy(l.anchor);
      l.obj.localToWorld(v3);
      v3.project(camera);
      const x = (v3.x * 0.5 + 0.5) * w + 14;
      const y = (-v3.y * 0.5 + 0.5) * h - 8;
      l.el.style.transform = `translate(${x.toFixed(1)}px, ${y.toFixed(1)}px)`;
    });
  }

  // ---------- explode ----------
  const tmp = new THREE.Vector3();
  function setExplode(p) {
    for (const part of parts) {
      const local = clamp01((p - part.delay) / (1 - part.delay || 1));
      const e = easeInOut(local);
      tmp.lerpVectors(part.home, part.out, e);
      part.mesh.position.copy(tmp);
    }
  }
  const clamp01 = (v) => Math.max(0, Math.min(1, v));
  const easeInOut = (t) => t * t * (3 - 2 * t);

  // ---------- responsive placement ----------
  function layout() {
    const w = de.clientWidth, h = de.clientHeight;
    const dpr = Math.min(devicePixelRatio || 1, w < 700 ? 1.6 : 2);
    renderer.setPixelRatio(dpr);
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    if (w / h > 1.05) {           // desktop: scene sits right of the copy
      root.position.set(3.3, 0.2, 0);
      root.scale.setScalar(Math.min(1, (w / h) / 1.7));
    } else {                       // portrait: scene floats above the copy
      root.position.set(0.35, 3.55, 0);
      root.scale.setScalar(Math.min(0.38, w / 1050));
    }
  }
  layout();
  addEventListener('resize', layout);

  // ---------- pointer parallax ----------
  let px = 0, py = 0, tx = 0, ty = 0;
  addEventListener('pointermove', (e) => {
    tx = (e.clientX / de.clientWidth - 0.5) * 2;
    ty = (e.clientY / de.clientHeight - 0.5) * 2;
  }, { passive: true });

  // ---------- scroll mapping ----------
  const vh = () => de.clientHeight;
  function progress() {
    // explode over the hero runway (0 → 1.4vh), fade the canvas 1.45→1.85vh
    const y = window.scrollY;
    const p = clamp01(y / (vh() * 1.4));
    const fade = 1 - clamp01((y - vh() * 1.45) / (vh() * 0.4));
    return { p, fade };
  }

  let clock = new THREE.Clock();
  function frame() {
    const { p, fade } = progress();
    canvas.style.opacity = fade.toFixed(3);
    if (fade <= 0) { placeLabels(0, 0); return; }   // fully scrolled past — skip draw
    const t = clock.getElapsedTime();
    px += (tx - px) * 0.04; py += (ty - py) * 0.04;
    rig.rotation.y = 0.42 + px * 0.09 + Math.sin(t * 0.4) * 0.015;
    rig.rotation.x = -0.1 + py * 0.06 + Math.cos(t * 0.5) * 0.012;
    tree.position.y = Math.sin(t * 0.8) * 0.05;
    setExplode(p * 0.92 + 0.04);
    dust.position.y = window.scrollY / vh() * 1.6;
    renderer.render(scene, camera);
    placeLabels(p * 0.92 + 0.04, fade);
  }

  if (flat) {
    setExplode(0.62);
    rig.rotation.set(-0.1, 0.42, 0.02);
    renderer.render(scene, camera);
    placeLabels(0.62, 1);
    addEventListener('resize', () => { layout(); renderer.render(scene, camera); placeLabels(0.62, 1); });
  } else {
    renderer.setAnimationLoop(frame);
  }
}
