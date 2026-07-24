(function () {
    const root = document.getElementById("show-root");
    if (!root) return;

    const picker = document.querySelector(".ep-picker");
    const bookId = root.dataset.bookId;
    const posterUrl = root.dataset.poster || "";
    const showTitle = picker?.dataset.title || "";
    const pending = root.dataset.pendingEpisodes === "1";
    const grid = document.getElementById("ep-grid");
    const rangesEl = document.getElementById("ep-ranges");
    const statusEl = document.getElementById("show-ep-status");
    const playBtn = document.getElementById("show-play-btn");
    const continueBar = document.getElementById("ep-continue");
    const continueBtn = document.getElementById("ep-continue-btn");
    const continueMeta = document.getElementById("ep-continue-meta");
    const pickerSub = document.getElementById("ep-picker-sub");
    const watchedCountEl = document.getElementById("watched-count");
    const seasonProgress = document.getElementById("ep-season-progress");
    const seasonProgressFill = document.getElementById("ep-season-progress-fill");
    const dataEl = document.getElementById("ep-data");
    const startEpisode = parseInt(root.dataset.startEpisode, 10) || 1;
    const RANGE_SIZE = 24;

    let allEpisodes = [];
    let ranges = [];
    let rangeIndex = 0;
    let rangesWired = false;

    function watchKey() {
        return `freeshort-watch-${bookId}`;
    }

    function watchedKey() {
        return `freeshort-watched-${bookId}`;
    }

    function readResume() {
        try {
            const raw = localStorage.getItem(watchKey());
            return raw ? JSON.parse(raw) : null;
        } catch (_) {
            return null;
        }
    }

    function readWatchedThru() {
        try {
            const raw = localStorage.getItem(watchedKey());
            const data = raw ? JSON.parse(raw) : {};
            return parseInt(data.thru, 10) || 0;
        } catch (_) {
            return 0;
        }
    }

    function escapeHtml(s) {
        return String(s)
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/"/g, "&quot;");
    }

    function normalizeEpisode(ep) {
        const num = parseInt(ep.episode, 10);
        const title = (ep.title || "").trim();
        return {
            episode: num,
            title: title && title.toLowerCase() !== `episode ${num}`.toLowerCase()
                ? title
                : `Episode ${num}`,
            thumb_url: ep.thumb_url || "",
            thumb_local: Boolean(ep.thumb_local),
            thumb_fallback: Boolean(ep.thumb_fallback),
            thumb_pending: Boolean(ep.thumb_pending),
        };
    }

    function buildRanges(count) {
        const result = [];
        for (let start = 1; start <= count; start += RANGE_SIZE) {
            result.push({
                start,
                end: Math.min(start + RANGE_SIZE - 1, count),
            });
        }
        return result;
    }

    function formatLeft(pct) {
        const totalSec = 120;
        const left = Math.max(0, Math.round(totalSec * (1 - pct / 100)));
        const min = Math.floor(left / 60);
        const sec = left % 60;
        return `${min}:${String(sec).padStart(2, "0")} left`;
    }

    function updateContinueBar() {
        if (!allEpisodes.length) return;

        const resume = readResume();
        const watchedThru = readWatchedThru();
        const resumeEp = resume?.episode && allEpisodes.some((e) => e.episode === resume.episode)
            ? resume.episode
            : (allEpisodes.find((e) => e.episode >= 1)?.episode || startEpisode);
        const resumePct = resume?.episode === resumeEp ? parseInt(resume.pct, 10) || 0 : 0;

        const hasResume = resumePct > 0 && resumePct < 95;

        if (continueBar) continueBar.hidden = !hasResume;

        if (hasResume && continueBtn) {
            continueBtn.href = `/watch/${bookId}/${resumeEp}`;
            continueBtn.classList.remove("is-disabled");
            continueBtn.removeAttribute("aria-disabled");
            continueBtn.innerHTML = `
                <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M8 5v14l11-7z"/></svg>
                Resume ep ${resumeEp}
            `;
        }

        if (hasResume && continueMeta) {
            continueMeta.textContent = `Episode ${resumeEp} · ${formatLeft(resumePct)} · ${allEpisodes.length} episodes · ~2 min each`;
        }

        if (watchedCountEl) {
            watchedCountEl.textContent = String(watchedThru);
        } else if (pickerSub && allEpisodes.length) {
            pickerSub.innerHTML = `<span id="watched-count">${watchedThru}</span> of ${allEpisodes.length} watched · ~${allEpisodes.length * 2} min total`;
        }

        if (seasonProgress && seasonProgressFill && allEpisodes.length) {
            const pct = Math.min(100, Math.round((watchedThru / allEpisodes.length) * 100));
            seasonProgress.hidden = false;
            seasonProgressFill.style.width = `${pct}%`;
        }

        if (playBtn) {
            const firstEp = allEpisodes.find((e) => e.episode >= 1)?.episode || startEpisode;
            const targetEp = hasResume ? resumeEp : firstEp;
            const label = hasResume ? `Resume Episode ${resumeEp}` : `Play Episode ${firstEp}`;
            playBtn.href = `/watch/${bookId}/${targetEp}`;
            playBtn.classList.remove("is-disabled");
            playBtn.removeAttribute("aria-disabled");
            playBtn.innerHTML = `
                <svg width="20" height="20" viewBox="0 0 24 24" fill="#fff" aria-hidden="true"><path d="M8 5v14l11-7z"/></svg>
                ${escapeHtml(label)}
            `;
        }
    }

    function tileHtml(ep) {
        const resume = readResume();
        const watchedThru = readWatchedThru();
        const watched = ep.episode <= watchedThru;
        const current = resume?.episode === ep.episode && (resume.pct || 0) > 0 && (resume.pct || 0) < 95;
        const thumb = ep.thumb_url || posterUrl || "";
        const thumbStyle = thumb
            ? ` style="background-image:url('${escapeHtml(thumb)}')"`
            : "";

        return `
            <a
                class="ep-tile${watched ? " ep-tile--watched" : ""}"
                role="listitem"
                href="/watch/${bookId}/${ep.episode}"
                data-episode="${ep.episode}"
            >
                <div class="ep-tile__thumb"${thumbStyle}></div>
                <div class="ep-tile__scrim"></div>
                <span class="ep-tile__num">EP ${ep.episode}</span>
                ${watched ? `
                <span class="ep-tile__check" aria-hidden="true">
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round"><path d="M5 13l4 4L19 7"/></svg>
                </span>` : ""}
                <span class="ep-tile__play" aria-hidden="true">
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>
                </span>
                <div class="ep-tile__meta">
                    <span class="ep-tile__title">${escapeHtml(ep.title)}</span>
                    <span class="ep-tile__dur">
                        <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></svg>
                        2 min
                    </span>
                </div>
                ${current ? `<div class="ep-tile__prog"><i style="width:${resume.pct}%"></i></div>` : ""}
            </a>
        `;
    }

    function renderRange(index) {
        if (!grid || !ranges.length) return;

        rangeIndex = Math.max(0, Math.min(index, ranges.length - 1));
        const range = ranges[rangeIndex];
        const slice = allEpisodes.filter(
            (ep) => ep.episode >= range.start && ep.episode <= range.end
        );
        grid.innerHTML = slice.map(tileHtml).join("");

        rangesEl?.querySelectorAll(".ep-range-btn").forEach((btn, i) => {
            btn.classList.toggle("is-active", i === rangeIndex);
        });
    }

    function initRanges() {
        ranges = buildRanges(allEpisodes.length);

        if (!rangesEl || ranges.length <= 1) {
            if (rangesEl) rangesEl.hidden = true;
            renderRange(0);
            return;
        }

        rangesEl.hidden = false;
        rangesEl.innerHTML = ranges
            .map(
                (range, index) =>
                    `<button type="button" class="ep-range-btn" data-index="${index}">${range.start}–${range.end}</button>`
            )
            .join("");

        if (!rangesWired) {
            rangesEl.addEventListener("click", (event) => {
                const btn = event.target.closest(".ep-range-btn");
                if (!btn) return;
                renderRange(parseInt(btn.dataset.index, 10));
            });
            rangesWired = true;
        }

        renderRange(rangeIndex);
    }

    function renderSkeletons() {
        if (!grid) return;
        grid.innerHTML = Array.from({ length: 8 })
            .map(
                () => `
            <div class="ep-tile ep-tile--skeleton" aria-hidden="true">
                <div class="ep-tile__thumb"></div>
                <div class="ep-tile__meta"><span></span><span></span></div>
            </div>`
            )
            .join("");
    }

    function applyThumbUpdates(patches) {
        for (const patch of patches) {
            const num = parseInt(patch.episode, 10);
            const ep = allEpisodes.find((item) => item.episode === num);
            if (!ep) continue;

            const nextUrl = patch.thumb_url || "";
            const nextLocal = Boolean(patch.thumb_local);
            const nextFallback = Boolean(patch.thumb_fallback);
            const nextPending = Boolean(patch.thumb_pending);
            if (
                ep.thumb_url === nextUrl &&
                ep.thumb_local === nextLocal &&
                ep.thumb_fallback === nextFallback &&
                ep.thumb_pending === nextPending
            ) {
                continue;
            }

            ep.thumb_url = nextUrl;
            ep.thumb_local = nextLocal;
            ep.thumb_fallback = nextFallback;
            ep.thumb_pending = nextPending;

            const tile = grid?.querySelector(`.ep-tile[data-episode="${num}"]`);
            const thumbEl = tile?.querySelector(".ep-tile__thumb");
            if (thumbEl && nextUrl) {
                thumbEl.style.backgroundImage = `url("${nextUrl.replace(/"/g, "%22")}")`;
            }
        }
    }

    function thumbsStillPending() {
        return allEpisodes.some((ep) => ep.thumb_pending);
    }

    function scheduleThumbRefresh() {
        if (!thumbsStillPending()) return;

        setTimeout(async () => {
            try {
                const response = await fetch(`/api/show/${bookId}/episode-thumbs`);
                if (!response.ok) return;
                const data = await response.json();
                applyThumbUpdates(data.episodes || []);
                if (thumbsStillPending()) {
                    scheduleThumbRefresh();
                }
            } catch (_) {
                /* ignore */
            }
        }, 1500);
    }

    function setEpisodes(episodes) {
        allEpisodes = episodes.map(normalizeEpisode);
        rangeIndex = 0;
        if (statusEl) statusEl.hidden = true;
        root.dataset.pendingEpisodes = "0";
        updateContinueBar();
        initRanges();
        scheduleThumbRefresh();
    }

    async function loadEpisodes() {
        renderSkeletons();

        const delays = [0, 1200, 2800, 5000];
        for (let attempt = 0; attempt < delays.length; attempt += 1) {
            if (delays[attempt]) {
                await new Promise((resolve) => setTimeout(resolve, delays[attempt]));
            }
            try {
                const response = await fetch(`/api/show/${bookId}/episodes`);
                if (!response.ok) continue;
                const data = await response.json();
                if (data.episodes && data.episodes.length) {
                    setEpisodes(data.episodes);
                    window.FSLoader?.hide();
                    return;
                }
            } catch (_) {
                /* retry */
            }
        }

        if (statusEl) {
            statusEl.textContent = "Couldn’t load episodes — refresh to try again.";
            statusEl.hidden = false;
        }
        if (grid) grid.innerHTML = "";
        window.FSLoader?.hide();
    }

    function boot() {
        if (pending) {
            loadEpisodes();
            return;
        }

        if (dataEl) {
            try {
                setEpisodes(JSON.parse(dataEl.textContent));
            } catch (_) {
                renderSkeletons();
            }
        }
    }

    boot();
})();
