'use strict';
document.addEventListener('DOMContentLoaded', () => {
  const root = document.documentElement;
  const buttons = [...document.querySelectorAll('#theme-toggle, #site-theme-toggle, #theme-toggle-setting')];
  function applyTheme(theme) {
    const dark = theme === 'dark';
    root.dataset.theme = dark ? 'dark' : 'light';
    document.body.classList.toggle('dark-mode', dark);
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content', dark ? '#151d19' : '#2e9e5b');
    buttons.forEach(button => {
      const icon = button.querySelector('.action-icon, .site-theme-icon');
      const label = button.querySelector('.theme-label, .site-theme-label');
      if (icon) icon.textContent = dark ? '☀' : '☾';
      if (label) label.textContent = dark ? 'Light mode' : 'Dark mode';
      if (!icon && !label) button.textContent = button.id === 'theme-toggle-setting'
        ? (dark ? 'Use light mode' : 'Use dark mode') : (dark ? '☀' : '☾');
      button.setAttribute('aria-label', dark ? 'Switch to light mode' : 'Switch to dark mode');
      button.setAttribute('aria-pressed', String(dark));
    });
  }
  applyTheme(root.dataset.theme);
  buttons.forEach(button => button.addEventListener('click', () => {
    const theme = root.dataset.theme === 'dark' ? 'light' : 'dark';
    applyTheme(theme);
    try { localStorage.setItem('theme', theme); } catch (_) { /* Session only. */ }
  }));
  window.addEventListener('storage', event => {
    if (event.key === 'theme') applyTheme(event.newValue || (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'));
  });

  document.querySelectorAll('[data-password-toggle]').forEach(button => {
    const input = document.getElementById(button.getAttribute('aria-controls'));
    if (!input) return;

    button.addEventListener('click', () => {
      const show = input.type === 'password';
      input.type = show ? 'text' : 'password';
      button.setAttribute('aria-pressed', String(show));
      button.setAttribute('aria-label', show ? 'Hide password' : 'Show password');
    });
  });

  document.querySelectorAll('input[type="password"]').forEach(input => {
    // Explicit eye toggles and older password-field controls own their toggles.
    if (document.querySelector(`[data-password-toggle][aria-controls="${input.id}"]`) || input.closest('.password-field')) return;
    const wrap = document.createElement('div');
    wrap.className = 'password-reveal';
    input.before(wrap);
    wrap.append(input);
    const button = document.createElement('button');
    button.type = 'button';
    button.textContent = 'Show';
    button.setAttribute('aria-label', 'Show password');
    button.setAttribute('aria-controls', input.id);
    button.setAttribute('aria-pressed', 'false');
    wrap.append(button);
    button.addEventListener('click', () => {
      const show = input.type === 'password';
      input.type = show ? 'text' : 'password';
      button.textContent = show ? 'Hide' : 'Show';
      button.setAttribute('aria-label', show ? 'Hide password' : 'Show password');
      button.setAttribute('aria-pressed', String(show));
    });
  });

  document.querySelectorAll('[data-image-preview]').forEach(input => {
    const img = document.createElement('img');
    img.className = 'cleanup-upload-preview';
    img.alt = 'Preview of the after-cleaning photo';
    img.hidden = true;
    input.after(img);
    let previewUrl;
    input.addEventListener('change', () => {
      if (previewUrl) URL.revokeObjectURL(previewUrl);
      img.hidden = true;
      input.setCustomValidity('');
      const file = input.files[0];
      if (!file) return;
      if (file.size > 4.5 * 1024 * 1024) {
        input.setCustomValidity('Choose a photo smaller than 4.5 MB.');
        input.reportValidity();
        return;
      }
      previewUrl = URL.createObjectURL(file);
      img.src = previewUrl;
      img.hidden = false;
    });
  });

  document.querySelectorAll('[data-feedback-form]').forEach(form => {
    form.addEventListener('submit', async event => {
      event.preventDefault();
      const button = form.querySelector('[type="submit"]');
      const message = form.querySelector('[data-feedback-message]');
      button.disabled = true;
      message.textContent = 'Sending feedback…';
      try {
        const response = await fetch(form.action, { method: 'POST', body: new FormData(form) });
        const data = await response.json();
        if (!response.ok || !data.success) throw new Error(data.message || 'Could not send feedback.');
        location.reload();
      } catch (error) {
        message.textContent = error.message || 'Connection lost. Please try again.';
        button.disabled = false;
      }
    });
  });
});
