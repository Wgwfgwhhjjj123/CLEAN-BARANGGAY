(() => {
  const root = document.documentElement;
  const themeButtons = [
    document.getElementById('theme-toggle'),
    document.getElementById('theme-toggle-setting')
  ].filter(Boolean);

  function applyTheme(theme) {
    const dark = theme === 'dark';
    root.dataset.theme = dark ? 'dark' : 'light';
    themeButtons.forEach(button => {
      button.setAttribute('aria-pressed', String(dark));
      if (button.id === 'theme-toggle-setting') {
        button.textContent = dark ? 'Use light mode' : 'Use dark mode';
      } else {
        button.textContent = dark ? '☀️' : '🌙';
        button.setAttribute('aria-label', dark ? 'Switch to light mode' : 'Switch to dark mode');
      }
    });
  }

  applyTheme(root.dataset.theme || 'light');
  themeButtons.forEach(button => button.addEventListener('click', () => {
    const theme = root.dataset.theme === 'dark' ? 'light' : 'dark';
    try {
      localStorage.setItem('theme', theme);
    } catch (error) {
      console.warn('Unable to save theme preference:', error);
    }
    applyTheme(theme);
  }));

  const sidebar = document.getElementById('sidebar');
  const scrim = document.getElementById('scrim');
  const menu = document.getElementById('menu-btn');
  if (sidebar && scrim && menu) {
    const setSidebarOpen = open => {
      sidebar.classList.toggle('open', open);
      scrim.classList.toggle('show', open);
      menu.setAttribute('aria-expanded', String(open));
    };
    menu.addEventListener('click', () => {
      setSidebarOpen(!sidebar.classList.contains('open'));
    });
    scrim.addEventListener('click', () => setSidebarOpen(false));
    sidebar.querySelectorAll('nav a').forEach(link => {
      link.addEventListener('click', () => setSidebarOpen(false));
    });
    document.addEventListener('keydown', event => {
      if (event.key === 'Escape') setSidebarOpen(false);
    });
  }

  const search = document.getElementById('member-search');
  if (search) {
    const rows = [...document.querySelectorAll('[data-member-row]')];
    const empty = document.getElementById('members-empty');
    search.addEventListener('input', () => {
      const query = search.value.trim().toLocaleLowerCase();
      let visible = 0;
      rows.forEach(row => {
        const matches = row.textContent.toLocaleLowerCase().includes(query);
        row.hidden = !matches;
        if (matches) visible++;
      });
      empty.hidden = visible > 0 || rows.length === 0;
    });
  }
})();
