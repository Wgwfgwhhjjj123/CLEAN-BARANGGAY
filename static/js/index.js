
document.addEventListener("DOMContentLoaded", function () {
    const loadingScreen = document.getElementById("loading-screen");
    const navLinks = document.querySelectorAll(".nav-link");

    const sections = {
        home: document.getElementById("home"),
        about: document.getElementById("about")
    };

    const minimumLoadingTime = 2000;
    const loadingStartedAt = performance.now();
    let loadingFinished = false;
    let loadingHideTimer = null;

    /* =====================================
       LOADING SCREEN
    ===================================== */

    function hideLoadingScreen() {
        if (loadingFinished || loadingHideTimer !== null) return;

        const remainingTime = Math.max(
            0,
            minimumLoadingTime - (performance.now() - loadingStartedAt)
        );

        loadingHideTimer = setTimeout(function () {
            loadingFinished = true;
            if (loadingScreen) {
                loadingScreen.classList.add("hide");
            }

            document.body.classList.remove("loading");
        }, remainingTime);
    }

    window.addEventListener("load", hideLoadingScreen);
    setTimeout(hideLoadingScreen, minimumLoadingTime);

    /* =====================================
       NAVIGATION
    ===================================== */

    function navigateToSection(link, event) {
        const targetId = link.getAttribute("href");

        if (!targetId || !targetId.startsWith("#")) {
            return;
        }

        const target = document.querySelector(targetId);

        if (!target) return;

        event.preventDefault();

        navLinks.forEach(function (navLink) {
            navLink.classList.remove("active");
        });

        if (link.classList.contains("nav-link")) {
            link.classList.add("active");
        } else {
            navLinks.forEach(function (navLink) {
                if (navLink.getAttribute("href") === targetId) {
                    navLink.classList.add("active");
                }
            });
        }

        target.scrollIntoView({
            behavior: "smooth",
            block: "start"
        });

        history.replaceState(null, "", targetId);
    }

    document.querySelectorAll(
        '.nav-link, .text-link, .section-link, .logo[href="#home"]'
    ).forEach(function (link) {
        link.addEventListener("click", function (event) {
            navigateToSection(this, event);
        });
    });

    /* =====================================
       ACTIVE SECTION OBSERVER
    ===================================== */

    if ("IntersectionObserver" in window) {
        const sectionObserver = new IntersectionObserver(
            function (entries) {
                entries.forEach(function (entry) {
                    if (entry.isIntersecting) {
                        navLinks.forEach(function (link) {
                            link.classList.toggle(
                                "active",
                                link.getAttribute("href") ===
                                    "#" + entry.target.id
                            );
                        });
                    }
                });
            },
            {
                threshold: 0.35
            }
        );

        Object.values(sections).forEach(function (section) {
            if (section) {
                sectionObserver.observe(section);
            }
        });
    }

    /* =====================================
       REVEAL ANIMATIONS
    ===================================== */

    const revealElements = document.querySelectorAll(
        ".reveal, .about-content"
    );

    if ("IntersectionObserver" in window) {
        const revealObserver = new IntersectionObserver(
            function (entries, observer) {
                entries.forEach(function (entry) {
                    if (entry.isIntersecting) {
                        entry.target.classList.add("visible");
                        observer.unobserve(entry.target);
                    }
                });
            },
            {
                threshold: 0.12
            }
        );

        revealElements.forEach(function (element) {
            revealObserver.observe(element);
        });
    } else {
        revealElements.forEach(function (element) {
            element.classList.add("visible");
        });
    }

    /* =====================================
       LOGIN / PAGE TRANSITION
    ===================================== */

    document.querySelectorAll(
        ".login-btn, .page-transition"
    ).forEach(function (link) {
        link.addEventListener("click", function (event) {
            if (
                event.ctrlKey ||
                event.metaKey ||
                event.shiftKey ||
                event.altKey ||
                event.button !== 0
            ) {
                return;
            }

            const destination = this.getAttribute("href");

            if (!destination || destination.startsWith("#")) {
                return;
            }

            event.preventDefault();

            document.body.classList.add("fade-out");

            setTimeout(function () {
                window.location.href = destination;
            }, 350);
        });
    });

    /* =====================================
       DARK MODE / LIGHT MODE
    ===================================== */

    const themeToggle = document.getElementById("theme-toggle");
    const storageKey = "basureport-theme";

    function applyTheme(theme) {
        const isDark = theme === "dark";

        document.body.classList.toggle("dark-mode", isDark);

        if (themeToggle) {
            themeToggle.textContent = isDark
                ? "☀️ Light Mode"
                : "🌙 Dark Mode";

            themeToggle.setAttribute(
                "aria-label",
                isDark
                    ? "Switch to light mode"
                    : "Switch to dark mode"
            );

            themeToggle.setAttribute(
                "aria-pressed",
                String(isDark)
            );
        }
    }

    let savedTheme = "light";

    try {
        savedTheme = localStorage.getItem(storageKey) || "light";
    } catch (error) {
        // Default theme kung hindi available ang localStorage.
    }

    applyTheme(savedTheme);

    if (themeToggle) {
        themeToggle.addEventListener("click", function () {
            const newTheme = document.body.classList.contains("dark-mode")
                ? "light"
                : "dark";

            applyTheme(newTheme);

            try {
                localStorage.setItem(storageKey, newTheme);
            } catch (error) {
                // Gumagana pa rin ang toggle sa kasalukuyang page.
            }
        });
    }

    window.addEventListener("storage", function (event) {
        if (event.key === storageKey && event.newValue) {
            applyTheme(event.newValue);
        }
    });
});
