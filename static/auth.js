(function () {
    const shell = document.querySelector(".auth-shell");
    if (!shell) return;

    const tabs = [...shell.querySelectorAll("[data-auth-tab]")];
    const panes = [...shell.querySelectorAll("[data-auth-pane]")];

    function setTab(name, pushUrl) {
        tabs.forEach((btn) => {
            const active = btn.dataset.authTab === name;
            btn.classList.toggle("is-active", active);
            btn.setAttribute("aria-selected", active ? "true" : "false");
        });
        panes.forEach((pane) => {
            const active = pane.dataset.authPane === name;
            pane.classList.toggle("is-active", active);
            pane.hidden = !active;
        });
        shell.dataset.authActive = name;

        if (pushUrl !== false && window.history && window.history.replaceState) {
            const url = new URL(window.location.href);
            if (name === "register") {
                url.searchParams.set("tab", "register");
            } else {
                url.searchParams.delete("tab");
            }
            window.history.replaceState(null, "", url);
        }

        const pane = panes.find((p) => p.dataset.authPane === name);
        const focusable = pane && pane.querySelector("input:not([type=hidden])");
        if (focusable && document.activeElement && shell.contains(document.activeElement)) {
            focusable.focus();
        }
    }

    tabs.forEach((btn) => {
        btn.addEventListener("click", () => setTab(btn.dataset.authTab));
    });

    const initial = shell.dataset.authActive || "login";
    setTab(initial, false);
})();
