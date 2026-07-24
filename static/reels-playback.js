/**
 * Shared reels playback helpers.
 *
 * Hard rules:
 * - Only the active slide may play. Any other video is paused + silenced.
 * - Play button is hidden whenever the active video is not paused.
 * - Mute preference is respected after the first successful play (muted-first
 *   is only used to satisfy autoplay policy, then we unmute if user wants sound).
 */
(function (global) {
    const MUTE_KEY = "freeshort-muted";
    let gestureUnlocked = false;
    let gestureUnlockTime = 0;

    function getUserMuted() {
        return sessionStorage.getItem(MUTE_KEY) === "1";
    }

    function setUserMuted(value) {
        sessionStorage.setItem(MUTE_KEY, value ? "1" : "0");
    }

    function isMobileDevice() {
        if (typeof navigator === "undefined") return false;
        const ua = navigator.userAgent || "";
        if (/iPhone|iPad|iPod|Android/i.test(ua)) return true;
        try {
            return window.matchMedia("(hover: none) and (pointer: coarse)").matches;
        } catch (_) {
            return false;
        }
    }

    function isAppleWebKit() {
        const ua = navigator.userAgent || "";
        return (
            /iPhone|iPad|iPod/i.test(ua) ||
            (/Macintosh/i.test(ua) && "ontouchend" in document)
        );
    }

    function markUserGesture() {
        gestureUnlocked = true;
        gestureUnlockTime = Date.now();
    }

    function hasRecentGesture() {
        return gestureUnlocked && Date.now() - gestureUnlockTime < 8000;
    }

    function prepareVideoElement(video) {
        if (!video) return;
        video.playsInline = true;
        video.setAttribute("playsinline", "");
        video.setAttribute("webkit-playsinline", "");
        video.setAttribute("x-webkit-airplay", "allow");
    }

    function supportsNativeHls(video) {
        if (!video || typeof video.canPlayType !== "function") return false;
        const v = video.canPlayType("application/vnd.apple.mpegurl");
        return v === "probably" || v === "maybe";
    }

    function isHlsUrl(url) {
        return /\.m3u8(\?|$)/i.test(url || "");
    }

    function isMp4Url(url) {
        return /\.mp4(\?|$)/i.test(url || "");
    }

    function videoHasLoadedSource(video) {
        if (!video) return false;
        return Boolean(
            video.currentSrc ||
                (video.src && video.src !== window.location.href) ||
                video.querySelector("source[src]")
        );
    }

    function applyActiveAudio(video, muted) {
        if (!video) return;
        const isMuted = muted !== undefined ? muted : getUserMuted();
        video.volume = 1;
        video.muted = !!isMuted;
        if (isMuted) video.setAttribute("muted", "");
        else video.removeAttribute("muted");
    }

    function silence(video) {
        if (!video) return;
        video.muted = true;
        video.setAttribute("muted", "");
    }

    /** Hard stop — pause and mute. Used for every non-active slide. */
    function hardPause(video) {
        if (!video) return;
        try {
            video.pause();
        } catch (_) {
            /* ignore */
        }
        silence(video);
    }

    function unlockVideoForGesture(video) {
        markUserGesture();
        if (!video) return;
        prepareVideoElement(video);
        // Never play() an empty video — that bricks some iOS builds.
        if (!videoHasLoadedSource(video)) return;
    }

    function bindUserInteraction(root) {
        if (!root || root.dataset.fsGestureBound === "1") return;
        root.dataset.fsGestureBound = "1";
        const onGesture = function () {
            markUserGesture();
        };
        root.addEventListener("touchstart", onGesture, { passive: true, capture: true });
        root.addEventListener("pointerdown", onGesture, { passive: true, capture: true });
    }

    /**
     * Start playback. Always try muted first on mobile for autoplay policy,
     * then unmute immediately if the user preference is unmuted.
     */
    async function playVideo(video, userMuted, options) {
        options = options || {};
        if (!video) return false;
        prepareVideoElement(video);
        video.volume = 1;

        const wantMuted = userMuted !== undefined ? !!userMuted : getUserMuted();
        const mobile = isMobileDevice() || isAppleWebKit();

        async function attempt(muted) {
            applyActiveAudio(video, muted);
            try {
                const p = video.play();
                if (p && typeof p.then === "function") await p;
                return !video.paused;
            } catch (_) {
                return false;
            }
        }

        if (wantMuted) {
            return attempt(true);
        }

        // Want sound: on mobile, muted-start then unmute (autoplay policy).
        if (mobile) {
            if (!(await attempt(true))) return false;
            applyActiveAudio(video, false);
            try {
                await video.play();
            } catch (_) {
                // Keep playing muted rather than stopping entirely.
                applyActiveAudio(video, true);
            }
            return !video.paused;
        }

        if (await attempt(false)) return true;
        return attempt(true);
    }

    async function togglePlay(video, userMuted) {
        if (!video) return false;
        if (!video.paused) {
            hardPause(video);
            return false;
        }
        markUserGesture();
        return playVideo(video, userMuted, { withinGesture: true });
    }

    function clearVideoSource(video) {
        if (!video) return;
        hardPause(video);
        video.removeAttribute("src");
        while (video.firstChild) video.removeChild(video.firstChild);
        try {
            video.load();
        } catch (_) {
            /* ignore */
        }
    }

    function attachRemoteStream(video, url, handlers) {
        handlers = handlers || {};
        if (!video || !url) return null;

        prepareVideoElement(video);
        clearVideoSource(video);

        const nativeHls = supportsNativeHls(video);
        const hlsUrl = isHlsUrl(url);
        const mp4Url = isMp4Url(url);
        const useHlsJs = typeof Hls !== "undefined" && Hls.isSupported();
        const preferNative = nativeHls && hlsUrl && (isAppleWebKit() || !useHlsJs);

        if (preferNative || (nativeHls && hlsUrl && !useHlsJs)) {
            video.src = url;
            video.load();
            return { type: "native", hls: null };
        }

        if (useHlsJs && (hlsUrl || !mp4Url)) {
            const hls = new Hls({
                enableWorker: true,
                lowLatencyMode: false,
                maxBufferLength: 30,
                backBufferLength: 30,
            });
            hls.loadSource(url);
            hls.attachMedia(video);
            if (handlers.onEnded) hls.on(Hls.Events.ENDED, handlers.onEnded);
            if (handlers.onManifestParsed) {
                hls.on(Hls.Events.MANIFEST_PARSED, handlers.onManifestParsed);
            }
            if (handlers.onError) hls.on(Hls.Events.ERROR, handlers.onError);
            return { type: "hls.js", hls: hls };
        }

        video.src = url;
        video.load();
        return { type: "native", hls: null };
    }

    function destroyAttachedStream(video, attachment) {
        if (attachment && attachment.hls) {
            try {
                attachment.hls.destroy();
            } catch (_) {
                /* ignore */
            }
        }
        clearVideoSource(video);
    }

    function videoHasSource(video, attachment) {
        if (!video) return false;
        if (attachment && attachment.hls) return true;
        return videoHasLoadedSource(video);
    }

    function waitForHlsManifest(hls, timeoutMs) {
        timeoutMs = timeoutMs || 10000;
        if (!hls) return Promise.resolve();
        if (hls.levels && hls.levels.length > 0) return Promise.resolve();
        return new Promise(function (resolve) {
            var done = false;
            var timer = setTimeout(function () {
                if (!done) {
                    done = true;
                    resolve();
                }
            }, timeoutMs);
            function finish() {
                if (done) return;
                done = true;
                clearTimeout(timer);
                resolve();
            }
            hls.once(Hls.Events.MANIFEST_PARSED, finish);
            hls.once(Hls.Events.ERROR, function (_, data) {
                if (data && data.fatal) finish();
            });
        });
    }

    function waitForCanPlay(video, timeoutMs) {
        if (!video) return Promise.resolve();
        if (video.readyState >= 2) return Promise.resolve();
        timeoutMs = timeoutMs || (isMobileDevice() || isAppleWebKit() ? 12000 : 10000);
        return new Promise(function (resolve) {
            var done = false;
            var timer = setTimeout(function () {
                if (!done) {
                    done = true;
                    cleanup();
                    resolve();
                }
            }, timeoutMs);
            function finish() {
                if (done) return;
                done = true;
                cleanup();
                resolve();
            }
            function cleanup() {
                clearTimeout(timer);
                video.removeEventListener("canplay", finish);
                video.removeEventListener("loadeddata", finish);
                video.removeEventListener("loadedmetadata", finish);
            }
            video.addEventListener("canplay", finish, { once: true });
            video.addEventListener("loadeddata", finish, { once: true });
            video.addEventListener("loadedmetadata", finish, { once: true });
        });
    }

    async function startSlidePlayback(slide, ctx) {
        const gen = ctx.gen;
        const isStale = ctx.isStale;
        const getVideo = ctx.getVideo;
        const getAttachment = ctx.getAttachment;
        const overlayState = ctx.overlayState;
        const userMuted =
            ctx.userMuted !== undefined ? ctx.userMuted : getUserMuted();
        const video = getVideo(slide);
        if (!video) return false;

        if (isStale(gen, slide)) return false;
        if (overlayState) syncPlayOverlay(slide, overlayState);

        const attachment = getAttachment ? getAttachment(slide) : null;
        if (attachment && attachment.hls) {
            await waitForHlsManifest(attachment.hls);
            if (isStale(gen, slide)) {
                hardPause(video);
                return false;
            }
        }

        if (isStale(gen, slide)) return false;

        await waitForCanPlay(video);
        if (isStale(gen, slide)) {
            hardPause(video);
            return false;
        }

        const ok = await playVideo(video, userMuted, {
            withinGesture: hasRecentGesture(),
        });

        // Stale race: we started play after user scrolled away — kill it.
        if (isStale(gen, slide)) {
            hardPause(video);
            if (overlayState) syncPlayOverlay(slide, overlayState);
            return false;
        }

        if (overlayState) syncPlayOverlay(slide, overlayState);
        return ok;
    }

    const overlaySyncTimers = new WeakMap();

    function syncPlayOverlay(slide, state) {
        if (!slide || !state) return;
        const getVideo = state.getVideo;
        const isActive = state.isActive;
        const hasSource = state.hasSource;
        const isAdvancing = state.isAdvancing;
        const getBtn = state.getBtn;
        const isLoading = state.isLoading ? state.isLoading(slide) : false;
        const video = getVideo(slide);
        const btn = getBtn(slide);
        if (!btn || !video) return;

        const active = isActive(slide);
        const playing = active && !video.paused && !video.ended;

        // Never show the play button over a playing video.
        const show =
            active &&
            !playing &&
            video.paused &&
            !video.ended &&
            !isAdvancing() &&
            (hasSource(slide) || isLoading);

        btn.hidden = !show;
        btn.style.display = show ? "" : "none";
        btn.setAttribute(
            "aria-label",
            isLoading && !hasSource(slide) ? "Loading" : "Play"
        );
        btn.classList.toggle(
            "reel-play-btn--waiting",
            show && isLoading && !hasSource(slide)
        );
        slide.classList.toggle("is-playing", playing);

        if (!show) {
            btn.classList.remove("reel-play-btn--pulse");
            return;
        }
        btn.classList.add("reel-play-btn--pulse");
    }

    function scheduleOverlaySync(slide, state) {
        if (!slide || !state) return;
        const prev = overlaySyncTimers.get(slide);
        if (prev) cancelAnimationFrame(prev);
        const id = requestAnimationFrame(function () {
            overlaySyncTimers.delete(slide);
            syncPlayOverlay(slide, state);
        });
        overlaySyncTimers.set(slide, id);
    }

    function wireVideoPlayback(slide, video, handlers) {
        if (!video || video.dataset.fsPlaybackWired === "1") return;
        video.dataset.fsPlaybackWired = "1";
        prepareVideoElement(video);

        const isActive = handlers.isActive;
        const onPlaying = handlers.onPlaying;
        const onPause = handlers.onPause;
        const onEnded = handlers.onEnded;
        const overlayState = handlers.overlayState;

        function bumpOverlay() {
            if (overlayState) syncPlayOverlay(slide, overlayState);
        }

        video.addEventListener("play", function () {
            if (!isActive(slide)) {
                hardPause(video);
            }
            bumpOverlay();
        });
        video.addEventListener("playing", function () {
            if (!isActive(slide)) {
                hardPause(video);
                bumpOverlay();
                return;
            }
            if (onPlaying) onPlaying(slide);
            bumpOverlay();
        });
        video.addEventListener("pause", function () {
            if (onPause) onPause(slide);
            bumpOverlay();
        });
        video.addEventListener("ended", function () {
            bumpOverlay();
            if (onEnded) onEnded(slide);
        });
        video.addEventListener("waiting", bumpOverlay);
        video.addEventListener("stalled", bumpOverlay);
        video.addEventListener("canplay", bumpOverlay);
        video.addEventListener("timeupdate", function () {
            // Keep overlay honest while playing (cheap; only toggles class/hidden).
            if (isActive(slide)) bumpOverlay();
        });
    }

    global.FSReelsPlayback = {
        getUserMuted: getUserMuted,
        setUserMuted: setUserMuted,
        isMobileDevice: isMobileDevice,
        markUserGesture: markUserGesture,
        unlockVideoForGesture: unlockVideoForGesture,
        bindUserInteraction: bindUserInteraction,
        prepareVideoElement: prepareVideoElement,
        applyActiveAudio: applyActiveAudio,
        silence: silence,
        hardPause: hardPause,
        attachRemoteStream: attachRemoteStream,
        destroyAttachedStream: destroyAttachedStream,
        videoHasSource: videoHasSource,
        waitForHlsManifest: waitForHlsManifest,
        waitForCanPlay: waitForCanPlay,
        playVideo: playVideo,
        togglePlay: togglePlay,
        startSlidePlayback: startSlidePlayback,
        syncPlayOverlay: syncPlayOverlay,
        scheduleOverlaySync: scheduleOverlaySync,
        wireVideoPlayback: wireVideoPlayback,
    };
})(window);
