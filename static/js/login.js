document.addEventListener('DOMContentLoaded', () => {
    const roleCards = document.querySelectorAll('.role-card');

    roleCards.forEach((card) => {
        card.addEventListener('click', (event) => {
            const isModifiedClick =
                event.metaKey ||
                event.ctrlKey ||
                event.shiftKey ||
                event.altKey ||
                event.button !== 0;

            if (isModifiedClick) {
                return;
            }
        });
    });

    // =====================================
    // ADMIN LOADING SCREEN IN A NEW TAB
    // =====================================

    const adminLink = document.getElementById('adminLink');

    if (adminLink) {
        adminLink.addEventListener('click', (event) => {
            const isModifiedClick =
                event.metaKey ||
                event.ctrlKey ||
                event.shiftKey ||
                event.altKey ||
                event.button !== 0;

            if (isModifiedClick) {
                return;
            }

            event.preventDefault();

            const adminUrl = adminLink.href;

            // Open a new tab immediately to avoid popup blocking
            const newTab = window.open('about:blank', '_blank');

            if (!newTab) {
                alert('Please allow pop-ups for BasuReport to open Admin Login.');
                return;
            }

            // Display loading screen in the new tab
            newTab.document.open();

            newTab.document.write(`
                <!DOCTYPE html>
                <html lang="en">
                <head>
                    <meta charset="UTF-8">
                    <meta name="viewport"
                          content="width=device-width, initial-scale=1.0">
                    <title>Loading Admin | BasuReport</title>

                    <style>
                        * {
                            box-sizing: border-box;
                        }

                        body {
                            margin: 0;
                            min-height: 100vh;
                            display: flex;
                            align-items: center;
                            justify-content: center;
                            background: linear-gradient(
                                135deg,
                                #e8f8ed,
                                #f7fff9
                            );
                            font-family: Arial, sans-serif;
                            color: #185c35;
                        }

                        .admin-loading-content {
                            text-align: center;
                            padding: 30px;
                            animation: adminFadeIn 0.6s ease;
                        }

                        .admin-loading-icon {
                            font-size: 58px;
                            display: inline-block;
                            animation: adminSpin 2s linear infinite;
                        }

                        .admin-loading-title {
                            margin: 20px 0 8px;
                            font-size: 25px;
                            font-weight: bold;
                        }

                        .admin-loading-text {
                            color: #64816d;
                            font-size: 14px;
                        }

                        .admin-loading-bar {
                            width: 220px;
                            max-width: 80vw;
                            height: 6px;
                            background: #d3e9d9;
                            border-radius: 20px;
                            overflow: hidden;
                            margin: 25px auto 0;
                        }

                        .admin-loading-progress {
                            width: 40%;
                            height: 100%;
                            background: #269b52;
                            border-radius: 20px;
                            animation: adminProgress 1.2s ease-in-out infinite;
                        }

                        @keyframes adminSpin {
                            from {
                                transform: rotate(0deg);
                            }

                            to {
                                transform: rotate(360deg);
                            }
                        }

                        @keyframes adminFadeIn {
                            from {
                                opacity: 0;
                                transform: translateY(15px);
                            }

                            to {
                                opacity: 1;
                                transform: translateY(0);
                            }
                        }

                        @keyframes adminProgress {
                            0% {
                                transform: translateX(-110%);
                            }

                            100% {
                                transform: translateX(350%);
                            }
                        }

                        @media (prefers-reduced-motion: reduce) {
                            .admin-loading-icon,
                            .admin-loading-content,
                            .admin-loading-progress {
                                animation: none;
                            }
                        }
                    </style>
                </head>

                <body>
                    <div class="admin-loading-content">
                        <div class="admin-loading-icon">♻️</div>

                        <h2 class="admin-loading-title">
                            Preparing Admin Login...
                        </h2>

                        <p class="admin-loading-text">
                            Please wait while BasuReport loads.
                        </p>

                        <div class="admin-loading-bar">
                            <div class="admin-loading-progress"></div>
                        </div>
                    </div>
                </body>
                </html>
            `);

            newTab.document.close();

            // Navigate to the actual Admin Login page
            setTimeout(() => {
                if (!newTab.closed) {
                    newTab.location.href = adminUrl;
                }
            }, 1600);
        });
    }
});