document.addEventListener('DOMContentLoaded', function () {
    const imageInput = document.getElementById('garbage-image');
    const imagePreview = document.getElementById('image-preview');
    const uploadPlaceholder = document.getElementById('upload-placeholder');
    const dateInput = document.getElementById('date');
    const timeInput = document.getElementById('time');
    const reportSearch = document.getElementById('report-search');
    const statusFilter = document.getElementById('status-filter');
    const reportModal = document.getElementById('report-modal');
    const editReportModal = document.getElementById('edit-report-modal');
    const editReportForm = document.getElementById('edit-report-form');
    const notificationToggle = document.getElementById('notification-toggle');
    const notificationPanel = document.getElementById('notification-panel');
    const notificationList = document.getElementById('notification-list');
    const notificationCount = document.getElementById('notification-count');
    const notificationSummary = document.getElementById('notification-summary');
    const notificationFeedback = document.getElementById('notification-feedback');
    const sidebar = document.getElementById('sidebar');
    const sidebarScrim = document.getElementById('scrim');
    const menuToggle = document.getElementById('menu-btn');
    let reportSuccessToast = document.querySelector('.report-success-toast');
    let residentToastTimeout = null;
    let notifications = [];

    function setSidebarOpen(open) {
        if (!sidebar || !sidebarScrim || !menuToggle) return;
        sidebar.classList.toggle('open', open);
        sidebarScrim.classList.toggle('show', open);
        menuToggle.setAttribute('aria-expanded', String(open));
        menuToggle.setAttribute(
            'aria-label',
            open ? 'Close menu' : 'Open menu'
        );
        document.body.classList.toggle('sidebar-open', open);
    }

    if (menuToggle) {
        menuToggle.addEventListener('click', function () {
            setSidebarOpen(!(sidebar && sidebar.classList.contains('open')));
        });
    }

    if (sidebarScrim) {
        sidebarScrim.addEventListener('click', function () {
            setSidebarOpen(false);
        });
    }

    function dismissResidentToast() {
        if (!reportSuccessToast) return;
        const toast = reportSuccessToast;
        toast.classList.add('is-hiding');
        toast.classList.remove('is-visible');
        window.setTimeout(function () {
            if (!toast.classList.contains('is-hiding')) return;
            toast.remove();
            if (reportSuccessToast === toast) reportSuccessToast = null;
        }, 400);
    }

    function showResidentToast(message, type, label) {
        if (!reportSuccessToast) {
            reportSuccessToast = document.createElement('div');
            reportSuccessToast.className = 'flash-message report-success-toast';
            reportSuccessToast.setAttribute('role', 'status');
            reportSuccessToast.innerHTML =
                '<span class="report-toast-icon" aria-hidden="true"></span>' +
                '<span class="report-toast-content">' +
                '<span class="report-toast-label"></span>' +
                '<span class="report-toast-message"></span></span>' +
                '<button type="button" class="report-toast-close" ' +
                'aria-label="Dismiss notification">×</button>' +
                '<span class="report-toast-progress" aria-hidden="true"></span>';
            document.body.appendChild(reportSuccessToast);
        }

        if (reportSuccessToast.dataset.closeBound !== 'true') {
            reportSuccessToast.querySelector('.report-toast-close')
                .addEventListener('click', dismissResidentToast);
            reportSuccessToast.dataset.closeBound = 'true';
        }
        if (!document.body.contains(reportSuccessToast)) {
            document.body.appendChild(reportSuccessToast);
        }

        reportSuccessToast.querySelector('.report-toast-icon').textContent =
            type === 'error' ? '!' : '✓';
        reportSuccessToast.querySelector('.report-toast-label').textContent = label;
        reportSuccessToast.querySelector('.report-toast-message').textContent = message;
        reportSuccessToast.classList.toggle('is-error', type === 'error');
        reportSuccessToast.setAttribute(
            'aria-live', type === 'error' ? 'assertive' : 'polite'
        );
        reportSuccessToast.classList.remove('is-hiding', 'is-visible');
        void reportSuccessToast.offsetWidth;
        reportSuccessToast.classList.add('is-visible');
        if (residentToastTimeout) window.clearTimeout(residentToastTimeout);
        residentToastTimeout = window.setTimeout(dismissResidentToast, 5000);
    }

    if (reportSuccessToast) {
        const initialMessage = reportSuccessToast.querySelector(
            '.report-toast-message'
        ).textContent;
        showResidentToast(initialMessage, 'success', 'REPORT SUBMITTED');
    }

    try {
        const storedToast = sessionStorage.getItem('basuReportResidentToast');
        if (storedToast) {
            sessionStorage.removeItem('basuReportResidentToast');
            let notification;
            try {
                notification = JSON.parse(storedToast);
            } catch {
                notification = {
                    message: storedToast,
                    label: 'ACTION COMPLETE'
                };
            }
            showResidentToast(
                notification.message,
                'success',
                notification.label || 'ACTION COMPLETE'
            );
        }
    } catch (error) {
        console.warn('Unable to restore action notification:', error);
    }

    async function refreshDeletedReports() {
        const deletedList = document.getElementById('residentDeletedList');
        const deletedCount = document.getElementById('residentDeletedCount');
        if (!deletedList || !deletedCount) return;

        try {
            const response = await fetch('/api/resident/reports', {
                cache: 'no-store'
            });
            const data = await response.json();
            if (!response.ok || !data.success) {
                throw new Error(data.message || 'Could not load deleted reports.');
            }

            const reports = data.deleted_reports || [];
            const activeReports = data.reports || [];
            deletedCount.textContent = reports.length + ' report(s)';
            const activeReportIds = new Set(
                activeReports.map(function (report) {
                    return String(report.id);
                })
            );
            document.querySelectorAll('.report-card').forEach(function (card) {
                if (!activeReportIds.has(card.dataset.reportId)) {
                    card.remove();
                }
            });
            activeReports.forEach(function (report) {
                const card = Array.from(
                    document.querySelectorAll('.report-card')
                ).find(function (item) {
                    return item.dataset.reportId === String(report.id);
                });
                if (!card) return;
                card.dataset.status = String(report.status || '').toLowerCase();
                const editButton = card.querySelector('.resident-report-edit-btn');
                if (editButton) {
                    editButton.hidden = card.dataset.status !== 'pending';
                }
                const badge = card.querySelector('.report-photo-wrap .status');
                if (badge) {
                    const statusClass = {
                        Pending: ['status-pending', '● Pending'],
                        Accepted: ['status-accepted', '✓ Accepted'],
                        'In Progress': ['status-progress', '◷ In Progress'],
                        Completed: ['status-completed', '✓ Completed'],
                        Rejected: ['status-rejected', '✕ Rejected']
                    }[report.status];
                    if (statusClass) {
                        badge.className = 'status ' + statusClass[0];
                        badge.textContent = statusClass[1];
                    }
                }
            });
            const totalCount = document.getElementById('total-count');
            const pendingCount = document.getElementById('pending-count');
            const progressCount = document.getElementById('progress-count');
            const completedCount = document.getElementById('completed-count');
            if (totalCount) totalCount.textContent = data.total_reports;
            if (pendingCount) pendingCount.textContent = data.pending_reports;
            if (progressCount) progressCount.textContent = data.in_progress_reports;
            if (completedCount) completedCount.textContent = data.completed_reports;
            filterReports();
            deletedList.replaceChildren();
            if (!reports.length) {
                const empty = document.createElement('p');
                empty.className = 'resident-deleted-empty';
                empty.textContent = 'No deleted reports.';
                deletedList.appendChild(empty);
                return;
            }

            reports.forEach(function (report) {
                const item = document.createElement('article');
                item.className = 'resident-deleted-item';
                const details = document.createElement('div');
                const title = document.createElement('strong');
                title.textContent = report.id + ' · ' + report.sitio;
                const date = document.createElement('small');
                date.textContent = 'Deleted ' + report.deleted_at;
                details.append(title, date);
                const actions = document.createElement('div');
                actions.className = 'resident-deleted-actions';
                const restore = document.createElement('button');
                restore.type = 'button';
                restore.className = 'resident-restore-report-btn';
                restore.dataset.reportId = report.id;
                restore.textContent = 'Restore';
                const permanentDelete = document.createElement('button');
                permanentDelete.type = 'button';
                permanentDelete.className = 'resident-permanent-delete-report-btn';
                permanentDelete.dataset.reportId = report.id;
                permanentDelete.textContent = 'Delete permanently';
                actions.append(restore, permanentDelete);
                item.append(details, actions);
                deletedList.appendChild(item);
            });
        } catch (error) {
            deletedList.replaceChildren();
            const failure = document.createElement('p');
            failure.className = 'resident-deleted-empty is-error';
            failure.textContent =
                error.message || 'Could not load deleted reports.';
            deletedList.appendChild(failure);
        }
    }

    async function refreshAnnouncements() {
        const announcementList = document.getElementById(
            'residentAnnouncementList'
        );
        const historyList = document.getElementById(
            'residentAnnouncementHistory'
        );
        if (!announcementList) return;

        try {
            const response = await fetch('/api/resident/announcements', {
                cache: 'no-store'
            });
            const data = await response.json();
            if (!response.ok || !data.success) {
                throw new Error(data.message || 'Could not load announcements.');
            }

            renderAnnouncementList(
                announcementList,
                data.announcements || [],
                'No new announcements from your barangay.'
            );
            if (historyList) {
                renderAnnouncementHistory(historyList, data.history || []);
            }
        } catch (error) {
            announcementList.replaceChildren();
            const failure = document.createElement('p');
            failure.className = 'resident-announcement-empty is-error';
            failure.textContent =
                error.message || 'Could not load announcements.';
            announcementList.appendChild(failure);
            if (historyList) historyList.replaceChildren();
        }
    }

    const HISTORY_PAGE_SIZE = 6;
    let announcementHistoryCount = 0;
    let announcementHistoryVisible = HISTORY_PAGE_SIZE;
    let announcementHistoryItems = [];

    function parseAnnouncementDate(value) {
        const timestamp = String(value || '');
        const parsed = new Date(timestamp.replace(' ', 'T'));
        return Number.isNaN(parsed.getTime()) ? null : parsed;
    }

    function announcementDayLabel(date) {
        if (!date) return 'Earlier';
        const today = new Date();
        const startOf = function (d) {
            return new Date(d.getFullYear(), d.getMonth(), d.getDate());
        };
        const diffDays = Math.round(
            (startOf(today) - startOf(date)) / 86400000
        );
        if (diffDays === 0) return 'Today';
        if (diffDays === 1) return 'Yesterday';
        return new Intl.DateTimeFormat(undefined, {
            weekday: 'long',
            month: 'long',
            day: 'numeric',
            year: 'numeric'
        }).format(date);
    }

    function updateAnnouncementHistoryToggle() {
        const toggle = document.getElementById('announcementHistoryToggle');
        const history = document.getElementById('residentAnnouncementHistory');
        if (!toggle || !history) return;
        const isOpen = !history.hidden;
        const count = announcementHistoryCount
            ? ' (' + announcementHistoryCount + ')'
            : '';
        toggle.textContent = isOpen
            ? 'Hide announcement history'
            : 'View announcement history' + count;
        toggle.setAttribute('aria-expanded', String(isOpen));
    }

    function renderAnnouncementHistory(list, announcements) {
        announcementHistoryItems = announcements;
        announcementHistoryCount = announcements.length;
        list.replaceChildren();
        updateAnnouncementHistoryToggle();

        if (!announcements.length) {
            const empty = document.createElement('p');
            empty.className = 'resident-announcement-empty';
            empty.textContent = 'No older announcements yet.';
            list.appendChild(empty);
            return;
        }

        const visibleItems = announcements.slice(0, announcementHistoryVisible);
        let currentLabel = null;
        let currentGroup = null;

        visibleItems.forEach(function (announcement) {
            const date = parseAnnouncementDate(announcement.created_at);
            const label = announcementDayLabel(date);
            if (label !== currentLabel) {
                currentLabel = label;
                const section = document.createElement('section');
                section.className = 'announcement-history-day';
                const heading = document.createElement('h4');
                heading.className = 'announcement-history-day-label';
                heading.textContent = label;
                currentGroup = document.createElement('div');
                currentGroup.className = 'announcement-history-day-items';
                section.append(heading, currentGroup);
                list.appendChild(section);
            }

            const card = document.createElement('article');
            card.className = 'resident-announcement';
            const meta = document.createElement('div');
            meta.className = 'resident-announcement-meta';
            const title = document.createElement('h3');
            title.textContent = announcement.title;
            const time = document.createElement('time');
            time.dateTime = String(announcement.created_at || '').replace(' ', 'T');
            time.textContent = date
                ? new Intl.DateTimeFormat(undefined, {
                    hour: 'numeric',
                    minute: '2-digit'
                }).format(date)
                : String(announcement.created_at || '');
            meta.append(title, time);
            const message = document.createElement('p');
            message.textContent = announcement.message;
            card.append(meta, message);
            currentGroup.appendChild(card);
        });

        if (announcements.length > visibleItems.length) {
            const more = document.createElement('button');
            more.type = 'button';
            more.className = 'announcement-history-more';
            more.textContent =
                'Show more (' +
                (announcements.length - visibleItems.length) +
                ' remaining)';
            more.addEventListener('click', function () {
                announcementHistoryVisible += HISTORY_PAGE_SIZE;
                renderAnnouncementHistory(list, announcementHistoryItems);
            });
            list.appendChild(more);
        }
    }

    function renderAnnouncementList(list, announcements, emptyMessage) {
        list.replaceChildren();
        if (!announcements.length) {
            const empty = document.createElement('p');
            empty.className = 'resident-announcement-empty';
            empty.textContent = emptyMessage;
            list.appendChild(empty);
            return;
        }

        announcements.forEach(function (announcement) {
            const card = document.createElement('article');
            card.className = 'resident-announcement';
            const heading = document.createElement('div');
            heading.className = 'resident-announcement-meta';
            const title = document.createElement('h3');
            title.textContent = announcement.title;
            const date = document.createElement('time');
            const timestamp = String(announcement.created_at || '');
            const parsedDate = new Date(timestamp.replace(' ', 'T'));
            date.dateTime = timestamp.replace(' ', 'T');
            date.textContent = Number.isNaN(parsedDate.getTime())
                ? timestamp
                : new Intl.DateTimeFormat(undefined, {
                    dateStyle: 'medium',
                    timeStyle: 'short'
                }).format(parsedDate);
            heading.append(title, date);
            const message = document.createElement('p');
            message.textContent = announcement.message;
            card.append(heading, message);
            list.appendChild(card);
        });
    }

    async function sendPresenceHeartbeat() {
        if (document.visibilityState !== 'visible') return;
        try {
            const response = await fetch('/api/resident/presence', {
                method: 'POST',
                headers: { 'X-Requested-With': 'XMLHttpRequest' }
            });
            if (!response.ok) {
                throw new Error('Could not update member presence.');
            }
        } catch (error) {
            console.error('Resident presence update failed:', error);
        }
    }

    function setNotificationFeedback(message, isError) {
        if (!notificationFeedback) return;
        notificationFeedback.textContent = message;
        notificationFeedback.classList.toggle('is-error', Boolean(isError));
    }

    function updateNotificationCount(unread) {
        if (!notificationCount || !notificationToggle) return;
        notificationCount.textContent = unread > 99 ? '99+' : String(unread);
        notificationCount.hidden = unread < 1;
        notificationToggle.setAttribute(
            'aria-label',
            unread
                ? 'Notifications, ' + unread + ' unread'
                : 'Notifications, none unread'
        );
    }

    function renderNotifications() {
        if (!notificationList) return;

        const unread = notifications.filter(function (item) {
            return !item.is_read;
        }).length;

        updateNotificationCount(unread);
        if (notificationSummary) {
            notificationSummary.textContent = unread
                ? unread + ' unread · ' + notifications.length + ' total'
                : notifications.length + ' total';
        }

        notificationList.replaceChildren();
        if (!notifications.length) {
            const empty = document.createElement('p');
            empty.className = 'notification-empty';
            empty.textContent = 'You are all caught up.';
            notificationList.appendChild(empty);
            return;
        }

        notifications.forEach(function (item) {
            const card = document.createElement('article');
            card.className = 'notification-item' + (item.is_read ? '' : ' unread');

            const heading = document.createElement('div');
            heading.className = 'notification-item-heading';
            const title = document.createElement('h4');
            title.textContent = item.title;
            const time = document.createElement('time');
            time.textContent = item.created_at;
            heading.append(title, time);

            const message = document.createElement('p');
            message.textContent = item.message;

            const actions = document.createElement('div');
            actions.className = 'notification-item-actions';
            if (!item.is_read) {
                const readButton = document.createElement('button');
                readButton.type = 'button';
                readButton.textContent = 'Mark as read';
                readButton.dataset.notificationAction = 'read';
                readButton.dataset.notificationId = item.id;
                actions.appendChild(readButton);
            }

            const deleteButton = document.createElement('button');
            deleteButton.type = 'button';
            deleteButton.textContent = 'Delete';
            deleteButton.dataset.notificationAction = 'delete';
            deleteButton.dataset.notificationId = item.id;
            actions.appendChild(deleteButton);

            card.append(heading, message, actions);
            notificationList.appendChild(card);
        });
    }

    async function loadNotifications() {
        if (!notificationList) return;
        if (notificationSummary) notificationSummary.textContent = 'Loading...';
        try {
            const response = await fetch('/api/resident/notifications');
            const data = await response.json();
            if (!response.ok || !data.success) {
                throw new Error(data.message || 'Could not load notifications.');
            }

            notifications = data.notifications;
            renderNotifications();
            setNotificationFeedback('', false);
        } catch (error) {
            if (notificationSummary) {
                notificationSummary.textContent = 'Unable to load';
            }
            setNotificationFeedback(
                error.message || 'Could not load notifications.',
                true
            );
            notificationList.replaceChildren();
        }
    }

    async function updateNotification(url, confirmationMessage) {
        if (confirmationMessage && !window.confirm(confirmationMessage)) return;

        setNotificationFeedback('', false);
        try {
            const response = await fetch(url, { method: 'POST' });
            const data = await response.json();
            if (!response.ok || !data.success) {
                throw new Error(data.message || 'Could not update notifications.');
            }

            await loadNotifications();
            const actionMessage = url.endsWith('/read-all')
                ? 'All notifications marked as read.'
                : url.endsWith('/delete-all')
                    ? 'All notifications deleted.'
                    : url.endsWith('/read')
                        ? 'Notification marked as read.'
                        : 'Notification deleted.';
            showResidentToast(actionMessage, 'success', 'ACTION COMPLETE');
        } catch (error) {
            setNotificationFeedback(
                error.message || 'Could not update notifications.',
                true
            );
            showResidentToast(
                error.message || 'Could not update notifications.',
                'error',
                'ACTION FAILED'
            );
        }
    }

    if (notificationToggle && notificationPanel) {
        notificationToggle.addEventListener('click', function () {
            const opening = notificationPanel.hidden;
            notificationPanel.hidden = !opening;
            notificationToggle.setAttribute('aria-expanded', String(opening));
            if (opening) loadNotifications();
        });
    }

    const notificationClose = document.getElementById('notification-close');
    if (notificationClose && notificationPanel && notificationToggle) {
        notificationClose.addEventListener('click', function () {
            notificationPanel.hidden = true;
            notificationToggle.setAttribute('aria-expanded', 'false');
            notificationToggle.focus();
        });
    }

    if (notificationList) {
        notificationList.addEventListener('click', function (event) {
            const button = event.target.closest('[data-notification-action]');
            if (!button) return;
            const id = button.dataset.notificationId;
            const action = button.dataset.notificationAction;
            if (!id) return;

            const encodedId = encodeURIComponent(id);
            const path = '/api/resident/notifications/' + encodedId;
            if (action === 'read') {
                updateNotification(path + '/read');
            } else if (action === 'delete') {
                updateNotification(path + '/delete');
            }
        });
    }

    const markAllReadButton = document.getElementById('mark-all-read');
    if (markAllReadButton) {
        markAllReadButton.addEventListener('click', function () {
            if (notifications.some(function (item) { return !item.is_read; })) {
                updateNotification('/api/resident/notifications/read-all');
            }
        });
    }

    const deleteAllButton = document.getElementById('delete-all-notifications');
    if (deleteAllButton) {
        deleteAllButton.addEventListener('click', function () {
            if (notifications.length) {
                updateNotification(
                    '/api/resident/notifications/delete-all',
                    'Delete all your notifications? This cannot be undone.'
                );
            }
        });
    }

    document.addEventListener('click', function (event) {
        const notificationWrap = document.querySelector('.notification-wrap');
        if (
            notificationPanel &&
            notificationToggle &&
            notificationWrap &&
            !notificationPanel.hidden &&
            !notificationWrap.contains(event.target)
        ) {
            notificationPanel.hidden = true;
            notificationToggle.setAttribute('aria-expanded', 'false');
        }
    });

    function showPage(pageId) {
        const section = document.getElementById(pageId);
        if (!section) return;

        document.querySelectorAll('.page-section').forEach(function (item) {
            item.classList.remove('active');
        });

        document.querySelectorAll('.nav-item[data-page]').forEach(function (item) {
            const isSelected = item.dataset.page === pageId;
            item.classList.toggle('active', isSelected);
            if (isSelected) {
                item.setAttribute('aria-current', 'page');
            } else {
                item.removeAttribute('aria-current');
            }
        });

        section.classList.add('active');
        setSidebarOpen(false);

        if (window.location.hash !== '#' + pageId) {
            window.history.replaceState(null, '', '#' + pageId);
        }

        const titles = {
            home: 'Home',
            report: 'Submit a Report',
            'my-reports': 'My Reports'
        };

        const pageTitle = document.getElementById('page-title');
        if (pageTitle) {
            pageTitle.textContent = titles[pageId] || 'BasuReport';
        }

        window.scrollTo({ top: 0, behavior: 'smooth' });
    }

    window.showPage = showPage;

    function showPageFromHash() {
        const pageId = window.location.hash.replace('#', '');
        if (['home', 'report', 'my-reports'].includes(pageId)) {
            showPage(pageId);
        }
    }

    document.querySelectorAll('.nav-item[data-page]').forEach(function (item) {
        item.addEventListener('click', function (event) {
            event.preventDefault();
            showPage(this.dataset.page);
        });
    });

    window.addEventListener('hashchange', showPageFromHash);

    function closeEditReport() {
        if (!editReportModal) return;
        editReportModal.classList.remove('open');
        document.body.style.overflow = '';
    }

    function openEditReport(button) {
        const card = button.closest('.report-card');
        if (!card || card.dataset.status !== 'pending') return;

        editReportForm.dataset.reportId = button.dataset.reportId;
        editReportForm.elements.fullname.value = card.dataset.reportName || '';
        editReportForm.elements.phone.value = card.dataset.phone || '';
        editReportForm.elements.date.value = card.dataset.date || '';
        editReportForm.elements.time.value =
            (card.dataset.time || '').slice(0, 5);
        editReportForm.elements.sitio.value = card.dataset.location || '';
        editReportForm.elements.description.value = card.dataset.description || '';
        editReportForm.elements.priority.value = card.dataset.priority || 'Normal';
        editReportForm.elements['garbage-image'].value = '';
        document.getElementById('edit-report-feedback').textContent = '';
        editReportModal.classList.add('open');
        document.body.style.overflow = 'hidden';
        document.getElementById('edit-fullname').focus();
    }

    document.getElementById('close-edit-report')
        .addEventListener('click', closeEditReport);
    document.getElementById('cancel-edit-report')
        .addEventListener('click', closeEditReport);
    editReportModal.addEventListener('click', function (event) {
        if (event.target === editReportModal) closeEditReport();
    });

    document.getElementById('reports-list').addEventListener('click', function (event) {
        const button = event.target.closest('.resident-report-edit-btn');
        if (button) openEditReport(button);
    });

    editReportForm.addEventListener('submit', async function (event) {
        event.preventDefault();
        const reportId = editReportForm.dataset.reportId;
        if (!reportId) return;

        const submitButton = document.getElementById('save-edit-report');
        const feedback = document.getElementById('edit-report-feedback');
        submitButton.disabled = true;
        submitButton.textContent = 'Saving...';
        feedback.textContent = '';
        feedback.classList.remove('is-error');

        try {
            const response = await fetch(
                '/api/resident/reports/' + encodeURIComponent(reportId) + '/edit',
                {
                    method: 'POST',
                    body: new FormData(editReportForm)
                }
            );
            const data = await response.json();
            if (!response.ok || !data.success) {
                throw new Error(data.message || 'Could not update your report.');
            }

            const toast = JSON.stringify({
                message: data.message || 'Report updated successfully.',
                label: 'REPORT UPDATED'
            });
            try {
                sessionStorage.setItem('basuReportResidentToast', toast);
            } catch (error) {
                console.warn('Unable to persist report update notification:', error);
            }
            window.history.replaceState(
                null,
                '',
                window.location.pathname + window.location.search + '#my-reports'
            );
            window.location.reload();
        } catch (error) {
            feedback.textContent =
                error.message || 'Could not update your report.';
            feedback.classList.add('is-error');
            showResidentToast(
                feedback.textContent,
                'error',
                'REPORT UPDATE FAILED'
            );
        } finally {
            submitButton.disabled = false;
            submitButton.textContent = 'Save Changes';
        }
    });

    const announcementHistoryToggle = document.getElementById(
        'announcementHistoryToggle'
    );
    const announcementHistory = document.getElementById(
        'residentAnnouncementHistory'
    );
    if (announcementHistoryToggle && announcementHistory) {
        announcementHistory.hidden = true;
        announcementHistoryToggle.type = 'button';
        announcementHistoryToggle.setAttribute(
            'aria-controls',
            'residentAnnouncementHistory'
        );
        updateAnnouncementHistoryToggle();
        announcementHistoryToggle.addEventListener('click', function () {
            announcementHistory.hidden = !announcementHistory.hidden;
            if (announcementHistory.hidden) {
                announcementHistoryVisible = HISTORY_PAGE_SIZE;
                renderAnnouncementHistory(
                    announcementHistory,
                    announcementHistoryItems
                );
            }
            updateAnnouncementHistoryToggle();
        });
    }

    if (imageInput) {
        imageInput.addEventListener('change', function () {
            const file = this.files && this.files[0];

            if (!file) {
                imagePreview.style.display = 'none';
                uploadPlaceholder.style.display = 'block';
                imagePreview.removeAttribute('src');
                return;
            }

            if (!file.type.startsWith('image/')) {
                alert('Please select an image file.');
                this.value = '';
                return;
            }

            const reader = new FileReader();

            reader.onload = function (event) {
                imagePreview.src = event.target.result;
                imagePreview.style.display = 'block';
                uploadPlaceholder.style.display = 'none';
            };

            reader.readAsDataURL(file);
        });
    }

    if (dateInput && !dateInput.value) {
        const now = new Date();
        const localDate = new Date(
            now.getTime() - now.getTimezoneOffset() * 60000
        ).toISOString().slice(0, 10);

        dateInput.value = localDate;
        if (timeInput) {
            timeInput.value = now.toTimeString().slice(0, 5);
        }
    }

    function filterReports() {
        if (!reportSearch || !statusFilter) return;

        const query = reportSearch.value.trim().toLowerCase();
        const selectedStatus = statusFilter.value;
        const cards = Array.from(document.querySelectorAll('.report-card'));

        let visibleCount = 0;

        cards.forEach(function (card) {
            const searchableText = [
                card.dataset.reportId,
                card.dataset.location,
                card.dataset.description,
                card.dataset.date,
                card.dataset.time
            ].join(' ').toLowerCase();

            const reportStatus = (card.dataset.status || '').toLowerCase();
            let statusMatches = selectedStatus === 'all';

            if (selectedStatus === 'pending') {
                statusMatches = reportStatus === 'pending';
            } else if (selectedStatus === 'accepted') {
                statusMatches = reportStatus === 'accepted';
            } else if (selectedStatus === 'progress') {
                statusMatches = ['in progress', 'in-progress', 'processing'].includes(reportStatus);
            } else if (selectedStatus === 'completed') {
                statusMatches = ['completed', 'resolved'].includes(reportStatus);
            } else if (selectedStatus === 'rejected') {
                statusMatches = reportStatus === 'rejected';
            }

            const searchMatches = searchableText.includes(query);
            const visible = statusMatches && searchMatches;

            card.style.display = visible ? '' : 'none';

            if (visible) visibleCount++;
        });

        const noReports = document.getElementById('no-reports');
        const noMatches = document.getElementById('no-matches');

        if (noReports) {
            noReports.style.display = cards.length === 0 ? '' : 'none';
        }

        if (noMatches) {
            noMatches.style.display = cards.length > 0 && visibleCount === 0 ? '' : 'none';
        }
    }

    if (reportSearch) {
        reportSearch.addEventListener('input', filterReports);
    }

    if (statusFilter) {
        statusFilter.addEventListener('change', function () {
            document.querySelectorAll('[data-report-filter]').forEach(
                function (button) {
                    const selected = button.dataset.reportFilter === statusFilter.value;
                    button.classList.toggle('is-active', selected);
                    button.setAttribute('aria-pressed', String(selected));
                }
            );
            filterReports();
        });
    }

    document.querySelectorAll('[data-report-filter]').forEach(function (button) {
        button.addEventListener('click', function () {
            if (!statusFilter) return;
            statusFilter.value = button.dataset.reportFilter;
            document.querySelectorAll('[data-report-filter]').forEach(
                function (item) {
                    const selected = item === button;
                    item.classList.toggle('is-active', selected);
                    item.setAttribute('aria-pressed', String(selected));
                }
            );
            filterReports();
        });
    });

    window.clearReportFilters = function () {
        if (reportSearch) reportSearch.value = '';
        if (statusFilter) statusFilter.value = 'all';
        document.querySelectorAll('[data-report-filter]').forEach(
            function (button) {
                const selected = button.dataset.reportFilter === 'all';
                button.classList.toggle('is-active', selected);
                button.setAttribute('aria-pressed', String(selected));
            }
        );
        filterReports();
    };

    window.openReportDetails = function (button) {
        const card = button.closest('.report-card');
        if (!card) return;

        const reportId = card.dataset.reportId || '—';
        const location = card.dataset.location || 'Not provided';
        const description = card.dataset.description || 'No description provided.';
        const date = card.dataset.date || 'Not available';
        const time = card.dataset.time || 'Not available';
        const residentName = card.dataset.reportName || 'Resident';
        const rawStatus = (card.dataset.status || 'pending').toLowerCase();
        const photoUrl = card.dataset.image || '';

        const modalTitle = document.getElementById('modal-title');
        const modalReportId = document.getElementById('modal-report-id');
        const modalId = document.getElementById('modal-id');
        const modalName = document.getElementById('modal-name');
        const modalLocation = document.getElementById('modal-location');
        const modalDate = document.getElementById('modal-date');
        const modalTime = document.getElementById('modal-time');
        const modalDescription = document.getElementById('modal-description');
        const modalStatus = document.getElementById('modal-status');
        const modalPhoto = document.getElementById('modal-photo');

        if (modalTitle) modalTitle.textContent = location || 'Report Details';
        if (modalReportId) modalReportId.textContent = 'Report #' + reportId;
        if (modalId) modalId.textContent = reportId;
        if (modalName) modalName.textContent = residentName;
        if (modalLocation) modalLocation.textContent = location;
        if (modalDate) modalDate.textContent = date;
        if (modalTime) modalTime.textContent = time;
        if (modalDescription) modalDescription.textContent = description;

        let statusLabel = rawStatus;

        if (rawStatus === 'pending') {
            statusLabel = 'Pending';
        } else if (rawStatus === 'accepted') {
            statusLabel = 'Accepted';
        } else if (['in progress', 'in-progress', 'processing'].includes(rawStatus)) {
            statusLabel = 'In Progress';
        } else if (['completed', 'resolved'].includes(rawStatus)) {
            statusLabel = 'Completed';
        } else if (rawStatus === 'rejected') {
            statusLabel = 'Rejected';
        }

        if (modalStatus) modalStatus.textContent = statusLabel;

        if (photoUrl) {
            modalPhoto.src = photoUrl;
            modalPhoto.style.display = 'block';
            modalPhoto.onerror = function () {
                this.style.display = 'none';
            };
        } else {
            modalPhoto.removeAttribute('src');
            modalPhoto.style.display = 'none';
        }

        if (reportModal) {
            reportModal.classList.add('open');
            document.body.style.overflow = 'hidden';
        }

        const closeButton = document.querySelector('.modal-close');
        if (closeButton) closeButton.focus();
    };

    window.closeReportDetails = function () {
        if (reportModal) {
            reportModal.classList.remove('open');
        }
        document.body.style.overflow = '';
    };

    window.closeModalFromBackdrop = function (event) {
        if (event.target.id === 'report-modal') {
            closeReportDetails();
        }
    };

    document.addEventListener('click', async function (event) {
        const deleteButton = event.target.closest('.resident-report-delete-btn');
        const restoreButton = event.target.closest('.resident-restore-report-btn');
        const permanentDeleteButton = event.target.closest(
            '.resident-permanent-delete-report-btn'
        );
        const button = deleteButton || restoreButton || permanentDeleteButton;
        if (!button || !button.dataset.reportId) return;
        const restoring = Boolean(restoreButton);
        const permanentlyDeleting = Boolean(permanentDeleteButton);
        const confirmMessage = permanentlyDeleting
            ? 'Permanently delete this report and its photos? This cannot be undone.'
            : 'Move this report to Recently Deleted? You can restore it later.';
        if (!restoring && !window.confirm(confirmMessage)) return;

        button.disabled = true;
        try {
            const response = await fetch(
                '/api/resident/reports/' +
                    encodeURIComponent(button.dataset.reportId) +
                    (permanentlyDeleting
                        ? '/permanent-delete'
                        : restoring ? '/restore' : '/delete'),
                { method: 'POST' }
            );
            const data = await response.json();
            if (!response.ok || !data.success) {
                throw new Error(data.message || 'Could not update this report.');
            }
            const actionMessage = permanentlyDeleting
                ? 'Report permanently deleted.'
                : restoring
                    ? 'Report restored from Recently Deleted.'
                    : 'Report moved to Recently Deleted.';
            const actionLabel = permanentlyDeleting
                ? 'REPORT PERMANENTLY DELETED'
                : restoring ? 'REPORT RESTORED' : 'REPORT DELETED';
            try {
                sessionStorage.setItem('basuReportResidentToast', JSON.stringify({
                    message: actionMessage,
                    label: actionLabel
                }));
                window.history.replaceState(
                    null,
                    '',
                    window.location.pathname + window.location.search + '#my-reports'
                );
                window.location.reload();
            } catch (error) {
                console.warn('Unable to persist action notification:', error);
                showResidentToast(actionMessage, 'success', actionLabel);
                window.history.replaceState(
                    null,
                    '',
                    window.location.pathname + window.location.search + '#my-reports'
                );
                window.setTimeout(function () {
                    window.location.reload();
                }, 5000);
            }
        } catch (error) {
            button.disabled = false;
            showResidentToast(
                error.message || 'Could not update this report.',
                'error',
                'ACTION FAILED'
            );
        }
    });

    document.addEventListener('keydown', function (event) {
        if (event.key === 'Escape') {
            closeReportDetails();
            closeEditReport();
            if (
                notificationPanel &&
                notificationToggle &&
                !notificationPanel.hidden
            ) {
                notificationPanel.hidden = true;
                notificationToggle.setAttribute('aria-expanded', 'false');
                notificationToggle.focus();
            }
            setSidebarOpen(false);
        }
    });

    (function initializeDashboard() {
        showPageFromHash();
        loadNotifications();
        refreshAnnouncements();
        refreshDeletedReports();
        window.setInterval(refreshDeletedReports, 30000);
        window.setInterval(refreshAnnouncements, 60000);
        sendPresenceHeartbeat();
        window.setInterval(sendPresenceHeartbeat, 30000);
        document.addEventListener('visibilitychange', function () {
            if (document.visibilityState === 'visible') {
                sendPresenceHeartbeat();
            }
        });

        const cards = Array.from(document.querySelectorAll('.report-card'));

        let pending = 0;
        let inProgress = 0;
        let completed = 0;

        cards.forEach(function (card) {
            const status = (card.dataset.status || '').toLowerCase();

            if (status === 'pending') {
                pending++;
            } else if (['in progress', 'in-progress', 'processing'].includes(status)) {
                inProgress++;
            } else if (['completed', 'resolved'].includes(status)) {
                completed++;
            }
        });

        const totalCount = document.getElementById('total-count');
        const pendingCount = document.getElementById('pending-count');
        const progressCount = document.getElementById('progress-count');
        const completedCount = document.getElementById('completed-count');

        if (totalCount) totalCount.textContent = cards.length;
        if (pendingCount) pendingCount.textContent = pending;
        if (progressCount) progressCount.textContent = inProgress;
        if (completedCount) completedCount.textContent = completed;

        filterReports();

        const pageId = window.location.hash.replace('#', '');
        if (['home', 'report', 'my-reports'].includes(pageId)) {
            showPage(pageId);
        }
    })();
});
