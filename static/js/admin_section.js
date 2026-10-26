(() => {
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

  const transactionSearch = document.getElementById('transaction-search');
  transactionSearch?.addEventListener('input', () => {
    let visible = 0;
    document.querySelectorAll('[data-transaction-row]').forEach(row => {
      row.hidden = !row.textContent.toLowerCase().includes(transactionSearch.value.trim().toLowerCase());
      if (!row.hidden) visible++;
    });
    document.getElementById('transactions-empty').hidden = visible > 0;
  });

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
