
document.addEventListener("DOMContentLoaded", function () {
    const form = document.querySelector("form");
    const emailInput = document.getElementById("email");
    const submitButton = document.querySelector(".forgot-btn");

    if (!form || !emailInput || !submitButton) {
        return;
    }

    form.addEventListener("submit", function (event) {
        const email = emailInput.value.trim();

        if (!email) {
            event.preventDefault();
            alert("Please enter your registered email address.");
            emailInput.focus();
            return;
        }

        if (!emailInput.checkValidity()) {
            event.preventDefault();
            alert("Please enter a valid email address.");
            emailInput.focus();
            return;
        }

        submitButton.disabled = true;
        submitButton.setAttribute("aria-busy", "true");
        submitButton.textContent = "Sending reset code...";
    });
});
