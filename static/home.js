(function () {
    const root = document.getElementById("home-sections");
    if (!root) return;

    const HOME_GRID_LIMIT = 6;
    const GRADIENTS = [
        "radial-gradient(115% 90% at 30% 8%, #7a1f2e 0%, #2a0f15 52%, #0c0a0f 100%)",
        "radial-gradient(115% 90% at 60% 6%, #4a2470 0%, #1c1230 52%, #0c0a0f 100%)",
        "radial-gradient(115% 90% at 40% 6%, #154a52 0%, #0f1f24 52%, #0c0a0f 100%)",
        "radial-gradient(115% 90% at 50% 6%, #7a2450 0%, #2a1020 52%, #0c0a0f 100%)",
        "radial-gradient(115% 90% at 55% 6%, #6e3e1a 0%, #241710 52%, #0c0a0f 100%)",
        "radial-gradient(115% 90% at 35% 6%, #2a2f6e 0%, #131630 52%, #0c0a0f 100%)",
    ];

    const GENRE_KEYWORDS = [
        ["werewolf", "Werewolf"], ["luna", "Werewolf"], ["alpha", "Werewolf"],
        ["billionaire", "Billionaire"], ["ceo", "Billionaire"], ["tycoon", "Billionaire"],
        ["mafia", "Mafia"], ["revenge", "Revenge"], ["reborn", "Reborn"],
        ["fantasy", "Fantasy"], ["dragon", "Fantasy"], ["thriller", "Thriller"],
        ["romance", "Romance"], ["married", "Romance"], ["love", "Romance"],
        ["family", "Family"], ["heir", "Heir"], ["comedy", "Comedy"],
    ];

    function inferGenres(title, sectionId) {
        const text = String(title || "").toLowerCase();
        const found = [];
        for (const [keyword, label] of GENRE_KEYWORDS) {
            if (text.includes(keyword) && !found.includes(label)) found.push(label);
            if (found.length >= 2) break;
        }
        if (!found.length) found.push("Drama");
        return found.slice(0, 2);
    }

    function genreLine(genres) {
        return genres.join(" · ");
    }

    function genreTag(genres) {
        return (genres[0] || "Drama").toUpperCase();
    }

    function episodeLabel(book) {
        const n = Number(book.episode_count) || 0;
        return n > 0 ? `${n} EP` : "Short series";
    }

    function cardGradient(bookId, index) {
        const key = bookId || String(index);
        let slot = 0;
        for (let i = 0; i < key.length; i++) slot += key.charCodeAt(i);
        return GRADIENTS[slot % GRADIENTS.length];
    }

    function escapeHtml(s) {
        return String(s)
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/"/g, "&quot;");
    }

    function cardHtml(book, opts) {
        const rank = opts.layout === "ranked" ? opts.rank : 0;
        const genres = book.genres || inferGenres(book.title, opts.sectionId);
        const gLine = book.genre_line || genreLine(genres);
        const gTag = book.genre_tag || genreTag(genres);
        const epLabel = book.episode_label || episodeLabel(book);
        const grad = book.card_gradient || cardGradient(book.book_id, opts.rank || 0);

        const thumb = book.thumbnail
            ? `<img src="${escapeHtml(book.thumbnail)}" alt="${escapeHtml(book.title)}" loading="lazy">`
            : `<div class="card-v2__placeholder" style="background:${grad}"></div>`;

        const badge = rank
            ? `<span class="card-v2__rank">${rank}</span>`
            : `<span class="card-v2__tag">${escapeHtml(gTag)}</span>`;

        return `
            <div role="listitem">
                <a class="card-v2" href="/show/${book.book_id}" data-book-id="${book.book_id}">
                    <div class="card-v2__media">
                        ${thumb}
                        <div class="card-v2__grad"></div>
                        ${badge}
                        <h3 class="card-v2__title">${escapeHtml(book.title)}</h3>
                    </div>
                    <div class="card-v2__meta">
                        <span class="card-v2__label">${escapeHtml(gLine)}</span>
                        <span class="card-v2__stat">${escapeHtml(epLabel)}</span>
                    </div>
                </a>
            </div>
        `;
    }

    function sectionHtml(section) {
        const loading = section.loading && (!section.books || !section.books.length);
        const books = section.books || [];
        const layout = section.layout || "standard";
        const trendingClass = section.id === "trending" ? " content-section--trending" : "";

        let grid = "";
        if (books.length) {
            let slice =
                section.id === "just_dropped" && books.length > 1 ? books.slice(1) : books;
            slice = slice.slice(0, HOME_GRID_LIMIT);
            grid = slice
                .map((book, i) =>
                    cardHtml(book, {
                        layout,
                        rank: layout === "ranked" ? i + 1 : 0,
                        sectionId: section.id,
                    })
                )
                .join("");
        } else if (loading) {
            grid = Array.from({ length: 6 })
                .map(
                    () => `
                <div class="card-v2 card-v2--skeleton" aria-hidden="true">
                    <div class="card-v2__media"></div>
                    <div class="card-v2__meta"><span></span><span></span></div>
                </div>`
                )
                .join("");
        }

        const viewAll =
            books.length && !loading
                ? `<a class="section-view-all" href="/browse/${section.id}">View all →</a>`
                : "";

        return `
            <section class="content-section${trendingClass}" data-section-id="${section.id}">
                <div class="shell section-head">
                    <div>
                        <h2 class="section-title">${escapeHtml(section.title)}</h2>
                        ${section.subtitle ? `<p class="section-subtitle">${escapeHtml(section.subtitle)}</p>` : ""}
                    </div>
                    ${viewAll}
                </div>
                <div class="shell card-grid" role="list">${grid}</div>
            </section>
        `;
    }

    function buildSectionList(data) {
        const list = [];
        const apiSections = data.sections || [];

        const trending = apiSections.find((s) => s.id === "trending");
        if (trending && trending.books && trending.books.length) {
            list.push({ ...trending, layout: "ranked" });
        }

        for (const s of apiSections) {
            if (s.id === "trending") continue;
            if (!s.books || !s.books.length) continue;
            list.push(s);
        }

        return list;
    }

    function hasRealCards() {
        return Boolean(root.querySelector(".card-v2:not(.card-v2--skeleton)"));
    }

    function renderHome(data) {
        root.innerHTML = buildSectionList(data).map(sectionHtml).join("");
        root.dataset.fetchedAt = data.fetched_at || "";
    }

    function renderEmptyState() {
        root.innerHTML = `
            <section class="content-section">
                <div class="shell section-head">
                    <div>
                        <h2 class="section-title">Nothing here yet</h2>
                        <p class="section-subtitle">We're still gathering titles — check back in a moment.</p>
                    </div>
                </div>
            </section>`;
    }

    /**
     * Fill skeleton sections on first visit. Keeps polling with backoff while the
     * server reports it's still building the library, so the page never gets stuck
     * on skeletons when the data folder is empty/missing. Never replaces content
     * that's already on screen.
     */
    async function tryFillEmptyHome() {
        if (hasRealCards()) return;

        let delay = 400;
        const maxDelay = 6000;
        const deadline = Date.now() + 3 * 60 * 1000;
        let emptyStreak = 0;

        // First fetch immediately — don't wait before checking.
        while (Date.now() < deadline) {
            if (hasRealCards()) return;

            let data = null;
            try {
                const response = await fetch("/api/home");
                if (response.ok) data = await response.json();
            } catch (_) {
                /* keep trying */
            }

            if (data) {
                const list = buildSectionList(data);
                if (list.some((section) => section.books && section.books.length)) {
                    renderHome(data);
                    return;
                }
                // Only abandon after several empty non-building responses — a
                // single race at boot used to permanently show "Nothing here yet".
                if (!data.building) {
                    emptyStreak += 1;
                    if (emptyStreak >= 4) {
                        renderEmptyState();
                        return;
                    }
                } else {
                    emptyStreak = 0;
                }
            }

            await new Promise((resolve) => setTimeout(resolve, delay));
            delay = Math.min(Math.round(delay * 1.35), maxDelay);
        }

        if (!hasRealCards()) renderEmptyState();
    }

    if (!hasRealCards()) {
        tryFillEmptyHome();
    }
})();
