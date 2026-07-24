(function () {
    const feed = document.getElementById("discover-feed");
    if (!feed) return;

    const WINDOW_RADIUS = 2;
    const BATCH_SIZE = 8;

    const seenBookIds = new Set();
    let hasMore = true;
    let loadingBatch = false;
    let slides = [];
    let activeSlide = null;
    let ready = false;
    let playGeneration = 0;
    let userMuted = FSReelsPlayback.getUserMuted();

    const playbackCache = new Map();
    const hlsBySlide = new Map();

    const MUTE_BTN_HTML = `
        <span class="reel-mute-icons" aria-hidden="true">
            <svg class="reel-mute-icon reel-mute-icon--on" viewBox="0 0 24 24">
                <path fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" d="M11 5L6 9H2v6h4l5 4V5z"/>
                <path fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" d="M15.54 8.46a5 5 0 0 1 0 7.07"/>
                <path fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" d="M19.07 4.93a10 10 0 0 1 0 14.14"/>
            </svg>
            <svg class="reel-mute-icon reel-mute-icon--off" viewBox="0 0 24 24">
                <path fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" d="M11 5L6 9H2v6h4l5 4V5z"/>
                <line x1="23" y1="9" x2="17" y2="15" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
                <line x1="17" y1="9" x2="23" y2="15" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
            </svg>
        </span>
    `;

    function rememberPlayback(item) {
        if (!item?.book_id || item.episode == null || !item.playback) return;
        playbackCache.set(`${item.book_id}:${item.episode}`, item.playback);
    }

    function cacheKey(slide) {
        return `${slide.dataset.bookId}:${slide.dataset.episode}`;
    }

    function escapeHtml(value) {
        return String(value)
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/"/g, "&quot;");
    }

    function hideBoot() {
        window.FSLoader?.hide();
    }

    function getVideo(slide) {
        return slide.querySelector(".reel-video");
    }

    function isHydrated(slide) {
        return slide.dataset.hydrated === "1";
    }

    function slideHeight() {
        return feed.clientHeight || window.innerHeight;
    }

    function slideIndex(slide) {
        return slides.indexOf(slide);
    }

    function applyActiveAudio(video) {
        FSReelsPlayback.applyActiveAudio(video, userMuted);
    }

    function silence(video) {
        FSReelsPlayback.silence(video);
    }

    function overlayState() {
        return {
            getVideo,
            getBtn: (slide) => slide.querySelector(".reel-play-btn"),
            isActive: (slide) => slide === activeSlide,
            hasSource: hasVideoSource,
            isLoaded: (slide) => slide.dataset.loaded === "1",
            isAdvancing: () => false,
        };
    }

    function syncPlayOverlay(slide) {
        FSReelsPlayback.syncPlayOverlay(slide, overlayState());
    }

    function scheduleOverlaySync(slide) {
        FSReelsPlayback.scheduleOverlaySync(slide, overlayState());
    }

    function setUserMuted(value) {
        userMuted = value;
        FSReelsPlayback.setUserMuted(value);
        const video = activeSlide && getVideo(activeSlide);
        if (video) applyActiveAudio(video);
        document.querySelectorAll(".reel-mute").forEach((btn) => {
            btn.classList.toggle("reel-mute--off", userMuted);
            btn.setAttribute("aria-label", userMuted ? "Unmute" : "Mute");
        });
    }

    function hasVideoSource(slide) {
        const video = getVideo(slide);
        return FSReelsPlayback.videoHasSource(video, hlsBySlide.get(slide));
    }

    function syncAllPlayOverlays() {
        for (const slide of slides) {
            if (isHydrated(slide)) syncPlayOverlay(slide);
        }
    }

    function destroyHls(slide) {
        const attachment = hlsBySlide.get(slide);
        if (attachment) {
            FSReelsPlayback.destroyAttachedStream(getVideo(slide), attachment);
            hlsBySlide.delete(slide);
        }
    }

    function stopSlide(slide) {
        if (!slide || !isHydrated(slide)) return;
        const video = getVideo(slide);
        if (video) FSReelsPlayback.hardPause(video);
        destroyHls(slide);
        slide.classList.remove("is-playing");
    }

    function softPauseSlide(slide) {
        if (!slide || !isHydrated(slide)) return;
        const video = getVideo(slide);
        if (video) FSReelsPlayback.hardPause(video);
        slide.classList.remove("is-playing");
        syncPlayOverlay(slide);
    }

    function pauseOthers(exceptSlide) {
        for (const slide of slides) {
            if (slide !== exceptSlide) softPauseSlide(slide);
        }
    }

    function dominantSlideInView() {
        const feedRect = feed.getBoundingClientRect();
        const centerY = feedRect.top + feedRect.height / 2;
        let best = null;
        let bestDist = Infinity;

        for (const slide of slides) {
            if (!isHydrated(slide)) continue;
            const rect = slide.getBoundingClientRect();
            const slideCenter = rect.top + rect.height / 2;
            const dist = Math.abs(slideCenter - centerY);
            if (dist < bestDist) {
                bestDist = dist;
                best = slide;
            }
        }
        return best;
    }

    function settleActiveSlide() {
        const target = dominantSlideInView();
        if (!target) return;

        pauseOthers(target);

        const video = getVideo(target);
        if (video) applyActiveAudio(video);

        const switching = target !== activeSlide;
        const loaded = target.dataset.loaded === "1" && hasVideoSource(target);

        if (switching || !loaded) {
            playSlide(target);
            return;
        }

        if (video && video.paused && !video.ended) {
            const gen = ++playGeneration;
            activeSlide = target;
            startPlayback(target, gen);
            return;
        }

        scheduleOverlaySync(target);
        syncAllPlayOverlays();
    }

    function isStale(gen, slide) {
        if (gen !== playGeneration) return true;
        if (slide && slide !== activeSlide) return true;
        return false;
    }

    async function startPlayback(slide, gen) {
        if (isStale(gen, slide)) return false;
        return FSReelsPlayback.startSlidePlayback(slide, {
            gen,
            isStale,
            getVideo,
            getHls: (s) => hlsBySlide.get(s)?.hls,
            getAttachment: (s) => hlsBySlide.get(s),
            overlayState: overlayState(),
            userMuted,
        });
    }

    function wireVideoGuards(slide, video) {
        FSReelsPlayback.wireVideoPlayback(slide, video, {
            isActive: (s) => s === activeSlide,
            overlayState: overlayState(),
            onEnded: (s) => {
                const idx = slideIndex(s);
                const next = slides[idx + 1];
                if (next && s === activeSlide) {
                    feed.scrollTo({ top: slideIndex(next) * slideHeight(), behavior: "smooth" });
                }
            },
        });
    }

    function attachRemoteStream(slide, video, url) {
        const attachment = FSReelsPlayback.attachRemoteStream(video, url, {
            onError: (_evt, data) => {
                if (!data || !data.fatal) return;
                if (data.type === Hls.ErrorTypes.MEDIA_ERROR) {
                    try {
                        hlsBySlide.get(slide)?.hls?.recoverMediaError();
                        return;
                    } catch (_) {
                        /* fall through */
                    }
                }
                refreshSlideStream(slide);
            },
        });
        if (attachment) hlsBySlide.set(slide, attachment);
        return Boolean(attachment);
    }

    async function refreshSlideStream(slide) {
        if (!slide || slide.dataset.refreshing === "1" || slide.dataset.refreshed === "1") return;
        const bookId = slide.dataset.bookId;
        const ep = slide.dataset.episode;
        if (!bookId || !ep) return;
        slide.dataset.refreshing = "1";
        try {
            const response = await fetch(`/api/watch/${bookId}/${ep}?refresh=1`);
            if (!response.ok) return;
            const data = await response.json();
            if (data.error || (!data.remote_url && !data.local_url)) return;
            slide.dataset.refreshed = "1";
            playbackCache.set(cacheKey(slide), data);
            destroyHls(slide);
            if (attachSource(slide, data) && slide === activeSlide) {
                const video = getVideo(slide);
                if (video) await FSReelsPlayback.playVideo(video, userMuted);
            }
        } catch (_) {
            /* leave as-is */
        } finally {
            slide.dataset.refreshing = "0";
        }
    }

    function attachSource(slide, data) {
        const video = getVideo(slide);
        if (!video) return false;

        destroyHls(slide);
        video.removeAttribute("src");
        video.load();

        let attached = false;
        if (data.remote_url) {
            attached = attachRemoteStream(slide, video, data.remote_url);
        } else if (data.local_url) {
            FSReelsPlayback.prepareVideoElement(video);
            video.src = data.local_url;
            video.load();
            attached = true;
        }

        wireVideoGuards(slide, video);
        if (slide === activeSlide) applyActiveAudio(video);
        else {
            video.pause();
            silence(video);
        }
        return attached;
    }

    function showError(slide, message) {
        hydrateSlide(slide);
        const phone = slide.querySelector(".reel-phone");
        let err = phone.querySelector(".reel-error");
        if (!err) {
            err = document.createElement("p");
            err.className = "reel-error";
            phone.appendChild(err);
        }
        err.textContent = message;
        err.hidden = false;
    }

    function clearError(slide) {
        const err = slide.querySelector(".reel-error");
        if (err) err.hidden = true;
    }

    function setLoading(slide, show) {
        const loading = slide.querySelector(".reel-loading");
        if (loading) loading.hidden = !show;
    }

    async function loadSlide(slide) {
        if (!isHydrated(slide)) return false;

        const key = cacheKey(slide);
        if (playbackCache.has(key) && hasVideoSource(slide)) {
            slide.dataset.loaded = "1";
            return true;
        }

        if (playbackCache.has(key) && !hasVideoSource(slide)) {
            if (attachSource(slide, playbackCache.get(key))) {
                slide.dataset.loaded = "1";
                return true;
            }
        }

        if (slide.dataset.loading === "1") return hasVideoSource(slide);
        if (slide.dataset.loaded === "1" && hasVideoSource(slide)) return true;

        slide.dataset.loading = "1";
        slide.dataset.loaded = "0";
        setLoading(slide, true);
        clearError(slide);

        try {
            const bookId = slide.dataset.bookId;
            const ep = slide.dataset.episode;
            let data = null;
            // Retry once — fresh catalogs often need a moment for episode sync.
            for (let attempt = 0; attempt < 2; attempt += 1) {
                const response = await fetch(`/api/watch/${bookId}/${ep}`);
                data = await response.json().catch(() => null);
                if (response.ok && data && !data.error && (data.remote_url || data.local_url)) {
                    break;
                }
                data = null;
                if (attempt === 0) {
                    await new Promise((r) => setTimeout(r, 1200));
                }
            }
            if (!data) {
                slide.dataset.loadFailed = "1";
                return false;
            }
            playbackCache.set(key, data);
            if (!attachSource(slide, data)) {
                slide.dataset.loadFailed = "1";
                return false;
            }
            slide.dataset.loaded = "1";
            slide.dataset.loadFailed = "0";
            return true;
        } catch (_) {
            slide.dataset.loadFailed = "1";
            return false;
        } finally {
            slide.dataset.loading = "0";
            setLoading(slide, false);
        }
    }

    async function skipBrokenSlide(slide, gen) {
        if (isStale(gen, slide)) return;

        const idx = slideIndex(slide);
        if (idx < 0) return;

        slide.remove();
        slides.splice(idx, 1);
        playbackCache.delete(cacheKey(slide));
        destroyHls(slide);

        const next = slides[idx] || slides[idx - 1];
        if (next) {
            const top = slideIndex(next) * slideHeight();
            feed.scrollTo({ top, behavior: "auto" });
            await playSlide(next);
            return;
        }

        if (hasMore) {
            await appendBatch();
            if (slides[0]) await playSlide(slides[0]);
        }
    }

    function hydrateSlide(slide) {
        if (isHydrated(slide)) return;

        const phone = slide.querySelector(".reel-phone");
        const showTitle = slide.dataset.showTitle || "Unknown show";
        const episodeTitle = slide.dataset.episodeTitle || "";
        const genreLine = slide.dataset.genreLine || "";
        const ep = slide.dataset.episode;
        const showUrl = slide.dataset.showUrl || "/";
        const watchUrl = slide.dataset.watchUrl || showUrl;
        const episodeCount = slide.dataset.episodeCount || "";
        const poster = slide.dataset.posterUrl || "";

        phone.classList.remove("reel-phone--empty");
        phone.innerHTML = `
            <video class="reel-video" playsinline webkit-playsinline muted preload="metadata"></video>
            <div class="reel-video-tap" aria-hidden="true"></div>
            <div class="reel-overlay">
                <div class="reel-topbar">
                    <a class="reel-back" href="/" aria-label="Home">
                        <svg class="reel-ctrl-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M15 18l-6-6 6-6"/></svg>
                    </a>
                    <button type="button" class="reel-mute${userMuted ? " reel-mute--off" : ""}" aria-label="${userMuted ? "Unmute" : "Mute"}">${MUTE_BTN_HTML}</button>
                </div>
                <div class="discover-meta">
                    ${genreLine ? `<span class="discover-meta__genre">${escapeHtml(genreLine)}</span>` : ""}
                    <div class="discover-meta__body">
                        ${poster ? `<div class="discover-meta__poster" style="background-image:url('${escapeHtml(poster)}')"></div>` : ""}
                        <div class="discover-meta__copy">
                            <p class="reel-show">${escapeHtml(showTitle)}</p>
                            <p class="discover-meta__ep">Ep ${escapeHtml(ep)}${episodeTitle ? ` · ${escapeHtml(episodeTitle)}` : ""}</p>
                            ${episodeCount ? `<p class="discover-meta__count">${escapeHtml(episodeCount)} episodes · ~2 min each</p>` : ""}
                            <div class="discover-meta__actions">
                                <a class="discover-btn discover-btn--primary" href="${escapeHtml(watchUrl)}">Watch episode</a>
                                <a class="discover-btn discover-btn--ghost" href="${escapeHtml(showUrl)}">All episodes</a>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
            <div class="reel-loading" hidden aria-label="Loading"></div>
            <p class="reel-error" hidden></p>
            <button type="button" class="reel-play-btn" hidden aria-label="Play">
                <span class="reel-play-glyph"><svg class="reel-play-icon" viewBox="0 0 24 24"><path fill="currentColor" d="M7 6v12l10-6z"/></svg></span>
            </button>
        `;

        const video = getVideo(slide);
        wireVideoGuards(slide, video);
        if (slide === activeSlide) applyActiveAudio(video);
        else silence(video);

        phone.querySelector(".reel-mute")?.addEventListener("click", (e) => {
            e.stopPropagation();
            setUserMuted(!userMuted);
        });

        phone.querySelector(".reel-video-tap")?.addEventListener("pointerdown", (e) => {
            if (!ready || slide !== activeSlide) return;
            FSReelsPlayback.markUserGesture();
            const v = getVideo(slide);
            if (v) FSReelsPlayback.unlockVideoForGesture(v);
        }, { passive: true });

        phone.querySelector(".reel-video-tap")?.addEventListener("click", async (e) => {
            e.stopPropagation();
            if (!ready || slide !== activeSlide) return;
            FSReelsPlayback.markUserGesture();
            if (!hasVideoSource(slide)) {
                const loaded = await loadSlide(slide);
                if (!loaded) return;
            }
            const v = getVideo(slide);
            if (!v) return;
            await FSReelsPlayback.togglePlay(v, userMuted);
            scheduleOverlaySync(slide);
        });

        phone.querySelector(".reel-play-btn")?.addEventListener("pointerdown", (e) => {
            e.stopPropagation();
            if (slide !== activeSlide) return;
            FSReelsPlayback.markUserGesture();
            const v = getVideo(slide);
            if (v) FSReelsPlayback.unlockVideoForGesture(v);
        }, { passive: true });

        phone.querySelector(".reel-play-btn")?.addEventListener("click", async (e) => {
            e.stopPropagation();
            if (slide !== activeSlide) return;
            FSReelsPlayback.markUserGesture();
            if (!hasVideoSource(slide)) {
                const loaded = await loadSlide(slide);
                if (!loaded) return;
            }
            const v = getVideo(slide);
            if (!v) return;
            await FSReelsPlayback.playVideo(v, userMuted, { withinGesture: true });
            scheduleOverlaySync(slide);
        });

        slide.dataset.hydrated = "1";
        scheduleOverlaySync(slide);
    }

    function dehydrateSlide(slide) {
        if (!isHydrated(slide) || slide === activeSlide) return;
        stopSlide(slide);
        const phone = slide.querySelector(".reel-phone");
        phone.classList.add("reel-phone--empty");
        phone.innerHTML = "";
        slide.dataset.hydrated = "0";
        slide.dataset.loaded = "0";
    }

    function ensureWindow(centerSlide) {
        const centerIdx = slideIndex(centerSlide);
        if (centerIdx < 0) return;
        slides.forEach((slide, idx) => {
            const dist = Math.abs(idx - centerIdx);
            if (dist <= WINDOW_RADIUS) hydrateSlide(slide);
            else if (dist > WINDOW_RADIUS + 1) dehydrateSlide(slide);
        });
    }

    async function playSlide(slide) {
        if (!slide) return;

        const gen = ++playGeneration;
        activeSlide = slide;
        pauseOthers(slide);
        syncAllPlayOverlays();

        if (!isHydrated(slide)) hydrateSlide(slide);
        ensureWindow(slide);

        const ok = await loadSlide(slide);
        if (!ok || isStale(gen, slide)) {
            hideBoot();
            if (!ok && slide.dataset.loadFailed === "1") {
                await skipBrokenSlide(slide, gen);
            } else {
                scheduleOverlaySync(slide);
            }
            return;
        }

        pauseOthers(slide);

        await startPlayback(slide, gen);

        if (isStale(gen, slide)) {
            const v = getVideo(slide);
            if (v) FSReelsPlayback.hardPause(v);
            return;
        }

        hideBoot();
        const video = getVideo(slide);
        if (video && !video.paused) applyActiveAudio(video);
        scheduleOverlaySync(slide);
        syncAllPlayOverlays();

        const idx = slideIndex(slide);
        if (idx >= slides.length - 3 && hasMore) {
            appendBatch();
        }

        const prev = slides[idx - 1];
        const next = slides[idx + 1];
        if (prev && isHydrated(prev)) loadSlide(prev);
        if (next && isHydrated(next)) loadSlide(next);
    }

    function createSlide(item) {
        const section = document.createElement("section");
        section.className = "reel-slide discover-slide";
        section.dataset.bookId = item.book_id;
        section.dataset.episode = String(item.episode);
        section.dataset.showTitle = item.show_title || "";
        section.dataset.episodeTitle = item.episode_title || "";
        section.dataset.genreLine = item.genre_line || "";
        section.dataset.showUrl = item.show_url || "";
        section.dataset.watchUrl = item.watch_url || "";
        section.dataset.episodeCount = item.episode_count ? String(item.episode_count) : "";
        section.dataset.posterUrl = item.poster_url || item.thumb_url || "";
        section.dataset.hydrated = "0";
        section.innerHTML = `<div class="reel-stage"><article class="reel-phone reel-phone--empty"></article></div>`;
        return section;
    }

    function trackSeen(item) {
        if (item?.book_id) seenBookIds.add(item.book_id);
    }

    function seenExcludeParam() {
        return [...seenBookIds].join(",");
    }

    async function appendBatch() {
        if (loadingBatch || !hasMore) return;
        loadingBatch = true;
        let building = false;
        try {
            const params = new URLSearchParams({
                limit: String(BATCH_SIZE),
            });
            const exclude = seenExcludeParam();
            if (exclude) params.set("exclude", exclude);

            const response = await fetch(`/api/discover/feed?${params}`);
            if (!response.ok) return { ok: false, building: false };
            const data = await response.json();
            hasMore = Boolean(data.has_more);
            building = Boolean(data.building);

            const items = data.items || [];
            if (!items.length) {
                if (!building) hasMore = false;
                return { ok: false, building };
            }

            if (data.reset) {
                seenBookIds.clear();
            }

            for (const item of items) {
                rememberPlayback(item);
                trackSeen(item);
                const slide = createSlide(item);
                feed.appendChild(slide);
                slides.push(slide);
            }

            if (!activeSlide && slides[0]) {
                ready = true;
                await playSlide(slides[0]);
            } else if (!ready && slides.length) {
                ready = true;
            }
            return { ok: true, building };
        } finally {
            loadingBatch = false;
        }
    }

    async function boot() {
        FSReelsPlayback.bindUserInteraction(feed);

        let scrollSettleTimer = null;
        const SCROLL_SETTLE_MS = 160;

        function scheduleSettle() {
            clearTimeout(scrollSettleTimer);
            scrollSettleTimer = setTimeout(() => {
                if (ready) settleActiveSlide();
            }, SCROLL_SETTLE_MS);
        }

        feed.addEventListener(
            "scroll",
            () => {
                if (!ready) return;
                playGeneration += 1;
                for (const slide of slides) {
                    if (!isHydrated(slide)) continue;
                    softPauseSlide(slide);
                }
                scheduleSettle();
            },
            { passive: true }
        );

        feed.addEventListener("scrollend", () => {
            if (!ready) return;
            clearTimeout(scrollSettleTimer);
            settleActiveSlide();
        }, { passive: true });

        // Show the shell immediately; media attaches in the background.
        hideBoot();

        // Retry while the server is still syncing episode manifests for catalogs
        // that only have book metadata (common on fresh / sparse data folders).
        let delay = 500;
        const deadline = Date.now() + 90 * 1000;
        while (Date.now() < deadline) {
            hasMore = true;
            const result = await appendBatch();
            if (slides.length) {
                return;
            }
            if (!result || (!result.building && result.ok === false)) {
                break;
            }
            await new Promise((r) => setTimeout(r, delay));
            delay = Math.min(delay + 500, 3000);
        }

        if (!slides.length) {
            feed.innerHTML = `<p class="discover-empty">No episodes to discover yet — open a show once so we can collect episodes, then come back.</p>`;
        }
    }

    window.addEventListener("pageshow", (e) => {
        if (!e.persisted) return;
        const slide = activeSlide || slides[0];
        if (!slide) return;
        activeSlide = slide;
        if (!isHydrated(slide)) hydrateSlide(slide);
        const gen = ++playGeneration;
        loadSlide(slide).then((loaded) => {
            if (!loaded || slide !== activeSlide || gen !== playGeneration) return;
            startPlayback(slide, gen);
        });
    });

    boot();
})();
