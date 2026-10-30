(() => {

  /* ---------- Loading screen: hide when page is ready ---------- */
  const loader = document.getElementById('loading-screen');
  const hideLoader = () => {
    if (!loader || loader.classList.contains('hidden')) return;
    loader.classList.add('hidden');
    document.body.classList.remove('loading');
  };
  window.addEventListener('load', () => setTimeout(hideLoader, 300));
  setTimeout(hideLoader, 4000); // failsafe

  /* run something once the loading screen is gone (so animations aren't wasted behind it) */
  const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const afterLoader = fn => {
    if (!loader || loader.classList.contains('hidden')) return fn();
    const mo = new MutationObserver(() => {
      if (loader.classList.contains('hidden')) { mo.disconnect(); fn(); }
    });
    mo.observe(loader, { attributes: true, attributeFilter: ['class'] });
  };

  /* ---------- Mobile menu ---------- */
  const menuBtn = document.getElementById('menu-toggle');
  const nav = document.getElementById('main-nav');
  const setMenu = open => {
    if (!nav || !menuBtn) return;
    nav.classList.toggle('open', open);
    menuBtn.setAttribute('aria-expanded', open);
    menuBtn.setAttribute('aria-label', open ? 'Close menu' : 'Open menu');
  };
  menuBtn?.addEventListener('click', () => setMenu(!nav.classList.contains('open')));
  nav?.addEventListener('click', e => { if (e.target.closest('a')) setMenu(false); });
  document.addEventListener('keydown', e => { if (e.key === 'Escape') setMenu(false); });

  /* ---------- Active nav link + reveal on scroll ---------- */
  const links = [...document.querySelectorAll('.nav-link')];
  const sections = links.map(l => document.querySelector(l.getAttribute('href'))).filter(Boolean);
  if ('IntersectionObserver' in window) {
    if (sections.length) {
      const spy = new IntersectionObserver(entries => {
        entries.forEach(en => {
          if (en.isIntersecting) links.forEach(l => l.classList.toggle('active', l.getAttribute('href') === '#' + en.target.id));
        });
      }, { rootMargin: '-45% 0px -50% 0px' });
      sections.forEach(s => spy.observe(s));
    }
    const rev = new IntersectionObserver((entries, o) => {
      entries.forEach(en => { if (en.isIntersecting) { en.target.classList.add('in'); o.unobserve(en.target); } });
    }, { threshold: .15 });
    document.querySelectorAll('.reveal').forEach(el => rev.observe(el));
  } else {
    document.querySelectorAll('.reveal').forEach(el => el.classList.add('in'));
  }

  /* ---------- Count-up stats ---------- */
  document.querySelectorAll('[data-count]').forEach(el => {
    const end = +el.dataset.count;
    if (!end || reduceMotion) return;
    afterLoader(() => setTimeout(() => {
      const dur = 1500; let start = null; el.dataset.animating = '1';
      const step = ts => {
        if (start === null) start = ts;
        const p = Math.min(1, (ts - start) / dur);
        el.textContent = Math.round(end * (1 - Math.pow(1 - p, 3))).toLocaleString();
        if (p < 1) requestAnimationFrame(step); else delete el.dataset.animating;
      };
      requestAnimationFrame(step);
    }, 1300));   // starts when the stats card has appeared
  });

  /* ---------- Keep the stats fresh (new ratings show without a full reload) ---------- */
  const ratingEl = document.getElementById('stat-rating');
  const refreshStats = () => {
    if (document.hidden) return;
    fetch('/api/public-stats', { cache: 'no-store' })
      .then(r => r.ok ? r.json() : null)
      .then(d => {
        if (!d) return;
        if (ratingEl) {
          ratingEl.textContent = (d.avg_rating ? d.avg_rating.toFixed(1) : '\u2013') + ' \u2605';
          ratingEl.title = d.rating_count + ' rating(s)';
        }
        document.querySelectorAll('[data-count]').forEach((el, i) => {
          const v = i === 0 ? d.total : d.cleaned;
          if (!el.dataset.animating) el.textContent = v.toLocaleString();
        });
      })
      .catch(() => {});
  };
  setTimeout(() => setInterval(refreshStats, 30000), 5000);
  document.addEventListener('visibilitychange', () => { if (!document.hidden) refreshStats(); });

  /* ---------- Smooth page transition ---------- */
  document.querySelectorAll('a.page-transition').forEach(a => {
    a.addEventListener('click', e => {
      if (e.metaKey || e.ctrlKey || e.shiftKey) return;
      e.preventDefault();
      document.body.classList.add('page-leaving');
      setTimeout(() => (location.href = a.href), 220);
    });
  });
  window.addEventListener('pageshow', e => { if (e.persisted) document.body.classList.remove('page-leaving'); });

  /* ---------- Animations (all skipped when "reduce motion" is on) ---------- */
  if (!reduceMotion) {
    const $ = (s, r = document) => r.querySelector(s);
    const $$ = (s, r = document) => [...r.querySelectorAll(s)];
    const rand = (a, b) => Math.random() * (b - a) + a;

    /* scroll progress bar + navbar shadow once you scroll */
    const bar = document.createElement('div');
    bar.className = 'scroll-progress';
    document.body.appendChild(bar);
    const navbar = $('.navbar');
    let ticking = false;
    const onScroll = () => {
      const max = document.documentElement.scrollHeight - innerHeight;
      bar.style.transform = `scaleX(${max > 0 ? Math.min(1, scrollY / max) : 0})`;
      navbar?.classList.toggle('scrolled', scrollY > 8);
      ticking = false;
    };
    addEventListener('scroll', () => { if (!ticking) { ticking = true; requestAnimationFrame(onScroll); } }, { passive: true });
    onScroll();

    /* hero headline: words rise in one by one (keeps the green accent span) */
    const h1 = $('.hero h1');
    if (h1) {
      let n = 0;
      const walk = node => [...node.childNodes].forEach(child => {
        if (child.nodeType === 3) {
          const frag = document.createDocumentFragment();
          child.textContent.split(/(\s+)/).forEach(part => {
            if (!part) return;
            if (/^\s+$/.test(part)) { frag.appendChild(document.createTextNode(part)); return; }
            const w = document.createElement('span');
            w.className = 'hw';
            w.style.setProperty('--wi', n++);
            w.textContent = part;
            frag.appendChild(w);
          });
          node.replaceChild(frag, child);
        } else if (child.nodeType === 1) walk(child);
      });
      walk(h1);
    }

    /* tiny leaves drifting up behind the hero */
    const decor = $('.hero-decor');
    if (decor) {
      for (let i = 0; i < 12; i++) {
        const l = document.createElement('span');
        l.className = 'fleaf';
        l.style.setProperty('--l', rand(2, 96).toFixed(1) + '%');
        l.style.setProperty('--s', rand(10, 22).toFixed(0) + 'px');
        l.style.setProperty('--t', rand(11, 20).toFixed(1) + 's');
        l.style.setProperty('--dl', (-rand(0, 20)).toFixed(1) + 's');
        l.style.setProperty('--x', rand(-70, 70).toFixed(0) + 'px');
        decor.appendChild(l);
      }
    }

    /* big logo: stays in place; when the cursor is over it, it tilts toward the cursor,
       catches the light, and an orbit ring lights up */
    const vis = $('.hero-visual');
    const logo = $('.hero-logo');
    if (vis && logo && matchMedia('(hover: hover) and (pointer: fine)').matches) {
      const orbit = document.createElement('div');
      orbit.className = 'logo-orbit';
      orbit.innerHTML = '<i></i>';
      const shine = document.createElement('div');
      shine.className = 'logo-shine';
      vis.append(orbit, shine);

      let raf = 0;
      const reset = () => {
        vis.classList.remove('is-hover');
        ['--rx', '--ry'].forEach(p => vis.style.removeProperty(p));
      };
      vis.addEventListener('pointermove', e => {
        if (raf) return;
        raf = requestAnimationFrame(() => {
          raf = 0;
          const r = vis.getBoundingClientRect();
          const dx = (e.clientX - (r.left + r.width / 2)) / (r.width * 0.35);   // -1..1 across the logo
          const dy = (e.clientY - (r.top + r.height / 2)) / (r.width * 0.35);
          if (Math.hypot(dx, dy) > 1.05) { reset(); return; }                 // cursor is not on the logo
          vis.classList.add('is-hover');
          vis.style.setProperty('--ry', (dx * 12).toFixed(2) + 'deg');
          vis.style.setProperty('--rx', (-dy * 12).toFixed(2) + 'deg');
          vis.style.setProperty('--sx', ((dx + 1) * 50).toFixed(1) + '%');
          vis.style.setProperty('--sy', ((dy + 1) * 50).toFixed(1) + '%');
        });
      });
      vis.addEventListener('pointerleave', () => { if (raf) { cancelAnimationFrame(raf); raf = 0; } reset(); });
    }

    /* click / tap the big logo: it boings */
    if (logo && logo.animate) {
      logo.style.cursor = 'pointer';
      logo.addEventListener('click', () => logo.animate(
        [{ scale: '1' }, { scale: '.88' }, { scale: '1.1' }, { scale: '1' }],
        { duration: 650, easing: 'cubic-bezier(.2,.9,.3,1.2)' }
      ));
    }

    /* buttons: click ripple + sliding arrow */
    $$('.start-btn, .login-btn, .primary-btn, .secondary-btn').forEach(el => {
      if (!el.children.length && /\u2192\s*$/.test(el.textContent)) {
        el.textContent = el.textContent.replace(/\s*\u2192\s*$/, ' ');
        const a = document.createElement('span');
        a.className = 'btn-arrow';
        a.textContent = '\u2192';
        el.appendChild(a);
      }
      el.addEventListener('pointerdown', e => {
        const r = el.getBoundingClientRect(), size = Math.max(r.width, r.height) * 2;
        const dot = document.createElement('span');
        dot.className = 'ripple';
        dot.style.cssText = `width:${size}px;height:${size}px;left:${e.clientX - r.left - size / 2}px;top:${e.clientY - r.top - size / 2}px`;
        el.appendChild(dot);
        setTimeout(() => dot.remove(), 650);
      });
    });

    /* theme button: icon spins when clicked */
    const themeBtn = $('#theme-toggle');
    themeBtn?.addEventListener('click', () => {
      themeBtn.classList.remove('spin'); void themeBtn.offsetWidth; themeBtn.classList.add('spin');
    });

    /* scroll reveal: staggered, and extended to every section below the hero */
    if ('IntersectionObserver' in window) {
      const extra = $$('.how .section-label, .how h2, .steps li, .about-visual, .about-content > *:not(.about-points), .about-point, footer');
      const all = new Set([...$$('.reveal'), ...extra]);
      const fresh = [];
      const counters = new Map();
      const io = new IntersectionObserver((entries, o) => {
        entries.forEach(en => { if (en.isIntersecting) { en.target.classList.add('in'); o.unobserve(en.target); } });
      }, { threshold: .15 });
      all.forEach(el => {
        const p = el.parentElement, i = counters.get(p) || 0;
        counters.set(p, i + 1);
        el.style.setProperty('--d', i);
        if (!el.classList.contains('reveal')) { el.classList.add('reveal'); fresh.push(el); }
        /* once revealed, hand the element back to normal so hover effects are instant */
        el.addEventListener('transitionend', function done(e) {
          if (e.target !== el || e.propertyName !== 'transform' || !el.classList.contains('in')) return;
          el.removeEventListener('transitionend', done);
          setTimeout(() => el.classList.remove('reveal', 'in'), 700);
        });
      });
      afterLoader(() => fresh.forEach(el => io.observe(el)));
    }
  }

  /* ---------- PWA service worker ---------- */
  if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => navigator.serviceWorker.register('/sw.js').catch(() => {}));
  }
})();
