(() => {
  let theme;
  try {
    theme = localStorage.getItem('theme') || localStorage.getItem('basureport-theme') || localStorage.getItem('basureport-resident-theme');
  } catch (_) { /* System preference works when storage is unavailable. */ }
  document.documentElement.dataset.theme = ['dark', 'light'].includes(theme)
    ? theme : (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
})();
