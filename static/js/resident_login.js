document.addEventListener('DOMContentLoaded', () => {
    const loginForm = document.querySelector('form');
    const emailInput = document.getElementById('email');
    const passwordInput = document.getElementById('password');

    // Eye button: show / hide the password.
    // The final state is set after any other click handler has run, so the button
    // always flips exactly once, even if another script also listens to it.
    document.addEventListener('click', (event) => {
        const button = event.target.closest('[data-password-toggle]');
        if (!button) return;
        const input = document.getElementById(button.getAttribute('aria-controls'));
        if (!input) return;

        const show = input.type === 'password';
        window.setTimeout(() => {
            input.type = show ? 'text' : 'password';
            button.setAttribute('aria-pressed', String(show));
            button.setAttribute('aria-label', show ? 'Hide password' : 'Show password');
        }, 0);
    }, true);

    if (!loginForm || !emailInput || !passwordInput) return;

    loginForm.addEventListener('submit', (event) => {
        const email = emailInput.value.trim();
        const password = passwordInput.value.trim();

        if (!email || !password) {
            event.preventDefault();
            alert('Please enter both email and password.');
        }
    });
});
