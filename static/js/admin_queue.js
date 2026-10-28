"use strict";

/* Live Incident Queue + Cleanup Rate for the admin dashboard.
   Builds the table from the existing report cards, so it stays in
   sync with your live polling without touching admin_dashboard.js. */

document.addEventListener("DOMContentLoaded", function () {
    const grid = document.getElementById("reportsGrid");
    const body = document.getElementById("queueBody");
    if (!grid || !body) return;

    const chips = document.querySelectorAll("#queueChips .chip");
    const search = document.getElementById("queueSearch");
    const count = document.getElementById("queueCount");
    let statusFilter = "all";
    let timer = null;

    function readCards() {
        return Array.from(grid.querySelectorAll(".report-card")).map(function (card) {
            const loc = card.querySelector(".report-location");
            return {
                id: card.dataset.reportId || "",
                status: card.dataset.status || "Pending",
                urgent: card.dataset.urgent === "urgent",
                resident: (card.querySelector(".report-resident") || {}).textContent || "",
                location: loc ? loc.textContent.replace("📍", "").replace("Location:", "").trim() : "",
                duration: (card.querySelector(".duration") || {}).textContent || ""
            };
        });
    }

    function cell(text, className) {
        const td = document.createElement("td");
        if (className) td.className = className;
        td.textContent = text;
        return td;
    }

    function render() {
        const term = (search.value || "").toLowerCase().trim();
        const rows = readCards().filter(function (r) {
            if (statusFilter !== "all" && r.status !== statusFilter) return false;
            if (!term) return true;
            return (r.id + " " + r.resident + " " + r.location).toLowerCase().includes(term);
        });

        body.replaceChildren();
        count.textContent = rows.length + (rows.length === 1 ? " incident" : " incidents");

        if (!rows.length) {
            const tr = document.createElement("tr");
            const td = cell("No incidents match your filters.", "queue-empty");
            td.colSpan = 6;
            tr.appendChild(td);
            body.appendChild(tr);
            return;
        }

        rows.forEach(function (r) {
            const tr = document.createElement("tr");
            tr.appendChild(cell("#" + r.id, "queue-id"));
            tr.appendChild(cell(r.location || "-"));
            tr.appendChild(cell(r.resident || "-"));
            tr.appendChild(cell(r.urgent ? "High" : "Normal", r.urgent ? "sev-urgent" : "sev-normal"));

            const statusTd = document.createElement("td");
            const pill = document.createElement("span");
            const cls = r.status === "In Progress" ? "progress" : (r.status === "Completed" ? "completed" : "");
            pill.className = "q-pill " + cls;
            pill.textContent = r.status;
            statusTd.appendChild(pill);
            tr.appendChild(statusTd);

            const actionTd = document.createElement("td");
            const btn = document.createElement("button");
            btn.type = "button";
            btn.className = "q-btn" + (r.status === "Completed" ? " ghost" : "");
            btn.textContent = r.status === "Pending" ? "Dispatch Crew" : (r.status === "In Progress" ? "Update" : "View");
            btn.dataset.target = r.id;
            actionTd.appendChild(btn);
            tr.appendChild(actionTd);

            body.appendChild(tr);
        });
    }

    function findCard(id) {
        return Array.from(grid.querySelectorAll(".report-card"))
            .find(function (c) { return c.dataset.reportId === id; });
    }

    function goToCard(id) {
        let card = findCard(id);
        if (!card) {                       // hidden by the Manage Reports filters
            const reset = document.getElementById("resetFilters");
            if (reset) reset.click();
            setTimeout(function () { reveal(findCard(id)); }, 250);
            return;
        }
        reveal(card);
    }
    function reveal(card) {
        if (!card) return;
        card.scrollIntoView({ behavior: "smooth", block: "center" });
        card.classList.remove("flash-highlight");
        void card.offsetWidth;
        card.classList.add("flash-highlight");
    }

    body.addEventListener("click", function (e) {
        const btn = e.target.closest(".q-btn");
        if (btn) goToCard(btn.dataset.target);
    });
    chips.forEach(function (chip) {
        chip.addEventListener("click", function () {
            chips.forEach(function (c) { c.classList.remove("is-active"); });
            chip.classList.add("is-active");
            statusFilter = chip.dataset.status;
            render();
        });
    });
    search.addEventListener("input", render);

    new MutationObserver(function () {
        clearTimeout(timer);
        timer = setTimeout(render, 120);
    }).observe(grid, { childList: true });

    /* ---- Cleanup rate ---- */
    const total = document.getElementById("totalReports");
    const done = document.getElementById("completedReports");
    const rate = document.getElementById("cleanupRate");
    let rateTimer = null;
    function updateRate() {
        if (!total || !done || !rate) return;
        const t = parseInt(total.textContent, 10);
        const d = parseInt(done.textContent, 10);
        if (Number.isNaN(t) || Number.isNaN(d)) return;
        rate.textContent = t > 0 ? (Math.round((d / t) * 1000) / 10) + "%" : "0%";
    }
    [total, done].forEach(function (el) {
        if (!el) return;
        new MutationObserver(function () {
            clearTimeout(rateTimer);
            rateTimer = setTimeout(updateRate, 150);
        }).observe(el, { childList: true, characterData: true, subtree: true });
    });

    render();
});
