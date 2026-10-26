(() => {
  /* Theme (so login / report pages follow the saved choice) is applied by the inline <head> script. */

  /* Show / hide password — works for any .password-field */
  document.querySelectorAll('.password-field').forEach(wrap => {
    const input = wrap.querySelector('input');
    const btn = wrap.querySelector('button');
    btn?.addEventListener('click', () => {
      const show = input.type === 'password';
      input.type = show ? 'text' : 'password';
      btn.textContent = show ? 'Hide' : 'Show';
      btn.setAttribute('aria-pressed', show);
      btn.setAttribute('aria-label', show ? 'Hide password' : 'Show password');
      input.focus();
    });
  });

  /* Loading state on submit (prevents double-submit) */
  document.querySelectorAll('form[data-loading-form]').forEach(form => {
    form.addEventListener('submit', () => {
      if (!form.checkValidity()) return;
      const b = form.querySelector('[type=submit]');
      if (b) setTimeout(() => b.classList.add('is-loading'), 0);
    });
  });

  /* Image preview before upload */
  document.querySelectorAll('input[type=file][data-preview]').forEach(inp => {
    const img = document.querySelector(inp.dataset.preview);
    inp.addEventListener('change', () => {
      const f = inp.files[0];
      if (!f || !img) return;
      if (f.size > 5 * 1024 * 1024) { alert('Photo is too large. Please choose one under 5 MB.'); inp.value = ''; img.classList.remove('show'); return; }
      img.src = URL.createObjectURL(f);
      img.classList.add('show');
    });
  });
})();
