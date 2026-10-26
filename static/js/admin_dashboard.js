(() => {
  const root = document.documentElement;

  /* ---- theme ---- */
  const themeBtn = document.getElementById('theme-toggle');
  const applyTheme = t => {
    root.dataset.theme = t;
    themeBtn.textContent = t === 'dark' ? '☀️' : '🌙';
    themeBtn.setAttribute('aria-pressed', t === 'dark');
    themeBtn.setAttribute('aria-label', t === 'dark' ? 'Switch to light mode' : 'Switch to dark mode');
  };
  applyTheme(root.dataset.theme || 'light');
  themeBtn.addEventListener('click', () => {
    const next = root.dataset.theme === 'dark' ? 'light' : 'dark';
    try { localStorage.setItem('theme', next); } catch (e) {}
    applyTheme(next);
  });

  /* ---- mobile sidebar ---- */
  const side = document.getElementById('sidebar'), scrim = document.getElementById('scrim'), menu = document.getElementById('menu-btn');
  const setSide = open => {
    side.classList.toggle('open', open); scrim.classList.toggle('show', open);
    menu.setAttribute('aria-expanded', open);
  };
  menu.addEventListener('click', () => setSide(!side.classList.contains('open')));
  scrim.addEventListener('click', () => setSide(false));
  side.querySelectorAll('nav a').forEach(link => link.addEventListener('click', () => setSide(false)));
  document.addEventListener('keydown', e => { if (e.key === 'Escape') setSide(false); });

  /* ---- table filter + search ---- */
  const rows = [...document.querySelectorAll('#reports-table tbody tr')];
  const empty = document.getElementById('empty');
  const search = document.getElementById('search');
  let filter = 'all';
  const apply = () => {
    const q = search.value.trim().toLowerCase();
    let shown = 0;
    rows.forEach(r => {
      const ok = (filter === 'all' || r.dataset.status === filter) && (!q || r.textContent.toLowerCase().includes(q));
      r.hidden = !ok; if (ok) shown++;
    });
    empty.hidden = shown > 0;
  };
  const setFilter = f => {
    filter = f;
    document.querySelectorAll('.tab').forEach(x => {
      const on = x.dataset.filter === f;
      x.classList.toggle('on', on); x.setAttribute('aria-selected', on);
    });
    apply();
  };
  document.querySelectorAll('.tab').forEach(t => t.addEventListener('click', () => setFilter(t.dataset.filter)));

  /* stat cards + banner button jump to the table with a filter */
  document.querySelectorAll('[data-jump]').forEach(el => {
    const go = () => {
      setFilter(el.dataset.jump);
      document.getElementById('reports').scrollIntoView({ behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth', block: 'start' });
    };
    el.addEventListener('click', go);
    el.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); go(); } });
  });
  search.addEventListener('input', apply);
  document.querySelector('.bell').addEventListener('click', () => {
    setFilter('pending');
    document.getElementById('reports').scrollIntoView({
      behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth',
      block: 'start'
    });
  });

  /* ---- calendar (highlights days that have reports) ---- */
  const cal = document.querySelector('.calendar');
  let dates = [];
  try { dates = JSON.parse(cal.dataset.dates || '[]'); } catch (e) {}
  const has = new Set(dates);
  const grid = document.getElementById('cal-grid'), title = document.getElementById('cal-title');
  let view = new Date(); view.setDate(1);
  const pad = n => String(n).padStart(2, '0');

  function drawCal() {
    const y = view.getFullYear(), m = view.getMonth();
    title.textContent = view.toLocaleDateString(undefined, { month: 'long', year: 'numeric' });
    const first = new Date(y, m, 1).getDay(), days = new Date(y, m + 1, 0).getDate(), prevDays = new Date(y, m, 0).getDate();
    const today = new Date();
    let html = ['Su','Mo','Tu','We','Th','Fr','Sa'].map(d => `<div class="dow">${d}</div>`).join('');
    for (let i = first - 1; i >= 0; i--) html += `<div class="day out">${prevDays - i}</div>`;
    for (let d = 1; d <= days; d++) {
      const iso = `${y}-${pad(m + 1)}-${pad(d)}`;
      const isToday = d === today.getDate() && m === today.getMonth() && y === today.getFullYear();
      html += `<div class="day${has.has(iso) ? ' has' : ''}${isToday ? ' today' : ''}">${d}</div>`;
    }
    const filled = first + days, tail = (7 - (filled % 7)) % 7;
    for (let d = 1; d <= tail; d++) html += `<div class="day out">${d}</div>`;
    grid.innerHTML = html;
  }
  document.getElementById('cal-prev').addEventListener('click', () => { view.setMonth(view.getMonth() - 1); drawCal(); });
  document.getElementById('cal-next').addEventListener('click', () => { view.setMonth(view.getMonth() + 1); drawCal(); });
  drawCal();

  /* ---- announcements dialog ---- */
  const dlg = document.getElementById('ann-dialog');
  const openBtn = document.getElementById('ann-open');
  if (dlg && openBtn) {
    const msg = document.getElementById('ann-msg'), count = document.getElementById('ann-count');
    const annForm = dlg.querySelector('form');
    const error = document.getElementById('ann-error');
    openBtn.addEventListener('click', () => { dlg.showModal(); document.getElementById('ann-title-in').focus(); });
    document.getElementById('ann-cancel').addEventListener('click', () => dlg.close());
    dlg.addEventListener('click', e => { if (e.target === dlg) dlg.close(); });   // click outside closes
    msg.addEventListener('input', () => { count.textContent = msg.value.length; });
    annForm.addEventListener('submit', async e => {
      e.preventDefault();
      if (!annForm.reportValidity()) return;
      const button = annForm.querySelector('[type=submit]');
      button.classList.add('is-loading');
      error.hidden = true;
      try {
        const response = await fetch('/api/admin/announcements', {
          method: 'POST',
          body: new FormData(annForm),
          headers: { 'X-Requested-With': 'XMLHttpRequest' }
        });
        const result = await response.json();
        if (!response.ok || !result.success) {
          throw new Error(result.message || 'Could not publish the announcement.');
        }
        window.location.reload();
      } catch (err) {
        error.textContent = err.message || 'Could not publish the announcement.';
        error.hidden = false;
        button.classList.remove('is-loading');
      }
    });
  }
  document.querySelectorAll('form[data-announcement-delete]').forEach(form => {
    form.addEventListener('submit', async event => {
      event.preventDefault();
      const item = form.closest('.ann-item');
      if (!confirm('Delete this announcement?')) return;
      try {
        const response = await fetch(form.action, {
          method: 'DELETE',
          headers: { 'X-Requested-With': 'XMLHttpRequest' }
        });
        const result = await response.json();
        if (!response.ok || !result.success) {
          throw new Error(result.message || 'Could not delete the announcement.');
        }
        item.remove();
      } catch (err) {
        window.alert(err.message || 'Could not delete the announcement.');
      }
    });
  });
})();
