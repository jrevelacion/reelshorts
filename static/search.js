(function () {
    const root = document.getElementById("search-root");
    if (!root) return;

    const query = root.dataset.query || "";
    const page = root.dataset.page || "1";
    const summaryEl = document.getElementById("search-summary");
    const errorEl = document.getElementById("search-remote-error");
    const emptyEl = document.getElementById("search-empty");
    const gridEl = document.getElementById("search-grid");
    const paginationEl = document.getElementById("search-pagination");

    const params = new URLSearchParams({ q: query, page: page });

    fetch(`/api/search?${params}`)
        .then((response) => response.json())
        .then((data) => {
            renderResults(data);
        })
        .catch((err) => {
            if (errorEl) {
                errorEl.hidden = false;
                errorEl.textContent = `Search failed: ${err.message}`;
            }
            if (emptyEl) {
                emptyEl.hidden = false;
                emptyEl.textContent = "Search is temporarily unavailable.";
            }
        })
        .finally(() => {
            window.FSLoader?.hide();
        });

    function renderResults(data) {
        const books = data.books || [];
        const total = data.total || 0;
        const totalPage = data.total_page || 0;

        if (summaryEl) {
            if (total > 0) {
                let text = `${total} result${total !== 1 ? "s" : ""}`;
                if (totalPage > 1) {
                    text += ` · page ${data.page} of ${totalPage}`;
                }
                if (data.remote_added) {
                    text += ` · ${data.remote_added} more from catalog`;
                }
                summaryEl.textContent = text;
            } else {
                summaryEl.textContent = "No results found";
            }
        }

        if (data.error && errorEl) {
            errorEl.hidden = false;
            errorEl.textContent = data.error;
        } else if (errorEl) {
            errorEl.hidden = true;
        }

        if (gridEl) {
            gridEl.innerHTML = books.map((book) => cardHtml(book)).join("");
        }

        if (paginationEl) {
            paginationEl.innerHTML = paginationHtml(data);
        }

        if (emptyEl) {
            emptyEl.hidden = books.length > 0;
            if (!books.length) {
                emptyEl.textContent = "No dramas matched that search.";
            }
        }
    }

    function escapeHtml(s) {
        return String(s)
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/"/g, "&quot;");
    }

    function cardHtml(book) {
        const genres = book.genres || [];
        const gLine = book.genre_line || genres.join(" · ") || "Drama";
        const gTag = book.genre_tag || (genres[0] || "Drama").toUpperCase();
        const epLabel = book.episode_label || "Short series";
        const thumb = book.thumbnail
            ? `<img src="${escapeHtml(book.thumbnail)}" alt="${escapeHtml(book.title)}" loading="lazy">`
            : `<div class="card-v2__placeholder"></div>`;

        return `
            <div role="listitem">
                <a class="card-v2" href="/show/${escapeHtml(book.book_id)}" data-book-id="${escapeHtml(book.book_id)}">
                    <div class="card-v2__media">
                        ${thumb}
                        <div class="card-v2__grad"></div>
                        <span class="card-v2__tag">${escapeHtml(gTag)}</span>
                        <h3 class="card-v2__title">${escapeHtml(book.title)}</h3>
                    </div>
                    <div class="card-v2__meta">
                        <span class="card-v2__label">${escapeHtml(gLine)}</span>
                        <span class="card-v2__stat">${escapeHtml(epLabel)}</span>
                    </div>
                </a>
            </div>
        `;
    }

    function paginationHtml(data) {
        const totalPage = data.total_page || 0;
        if (totalPage <= 1) return "";

        const current = data.page || 1;
        const pages = data.page_numbers || [];
        const q = encodeURIComponent(query);

        let html = '<nav class="pagination shell" aria-label="Pages">';
        if (current > 1) {
            html += `<a class="pagination__btn" href="/search?q=${q}&page=${current - 1}">← Previous</a>`;
        } else {
            html += '<span class="pagination__btn pagination__btn--disabled" aria-hidden="true">← Previous</span>';
        }

        html += '<div class="pagination__pages">';
        for (const item of pages) {
            if (item === null) {
                html += '<span class="pagination__gap" aria-hidden="true">…</span>';
            } else if (item === current) {
                html += `<span class="pagination__page is-active" aria-current="page">${item}</span>`;
            } else {
                html += `<a class="pagination__page" href="/search?q=${q}&page=${item}">${item}</a>`;
            }
        }
        html += "</div>";

        if (current < totalPage) {
            html += `<a class="pagination__btn" href="/search?q=${q}&page=${current + 1}">Next →</a>`;
        } else {
            html += '<span class="pagination__btn pagination__btn--disabled" aria-hidden="true">Next →</span>';
        }
        html += "</nav>";
        return html;
    }
})();
