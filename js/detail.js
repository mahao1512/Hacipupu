(() => {
  const { apiFetch, formatVND, escapeHtml, encodeAssetUrl, addToCart, showToast } = window.HacipupuApp;

  let currentSeries = null;
  let currentFilter = "all";
  let activeLightboxFigure = null;

  function getSeriesIdFromUrl() {
    const params = new URLSearchParams(window.location.search);
    const id = Number(params.get("id"));
    return Number.isInteger(id) && id > 0 ? id : 1;
  }

  /** Lấy mã video từ mọi dạng link YouTube: /embed/ID, watch?v=ID, youtu.be/ID, /shorts/ID. */
  function youtubeId(url) {
    const m = String(url || "").match(
      /(?:youtube(?:-nocookie)?\.com\/(?:embed\/|shorts\/|live\/|watch\?(?:.*&)?v=)|youtu\.be\/)([\w-]{11})/
    );
    return m ? m[1] : "";
  }

  function renderVideoPlayer(series) {
    const container = document.getElementById("video-container");
    const badge = document.getElementById("media-type-badge");
    if (!container) return;

    if (series.has_local_video && series.local_video) {
      if (badge) {
        badge.textContent = "🎥 Video Mở Hộp (Local MP4)";
        badge.className = "inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-emerald-100 text-emerald-700 text-xs font-extrabold";
      }
      container.innerHTML = `
        <video
          controls
          playsinline
          preload="metadata"
          poster="${encodeAssetUrl(series.lineup_image || series.box_image)}"
        >
          <source src="${encodeAssetUrl(series.local_video)}" type="video/mp4" />
          Trình duyệt của bạn không hỗ trợ phát video MP4.
        </video>
      `;
    } else if (youtubeId(series.youtube_embed_url)) {
      const id = youtubeId(series.youtube_embed_url);
      if (badge) {
        badge.textContent = "▶️ Video Giới Thiệu YouTube";
        badge.className = "inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-rose-100 text-[#FF6B6B] text-xs font-extrabold";
      }
      if (window.location.protocol === "file:") {
        // Mở trực tiếp file HTML (file://) thì YouTube báo "Lỗi 153" vì trang không có địa chỉ web.
        // Khi đó hiện ảnh bìa video, bấm vào sẽ xem trên YouTube. Trên GitHub Pages video phát bình thường.
        container.innerHTML = `
          <a href="https://www.youtube.com/watch?v=${id}" target="_blank" rel="noopener"
            class="absolute inset-0 flex items-center justify-center group" aria-label="Xem video trên YouTube">
            <img src="https://i.ytimg.com/vi/${id}/hqdefault.jpg" alt="" class="absolute inset-0 w-full h-full object-cover opacity-90 group-hover:opacity-100 transition" />
            <span class="relative w-16 h-11 rounded-xl bg-[#FF0000] flex items-center justify-center shadow-lg group-hover:scale-110 transition">
              <svg viewBox="0 0 24 24" class="w-6 h-6 fill-white"><path d="M8 5v14l11-7z"/></svg>
            </span>
            <span class="absolute bottom-3 left-1/2 -translate-x-1/2 px-3 py-1 rounded-full bg-black/70 text-white text-[11px] font-bold whitespace-nowrap">
              Bấm để xem trên YouTube ↗
            </span>
          </a>`;
      } else {
        container.innerHTML = `
          <iframe
            width="560"
            height="315"
            src="https://www.youtube.com/embed/${id}?rel=0&playsinline=1"
            title="Video giới thiệu ${escapeHtml(series.name)}"
            frameborder="0"
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
            referrerpolicy="strict-origin-when-cross-origin"
            allowfullscreen
          ></iframe>
        `;
      }
    } else {
      container.innerHTML = `
        <img
          src="${encodeAssetUrl(series.lineup_image || series.box_image)}"
          alt="${escapeHtml(series.name)}"
          class="absolute inset-0 w-full h-full object-contain bg-amber-50 p-4"
          onerror="window.HacipupuApp.handleImgError(this)"
        />
      `;
    }
  }

  function openLightbox({ title, subtitle, image, price = null, stock = null, isSecret = false, figure = null }) {
    activeLightboxFigure = figure;
    document.getElementById("lightbox-img").src = encodeAssetUrl(image);
    document.getElementById("lightbox-title").textContent = title;
    document.getElementById("lightbox-subtitle").textContent = subtitle;

    const secretBadge = document.getElementById("lightbox-secret-badge");
    if (isSecret) secretBadge.classList.remove("hidden");
    else secretBadge.classList.add("hidden");

    const meta = document.getElementById("lightbox-meta");
    const addBtn = document.getElementById("lightbox-add-btn");
    if (figure) {
      meta.classList.remove("hidden");
      addBtn.classList.remove("hidden");
      document.getElementById("lightbox-price").textContent = formatVND(price);
      const stockEl = document.getElementById("lightbox-stock");
      const out = Number(stock) <= 0;
      stockEl.textContent = out ? "Hết hàng" : `Còn ${stock} mẫu`;
      stockEl.className = out
        ? "text-xs font-extrabold px-3 py-1 rounded-full bg-gray-100 text-gray-500"
        : "text-xs font-extrabold px-3 py-1 rounded-full bg-emerald-100 text-emerald-700";
      addBtn.disabled = out;
      addBtn.textContent = out ? "Tạm hết hàng" : "🛒 Thêm mẫu này vào giỏ";
    } else {
      meta.classList.add("hidden");
      addBtn.classList.add("hidden");
    }

    document.getElementById("lightbox-modal").classList.add("open");
  }

  function closeLightbox() {
    document.getElementById("lightbox-modal").classList.remove("open");
    activeLightboxFigure = null;
  }

  function renderFiguresGrid() {
    const grid = document.getElementById("figures-grid");
    if (!grid || !currentSeries) return;

    let figures = currentSeries.figures || [];
    if (currentFilter === "instock") {
      figures = figures.filter((f) => Number(f.stock) > 0);
    } else if (currentFilter === "secret") {
      figures = figures.filter((f) => Number(f.is_secret) === 1);
    }

    if (!figures.length) {
      grid.innerHTML = `<div class="col-span-full text-center py-10 text-gray-500 font-bold text-sm">Không có mẫu figure nào trong bộ lọc này.</div>`;
      return;
    }

    grid.innerHTML = figures
      .map((fig) => {
        const isSecret = Number(fig.is_secret) === 1;
        const outOfStock = Number(fig.stock) <= 0;
        return `
          <div class="figure-card p-3 flex flex-col justify-between ${isSecret ? "ring-2 ring-amber-300 bg-amber-50/20" : ""}">
            <div>
              <div
                data-inspect-fig="${fig.id}"
                class="relative rounded-2xl bg-gradient-to-br from-gray-50 to-amber-50/40 p-2.5 h-36 flex items-center justify-center cursor-zoom-in overflow-hidden group"
              >
                ${
                  isSecret
                    ? `<span class="secret-badge absolute top-2 left-2 px-2 py-0.5 rounded-full text-[10px] uppercase z-10">👑 SECRET</span>`
                    : ""
                }
                <img
                  src="${encodeAssetUrl(fig.image_path)}"
                  alt="${escapeHtml(fig.name)}"
                  class="max-h-28 w-auto object-contain group-hover:scale-105 transition-transform"
                  onerror="window.HacipupuApp.handleImgError(this)"
                />
              </div>

              <h3 class="font-display font-bold text-sm text-gray-900 mt-2.5 truncate" title="${escapeHtml(fig.name)}">
                ${escapeHtml(fig.name)}
              </h3>
              <div class="flex items-center justify-between mt-1">
                <span class="font-display font-bold text-sm text-[#FF6B6B]">${formatVND(fig.price)}</span>
                <span class="text-[11px] font-extrabold ${outOfStock ? "text-gray-400" : "text-emerald-600"}">
                  ${outOfStock ? "Hết hàng" : `Còn ${fig.stock}`}
                </span>
              </div>
            </div>

            <button
              type="button"
              data-add-fig="${fig.id}"
              ${outOfStock ? "disabled" : ""}
              class="mt-3 w-full py-2 rounded-xl ${
                outOfStock
                  ? "bg-gray-100 text-gray-400"
                  : "bg-gray-900 hover:bg-[#FF6B6B] text-white"
              } font-extrabold text-xs transition cursor-pointer"
            >
              ${outOfStock ? "Hết hàng" : "+ Thêm vào giỏ"}
            </button>
          </div>
        `;
      })
      .join("");

    grid.querySelectorAll("[data-inspect-fig]").forEach((el) => {
      el.addEventListener("click", () => {
        const figId = Number(el.dataset.inspectFig);
        const fig = currentSeries.figures.find((f) => f.id === figId);
        if (!fig) return;
        openLightbox({
          title: fig.name,
          subtitle: currentSeries.name,
          image: fig.image_path,
          price: fig.price,
          stock: fig.stock,
          isSecret: Number(fig.is_secret) === 1,
          figure: fig,
        });
      });
    });

    grid.querySelectorAll("[data-add-fig]").forEach((btn) => {
      btn.addEventListener("click", async () => {
        const figId = Number(btn.dataset.addFig);
        btn.disabled = true;
        try {
          await addToCart("FIGURE", figId, 1, false).catch(() => {});
        } finally {
          const fig = currentSeries.figures.find((f) => f.id === figId);
          btn.disabled = fig ? Number(fig.stock) <= 0 : false;
        }
      });
    });
  }

  async function loadSeriesSwitcher(activeId) {
    const switcher = document.getElementById("series-switcher");
    if (!switcher) return;
    try {
      const list = await apiFetch("/api/series");
      switcher.innerHTML = list
        .map((s) => {
          const active = s.id === activeId;
          const shortName = s.name.replace("HACIPUPU ", "").replace(" Series Figures", "");
          return `
            <a
              href="detail.html?id=${s.id}"
              class="shrink-0 px-3.5 py-1.5 rounded-full text-xs font-extrabold border transition ${
                active
                  ? "bg-[#FF6B6B] text-white border-[#FF6B6B] shadow-sm"
                  : "bg-white text-gray-600 border-gray-200 hover:border-[#FF6B6B] hover:text-[#FF6B6B]"
              }"
            >
              ${escapeHtml(shortName)}
            </a>
          `;
        })
        .join("");
    } catch (_) {}
  }

  async function loadSeriesDetail() {
    const seriesId = getSeriesIdFromUrl();
    loadSeriesSwitcher(seriesId);

    try {
      const series = await apiFetch(`/api/series/${seriesId}`);
      currentSeries = series;

      document.title = `${series.name} — HACIPUPU Toy Box`;
      document.getElementById("breadcrumb-series-name").textContent = series.name;
      document.getElementById("series-title").textContent = series.name;
      document.getElementById("series-description").textContent = series.description || "";
      document.getElementById("series-count-pill").textContent = `🧸 ${series.figure_count || 0} mẫu nhân vật`;
      document.getElementById("full-set-price").textContent = formatVND(series.full_set_price);
      document.getElementById("blind-box-price").textContent = formatVND(series.blind_box_price);
      document.getElementById("full-set-count").textContent = String(
        (series.figures || []).filter((f) => !Number(f.is_secret)).length
      );

      const boxImg = document.getElementById("series-box-img");
      boxImg.src = encodeAssetUrl(series.box_image);
      const lineupImg = document.getElementById("series-lineup-img");
      lineupImg.src = encodeAssetUrl(series.lineup_image || series.box_image);

      document.getElementById("box-preview-card").onclick = () =>
        openLightbox({
          title: `Vỏ Hộp ${series.name}`,
          subtitle: "Packaging Preview",
          image: series.box_image,
        });

      document.getElementById("lineup-preview-card").onclick = () =>
        openLightbox({
          title: `Đội Hình ${series.name}`,
          subtitle: "Full Lineup Poster",
          image: series.lineup_image || series.box_image,
        });

      renderVideoPlayer(series);
      renderFiguresGrid();
    } catch (err) {
      showToast(err.message, "error");
      document.getElementById("series-title").textContent = "Không tìm thấy Series này";
    }
  }

  document.addEventListener("DOMContentLoaded", () => {
    loadSeriesDetail();

    document.getElementById("add-full-set-btn").addEventListener("click", async () => {
      if (!currentSeries) return;
      await addToCart("FULL_SET", currentSeries.id, 1, true).catch(() => {});
    });

    let bbQty = 1;
    const setQty = (n) => {
      bbQty = Math.max(1, Math.min(20, n));
      document.getElementById("bb-qty").textContent = String(bbQty);
    };
    document.getElementById("bb-qty-dec").addEventListener("click", () => setQty(bbQty - 1));
    document.getElementById("bb-qty-inc").addEventListener("click", () => setQty(bbQty + 1));
    document.getElementById("add-blind-box-btn").addEventListener("click", async () => {
      if (!currentSeries) return;
      await addToCart("BLIND_BOX", currentSeries.id, bbQty, true).catch(() => {});
    });
    document.getElementById("pick-box-btn").addEventListener("click", () => {
      if (currentSeries) window.HacipupuBlindBox.open(currentSeries);
    });

    document.querySelectorAll("[data-fig-filter]").forEach((btn) => {
      btn.addEventListener("click", () => {
        currentFilter = btn.dataset.figFilter;
        document.querySelectorAll("[data-fig-filter]").forEach((b) => {
          b.classList.remove("bg-white", "text-gray-900", "shadow-sm");
          b.classList.add("text-gray-600");
        });
        btn.classList.add("bg-white", "text-gray-900", "shadow-sm");
        btn.classList.remove("text-gray-600");
        renderFiguresGrid();
      });
    });

    document.getElementById("close-lightbox-btn").addEventListener("click", closeLightbox);
    document.getElementById("lightbox-modal").addEventListener("click", (e) => {
      if (e.target.id === "lightbox-modal") closeLightbox();
    });
    document.getElementById("lightbox-add-btn").addEventListener("click", async () => {
      if (!activeLightboxFigure) return;
      await addToCart("FIGURE", activeLightboxFigure.id, 1, false).catch(() => {});
      closeLightbox();
    });
  });

  window.addEventListener("hacipupu:order-completed", () => {
    loadSeriesDetail();
  });
})();
