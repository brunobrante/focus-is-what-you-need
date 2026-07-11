/* ============================================================
   HOLON — main choreography (GSAP + ScrollTrigger + Lenis)
   ============================================================ */
(() => {
  const html = document.documentElement;
  const q = new URLSearchParams(location.search);
  const REDUCED = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const FLAT = q.has('flat') || REDUCED;
  const PAGE = document.body.dataset.page || 'home';
  if (q.has('flat')) html.classList.add('flat');
  if (REDUCED) html.classList.add('no-motion');

  gsap.registerPlugin(ScrollTrigger);
  gsap.defaults({ ease: 'power3.out' });

  /* ---------- smooth scroll ---------- */
  let lenis = null;
  if (!FLAT && typeof Lenis !== 'undefined') {
    lenis = new Lenis({ lerp: 0.1, wheelMultiplier: 1 });
    lenis.on('scroll', ScrollTrigger.update);
    gsap.ticker.add((t) => lenis.raf(t * 1000));
    gsap.ticker.lagSmoothing(0);
  }

  /* ---------- nav state + anchor scroll ---------- */
  const nav = document.querySelector('.nav');
  const onScroll = () => nav && nav.classList.toggle('scrolled', (window.scrollY || 0) > 40);
  window.addEventListener('scroll', onScroll, { passive: true });
  onScroll();

  document.querySelectorAll('a[href^="#"]').forEach((a) => {
    a.addEventListener('click', (e) => {
      const el = document.querySelector(a.getAttribute('href'));
      if (!el) return;
      e.preventDefault();
      if (lenis) lenis.scrollTo(el, { offset: 0, duration: 1.4 });
      else el.scrollIntoView();
    });
  });

  /* ---------- page transitions ---------- */
  const veil = document.querySelector('.veil');
  document.querySelectorAll('a[data-transition]').forEach((a) => {
    a.addEventListener('click', (e) => {
      if (FLAT || !veil) return; // plain navigation in flat mode
      e.preventDefault();
      const href = a.getAttribute('href');
      sessionStorage.setItem('holon-veil', '1');
      let gone = false;
      const go = () => { if (!gone) { gone = true; location.href = href; } };
      gsap.set(veil, { transformOrigin: '50% 100%' });
      gsap.to(veil, { scaleY: 1, duration: 0.55, ease: 'power4.inOut', onComplete: go });
      setTimeout(go, 900); // never strand the user if rAF stalls

    });
  });

  /* ---------- entrance (preloader / veil-out) ---------- */
  const preloader = document.querySelector('.preloader');
  const cameThroughVeil = sessionStorage.getItem('holon-veil') === '1';
  sessionStorage.removeItem('holon-veil');

  function entrance() {
    const tl = gsap.timeline();
    if (preloader) {
      if (cameThroughVeil || FLAT) {
        preloader.style.display = 'none';
      } else {
        tl.fromTo(preloader.querySelector('.mark'),
          { scale: 0.6, opacity: 0, rotation: -8 },
          { scale: 1, opacity: 1, rotation: 0, duration: 0.5, ease: 'back.out(1.6)' })
          .to(preloader, { yPercent: -100, duration: 0.7, ease: 'power4.inOut', delay: 0.15 })
          .set(preloader, { display: 'none' });
      }
    }
    if (veil && cameThroughVeil && !FLAT) {
      gsap.set(veil, { scaleY: 1, transformOrigin: '50% 0%' });
      tl.to(veil, { scaleY: 0, duration: 0.65, ease: 'power4.inOut' }, 0.05);
    }
    if (FLAT) return tl;

    // hero / page-hero lines
    const heroLines = document.querySelectorAll(
      PAGE === 'home' ? '.hero .line-inner' : '.fd-hero .line-inner'
    );
    if (heroLines.length) {
      gsap.set(heroLines, { yPercent: 115, y: 0 });
      tl.to(heroLines, {
        yPercent: 0, y: 0, duration: 1.1, stagger: 0.09, ease: 'power4.out'
      }, preloader && !cameThroughVeil ? '-=0.25' : 0.2);
    }
    const heroReveals = document.querySelectorAll(
      (PAGE === 'home' ? '.hero' : '.fd-hero') + ' [data-reveal]'
    );
    if (heroReveals.length) {
      tl.to(heroReveals, { opacity: 1, y: 0, duration: 0.9, stagger: 0.08 }, '<0.25');
    }
    return tl;
  }

  /* ---------- scroll reveals (below the fold) ---------- */
  function setupReveals() {
    if (FLAT) return;
    const heroSel = PAGE === 'home' ? '.hero' : '.fd-hero';
    document.querySelectorAll(`[data-reveal]:not(${heroSel} [data-reveal])`).forEach((el) => {
      gsap.to(el, {
        opacity: 1, y: 0, duration: 0.95,
        scrollTrigger: { trigger: el, start: 'top 86%' }
      });
    });
    document.querySelectorAll(`[data-lines]`).forEach((h) => {
      const inners = h.querySelectorAll('.line-inner');
      if (!inners.length) return;
      gsap.set(inners, { yPercent: 115, y: 0 });
      gsap.to(inners, {
        yPercent: 0, y: 0, duration: 1.05, stagger: 0.1, ease: 'power4.out',
        scrollTrigger: { trigger: h, start: 'top 84%' }
      });
    });
  }

  /* ============================================================
     HOME-ONLY MODULES
     ============================================================ */

  /* ---------- law: code → component ---------- */
  function setupLaw() {
    const card = document.getElementById('code-card');
    if (!card) return;
    const lines = card.querySelectorAll('.cl');
    const hl = document.getElementById('hl-btn');
    const formed = document.getElementById('formed');
    if (FLAT) { hl && hl.classList.add('on'); return; }
    gsap.set(lines, { opacity: 0, x: -14 });
    const tl = gsap.timeline({
      scrollTrigger: { trigger: card, start: 'top 75%' }
    });
    tl.to(lines, { opacity: 1, x: 0, duration: 0.45, stagger: 0.14 })
      .call(() => hl && hl.classList.add('on'), null, '+=0.2')
      .fromTo(formed,
        { opacity: 0, y: 16, scale: 0.94 },
        { opacity: 1, y: 0, scale: 1, duration: 0.6, ease: 'back.out(1.7)' }, '+=0.35');
  }

  /* ---------- journey: vertical → horizontal ---------- */
  function setupJourney() {
    const track = document.getElementById('journey-track');
    if (!track) return;
    const panels = track.querySelectorAll('.panel');
    const rail = document.querySelectorAll('#journey-rail i');

    if (FLAT) {
      const k = parseInt(q.get('panel') || '0', 10) || 0;
      track.style.transform = `translateX(${-k * 100}vw)`;
      rail.forEach((d, i) => d.classList.toggle('on', i === k));
      return;
    }

    const dist = () => track.scrollWidth - window.innerWidth;
    const tween = gsap.to(track, {
      x: () => -dist(),
      ease: 'none',
      scrollTrigger: {
        trigger: '.journey-pin',
        start: 'top top',
        end: () => '+=' + dist() * 1.1,
        pin: true,
        scrub: 1,
        snap: { snapTo: 1 / (panels.length - 1), duration: 0.4, ease: 'power2.inOut' },
        invalidateOnRefresh: true,
        onUpdate: (self) => {
          const k = Math.round(self.progress * (panels.length - 1));
          rail.forEach((d, i) => d.classList.toggle('on', i === k));
        }
      }
    });

    // per-panel parallax on stages
    panels.forEach((p) => {
      const stage = p.querySelector('.panel-stage > *');
      if (!stage) return;
      gsap.fromTo(stage, { x: 90, opacity: 0.4 }, {
        x: 0, opacity: 1, ease: 'none',
        scrollTrigger: {
          trigger: p, containerAnimation: tween,
          start: 'left 80%', end: 'left 25%', scrub: true
        }
      });
    });

    // arrow in the head rotates as the turn approaches
    const arrow = document.getElementById('turn-arrow');
    if (arrow) {
      gsap.to(arrow, {
        rotation: -90, ease: 'none',
        scrollTrigger: { trigger: '.journey-pin', start: 'top 90%', end: 'top top', scrub: true }
      });
    }
  }

  /* ---------- frame: zoom floor toy ---------- */
  function setupZoom() {
    const frame = document.getElementById('zoom-frame');
    if (!frame) return;
    const label = document.getElementById('zoom-label');
    const toast = document.getElementById('zoom-toast');
    let z = 1, toastTimer = null;
    const render = () => {
      label.textContent = z.toFixed(1) + '×';
      gsap.to(frame, { scale: z, duration: 0.5, ease: 'power3.out' });
    };
    document.getElementById('zoom-in').addEventListener('click', () => {
      z = Math.min(2, z + 0.5); render();
    });
    document.getElementById('zoom-out').addEventListener('click', () => {
      if (z > 1) { z = Math.max(1, z - 0.5); render(); return; }
      // 1x is the floor
      gsap.fromTo(frame, { x: -7 }, { x: 0, duration: 0.6, ease: 'elastic.out(1, 0.25)' });
      toast.classList.add('show');
      clearTimeout(toastTimer);
      toastTimer = setTimeout(() => toast.classList.remove('show'), 1800);
    });
  }

  /* ---------- ownership threads ---------- */
  function setupThreads() {
    const svg = document.getElementById('own-svg');
    if (!svg) return;
    const stage = svg.parentElement;
    const cards = stage.querySelectorAll('.own-card');
    const p1 = document.getElementById('thread-1');
    const p2 = document.getElementById('thread-2');

    function draw() {
      if (getComputedStyle(svg).display === 'none') return;
      const s = stage.getBoundingClientRect();
      svg.setAttribute('viewBox', `0 0 ${s.width} ${s.height}`);
      const r = [...cards].map((c) => {
        const b = c.getBoundingClientRect();
        return { x1: b.left - s.left, x2: b.right - s.left, y: b.top - s.top + b.height / 2 };
      });
      if (r.length < 3) return;
      const arc = (a, b) =>
        `M ${a.x2} ${a.y} C ${a.x2 + (b.x1 - a.x2) * 0.5} ${a.y - 46}, ${a.x2 + (b.x1 - a.x2) * 0.5} ${b.y - 46}, ${b.x1} ${b.y}`;
      p1.setAttribute('d', arc(r[0], r[1]));
      p2.setAttribute('d', arc(r[1], r[2]));
    }
    draw();
    window.addEventListener('resize', draw);

    if (FLAT) return;
    [p1, p2].forEach((p, i) => {
      const len = p.getTotalLength ? Math.max(p.getTotalLength(), 10) : 600;
      if (p === p2) {
        // keep the dashed look, animate opacity instead
        gsap.fromTo(p, { opacity: 0 }, {
          opacity: 1, duration: 1,
          scrollTrigger: { trigger: stage, start: 'top 70%' }, delay: 0.5
        });
      } else {
        gsap.set(p, { strokeDasharray: len, strokeDashoffset: len });
        gsap.to(p, {
          strokeDashoffset: 0, duration: 1.3, ease: 'power2.inOut',
          scrollTrigger: { trigger: stage, start: 'top 70%' }, delay: i * 0.4
        });
      }
    });
  }

  /* ---------- builder stack ---------- */
  function setupStack() {
    const stack = document.getElementById('stack');
    if (!stack) return;
    const cuts = stack.querySelectorAll('.cut');
    const LIFT = 56;
    if (FLAT) {
      cuts.forEach((c) => { c.style.transform = `translateZ(${(+c.dataset.z) * LIFT}px)`; });
      return;
    }
    gsap.set(cuts, { z: 0 });
    gsap.to(cuts, {
      z: (i, el) => (+el.dataset.z) * LIFT,
      duration: 1.4, ease: 'power3.inOut', stagger: 0.12,
      scrollTrigger: { trigger: stack, start: 'top 75%' }
    });
    gsap.to(stack, {
      rotationZ: -26, duration: 6, yoyo: true, repeat: -1, ease: 'sine.inOut'
    });
  }

  /* ---------- compare: chaos → tree morph ---------- */
  function setupCompare() {
    const stage = document.getElementById('chaos-stage');
    if (!stage) return;

    // tree layout — fractions of the stage
    const LAYOUT = [
      { l: 'Header',   x: 0.32, y: 0.170, w: 0.36, h: 0.060 },
      { l: 'Logo',     x: 0.32, y: 0.250, w: 0.11, h: 0.048 },
      { l: 'Nav',      x: 0.45, y: 0.250, w: 0.23, h: 0.048 },
      { l: 'Hero',     x: 0.32, y: 0.318, w: 0.36, h: 0.170 },
      { l: 'Buy now',  x: 0.345, y: 0.408, w: 0.14, h: 0.052, hot: true },
      { l: 'Card',     x: 0.32, y: 0.512, w: 0.17, h: 0.120 },
      { l: 'Card',     x: 0.51, y: 0.512, w: 0.17, h: 0.120 },
      { l: 'List row', x: 0.32, y: 0.655, w: 0.36, h: 0.085 },
      { l: 'Tab bar',  x: 0.32, y: 0.762, w: 0.36, h: 0.058 },
      { l: 'Avatar',   x: 0.60, y: 0.170, w: 0.08, h: 0.060 }
    ];
    // seeded PRNG so the chaos is stable frame to frame
    let seed = 7;
    const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;

    const chips = LAYOUT.map((c) => {
      const el = document.createElement('div');
      el.className = 'chip' + (c.hot ? ' hot' : '');
      el.textContent = c.l;
      el.style.left = c.x * 100 + '%';
      el.style.top = c.y * 100 + '%';
      el.style.width = c.w * 100 + '%';
      el.style.height = c.h * 100 + '%';
      stage.appendChild(el);
      return el;
    });
    const outline = document.getElementById('tree-outline');
    outline.style.left = '30%'; outline.style.top = '13%';
    outline.style.width = '40%'; outline.style.height = '72%';

    const capThem = document.getElementById('cap-them');
    const capUs = document.getElementById('cap-us');

    if (FLAT) { outline.style.opacity = 1; capThem.style.opacity = 0; capUs.style.opacity = 1; return; }

    // scatter transforms (relative offsets from final spots)
    chips.forEach((el) => {
      gsap.set(el, {
        x: (rnd() - 0.5) * stage.clientWidth * 0.85,
        y: (rnd() - 0.5) * stage.clientHeight * 0.8,
        rotation: (rnd() - 0.5) * 50,
        scale: 0.75 + rnd() * 0.5
      });
    });

    // pin + scrub on wide screens; plain on-enter play when the layout stacks
    const stacked = window.innerWidth <= 1024;
    const tl = gsap.timeline({
      scrollTrigger: stacked
        ? { trigger: stage, start: 'top 70%' }
        : {
          trigger: '.compare-pin',
          start: 'top top',
          end: '+=120%',
          pin: true,
          scrub: 0.8,
          invalidateOnRefresh: true
        }
    });
    tl.to(chips, {
      x: 0, y: 0, rotation: 0, scale: 1,
      duration: 1, ease: 'power2.inOut', stagger: 0.045
    })
      .to(capThem, { opacity: 0, duration: 0.12 }, 0.55)
      .to(capUs, { opacity: 1, duration: 0.15 }, 0.6)
      .to(outline, { opacity: 1, duration: 0.2 }, 0.75)
      .fromTo('#cmp-rows [data-cmp] .us-c', { opacity: 0.25 }, { opacity: 1, stagger: 0.06, duration: 0.2 }, 0.55);
  }

  /* ---------- magnetic buttons ---------- */
  function setupMagnetic() {
    if (FLAT || !matchMedia('(pointer: fine)').matches) return;
    document.querySelectorAll('.btn').forEach((b) => {
      b.addEventListener('mousemove', (e) => {
        const r = b.getBoundingClientRect();
        gsap.to(b, {
          x: (e.clientX - r.left - r.width / 2) * 0.25,
          y: (e.clientY - r.top - r.height / 2) * 0.35,
          duration: 0.4
        });
      });
      b.addEventListener('mouseleave', () => gsap.to(b, { x: 0, y: 0, duration: 0.6, ease: 'elastic.out(1, 0.4)' }));
    });
  }

  /* ============================================================
     boot
     ============================================================ */
  window.addEventListener('load', () => {
    entrance();
    setupReveals();
    if (PAGE === 'home') {
      setupLaw();
      setupJourney();
      setupZoom();
      setupThreads();
      setupStack();
      setupCompare();
    }
    setupMagnetic();
    ScrollTrigger.refresh();

    /* flat-mode section targeting: ?flat=<index|selector>[&panel=K] */
    if (html.classList.contains('flat')) {
      const t = q.get('flat');
      if (t) {
        let el = null;
        if (/^\d+$/.test(t)) el = document.querySelectorAll('main > section')[+t];
        else { try { el = document.querySelector(t); } catch (_) { } }
        if (el) {
          const top = el.getBoundingClientRect().top + (window.scrollY || 0);
          document.getElementById('main').style.transform = `translateY(${-top}px)`;
        }
      }
    }
  });
})();
