(function () {
    if (window.FSLoader) {
        FSLoader.wireNavigation();
        FSLoader.bootPage();
    }

    const hero = document.getElementById("featured-hero");
    if (!hero) return;

    const slides = [...hero.querySelectorAll(".featured-slide")];
    const copyEl = document.getElementById("featured-copy");
    const copy = {
        badge: document.getElementById("featured-badge"),
        title: document.getElementById("featured-title"),
        metaLine: document.getElementById("featured-meta-line"),
        genre: document.getElementById("featured-meta-genre"),
        eps: document.getElementById("featured-meta-eps"),
        desc: document.getElementById("featured-desc"),
        play: document.getElementById("featured-play"),
        list: document.getElementById("featured-list"),
    };

    let index = 0;
    let timer = null;
    const interval = parseInt(hero.dataset.interval || "7000", 10);

    function syncDots() {
        hero.querySelectorAll(".featured-dot").forEach((dot) => {
            const dotIndex = parseInt(dot.dataset.index, 10);
            dot.classList.toggle("is-active", dotIndex === index);
        });
    }

    function syncListButton(slide) {
        if (!copy.list) return;
        const inList = slide.dataset.inList === "1";
        const bookId = slide.dataset.bookId || "";
        copy.list.dataset.myList = bookId;
        if (window.FSMyList) {
            window.FSMyList.applyButtonState(copy.list, inList);
            return;
        }
        copy.list.classList.toggle("is-in-list", inList);
        copy.list.setAttribute("aria-pressed", inList ? "true" : "false");
    }

    function syncCopy() {
        const slide = slides[index];
        if (!slide) return;

        if (copyEl) copyEl.classList.add("is-updating");

        if (copy.badge) {
            const badgeText = slide.dataset.badge || "Featured";
            copy.badge.textContent = badgeText;
            copy.badge.classList.toggle(
                "featured-pill--star",
                badgeText.toLowerCase().includes("new season")
            );
        }
        if (copy.title) copy.title.textContent = slide.dataset.title || "";
        if (copy.metaLine) {
            const badge = slide.dataset.badge || "Featured";
            const eps = slide.dataset.eps || "Full season";
            copy.metaLine.textContent = `${badge} · ${eps}`;
        }
        if (copy.genre) copy.genre.textContent = slide.dataset.genre || "Drama";
        if (copy.eps) copy.eps.textContent = slide.dataset.eps || "Full season";
        if (copy.desc) copy.desc.textContent = slide.dataset.desc || "";

        if (copy.play) {
            const bookId = slide.dataset.bookId || "";
            copy.play.href = bookId ? `/watch/${bookId}/1` : "#";
        }

        syncListButton(slide);

        requestAnimationFrame(() => {
            if (copyEl) copyEl.classList.remove("is-updating");
        });
    }

    function goTo(i) {
        index = ((i % slides.length) + slides.length) % slides.length;
        slides.forEach((s, n) => s.classList.toggle("is-active", n === index));
        syncDots();
        syncCopy();
    }

    function startCarousel() {
        if (slides.length < 2) return;
        clearInterval(timer);
        timer = setInterval(() => goTo(index + 1), interval);
    }

    hero.addEventListener("click", (event) => {
        const dot = event.target.closest(".featured-dot");
        if (!dot) return;
        goTo(parseInt(dot.dataset.index, 10));
        startCarousel();
    });

    const DOTS_GAP = 20;
    const DOT_INSET = 3;

    const mobileHeroMq = window.matchMedia("(max-width: 840px)");

    function alignFeaturedDots() {
        const play = copy.play;
        const dots = hero.querySelector(".featured-dots");
        const actions = hero.querySelector(".featured-actions");
        if (!play || !dots || !actions) return;

        const playRect = play.getBoundingClientRect();
        const actionsRect = actions.getBoundingClientRect();
        const borderLeft = parseFloat(getComputedStyle(play).borderLeftWidth) || 0;
        const inset = mobileHeroMq.matches ? 0 : DOT_INSET;
        const left = playRect.left - actionsRect.left + borderLeft + inset;

        if (mobileHeroMq.matches) {
            dots.style.position = "static";
            dots.style.left = "";
            dots.style.top = "";
            dots.style.marginLeft = `${Math.round(left)}px`;
            dots.style.marginTop = "16px";
        } else {
            dots.style.position = "absolute";
            dots.style.marginLeft = "";
            dots.style.marginTop = "";
            dots.style.left = `${Math.round(left)}px`;
            dots.style.top = `${Math.round(playRect.bottom - actionsRect.top + DOTS_GAP)}px`;
        }

        actions.classList.add("is-dots-aligned");
    }

    function bootHero() {
        hero.classList.add("is-booted");
        syncCopy();
        startCarousel();
        alignFeaturedDots();
        requestAnimationFrame(() => {
            alignFeaturedDots();
            requestAnimationFrame(alignFeaturedDots);
        });
    }

    window.addEventListener("resize", alignFeaturedDots);
    window.addEventListener("load", alignFeaturedDots);

    if (document.body.classList.contains("is-ready")) {
        bootHero();
        return;
    }

    const readyObserver = new MutationObserver(() => {
        if (!document.body.classList.contains("is-ready")) return;
        readyObserver.disconnect();
        bootHero();
    });
    readyObserver.observe(document.body, { attributes: true, attributeFilter: ["class"] });
})();
