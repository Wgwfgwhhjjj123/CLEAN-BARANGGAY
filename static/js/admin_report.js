(() => {
  const message = document.getElementById('report-message');

  async function submitAction(form, submitter) {
    const button = submitter || form.querySelector('[type="submit"]');

    // Build the form data BEFORE disabling the button.
    // A disabled button is left out of FormData, which dropped "decision".
    const data = new FormData(form);
    if (button && button.name && !data.has(button.name)) {
      data.append(button.name, button.value);
    }

    button.disabled = true;
    message.hidden = true;

    try {
      const response = await fetch(form.action, {
        method: 'POST',
        body: data,
        headers: { 'X-Requested-With': 'XMLHttpRequest' }
      });
      const result = await response.json();
      if (!response.ok || !result.success) {
        throw new Error(result.message || 'Could not update this report.');
      }
      window.location.reload();
    } catch (error) {
      message.textContent = error.message || 'Could not update this report.';
      message.hidden = false;
      button.disabled = false;
    }
  }

  document.querySelectorAll('[data-decision-form], [data-report-action]').forEach(form => {
    form.addEventListener('submit', event => {
      event.preventDefault();
      submitAction(form, event.submitter);
    });
  });
})();
