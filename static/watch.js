(function () {
    if ("scrollRestoration" in history) {
        history.scrollRestoration = "manual";
    }

    const feed = document.getElementById("reels-feed");
    if (!feed) return;

    const bookId = feed.dataset.bookId;
    const showTitle = feed.dataset.showTitle;
    const showUrl = feed.dataset.showUrl;
    const startEpisode = parseInt(feed.dataset.startEpisode, 10);
    const slides = [...feed.querySelectorAll(".reel-slide")];
    const episodes = slides.map((s) => parseInt(s.dataset.episode, 10));
    const hlsBySlide = new Map();
    const playbackCache = new Map();
    const loadPromises = new Map();
    const WINDOW_RADIUS = 2;

    let activeSlide = null;
    let ready = false;
    let initializing = true;
    let playGeneration = 0;
    let autoAdvancing = false;
    let prefetchObserver = null;
    let userMuted = FSReelsPlayback.getUserMuted();

    function trackShowWatch() {
        const key = `freeshort-viewed-${bookId}`;
        if (sessionStorage.getItem(key)) return;
        sessionStorage.setItem(key, "1");
        fetch(`/api/view/${bookId}`, { method: "POST", credentials: "same-origin" }).catch(() => {});
    }

    function trackEpisodeView(episode) {
        if (!Number.isFinite(episode) || episode < 1) return;
        const key = `freeshort-ep-viewed-${bookId}-${episode}`;
        if (sessionStorage.getItem(key)) return;
        sessionStorage.setItem(key, "1");
        fetch(`/api/view/${bookId}/${episode}`, { method: "POST", credentials: "same-origin" }).catch(() => {});
    }

    function trackEpisodeComplete(episode, video) {
        if (!Number.isFinite(episode) || episode < 1) return;
        if (
            video &&
            Number.isFinite(video.duration) &&
            video.duration > 0 &&
            video.currentTime / video.duration < 0.85
        ) {
            return;
        }
        const key = `freeshort-ep-complete-${bookId}-${episode}`;
        if (sessionStorage.getItem(key)) return;
        sessionStorage.setItem(key, "1");
        fetch(`/api/view/${bookId}/${episode}/complete`, {
            method: "POST",
            credentials: "same-origin",
        }).catch(() => {});
    }

    function trackView(slide) {
        if (!slide || slide !== activeSlide) return;
        trackShowWatch();
        const episode = parseInt(slide.dataset.episode, 10);
        trackEpisodeView(episode);
    }

    let progressSaveTimer = null;

    function saveWatchProgress(slide, video) {
        const episode = parseInt(slide?.dataset?.episode, 10);
        if (!Number.isFinite(episode) || episode < 0 || !video || !Number.isFinite(video.duration) || video.duration <= 0) return;
        if (progressSaveTimer) return;
        progressSaveTimer = setTimeout(() => {
            progressSaveTimer = null;
            const pct = Math.round((video.currentTime / video.duration) * 100);
            const payload = { episode, pct, at: Date.now() };
            try {
                localStorage.setItem(
                    `freeshort-watch-${bookId}`,
                    JSON.stringify(payload)
                );
            } catch (_) {
                /* ignore */
            }
            if (document.body.classList.contains("is-logged-in")) {
                fetch(`/api/watch-progress/${bookId}`, {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    credentials: "same-origin",
                    body: JSON.stringify({ episode, pct }),
                }).catch(() => {});
            }
        }, 1200);
    }

    function markEpisodeWatched(episode) {
        try {
            const key = `freeshort-watched-${bookId}`;
            const prev = JSON.parse(localStorage.getItem(key) || "{}");
            const thru = Math.max(parseInt(prev.thru, 10) || 0, episode);
            localStorage.setItem(key, JSON.stringify({ thru }));
        } catch (_) {
            /* ignore */
        }
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
            isLoading: (slide) => slide.dataset.loading === "1",
            isAdvancing: () => autoAdvancing,
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
        updateMuteButtons();
    }

    function updateMuteButtons() {
        document.querySelectorAll(".reel-mute").forEach((btn) => {
            btn.classList.toggle("reel-mute--off", userMuted);
            btn.setAttribute("aria-label", userMuted ? "Unmute" : "Mute");
        });
    }

    const BACK_BTN_HTML = `
        <svg class="reel-ctrl-icon" viewBox="0 0 24 24" aria-hidden="true">
            <path fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" d="M15 18l-6-6 6-6"/>
        </svg>
    `;

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

    const PLAY_BTN_HTML = `
        <button type="button" class="reel-play-btn" hidden aria-label="Play">
            <span class="reel-play-glyph" aria-hidden="true">
                <svg class="reel-play-icon" viewBox="0 0 24 24">
                    <path fill="currentColor" d="M7 6v12l10-6z"/>
                </svg>
            </span>
        </button>
    `;

    function syncAllPlayOverlays() {
        for (const slide of slides) {
            if (isHydrated(slide)) syncPlayOverlay(slide);
        }
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

    const startDataEl = document.getElementById("reels-start-playback");
    if (startDataEl) {
        try {
            const data = JSON.parse(startDataEl.textContent);
            playbackCache.set(data.episode, data);
        } catch (_) {
            /* ignore */
        }
    }

    function slideIndex(slide) {
        return slides.indexOf(slide);
    }

    function slideForEpisode(ep) {
        return slides[episodes.indexOf(ep)];
    }

    function slideHeight() {
        return feed.clientHeight || window.innerHeight;
    }

    function getVideo(slide) {
        return slide.querySelector(".reel-video");
    }

    function hasVideoSource(slide) {
        const video = getVideo(slide);
        return FSReelsPlayback.videoHasSource(video, hlsBySlide.get(slide));
    }

    function hideBoot() {
        if (window.FSLoader) {
            FSLoader.hide();
            return;
        }
        const loader = document.getElementById("page-loader");
        if (loader) loader.classList.add("is-done");
        document.body.classList.remove("is-loading");
        document.documentElement.classList.remove("fs-boot-loading");
        try {
            sessionStorage.removeItem("fs-nav");
        } catch (_) {
            /* ignore */
        }
    }

    function isHydrated(slide) {
        return slide.dataset.hydrated === "1";
    }

    function waitForLayout() {
        return new Promise((resolve) => {
            requestAnimationFrame(() => {
                requestAnimationFrame(resolve);
            });
        });
    }

    function waitForPageReady() {
        return waitForLayout();
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

    function showUnsupportedSlide(slide, data) {
        hydrateSlide(slide);
        const phone = slide.querySelector(".reel-phone");
        const ep = slide.dataset.episode;
        const poster = data.poster_url || "";
        const message =
            data.error || "This video isn't available to stream in your browser.";
        phone.classList.remove("reel-phone--empty");
        phone.innerHTML = `
            <div class="watch-unsupported watch-unsupported--inline">
                <div class="watch-unsupported__card">
                    ${
                        poster
                            ? `<div class="watch-unsupported__poster"><img src="${poster.replace(/"/g, "&quot;")}" alt=""></div>`
                            : ""
                    }
                    <div class="watch-unsupported__body">
                        <p class="watch-unsupported__eyebrow">Not supported on web</p>
                        <p class="watch-unsupported__title">${showTitle.replace(/</g, "&lt;")}</p>
                        <p class="watch-unsupported__episode">Ep ${ep}</p>
                        <p class="watch-unsupported__message">${message.replace(/</g, "&lt;")}</p>
                        <a class="watch-unsupported__cta" href="${showUrl}">Back to show</a>
                    </div>
                </div>
            </div>
        `;
        slide.dataset.loaded = "1";
        slide.dataset.loading = "0";
        setLoading(slide, false);
        hideBoot();
    }

    function clearError(slide) {
        const err = slide.querySelector(".reel-error");
        if (err) err.hidden = true;
    }

    function formatTime(seconds) {
        if (!Number.isFinite(seconds) || seconds < 0) return "0:00";
        const m = Math.floor(seconds / 60);
        const s = Math.floor(seconds % 60);
        return `${m}:${s.toString().padStart(2, "0")}`;
    }

    function wireSeekBar(slide) {
        const phone = slide.querySelector(".reel-phone");
        const video = getVideo(slide);
        const seek = phone.querySelector(".reel-seek");
        const hit = seek.querySelector(".reel-seek-hit");
        const track = seek.querySelector(".reel-seek-track");
        const fill = seek.querySelector(".reel-seek-fill");
        const thumb = seek.querySelector(".reel-seek-thumb");
        const curEl = seek.querySelector(".reel-seek-current");
        const durEl = seek.querySelector(".reel-seek-duration");
        const floatEl = seek.querySelector(".reel-seek-float");

        let dragging = false;
        let wasPlaying = false;

        function setProgress(pct) {
            const clamped = Math.max(0, Math.min(1, pct));
            fill.style.width = `${clamped * 100}%`;
            thumb.style.left = `${clamped * 100}%`;
            if (floatEl) {
                floatEl.style.left = `${clamped * 100}%`;
            }
        }

        function updateTimes() {
            const next = formatTime(video.currentTime);
            if (curEl.textContent !== next) {
                curEl.textContent = next;
                curEl.classList.remove("reel-seek-current--tick");
                void curEl.offsetWidth;
                curEl.classList.add("reel-seek-current--tick");
            }
            durEl.textContent = formatTime(video.duration);
        }

        function seekToPct(pct) {
            if (!Number.isFinite(video.duration) || video.duration <= 0) return;
            const clamped = Math.max(0, Math.min(1, pct));
            video.currentTime = clamped * video.duration;
            setProgress(clamped);
            updateTimes();
        }

        function syncFromVideo() {
            if (dragging || !Number.isFinite(video.duration) || video.duration <= 0) return;
            setProgress(video.currentTime / video.duration);
            updateTimes();
            saveWatchProgress(slide, video);
        }

        function showFloat(show) {
            if (!floatEl) return;
            floatEl.classList.toggle("reel-seek-float--visible", show);
        }

        video.addEventListener("timeupdate", syncFromVideo);
        video.addEventListener("loadedmetadata", syncFromVideo);
        video.addEventListener("durationchange", syncFromVideo);

        track.addEventListener("pointerenter", () => showFloat(true));
        hit.addEventListener("pointerleave", () => {
            if (!dragging) showFloat(false);
        });

        hit.addEventListener("pointerdown", (e) => {
            e.stopPropagation();
            e.preventDefault();
            dragging = true;
            wasPlaying = !video.paused;
            video.pause();
            hit.setPointerCapture(e.pointerId);
            seek.classList.add("reel-seek--dragging");
            feed.style.overflowY = "hidden";
            showFloat(true);
            seekToPct(progressFromClientX(e.clientX));
        });

        hit.addEventListener("pointermove", (e) => {
            if (!dragging) return;
            e.stopPropagation();
            seekToPct(progressFromClientX(e.clientX));
        });

        function endDrag(e) {
            if (!dragging) return;
            e.stopPropagation();
            dragging = false;
            seek.classList.remove("reel-seek--dragging");
            feed.style.overflowY = "";
            showFloat(false);
            if (hit.hasPointerCapture(e.pointerId)) {
                hit.releasePointerCapture(e.pointerId);
            }
            seekToPct(progressFromClientX(e.clientX));
            if (wasPlaying && slide === activeSlide) {
                applyActiveAudio(video);
                FSReelsPlayback.playVideo(video, userMuted, { allowMutedPlay: true }).catch(() => {});
            }
        }

        function progressFromClientX(clientX) {
            const rect = track.getBoundingClientRect();
            return (clientX - rect.left) / rect.width;
        }

        hit.addEventListener("pointerup", endDrag);
        hit.addEventListener("pointercancel", endDrag);

        seek.addEventListener("click", (e) => e.stopPropagation());
    }

    function hydrateSlide(slide) {
        if (isHydrated(slide)) return;

        const phone = slide.querySelector(".reel-phone");
        const ep = slide.dataset.episode;
        const existingVideo = phone.querySelector(".reel-video");
        phone.classList.remove("reel-phone--empty");

        const chrome = `
            <div class="reel-overlay">
                <div class="reel-topbar">
                    <a class="reel-back" href="${showUrl}" aria-label="Back">${BACK_BTN_HTML}</a>
                    <button type="button" class="reel-mute${userMuted ? " reel-mute--off" : ""}" aria-label="${userMuted ? "Unmute" : "Mute"}">${MUTE_BTN_HTML}</button>
                </div>
                <div class="reel-info">
                    <p class="reel-show"></p>
                    <p class="reel-episode">Ep ${ep}</p>
                </div>
            </div>
            <div class="reel-seek">
                <div class="reel-seek-float">
                    <span class="reel-seek-current">0:00</span><span class="reel-seek-sep"> / </span><span class="reel-seek-duration">0:00</span>
                </div>
                <div class="reel-seek-hit">
                    <div class="reel-seek-track" role="slider" aria-label="Seek">
                        <div class="reel-seek-rail"></div>
                        <div class="reel-seek-fill"></div>
                        <div class="reel-seek-thumb"></div>
                    </div>
                </div>
            </div>
            <div class="reel-loading" hidden aria-label="Loading"></div>
            <p class="reel-error" hidden></p>
            ${PLAY_BTN_HTML}
        `;

        if (existingVideo) {
            if (!phone.querySelector(".reel-video-tap")) {
                existingVideo.insertAdjacentHTML(
                    "afterend",
                    `<div class="reel-video-tap" aria-hidden="true"></div>`
                );
            }
            if (!phone.querySelector(".reel-overlay")) {
                phone.insertAdjacentHTML("beforeend", chrome);
            }
        } else {
            phone.innerHTML = `
            <video class="reel-video" playsinline webkit-playsinline muted preload="metadata"></video>
            <div class="reel-video-tap" aria-hidden="true"></div>
            ${chrome}
        `;
        }

        const videoTap = phone.querySelector(".reel-video-tap");
        if (videoTap && !videoTap.dataset.wired) {
            videoTap.dataset.wired = "1";
            videoTap.addEventListener("pointerdown", (e) => {
                if (slide !== activeSlide) return;
                FSReelsPlayback.markUserGesture();
                const v = getVideo(slide);
                if (v) FSReelsPlayback.unlockVideoForGesture(v);
            }, { passive: true });
            videoTap.addEventListener("click", (e) => {
                e.stopPropagation();
                if (slide !== activeSlide) return;
                togglePlayback(slide);
            });
        }

        phone.querySelector(".reel-show").textContent = showTitle;

        const muteBtn = phone.querySelector(".reel-mute");
        if (muteBtn) {
            muteBtn.addEventListener("click", (e) => {
                e.stopPropagation();
                e.preventDefault();
                setUserMuted(!userMuted);
            });
        }

        const playBtn = phone.querySelector(".reel-play-btn");
        if (playBtn) {
            playBtn.addEventListener("pointerdown", (e) => {
                e.stopPropagation();
                if (slide !== activeSlide) return;
                FSReelsPlayback.markUserGesture();
                const v = getVideo(slide);
                if (v) FSReelsPlayback.unlockVideoForGesture(v);
            }, { passive: true });
            playBtn.addEventListener("click", async (e) => {
                e.stopPropagation();
                e.preventDefault();
                if (slide !== activeSlide) return;
                FSReelsPlayback.markUserGesture();
                const gen = ++playGeneration;
                if (!hasVideoSource(slide)) {
                    const ok = await loadSlide(slide);
                    if (!ok || gen !== playGeneration) return;
                }
                await startPlayback(slide, gen);
                scheduleOverlaySync(slide);
            });
        }

        const video = getVideo(slide);
        if (slide === activeSlide) {
            applyActiveAudio(video);
        } else {
            silence(video);
        }

        FSReelsPlayback.wireVideoPlayback(slide, video, {
            isActive: (s) => s === activeSlide,
            overlayState: overlayState(),
            onPlaying: (s) => {
                if (s === activeSlide) {
                    trackView(s);
                    prefetchAdjacent(s);
                }
            },
            onEnded: (s) => {
                const ep = parseInt(s.dataset.episode, 10);
                const video = getVideo(s);
                if (ep) {
                    markEpisodeWatched(ep);
                    trackEpisodeComplete(ep, video);
                }
                if (s !== activeSlide) return;

                const showedPrompt = ep ? maybePromptAfterFirstFinish(ep) : false;
                const advance = () => goToNext(s);
                if (showedPrompt) {
                    setTimeout(advance, 900);
                } else {
                    advance();
                }
            },
        });
        video.addEventListener("error", () => {
            if (slide.dataset.loaded !== "1") return;
            showError(slide, "Couldn't play this episode. Try again.");
        });

        wireSeekBar(slide);
        scheduleOverlaySync(slide);

        slide.dataset.hydrated = "1";
        if (prefetchObserver) prefetchObserver.observe(slide);
    }

    function dehydrateSlide(slide) {
        if (!isHydrated(slide) || slide === activeSlide) return;

        destroyHls(slide);
        if (prefetchObserver) prefetchObserver.unobserve(slide);

        const phone = slide.querySelector(".reel-phone");
        phone.classList.add("reel-phone--empty");
        phone.innerHTML = "";
        slide.dataset.hydrated = "0";
        slide.dataset.loaded = "0";
        slide.dataset.loading = "0";
    }

    function ensureWindow(centerEp) {
        const centerIdx = episodes.indexOf(centerEp);
        if (centerIdx < 0) return;

        slides.forEach((slide, idx) => {
            const dist = Math.abs(idx - centerIdx);
            if (dist <= WINDOW_RADIUS) {
                hydrateSlide(slide);
            } else if (dist > WINDOW_RADIUS + 1) {
                dehydrateSlide(slide);
            }
        });
    }

    function setLoading(slide, show) {
        const loading = slide.querySelector(".reel-loading");
        if (loading) loading.hidden = !show;
    }

    function destroyHls(slide) {
        const attachment = hlsBySlide.get(slide);
        if (attachment) {
            FSReelsPlayback.destroyAttachedStream(getVideo(slide), attachment);
            hlsBySlide.delete(slide);
        }
    }

    function pauseAllExcept(exceptSlide) {
        for (const slide of slides) {
            if (!isHydrated(slide)) continue;
            const video = getVideo(slide);
            if (!video) continue;
            if (slide !== exceptSlide) {
                FSReelsPlayback.hardPause(video);
                slide.classList.remove("is-playing");
            } else {
                applyActiveAudio(video);
            }
            syncPlayOverlay(slide);
        }
    }

    /** Pause every hydrated video immediately (used while scrolling). */
    function pauseEverything() {
        playGeneration += 1;
        for (const slide of slides) {
            if (!isHydrated(slide)) continue;
            const video = getVideo(slide);
            if (!video) continue;
            FSReelsPlayback.hardPause(video);
            slide.classList.remove("is-playing");
            syncPlayOverlay(slide);
        }
    }

    function attachRemoteStream(slide, video, url) {
        const attachment = FSReelsPlayback.attachRemoteStream(video, url, {
            onEnded: () => {
                if (slide === activeSlide) goToNext(slide);
            },
            onManifestParsed: () => {
                if (slide === activeSlide) scheduleOverlaySync(slide);
            },
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
        if (!slide || slide.dataset.refreshing === "1") return;
        if (slide.dataset.refreshed === "1") {
            if (slide === activeSlide) showError(slide, "Couldn't play this episode. Try again.");
            return;
        }
        slide.dataset.refreshing = "1";
        const ep = parseInt(slide.dataset.episode, 10);
        try {
            const response = await fetch(`/api/watch/${bookId}/${ep}?refresh=1`);
            if (!response.ok) return;
            const data = await response.json();
            if (data.error || (!data.remote_url && !data.local_url)) return;
            slide.dataset.refreshed = "1";
            playbackCache.set(ep, data);
            destroyHls(slide);
            if (attachSource(slide, data) && slide === activeSlide) {
                const video = getVideo(slide);
                if (video) await FSReelsPlayback.playVideo(video, userMuted);
                scheduleOverlaySync(slide);
            }
        } catch (_) {
            /* leave as-is; user can retry */
        } finally {
            slide.dataset.refreshing = "0";
        }
    }

    function attachSource(slide, data) {
        const video = getVideo(slide);
        if (!video) return false;
        const isActive = slide === activeSlide;
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

        if (isActive) {
            applyActiveAudio(video);
        } else {
            video.pause();
            silence(video);
        }
        if (attached) {
            clearError(slide);
            if (slide === activeSlide) scheduleOverlaySync(slide);
        }
        return attached;
    }

    function prefetchAdjacent(fromSlide) {
        const idx = slideIndex(fromSlide);
        if (idx < 0) return;
        if (idx > 0 && isHydrated(slides[idx - 1])) loadSlide(slides[idx - 1]);
        if (idx < slides.length - 1 && isHydrated(slides[idx + 1])) {
            loadSlide(slides[idx + 1]);
        }
    }

    function maybePromptAfterFirstFinish(episode) {
        if (!episode || document.body.classList.contains("is-logged-in")) return false;
        const shownKey = `fs-signin-shown-${bookId}`;
        try {
            if (sessionStorage.getItem(shownKey) === "1") return false;
        } catch (_) {
            /* ignore */
        }
        const didShow = Boolean(window.FSSignInPrompt?.afterEpisode?.(bookId));
        if (didShow) {
            try {
                sessionStorage.setItem(shownKey, "1");
            } catch (_) {
                /* ignore */
            }
        }
        return didShow;
    }

    async function fetchAndAttachSlide(slide, ep) {
        slide.dataset.loading = "1";
        slide.dataset.loaded = "0";
        setLoading(slide, true);
        clearError(slide);

        try {
            const response = await fetch(`/api/watch/${bookId}/${ep}`);
            const contentType = response.headers.get("content-type") || "";
            if (!contentType.includes("application/json")) {
                showError(slide, "Couldn't load this episode. Try again.");
                return false;
            }
            const data = await response.json();
            if (data.unsupported) {
                showUnsupportedSlide(slide, data);
                return false;
            }
            if (!response.ok || data.error) {
                showError(slide, data.error || "Couldn't load this episode");
                return false;
            }
            playbackCache.set(ep, data);
            const attached = attachSource(slide, data);
            if (!attached) {
                showError(slide, "Couldn't load this episode");
                return false;
            }
            slide.dataset.loaded = "1";
            const hlsAttach = hlsBySlide.get(slide);
            if (hlsAttach?.hls && slide !== activeSlide) {
                void FSReelsPlayback.waitForHlsManifest(hlsAttach.hls, 8000);
            }
            return true;
        } catch (_) {
            showError(slide, "Connection error — check your network");
            return false;
        } finally {
            slide.dataset.loading = "0";
            setLoading(slide, false);
            if (slide === activeSlide) scheduleOverlaySync(slide);
        }
    }

    async function loadSlide(slide) {
        if (!isHydrated(slide)) return false;

        const ep = parseInt(slide.dataset.episode, 10);

        if (playbackCache.has(ep) && hasVideoSource(slide)) {
            slide.dataset.loaded = "1";
            return true;
        }

        if (playbackCache.has(ep) && !hasVideoSource(slide)) {
            attachSource(slide, playbackCache.get(ep));
            if (hasVideoSource(slide)) {
                slide.dataset.loaded = "1";
                return true;
            }
        }

        if (slide.dataset.loaded === "1" && hasVideoSource(slide)) {
            return true;
        }

        if (loadPromises.has(ep)) {
            return loadPromises.get(ep);
        }

        const task = fetchAndAttachSlide(slide, ep);
        loadPromises.set(ep, task);
        try {
            return await task;
        } finally {
            loadPromises.delete(ep);
        }
    }

    function scrollToSlide(slide, smooth = false) {
        const idx = slideIndex(slide);
        if (idx < 0) return;
        const top = idx * slideHeight();
        feed.style.scrollBehavior = smooth ? "smooth" : "auto";
        feed.scrollTop = top;
        if (!smooth) {
            requestAnimationFrame(() => {
                feed.scrollTop = top;
                feed.style.scrollBehavior = "";
            });
        }
    }

    function goToNext(slide) {
        if (slide !== activeSlide || autoAdvancing) return;

        const idx = slideIndex(slide);
        const next = slides[idx + 1];
        if (!next) return;

        const nextEp = episodes[idx + 1];
        autoAdvancing = true;
        ensureWindow(nextEp);
        hydrateSlide(next);
        activeSlide = next;
        pauseAllExcept(next);
        syncAllPlayOverlays();

        const loadNext = loadSlide(next);
        scrollToSlide(next, true);

        const scrollDone = new Promise((resolve) => {
            if ("onscrollend" in feed) {
                feed.addEventListener("scrollend", resolve, { once: true });
            } else {
                setTimeout(resolve, 220);
            }
        });

        void Promise.all([loadNext, scrollDone]).then(async () => {
            autoAdvancing = false;
            const ok = await loadNext;
            if (!ok) {
                syncAllPlayOverlays();
                hideBoot();
                return;
            }
            await playSlide(next);
        });
    }

    function bootstrapStart() {
        const startSlide = slideForEpisode(startEpisode);
        if (!startSlide || !playbackCache.has(startEpisode)) return;

        activeSlide = startSlide;
        hydrateSlide(startSlide);

        if (!hasVideoSource(startSlide)) {
            const attached = attachSource(startSlide, playbackCache.get(startEpisode));
            if (attached) startSlide.dataset.loaded = "1";
        }

        scheduleOverlaySync(startSlide);
    }

    async function playSlide(slide) {
        activeSlide = slide;
        if (!isHydrated(slide)) hydrateSlide(slide);
        syncAllPlayOverlays();

        const gen = ++playGeneration;
        const ep = parseInt(slide.dataset.episode, 10);
        ensureWindow(ep);
        pauseAllExcept(slide);

        const ok = await loadSlide(slide);
        if (gen !== playGeneration) return;
        if (!ok) {
            hideBoot();
            return;
        }

        pauseAllExcept(slide);
        const video = getVideo(slide);
        if (!hasVideoSource(slide)) {
            showError(slide, "Couldn't load this episode");
            hideBoot();
            return;
        }

        const played = await startPlayback(slide, gen);
        hideBoot();
        if (gen !== playGeneration || slide !== activeSlide) {
            if (video) FSReelsPlayback.hardPause(video);
            return;
        }
        if (video && !video.paused) applyActiveAudio(video);
        scheduleOverlaySync(slide);
        syncAllPlayOverlays();

        prefetchAdjacent(slide);

        if (!played) return;

        history.replaceState(null, "", `/watch/${bookId}/${ep}`);
    }

    async function togglePlayback(slide) {
        slide = slide || activeSlide;
        if (!slide) return;

        if (!hasVideoSource(slide)) {
            const ok = await loadSlide(slide);
            if (!ok) return;
        }

        const video = getVideo(slide);
        if (!video) return;

        if (!video.paused) {
            video.pause();
            scheduleOverlaySync(slide);
            return;
        }

        const gen = ++playGeneration;
        await startPlayback(slide, gen);
        scheduleOverlaySync(slide);
    }

    function dominantSlideInView() {
        const feedRect = feed.getBoundingClientRect();
        const centerY = feedRect.top + feedRect.height / 2;
        let best = null;
        let bestDist = Infinity;

        for (const slide of slides) {
            if (!isHydrated(slide)) continue;
            const rect = slide.getBoundingClientRect();
            const dist = Math.abs(rect.top + rect.height / 2 - centerY);
            if (dist < bestDist) {
                bestDist = dist;
                best = slide;
            }
        }
        return best;
    }

    function settleActiveSlide() {
        if (!ready || initializing || autoAdvancing) return;
        const slide = dominantSlideInView();
        if (!slide) return;

        pauseAllExcept(slide);

        const ep = parseInt(slide.dataset.episode, 10);
        ensureWindow(ep);

        if (slide !== activeSlide) {
            playSlide(slide);
            return;
        }

        const video = getVideo(slide);
        if (!video) return;

        applyActiveAudio(video);

        if (
            slide.dataset.loaded === "1" &&
            hasVideoSource(slide) &&
            video.paused &&
            !video.ended
        ) {
            startPlayback(slide, ++playGeneration);
            return;
        }

        scheduleOverlaySync(slide);
    }

    function prefetchVisibleSlides(entries) {
        if (!ready || initializing || autoAdvancing) return;
        for (const entry of entries) {
            if (!entry.isIntersecting || !isHydrated(entry.target)) continue;
            loadSlide(entry.target);
        }
    }

    prefetchObserver = new IntersectionObserver(prefetchVisibleSlides, {
        root: feed,
        threshold: [0.2, 0.45],
    });

    async function init() {
        const startSlide = slideForEpisode(startEpisode);
        if (!startSlide) {
            initializing = false;
            ready = true;
            return;
        }

        // Mobile Safari only autoplays when muted for the first play() call.
        // Do NOT permanently write muted=true into session — that trapped users
        // muted forever after every page load.
        bootstrapStart();

        pauseAllExcept(startSlide);
        ensureWindow(startEpisode);

        await waitForPageReady();
        scrollToSlide(startSlide, false);
        // Show the page shell immediately — don't wait on stream attach.
        hideBoot();
        await waitForLayout();
        scrollToSlide(startSlide, false);

        const bootVideo = getVideo(startSlide);
        if (bootVideo && FSReelsPlayback.isMobileDevice()) {
            FSReelsPlayback.silence(bootVideo);
        }

        await playSlide(startSlide);

        syncAllPlayOverlays();

        await waitForLayout();
        scrollToSlide(startSlide, false);

        initializing = false;
        ready = true;
        syncAllPlayOverlays();
    }

    window.addEventListener("pageshow", (e) => {
        if (!e.persisted) return;
        const slide = activeSlide || slideForEpisode(startEpisode);
        if (!slide) return;
        activeSlide = slide;
        startPlayback(slide, ++playGeneration);
    });

    if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", () => init(), { once: true });
    } else {
        init();
    }

    FSReelsPlayback.bindUserInteraction(feed);

    let scrollSettleTimer = null;
    const SCROLL_SETTLE_MS = 160;

    feed.addEventListener(
        "scroll",
        () => {
            if (!ready || autoAdvancing) return;
            // Invalidate any in-flight play() so a late promise can't resume
            // a video the user already scrolled away from.
            playGeneration += 1;
            const keep = dominantSlideInView();
            if (keep) {
                const ep = parseInt(keep.dataset.episode, 10);
                if (ep) ensureWindow(ep);
            }
            for (const slide of slides) {
                if (!isHydrated(slide)) continue;
                const video = getVideo(slide);
                if (!video) continue;
                // Hard-stop every slide while scrolling — including the
                // momentarily "keep" one — then settle restarts the winner.
                FSReelsPlayback.hardPause(video);
                slide.classList.remove("is-playing");
                syncPlayOverlay(slide);
            }
            clearTimeout(scrollSettleTimer);
            scrollSettleTimer = setTimeout(settleActiveSlide, SCROLL_SETTLE_MS);
        },
        { passive: true }
    );

    feed.addEventListener("scrollend", () => {
        if (!ready || autoAdvancing) return;
        clearTimeout(scrollSettleTimer);
        settleActiveSlide();
    }, { passive: true });
})();
