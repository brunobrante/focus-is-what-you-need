/* CLADE — interaction layer.
   Serves both page types via body[data-page]. Dev mode: ?flat disables all
   animation/pins and forces final states; ?flat=<n|selector> jumps to a
   section; &panel=<k> forces a journey panel. */
(function () {
  'use strict';

  var qs = new URLSearchParams(location.search);
  var reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
  var FLAT = qs.has('flat') || reduced;
  window.__FLAT = FLAT;

  var page = document.body.dataset.page || 'index';
  // CSS layout viewport — innerWidth can disagree with 100vw in embedded previews
  var vw = function () { return document.documentElement.clientWidth; };
  var vh = function () { return document.documentElement.clientHeight; };
  var mobile = function () { return vw() < 900; };

  gsap.registerPlugin(ScrollTrigger);

  /* ================= page wipe (transitions) ================= */
  var wipe = document.getElementById('wipe');
  var wipeSpans = wipe ? wipe.querySelectorAll('span') : [];

  // entrance: only when arriving through a transition
  var hadWipe = !!(wipe && sessionStorage.getItem('clade-wipe'));
  if (hadWipe) {
    sessionStorage.removeItem('clade-wipe');
    wipe.classList.add('is-out');
    wipeSpans.forEach(function (s) { s.style.transform = 'scaleY(1)'; });
    gsap.to(wipeSpans, {
      scaleY: 0, duration: 0.75, ease: 'power3.inOut', stagger: 0.07, delay: 0.1,
      onComplete: function () { wipe.classList.remove('is-out'); }
    });
    // hidden-tab fallback: never leave the curtain down
    setTimeout(function () {
      wipeSpans.forEach(function (s) { s.style.transform = 'scaleY(0)'; });
      wipe.classList.remove('is-out');
    }, 1400);
  }

  document.querySelectorAll('a[data-transition]').forEach(function (a) {
    a.addEventListener('click', function (e) {
      if (FLAT) return; // plain navigation in flat mode
      e.preventDefault();
      var href = a.getAttribute('href');
      var done = false;
      var go = function () { if (done) return; done = true; sessionStorage.setItem('clade-wipe', '1'); location.href = href; };
      gsap.set(wipeSpans, { transformOrigin: 'top', scaleY: 0 });
      gsap.to(wipeSpans, { scaleY: 1, duration: 0.55, ease: 'power3.inOut', stagger: 0.06, onComplete: go });
      setTimeout(go, 950); // rAF-paused tab fallback
    });
  });

  /* ================= smooth scroll ================= */
  var lenis = null;
  if (!FLAT) {
    lenis = new Lenis({ duration: 1.15, smoothWheel: true });
    lenis.on('scroll', ScrollTrigger.update);
    gsap.ticker.add(function (t) { lenis.raf(t * 1000); });
    gsap.ticker.lagSmoothing(0);
  }

  // anchor links via lenis
  document.querySelectorAll('a[href^="#"]').forEach(function (a) {
    a.addEventListener('click', function (e) {
      var target = document.querySelector(a.getAttribute('href'));
      if (!target) return;
      e.preventDefault();
      if (lenis) lenis.scrollTo(target, { offset: 0, duration: 1.4 });
      else target.scrollIntoView();
    });
  });

  /* ================= nav hide/show ================= */
  var nav = document.getElementById('nav');
  var lastY = 0;
  function onScrollY(y) {
    if (!nav) return;
    if (y > 140 && y > lastY + 4) nav.classList.add('is-hidden');
    else if (y < lastY - 4 || y < 140) nav.classList.remove('is-hidden');
    lastY = y;
  }
  if (lenis) lenis.on('scroll', function (e) { onScrollY(e.scroll); });
  else addEventListener('scroll', function () { onScrollY(scrollY); }, { passive: true });

  /* ================= shared: line-mask reveals ================= */
  function revealGroup(scope, opts) {
    var inners = scope.querySelectorAll('.line-mask .line-inner');
    if (!inners.length) return;
    if (FLAT) { gsap.set(inners, { yPercent: 0, y: 0 }); return; }
    gsap.fromTo(inners, { yPercent: 115, y: 0 }, {
      yPercent: 0, y: 0, duration: 1.15, ease: 'power4.out', stagger: 0.1,
      scrollTrigger: { trigger: scope, start: (opts && opts.start) || 'top 74%', once: true }
    });
  }
  function fadeUp(els, trigger, startAt) {
    if (FLAT) { gsap.set(els, { opacity: 1, y: 0 }); return; }
    gsap.fromTo(els, { opacity: 0, y: 28 }, {
      opacity: 1, y: 0, duration: 1, ease: 'power3.out', stagger: 0.09,
      scrollTrigger: { trigger: trigger, start: startAt || 'top 72%', once: true }
    });
  }

  /* ============================================================
     INDEX PAGE
     ============================================================ */
  if (page === 'index') {

    /* ---------- hero content ---------- */
    var heroContent = document.querySelector('.hero-content');
    if (!FLAT) {
      gsap.fromTo('.hero-title .line-inner', { yPercent: 115, y: 0 },
        { yPercent: 0, y: 0, duration: 1.3, ease: 'power4.out', stagger: 0.12, delay: 0.15 });
      gsap.fromTo(['.hero-overline', '.hero-sub', '.hero-ctas'], { opacity: 0, y: 24 },
        { opacity: 1, y: 0, duration: 1.1, ease: 'power3.out', stagger: 0.1, delay: 0.4 });
      gsap.to(heroContent, {
        y: -70, opacity: 0, ease: 'none',
        scrollTrigger: { trigger: '#hero', start: 'top top', end: '38% top', scrub: true }
      });
      gsap.to('.hero-hint', {
        opacity: 0, ease: 'none',
        scrollTrigger: { trigger: '#hero', start: 'top top', end: '15% top', scrub: true }
      });
    } else {
      gsap.set('.hero-title .line-inner', { yPercent: 0, y: 0 });
      gsap.set(['.hero-overline', '.hero-sub', '.hero-ctas'], { opacity: 1, y: 0 });
    }

    /* ---------- manifesto ---------- */
    revealGroup(document.querySelector('#why .section-head'));
    fadeUp(document.querySelectorAll('#why .lede, #why .why-close'), '#why .why-body');
    var strikeRows = document.querySelectorAll('.strike-row');
    if (FLAT) {
      strikeRows.forEach(function (r) { r.classList.add('is-struck'); });
    } else {
      strikeRows.forEach(function (row, i) {
        ScrollTrigger.create({
          trigger: '.strike-board', start: 'top 68%', once: true,
          onEnter: function () {
            setTimeout(function () { row.classList.add('is-struck'); }, 260 * i + 200);
          }
        });
      });
    }

    /* ---------- the law: typed code → formed component ---------- */
    revealGroup(document.querySelector('#law .section-head'));
    fadeUp(document.querySelectorAll('#law .lede'), '#law .section-head');
    var codeEl = document.getElementById('law-code');
    var caret = document.getElementById('law-caret');
    var TOKENS = [];
    (function () {
      // build (char, cssClass) list for syntax-colored typing
      function push(str, cls) { for (var i = 0; i < str.length; i++) TOKENS.push([str[i], cls]); }
      push('<div', 'c-tag'); push(' ', ''); push('id=', 'c-attr'); push('"button"', 'c-str'); push('>', 'c-tag');
      push('\n  ', '');
      push('<div', 'c-tag'); push(' ', ''); push('id=', 'c-attr'); push('"text"', 'c-str'); push('>', 'c-tag');
      push('Button', ''); push('</div>', 'c-tag');
      push('\n', '');
      push('</div>', 'c-tag');
    })();
    function codeHTML(n) {
      var html = '', open = null;
      for (var i = 0; i < n && i < TOKENS.length; i++) {
        var ch = TOKENS[i][0], cls = TOKENS[i][1];
        if (cls !== open) {
          if (open) html += '</span>';
          if (cls) html += '<span class="' + cls + '">';
          open = cls;
        }
        html += ch === '<' ? '&lt;' : ch === '>' ? '&gt;' : ch;
      }
      if (open) html += '</span>';
      return html;
    }
    var lawArrow = document.querySelectorAll('.law-arrow path');
    var formedCard = document.getElementById('formed-card');
    var stamp = document.getElementById('law-stamp');
    if (FLAT) {
      codeEl.innerHTML = codeHTML(TOKENS.length);
      caret.style.display = 'none';
      gsap.set(formedCard, { opacity: 1, y: 0, scale: 1 });
    } else {
      gsap.set(formedCard, { opacity: 0, y: 26, scale: 0.96 });
      var typeState = { n: 0 };
      var lawTl = gsap.timeline({
        scrollTrigger: { trigger: '.law-stage', start: 'top 70%', once: true }
      });
      lawTl.to(typeState, {
        n: TOKENS.length, duration: 2.1, ease: 'none',
        onUpdate: function () { codeEl.innerHTML = codeHTML(Math.round(typeState.n)); }
      })
      .to(lawArrow, { strokeDashoffset: 0, duration: 0.6, ease: 'power2.inOut' }, '+=0.15')
      .to(formedCard, { opacity: 1, y: 0, scale: 1, duration: 0.7, ease: 'back.out(1.6)' }, '-=0.2')
      .to(stamp, { opacity: 1, scale: 1, duration: 0.4, ease: 'back.out(2.5)' }, '-=0.1')
      .set(caret, { display: 'none' }, '<');
    }

    /* ---------- the turn ---------- */
    var turnPath = document.getElementById('turn-path');
    var turnNode = document.getElementById('turn-node');
    if (turnPath) {
      var tlen = turnPath.getTotalLength();
      turnPath.style.strokeDasharray = tlen;
      if (FLAT) {
        turnPath.style.strokeDashoffset = 0;
        turnNode.style.opacity = 1;
      } else {
        turnPath.style.strokeDashoffset = tlen;
        gsap.to(turnPath, {
          strokeDashoffset: 0, ease: 'none',
          scrollTrigger: { trigger: '#turn', start: 'top 80%', end: 'bottom 45%', scrub: true }
        });
        gsap.fromTo(turnNode, { opacity: 0 }, {
          opacity: 1, duration: 0.3,
          scrollTrigger: { trigger: '#turn', start: '55% 60%', once: true }
        });
        gsap.fromTo('.turn-note', { opacity: 0, x: -14 }, {
          opacity: 1, x: 0, duration: 0.8, ease: 'power3.out',
          scrollTrigger: { trigger: '#turn', start: '55% 60%', once: true }
        });
      }
    }

    /* ---------- horizontal journey ---------- */
    var track = document.getElementById('journey-track');
    var panels = gsap.utils.toArray('.panel');
    var branchSvg = document.getElementById('journey-branch');
    // build the growing branch line
    branchSvg.setAttribute('viewBox', '0 0 1000 60');
    branchSvg.innerHTML =
      '<path d="M0 30 H1000" stroke-width="1" opacity=".35"/>' +
      '<path id="branch-live" d="M0 30 H1000" stroke-width="2" style="stroke:var(--moss)"/>' +
      [125, 375, 625, 875].map(function (x, i) {
        return '<circle data-bn="' + i + '" cx="' + x + '" cy="30" r="0"/>';
      }).join('');
    var branchLive = branchSvg.querySelector('#branch-live');
    branchLive.style.strokeDasharray = 1000;
    branchLive.style.strokeDashoffset = 1000;
    var branchNodes = branchSvg.querySelectorAll('circle');

    var forcedPanel = parseInt(qs.get('panel') || '0', 10) || 0;
    if (FLAT) {
      gsap.set(track, { x: -forcedPanel * vw() });
      branchLive.style.strokeDashoffset = 1000 - (forcedPanel + 0.5) * 250;
      branchNodes.forEach(function (c, i) { if (i <= forcedPanel) c.setAttribute('r', 5); });
    } else {
      var journeyScrub = gsap.to(track, {
        x: function () { return -(track.scrollWidth - vw()); },
        ease: 'none',
        scrollTrigger: {
          trigger: '#journey', start: 'top top', pin: true, scrub: 1,
          anticipatePin: 1, invalidateOnRefresh: true,
          end: function () { return '+=' + (track.scrollWidth - vw()) * 1.15; },
          onUpdate: function (st) {
            branchLive.style.strokeDashoffset = 1000 * (1 - st.progress);
            branchNodes.forEach(function (c, i) {
              c.setAttribute('r', st.progress > (i * 250 + 90) / 1000 ? 5 : 0);
            });
          }
        }
      });
      panels.slice(1).forEach(function (panel) {
        gsap.fromTo(panel.querySelector('.panel-copy'), { opacity: 0, y: 44 }, {
          opacity: 1, y: 0, duration: 0.8, ease: 'power3.out',
          scrollTrigger: {
            trigger: panel, containerAnimation: journeyScrub,
            start: 'left 62%', toggleActions: 'play none none reverse'
          }
        });
        gsap.fromTo(panel.querySelector('.panel-stage'), { opacity: 0, scale: 0.94 }, {
          opacity: 1, scale: 1, duration: 0.9, ease: 'power3.out',
          scrollTrigger: {
            trigger: panel, containerAnimation: journeyScrub,
            start: 'left 70%', toggleActions: 'play none none reverse'
          }
        });
      });
      fadeUp(panels[0].querySelectorAll('.panel-copy, .panel-stage'), '#journey', 'top 60%');
    }

    /* ---------- frame law: 1x is the floor ---------- */
    revealGroup(document.querySelector('#frame .section-head'));
    fadeUp(document.querySelectorAll('#frame .lede, #frame .law-foot'), '#frame .section-head');
    var frameDemo = document.getElementById('frame-demo');
    var zoomVal = document.getElementById('zoom-val');
    var zoomMsg = document.getElementById('zoom-msg');
    if (FLAT) {
      zoomVal.textContent = '1.00×';
      zoomMsg.textContent = 'clamped — that’s the floor';
    } else {
      var z = { v: 1.42 };
      function zset() {
        zoomVal.textContent = z.v.toFixed(2) + '×';
        frameDemo.style.transform = 'scale(' + z.v + ')';
      }
      var zoomTl = gsap.timeline({
        scrollTrigger: { trigger: '#frame-stage', start: 'top 62%', once: true }
      });
      zoomTl.call(function () { zoomMsg.textContent = 'zooming out…'; })
        .to(z, { v: 1.0, duration: 1.4, ease: 'power2.inOut', onUpdate: zset })
        .call(function () { zoomMsg.textContent = 'the frame fills the view'; })
        .to(z, { v: 0.93, duration: 0.45, ease: 'power2.in', onUpdate: zset }, '+=0.7')
        .call(function () { zoomMsg.textContent = 'clamped — that’s the floor'; })
        .to(z, { v: 1.0, duration: 0.9, ease: 'elastic.out(1, 0.45)', onUpdate: zset });
    }

    /* ---------- ownership threads ---------- */
    revealGroup(document.querySelector('#ownership .section-head'));
    fadeUp(document.querySelectorAll('#ownership .lede, #ownership .own-close'), '#ownership .section-head');
    var ownStage = document.getElementById('own-stage');
    var threads = document.getElementById('own-threads');
    var master = document.getElementById('own-master');
    var instA = document.getElementById('own-inst-a');
    var instB = document.getElementById('own-inst-b');
    var detachTag = document.getElementById('detach-tag');
    var detachNote = document.getElementById('detach-note');
    var scissors = document.getElementById('scissors');

    function edgeOf(el, side) {
      var s = el.getBoundingClientRect(), o = ownStage.getBoundingClientRect();
      return {
        x: (side === 'left' ? s.left : s.right) - o.left,
        y: s.top + s.height / 2 - o.top
      };
    }
    function threadPath(a, b) {
      var mx = (a.x + b.x) / 2;
      return 'M' + a.x + ' ' + a.y + ' C ' + mx + ' ' + a.y + ', ' + mx + ' ' + b.y + ', ' + b.x + ' ' + b.y;
    }
    var pathA, pathB;
    function drawThreads() {
      var m = edgeOf(master, 'right');
      var a = edgeOf(instA, 'left');
      var b = edgeOf(instB, 'left');
      var o = ownStage.getBoundingClientRect();
      threads.setAttribute('viewBox', '0 0 ' + o.width + ' ' + o.height);
      threads.innerHTML =
        '<path id="thr-a" d="' + threadPath(m, a) + '" style="stroke:var(--ultra)"/>' +
        '<path id="thr-b" d="' + threadPath(m, b) + '" style="stroke:var(--ultra)"/>';
      pathA = threads.querySelector('#thr-a');
      pathB = threads.querySelector('#thr-b');
      [pathA, pathB].forEach(function (p) {
        var L = p.getTotalLength();
        p.style.strokeDasharray = L;
        p.dataset.len = L;
      });
    }
    drawThreads();
    var detached = false;
    if (FLAT) {
      pathA.style.strokeDashoffset = 0;
      pathB.style.strokeDasharray = '5 7';
      pathB.style.opacity = 0.3;
      instB.classList.add('is-detached');
      detachTag.textContent = 'detached';
      detachNote.textContent = 'owned · yours now';
    } else {
      pathA.style.strokeDashoffset = pathA.dataset.len;
      pathB.style.strokeDashoffset = pathB.dataset.len;
      var ownTl = gsap.timeline({
        scrollTrigger: { trigger: '#own-stage', start: 'top 62%', once: true }
      });
      ownTl.to([pathA, pathB], { strokeDashoffset: 0, duration: 1.1, ease: 'power2.inOut', stagger: 0.2 })
        .to(scissors, { opacity: 1, x: 6, duration: 0.4, ease: 'power2.out' }, '+=0.7')
        .to(scissors, { rotate: 12, duration: 0.14, yoyo: true, repeat: 3 })
        .add(function () {
          detached = true;
          pathB.style.strokeDasharray = '5 7';
          instB.classList.add('is-detached');
          detachTag.textContent = 'detached';
          detachNote.textContent = 'owned · yours now';
        })
        .to(pathB, { opacity: 0.28, duration: 0.4 }, '<')
        .to(scissors, { opacity: 0, duration: 0.4 }, '<+=0.2')
        .fromTo(instB, { scale: 1 }, { scale: 1.04, duration: 0.22, yoyo: true, repeat: 1, ease: 'power2.out' }, '<');
    }
    addEventListener('resize', function () {
      var wasDetached = FLAT || detached;
      drawThreads();
      pathA.style.strokeDashoffset = 0;
      if (wasDetached) { pathB.style.strokeDasharray = '5 7'; pathB.style.opacity = 0.28; }
      else pathB.style.strokeDashoffset = 0;
    });

    /* ---------- versions: the crown moves ---------- */
    revealGroup(document.querySelector('#versions .section-head'));
    fadeUp(document.querySelectorAll('#versions .lede, #versions .law-foot'), '#versions .section-head');
    var versStage = document.getElementById('vers-stage');
    var cardMain = versStage.querySelector('[data-vers="0"]');
    var cardV2 = versStage.querySelector('[data-vers="1"]');
    var roleMain = cardMain.querySelector('[data-role]');
    var roleV2 = cardV2.querySelector('[data-role]');
    function promote() {
      versStage.classList.add('is-promoted');
      cardMain.classList.remove('is-main');
      cardV2.classList.add('is-main');
      roleMain.textContent = 'version — points at the new main';
      roleV2.textContent = 'main — owns its components';
    }
    cardMain.classList.add('is-main');
    if (FLAT) {
      promote();
      document.getElementById('crown-a').style.opacity = 0;
      document.getElementById('crown-b').style.opacity = 1;
    } else {
      var versTl = gsap.timeline({
        scrollTrigger: { trigger: '#vers-stage', start: 'top 62%', once: true }
      });
      versTl.fromTo(versStage.children, { opacity: 0, y: 30 },
          { opacity: 1, y: 0, duration: 0.8, ease: 'power3.out', stagger: 0.12 })
        .to('#crown-a', { y: -26, opacity: 0, duration: 0.5, ease: 'power2.in' }, '+=0.9')
        .add(promote, '<+=0.25')
        .fromTo('#crown-b', { y: -26, opacity: 0 },
          { y: 0, opacity: 1, duration: 0.6, ease: 'bounce.out' }, '<')
        .fromTo(cardV2, { scale: 1 }, { scale: 1.03, duration: 0.2, yoyo: true, repeat: 1 }, '<+=0.3');
    }

    /* ---------- builder stack ---------- */
    revealGroup(document.querySelector('#builder .section-head'));
    fadeUp(document.querySelectorAll('#builder .lede, .builder-chips'), '#builder .section-head');
    var stack = document.getElementById('stack3d');
    var cuts = stack.querySelectorAll('.cut');
    var cutTags = stack.querySelectorAll('.cut-tag');
    var stackFinal = { rotationX: 52, rotationZ: -9, rotationY: 0 };
    if (FLAT) {
      gsap.set(stack, stackFinal);
      cuts.forEach(function (c, i) { gsap.set(c, { z: i * 64 }); });
      gsap.set(cutTags, { opacity: 1 });
    } else {
      gsap.set(cutTags, { opacity: 0 });
      var btl = gsap.timeline({
        scrollTrigger: {
          trigger: '#builder-stage', start: 'top 75%', end: 'bottom 45%', scrub: 1,
        }
      });
      btl.to(stack, Object.assign({ ease: 'power1.inOut', duration: 1 }, stackFinal))
        .to(cuts, { z: function (i) { return i * 64; }, duration: 1, ease: 'power2.inOut', stagger: 0.06 }, 0)
        .to(cutTags, { opacity: 1, duration: 0.4, stagger: 0.08 }, 0.55);
    }

    /* ---------- compare: chaos → tree ---------- */
    buildCompare();

    /* ---------- field guide + cta ---------- */
    revealGroup(document.querySelector('#features .section-head'));
    if (!FLAT) {
      gsap.fromTo('.plate', { opacity: 0, y: 40 }, {
        opacity: 1, y: 0, duration: 0.9, ease: 'power3.out', stagger: 0.07,
        scrollTrigger: { trigger: '.plates', start: 'top 76%', once: true }
      });
      fadeUp(document.querySelectorAll('.guide-strip'), '.guide-strip', 'top 88%');
    }
    revealGroup(document.querySelector('#cta'), { start: 'top 70%' });
    fadeUp(document.querySelectorAll('.cta-form, .cta-note'), '#cta', 'top 60%');
  }

  /* ============================================================
     COMPARE SCENE (index only)
     ============================================================ */
  function buildCompare() {
    var chaosBox = document.getElementById('chaos');
    if (!chaosBox) return;
    var treeSvg = document.getElementById('tree-lines');
    var hudTimer = document.getElementById('hud-timer');
    var hudFound = document.getElementById('hud-found');
    var capA = document.getElementById('cap-a');
    var capB = document.getElementById('cap-b');
    var verdict = document.getElementById('compare-verdict');

    var N = mobile() ? 64 : 110;
    var TREE_N = mobile() ? 16 : 24;
    var rnd = (function (a) {
      return function () {
        a |= 0; a = (a + 0x6D2B79F5) | 0;
        var t = Math.imul(a ^ (a >>> 15), 1 | a);
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
      };
    })(42);

    // ----- tree layout (fractions of the pin box) -----
    var cols = mobile()
      ? [{ x: 0.13, n: 1 }, { x: 0.4, n: 4 }, { x: 0.65, n: 5 }, { x: 0.86, n: 6 }]
      : [{ x: 0.16, n: 1 }, { x: 0.38, n: 6 }, { x: 0.6, n: 8 }, { x: 0.82, n: 9 }];
    var treeSlots = [];
    cols.forEach(function (col, ci) {
      for (var i = 0; i < col.n; i++) {
        var fy = col.n === 1 ? 0.52 : 0.3 + (0.48 * i) / (col.n - 1);
        treeSlots.push({ fx: col.x, fy: fy, col: ci, idx: i });
      }
    });
    // parents: round-robin into previous column; slot 0 of each column chains the hero path
    var colStart = [0];
    cols.forEach(function (c, i) { if (i) colStart.push(colStart[i - 1] + cols[i - 1].n); });
    treeSlots.forEach(function (s, si) {
      if (s.col === 0) { s.parent = -1; return; }
      var prev = cols[s.col - 1];
      var pIdx = s.idx === 0 ? 0 : s.idx % prev.n;
      s.parent = colStart[s.col - 1] + pIdx;
    });
    var pathSlotIdx = cols.map(function (c, i) { return colStart[i]; }); // Home→Header→Actions→Button
    var pathNames = ['Home', 'Header', 'Actions', 'Button'];

    // ----- nodes -----
    var nodes = [];
    for (var i = 0; i < N; i++) {
      var el = document.createElement('div');
      el.className = 'chaos-node';
      var inTree = i < TREE_N;
      var slot = inTree ? treeSlots[i] : null;
      var isPath = inTree && pathSlotIdx.indexOf(i) !== -1;
      var cw = 26 + rnd() * 68, ch = 18 + rnd() * 52;
      if (isPath) { el.classList.add('is-path'); }
      if (isPath) {
        var lab = document.createElement('span');
        lab.className = 'cn-label';
        lab.textContent = pathNames[pathSlotIdx.indexOf(i)];
        el.appendChild(lab);
      }
      el.style.width = cw + 'px';
      el.style.height = ch + 'px';
      chaosBox.appendChild(el);
      nodes.push({
        el: el, slot: slot, isPath: isPath,
        cfx: rnd() * 1.7 - 0.1,     // chaos x fraction (wider than viewport)
        cfy: rnd() * 1.1 - 0.05,
        rot: (rnd() - 0.5) * 24,
        tw: isPath ? 78 : 44 + rnd() * 22,
        th: isPath ? 40 : 26 + rnd() * 10
      });
    }
    function chaosX(n) { return n.cfx * vw(); }
    function chaosY(n) { return n.cfy * vh(); }
    function treeX(n) { return n.slot.fx * vw() - n.tw / 2; }
    function treeY(n) { return n.slot.fy * vh() - n.th / 2; }

    // place all nodes at chaos positions
    nodes.forEach(function (n) {
      gsap.set(n.el, { x: chaosX(n), y: chaosY(n), rotation: n.rot });
    });

    // ----- connectors (fraction coords stretched via preserveAspectRatio=none) -----
    treeSvg.setAttribute('viewBox', '0 0 1000 1000');
    var edges = '';
    treeSlots.forEach(function (s, si) {
      if (s.parent < 0) return;
      var p = treeSlots[s.parent];
      var onPath = pathSlotIdx.indexOf(si) !== -1 && pathSlotIdx.indexOf(s.parent) !== -1;
      var x1 = p.fx * 1000 + 40, y1 = p.fy * 1000;
      var x2 = s.fx * 1000 - 45, y2 = s.fy * 1000;
      var mx = (x1 + x2) / 2;
      edges += '<path ' + (onPath ? 'class="is-path" ' : '') + 'd="M' + x1 + ' ' + y1 +
        ' L' + mx + ' ' + y1 + ' L' + mx + ' ' + y2 + ' L' + x2 + ' ' + y2 + '"/>';
    });
    treeSvg.innerHTML = edges;
    var edgePaths = treeSvg.querySelectorAll('path');
    gsap.set(edgePaths, { opacity: 0 });

    if (FLAT) {
      nodes.forEach(function (n) {
        if (n.slot) gsap.set(n.el, { x: treeX(n), y: treeY(n), rotation: 0, width: n.tw, height: n.th });
        else gsap.set(n.el, { opacity: 0 });
        if (n.isPath) n.el.querySelector('.cn-label').style.opacity = 1;
      });
      gsap.set(edgePaths, { opacity: 1 });
      return;
    }

    // ----- master scrubbed timeline -----
    var tl = gsap.timeline({
      scrollTrigger: {
        trigger: '#compare', start: 'top top', end: '+=320%',
        pin: '#compare-pin', pinSpacing: true, scrub: 1,
        anticipatePin: 1, invalidateOnRefresh: true,
        onUpdate: function (st) {
          // searching timer during the chaos phase
          var p = st.progress;
          if (p < 0.3) {
            var secs = Math.floor(p / 0.3 * 47);
            hudTimer.textContent = 'searching · 00:' + String(secs).padStart(2, '0');
          }
        }
      }
    });

    // phase A — panic pan through the infinite canvas
    tl.fromTo(chaosBox, { x: 0.06 * 100 + 'vw', scale: 1.05 },
      { x: '-14vw', scale: 1, ease: 'power1.inOut', duration: 3 }, 0);

    // phase B — the canvas collapses into a tree
    nodes.forEach(function (n, i) {
      if (n.slot) {
        tl.to(n.el, {
          x: function () { return treeX(n); },
          y: function () { return treeY(n); },
          width: n.tw, height: n.th, rotation: 0,
          ease: 'power2.inOut', duration: 2
        }, 3 + (i % 7) * 0.12);
      } else {
        tl.to(n.el, { opacity: 0, scale: 0.55, duration: 1.2, ease: 'power1.in' }, 3 + (i % 5) * 0.1);
      }
    });
    tl.to(chaosBox, { x: 0, duration: 2, ease: 'power2.inOut' }, 3);
    // captions crossfade
    tl.to(capA, { opacity: 0, y: -18, duration: 0.8 }, 3.2)
      .fromTo(capB, { opacity: 0, y: 18 }, { opacity: 1, y: 0, duration: 0.8 }, 4.2);
    // connectors + path highlight + hud
    tl.to(edgePaths, { opacity: 1, duration: 0.9, stagger: 0.02 }, 5.2)
      .to('.cn-label', { opacity: 1, duration: 0.5 }, 5.6)
      .to(hudTimer, { opacity: 0, duration: 0.4 }, 5.4)
      .to(hudFound, { opacity: 1, duration: 0.6 }, 5.7);
    // verdict
    tl.to(['#chaos', '#tree-lines'], { opacity: 0.13, duration: 1 }, 7.2)
      .to([capB, hudFound], { opacity: 0, duration: 0.7 }, 7.2)
      .fromTo(verdict, { opacity: 0, scale: 0.94 },
        { opacity: 1, scale: 1, duration: 1.2, ease: 'power3.out' }, 7.6)
      .to({}, { duration: 0.8 }); // hold

    if (!FLAT) {
      gsap.fromTo('.comp-chip', { opacity: 0, y: 30 }, {
        opacity: 1, y: 0, duration: 0.8, ease: 'power3.out', stagger: 0.08,
        scrollTrigger: { trigger: '.compare-chips', start: 'top 82%', once: true }
      });
    }
  }

  /* ============================================================
     FEATURE PAGES
     ============================================================ */
  if (page === 'feature') {
    var glyph = document.querySelector('.feat-glyph-big');
    if (FLAT) {
      gsap.set('.feat-hero .line-inner', { yPercent: 0, y: 0 });
      gsap.set(['.feat-hero .overline', '.feat-tag'], { opacity: 1, y: 0 });
      if (glyph) glyph.querySelectorAll('*').forEach(function (p) { p.style.strokeDashoffset = 0; });
    } else {
      var enter = gsap.timeline({ delay: hadWipe ? 0.55 : 0.15 });
      enter.fromTo('.feat-hero .overline', { opacity: 0, y: 18 }, { opacity: 1, y: 0, duration: 0.8, ease: 'power3.out' })
        .fromTo('.feat-hero .line-inner', { yPercent: 115, y: 0 },
          { yPercent: 0, y: 0, duration: 1.25, ease: 'power4.out', stagger: 0.11 }, '-=0.5')
        .fromTo('.feat-tag', { opacity: 0, y: 22 }, { opacity: 1, y: 0, duration: 0.9, ease: 'power3.out' }, '-=0.7');
      if (glyph) {
        glyph.querySelectorAll('*').forEach(function (p) {
          var L = 600;
          try { L = p.getTotalLength ? p.getTotalLength() : 600; } catch (e) {}
          p.style.strokeDasharray = L;
          p.style.strokeDashoffset = L;
          enter.to(p, { strokeDashoffset: 0, duration: 1.4, ease: 'power2.inOut' }, 0.5);
        });
      }
      document.querySelectorAll('.feat-section').forEach(function (sec) {
        revealGroup(sec);
        fadeUp(sec.querySelectorAll('.feat-quote, .feat-body, .feat-diagram, .feat-results'), sec, 'top 66%');
      });
      fadeUp(document.querySelectorAll('.feat-next a'), '.feat-next', 'top 85%');
    }
  }

  /* ============================================================
     FLAT MODE — class + optional jump
     ============================================================ */
  if (FLAT) {
    document.body.classList.add('flat');
    var target = qs.get('flat');
    if (target) {
      // translate #main instead of scrolling: hidden preview tabs never
      // repaint scrolled content, but transforms always paint
      var el = /^\d+$/.test(target)
        ? document.querySelectorAll('main > section')[parseInt(target, 10)]
        : document.querySelector(target);
      if (el) {
        var r = el.getBoundingClientRect();
        var y = r.top + window.scrollY;
        document.getElementById('main').style.transform = 'translateY(' + (-y) + 'px)';
        document.querySelector('.footer').style.display = 'none';
        if (nav) nav.style.display = 'none';
      }
    }
  }

  addEventListener('load', function () { ScrollTrigger.refresh(); });
})();
