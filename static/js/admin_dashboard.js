"use strict";

const reportsGrid = document.getElementById("reportsGrid");
const statusFilter = document.getElementById("statusFilter");
const urgentFilter = document.getElementById("urgentFilter");
const sortFilter = document.getElementById("sortFilter");
const resetFilters = document.getElementById("resetFilters");
const reportCountLabel = document.getElementById("reportCountLabel");
const filterSummary = document.getElementById("filterSummary");
const urgentList = document.getElementById("urgentList");

const notificationBell = document.getElementById("notificationBell");
const notificationPanel = document.getElementById("notificationPanel");
const notificationList = document.getElementById("notificationList");
const notificationBadge = document.getElementById("notificationBadge");
const markAllReadBtn = document.getElementById("markAllReadBtn");
const deleteAllNotificationsBtn = document.getElementById("deleteAllNotificationsBtn");
const notificationFeedback = document.getElementById("notificationFeedback");
const themeToggle = document.getElementById("themeToggle");
const announcementForm = document.getElementById("announcementForm");
const announcementHistory = document.getElementById("announcementHistory");
const membersList = document.getElementById("membersList");
const memberPresenceToggle = document.getElementById("memberPresenceToggle");
const memberPresenceSummary = document.getElementById("memberPresenceSummary");
const memberPresencePanel = document.querySelector(".sidebar-members");

const photoModal = document.getElementById("photoModal");
const modalPhoto = document.getElementById("modalPhoto");
const closePhotoModal = document.getElementById("closePhotoModal");
const actionMessage = document.getElementById("actionMessage");
let welcomeToast = document.querySelector(".welcome-toast");

let notificationData = [];
let notificationPanelOpen = false;
let dashboardRequestRunning = false;
let dashboardRefreshPending = false;
let notificationRequestRunning = false;
let latestReports = [];
let isStartingReport = false;
let messageTimeout = null;
let welcomeToastTimeout = null;

function showAdminToast(message, type = "success", label = "ACTION COMPLETE") {
    if (!welcomeToast) {
        welcomeToast = document.createElement("div");
        welcomeToast.className = "flash-message welcome-toast";
        welcomeToast.setAttribute("role", "status");
        welcomeToast.setAttribute("aria-live", "polite");
        welcomeToast.innerHTML = [
            '<span class="welcome-toast-icon" aria-hidden="true"></span>',
            '<span class="welcome-toast-content">',
            '<span class="welcome-toast-label"></span>',
            '<span class="welcome-toast-message"></span></span>',
            '<button type="button" class="welcome-toast-close"',
            ' aria-label="Dismiss notification">×</button>',
            '<span class="welcome-toast-progress" aria-hidden="true"></span>'
        ].join("");
        welcomeToast.querySelector(".welcome-toast-close")
            .addEventListener("click", dismissWelcomeToast);
        document.body.appendChild(welcomeToast);
    }

    welcomeToast.querySelector(".welcome-toast-icon").textContent =
        type === "error" ? "!" : "✓";
    welcomeToast.querySelector(".welcome-toast-label").textContent = label;
    welcomeToast.querySelector(".welcome-toast-message").textContent = message;
    welcomeToast.classList.toggle("is-error", type === "error");
    welcomeToast.setAttribute("aria-live", type === "error" ? "assertive" : "polite");
    welcomeToast.classList.remove("is-hiding", "is-visible");
    void welcomeToast.offsetWidth;
    welcomeToast.classList.add("is-visible");
    if (welcomeToastTimeout) window.clearTimeout(welcomeToastTimeout);
    welcomeToastTimeout = window.setTimeout(dismissWelcomeToast, 5000);
}

function dismissWelcomeToast() {
    if (!welcomeToast) return;

    const toast = welcomeToast;
    toast.classList.add("is-hiding");
    toast.classList.remove("is-visible");
    window.setTimeout(() => {
        if (toast.classList.contains("is-hiding")) {
            toast.remove();
            if (welcomeToast === toast) welcomeToast = null;
        }
    }, 400);
}

if (welcomeToast) {
    welcomeToast.querySelector(".welcome-toast-close")
        .addEventListener("click", dismissWelcomeToast);
    welcomeToast.classList.remove("is-visible");
    void welcomeToast.offsetWidth;
    welcomeToast.classList.add("is-visible");
    welcomeToastTimeout = window.setTimeout(dismissWelcomeToast, 5000);
}

const FILTER_STORAGE_KEY = "basuReportAdminFilters";
const ORDER_STORAGE_KEY = "basuReportAdminOrder";

function readStoredJSON(key, fallback) {
    try {
        const value = sessionStorage.getItem(key);
        return value ? JSON.parse(value) : fallback;
    } catch {
        return fallback;
    }
}

function saveFilters() {
    try {
        sessionStorage.setItem(FILTER_STORAGE_KEY, JSON.stringify({
            status: statusFilter.value,
            urgency: urgentFilter.value,
            sort: sortFilter.value
        }));
    } catch (error) {
        console.warn("Unable to save filters:", error);
    }
}

function restoreFilters() {
    const saved = readStoredJSON(FILTER_STORAGE_KEY, null);
    if (!saved) return;

    if (["all", "Pending", "Accepted", "In Progress", "Completed", "Rejected"].includes(saved.status)) {
        statusFilter.value = saved.status;
    }

    if (["all", "urgent", "normal"].includes(saved.urgency)) {
        urgentFilter.value = saved.urgency;
    }

    if (["default", "id-desc", "id-asc", "urgent-first"].includes(saved.sort)) {
        sortFilter.value = saved.sort;
    }
}

const reportOrder = new Map();
let nextReportOrder = 0;

function initializeOrder() {
    const savedOrder = readStoredJSON(ORDER_STORAGE_KEY, []);

    if (Array.isArray(savedOrder)) {
        savedOrder.forEach(id => {
            const key = String(id);
            if (!reportOrder.has(key)) {
                reportOrder.set(key, nextReportOrder++);
            }
        });
    }

    document.querySelectorAll("#reportsGrid .report-card").forEach(card => {
        const id = String(card.dataset.reportId);
        if (!reportOrder.has(id)) {
            reportOrder.set(id, nextReportOrder++);
        }
    });

    saveOrder();
}

function saveOrder() {
    try {
        sessionStorage.setItem(
            ORDER_STORAGE_KEY,
            JSON.stringify(Array.from(reportOrder.keys()))
        );
    } catch (error) {
        console.warn("Unable to save report order:", error);
    }
}

function registerReports(reports) {
    reports.forEach(report => {
        const id = String(report.id);
        if (!reportOrder.has(id)) {
            reportOrder.set(id, nextReportOrder++);
        }
    });

    saveOrder();
}

function escapeHTML(value) {
    const entities = {
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#39;"
    };

    return String(value ?? "").replace(/[&<>"']/g, ch => entities[ch]);
}

function getPhotoURL(filename) {
    return filename
        ? "/uploads/" + encodeURIComponent(String(filename))
        : "";
}

function formatNotificationTime(dateString) {
    if (!dateString) return "";

    const date = new Date(String(dateString).replace(" ", "T"));

    return Number.isNaN(date.getTime())
        ? String(dateString)
        : date.toLocaleString();
}

function getNotificationIcon(type) {
    return {
        new_report: "🆕",
        urgent: "🚨",
        accepted: "✓",
        rejected: "✕",
        in_progress: "🧹",
        completed: "✅"
    }[type] || "🔔";
}

function showActionMessage(message, type = "success") {
    if (messageTimeout) {
        clearTimeout(messageTimeout);
    }

    actionMessage.textContent = message;
    actionMessage.className = `action-message show ${type}`;

    messageTimeout = setTimeout(() => {
        actionMessage.className = "action-message";
        actionMessage.textContent = "";
    }, 4500);
    showAdminToast(message, type);
}

function updateNotificationBadge(unreadCount) {
    const count = Math.max(0, Number(unreadCount) || 0);

    notificationBadge.style.display = count > 0 ? "flex" : "none";
    notificationBadge.textContent = count > 99 ? "99+" : String(count);
}

function renderNotifications(items) {
    if (!Array.isArray(items) || items.length === 0) {
        notificationList.innerHTML =
            '<div class="notification-empty">🔔 No notifications yet.<br><br>New garbage reports will appear here.</div>';
        return;
    }

    notificationList.innerHTML = items.map(n => `
        <div class="notification-item ${n.is_read ? "" : "unread"}"
             data-notification-id="${escapeHTML(n.id)}">
            <div class="notification-icon ${escapeHTML(n.type)}">${getNotificationIcon(n.type)}</div>
            <div class="notification-content">
                <h4>${escapeHTML(n.title)}</h4>
                <p>${escapeHTML(n.message)}</p>
                <span class="notification-time">${escapeHTML(formatNotificationTime(n.created_at))}</span>
                <div class="notification-item-actions">
                    ${n.is_read ? "" : `<button type="button" data-notification-action="read" data-notification-id="${escapeHTML(n.id)}">Mark as read</button>`}
                    <button type="button" class="delete-notification-btn" data-notification-action="delete" data-notification-id="${escapeHTML(n.id)}">Delete</button>
                </div>
            </div>
            ${n.is_read ? "" : '<span class="notification-dot" aria-label="Unread"></span>'}
        </div>
    `).join("");
}

function setNotificationFeedback(message, isError = false) {
    if (!notificationFeedback) return;
    notificationFeedback.textContent = message;
    notificationFeedback.classList.toggle("is-error", isError);
}

async function refreshNotifications() {
    if (notificationRequestRunning) return;

    notificationRequestRunning = true;

    try {
        const response = await fetch("/api/admin/notifications", {
            cache: "no-store"
        });

        if (!response.ok) throw new Error("Unable to load notifications.");

        const data = await response.json();
        if (data.success === false) {
            throw new Error(data.message || "Unable to load notifications.");
        }

        notificationData = Array.isArray(data.notifications)
            ? data.notifications
            : [];

        updateNotificationBadge(data.unread ?? 0);
        renderNotifications(notificationData);
        setNotificationFeedback("");
    } catch (error) {
        console.error("Notification error:", error);
        setNotificationFeedback(
            error.message || "Unable to load notifications.",
            true
        );
    } finally {
        notificationRequestRunning = false;
    }
}

notificationBell.addEventListener("click", event => {
    event.stopPropagation();

    notificationPanelOpen = !notificationPanelOpen;
    notificationPanel.classList.toggle("show", notificationPanelOpen);
    notificationBell.setAttribute("aria-expanded", String(notificationPanelOpen));

    if (notificationPanelOpen) refreshNotifications();
});

document.addEventListener("click", event => {
    if (!event.target.closest(".notification-wrapper")) {
        notificationPanelOpen = false;
        notificationPanel.classList.remove("show");
        notificationBell.setAttribute("aria-expanded", "false");
    }
});

notificationList.addEventListener("click", async event => {
    const actionButton = event.target.closest("[data-notification-action]");
    if (!actionButton) return;
    const id = actionButton.dataset.notificationId;
    const action = actionButton.dataset.notificationAction;
    const notification = notificationData.find(
        n => String(n.id) === String(id)
    );
    if (!notification) return;

    try {
        const endpoint = action === "read" ? "read" : "delete";
        const response = await fetch(
            `/api/admin/notifications/${encodeURIComponent(id)}/${endpoint}`,
            { method: "POST" }
        );

        const data = await response.json();
        if (!response.ok || !data.success) {
            throw new Error(data.message || "Unable to update notification.");
        }

        if (action === "read") {
            notification.is_read = true;
        } else {
            notificationData = notificationData.filter(
                item => String(item.id) !== String(id)
            );
        }
        updateNotificationBadge(
            notificationData.filter(item => !item.is_read).length
        );
        renderNotifications(notificationData);
        setNotificationFeedback("");
        showAdminToast(
            action === "read" ? "Notification marked as read." : "Notification deleted."
        );
    } catch (error) {
        setNotificationFeedback(error.message, true);
        showAdminToast(error.message || "Unable to update notification.", "error");
    }
});

markAllReadBtn.addEventListener("click", async () => {
    try {
        const response = await fetch("/api/admin/notifications/read-all", {
            method: "POST"
        });

        const data = await response.json();
        if (!response.ok || !data.success) {
            throw new Error(data.message || "Unable to update notifications.");
        }

        notificationData.forEach(n => n.is_read = true);
        updateNotificationBadge(0);
        renderNotifications(notificationData);
        setNotificationFeedback("");
        showAdminToast("All notifications marked as read.");
    } catch (error) {
        setNotificationFeedback(error.message || "Unable to update notifications.", true);
        showAdminToast(error.message || "Unable to update notifications.", "error");
    }
});

deleteAllNotificationsBtn.addEventListener("click", async () => {
    if (!notificationData.length) return;
    if (!window.confirm("Delete all admin notifications? This cannot be undone.")) return;

    try {
        const response = await fetch("/api/admin/notifications/delete-all", {
            method: "POST"
        });
        const data = await response.json();
        if (!response.ok || !data.success) {
            throw new Error(data.message || "Unable to delete notifications.");
        }
        notificationData = [];
        updateNotificationBadge(0);
        renderNotifications(notificationData);
        setNotificationFeedback("All notifications deleted.");
        showAdminToast("All notifications deleted.");
    } catch (error) {
        setNotificationFeedback(error.message || "Unable to delete notifications.", true);
        showAdminToast(error.message || "Unable to delete notifications.", "error");
    }
});

const closeNotifications = document.getElementById("closeNotifications");
closeNotifications.addEventListener("click", () => {
    notificationPanelOpen = false;
    notificationPanel.classList.remove("show");
    notificationBell.setAttribute("aria-expanded", "false");
    notificationBell.focus();
});

function initializeAdminTheme() {
    const themeStorageKey = "basureport-theme";
    let isDark = false;
    try {
        const savedTheme = localStorage.getItem(themeStorageKey);
        const legacyTheme = savedTheme === null
            ? localStorage.getItem("basuReportAdminTheme")
            : null;
        isDark = (savedTheme === null ? legacyTheme : savedTheme) === "dark";
        if (savedTheme === null && legacyTheme !== null) {
            localStorage.setItem(themeStorageKey, legacyTheme);
        }
    } catch (error) {
        console.warn("Unable to read saved dashboard theme:", error);
    }

    function applyTheme(dark) {
        document.body.classList.toggle("dark-mode", dark);
        themeToggle.setAttribute("aria-pressed", String(dark));
        themeToggle.setAttribute(
            "aria-label",
            dark ? "Switch to light mode" : "Switch to dark mode"
        );
        document.getElementById("themeIcon").textContent = dark ? "☀" : "☾";
        document.getElementById("themeLabel").textContent =
            dark ? "Light mode" : "Dark mode";
    }

    applyTheme(isDark);
    themeToggle.addEventListener("click", () => {
        isDark = !document.body.classList.contains("dark-mode");
        applyTheme(isDark);
        try {
            localStorage.setItem(themeStorageKey, isDark ? "dark" : "light");
        } catch (error) {
            console.warn("Unable to save dashboard theme:", error);
        }
    });

    window.addEventListener("storage", event => {
        if (event.key === themeStorageKey && event.newValue) {
            isDark = event.newValue === "dark";
            applyTheme(isDark);
        }
    });
}

initializeAdminTheme();

function renderAnnouncements(items) {
    announcementHistory.replaceChildren();
    if (!items.length) {
        const empty = document.createElement("p");
        empty.className = "announcement-empty";
        empty.textContent = "No announcements have been published yet.";
        announcementHistory.appendChild(empty);
        return;
    }

    items.forEach(item => {
        const card = document.createElement("article");
        card.className = "announcement-item";
        const heading = document.createElement("div");
        heading.className = "announcement-item-heading";
        const title = document.createElement("h3");
        title.textContent = item.title;
        const date = document.createElement("time");
        date.textContent = formatNotificationTime(item.created_at);
        heading.append(title, date);
        const message = document.createElement("p");
        message.textContent = item.message;
        const actions = document.createElement("div");
        actions.className = "announcement-item-actions";
        const deleteButton = document.createElement("button");
        deleteButton.type = "button";
        deleteButton.className = "announcement-delete-btn";
        deleteButton.dataset.announcementId = item.id;
        deleteButton.textContent = "Delete";
        actions.appendChild(deleteButton);
        card.append(heading, message, actions);
        announcementHistory.appendChild(card);
    });
}

async function loadAnnouncements() {
    try {
        const response = await fetch("/api/admin/announcements", {
            cache: "no-store"
        });
        const data = await response.json();
        if (!response.ok || !data.success) {
            throw new Error(data.message || "Could not load announcements.");
        }
        renderAnnouncements(data.announcements || []);
        announcementHistory.classList.remove("is-error");
    } catch (error) {
        announcementHistory.textContent =
            error.message || "Could not load announcements.";
        announcementHistory.classList.add("is-error");
    }
}

announcementHistory.addEventListener("click", async event => {
    const button = event.target.closest(".announcement-delete-btn");
    if (!button) return;
    const announcementId = button.dataset.announcementId;
    if (!announcementId || !window.confirm(
        "Delete this announcement? Residents will no longer see it in their history."
    )) return;

    const feedback = document.getElementById("announcementDeleteFeedback");
    button.disabled = true;
    if (feedback) {
        feedback.textContent = "";
        feedback.classList.remove("is-error");
    }

    try {
        const response = await fetch(
            "/api/admin/announcements/" + encodeURIComponent(announcementId),
            { method: "DELETE" }
        );
        const data = await response.json();
        if (!response.ok || !data.success) {
            throw new Error(data.message || "Could not delete announcement.");
        }
        if (feedback) feedback.textContent = "Announcement deleted.";
        showAdminToast("Announcement deleted.");
        await loadAnnouncements();
    } catch (error) {
        if (feedback) {
            feedback.textContent =
                error.message || "Could not delete announcement.";
            feedback.classList.add("is-error");
        }
        showAdminToast(error.message || "Could not delete announcement.", "error");
        button.disabled = false;
    }
});

announcementForm.addEventListener("submit", async event => {
    event.preventDefault();
    const button = document.getElementById("publishAnnouncementBtn");
    const feedback = document.getElementById("announcementFeedback");
    const formData = new FormData(announcementForm);
    button.disabled = true;
    button.textContent = "Publishing...";
    feedback.textContent = "";
    feedback.classList.remove("is-error");

    try {
        const response = await fetch("/api/admin/announcements", {
            method: "POST",
            body: formData
        });
        const data = await response.json();
        if (!response.ok || !data.success) {
            throw new Error(data.message || "Could not publish announcement.");
        }
        announcementForm.reset();
        feedback.textContent = "Announcement published to resident dashboards.";
        showAdminToast("Announcement done! It is now visible to residents.");
        await loadAnnouncements();
    } catch (error) {
        feedback.textContent = error.message || "Could not publish announcement.";
        feedback.classList.add("is-error");
        showAdminToast(error.message || "Could not publish announcement.", "error");
    } finally {
        button.disabled = false;
        button.textContent = "Publish announcement";
    }
});

async function refreshMembers() {
    try {
        const response = await fetch("/api/admin/members", {
            cache: "no-store"
        });
        const data = await response.json();
        if (!response.ok || !data.success) {
            throw new Error(data.message || "Could not load member presence.");
        }

        const onlineCount = Number(data.online) || 0;
        const totalCount = Number(data.total) || 0;
        memberPresenceSummary.textContent =
            `${onlineCount} online · ${totalCount} members`;
        memberPresenceSummary.dataset.online = onlineCount;
        membersList.replaceChildren();

        if (!data.members.length) {
            const empty = document.createElement("p");
            empty.className = "members-empty";
            empty.textContent = "No resident accounts found.";
            membersList.appendChild(empty);
            return;
        }

        data.members.forEach(member => {
            const item = document.createElement("article");
            item.className = "member-item";
            const identity = document.createElement("div");
            identity.className = "member-identity";
            const avatar = document.createElement("span");
            avatar.className = "member-avatar";
            avatar.textContent = (member.fullname || "R").trim().charAt(0).toUpperCase();
            const labels = document.createElement("div");
            const name = document.createElement("h3");
            name.textContent = member.fullname || "Resident";
            const email = document.createElement("p");
            email.textContent = member.email;
            labels.append(name, email);
            identity.append(avatar, labels);

            const presence = document.createElement("span");
            presence.className = "member-presence " +
                (member.online ? "online" : "offline");
            const dot = document.createElement("span");
            dot.className = "presence-dot";
            const status = document.createElement("span");
            status.textContent = member.online
                ? "Online now"
                : member.last_seen_at
                    ? "Last active " + formatNotificationTime(member.last_seen_at)
                    : "Offline";
            presence.append(dot, status);
            item.append(identity, presence);
            membersList.appendChild(item);
        });
        membersList.classList.remove("is-error");
    } catch (error) {
        membersList.replaceChildren();
        const message = document.createElement("p");
        message.className = "members-empty is-error";
        message.textContent = error.message || "Could not load member presence.";
        membersList.appendChild(message);
    }
}

function syncMemberPresencePanel() {
    if (!memberPresenceToggle || !membersList || !memberPresencePanel) {
        return;
    }

    const compactSidebar = window.matchMedia("(max-width: 600px)").matches;
    if (!compactSidebar) {
        membersList.hidden = false;
        memberPresenceToggle.setAttribute("aria-expanded", "true");
        memberPresencePanel.classList.remove("is-open");
        return;
    }

    const isOpen = memberPresencePanel.classList.contains("is-open");
    membersList.hidden = !isOpen;
    memberPresenceToggle.setAttribute("aria-expanded", String(isOpen));
}

if (memberPresenceToggle && memberPresencePanel) {
    memberPresenceToggle.addEventListener("click", () => {
        memberPresencePanel.classList.toggle("is-open");
        syncMemberPresencePanel();
    });
    window.addEventListener("resize", syncMemberPresencePanel);
    syncMemberPresencePanel();
}

function navigateAdminSection(sectionName) {
    const target = sectionName === "reports"
        ? document.getElementById("reports")
        : document.getElementById("dashboardSection");
    if (!target) {
        return;
    }

    target.scrollIntoView({ behavior: "smooth", block: "start" });
    const highlightClass = sectionName === "reports"
        ? "review-highlight"
        : "dashboard-focus";
    target.classList.remove(highlightClass);
    void target.offsetWidth;
    target.classList.add(highlightClass);
    window.history.replaceState(null, "", sectionName === "reports" ? "#reports" : "#adminTop");
    document.querySelectorAll(".sidebar-nav .nav-link").forEach(link => {
        link.classList.toggle("active", link.dataset.adminSection === sectionName);
    });
    window.setTimeout(() => target.classList.remove(highlightClass), 1400);
}

document.querySelectorAll(".sidebar-nav [data-admin-section]").forEach(link => {
    link.addEventListener("click", event => {
        event.preventDefault();
        navigateAdminSection(link.dataset.adminSection);
    });
});

const reviewReportsLink = document.querySelector(".welcome-action");
if (reviewReportsLink) {
    reviewReportsLink.addEventListener("click", event => {
        event.preventDefault();
        navigateAdminSection("reports");
    });
}

function getStatusHTML(report) {
    if (report.status === "Pending") {
        return '<span class="status pending">Pending</span>';
    }

    if (report.status === "Accepted") {
        return '<span class="status accepted">Accepted</span>';
    }

    if (report.status === "In Progress") {
        return '<span class="status progress">In Progress</span>';
    }

    if (report.status === "Rejected") {
        return '<span class="status rejected">Rejected</span>';
    }

    return '<span class="status completed">Completed</span>';
}

function getPhotosHTML(report) {
    const beforeURL = getPhotoURL(report.image);
    const afterURL = getPhotoURL(report.clean_image);

    const before = beforeURL
        ? `<a href="${beforeURL}" target="_blank" rel="noopener noreferrer"><img class="report-photo" src="${beforeURL}" alt="Original report photo" loading="lazy"></a>`
        : '<div class="photo-missing"><span>📷</span>No original photo</div>';

    const after = afterURL
        ? `<a href="${afterURL}" target="_blank" rel="noopener noreferrer"><img class="report-photo" src="${afterURL}" alt="After cleaning photo" loading="lazy"></a>`
        : `<div class="photo-missing"><span>🧹</span>${report.status === "Completed" ? "After photo unavailable" : "Not cleaned yet"}</div>`;

    return `
        <div class="photo-box">
            <div class="photo-label before">Before Cleaning</div>
            ${before}
        </div>
        <div class="photo-box">
            <div class="photo-label after">After Cleaning</div>
            ${after}
        </div>
    `;
}

function getActionHTML(report) {
    const id = encodeURIComponent(report.id);
    let workflowAction;

    if (report.status === "Pending") {
        workflowAction = `
            <div class="report-decision-actions">
                <button type="button" class="accept-report-btn"
                        data-report-action="accept" data-report-id="${id}">✓ Accept</button>
                <button type="button" class="reject-report-btn"
                        data-report-action="reject" data-report-id="${id}">✕ Reject</button>
            </div>`;
    } else if (report.status === "Accepted") {
        workflowAction = `
            <form class="start-cleaning-form" action="/start-cleaning/${id}" method="POST">
                <button type="submit" class="action-btn">🧹 Start Cleaning</button>
            </form>`;
    } else if (report.status === "In Progress") {
        workflowAction = `
            <form class="complete-report-form" action="/complete-report/${id}" method="POST" enctype="multipart/form-data">
                <label class="upload-label">Upload After-Cleaning Photo</label>
                <input type="file" name="clean-image" class="upload-input" accept=".jpg,.jpeg,.png,.gif,.webp" required>
                <button type="submit" class="complete-btn">✓ Complete Report</button>
            </form>`;
    } else if (report.status === "Rejected") {
        workflowAction = '<span class="completed-label rejected-label">✕ Report Rejected</span>';
    } else {
        workflowAction = '<span class="completed-label">✓ Cleanup Completed</span>';
    }

    return `${workflowAction}
        <button type="button" class="report-delete-btn"
                data-report-action="delete" data-report-id="${id}">
            Move to Recently Deleted
        </button>`;
}

function createReportCard(report) {
    const urgentBadge = report.is_urgent
        ? '<span class="urgent-badge">🚨 URGENT</span>'
        : "";

    return `
        <article class="report-card"
                 data-report-id="${escapeHTML(report.id)}"
                 data-status="${escapeHTML(report.status)}"
                 data-urgent="${report.is_urgent ? "urgent" : "normal"}">

            <div class="report-card-top">
                <div>
                    <div class="report-id">REPORT #${escapeHTML(report.id)}</div>
                    <div class="report-resident">${escapeHTML(report.fullname)}</div>
                    ${report.phone ? `<div class="report-date">☎ ${escapeHTML(report.phone)}</div>` : ""}
                    <div class="report-date">📅 ${escapeHTML(report.date)}</div>
                </div>
                <div class="report-badges">
                    ${getStatusHTML(report)}
                    ${urgentBadge}
                </div>
            </div>

            <div class="report-location">📍 <strong>Location:</strong> ${escapeHTML(report.sitio)}</div>
            <div class="report-description"><strong>Report Description</strong>${escapeHTML(report.description)}</div>

            <div class="report-photos">${getPhotosHTML(report)}</div>

            <div class="report-card-footer">
                <div class="report-footer-details">
                    <span class="duration-label">⏱ Report Duration</span>
                    <span class="duration ${report.is_urgent ? "urgent" : ""}">${escapeHTML(report.duration)}</span>
                </div>
                <div class="report-actions">${getActionHTML(report)}</div>
            </div>
        </article>
    `;
}

function renderDeletedReports(reports) {
    const grid = document.getElementById("deletedReportsGrid");
    const count = document.getElementById("deletedReportCount");
    if (!grid || !count) return;

    count.textContent = `${reports.length} report${reports.length === 1 ? "" : "s"}`;
    if (!reports.length) {
        grid.innerHTML = '<div class="no-reports">No deleted reports.</div>';
        return;
    }

    grid.innerHTML = reports.map(report => `
        <article class="deleted-report-card">
            <div>
                <strong>REPORT #${escapeHTML(report.id)}</strong>
                <span>${escapeHTML(report.fullname)} · ${escapeHTML(report.sitio)}</span>
                <small>Deleted ${escapeHTML(formatNotificationTime(report.deleted_at))}</small>
            </div>
            <div class="deleted-report-actions">
                <button type="button" class="restore-report-btn"
                        data-report-action="restore"
                        data-report-id="${escapeHTML(report.id)}">Restore</button>
                <button type="button" class="permanent-delete-report-btn"
                        data-report-action="permanent-delete"
                        data-report-id="${escapeHTML(report.id)}">Delete permanently</button>
            </div>
        </article>
    `).join("");
}

function applyReportFilters() {
    saveFilters();

    const selectedStatus = statusFilter.value;
    const selectedUrgency = urgentFilter.value;
    const selectedSort = sortFilter.value;

    const filtered = latestReports.filter(report => {
        const statusOK =
            selectedStatus === "all" || report.status === selectedStatus;

        const urgencyOK =
            selectedUrgency === "all" ||
            (selectedUrgency === "urgent" && Boolean(report.is_urgent)) ||
            (selectedUrgency === "normal" && !Boolean(report.is_urgent));

        return statusOK && urgencyOK;
    });

    if (selectedSort === "default") {
        filtered.sort((a, b) =>
            (reportOrder.get(String(a.id)) ?? 0) -
            (reportOrder.get(String(b.id)) ?? 0)
        );
    } else if (selectedSort === "id-desc") {
        filtered.sort((a, b) =>
            String(b.id).localeCompare(String(a.id), undefined, { numeric: true })
        );
    } else if (selectedSort === "id-asc") {
        filtered.sort((a, b) =>
            String(a.id).localeCompare(String(b.id), undefined, { numeric: true })
        );
    } else if (selectedSort === "urgent-first") {
        filtered.sort((a, b) =>
            Number(Boolean(b.is_urgent)) - Number(Boolean(a.is_urgent)) ||
            (reportOrder.get(String(a.id)) ?? 0) -
            (reportOrder.get(String(b.id)) ?? 0)
        );
    }

    if (filtered.length === 0) {
        reportsGrid.innerHTML = `
            <div class="no-reports">
                <div class="empty-icon">🔎</div>
                <h3>No Matching Reports</h3>
                <p>Walang report na tumutugma sa napili mong filters. Subukang baguhin o i-reset ang filters.</p>
            </div>
        `;
    } else {
        reportsGrid.innerHTML = filtered.map(createReportCard).join("");
    }

    reportCountLabel.textContent = `${filtered.length} of ${latestReports.length} Reports`;

    const descriptions = [];

    if (selectedStatus !== "all") descriptions.push(selectedStatus);
    if (selectedUrgency === "urgent") descriptions.push("Urgent Only");
    if (selectedUrgency === "normal") descriptions.push("Normal Only");

    filterSummary.textContent = descriptions.length
        ? "Filters: " + descriptions.join(" • ")
        : "Showing all reports";

    if (selectedSort === "urgent-first") {
        filterSummary.textContent += " • Urgent First";
    }

    if (selectedSort === "id-desc") {
        filterSummary.textContent += " • Newest ID First";
    }

    if (selectedSort === "id-asc") {
        filterSummary.textContent += " • Oldest ID First";
    }
}

statusFilter.addEventListener("change", applyReportFilters);
urgentFilter.addEventListener("change", applyReportFilters);
sortFilter.addEventListener("change", applyReportFilters);

resetFilters.addEventListener("click", () => {
    statusFilter.value = "all";
    urgentFilter.value = "all";
    sortFilter.value = "default";
    applyReportFilters();
});

function updateUrgentReports(reports) {
    const urgent = reports.filter(r => Boolean(r.is_urgent));

    document.getElementById("urgentCount").textContent = urgent.length + " Urgent";
    document.getElementById("urgentReports").textContent = urgent.length;

    if (urgent.length === 0) {
        urgentList.innerHTML =
            '<div class="urgent-empty">✓ No urgent reports at the moment.</div>';
        return;
    }

    urgentList.innerHTML = urgent.map(r => `
        <div class="urgent-item">
            <strong>${escapeHTML(r.id)}</strong>
            <span class="urgent-badge">URGENT</span>
            <p>Resident: ${escapeHTML(r.fullname)}</p>
            ${r.phone ? `<p>Phone: ${escapeHTML(r.phone)}</p>` : ""}
            <p>Location: ${escapeHTML(r.sitio)}</p>
            <p>Description: ${escapeHTML(r.description)}</p>
            <p>Pending Duration: <strong>${escapeHTML(r.duration)}</strong></p>
        </div>
    `).join("");
}

async function refreshDashboard(force = false) {
    if (dashboardRequestRunning) {
        if (force) dashboardRefreshPending = true;
        return;
    }

    const fileInputs = document.querySelectorAll('input[name="clean-image"]');
    const hasSelectedPhoto = Array.from(fileInputs).some(
        input => input.files && input.files.length > 0
    );

    const active = document.activeElement;

    if (
        !force &&
        (hasSelectedPhoto ||
        (active && active.matches('input[name="clean-image"]')))
    ) {
        return;
    }

    dashboardRequestRunning = true;

    try {
        const response = await fetch("/api/admin/reports", {
            cache: "no-store"
        });

        if (!response.ok) {
            throw new Error("Unable to fetch reports.");
        }

        const data = await response.json();

        if (data.success === false) {
            throw new Error(data.message || "Dashboard update failed.");
        }

        latestReports = Array.isArray(data.reports) ? data.reports : [];
        renderDeletedReports(
            Array.isArray(data.deleted_reports) ? data.deleted_reports : []
        );

        registerReports(latestReports);

        document.getElementById("totalReports").textContent =
            data.total_reports ?? latestReports.length;

        document.getElementById("pendingReports").textContent =
            data.pending_reports ?? latestReports.filter(r => r.status === "Pending").length;

        document.getElementById("acceptedReports").textContent =
            data.accepted_reports ?? latestReports.filter(r => r.status === "Accepted").length;

        document.getElementById("inProgressReports").textContent =
            data.in_progress_reports ?? latestReports.filter(r => r.status === "In Progress").length;

        document.getElementById("completedReports").textContent =
            data.completed_reports ?? latestReports.filter(r => r.status === "Completed").length;

        document.getElementById("rejectedReports").textContent =
            data.rejected_reports ?? latestReports.filter(r => r.status === "Rejected").length;

        updateUrgentReports(latestReports);
        applyReportFilters();

        document.getElementById("lastUpdated").textContent =
            new Date().toLocaleTimeString();
    } catch (error) {
        console.error("Dashboard update error:", error);
        document.getElementById("lastUpdated").textContent = "Connection error";
    } finally {
        dashboardRequestRunning = false;

        if (dashboardRefreshPending) {
            dashboardRefreshPending = false;
            refreshDashboard(true);
        }
    }
}

async function updateReportAction(action, reportId, button) {
    const fromRecentlyDeleted = Boolean(
        button.closest("#deletedReportsGrid")
    );
    const confirmMessages = {
        reject: "Reject this report? The resident will be notified.",
        delete: "Move this report to Recently Deleted? It can be restored later.",
        "permanent-delete":
            "Permanently delete this report and its photos? This cannot be undone."
    };
    if (confirmMessages[action] && !window.confirm(confirmMessages[action])) return;

    const originalText = button.textContent;
    button.disabled = true;
    button.textContent = "Updating...";
    const isAdminAction = action === "accept" || action === "reject";
    const endpointAction = action === "delete" ? "delete" :
        action === "restore" ? "restore" :
        action === "permanent-delete" ? "permanent-delete" : "decision";

    try {
        const body = new URLSearchParams();
        if (isAdminAction) body.set("decision", action);
        const response = await fetch(
            `/api/admin/reports/${encodeURIComponent(reportId)}/${endpointAction}`,
            {
                method: "POST",
                headers: isAdminAction
                    ? { "Content-Type": "application/x-www-form-urlencoded" }
                    : {},
                body: isAdminAction ? body : undefined
            }
        );
        const data = await response.json();
        if (!response.ok || data.success === false) {
            throw new Error(data.message || "Could not update this report.");
        }
        const actionMessages = {
            delete: "Report moved to Recently Deleted.",
            restore: "Report restored from Recently Deleted.",
            "permanent-delete": "Report permanently deleted."
        };
        showActionMessage(
            actionMessages[action] || data.message || "Report updated.",
            "success"
        );
        await refreshDashboard(true);
        if (fromRecentlyDeleted) {
            document.getElementById("deletedReportsContainer")
                .scrollIntoView({ behavior: "smooth", block: "start" });
        }
        if (action === "accept" || action === "reject") {
            await refreshNotifications();
        }
    } catch (error) {
        showActionMessage(error.message || "Could not update this report.", "error");
        button.disabled = false;
        button.textContent = originalText;
    }
}

reportsGrid.addEventListener("click", event => {
    const button = event.target.closest("[data-report-action]");
    if (!button) return;
    const { reportAction, reportId } = button.dataset;
    if (!reportId) return;
    updateReportAction(reportAction, reportId, button);
});

document.getElementById("deletedReportsGrid").addEventListener("click", event => {
    const button = event.target.closest("[data-report-action]");
    if (!button || !button.dataset.reportId) return;
    updateReportAction(
        button.dataset.reportAction,
        button.dataset.reportId,
        button
    );
});

reportsGrid.addEventListener("submit", async event => {
    const form = event.target.closest(".start-cleaning-form");
    if (!form) return;

    event.preventDefault();

    if (isStartingReport) return;

    isStartingReport = true;

    const button = form.querySelector("button[type='submit']");
    const originalText = button ? button.textContent : "";

    if (button) {
        button.disabled = true;
        button.textContent = "Updating...";
    }

    try {
        const response = await fetch(form.action, {
            method: "POST",
            headers: {
                "X-Requested-With": "XMLHttpRequest",
                "Accept": "application/json"
            },
            credentials: "same-origin"
        });

        let data;

        try {
            data = await response.json();
        } catch {
            throw new Error(
                "Hindi JSON ang response ng server. Tingnan ang start_cleaning route sa app.py."
            );
        }

        if (!response.ok || data.success === false) {
            throw new Error(data.message || "Hindi na-update ang report status.");
        }

        showActionMessage(
            data.message || "Report status updated to In Progress!",
            "success"
        );

        await refreshDashboard(true);
        await refreshNotifications();
    } catch (error) {
        console.error("Start cleaning error:", error);

        showActionMessage(
            error.message || "Hindi na-update ang report. Pakisubukan ulit.",
            "error"
        );

        if (button) {
            button.disabled = false;
            button.textContent = originalText;
        }
    } finally {
        isStartingReport = false;
    }
});

reportsGrid.addEventListener("change", event => {
    if (event.target.matches('input[name="clean-image"]')) {
        const input = event.target;
        const form = input.closest("form");

        if (form) {
            const button = form.querySelector("button[type='submit']");
            if (button) {
                button.disabled = false;
                button.textContent = "✓ Complete Report";
            }
        }
    }
});

reportsGrid.addEventListener("submit", event => {
    const form = event.target.closest(".complete-report-form");
    if (!form) return;

    const input = form.querySelector('input[name="clean-image"]');

    if (!input || !input.files || input.files.length === 0) {
        event.preventDefault();
        showActionMessage("Pumili muna ng after-cleaning photo.", "error");
        return;
    }

    const button = form.querySelector("button[type='submit']");
    if (button) {
        button.disabled = true;
        button.textContent = "Uploading...";
    }
});

document.addEventListener("click", event => {
    const photo = event.target.closest(".report-photo");
    if (!photo) return;

    event.preventDefault();

    photoModal.classList.add("show");
    modalPhoto.src = photo.src;
    modalPhoto.alt = photo.alt || "Report photo";
});

function closeModal() {
    photoModal.classList.remove("show");
    modalPhoto.src = "";
}

closePhotoModal.addEventListener("click", closeModal);

photoModal.addEventListener("click", event => {
    if (event.target === photoModal) closeModal();
});

document.addEventListener("keydown", event => {
    if (event.key === "Escape") {
        closeModal();

        notificationPanelOpen = false;
        notificationPanel.classList.remove("show");
        notificationBell.setAttribute("aria-expanded", "false");
    }
});

initializeOrder();
restoreFilters();
refreshDashboard(true);
refreshNotifications();
loadAnnouncements();
refreshMembers();

setInterval(() => refreshDashboard(false), 5000);
setInterval(refreshNotifications, 5000);
setInterval(refreshMembers, 15000);
