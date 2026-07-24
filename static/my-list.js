(function () {
    const LIST_BTN_HTML = `
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#f4f1f7" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M12 5v14M5 12h14"/></svg>
        My List
    `;
    const IN_LIST_BTN_HTML = `
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12l5 5L20 7"/></svg>
        In My List
    `;

    function loginUrl() {
        const next = window.location.pathname + window.location.search;
        return `/login?next=${encodeURIComponent(next)}`;
    }

    function applyButtonState(btn, inList) {
        if (!btn) return;
        btn.classList.toggle("is-in-list", inList);
        btn.setAttribute("aria-pressed", inList ? "true" : "false");
        btn.innerHTML = inList ? IN_LIST_BTN_HTML : LIST_BTN_HTML;
    }

    function syncHeroSlide(bookId, inList) {
        if (!bookId) return;
        document.querySelectorAll(".featured-slide").forEach((slide) => {
            if (slide.dataset.bookId !== bookId) return;
            slide.dataset.inList = inList ? "1" : "0";
        });
    }

    function syncAllButtons(bookId, inList) {
        if (!bookId) return;
        document.querySelectorAll("[data-my-list]").forEach((btn) => {
            if (btn.dataset.myList !== bookId) return;
            applyButtonState(btn, inList);
        });
        syncHeroSlide(bookId, inList);
    }

    async function toggleMyList(bookId) {
        if (!bookId) return;

        if (!document.body.classList.contains("is-logged-in")) {
            window.FSSignInPrompt?.myList();
            return;
        }

        const buttons = [...document.querySelectorAll(`[data-my-list="${bookId}"]`)];
        buttons.forEach((btn) => {
            btn.disabled = true;
        });

        try {
            const response = await fetch(`/api/my-list/${bookId}`, {
                method: "POST",
                credentials: "same-origin",
            });
            const data = await response.json().catch(() => ({}));

            if (response.status === 401) {
                window.location.href = loginUrl();
                return;
            }
            if (!response.ok) {
                throw new Error(data.message || "Could not update My List.");
            }

            syncAllButtons(bookId, Boolean(data.in_list));
        } catch (_) {
            /* keep current state */
        } finally {
            buttons.forEach((btn) => {
                btn.disabled = false;
            });
        }
    }

    document.addEventListener("click", (event) => {
        const btn = event.target.closest("[data-my-list]");
        if (!btn || btn.tagName !== "BUTTON") return;
        event.preventDefault();
        event.stopPropagation();
        toggleMyList(btn.dataset.myList);
    });

    window.FSMyList = {
        applyButtonState,
        syncAllButtons,
    };
})();
