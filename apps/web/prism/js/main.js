/* ============================================================
   PRISM — main.js
   Lenis + GSAP/ScrollTrigger choreography, glow path, panels,
   comparison morph, page transitions, ?flat verification mode.
   ============================================================ */
(function () {
  'use strict';

  var params = new URLSearchParams(location.search);
  var REDUCED = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var FLAT = params.has('flat') || REDUCED;
  var IS_MOBILE = window.matchMedia('(max-width: 720px)').matches;
  var page = document.body.getAttribute('data-page') || 'home';

  if (FLAT) document.documentElement.classList.add('flat');

  gsap.registerPlugin(ScrollTrigger);

  var HUES = { violet: '#8b6cff', blue: '#5d8bff', green: '#34e8a9', amber: '#ffb454', rose: '#ff5c8a' };

  /* ---------------- grain ---------------- */
  (function grain() {
    var c = document.createElement('canvas'); c.width = c.height = 128;
    var x = c.getContext('2d'), d = x.createImageData(128, 128);
    for (var i = 0; i < d.data.length; i += 4) {
      var v = Math.random() * 255 | 0;
      d.data[i] = d.data[i + 1] = d.data[i + 2] = v; d.data[i + 3] = 14;
    }
    x.putImageData(d, 0, 0);
    var el = document.createElement('div');
    el.className = 'grain';
    el.style.backgroundImage = 'url(' + c.toDataURL() + ')';
    document.body.appendChild(el);
  })();

  /* ---------------- lenis ---------------- */
  var lenis = null;
  if (!FLAT) {
    lenis = new Lenis({ duration: 1.15, easing: function (t) { return Math.min(1, 1.001 - Math.pow(2, -10 * t)); } });
    lenis.on('scroll', ScrollTrigger.update);
    gsap.ticker.add(function (t) { lenis.raf(t * 1000); });
    gsap.ticker.lagSmoothing(0);
  }

  /* ---------------- hue engine ---------------- */
  var hueProxy = { c: getComputedStyle(document.documentElement).getPropertyValue('--fc').trim() || HUES.violet };
  function setHue(hex, instant) {
    gsap.to(hueProxy, {
      c: hex, duration: instant ? 0 : 0.9, ease: 'power2.out', overwrite: 'auto',
      onUpdate: function () {
        document.documentElement.style.setProperty('--hue', hueProxy.c);
        window.dispatchEvent(new CustomEvent('glow:tint', { detail: { color: hueProxy.c } }));
      }
    });
  }
  window.__setHue = setHue;

  /* ---------------- nav ---------------- */
  var nav = document.getElementById('nav');
  var lastY = 0;
  function onScrollY(y) {
    if (!nav) return;
    nav.classList.toggle('solid', y > 40);
    if (y > lastY + 6 && y > 400) nav.classList.add('hidden');
    else if (y < lastY - 6) nav.classList.remove('hidden');
    lastY = y;
  }
  if (lenis) lenis.on('scroll', function (e) { onScrollY(e.scroll); });
  else window.addEventListener('scroll', function () { onScrollY(window.scrollY); }, { passive: true });

  /* anchor scrolling */
  document.querySelectorAll('[data-scroll]').forEach(function (a) {
    a.addEventListener('click', function (e) {
      var href = a.getAttribute('href');
      if (!href || href.charAt(0) !== '#') return;
      var target = document.querySelector(href);
      if (!target) return;
      e.preventDefault();
      if (lenis) lenis.scrollTo(target, { offset: 0, duration: 1.6 });
      else target.scrollIntoView();
    });
  });

  /* ---------------- reveals ---------------- */
  function lineEntrance(scope, delay) {
    var inners = (scope || document).querySelectorAll('.line-mask > .line-inner');
    inners.forEach(function (el, i) {
      // NB: CSS holds translateY(115%). Must zero BOTH y and yPercent.
      gsap.fromTo(el, { yPercent: 115, y: 0 }, {
        yPercent: 0, y: 0, duration: 1.15, ease: 'power4.out',
        delay: (delay || 0) + i * 0.09,
        scrollTrigger: FLAT ? null : { trigger: el.closest('section') || el, start: 'top 78%' }
      });
    });
  }

  function reveals() {
    if (FLAT) return;
    document.querySelectorAll('[data-reveal]').forEach(function (el) {
      gsap.to(el, {
        opacity: 1, y: 0, duration: 1.1, ease: 'power3.out',
        scrollTrigger: { trigger: el, start: 'top 85%' }
      });
    });
  }

  /* ---------------- hue triggers per section ---------------- */
  function hueTriggers() {
    if (FLAT) return;
    document.querySelectorAll('[data-hue]').forEach(function (sec) {
      if (sec.classList.contains('panel')) return; // panels handled by journey
      ScrollTrigger.create({
        trigger: sec, start: 'top 55%', end: 'bottom 45%',
        onEnter: function () { setHue(sec.dataset.hue); },
        onEnterBack: function () { setHue(sec.dataset.hue); }
      });
    });
  }

  /* ============================================================
     HOME PAGE
     ============================================================ */
  var journeyST = null;

  function buildJourney() {
    var track = document.getElementById('jtrack');
    if (!track) return;
    var panels = track.querySelectorAll('.panel');
    var jbar = document.getElementById('jbar');
    var gph = document.getElementById('glowpath-h');

    if (IS_MOBILE || FLAT) {
      // vertical stack — no pin; draw nothing horizontal
      if (gph) gph.style.display = 'none';
      if (FLAT && !IS_MOBILE) {
        // keep horizontal look for flat screenshots: force a panel via ?panel=K
        track.style.flexDirection = 'row';
        track.style.height = '100svh';
        var k = parseInt(params.get('panel') || '0', 10);
        track.style.transform = 'translateX(' + (-100 * k) + 'vw)';
        document.querySelector('.journey').style.height = '100svh';
        document.querySelector('.journey').style.overflow = 'hidden';
      }
      if (!FLAT) {
        panels.forEach(function (p) {
          ScrollTrigger.create({
            trigger: p, start: 'top 55%', end: 'bottom 45%',
            onEnter: function () { setHue(p.dataset.hue); },
            onEnterBack: function () { setHue(p.dataset.hue); }
          });
        });
      }
      return;
    }

    var dist = function () { return track.scrollWidth - window.innerWidth; };

    var tween = gsap.to(track, {
      x: function () { return -dist(); },
      ease: 'none',
      scrollTrigger: {
        trigger: '.journey',
        start: 'top top',
        end: function () { return '+=' + dist() * 1.15; },
        scrub: 1,
        pin: true,
        anticipatePin: 1,
        invalidateOnRefresh: true,
        onUpdate: function (self) {
          if (jbar) jbar.style.transform = 'scaleX(' + self.progress + ')';
          var idx = Math.min(panels.length - 1, Math.floor(self.progress * panels.length + 0.25));
          var hue = panels[idx].dataset.hue;
          if (hue !== buildJourney._hue) { buildJourney._hue = hue; setHue(hue); }
        }
      }
    });
    journeyST = tween.scrollTrigger;

    // horizontal glow path inside the track
    if (gph) {
      var svg = gph.querySelector('svg');
      var w = track.scrollWidth, h = window.innerHeight;
      svg.setAttribute('viewBox', '0 0 ' + w + ' ' + h);
      svg.style.width = w + 'px'; svg.style.height = h + 'px';
      var vw = window.innerWidth;
      var d = 'M ' + (-40) + ' ' + (h * 0.16);
      for (var i = 0; i < panels.length; i++) {
        var cx = vw * i + vw * 0.5, nx = vw * (i + 1);
        var yA = h * (i % 2 ? 0.82 : 0.14), yB = h * (i % 2 ? 0.16 : 0.84);
        d += ' C ' + (cx - vw * 0.22) + ' ' + yA + ', ' + (cx + vw * 0.1) + ' ' + yB + ', ' + (nx - vw * 0.28) + ' ' + (h * (i % 2 ? 0.2 : 0.8));
        d += ' S ' + (nx + vw * 0.05) + ' ' + (h * (i % 2 ? 0.12 : 0.86)) + ', ' + (nx + vw * 0.18) + ' ' + (h * 0.5);
      }
      ['gph-w', 'gph-h', 'gph'].forEach(function (id) {
        var p = document.getElementById(id);
        p.setAttribute('d', d);
        var L = p.getTotalLength();
        p.style.strokeDasharray = L;
        p.style.strokeDashoffset = L;
        gsap.to(p, {
          strokeDashoffset: 0, ease: 'none',
          scrollTrigger: { trigger: '.journey', start: 'top top', end: function () { return '+=' + dist() * 1.15; }, scrub: 0.4 }
        });
      });
    }
  }

  /* ---------------- vertical glow path ---------------- */
  function buildGlowPath() {
    var wrap = document.getElementById('glowpath');
    if (!wrap) return;
    var main = document.getElementById('main');
    var svg = wrap.querySelector('svg');
    var W = main.offsetWidth, H = main.scrollHeight;
    svg.setAttribute('viewBox', '0 0 ' + W + ' ' + H);

    function yOf(el) {
      var r = el.getBoundingClientRect();
      var m = main.getBoundingClientRect();
      return r.top - m.top;
    }

    var hero = document.querySelector('.hero');
    var why = document.getElementById('why');
    var law = document.querySelector('.law');
    var journey = document.querySelector('.journey');
    var builder = document.getElementById('builder');
    var rooms = document.getElementById('rooms');
    var compared = document.getElementById('compared');
    var access = document.getElementById('access');

    // segment 1: hero → top of journey
    var x1 = W * 0.82, x2 = W * 0.12, x3 = W * 0.88;
    var yHero = yOf(hero) + hero.offsetHeight * 0.55;
    var yWhy = yOf(why) + why.offsetHeight * 0.45;
    var yLaw = yOf(law) + law.offsetHeight * 0.5;
    var yJt = yOf(journey) - 40;
    var d1 = 'M ' + x1 + ' ' + yHero +
      ' C ' + (x1 + W * 0.1) + ' ' + (yHero + 400) + ', ' + (x2 - W * 0.08) + ' ' + (yWhy - 500) + ', ' + x2 + ' ' + yWhy +
      ' S ' + (x3 + W * 0.06) + ' ' + (yLaw - 420) + ', ' + (W * 0.5) + ' ' + yLaw +
      ' S ' + (W * 0.5) + ' ' + (yJt - 200) + ', ' + (W * 0.5) + ' ' + yJt;

    // segment 2: builder → cta
    var yB = yOf(builder) + builder.offsetHeight * 0.35;
    var yR = yOf(rooms) + rooms.offsetHeight * 0.35;
    var yC = yOf(compared) + compared.offsetHeight * 0.18;
    var yA = yOf(access) + access.offsetHeight * 0.45;
    var d2 = 'M ' + (W * 0.5) + ' ' + (yB - 300) +
      ' C ' + (W * 0.15) + ' ' + (yB + 100) + ', ' + (W * 0.85) + ' ' + (yR - 300) + ', ' + (W * 0.82) + ' ' + yR +
      ' S ' + (W * 0.1) + ' ' + (yC - 200) + ', ' + (W * 0.18) + ' ' + yC +
      ' S ' + (W * 0.8) + ' ' + (yA - 700) + ', ' + (W * 0.5) + ' ' + yA;

    [['gp1', d1], ['gp2', d2]].forEach(function (seg) {
      ['w', 'h', ''].forEach(function (suf) {
        var p = document.getElementById(seg[0] + suf);
        p.setAttribute('d', seg[1]);
      });
    });

    [['gp1', yHero, yJt], ['gp2', yB - 300, yA]].forEach(function (seg) {
      var core = document.getElementById(seg[0]);
      var L = core.getTotalLength();
      ['w', 'h', ''].forEach(function (suf) {
        var p = document.getElementById(seg[0] + suf);
        p.style.strokeDasharray = L;
        p.style.strokeDashoffset = FLAT ? 0 : L;
        if (!FLAT) {
          gsap.to(p, {
            strokeDashoffset: 0, ease: 'none',
            scrollTrigger: {
              start: function () { return Math.max(1, seg[1] - window.innerHeight * 0.7); },
              end: function () { return seg[2] - window.innerHeight * 0.35; },
              scrub: 0.6
            }
          });
        }
      });
    });
  }

  /* ---------------- panel diagrams ---------------- */
  function frameDiv(parent, css, label) {
    var f = document.createElement('div');
    f.className = 'viz-frame';
    for (var k in css) f.style[k] = css[k];
    if (label) {
      var l = document.createElement('span');
      l.className = 'viz-label'; l.textContent = label;
      f.appendChild(l);
    }
    parent.appendChild(f);
    return f;
  }

  function vizComponents(host) {
    var screen = frameDiv(host, { inset: '4% 6%', borderRadius: '16px' }, 'screen');
    var header = frameDiv(screen, { left: '6%', right: '6%', top: '7%', height: '18%' }, 'header');
    var logo = frameDiv(header, { left: '5%', top: '26%', width: '22%', height: '48%' });
    var search = frameDiv(header, { right: '5%', top: '26%', width: '14%', height: '48%', borderRadius: '999px' });
    var hero = frameDiv(screen, { left: '6%', right: '6%', top: '31%', height: '34%' }, 'hero-banner');
    var heroTxt = frameDiv(hero, { left: '6%', top: '20%', width: '46%', height: '16%' });
    var heroBtn = frameDiv(hero, { left: '6%', bottom: '16%', width: '24%', height: '20%', borderRadius: '999px' }, 'button');
    var btnLabel = frameDiv(heroBtn, { left: '18%', top: '30%', width: '64%', height: '40%', borderRadius: '4px' });
    frameDiv(screen, { left: '6%', width: '26%', bottom: '8%', height: '26%' });
    frameDiv(screen, { left: '37%', width: '26%', bottom: '8%', height: '26%' });
    frameDiv(screen, { right: '6%', width: '26%', bottom: '8%', height: '26%' });

    if (FLAT) { [screen, header, hero, heroBtn].forEach(function (f) { f.classList.add('viz-glowborder'); }); return; }
    var seq = [heroBtn, header, hero, screen];
    var tl = gsap.timeline({ repeat: -1, repeatDelay: 1.2 });
    tl.from([logo, search, heroTxt, btnLabel], { scale: 0, opacity: 0, duration: 0.5, ease: 'back.out(2)', stagger: 0.12 });
    seq.forEach(function (f, i) {
      tl.add(function () { f.classList.add('viz-glowborder'); }, 0.7 + i * 0.55);
      tl.from(f.querySelector('.viz-label') || {}, { opacity: 0, y: 6, duration: 0.3 }, 0.72 + i * 0.55);
    });
    tl.to(host, { opacity: 1, duration: 1.4 }); // hold
    tl.add(function () { seq.forEach(function (f) { f.classList.remove('viz-glowborder'); }); });
  }

  function vizFrame(host) {
    var frame = frameDiv(host, { inset: '12% 16%', borderRadius: '14px' }, 'button / frame');
    frame.classList.add('viz-glowborder');
    var inner = frameDiv(frame, { left: '25%', top: '38%', width: '50%', height: '24%', borderRadius: '8px' }, 'label');
    // ancestor guides (border:none must precede the single dashed edge)
    var g1 = frameDiv(host, { left: '6%', top: '0', bottom: '0', width: '0', border: 'none', borderLeft: '1px dashed rgba(93,139,255,.4)', background: 'none' });
    var g2 = frameDiv(host, { right: '6%', top: '0', bottom: '0', width: '0', border: 'none', borderLeft: '1px dashed rgba(93,139,255,.4)', background: 'none' });
    var g3 = frameDiv(host, { left: '0', right: '0', top: '4%', height: '0', border: 'none', borderTop: '1px dashed rgba(93,139,255,.4)', background: 'none' });
    var hud = document.createElement('div');
    hud.style.cssText = 'position:absolute;bottom:2%;right:0;font-family:var(--font-mono);font-size:12px;letter-spacing:.18em;color:var(--blue);text-transform:uppercase;';
    hud.textContent = '1.0× — the floor';
    host.appendChild(hud);
    if (FLAT) return;
    var tl = gsap.timeline({ repeat: -1, repeatDelay: 1.4 });
    tl.to(frame, { scale: 0.9, duration: 0.6, ease: 'power2.inOut' })
      .add(function () { hud.textContent = '0.9× — no.'; hud.style.color = 'var(--rose)'; })
      .to(frame, { scale: 1, duration: 1.1, ease: 'elastic.out(1, 0.45)' }, '+=0.15')
      .add(function () { hud.textContent = '1.0× — the floor'; hud.style.color = 'var(--blue)'; })
      .fromTo([g1, g2, g3], { opacity: 0 }, { opacity: 1, duration: 0.5, stagger: 0.1 }, '+=0.3')
      .to([g1, g2, g3], { opacity: 0.25, duration: 0.8 }, '+=0.8')
      .to(inner, { opacity: 0.9, duration: 0.4 }, 0);
  }

  function vizTree(host) {
    // stage 1: whole screen (left) / stage 2: isolated child (center) / stage 3: its children (right)
    var screen = frameDiv(host, { left: '0%', top: '14%', width: '26%', height: '72%', borderRadius: '12px' }, 'home');
    var rows = [];
    for (var i = 0; i < 4; i++) {
      rows.push(frameDiv(screen, { left: '10%', right: '10%', top: (10 + i * 22) + '%', height: '16%' }));
    }
    var subject = frameDiv(host, { left: '36%', top: '32%', width: '28%', height: '36%', borderRadius: '12px' }, 'header');
    subject.classList.add('viz-glowborder');
    var kids = [
      frameDiv(host, { left: '74%', top: '20%', width: '22%', height: '16%', borderRadius: '10px' }, 'logo'),
      frameDiv(host, { left: '74%', top: '42%', width: '22%', height: '16%', borderRadius: '10px' }, 'copy'),
      frameDiv(host, { left: '74%', top: '64%', width: '22%', height: '16%', borderRadius: '10px' }, 'search')
    ];
    // breadcrumb
    var crumb = document.createElement('div');
    crumb.style.cssText = 'position:absolute;bottom:0;left:0;font-family:var(--font-mono);font-size:11px;letter-spacing:.16em;color:var(--mute);text-transform:uppercase;';
    crumb.innerHTML = 'home <span style="color:var(--green)">→ header</span> <span class="c2" style="opacity:.35">→ logo</span>';
    host.appendChild(crumb);
    if (FLAT) return;
    var tl = gsap.timeline({ repeat: -1, repeatDelay: 1.6 });
    tl.fromTo(rows[0], { boxShadow: '0 0 0 0 transparent' }, { boxShadow: '0 0 22px -4px #34e8a9', duration: 0.5 })
      .to(rows[0], { borderColor: '#34e8a9', duration: 0.3 }, '<')
      .fromTo(subject, { opacity: 0, x: -30, scale: 0.85 }, { opacity: 1, x: 0, scale: 1, duration: 0.8, ease: 'power3.out' })
      .fromTo(kids, { opacity: 0, x: -18 }, { opacity: 1, x: 0, duration: 0.6, stagger: 0.14, ease: 'power3.out' })
      .to(crumb.querySelector('.c2'), { opacity: 1, duration: 0.4 })
      .to({}, { duration: 1.2 })
      .to([subject].concat(kids), { opacity: 0.2, duration: 0.6 })
      .to(rows[0], { borderColor: 'rgba(234,235,244,.16)', boxShadow: 'none', duration: 0.4 }, '<')
      .set([subject].concat(kids), { clearProps: 'opacity,x,scale' });
  }

  function vizOwnership(host) {
    var master = frameDiv(host, { left: '4%', top: '8%', width: '34%', height: '30%', borderRadius: '12px' }, 'master · home');
    master.classList.add('viz-glowborder');
    frameDiv(master, { left: '12%', top: '34%', width: '76%', height: '32%', borderRadius: '999px' });
    var inst1 = frameDiv(host, { right: '4%', top: '4%', width: '30%', height: '26%', borderRadius: '12px', borderStyle: 'dashed' }, 'instance · linked');
    var inst2 = frameDiv(host, { right: '10%', bottom: '10%', width: '30%', height: '26%', borderRadius: '12px', borderStyle: 'dashed' }, 'instance · linked');
    frameDiv(inst1, { left: '12%', top: '34%', width: '76%', height: '32%', borderRadius: '999px' });
    frameDiv(inst2, { left: '12%', top: '34%', width: '76%', height: '32%', borderRadius: '999px' });

    var svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('viewBox', '0 0 100 100');
    svg.setAttribute('preserveAspectRatio', 'none');
    svg.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;overflow:visible;';
    var l1 = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    l1.setAttribute('d', 'M 38 22 C 55 20, 58 16, 66 14');
    var l2 = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    l2.setAttribute('d', 'M 38 30 C 52 45, 52 62, 60 72');
    [l1, l2].forEach(function (l) {
      l.setAttribute('stroke', '#ffb454'); l.setAttribute('fill', 'none');
      l.setAttribute('stroke-width', '0.5'); l.setAttribute('vector-effect', 'non-scaling-stroke');
      l.style.filter = 'drop-shadow(0 0 4px rgba(255,180,84,.8))';
      svg.appendChild(l);
    });
    host.appendChild(svg);
    if (FLAT) return;
    [l1, l2].forEach(function (l) {
      var L = l.getTotalLength();
      l.style.strokeDasharray = '2 3';
      gsap.to(l, { strokeDashoffset: -L * 2, duration: 6, repeat: -1, ease: 'none' });
    });
    var tl = gsap.timeline({ repeat: -1, repeatDelay: 2 });
    tl.to({}, { duration: 1.6 })
      .to(l2, { opacity: 0, duration: 0.5 })
      .add(function () {
        inst2.style.borderStyle = 'solid'; inst2.style.borderColor = '#ffb454';
        inst2.querySelector('.viz-label').textContent = 'detached · owned';
        inst2.querySelector('.viz-label').style.color = '#ffb454';
      })
      .fromTo(inst2, { boxShadow: '0 0 0 0 transparent' }, { boxShadow: '0 0 30px -6px rgba(255,180,84,.5)', duration: 0.6 })
      .to({}, { duration: 2 })
      .add(function () {
        inst2.style.borderStyle = 'dashed'; inst2.style.borderColor = '';
        inst2.querySelector('.viz-label').textContent = 'instance · linked';
        inst2.querySelector('.viz-label').style.color = '';
      })
      .to([inst2, l2], { boxShadow: 'none', opacity: 1, duration: 0.6 });
  }

  function buildVizes() {
    var map = { components: vizComponents, frame: vizFrame, tree: vizTree, ownership: vizOwnership };
    document.querySelectorAll('[data-viz]').forEach(function (host) {
      var fn = map[host.dataset.viz];
      if (fn) fn(host);
    });
  }

  /* ---------------- builder stack scene ---------------- */
  function buildStack() {
    var scene = document.getElementById('stackScene');
    if (!scene) return;
    var cuts = [
      { label: 'screen', inset: [4, 10, 4, 10], z: 0, art: 'screen' },
      { label: 'header', inset: [8, 14, 74, 14], z: 1, art: 'bar' },
      { label: 'hero-image', inset: [26, 14, 38, 14], z: 2, art: 'img' },
      { label: 'card', inset: [66, 14, 12, 46], z: 3, art: 'card' },
      { label: 'button', inset: [83, 60, 9, 14], z: 4, art: 'btn' }
    ];
    var els = cuts.map(function (c, i) {
      var el = document.createElement('div');
      el.className = 'cut';
      el.style.top = c.inset[0] + '%'; el.style.right = c.inset[1] + '%';
      el.style.bottom = c.inset[2] + '%'; el.style.left = c.inset[3] + '%';
      var art = document.createElement('div');
      art.className = 'cut-art';
      if (c.art === 'screen') art.style.background = 'linear-gradient(160deg,#181a26,#0b0c12)';
      if (c.art === 'bar') art.style.background = 'linear-gradient(90deg,#232538,#151725)';
      if (c.art === 'img') art.style.background = 'radial-gradient(120% 120% at 20% 10%, rgba(255,92,138,.35), rgba(139,108,255,.18) 45%, #12131c 80%)';
      if (c.art === 'card') art.style.background = 'linear-gradient(150deg,#1b1d2c,#12131c)';
      if (c.art === 'btn') { art.style.background = 'linear-gradient(90deg,#ff5c8a,#8b6cff)'; el.style.borderRadius = '999px'; art.style.opacity = '.85'; }
      el.appendChild(art);
      var l = document.createElement('span');
      l.className = 'viz-label'; l.textContent = c.label;
      el.appendChild(l);
      scene.appendChild(el);
      return el;
    });

    var spread = function (i) {
      return {
        x: (i - 2) * 14,
        y: (i - 2) * -10,
        z: i * 90,
        rotateX: 38, rotateZ: -9
      };
    };
    if (FLAT) {
      els.forEach(function (el, i) {
        var s = spread(i);
        el.style.transform = 'translate3d(' + s.x + 'px,' + s.y + 'px,' + s.z + 'px) rotateX(' + s.rotateX + 'deg) rotateZ(' + s.rotateZ + 'deg)';
      });
      return;
    }
    els.forEach(function (el, i) {
      var s = spread(i);
      gsap.fromTo(el, { x: 0, y: 0, z: 0, rotateX: 0, rotateZ: 0 }, {
        x: s.x, y: s.y, z: s.z, rotateX: s.rotateX, rotateZ: s.rotateZ,
        ease: 'none',
        scrollTrigger: { trigger: '#builder', start: 'top 75%', end: 'center 42%', scrub: 0.7 }
      });
      gsap.fromTo(el.querySelector('.viz-label'), { opacity: 0 }, {
        opacity: 1, ease: 'none',
        scrollTrigger: { trigger: '#builder', start: 'top 45%', end: 'center 40%', scrub: true }
      });
    });
  }

  /* ---------------- comparison morph ---------------- */
  function buildCompare() {
    var stage = document.getElementById('compareStage');
    var chaosSide = document.getElementById('chaosSide');
    var orderSide = document.getElementById('orderSide');
    if (!stage || !chaosSide || !orderSide) return;

    // one tidy mock-screen layout, expressed in % of the half
    var tidy = [
      { l: 24, t: 4, w: 52, h: 92, tag: 'screen' },     // screen frame
      { l: 29, t: 9, w: 42, h: 12 },                     // header
      { l: 29, t: 25, w: 42, h: 26 },                    // hero
      { l: 29, t: 55, w: 19, h: 18 },                    // card
      { l: 52, t: 55, w: 19, h: 18 },                    // card
      { l: 29, t: 77, w: 42, h: 6 },                     // row
      { l: 29, t: 86, w: 18, h: 7 },                     // button
      { l: 33, t: 12, w: 10, h: 5 },                     // logo
      { l: 57, t: 12, w: 10, h: 5 },                     // search
      { l: 33, t: 30, w: 20, h: 5 }                      // hero text
    ];
    function rnd(a, b) { return a + Math.random() * (b - a); }

    var chaosEls = [], orderEls = [];
    tidy.forEach(function (r, i) {
      var c = document.createElement('div');
      c.className = 'chaos-bit';
      c.style.width = r.w + '%'; c.style.height = r.h + '%';
      c.style.left = rnd(2, 92 - r.w) + '%'; c.style.top = rnd(2, 90 - r.h) + '%';
      c.style.transform = 'rotate(' + rnd(-24, 24) + 'deg)';
      chaosSide.appendChild(c); chaosEls.push(c);

      var o = document.createElement('div');
      o.className = 'order-bit';
      o.style.width = r.w + '%'; o.style.height = r.h + '%';
      o.style.left = r.l + '%'; o.style.top = r.t + '%';
      o.dataset.sl = rnd(0, 88 - r.w); o.dataset.st = rnd(0, 88 - r.h); o.dataset.sr = rnd(-30, 30);
      orderSide.appendChild(o); orderEls.push(o);
    });

    if (FLAT) return;

    // left side: perpetual restless jitter
    chaosEls.forEach(function (c) {
      gsap.to(c, {
        x: function () { return rnd(-14, 14); },
        y: function () { return rnd(-12, 12); },
        rotation: function () { return rnd(-8, 8); },
        duration: function () { return rnd(1.6, 3.2); },
        repeat: -1, yoyo: true, ease: 'sine.inOut', delay: rnd(0, 1.5)
      });
    });

    // right side: assembles under scrub while the stage is pinned
    var tl = gsap.timeline({
      scrollTrigger: {
        trigger: stage, start: 'top top', end: '+=120%',
        scrub: 0.6, pin: true, anticipatePin: 1
      }
    });
    orderEls.forEach(function (o, i) {
      tl.fromTo(o,
        { left: o.dataset.sl + '%', top: o.dataset.st + '%', rotation: parseFloat(o.dataset.sr), opacity: 0.35 },
        { left: tidy[i].l + '%', top: tidy[i].t + '%', rotation: 0, opacity: 1, duration: 1, ease: 'power2.inOut' },
        i * 0.06
      );
    });
    tl.to(orderEls[0], { boxShadow: '0 0 34px -8px rgba(52,232,169,.6)', borderColor: 'rgba(52,232,169,.8)', duration: 0.4 });
  }

  /* ---------------- cta form ---------------- */
  function buildForm() {
    var form = document.getElementById('ctaForm');
    var done = document.getElementById('ctaDone');
    if (!form) return;
    form.addEventListener('submit', function (e) {
      e.preventDefault();
      var btn = form.querySelector('.btn');
      btn.textContent = 'Welcome ✓';
      gsap.fromTo(btn, { scale: 0.92 }, { scale: 1, duration: 0.6, ease: 'elastic.out(1,.5)' });
      done.classList.add('show');
    });
  }

  /* ---------------- page transitions ---------------- */
  var veil = document.getElementById('veil');
  function veilCover(hue, cb) {
    if (!veil) { cb && cb(); return; }
    veil.classList.add('active');
    veil.style.setProperty('--vh', hue || HUES.violet);
    var panel = veil.querySelector('.veil-panel');
    var beam = veil.querySelector('.veil-beam');
    var word = veil.querySelector('.veil-word');
    gsap.timeline({ onComplete: cb })
      .set(panel, { transformOrigin: 'bottom' })
      .fromTo(beam, { scaleX: 0, opacity: 1 }, { scaleX: 1, duration: 0.45, ease: 'power3.in' })
      .to(panel, { scaleY: 1, duration: 0.55, ease: 'power4.inOut' }, 0.12)
      .fromTo(word, { opacity: 0, letterSpacing: '.2em' }, { opacity: 1, letterSpacing: '.4em', duration: 0.5, ease: 'power2.out' }, 0.4);
  }
  function veilReveal() {
    if (!veil) return;
    var panel = veil.querySelector('.veil-panel');
    var beam = veil.querySelector('.veil-beam');
    var word = veil.querySelector('.veil-word');
    veil.classList.add('active');
    gsap.set(panel, { scaleY: 1, transformOrigin: 'top' });
    gsap.set(word, { opacity: 1 });
    gsap.timeline({
      delay: 0.1,
      onComplete: function () { veil.classList.remove('active'); gsap.set([panel, beam], { clearProps: 'all' }); }
    })
      .to(word, { opacity: 0, duration: 0.3 })
      .fromTo(beam, { scaleX: 1, opacity: 1 }, { scaleX: 0, opacity: 0, duration: 0.6, ease: 'power3.out' }, 0.25)
      .to(panel, { scaleY: 0, duration: 0.8, ease: 'power4.inOut' }, 0.15);
  }
  function bindTransitions() {
    document.querySelectorAll('[data-transition]').forEach(function (a) {
      a.addEventListener('click', function (e) {
        if (e.metaKey || e.ctrlKey) return;
        e.preventDefault();
        var href = a.getAttribute('href');
        var hue = a.getAttribute('data-hue-link') || getComputedStyle(document.documentElement).getPropertyValue('--hue').trim();
        try { sessionStorage.setItem('prism:veil', '1'); } catch (err) {}
        veilCover(hue, function () { location.href = href; });
      });
    });
  }
  function maybeEnterFromVeil() {
    var flagged = false;
    try { flagged = sessionStorage.getItem('prism:veil') === '1'; sessionStorage.removeItem('prism:veil'); } catch (err) {}
    if (flagged && !FLAT) veilReveal();
  }

  /* ---------------- flat / verification mode ---------------- */
  function applyFlat() {
    if (!params.has('flat')) return;
    ScrollTrigger.getAll().forEach(function (st) { st.kill(); });
    gsap.globalTimeline.clear();
    document.querySelectorAll('.line-mask > .line-inner').forEach(function (el) { el.style.transform = 'none'; });
    var v = params.get('flat');
    if (v && v !== 'true') {
      var target = /^\d+$/.test(v)
        ? document.querySelectorAll('section')[parseInt(v, 10)]
        : document.querySelector(v);
      if (target) {
        var y = target.getBoundingClientRect().top + window.scrollY;
        document.getElementById('main').style.transform = 'translateY(' + (-y) + 'px)';
        document.body.style.height = '100vh';
        document.body.style.overflow = 'hidden';
      }
    }
  }

  /* ---------------- feature page entrance ---------------- */
  function featurePage() {
    var fc = getComputedStyle(document.body).getPropertyValue('--fc').trim();
    if (fc) setHue(fc, true);
    lineEntrance(document, 0.25);
    reveals();
    if (FLAT) return;
    gsap.fromTo('.fp-kicker', { opacity: 0, y: 16 }, { opacity: 1, y: 0, duration: 0.9, ease: 'power3.out', delay: 0.15 });
    gsap.fromTo('.fp-lede', { opacity: 0, y: 24 }, { opacity: 1, y: 0, duration: 1, ease: 'power3.out', delay: 0.55 });
    // draw any diagram paths on scroll
    document.querySelectorAll('.fp-diagram [data-draw]').forEach(function (p) {
      var L = p.getTotalLength ? p.getTotalLength() : 0;
      if (!L) return;
      p.style.strokeDasharray = L;
      p.style.strokeDashoffset = L;
      gsap.to(p, {
        strokeDashoffset: 0, duration: 1.6, ease: 'power2.out',
        scrollTrigger: { trigger: p.closest('.fp-diagram'), start: 'top 75%' }
      });
    });
  }

  /* ---------------- boot ---------------- */
  function boot() {
    bindTransitions();
    maybeEnterFromVeil();

    if (page === 'home') {
      lineEntrance(document.querySelector('.hero'), 0.3);
      // section line masks reveal on scroll
      if (!FLAT) {
        document.querySelectorAll('section:not(.hero) .line-mask > .line-inner, footer .line-mask > .line-inner').forEach(function (el) {
          gsap.fromTo(el, { yPercent: 115, y: 0 }, {
            yPercent: 0, y: 0, duration: 1.1, ease: 'power4.out',
            scrollTrigger: { trigger: el.closest('section'), start: 'top 72%' }
          });
        });
      } else {
        document.querySelectorAll('.line-mask > .line-inner').forEach(function (el) { el.style.transform = 'none'; });
      }
      reveals();
      hueTriggers();
      buildJourney();
      buildVizes();
      buildStack();
      buildCompare();
      buildForm();
      // glow path last: measure AFTER pins created (spacers change layout)
      requestAnimationFrame(function () { buildGlowPath(); ScrollTrigger.refresh(); });
    } else {
      featurePage();
    }

    applyFlat();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', bootWhenFonts);
  else bootWhenFonts();

  function bootOnce() {
    if (bootOnce._done) return;
    bootOnce._done = true;
    requestAnimationFrame(boot);
  }
  function bootWhenFonts() {
    if (document.fonts && document.fonts.ready) {
      document.fonts.ready.then(bootOnce);
      setTimeout(bootOnce, 1200); // safety: don't wait forever
      return;
    }
    bootOnce();
  }
})();
