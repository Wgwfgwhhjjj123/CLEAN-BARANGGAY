document.addEventListener('DOMContentLoaded', () => {
    const loginForm = document.querySelector('form');
    const usernameInput = document.getElementById('username');
    const passwordInput = document.getElementById('password');
    const loginLoader = document.getElementById('adminLoginLoader');
    const loadingStartedAt = performance.now();
    let loaderHidden = false;

    function hideLoginLoader() {
        if (loaderHidden || !loginLoader) return;
        loaderHidden = true;

        const delay = Math.max(0, 850 - (performance.now() - loadingStartedAt));
        window.setTimeout(() => {
            loginLoader.classList.add('is-hidden');
        }, delay);
    }

    window.addEventListener('load', hideLoginLoader, { once: true });
    window.setTimeout(hideLoginLoader, 1200);

    if (!loginForm || !usernameInput || !passwordInput) return;

    loginForm.addEventListener('submit', event => {
        const username = usernameInput.value.trim();
        const password = passwordInput.value.trim();

        if (!username || !password) {
            event.preventDefault();
            alert('Please enter both username and password.');
            return;
        }

        const submitButton = loginForm.querySelector('button[type="submit"]');
        if (submitButton) {
            submitButton.disabled = true;
            submitButton.textContent = 'Signing in...';
        }
        document.body.classList.add('admin-login-submitting');
        if (loginLoader) {
            const progress = loginLoader.querySelector('.admin-loader-progress span');
            loginLoader.classList.remove('is-hidden');
            if (progress) {
                progress.style.animation = 'none';
                void progress.offsetWidth;
                progress.style.animation = '';
            }
        }
    });
});
