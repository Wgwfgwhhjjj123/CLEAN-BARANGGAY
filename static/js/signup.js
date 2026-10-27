document.addEventListener('DOMContentLoaded', function () {
    const signupForm = document.querySelector('.signup-card form');
    const passwordInput = document.getElementById('password');
    const confirmInput = document.getElementById('confirm_password');
    const strengthContainer = document.getElementById('password-strength');
    const strengthFill = strengthContainer
        ? strengthContainer.querySelector('.strength-fill')
        : null;
    const strengthLabel = strengthContainer
        ? strengthContainer.querySelector('.strength-label')
        : null;
    const requirementItems = document.querySelectorAll(
        '.password-requirements [data-rule]'
    );

    function getPasswordRules(password) {
        return {
            length: password.length >= 8,
            lowercase: /[a-z]/.test(password),
            uppercase: /[A-Z]/.test(password),
            number: /[0-9]/.test(password),
            symbol: /[^A-Za-z0-9]/.test(password)
        };
    }

    function updatePasswordStrength() {
        if (!passwordInput || !strengthContainer) return;

        const password = passwordInput.value;
        const rules = getPasswordRules(password);
        let passed = 0;

        requirementItems.forEach(function (item) {
            const isMet = Boolean(rules[item.dataset.rule]);
            item.classList.toggle('met', isMet);
            item.setAttribute('aria-label', item.textContent.trim() + (isMet ? ', met' : ', not met'));
            if (isMet) passed++;
        });

        strengthContainer.dataset.strength = password
            ? passed === 5
                ? 'strong'
                : passed >= 3
                    ? 'medium'
                    : 'weak'
            : 'empty';

        if (strengthLabel) {
            const labels = {
                empty: 'Password strength: not entered',
                weak: 'Password strength: weak',
                medium: 'Password strength: getting stronger',
                strong: 'Password strength: strong'
            };
            strengthLabel.textContent = labels[strengthContainer.dataset.strength];
        }

        if (strengthFill) {
            strengthFill.style.width = password ? (passed * 20) + '%' : '0%';
        }
    }

    if (passwordInput) {
        passwordInput.addEventListener('input', updatePasswordStrength);
        updatePasswordStrength();
    }

    if (confirmInput && passwordInput) {
        confirmInput.addEventListener('input', function () {
            confirmInput.setCustomValidity(
                confirmInput.value && confirmInput.value !== passwordInput.value
                    ? 'Passwords do not match.'
                    : ''
            );
        });
        passwordInput.addEventListener('input', function () {
            if (confirmInput.value) {
                confirmInput.setCustomValidity(
                    confirmInput.value !== passwordInput.value
                        ? 'Passwords do not match.'
                        : ''
                );
            }
        });
    }

    if (signupForm && passwordInput) {
        signupForm.addEventListener('submit', function (event) {
            const rules = getPasswordRules(passwordInput.value);
            const isStrong = Object.values(rules).every(Boolean);

            if (!isStrong) {
                event.preventDefault();
                passwordInput.setCustomValidity(
                    'Use at least 8 characters with lowercase and uppercase letters, a number, and a symbol.'
                );
                passwordInput.reportValidity();
                passwordInput.addEventListener('input', function clearPasswordError() {
                    passwordInput.setCustomValidity('');
                    passwordInput.removeEventListener('input', clearPasswordError);
                }, { once: true });
                return;
            }

            passwordInput.setCustomValidity('');
            if (confirmInput && confirmInput.value !== passwordInput.value) {
                event.preventDefault();
                confirmInput.setCustomValidity('Passwords do not match.');
                confirmInput.reportValidity();
            }
        });
    }

    document.querySelectorAll('a[href]').forEach(function (link) {
        link.addEventListener('click', function (event) {
            const destination = this.href;

            if (
                this.hostname === window.location.hostname &&
                !this.hasAttribute('target')
            ) {
                event.preventDefault();

                document.body.classList.add('fade-out');

                setTimeout(function () {
                    window.location.href = destination;
                }, 400);
            }
        });
    });
});
