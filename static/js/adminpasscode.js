document.addEventListener('DOMContentLoaded', () => {
    const passcodeInput = document.getElementById('admin-passcode');
    const continueButton = document.querySelector('.continue-button');

    if (!passcodeInput || !continueButton) return;

    const validatePasscode = () => {
        const value = passcodeInput.value.trim();

        if (!value) {
            passcodeInput.setCustomValidity('Please enter your admin passcode.');
            return false;
        }

        passcodeInput.setCustomValidity('');
        return true;
    };

    passcodeInput.addEventListener('input', () => {
        passcodeInput.setCustomValidity('');
    });

    continueButton.addEventListener('click', () => {
        if (!validatePasscode()) {
            passcodeInput.reportValidity();
            return;
        }

        window.location.href = '/admin-login';
    });
});
