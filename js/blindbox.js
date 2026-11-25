/*
 * Trò mở blind box, có 2 chế độ:
 *  - "series": hiện hộp của các series (5 series), khách chọn 1 hộp → mở ra
 *    ngẫu nhiên 1 nhân vật thuộc đúng series của hộp đó. (Ảnh hộp ở banner trang chủ.)
 *  - "single": hiện 5 hộp của cùng 1 series. (Ảnh hộp trên từng thẻ series.)
 * Bấm chọn 1 hộp, bấm lần nữa để mở → rung, bung hộp, hiện nhân vật (Secret theo tỷ lệ hiếm).
 */
(() => {
  const { apiFetch, formatVND, escapeHtml, encodeAssetUrl, addToCart, showToast, isStaff, setOwned, shortSeriesName } =
    window.HacipupuApp;

  const BOX_COUNT = 5;
  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const wait = (ms) => new Promise((r) => setTimeout(r, reduceMotion ? Math.min(ms, 120) : ms));

  let mode = "single";
  let seriesChoices = [];
  let series = null;
  let selected = null;
  let busy = false;
  let revealed = null;

  function ensureModal() {
    if (document.getElementById("bb-modal")) return;
    const el = document.createElement("div");
    el.innerHTML = `
      <div id="bb-modal" class="modal-overlay" role="dialog" aria-modal="true" aria-labelledby="bb-title">
        <div class="bb-panel">
          <button type="button" data-bb-close class="absolute top-4 right-4 z-20 w-9 h-9 rounded-full bg-white/90 hover:bg-white text-gray-700 font-bold shadow cursor-pointer" aria-label="Đóng">✕</button>

          <div class="text-center px-6 pt-6">
            <div class="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-white text-purple-700 text-xs font-extrabold shadow-sm">🎲 Blind Box Lucky Pick</div>
            <h3 id="bb-title" class="font-display font-bold text-2xl sm:text-3xl text-gray-900 mt-2"></h3>
            <p id="bb-hint" class="text-sm font-bold text-gray-500 mt-1"></p>
          </div>

          <div id="bb-stage" class="bb-stage">
            <div id="bb-rays" class="bb-rays"></div>
            <div id="bb-flash" class="bb-flash"></div>
            <div id="bb-boxes" class="bb-boxes"></div>
            <div id="bb-reveal" class="bb-reveal hidden"></div>
            <div id="bb-confetti" class="bb-confetti"></div>
          </div>

          <div id="bb-actions" class="px-6 pb-6 flex flex-wrap items-center justify-center gap-2.5"></div>
        </div>
      </div>`;
    document.body.appendChild(el.firstElementChild);
    const modal = document.getElementById("bb-modal");
    modal.addEventListener("click", (e) => {
      if (busy) return;
      if (e.target === modal || e.target.closest("[data-bb-close]")) close();
    });
    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape" && modal.classList.contains("open") && !busy) close();
    });
  }

  function close() {
    document.getElementById("bb-modal").classList.remove("open");
  }

  function renderBoxes() {
    selected = null;
    revealed = null;
    const stage = document.getElementById("bb-stage");
    stage.classList.remove("is-revealed", "is-secret");
    document.getElementById("bb-reveal").classList.add("hidden");
    document.getElementById("bb-confetti").innerHTML = "";
    const boxes = document.getElementById("bb-boxes");
    boxes.classList.remove("hidden");

    if (mode === "series") {
      // Mỗi hộp là 1 series khác nhau — mở ra nhân vật ngẫu nhiên của đúng series đó.
      document.getElementById("bb-title").textContent = "Chọn hộp Blind Box của bạn";
      document.getElementById("bb-hint").textContent = `Mỗi hộp là một series khác nhau. Chọn 1 hộp, bấm lần nữa để mở và nhận 1 nhân vật ngẫu nhiên!`;
      boxes.innerHTML = seriesChoices
        .map(
          (s, i) => `
          <button type="button" class="bb-box has-label" data-bb-box="${i}" data-series-id="${s.id}" style="--i:${i}"
            aria-label="Hộp ${escapeHtml(shortSeriesName(s.name))}">
            <img src="${encodeAssetUrl(s.box_image_trim || s.box_image)}" alt="" draggable="false" onerror="window.HacipupuApp.handleImgError(this)" />
            <span class="bb-box-label">${escapeHtml(shortSeriesName(s.name))}</span>
            <span class="bb-box-num">${i + 1}</span>
          </button>`
        )
        .join("");
    } else if (mode === "instant") {
      // Mở ngay 1 hộp của series đang hiện ở banner — không có bước chọn.
      document.getElementById("bb-title").textContent = shortSeriesName(series.name);
      document.getElementById("bb-hint").textContent = `Đang mở hộp ${shortSeriesName(series.name)}... 🤞`;
      boxes.innerHTML = `
          <button type="button" class="bb-box bb-box-solo" data-bb-box="0" style="--i:0" aria-label="Hộp ${escapeHtml(
            shortSeriesName(series.name)
          )}" tabindex="-1">
            <img src="${encodeAssetUrl(series.box_image_trim || series.box_image)}" alt="" draggable="false" onerror="window.HacipupuApp.handleImgError(this)" />
          </button>`;
      renderActions("busy");
      return;
    } else {
      document.getElementById("bb-title").textContent = shortSeriesName(series.name);
      document.getElementById("bb-hint").textContent = `Chọn 1 trong ${BOX_COUNT} hộp — mỗi hộp ${formatVND(
        series.blind_box_price
      )}. Bấm lần nữa vào hộp đã chọn để mở!`;
      boxes.innerHTML = Array.from({ length: BOX_COUNT })
        .map(
          (_, i) => `
          <button type="button" class="bb-box" data-bb-box="${i}" style="--i:${i}" aria-label="Hộp số ${i + 1}">
            <img src="${encodeAssetUrl(series.box_image_trim || series.box_image)}" alt="" draggable="false" onerror="window.HacipupuApp.handleImgError(this)" />
            <span class="bb-box-num">${i + 1}</span>
          </button>`
        )
        .join("");
    }
    boxes.querySelectorAll("[data-bb-box]").forEach((btn) => btn.addEventListener("click", () => onBoxClick(btn)));
    renderActions("pick");
  }

  function renderActions(view) {
    const wrap = document.getElementById("bb-actions");
    if (view === "pick") {
      wrap.innerHTML = `<button type="button" id="bb-open-btn" disabled class="px-6 py-3 rounded-2xl btn-coral font-extrabold text-sm cursor-pointer">✨ Mở hộp đã chọn</button>
        ${
          mode === "series"
            ? ""
            : `<a href="detail.html?id=${series.id}" class="px-5 py-3 rounded-2xl bg-white hover:bg-gray-50 border border-gray-200 text-gray-700 font-extrabold text-sm">Xem chi tiết series</a>`
        }`;
      document.getElementById("bb-open-btn").addEventListener("click", () => selected && openBox(selected));
      return;
    }
    if (view === "busy") {
      wrap.innerHTML = `<div class="py-3 text-sm font-extrabold text-purple-700">Đang mở hộp...</div>`;
      return;
    }
    const outOfStock = Number(revealed.stock) <= 0;
    wrap.innerHTML = `
      ${
        isStaff()
          ? ""
          : `<button type="button" id="bb-buy-btn" ${outOfStock ? "disabled" : ""} class="px-5 py-3 rounded-2xl btn-coral font-extrabold text-sm cursor-pointer">
               ${outOfStock ? "Mẫu này tạm hết hàng" : `🛒 Mua hộp này — ${formatVND(series.blind_box_price)}`}
             </button>`
      }
      <button type="button" id="bb-collect-btn" class="px-5 py-3 rounded-2xl bg-purple-100 hover:bg-purple-200 text-purple-800 font-extrabold text-sm cursor-pointer">⭐ Đánh dấu "Đã có"</button>
      <button type="button" id="bb-again-btn" class="px-5 py-3 rounded-2xl bg-white hover:bg-gray-50 border border-gray-200 text-gray-700 font-extrabold text-sm cursor-pointer">${
        mode === "instant" ? "🔁 Mở thêm 1 hộp" : "🔁 Chọn lại hộp khác"
      }</button>`;
    document.getElementById("bb-again-btn").addEventListener("click", () =>
      mode === "instant" ? startInstant() : renderBoxes()
    );
    document.getElementById("bb-collect-btn").addEventListener("click", async (e) => {
      try {
        await setOwned(revealed.id, true);
        e.target.disabled = true;
        e.target.textContent = "✓ Đã thêm vào bộ sưu tập";
      } catch (err) {
        showToast(err.message, "error");
      }
    });
    document.getElementById("bb-buy-btn")?.addEventListener("click", async (e) => {
      e.target.disabled = true;
      try {
        await addToCart("BLIND_BOX", series.id, 1, false, { revealedFigureId: revealed.id });
        e.target.textContent = "✓ Đã thêm vào giỏ";
      } catch (_) {
        e.target.disabled = false;
      }
    });
  }

  function onBoxClick(btn) {
    if (busy) return;
    if (selected === btn) {
      openBox(btn);
      return;
    }
    selected = btn;
    document.querySelectorAll("#bb-boxes .bb-box").forEach((b) => b.classList.toggle("is-selected", b === btn));
    document.getElementById("bb-boxes").classList.add("has-selection");
    if (mode === "series") {
      const chosen = seriesChoices.find((x) => x.id === Number(btn.dataset.seriesId));
      document.getElementById("bb-hint").textContent = `Bạn chọn hộp ${shortSeriesName(chosen?.name)} (${formatVND(
        chosen?.blind_box_price
      )}). Bấm vào hộp lần nữa để mở!`;
    } else {
      document.getElementById("bb-hint").textContent = `Bạn đã chọn hộp số ${Number(btn.dataset.bbBox) + 1}. Bấm vào hộp lần nữa để mở!`;
    }
    const openBtn = document.getElementById("bb-open-btn");
    if (openBtn) openBtn.disabled = false;
  }

  function burstConfetti(secret) {
    const layer = document.getElementById("bb-confetti");
    const colors = secret
      ? ["#F59E0B", "#FDE047", "#FBBF24", "#FFFFFF", "#FF6B6B"]
      : ["#FF6B6B", "#FFD93D", "#6BCB77", "#4D96FF", "#A78BFA"];
    const count = reduceMotion ? 0 : secret ? 80 : 48;
    layer.innerHTML = Array.from({ length: count })
      .map(() => {
        const x = (Math.random() * 2 - 1) * 320;
        const y = -(120 + Math.random() * 220);
        const r = Math.floor(Math.random() * 720 - 360);
        const d = (0.9 + Math.random() * 0.8).toFixed(2);
        const c = colors[Math.floor(Math.random() * colors.length)];
        const w = 6 + Math.floor(Math.random() * 6);
        return `<i style="--x:${x}px;--y:${y}px;--r:${r}deg;--d:${d}s;background:${c};width:${w}px;height:${Math.round(
          w * 1.6
        )}px"></i>`;
      })
      .join("");
  }

  async function openBox(btn) {
    if (busy) return;
    busy = true;
    renderActions("busy");
    const stage = document.getElementById("bb-stage");
    const boxes = document.getElementById("bb-boxes");
    try {
      if (mode === "series") {
        series = seriesChoices.find((x) => x.id === Number(btn.dataset.seriesId)) || series;
      }
      const fig = await apiFetch(`/api/draw?series_id=${series.id}`);
      revealed = fig;
      document.getElementById("bb-hint").textContent = "Hồi hộp quá... 🤞";

      // 1) Hộp được chọn bay vào giữa sân khấu và to ra một chút.
      const stageRect = stage.getBoundingClientRect();
      const boxRect = btn.getBoundingClientRect();
      const dx = stageRect.left + stageRect.width / 2 - (boxRect.left + boxRect.width / 2);
      const dy = stageRect.top + stageRect.height / 2 - (boxRect.top + boxRect.height / 2);
      btn.style.setProperty("--dx", `${Math.round(dx)}px`);
      btn.style.setProperty("--dy", `${Math.round(dy)}px`);
      boxes.classList.add("is-opening");
      btn.classList.remove("is-selected");
      btn.classList.add("is-chosen");
      await wait(750);
      // 2) Rung lắc rồi bung hộp.
      btn.classList.add("bb-shake");
      await wait(1100);
      btn.classList.remove("bb-shake");
      btn.classList.add("bb-burst");
      stage.classList.add("is-flashing");
      await wait(380);

      boxes.classList.add("hidden");
      boxes.classList.remove("is-opening", "has-selection");
      const secret = Number(fig.is_secret) === 1;
      document.getElementById("bb-title").textContent = shortSeriesName(series.name);
      stage.classList.add("is-revealed");
      stage.classList.toggle("is-secret", secret);
      const reveal = document.getElementById("bb-reveal");
      reveal.innerHTML = `
        <div class="bb-figure">
          <img src="${encodeAssetUrl(fig.image_path)}" alt="${escapeHtml(fig.name)}" onerror="window.HacipupuApp.handleImgError(this)" />
        </div>
        ${secret ? `<div class="secret-badge inline-block mt-3 px-4 py-1 rounded-full text-xs uppercase">👑 SECRET EDITION — Siêu hiếm!</div>` : ""}
        <div class="bb-name font-display font-bold text-2xl text-gray-900 mt-2">${escapeHtml(fig.name)}</div>
        <div class="text-xs font-extrabold text-[#4D96FF] uppercase tracking-wider">${escapeHtml(shortSeriesName(series.name))}</div>`;
      reveal.classList.remove("hidden");
      burstConfetti(secret);
      document.getElementById("bb-hint").textContent = secret
        ? "Trời ơi! Bạn mở trúng mẫu SECRET! 🎉"
        : "Chúc mừng! Đây là nhân vật trong hộp bạn chọn 🎉";
      await wait(250);
      stage.classList.remove("is-flashing");
      renderActions("result");
    } catch (err) {
      showToast(err.message, "error");
      renderBoxes();
    } finally {
      busy = false;
    }
  }

  async function openBoxPicker(seriesOrId) {
    ensureModal();
    try {
      series =
        typeof seriesOrId === "object" && seriesOrId.blind_box_price
          ? seriesOrId
          : await apiFetch(`/api/series/${typeof seriesOrId === "object" ? seriesOrId.id : seriesOrId}`);
    } catch (err) {
      showToast(err.message, "error");
      return;
    }
    mode = "single";
    renderBoxes();
    document.getElementById("bb-modal").classList.add("open");
  }

  /** Chọn 1 hộp trong các series (tối đa 5), mở ra nhân vật thuộc đúng series của hộp. */
  async function openSeriesPicker() {
    ensureModal();
    try {
      const list = await apiFetch("/api/series");
      seriesChoices = list.filter((s) => s.figure_count > 0).slice(0, BOX_COUNT);
    } catch (err) {
      showToast(err.message, "error");
      return;
    }
    if (!seriesChoices.length) return showToast("Chưa có series nào để mở.", "error");
    mode = "series";
    series = seriesChoices[0];
    renderBoxes();
    document.getElementById("bb-modal").classList.add("open");
  }

  /** Hiện 1 hộp và tự mở luôn (dùng cho hộp ở banner trang chủ). */
  async function startInstant() {
    renderBoxes();
    await wait(380);
    const btn = document.querySelector("#bb-boxes .bb-box");
    if (btn) openBox(btn);
  }

  async function openInstant(seriesOrId) {
    if (busy) return;
    ensureModal();
    try {
      series =
        typeof seriesOrId === "object" && seriesOrId.blind_box_price
          ? seriesOrId
          : await apiFetch(`/api/series/${typeof seriesOrId === "object" ? seriesOrId.id : seriesOrId}`);
    } catch (err) {
      showToast(err.message, "error");
      return;
    }
    mode = "instant";
    document.getElementById("bb-modal").classList.add("open");
    startInstant();
  }

  window.HacipupuBlindBox = { open: openBoxPicker, openSeries: openSeriesPicker, openInstant };
})();
