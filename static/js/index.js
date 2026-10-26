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
    if (!end || matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    let n = 0; const step = Math.max(1, Math.ceil(end / 40));
    const t = setInterval(() => { n = Math.min(end, n + step); el.textContent = n; if (n >= end) clearInterval(t); }, 30);
  });

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

  /* ---------- PWA service worker ---------- */
  if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => navigator.serviceWorker.register('/sw.js').catch(() => {}));
  }
})();
