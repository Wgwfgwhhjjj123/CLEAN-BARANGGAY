document.addEventListener('DOMContentLoaded', () => {
    const loginForm = document.querySelector('form');
    const emailInput = document.getElementById('email');
    const passwordInput = document.getElementById('password');

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
