(function (global) {
    const NAV_KEY = "fs-nav";
    const BOOT_CLASS = "fs-boot-loading";
    const MIN_SHOW_MS = 80;
    const STUCK_MS = 2500;

    let holds = 0;
    let shownAt = 0;
    let visible = false;
    let bootDismissed = false;
    let hideTimer = null;

    function loaderEl() {
        return document.getElementById("page-loader");
    }

    function isDiscoverPage() {
        return document.body.classList.contains("discover-mode");
    }

    function isWatchPage() {
        return document.body.classList.contains("reels-mode") && !isDiscoverPage();
    }

    function isLoaderActive() {
        const loader = loaderEl();
        return (
            visible ||
            (loader && !loader.classList.contains("is-done")) ||
            document.body.classList.contains("is-loading")
        );
    }

    function paintLoader({ force = false } = {}) {
        if (bootDismissed && !force) return;

        const loader = loaderEl();
        if (!loader) return;

        bootDismissed = false;
        visible = true;
        shownAt = Date.now();
        loader.classList.remove("is-done");
        loader.removeAttribute("aria-hidden");
        document.documentElement.classList.add(BOOT_CLASS);
        document.body.classList.remove("is-ready");
        document.body.classList.add("is-loading");
    }

    function releaseNav() {
        try {
            sessionStorage.removeItem(NAV_KEY);
        } catch (_) {
            /* ignore */
        }
        document.documentElement.classList.remove("fs-nav-pending");
    }

    function paintHide() {
        const loader = loaderEl();
        visible = false;
        bootDismissed = true;
        clearTimeout(hideTimer);
        hideTimer = null;

        if (loader) {
            loader.classList.add("is-done");
            loader.setAttribute("aria-hidden", "true");
        }
        document.body.classList.remove("is-loading");
        document.body.classList.add("is-ready");
        document.documentElement.classList.remove(BOOT_CLASS);
        releaseNav();
    }

    function show() {
        holds += 1;
        paintLoader({ force: true });
    }

    function hide() {
        holds = Math.max(0, holds - 1);
        if (holds > 0) return;

        clearTimeout(hideTimer);

        if (!isLoaderActive()) {
            releaseNav();
            return;
        }

        if (bootDismissed) {
            releaseNav();
            return;
        }

        const elapsed = shownAt ? Date.now() - shownAt : MIN_SHOW_MS;
        const wait = Math.max(0, MIN_SHOW_MS - elapsed);

        hideTimer = setTimeout(() => {
            hideTimer = null;
            if (holds > 0) return;
            requestAnimationFrame(() => paintHide());
        }, wait);
    }

    function markNavigation() {
        bootDismissed = false;
        try {
            sessionStorage.setItem(NAV_KEY, "1");
        } catch (_) {
            /* ignore */
        }
        document.documentElement.classList.add("fs-nav-pending");
    }

    function shouldHandleLink(anchor, event) {
        if (!anchor || !anchor.href) return false;
        if (anchor.target === "_blank" || anchor.hasAttribute("download")) return false;
        if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return false;
        if (anchor.origin !== location.origin) return false;
        if (anchor.pathname === location.pathname && anchor.search === location.search) return false;
        return true;
    }

    function wireNavigation() {
        document.addEventListener("click", (event) => {
            const anchor = event.target.closest("a[href]");
            if (!shouldHandleLink(anchor, event)) return;
            markNavigation();
            paintLoader({ force: true });
        });

        document.addEventListener("submit", (event) => {
            const form = event.target;
            if (!form || form.target === "_blank") return;
            if ((form.method || "get").toLowerCase() !== "get") return;
            markNavigation();
            paintLoader({ force: true });
        });

        window.addEventListener("pageshow", (event) => {
            if (!event.persisted) return;
            holds = 0;
            clearTimeout(hideTimer);
            paintHide();
        });
    }

    function pageManagesBoot() {
        if (isWatchPage()) return true;
        if (document.getElementById("search-root")) return true;
        if (document.getElementById("show-root")?.dataset.pendingEpisodes === "1") return true;
        if (isDiscoverPage() || document.getElementById("discover-feed")) return true;
        return false;
    }

    function bootPage() {
        if (document.body.classList.contains("not-found-mode")) {
            paintHide();
            return;
        }

        holds = 1;
        visible = true;
        shownAt = Date.now();

        if (pageManagesBoot()) {
            // Don't hold the full-screen loader for long — show the page shell
            // while watch/discover finish attaching media.
            setTimeout(() => {
                if (isLoaderActive() && holds > 0) {
                    hide();
                }
            }, 1200);
            return;
        }

        const finish = () => hide();

        // Home / browse: dismiss as soon as DOM is ready (content is already in HTML).
        if (document.readyState === "loading") {
            document.addEventListener("DOMContentLoaded", finish, { once: true });
        } else {
            finish();
        }

        // Failsafe — never leave the splash up.
        setTimeout(() => {
            if (isLoaderActive() && holds > 0) {
                hide();
            }
        }, STUCK_MS);
    }

    global.FSLoader = { show, hide, bootPage, wireNavigation, markNavigation };
})(window);
