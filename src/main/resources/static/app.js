/**
 * SpendWise — "Enhance" layer (visual/interaction polish only)
 * Load AFTER app.js:  <script src="enhance.js"></script>
 * Every feature here is defensive — if an element isn't on the current
 * page, that feature just quietly does nothing. Nothing in app.js is
 * modified or relied upon beyond reading the DOM it produces.
 */
(function () {
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  /* ------------------------------------------------------------ */
  /* 1. Cursor glow                                                 */
  /* ------------------------------------------------------------ */
  function initCursorGlow() {
    if (reduceMotion || window.matchMedia('(hover: none)').matches) return;
    const glow = document.createElement('div');
    glow.id = 'cursor-glow';
    document.body.appendChild(glow);
    let x = window.innerWidth / 2, y = window.innerHeight / 2;
    let cx = x, cy = y;
    window.addEventListener('mousemove', (e) => { x = e.clientX; y = e.clientY; });
    (function loop() {
      cx += (x - cx) * 0.12;
      cy += (y - cy) * 0.12;
      glow.style.transform = `translate(${cx}px, ${cy}px) translate(-50%,-50%)`;
      requestAnimationFrame(loop);
    })();
  }

  /* ------------------------------------------------------------ */
  /* 2. Button ripple on click (event delegation — works for any    */
  /*    .btn added later by app.js re-renders)                      */
  /* ------------------------------------------------------------ */
  function initRipple() {
    document.addEventListener('click', (e) => {
      const btn = e.target.closest('.btn');
      if (!btn) return;
      const rect = btn.getBoundingClientRect();
      const size = Math.max(rect.width, rect.height);
      const ripple = document.createElement('span');
      ripple.className = 'ripple';
      ripple.style.width = ripple.style.height = size + 'px';
      ripple.style.left = (e.clientX - rect.left - size / 2) + 'px';
      ripple.style.top = (e.clientY - rect.top - size / 2) + 'px';
      btn.appendChild(ripple);
      setTimeout(() => ripple.remove(), 650);
    });
  }

  /* ------------------------------------------------------------ */
  /* 3. Scroll-reveal for cards, including ones injected later      */
  /* ------------------------------------------------------------ */
  function initScrollReveal() {
    const io = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          entry.target.classList.add('reveal-in');
          io.unobserve(entry.target);
        }
      });
    }, { threshold: 0.12, rootMargin: '0px 0px -40px 0px' });

    function tag(root) {
      root.querySelectorAll('.card, .snapshot-card, .goal-card, .dcard').forEach((el) => {
        if (el.dataset.revealBound) return;
        el.dataset.revealBound = '1';
        el.classList.add('reveal-init');
        io.observe(el);
      });
    }
    tag(document);

    // App content is re-rendered dynamically (dashboard cards, results
    // page, etc). Watch for new nodes and tag them too.
    const mo = new MutationObserver((mutations) => {
      mutations.forEach((m) => {
        m.addedNodes.forEach((node) => {
          if (node.nodeType === 1) tag(node.parentElement ? node : document);
        });
      });
    });
    const shell = document.getElementById('app-views') || document.body;
    mo.observe(shell, { childList: true, subtree: true });
  }

  /* ------------------------------------------------------------ */
  /* 4. 3D tilt for hero frame + snapshot/dashboard cards            */
  /* ------------------------------------------------------------ */
  function initTilt() {
    if (reduceMotion || window.matchMedia('(hover: none)').matches) return;

    function bindTilt(el, { max = 6, varX = '--tiltY', varY = '--tiltX' } = {}) {
      if (el.dataset.tiltBound) return;
      el.dataset.tiltBound = '1';
      el.addEventListener('mousemove', (e) => {
        const r = el.getBoundingClientRect();
        const px = (e.clientX - r.left) / r.width - 0.5;
        const py = (e.clientY - r.top) / r.height - 0.5;
        el.style.setProperty(varX, (px * max * 2) + 'deg');
        el.style.setProperty(varY, (-py * max * 2) + 'deg');
      });
      el.addEventListener('mouseleave', () => {
        el.style.setProperty(varX, '0deg');
        el.style.setProperty(varY, '0deg');
      });
    }

    const hero = document.querySelector('.hero-frame');
    if (hero) bindTilt(hero, { max: 5 });

    function bindCardTilt(root) {
      root.querySelectorAll('.snapshot-card').forEach((el) => {
        if (el.dataset.tiltBound) return;
        el.dataset.tiltBound = '1';
        el.addEventListener('mousemove', (e) => {
          const r = el.getBoundingClientRect();
          const px = (e.clientX - r.left) / r.width - 0.5;
          const py = (e.clientY - r.top) / r.height - 0.5;
          el.style.setProperty('--ry', (px * 8) + 'deg');
          el.style.setProperty('--rx', (-py * 8) + 'deg');
        });
        el.addEventListener('mouseleave', () => {
          el.style.setProperty('--rx', '0deg');
          el.style.setProperty('--ry', '0deg');
        });
      });
    }
    bindCardTilt(document);
    const mo = new MutationObserver(() => bindCardTilt(document));
    const grid = document.getElementById('snapshot-grid');
    if (grid) mo.observe(grid, { childList: true });
  }

  /* ------------------------------------------------------------ */
  /* 5. Landing page particle network (lightweight canvas)          */
  /* ------------------------------------------------------------ */
  function initParticles() {
    const hero = document.querySelector('.landing-page');
    if (!hero || reduceMotion) return;

    // Decorative blobs
    ['blob-1', 'blob-2', 'blob-3'].forEach((cls) => {
      const b = document.createElement('div');
      b.className = 'blob ' + cls;
      hero.appendChild(b);
    });

    const canvas = document.createElement('canvas');
    canvas.id = 'landing-particles';
    hero.insertBefore(canvas, hero.firstChild);
    const ctx = canvas.getContext('2d');
    let w, h, particles;

    function resize() {
      w = canvas.width = hero.offsetWidth;
      h = canvas.height = hero.offsetHeight;
    }
    function makeParticles() {
      const count = Math.min(46, Math.round((w * h) / 26000));
      particles = Array.from({ length: count }, () => ({
        x: Math.random() * w,
        y: Math.random() * h,
        vx: (Math.random() - 0.5) * 0.35,
        vy: (Math.random() - 0.5) * 0.35,
        r: Math.random() * 1.6 + 0.6,
      }));
    }
    function tick() {
      ctx.clearRect(0, 0, w, h);
      particles.forEach((p) => {
        p.x += p.vx; p.y += p.vy;
        if (p.x < 0 || p.x > w) p.vx *= -1;
        if (p.y < 0 || p.y > h) p.vy *= -1;
      });
      for (let i = 0; i < particles.length; i++) {
        for (let j = i + 1; j < particles.length; j++) {
          const a = particles[i], b = particles[j];
          const d = Math.hypot(a.x - b.x, a.y - b.y);
          if (d < 120) {
            ctx.strokeStyle = `rgba(15,107,79,${0.12 * (1 - d / 120)})`;
            ctx.lineWidth = 1;
            ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke();
          }
        }
      }
      particles.forEach((p) => {
        ctx.beginPath();
        ctx.fillStyle = 'rgba(15,107,79,0.35)';
        ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
        ctx.fill();
      });
      requestAnimationFrame(tick);
    }
    resize(); makeParticles(); tick();
    window.addEventListener('resize', () => { resize(); makeParticles(); });
  }

  /* ------------------------------------------------------------ */
  /* 6. Sidebar sliding active-link indicator                        */
  /* ------------------------------------------------------------ */
  function initNavIndicator() {
    const group = document.querySelector('.nav-group');
    if (!group) return;
    let indicator = document.getElementById('nav-indicator');
    if (!indicator) {
      indicator = document.createElement('div');
      indicator.id = 'nav-indicator';
      group.appendChild(indicator);
    }
    function place() {
      const active = group.querySelector('.nav-link.active');
      if (!active) { indicator.style.height = '0'; return; }
      indicator.style.height = active.offsetHeight + 'px';
      indicator.style.transform = `translateY(${active.offsetTop}px)`;
    }
    setTimeout(place, 60);
    window.addEventListener('resize', place);
    const mo = new MutationObserver(place);
    mo.observe(group, { childList: true, subtree: true, attributes: true, attributeFilter: ['class'] });
  }

  /* ------------------------------------------------------------ */
  /* 7. Confetti burst — triggered when a BUY verdict renders        */
  /* ------------------------------------------------------------ */
  function launchConfetti() {
    if (reduceMotion) return;
    let canvas = document.getElementById('confetti-canvas');
    if (!canvas) {
      canvas = document.createElement('canvas');
      canvas.id = 'confetti-canvas';
      document.body.appendChild(canvas);
    }
    const ctx = canvas.getContext('2d');
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
    const colors = ['#0F6B4F', '#3D4FC4', '#B4720B', '#1B9E75', '#F5F6F3'];
    const pieces = Array.from({ length: 140 }, () => ({
      x: Math.random() * canvas.width,
      y: -20 - Math.random() * canvas.height * 0.3,
      w: 6 + Math.random() * 6,
      h: 8 + Math.random() * 8,
      vy: 2 + Math.random() * 3,
      vx: (Math.random() - 0.5) * 2,
      rot: Math.random() * Math.PI,
      vr: (Math.random() - 0.5) * 0.2,
      color: colors[Math.floor(Math.random() * colors.length)],
    }));
    let frame = 0;
    const maxFrames = 130;
    (function tick() {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      pieces.forEach((p) => {
        p.x += p.vx; p.y += p.vy; p.rot += p.vr;
        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.rotate(p.rot);
        ctx.fillStyle = p.color;
        ctx.fillRect(-p.w / 2, -p.h / 2, p.w, p.h);
        ctx.restore();
      });
      frame++;
      if (frame < maxFrames) requestAnimationFrame(tick);
      else ctx.clearRect(0, 0, canvas.width, canvas.height);
    })();
  }

  /* ------------------------------------------------------------ */
  /* 8. Typewriter reveal for the AI response line + confetti hook   */
  /* ------------------------------------------------------------ */
  function watchResults() {
    const target = document.getElementById('step-results');
    if (!target) return;
    const mo = new MutationObserver(() => {
      const verdictEl = target.querySelector('.verdict-word');
      if (verdictEl && !verdictEl.dataset.enhanced) {
        verdictEl.dataset.enhanced = '1';
        const card = target.querySelector('.verdict-card');
        const colorMap = { buy: 'var(--buy)', wait: 'var(--wait)', skip: 'var(--skip)', alt: 'var(--alt)' };
        const cls = ['buy', 'wait', 'skip', 'alt'].find((c) => verdictEl.classList.contains(c));
        if (card && cls) card.style.setProperty('--glow-color', colorMap[cls]);
        if (cls === 'buy') launchConfetti();
      }
      const aiText = target.querySelector('.ai-response-text');
      if (aiText && !aiText.dataset.typed) {
        aiText.dataset.typed = '1';
        const full = aiText.textContent;
        if (!reduceMotion && full) {
          aiText.textContent = '';
          aiText.classList.add('typing');
          let i = 0;
          const step = Math.max(1, Math.round(full.length / 90));
          (function typeTick() {
            i += step;
            aiText.textContent = full.slice(0, i);
            if (i < full.length) setTimeout(typeTick, 12);
            else aiText.classList.remove('typing');
          })();
        }
      }
    });
    mo.observe(target, { childList: true, subtree: true });
  }

  /* ------------------------------------------------------------ */
  document.addEventListener('DOMContentLoaded', () => {
    initCursorGlow();
    initRipple();
    initScrollReveal();
    initTilt();
    initParticles();
    initNavIndicator();
    watchResults();
  });

  // The sidebar/shell is re-rendered async by app.js's initShell(); make
  // sure the nav indicator gets (re)bound once it exists.
  const shellObserver = new MutationObserver(() => {
    if (document.querySelector('.nav-group')) initNavIndicator();
  });
  shellObserver.observe(document.body, { childList: true, subtree: true });
})();
