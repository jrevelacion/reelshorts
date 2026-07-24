/**
 * Deferred ad loader — keep third-party scripts off the critical path.
 * Banner only on browse pages; both tags load after first paint.
 */
(function () {
    const INVOKE_SRC =
        "https://pl30229561.effectivecpmnetwork.com/326eb78513fdc5617b930dd03c439928/invoke.js";
    const POP_SRC =
        "https://pl30229562.effectivecpmnetwork.com/2a/13/76/2a1376854878dcc5819c81491af89260.js";

    let started = false;

    function isVideoPage() {
        const body = document.body;
        return (
            body.classList.contains("reels-mode") ||
            body.classList.contains("discover-mode")
        );
    }

    function inject(src) {
        const el = document.createElement("script");
        el.src = src;
        el.async = true;
        el.setAttribute("data-cfasync", "false");
        document.body.appendChild(el);
    }

    function loadAds() {
        if (started) return;
        started = true;
        if (!isVideoPage()) {
            const slot = document.getElementById("fs-ad-slot");
            if (slot) {
                slot.hidden = false;
                slot.removeAttribute("aria-hidden");
            }
            inject(INVOKE_SRC);
        }
        // Pop/secondary tag — delay so it never blocks first paint / playback.
        window.setTimeout(function () {
            inject(POP_SRC);
        }, isVideoPage() ? 4000 : 1500);
    }

    function schedule() {
        if ("requestIdleCallback" in window) {
            requestIdleCallback(loadAds, { timeout: 2500 });
        } else {
            window.setTimeout(loadAds, 600);
        }
    }

    if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", schedule, { once: true });
    } else {
        schedule();
    }
})();
