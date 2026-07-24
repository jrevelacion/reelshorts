(function () {
    const PREFIX = "freeshort-watch-";
    const HOME_LIMIT = 6;
    const BOOK_ID_RE = /^[a-f0-9]{24}$/i;

    function isValidBookId(bookId) {
        return BOOK_ID_RE.test(String(bookId || ""));
    }

    function escapeHtml(s) {
        return String(s)
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/"/g, "&quot;");
    }

    function readLocalProgress() {
        const rows = [];
        try {
            for (let i = 0; i < localStorage.length; i += 1) {
                const key = localStorage.key(i);
                if (!key || !key.startsWith(PREFIX)) continue;
                const bookId = key.slice(PREFIX.length);
                if (!isValidBookId(bookId)) {
                    localStorage.removeItem(key);
                    continue;
                }
                let data;
                try {
                    data = JSON.parse(localStorage.getItem(key) || "");
                } catch (_) {
                    continue;
                }
                const episode = parseInt(data?.episode, 10);
                const pct = parseInt(data?.pct, 10);
                const at = parseInt(data?.at, 10) || 0;
                if (!Number.isFinite(episode) || !Number.isFinite(pct) || pct <= 0 || pct >= 98) {
                    continue;
                }
                rows.push({ book_id: bookId, episode, pct, at });
            }
        } catch (_) {
            return [];
        }
        rows.sort((a, b) => (b.at || 0) - (a.at || 0));
        return rows;
    }

    async function resolveProgressRows(rows, limit) {
        if (!rows.length) return [];
        const response = await fetch("/api/continue-watching", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            credentials: "same-origin",
            body: JSON.stringify({ items: rows, limit }),
        });
        if (!response.ok) return [];
        const data = await response.json();
        return data.items || [];
    }

    async function fetchAccountProgress() {
        const response = await fetch("/api/continue-watching", {
            credentials: "same-origin",
        });
        if (!response.ok) return [];
        const data = await response.json();
        return data.items || [];
    }

    async function loadContinueItems(limit) {
        const isLoggedIn = document.body.classList.contains("is-logged-in");
        if (isLoggedIn) {
            const accountItems = await fetchAccountProgress();
            if (accountItems.length) return accountItems;
        }
        return resolveProgressRows(readLocalProgress(), limit);
    }

    function posterMarkup(book) {
        if (book.poster_url) {
            return `<img src="${escapeHtml(book.poster_url)}" alt="${escapeHtml(book.title || "")}" loading="lazy">`;
        }
        if (book.thumbnail) {
            return `<img src="${escapeHtml(book.thumbnail)}" alt="${escapeHtml(book.title || "")}" loading="lazy">`;
        }
        const grad =
            book.card_gradient ||
            "radial-gradient(115% 90% at 50% 6%, #5e1d3a 0%, #220f1a 52%, #0c0a0f 100%)";
        return `<div class="card-v2__placeholder" style="background:${grad}"></div>`;
    }

    function continueCardHtml(book) {
        const watchUrl =
            book.watch_url ||
            `/watch/${book.book_id}/${book.resume_episode || 1}`;
        const genreTag = book.genre_tag || "DRAMA";
        const genreLine = book.genre_line || "Drama";
        const pct = Number(book.resume_pct) || 0;

        return `
            <div role="listitem">
                <a class="card-v2" href="${escapeHtml(watchUrl)}" data-book-id="${escapeHtml(book.book_id)}">
                    <div class="card-v2__media">
                        ${posterMarkup(book)}
                        <div class="card-v2__grad"></div>
                        <span class="card-v2__tag">${escapeHtml(genreTag)}</span>
                        <h3 class="card-v2__title">${escapeHtml(book.title || "")}</h3>
                        <div class="card-v2__progress" aria-hidden="true"><i style="width:${pct}%"></i></div>
                    </div>
                    <div class="card-v2__meta">
                        <span class="card-v2__label">${escapeHtml(genreLine)}</span>
                        <span class="card-v2__stat">${pct}%</span>
                    </div>
                </a>
            </div>
        `;
    }

    function sectionSubtitleHtml(isLoggedIn) {
        if (isLoggedIn) {
            return `<p class="section-subtitle">Pick up where you left off on your account</p>`;
        }
        const next = encodeURIComponent(window.location.pathname + window.location.search);
        return `<p class="section-subtitle">This device only — <a class="section-signin-link" href="/login?next=${next}">Sign in to sync</a></p>`;
    }

    function sectionHtml(books, opts) {
        const limit = opts.limit || HOME_LIMIT;
        const display = books.slice(0, limit);
        if (!display.length) return "";

        const isLoggedIn = document.body.classList.contains("is-logged-in");
        const viewAll = books.length
            ? `<a class="section-view-all" href="/continue-watching">View all →</a>`
            : "";

        return `
            <section class="content-section content-section--continue" data-section-id="continue_watching">
                <div class="shell section-head">
                    <div>
                        <h2 class="section-title">Continue watching</h2>
                        ${sectionSubtitleHtml(isLoggedIn)}
                    </div>
                    ${viewAll}
                </div>
                <div class="shell card-grid" role="list">
                    ${display.map(continueCardHtml).join("")}
                </div>
            </section>
        `;
    }

    async function mountHomeContinue() {
        const root = document.getElementById("continue-watching-root");
        if (!root || root.querySelector('[data-section-id="continue_watching"]')) return;

        const items = await loadContinueItems(HOME_LIMIT);
        if (!items.length) return;
        root.innerHTML = sectionHtml(items, { limit: HOME_LIMIT });
    }

    async function mountContinuePage() {
        const grid = document.getElementById("continue-watching-page-grid");
        const empty = document.getElementById("continue-watching-empty");
        if (!grid) return;
        if (grid.querySelector(".card-v2:not(.card-v2--skeleton)")) return;

        const items = await loadContinueItems(24);
        if (!items.length) {
            if (empty) empty.hidden = false;
            return;
        }
        grid.innerHTML = items.map(continueCardHtml).join("");
        if (empty) empty.hidden = true;
    }

    function init() {
        mountHomeContinue();
        mountContinuePage();
    }

    window.FSContinueWatching = {
        readLocalProgress,
        loadContinueItems,
        mountHomeContinue,
        mountContinuePage,
    };

    if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", init);
    } else {
        init();
    }

    window.addEventListener("freeshort:progress-synced", () => {
        mountHomeContinue();
        mountContinuePage();
    });
})();
