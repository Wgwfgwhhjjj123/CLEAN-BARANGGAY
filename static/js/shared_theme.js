"use strict";

document.addEventListener("DOMContentLoaded", () => {
    const themeToggle = document.getElementById("site-theme-toggle");
    const themeStorageKey = "basureport-theme";

    function applyTheme(theme) {
        const isDark = theme === "dark";
        document.body.classList.toggle("dark-mode", isDark);

        if (!themeToggle) {
            return;
        }

        const icon = themeToggle.querySelector(".site-theme-icon");
        const label = themeToggle.querySelector(".site-theme-label");
        if (icon) {
            icon.textContent = isDark ? "☀" : "☾";
        }
        if (label) {
            label.textContent = isDark ? "Light mode" : "Dark mode";
        }
        themeToggle.setAttribute(
            "aria-label",
            isDark ? "Switch to light mode" : "Switch to dark mode"
        );
        themeToggle.setAttribute("aria-pressed", String(isDark));
    }

    let savedTheme = "light";
    try {
        savedTheme = localStorage.getItem(themeStorageKey) || "light";
    } catch (error) {
        console.warn("Unable to read saved theme:", error);
    }
    applyTheme(savedTheme);

    if (themeToggle) {
        themeToggle.addEventListener("click", () => {
            const nextTheme = document.body.classList.contains("dark-mode")
                ? "light"
                : "dark";
            applyTheme(nextTheme);
            try {
                localStorage.setItem(themeStorageKey, nextTheme);
            } catch (error) {
                console.warn("Unable to save theme:", error);
            }
        });
    }

    window.addEventListener("storage", event => {
        if (event.key === themeStorageKey && event.newValue) {
            applyTheme(event.newValue);
        }
    });
});
