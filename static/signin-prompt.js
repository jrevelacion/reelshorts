(function () {
    const DISMISS_PREFIX = "fs-signin-dismiss-";

    const COPY = {
        afterEpisode: "Sign in to save your spot on every device.",
        myList: "Sign in to keep this list forever.",
        continueWatching: "This device only — sign in to sync.",
    };

    function isLoggedIn() {
        return document.body.classList.contains("is-logged-in");
    }

    function loginUrl(next) {
        const target = next || window.location.pathname + window.location.search;
        return `/login?next=${encodeURIComponent(target)}`;
    }

    function isDismissed(id) {
        try {
            return sessionStorage.getItem(DISMISS_PREFIX + id) === "1";
        } catch (_) {
            return false;
        }
    }

    function dismiss(id) {
        try {
            sessionStorage.setItem(DISMISS_PREFIX + id, "1");
        } catch (_) {
            /* ignore */
        }
    }

    function ensureRoot() {
        let root = document.getElementById("fs-signin-prompt-root");
        if (root) return root;
        root = document.createElement("div");
        root.id = "fs-signin-prompt-root";
        root.setAttribute("aria-live", "polite");
        document.body.appendChild(root);
        return root;
    }

    function hidePrompt() {
        const root = document.getElementById("fs-signin-prompt-root");
        if (!root) return;
        const card = root.querySelector(".fs-signin-prompt");
        if (!card) {
            root.innerHTML = "";
            return;
        }
        card.classList.remove("is-visible");
        card.classList.add("is-hiding");
        setTimeout(() => {
            root.innerHTML = "";
        }, 320);
    }

    function show(options) {
        if (isLoggedIn()) return false;

        const id = options.id || "default";
        if (options.respectDismiss !== false && isDismissed(id)) return false;

        const message = options.message || COPY[id] || "";
        if (!message) return false;

        const root = ensureRoot();
        root.innerHTML = "";

        const card = document.createElement("aside");
        card.className = "fs-signin-prompt";
        card.setAttribute("role", "dialog");
        card.setAttribute("aria-label", "Sign in");

        const icon = `
            <span class="fs-signin-prompt__icon" aria-hidden="true">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round">
                    <rect x="5" y="2" width="14" height="20" rx="2"/>
                    <path d="M12 18h.01"/>
                    <path d="M9 6h6"/>
                    <path d="M16 10l-3 3-2-2-3 3"/>
                </svg>
            </span>
        `;

        card.innerHTML = `
            <button type="button" class="fs-signin-prompt__close" aria-label="Dismiss">×</button>
            ${icon}
            <p class="fs-signin-prompt__text">${message}</p>
            <div class="fs-signin-prompt__actions">
                <a class="fs-signin-prompt__cta btn-primary" href="${loginUrl(options.next)}">Sign in</a>
                <button type="button" class="fs-signin-prompt__later">Not now</button>
            </div>
        `;

        root.appendChild(card);

        card.querySelector(".fs-signin-prompt__close").addEventListener("click", () => {
            dismiss(id);
            hidePrompt();
        });
        card.querySelector(".fs-signin-prompt__later").addEventListener("click", () => {
            dismiss(id);
            hidePrompt();
        });

        requestAnimationFrame(() => {
            requestAnimationFrame(() => {
                card.classList.add("is-visible");
            });
        });

        return true;
    }

    function afterEpisode(bookId) {
        const id = bookId ? `afterEpisode-${bookId}` : "afterEpisode";
        return show({ id, message: COPY.afterEpisode });
    }

    function myList() {
        return show({ id: "myList", message: COPY.myList, respectDismiss: false });
    }

    window.FSSignInPrompt = {
        show,
        hide: hidePrompt,
        afterEpisode,
        myList,
        copy: COPY,
        loginUrl,
        isLoggedIn,
    };
})();
