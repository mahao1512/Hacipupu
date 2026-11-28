(() => {
  const { apiFetch, formatVND, escapeHtml, encodeAssetUrl, addToCart, showToast } = window.HacipupuApp;

  const ACCENTS = [
    { bg: "from-rose-50 to-amber-50", pill: "bg-rose-100 text-[#FF6B6B]", border: "border-rose-100" },
    { bg: "from-emerald-50 to-teal-50", pill: "bg-emerald-100 text-emerald-700", border: "border-emerald-100" },
    { bg: "from-sky-50 to-indigo-50", pill: "bg-sky-100 text-[#4D96FF]", border: "border-sky-100" },
    { bg: "from-purple-50 to-pink-50", pill: "bg-purple-100 text-purple-700", border: "border-purple-100" },
    { bg: "from-amber-50 to-orange-50", pill: "bg-amber-100 text-amber-800", border: "border-amber-100" },
  ];

  let allFiguresCache = [];

  async function loadSeriesShelf() {
    const grid = document.getElementById("series-grid");
    try {
      const seriesList = await apiFetch("/api/series");

      const seriesCountEl = document.getElementById("stat-series-count");
      const figCountEl = document.getElementById("stat-figure-count");
      const secretCountEl = document.getElementById("stat-secret-count");
      if (seriesCountEl) seriesCountEl.textContent = String(seriesList.length);
      if (figCountEl) {
        figCountEl.textContent = String(seriesList.reduce((acc, s) => acc + (s.figure_count || 0), 0));
      }
      if (secretCountEl) {
        secretCountEl.textContent = String(seriesList.reduce((acc, s) => acc + (s.secret_count || 0), 0));
      }

      if (!seriesList.length) {
        grid.innerHTML = `<div class="col-span-full text-center py-12 text-gray-500 font-bold">Chưa có Series nào trong cơ sở dữ liệu.</div>`;
        return;
      }

      grid.innerHTML = seriesList
        .map((series, idx) => {
          const accent = ACCENTS[idx % ACCENTS.length];
          const videoBadge = series.has_local_video ? "🎥 Video Local" : "▶️ Video YouTube";
          return `
            <article class="blind-box-card flex flex-col justify-between p-5">
              <div>
                <div class="flex items-center justify-between gap-2 mb-3">
                  <span class="px-3 py-1 rounded-full text-xs font-extrabold ${accent.pill}">
                    Series #${series.id} • ${series.figure_count || 0} mẫu
                  </span>
                  <span class="px-2.5 py-1 rounded-full bg-gray-100 text-gray-600 text-[11px] font-bold">
                    ${videoBadge}
                  </span>
                </div>

                <div class="card-media relative">
                  <a
                    href="detail.html?id=${series.id}"
                    class="relative w-full rounded-2xl bg-gradient-to-br ${accent.bg} border ${accent.border} p-2 h-60 flex items-center justify-center overflow-hidden"
                    aria-label="Xem và mua ${escapeHtml(series.name)}"
                  >
                    <img
                      src="${encodeAssetUrl(series.lineup_image || series.box_image)}"
                      alt="Toàn bộ nhân vật ${escapeHtml(series.name)}"
                      class="box-art w-full h-full object-contain rounded-xl"
                      onerror="window.HacipupuApp.handleImgError(this)"
                    />
                    <span class="box-reveal-badge absolute bottom-3 left-1/2 -translate-x-1/2 whitespace-nowrap px-4 py-2 rounded-full bg-gray-900/90 text-[#FFD93D] text-xs font-extrabold shadow-lg">
                      🛍️ Xem & mua series này
                    </span>
                  </a>
                  <button type="button" data-unbox-series="${series.id}" class="card-unbox-btn"
                    aria-label="Khui thử 1 blind box ${escapeHtml(series.name)}" title="Chọn 1 trong 5 hộp và khui thử">
                    <span aria-hidden="true">🎲</span> Khui thử
                  </button>
                </div>

                <h3 class="font-display font-bold text-lg sm:text-xl text-gray-900 mt-4 leading-snug line-clamp-2">
                  <a href="detail.html?id=${series.id}" class="hover:text-[#FF6B6B] transition">${escapeHtml(series.name)}</a>
                </h3>
                <p class="text-xs sm:text-sm text-gray-500 font-semibold mt-1.5 line-clamp-2 leading-relaxed">
                  ${escapeHtml(series.description || "")}
                </p>
              </div>

              <div class="mt-5 pt-4 border-t border-gray-100 flex items-center justify-between gap-3">
                <div>
                  <div class="text-[11px] font-bold text-gray-400 uppercase">Blind box / Full set</div>
                  <div class="font-display font-bold text-lg text-[#FF6B6B] leading-tight">
                    ${formatVND(series.blind_box_price)}
                    <span class="text-gray-300">/</span>
                    <span class="text-gray-700">${formatVND(series.full_set_price)}</span>
                  </div>
                </div>
                <a href="detail.html?id=${series.id}" class="inline-flex items-center gap-1.5 px-4 py-2.5 rounded-xl bg-sky-50 hover:bg-sky-100 text-[#4D96FF] font-extrabold text-xs whitespace-nowrap">
                  Khám phá <span>→</span>
                </a>
              </div>
            </article>
          `;
        })
        .join("");

      // Bấm ảnh → trang mua series (thẻ <a>); chỉ nút "Khui thử" mới mở blind box.
      grid.querySelectorAll("[data-unbox-series]").forEach((btn) => {
        btn.addEventListener("click", () => {
          const s = seriesList.find((x) => x.id === Number(btn.dataset.unboxSeries));
          window.HacipupuBlindBox.open(s || Number(btn.dataset.unboxSeries));
        });
      });
    } catch (err) {
      grid.innerHTML = `<div class="col-span-full text-center py-10 text-rose-500 font-bold">Không tải được danh sách Series: ${escapeHtml(err.message)}</div>`;
    }
  }

  function renderFeaturedStrip(mode = "secret") {
    const container = document.getElementById("featured-figures-grid");
    if (!container) return;

    let list = [];
    if (mode === "secret") {
      list = allFiguresCache.filter((f) => Number(f.is_secret) === 1);
    } else {
      list = [...allFiguresCache].sort(() => 0.5 - Math.random()).slice(0, 10);
    }

    if (!list.length) {
      container.innerHTML = `<div class="col-span-full text-center py-10 text-gray-500 font-bold">Chưa có mẫu nào phù hợp.</div>`;
      return;
    }

    container.innerHTML = list
      .map((fig) => {
        const outOfStock = Number(fig.stock) <= 0;
        const isSecret = Number(fig.is_secret) === 1;
        return `
          <div class="figure-card p-3.5 flex flex-col justify-between">
            <div>
              <div class="relative rounded-2xl bg-gradient-to-br from-amber-50/60 to-rose-50/40 p-3 h-40 flex items-center justify-center overflow-hidden">
                ${
                  isSecret
                    ? `<span class="secret-badge absolute top-2 left-2 px-2.5 py-0.5 rounded-full text-[10px] uppercase z-10">👑 SECRET</span>`
                    : ""
                }
                <a href="detail.html?id=${fig.series_id}" class="w-full h-full flex items-center justify-center">
                  <img
                    src="${encodeAssetUrl(fig.image_path)}"
                    alt="${escapeHtml(fig.name)}"
                    class="max-h-32 w-auto object-contain hover:scale-105 transition-transform"
                    onerror="window.HacipupuApp.handleImgError(this)"
                  />
                </a>
              </div>
              <a
                href="detail.html?id=${fig.series_id}"
                class="block mt-2.5 text-[11px] font-bold text-[#4D96FF] truncate hover:underline"
              >
                ${escapeHtml(fig.series_name || `Series #${fig.series_id}`)}
              </a>
              <h4 class="font-display font-bold text-sm text-gray-900 mt-0.5 truncate" title="${escapeHtml(fig.name)}">
                ${escapeHtml(fig.name)}
              </h4>
            </div>

            <div class="mt-3 pt-2.5 border-t border-gray-100 flex items-center justify-between gap-2">
              <div>
                <div class="font-display font-bold text-sm text-[#FF6B6B]">${formatVND(fig.price)}</div>
                <div class="text-[11px] font-bold ${outOfStock ? "text-gray-400" : "text-emerald-600"}">
                  ${outOfStock ? "Hết hàng" : `Còn ${fig.stock}`}
                </div>
              </div>
              <button
                type="button"
                data-add-fig="${fig.id}"
                ${outOfStock ? "disabled" : ""}
                class="px-3 py-1.5 rounded-xl bg-gray-900 hover:bg-[#FF6B6B] text-white text-xs font-extrabold transition cursor-pointer"
                title="Thêm vào giỏ"
              >+ Giỏ</button>
            </div>
          </div>
        `;
      })
      .join("");

    container.querySelectorAll("[data-add-fig]").forEach((btn) => {
      btn.addEventListener("click", async () => {
        const id = Number(btn.dataset.addFig);
        btn.disabled = true;
        try {
          await addToCart("FIGURE", id, 1, false).catch(() => {});
        } finally {
          btn.disabled = false;
        }
      });
    });
  }

  async function loadFeaturedFigures() {
    try {
      allFiguresCache = await apiFetch("/api/figures");
      renderFeaturedStrip("secret");
    } catch (err) {
      showToast("Không tải được danh sách mẫu nổi bật.", "error");
    }
  }

  function initStripFilters() {
    const buttons = document.querySelectorAll("[data-strip-filter]");
    buttons.forEach((btn) => {
      btn.addEventListener("click", () => {
        buttons.forEach((b) => {
          b.classList.remove("bg-[#FFD93D]", "text-gray-900");
          b.classList.add("text-gray-600");
        });
        btn.classList.add("bg-[#FFD93D]", "text-gray-900");
        btn.classList.remove("text-gray-600");
        renderFeaturedStrip(btn.dataset.stripFilter);
      });
    });
  }

  document.addEventListener("DOMContentLoaded", () => {
    loadSeriesShelf();
    loadFeaturedFigures();
    initStripFilters();

    initHeroBox();
  });

  // ---------- Hộp ở banner: nút vòng tròn đổi series, bấm hộp là mở ngay ----------
  let heroSeries = [];
  let heroIndex = 0;

  function renderHeroBox(animate) {
    const s = heroSeries[heroIndex];
    if (!s) return;
    const img = document.getElementById("hero-main-box");
    const apply = () => {
      img.dataset.fallbackStep = "0";
      img.src = encodeAssetUrl(s.box_image_trim || s.box_image);
      img.alt = `Hộp blind box ${window.HacipupuApp.shortSeriesName(s.name)}`;
      document.getElementById("hero-box-name").textContent = window.HacipupuApp.shortSeriesName(s.name);
      document.getElementById("hero-box-price").textContent = `${formatVND(s.blind_box_price)} / hộp`;
      document
        .querySelector("[data-hero-open-box]")
        .setAttribute("aria-label", `Mở ngay 1 blind box ${window.HacipupuApp.shortSeriesName(s.name)}`);
    };
    if (!animate) return apply();
    img.classList.remove("hero-swap-in");
    img.classList.add("hero-swap-out");
    setTimeout(() => {
      apply();
      img.classList.remove("hero-swap-out");
      void img.offsetWidth; // khởi động lại animation
      img.classList.add("hero-swap-in");
    }, 180);
  }

  async function initHeroBox() {
    const openBtn = document.querySelector("[data-hero-open-box]");
    const nextBtn = document.getElementById("hero-next-box");
    try {
      heroSeries = (await apiFetch("/api/series")).filter((s) => s.figure_count > 0);
    } catch (_) {
      heroSeries = [];
    }
    renderHeroBox(false);
    openBtn.addEventListener("click", () => {
      const s = heroSeries[heroIndex];
      if (s) window.HacipupuBlindBox.openInstant(s);
    });
    nextBtn.addEventListener("click", () => {
      if (!heroSeries.length) return;
      heroIndex = (heroIndex + 1) % heroSeries.length;
      nextBtn.classList.remove("is-spinning");
      void nextBtn.offsetWidth;
      nextBtn.classList.add("is-spinning");
      renderHeroBox(true);
    });
  }

  window.addEventListener("hacipupu:order-completed", () => {
    loadSeriesShelf();
    loadFeaturedFigures();
  });
})();
