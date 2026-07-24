(function () {
    function ping() {
        fetch("/api/analytics/ping", {
            method: "POST",
            credentials: "same-origin",
        }).catch(function () {});
    }

    function track(event, data) {
        data = data || {};
        fetch("/api/analytics/event", {
            method: "POST",
            credentials: "same-origin",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                event: event,
                bookId: data.bookId || data.book_id || null,
                episode: data.episode != null ? data.episode : null,
            }),
        }).catch(function () {});
    }

    window.FSAnalytics = { ping: ping, track: track };

    if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", ping);
    } else {
        ping();
    }
})();
