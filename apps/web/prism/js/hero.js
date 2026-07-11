/* ============================================================
   PRISM — hero.js
   Fixed WebGL backdrop: a screen exploding into its component
   frames, a beam dispersing into the spectrum, ambient dust
   that follows the glow path's hue for the whole page.
   ============================================================ */
import * as THREE from 'three';

(function () {
  'use strict';

  var host = document.getElementById('gl');
  if (!host || !window.WebGLRenderingContext) return;

  var params = new URLSearchParams(location.search);
  var REDUCED = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var FLAT = params.has('flat') || REDUCED;
  var isHome = document.body.getAttribute('data-page') === 'home';

  var W = window.innerWidth, H = window.innerHeight;
  var MOBILE = W < 721;

  var renderer;
  try {
    renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'high-performance' });
  } catch (e) { return; }
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, MOBILE ? 1.5 : 2));
  renderer.setSize(W, H);
  host.appendChild(renderer.domElement);

  var scene = new THREE.Scene();
  var camera = new THREE.PerspectiveCamera(45, W / H, 0.1, 100);
  camera.position.set(0, 0, 8.5);

  var SPECTRUM = ['#8b6cff', '#5d8bff', '#34e8a9', '#ffb454', '#ff5c8a'];

  /* ---------- soft radial sprite texture ---------- */
  function glowTexture() {
    var c = document.createElement('canvas'); c.width = c.height = 128;
    var x = c.getContext('2d');
    var g = x.createRadialGradient(64, 64, 0, 64, 64, 64);
    g.addColorStop(0, 'rgba(255,255,255,1)');
    g.addColorStop(0.35, 'rgba(255,255,255,.35)');
    g.addColorStop(1, 'rgba(255,255,255,0)');
    x.fillStyle = g; x.fillRect(0, 0, 128, 128);
    var t = new THREE.CanvasTexture(c);
    return t;
  }
  var GLOW_TEX = glowTexture();

  /* ---------- rounded-rect line frame ---------- */
  function roundedRectPoints(w, h, r) {
    var pts = [], seg = 6, hw = w / 2, hh = h / 2;
    function arc(cx, cy, a0, a1) {
      for (var i = 0; i <= seg; i++) {
        var a = a0 + (a1 - a0) * (i / seg);
        pts.push(new THREE.Vector3(cx + Math.cos(a) * r, cy + Math.sin(a) * r, 0));
      }
    }
    arc(hw - r, hh - r, 0, Math.PI / 2);
    arc(-hw + r, hh - r, Math.PI / 2, Math.PI);
    arc(-hw + r, -hh + r, Math.PI, Math.PI * 1.5);
    arc(hw - r, -hh + r, Math.PI * 1.5, Math.PI * 2);
    return pts;
  }

  function makeFrame(w, h, color, fillOpacity) {
    var g = new THREE.Group();
    var line = new THREE.LineLoop(
      new THREE.BufferGeometry().setFromPoints(roundedRectPoints(w, h, Math.min(w, h) * 0.14)),
      new THREE.LineBasicMaterial({ color: color, transparent: true, opacity: 0.85, blending: THREE.AdditiveBlending, depthWrite: false })
    );
    var fill = new THREE.Mesh(
      new THREE.PlaneGeometry(w, h),
      new THREE.MeshBasicMaterial({ color: color, transparent: true, opacity: fillOpacity || 0.03, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide })
    );
    g.add(fill); g.add(line);
    g.userData.line = line; g.userData.fill = fill;
    return g;
  }

  /* ---------- the exploding screen ---------- */
  var screenGroup = new THREE.Group();
  var FRAMES = [
    { w: 2.35, h: 4.7, x: 0, y: 0, z: 0.0, c: '#c9cbe0', f: 0.015 },      // screen
    { w: 1.95, h: 0.52, x: 0, y: 1.8, z: 0.7, c: SPECTRUM[0], f: 0.05 },  // header
    { w: 1.95, h: 1.35, x: 0, y: 0.62, z: 1.3, c: SPECTRUM[1], f: 0.04 }, // hero-banner
    { w: 0.9, h: 0.95, x: -0.53, y: -0.78, z: 1.9, c: SPECTRUM[2], f: 0.05 }, // card
    { w: 0.9, h: 0.95, x: 0.53, y: -0.78, z: 1.9, c: SPECTRUM[3], f: 0.05 },  // card
    { w: 1.15, h: 0.4, x: 0, y: -1.85, z: 2.5, c: SPECTRUM[4], f: 0.07 }  // button
  ];
  var frameObjs = FRAMES.map(function (d) {
    var f = makeFrame(d.w, d.h, d.c, d.f);
    f.position.set(d.x, d.y, d.z);
    f.userData.base = d;
    screenGroup.add(f);
    return f;
  });
  // inner detail lines inside header/hero (tiny bars)
  [{ w: 0.5, h: 0.14, x: -0.6, y: 1.8, z: 0.72 }, { w: 0.9, h: 0.12, x: -0.4, y: 0.95, z: 1.32 }, { w: 0.62, h: 0.12, x: -0.54, y: 0.7, z: 1.32 }].forEach(function (d) {
    var b = makeFrame(d.w, d.h, '#9aa0c0', 0.05);
    b.position.set(d.x, d.y, d.z);
    b.userData.base = d; b.userData.detail = true;
    screenGroup.add(b); frameObjs.push(b);
  });

  screenGroup.rotation.set(0.1, -0.5, 0.02);
  scene.add(screenGroup);

  /* ---------- prism + beam + strands ---------- */
  var beamGroup = new THREE.Group();
  var prismPoint = new THREE.Vector3(-3.6, 0.35, 0.6);

  // wireframe triangular prism
  var prismGeo = new THREE.CylinderGeometry(0.42, 0.42, 0.7, 3, 1);
  var prismEdges = new THREE.LineSegments(
    new THREE.EdgesGeometry(prismGeo),
    new THREE.LineBasicMaterial({ color: '#eaebf4', transparent: true, opacity: 0.8, blending: THREE.AdditiveBlending, depthWrite: false })
  );
  prismEdges.position.copy(prismPoint);
  prismEdges.rotation.z = Math.PI / 2;
  beamGroup.add(prismEdges);

  var prismSprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: GLOW_TEX, color: '#ffffff', transparent: true, opacity: 0.5, blending: THREE.AdditiveBlending, depthWrite: false }));
  prismSprite.scale.set(1.6, 1.6, 1);
  prismSprite.position.copy(prismPoint);
  beamGroup.add(prismSprite);

  // incoming white beam
  var beamIn = new THREE.Line(
    new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(-14, 0.35, 0.6), prismPoint]),
    new THREE.LineBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0.75, blending: THREE.AdditiveBlending, depthWrite: false })
  );
  beamGroup.add(beamIn);

  // dispersed strands → one per spectral hue, aimed at component frames
  var strandTargets = [1, 2, 3, 4, 5]; // FRAMES indices
  var strands = strandTargets.map(function (fi, i) {
    var target = new THREE.Vector3();
    var mat = new THREE.LineBasicMaterial({ color: SPECTRUM[i], transparent: true, opacity: 0.55, blending: THREE.AdditiveBlending, depthWrite: false });
    var geo = new THREE.BufferGeometry().setFromPoints(new Array(40).fill(0).map(function () { return new THREE.Vector3(); }));
    var line = new THREE.Line(geo, mat);
    line.userData = { fi: fi, i: i, target: target };
    beamGroup.add(line);
    var tip = new THREE.Sprite(new THREE.SpriteMaterial({ map: GLOW_TEX, color: SPECTRUM[i], transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false }));
    tip.scale.set(0.45, 0.45, 1);
    line.userData.tip = tip;
    beamGroup.add(tip);
    return line;
  });
  scene.add(beamGroup);

  function updateStrands() {
    var v = new THREE.Vector3();
    strands.forEach(function (line) {
      var f = frameObjs[line.userData.fi];
      f.getWorldPosition(v);
      var pos = line.geometry.attributes.position;
      var mid = new THREE.Vector3(
        (prismPoint.x + v.x) / 2 - 0.6,
        (prismPoint.y + v.y) / 2 + (line.userData.i - 2) * 0.55,
        (prismPoint.z + v.z) / 2
      );
      var curve = new THREE.QuadraticBezierCurve3(prismPoint, mid, v);
      var pts = curve.getPoints(pos.count - 1);
      for (var i = 0; i < pos.count; i++) pos.setXYZ(i, pts[i].x, pts[i].y, pts[i].z);
      pos.needsUpdate = true;
      line.userData.tip.position.copy(v);
    });
  }

  /* ---------- ambient dust ---------- */
  var DUST_N = MOBILE ? 260 : 620;
  var dustGeo = new THREE.BufferGeometry();
  var dustPos = new Float32Array(DUST_N * 3);
  var dustVel = new Float32Array(DUST_N * 3);
  for (var i = 0; i < DUST_N; i++) {
    dustPos[i * 3] = (Math.random() - 0.5) * 26;
    dustPos[i * 3 + 1] = (Math.random() - 0.5) * 16;
    dustPos[i * 3 + 2] = (Math.random() - 0.5) * 9 - 1;
    dustVel[i * 3] = (Math.random() - 0.5) * 0.0035;
    dustVel[i * 3 + 1] = (Math.random() - 0.5) * 0.0028;
    dustVel[i * 3 + 2] = (Math.random() - 0.5) * 0.0015;
  }
  dustGeo.setAttribute('position', new THREE.BufferAttribute(dustPos, 3));
  var dustMat = new THREE.PointsMaterial({
    size: 0.045, map: GLOW_TEX, transparent: true, opacity: 0.5,
    color: new THREE.Color('#8b6cff'), blending: THREE.AdditiveBlending, depthWrite: false
  });
  scene.add(new THREE.Points(dustGeo, dustMat));

  /* ---------- hue reactions from the glow path ---------- */
  var tintTarget = new THREE.Color('#8b6cff');
  window.addEventListener('glow:tint', function (e) {
    if (e.detail && e.detail.color) {
      try { tintTarget.set(e.detail.color.trim()); } catch (err) {}
    }
  });

  /* ---------- layout ---------- */
  function layout() {
    W = window.innerWidth; H = window.innerHeight;
    MOBILE = W < 721;
    renderer.setSize(W, H);
    camera.aspect = W / H;
    camera.updateProjectionMatrix();
    if (W / H > 1.05) {
      screenGroup.position.set(2.35, 0, 0);
      screenGroup.scale.setScalar(1);
      beamGroup.visible = true;
      // keep the prism fully inside the viewport, near the left edge
      var halfW = Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)) * camera.position.z * camera.aspect;
      prismPoint.x = -Math.max(2.2, halfW * 0.72);
      prismEdges.position.copy(prismPoint);
      prismSprite.position.copy(prismPoint);
      var bp = beamIn.geometry.attributes.position;
      bp.setXYZ(0, prismPoint.x - 11, prismPoint.y, prismPoint.z);
      bp.setXYZ(1, prismPoint.x, prismPoint.y, prismPoint.z);
      bp.needsUpdate = true;
    } else {
      screenGroup.position.set(0, 0.4, -1);
      screenGroup.scale.setScalar(0.8);
      beamGroup.visible = false;
    }
  }
  layout();
  window.addEventListener('resize', layout);

  /* ---------- mouse parallax ---------- */
  var mx = 0, my = 0, tmx = 0, tmy = 0;
  window.addEventListener('pointermove', function (e) {
    tmx = (e.clientX / W - 0.5) * 2;
    tmy = (e.clientY / H - 0.5) * 2;
  }, { passive: true });

  /* ---------- animate ---------- */
  var clock = new THREE.Clock();
  var running = true;

  document.addEventListener('visibilitychange', function () {
    running = !document.hidden;
    if (running && !FLAT) { clock.getDelta(); tick(); }
  });

  function scrollProgress() {
    if (!isHome) return 1.2; // feature pages: dust only
    return Math.min(1.2, (window.scrollY || 0) / (H * 1.05));
  }

  function tick() {
    if (!running) return;
    if (!FLAT) requestAnimationFrame(tick);
    var t = clock.getElapsedTime();
    var p = scrollProgress();
    var fade = Math.max(0, 1 - p * 1.15);

    // idle breathing: assemble ↔ explode
    var e = 0.62 + 0.38 * (0.5 + 0.5 * Math.sin(t * 0.4));
    var spread = e + p * 1.6;

    frameObjs.forEach(function (f) {
      var b = f.userData.base;
      f.position.z = b.z * spread;
      f.position.x = b.x * (1 + p * 0.6);
      f.position.y = b.y * (1 + p * 0.35) + Math.sin(t * 0.8 + b.z * 2) * 0.03;
      var portraitDim = beamGroup.visible ? 1 : 0.4; // portrait: text leads, scene recedes
      var lineOp = (f.userData.detail ? 0.5 : 0.85) * fade * portraitDim;
      f.userData.line.material.opacity = lineOp;
      f.userData.fill.material.opacity = (b.f || 0.03) * fade;
    });

    screenGroup.rotation.y = -0.5 + mx * 0.09 + Math.sin(t * 0.22) * 0.03;
    screenGroup.rotation.x = 0.1 + my * 0.06;
    screenGroup.position.y = (W / H > 1.05 ? 0 : 0.4) + p * 1.4;

    prismEdges.rotation.y = t * 0.5;
    prismEdges.material.opacity = 0.8 * fade;
    prismSprite.material.opacity = (0.35 + 0.2 * (0.5 + 0.5 * Math.sin(t * 1.4))) * fade;
    beamIn.material.opacity = 0.7 * fade;
    strands.forEach(function (l) {
      l.material.opacity = 0.55 * fade;
      l.userData.tip.material.opacity = (0.55 + 0.35 * Math.sin(t * 2 + l.userData.i)) * fade;
    });
    if (beamGroup.visible && fade > 0.01) updateStrands();

    mx += (tmx - mx) * 0.05;
    my += (tmy - my) * 0.05;

    // dust drift + hue follow
    var posAttr = dustGeo.attributes.position;
    for (var i = 0; i < DUST_N; i++) {
      var ix = i * 3;
      dustPos[ix] += dustVel[ix]; dustPos[ix + 1] += dustVel[ix + 1]; dustPos[ix + 2] += dustVel[ix + 2];
      if (dustPos[ix] > 13) dustPos[ix] = -13; if (dustPos[ix] < -13) dustPos[ix] = 13;
      if (dustPos[ix + 1] > 8) dustPos[ix + 1] = -8; if (dustPos[ix + 1] < -8) dustPos[ix + 1] = 8;
    }
    posAttr.needsUpdate = true;
    dustMat.color.lerp(tintTarget, 0.04);

    renderer.render(scene, camera);
  }

  if (FLAT) {
    // deterministic static frame for screenshots
    updateStrands();
    tick();
    setTimeout(tick, 60);
  } else {
    tick();
  }
})();
