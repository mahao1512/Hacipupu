(() => {
  const { apiFetch, escapeHtml, encodeAssetUrl, showToast, setOwned, shortSeriesName } = window.HacipupuApp;

  let seriesList = [];
  let figures = [];
  let owned = new Set();
  let filter = "all";

  function renderTotals() {
    const total = figures.length;
    const have = figures.filter((f) => owned.has(f.id)).length;
    document.getElementById("total-owned").textContent = String(have);
    document.getElementById("total-figures").textContent = String(total);
    document.getElementById("total-bar").style.width = total ? `${(have / total) * 100}%` : "0%";
    const complete = seriesList.filter((s) => {
      const figs = figures.filter((f) => f.series_id === s.id && !f.is_secret);
      return figs.length && figs.every((f) => owned.has(f.id));
    }).length;
    document.getElementById("total-sets").textContent = `🏆 Hoàn thành ${complete}/${seriesList.length} series (không tính Secret)`;
  }

  function cardHtml(f) {
    const isOwned = owned.has(f.id);
    const secret = Number(f.is_secret) === 1;
    const label = isOwned ? f.name : secret ? "??? Secret" : f.name;
    return `
      <button type="button" data-toggle-fig="${f.id}" aria-pressed="${isOwned}"
        class="collect-card ${isOwned ? "is-owned" : ""} ${secret ? "is-secret" : ""} text-left cursor-pointer"
        title="${isOwned ? "Bấm để bỏ đánh dấu" : "Bấm để đánh dấu đã có"}">
        <div class="collect-art">
          ${secret && isOwned ? `<span class="secret-badge absolute top-2 left-2 z-10 px-2 py-0.5 rounded-full text-[10px]">👑 SECRET</span>` : ""}
          <img src="${encodeAssetUrl(f.image_path)}" alt="${isOwned ? escapeHtml(f.name) : "Mẫu chưa sở hữu"}" loading="lazy"
            onerror="window.HacipupuApp.handleImgError(this)" />
          <span class="collect-unknown">?</span>
        </div>
        <div class="mt-2 font-display font-bold text-sm ${isOwned ? "text-gray-900" : "text-gray-400"} truncate">${escapeHtml(label)}</div>
        <div class="mt-1 inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-extrabold ${
          isOwned ? "bg-emerald-100 text-emerald-700" : "bg-gray-100 text-gray-500"
        }">${isOwned ? "✓ Đã có" : "+ Đánh dấu đã có"}</div>
      </button>`;
  }

  function render() {
    const root = document.getElementById("collection-root");
    document.querySelectorAll(".coll-filter").forEach((b) => {
      const on = b.dataset.collFilter === filter;
      b.classList.toggle("bg-[#FFD93D]", on);
      b.classList.toggle("text-gray-900", on);
      b.classList.toggle("text-gray-600", !on);
    });
    renderTotals();

    const sections = seriesList
      .map((s) => {
        const all = figures
          .filter((f) => f.series_id === s.id)
          .sort((a, b) => a.is_secret - b.is_secret || a.id - b.id);
        if (!all.length) return "";
        const have = all.filter((f) => owned.has(f.id)).length;
        const shown = all.filter((f) =>
          filter === "owned" ? owned.has(f.id) : filter === "missing" ? !owned.has(f.id) : true
        );
        const pct = Math.round((have / all.length) * 100);
        return `
          <section class="bg-white rounded-[26px] p-5 sm:p-6 border border-gray-200/80 shadow-sm">
            <div class="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-5">
              <div class="flex items-center gap-4 min-w-0">
                <img src="${encodeAssetUrl(s.box_image)}" alt="" class="w-16 h-16 object-contain rounded-2xl bg-amber-50 p-1.5 border border-amber-100 shrink-0"
                  onerror="window.HacipupuApp.handleImgError(this)" />
                <div class="min-w-0">
                  <h2 class="font-display font-bold text-xl text-gray-900 truncate">${escapeHtml(shortSeriesName(s.name))}</h2>
                  <div class="flex items-center gap-3 mt-1">
                    <div class="w-40 h-2 rounded-full bg-gray-100 overflow-hidden">
                      <div class="h-full rounded-full ${pct === 100 ? "bg-emerald-500" : "bg-[#FF6B6B]"}" style="width:${pct}%"></div>
                    </div>
                    <span class="text-xs font-extrabold text-gray-600">${have}/${all.length} mẫu${pct === 100 ? " • Đủ bộ! 🏆" : ""}</span>
                  </div>
                </div>
              </div>
              <div class="flex items-center gap-2 shrink-0">
                <button type="button" data-open-box="${s.id}" class="px-4 py-2 rounded-xl bg-purple-100 hover:bg-purple-200 text-purple-800 text-xs font-extrabold cursor-pointer">🎲 Mở thử blind box</button>
                <a href="detail.html?id=${s.id}" class="px-4 py-2 rounded-xl bg-sky-50 hover:bg-sky-100 text-[#4D96FF] text-xs font-extrabold">Xem series →</a>
              </div>
            </div>
            ${
              shown.length
                ? `<div class="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-3.5">${shown.map(cardHtml).join("")}</div>`
                : `<div class="py-6 text-center text-sm font-bold text-gray-400">${
                    filter === "owned" ? "Chưa có mẫu nào trong series này." : "Bạn đã có đủ tất cả các mẫu! 🎉"
                  }</div>`
            }
          </section>`;
      })
      .join("");

    root.innerHTML = sections || `<div class="text-center py-12 text-gray-500 font-bold">Chưa có series nào.</div>`;

    root.querySelectorAll("[data-toggle-fig]").forEach((btn) =>
      btn.addEventListener("click", async () => {
        const id = Number(btn.dataset.toggleFig);
        try {
          const res = await setOwned(id, !owned.has(id));
          owned = new Set(res.collection);
          const fig = figures.find((f) => f.id === id);
          showToast(res.owned ? `Đã thêm "${fig?.name}" vào bộ sưu tập!` : `Đã bỏ "${fig?.name}" khỏi bộ sưu tập.`, res.owned ? "success" : "info");
          render();
        } catch (err) {
          showToast(err.message, "error");
        }
      })
    );
    root.querySelectorAll("[data-open-box]").forEach((btn) =>
      btn.addEventListener("click", () => window.HacipupuBlindBox.open(Number(btn.dataset.openBox)))
    );
  }

  async function load() {
    try {
      const [s, f, c] = await Promise.all([apiFetch("/api/series"), apiFetch("/api/figures"), apiFetch("/api/collection")]);
      seriesList = s;
      figures = f;
      owned = new Set(c);
      render();
    } catch (err) {
      document.getElementById("collection-root").innerHTML = `<div class="text-center py-10 text-rose-500 font-bold">Không tải được bộ sưu tập: ${escapeHtml(
        err.message
      )}</div>`;
    }
  }

  document.addEventListener("DOMContentLoaded", () => {
    document.querySelectorAll(".coll-filter").forEach((b) =>
      b.addEventListener("click", () => {
        filter = b.dataset.collFilter;
        render();
      })
    );
    load();
  });

  // Khi đánh dấu từ cửa sổ mở hộp hoặc sau khi đặt hàng → cập nhật lại trang.
  window.addEventListener("hacipupu:collection-changed", (e) => {
    owned = new Set(e.detail.collection);
    if (figures.length) render();
  });
})();
