(() => {
  const { apiFetch, formatVND, escapeHtml, encodeAssetUrl, showToast, isStaff, openLoginModal, shortSeriesName } =
    window.HacipupuApp;

  const LOW_STOCK = 3;
  const TABS = {
    kho: { title: "Quản Lý Kho", subtitle: "Theo dõi số lượng hàng tồn của từng series và từng mẫu." },
    "don-hang": { title: "Đơn Hàng", subtitle: "Duyệt đơn và cập nhật tình trạng: đã xác nhận → đang vận chuyển → đã nhận." },
    "them-moi": { title: "Thêm Sản Phẩm & Series", subtitle: "Thêm mẫu figure mới hoặc tạo series blind box mới." },
  };
  const STATUS_STYLE = {
    PENDING: "bg-amber-100 text-amber-800",
    CONFIRMED: "bg-sky-100 text-sky-700",
    SHIPPING: "bg-purple-100 text-purple-700",
    DELIVERED: "bg-emerald-100 text-emerald-700",
    CANCELLED: "bg-gray-200 text-gray-500",
  };
  const NEXT_STEP = {
    PENDING: { to: "CONFIRMED", label: "✅ Xác nhận đơn" },
    CONFIRMED: { to: "SHIPPING", label: "🚚 Giao cho vận chuyển" },
    SHIPPING: { to: "DELIVERED", label: "📦 Khách đã nhận hàng" },
  };
  const FLOW = ["PENDING", "CONFIRMED", "SHIPPING", "DELIVERED"];

  let seriesList = [];
  let figuresList = [];
  let ordersList = [];
  let orderFilter = "ALL";
  let confirmAction = null;
  const { ORDER_STATUSES } = window.HacipupuStore;

  // ---------- Tabs ----------
  function currentTab() {
    const h = (window.location.hash || "#kho").slice(1);
    return TABS[h] ? h : "kho";
  }

  function showTab() {
    const tab = currentTab();
    document.querySelectorAll("[data-tab]").forEach((el) => el.classList.toggle("hidden", el.dataset.tab !== tab));
    document.getElementById("admin-title").textContent = TABS[tab].title;
    document.getElementById("admin-subtitle").textContent = TABS[tab].subtitle;
  }

  // ---------- KPI ----------
  function updateKPIs() {
    document.getElementById("kpi-series").textContent = String(seriesList.length);
    document.getElementById("kpi-figures").textContent = String(figuresList.length);
    document.getElementById("kpi-stock").textContent = String(figuresList.reduce((n, f) => n + Number(f.stock || 0), 0));
    document.getElementById("kpi-low").textContent = String(figuresList.filter((f) => f.stock <= LOW_STOCK).length);
    const pending = ordersList.filter((o) => o.status === "PENDING").length;
    document.getElementById("kpi-pending").textContent = String(pending);
  }

  // ---------- Kho ----------
  function renderSeriesCards() {
    document.getElementById("series-stock-cards").innerHTML = seriesList
      .map((s) => {
        const figs = figuresList.filter((f) => f.series_id === s.id);
        const total = figs.reduce((n, f) => n + f.stock, 0);
        const out = figs.filter((f) => f.stock <= 0).length;
        const low = figs.filter((f) => f.stock > 0 && f.stock <= LOW_STOCK).length;
        return `
          <button type="button" data-series-filter="${s.id}" class="text-left bg-white rounded-2xl p-4 border border-gray-200 shadow-sm hover:border-[#4D96FF] transition cursor-pointer">
            <div class="flex items-center gap-3">
              <img src="${encodeAssetUrl(s.box_image)}" alt="" class="w-11 h-11 object-contain rounded-xl bg-amber-50 p-1 shrink-0" onerror="window.HacipupuApp.handleImgError(this)" />
              <div class="min-w-0">
                <div class="text-xs font-extrabold text-gray-900 truncate">${escapeHtml(shortSeriesName(s.name))}</div>
                <div class="font-display font-bold text-xl text-[#4D96FF] leading-tight">${total} <span class="text-xs text-gray-400">sp tồn</span></div>
              </div>
            </div>
            <div class="mt-2 flex flex-wrap gap-1.5 text-[10px] font-extrabold">
              <span class="px-2 py-0.5 rounded-full bg-gray-100 text-gray-600">${figs.length} mẫu</span>
              ${low ? `<span class="px-2 py-0.5 rounded-full bg-amber-100 text-amber-800">${low} sắp hết</span>` : ""}
              ${out ? `<span class="px-2 py-0.5 rounded-full bg-rose-100 text-rose-600">${out} hết hàng</span>` : ""}
            </div>
          </button>`;
      })
      .join("");
    document.querySelectorAll("[data-series-filter]").forEach((b) =>
      b.addEventListener("click", () => {
        document.getElementById("admin-series-filter").value = b.dataset.seriesFilter;
        renderFiguresTable();
      })
    );
  }

  function renderFiguresTable() {
    const tbody = document.getElementById("admin-figures-tbody");
    const searchVal = document.getElementById("admin-search-input").value.trim().toLowerCase();
    const seriesFilter = document.getElementById("admin-series-filter").value;
    const lowOnly = document.getElementById("admin-low-filter").checked;

    const filtered = figuresList
      .filter(
        (f) =>
          (!searchVal || f.name.toLowerCase().includes(searchVal)) &&
          (!seriesFilter || String(f.series_id) === seriesFilter) &&
          (!lowOnly || f.stock <= LOW_STOCK)
      )
      .sort((a, b) => (lowOnly ? a.stock - b.stock : 0));

    if (!filtered.length) {
      tbody.innerHTML = `<tr><td colspan="6" class="py-10 text-center text-gray-400 font-bold">Không có mẫu nào phù hợp.</td></tr>`;
      return;
    }

    tbody.innerHTML = filtered
      .map((fig) => {
        const isSecret = Number(fig.is_secret) === 1;
        const stockCls =
          fig.stock <= 0 ? "text-rose-600 bg-rose-50 border-rose-200" : fig.stock <= LOW_STOCK ? "text-amber-700 bg-amber-50 border-amber-200" : "text-emerald-700 border-gray-200";
        return `
          <tr class="hover:bg-amber-50/30 transition-colors">
            <td class="py-3 px-4 font-mono text-xs font-bold text-gray-400">#${fig.id}</td>
            <td class="py-3 px-4">
              <div class="flex items-center gap-3">
                <img src="${encodeAssetUrl(fig.image_path)}" alt="" class="w-12 h-12 rounded-xl object-contain bg-gray-50 border border-gray-100 p-1 shrink-0" onerror="window.HacipupuApp.handleImgError(this)" />
                <div class="font-bold text-gray-900 flex items-center gap-1.5 flex-wrap">
                  <span>${escapeHtml(fig.name)}</span>
                  ${isSecret ? `<span class="secret-badge px-2 py-0.5 rounded-full text-[10px]">SECRET</span>` : ""}
                </div>
              </div>
            </td>
            <td class="py-3 px-4 text-xs font-bold text-gray-600">${escapeHtml(shortSeriesName(fig.series_name))}</td>
            <td class="py-3 px-4">
              <input type="number" min="0" step="1000" value="${fig.price}" data-inline-price="${fig.id}" aria-label="Giá"
                class="w-28 px-2.5 py-1.5 rounded-lg border border-gray-200 text-xs font-extrabold text-[#FF6B6B] focus:outline-none focus:ring-2 focus:ring-[#4D96FF]" />
            </td>
            <td class="py-3 px-4">
              <input type="number" min="0" value="${fig.stock}" data-inline-stock="${fig.id}" aria-label="Tồn kho"
                class="w-20 px-2.5 py-1.5 rounded-lg border text-xs font-extrabold ${stockCls} focus:outline-none focus:ring-2 focus:ring-[#4D96FF]" />
            </td>
            <td class="py-3 px-4 text-right whitespace-nowrap">
              <div class="inline-flex items-center gap-1.5">
                <button type="button" data-quick-save="${fig.id}" class="px-3 py-1.5 rounded-lg bg-emerald-100 hover:bg-emerald-200 text-emerald-800 text-xs font-extrabold cursor-pointer">💾 Lưu</button>
                <button type="button" data-edit-fig="${fig.id}" class="px-3 py-1.5 rounded-lg bg-sky-100 hover:bg-sky-200 text-[#4D96FF] text-xs font-extrabold cursor-pointer">✏️ Sửa</button>
                <button type="button" data-delete-fig="${fig.id}" class="px-3 py-1.5 rounded-lg bg-rose-100 hover:bg-rose-200 text-[#FF6B6B] text-xs font-extrabold cursor-pointer">🗑️</button>
              </div>
            </td>
          </tr>`;
      })
      .join("");

    tbody.querySelectorAll("[data-quick-save]").forEach((btn) =>
      btn.addEventListener("click", async () => {
        const id = Number(btn.dataset.quickSave);
        const price = Number(tbody.querySelector(`[data-inline-price="${id}"]`).value);
        const stock = Number(tbody.querySelector(`[data-inline-stock="${id}"]`).value);
        try {
          btn.disabled = true;
          const updated = await apiFetch(`/api/figures/${id}`, { method: "PUT", body: JSON.stringify({ price, stock }) });
          await reloadAll();
          showToast(`Đã cập nhật "${updated.name}"!`);
        } catch (err) {
          showToast(err.message, "error");
          btn.disabled = false;
        }
      })
    );

    tbody.querySelectorAll("[data-edit-fig]").forEach((btn) =>
      btn.addEventListener("click", () => {
        const fig = figuresList.find((f) => f.id === Number(btn.dataset.editFig));
        if (!fig) return;
        const form = document.getElementById("edit-figure-form");
        form.id.value = fig.id;
        form.name.value = fig.name;
        form.series_id.value = fig.series_id;
        setImageField(form.querySelector("[data-image-field]"), fig.image_path);
        form.price.value = fig.price;
        form.stock.value = fig.stock;
        form.is_secret.checked = Number(fig.is_secret) === 1;
        openModal("edit-figure-modal");
      })
    );

    tbody.querySelectorAll("[data-delete-fig]").forEach((btn) =>
      btn.addEventListener("click", () => {
        const fig = figuresList.find((f) => f.id === Number(btn.dataset.deleteFig));
        if (!fig) return;
        askConfirm("Xóa mẫu này?", `Mẫu "${fig.name}" sẽ bị xóa khỏi kho. Thao tác này không thể hoàn tác.`, async () => {
          await apiFetch(`/api/figures/${fig.id}`, { method: "DELETE" });
          await reloadAll();
          showToast("Đã xóa mẫu khỏi kho.", "info");
        });
      })
    );
  }

  // ---------- Đơn hàng ----------
  function renderOrderFilters() {
    const counts = { ALL: ordersList.length };
    ordersList.forEach((o) => (counts[o.status] = (counts[o.status] || 0) + 1));
    const chips = [["ALL", "Tất cả"], ...Object.entries(ORDER_STATUSES)];
    document.getElementById("order-status-filters").innerHTML = chips
      .map(
        ([key, label]) => `
        <button type="button" data-order-filter="${key}"
          class="px-4 py-2 rounded-xl text-xs font-extrabold border transition cursor-pointer ${
            orderFilter === key ? "bg-gray-900 text-white border-gray-900" : "bg-white text-gray-600 border-gray-200 hover:border-gray-400"
          }">${label} <span class="opacity-60">${counts[key] || 0}</span></button>`
      )
      .join("");
    document.querySelectorAll("[data-order-filter]").forEach((b) =>
      b.addEventListener("click", () => {
        orderFilter = b.dataset.orderFilter;
        renderOrders();
      })
    );
  }

  function paymentBadge(o) {
    const paid = o.payment_status === "PAID";
    const method =
      o.payment_method === "CARD" ? `💳 Thẻ •••• ${escapeHtml(o.card_last4)}` : o.payment_method === "QR" ? "📱 QR chuyển khoản" : "💵 Thanh toán khi nhận";
    const state = o.status === "CANCELLED"
      ? paid
        ? "Cần hoàn tiền cho khách"
        : "Không thu tiền"
      : paid
      ? "Đã thanh toán"
      : o.payment_method === "QR"
      ? "Chờ đối soát"
      : o.payment_method === "COD"
      ? "Thu khi giao"
      : "Chưa thanh toán";
    return `<span class="px-2.5 py-1 rounded-full bg-gray-100 text-gray-700 text-[11px] font-extrabold">${method}</span>
      <span class="px-2.5 py-1 rounded-full text-[11px] font-extrabold ${
        o.status === "CANCELLED" ? (paid ? "bg-rose-100 text-rose-600" : "bg-gray-100 text-gray-500") : paid ? "bg-emerald-100 text-emerald-700" : "bg-amber-50 text-amber-700"
      }">${state}</span>`;
  }

  function stepper(o) {
    if (o.status === "CANCELLED") return `<div class="text-xs font-extrabold text-gray-400">Đơn đã hủy — đã hoàn lại tồn kho.</div>`;
    const idx = FLOW.indexOf(o.status);
    return `<ol class="flex items-center gap-1.5 text-[11px] font-extrabold flex-wrap">
      ${FLOW.map((s, i) => {
        const done = i <= idx;
        const at = (o.status_history || []).find((h) => h.status === s)?.at;
        return `<li class="flex items-center gap-1.5">
            <span class="px-2.5 py-1 rounded-full ${done ? STATUS_STYLE[s] : "bg-gray-50 text-gray-300 border border-gray-100"}" title="${at ? escapeHtml(at) : ""}">${
          done ? "●" : "○"
        } ${ORDER_STATUSES[s]}</span>${i < FLOW.length - 1 ? `<span class="text-gray-300">→</span>` : ""}
          </li>`;
      }).join("")}
    </ol>`;
  }

  function renderOrders() {
    renderOrderFilters();
    const list = document.getElementById("orders-list");
    const shown = ordersList.filter((o) => orderFilter === "ALL" || o.status === orderFilter);
    if (!shown.length) {
      list.innerHTML = `<div class="bg-white rounded-[26px] p-10 text-center text-gray-400 font-bold border border-gray-200">${
        ordersList.length ? "Không có đơn nào ở trạng thái này." : "Chưa có đơn hàng nào. Khi khách đặt hàng, đơn sẽ xuất hiện ở đây."
      }</div>`;
      return;
    }
    list.innerHTML = shown
      .map((o) => {
        const next = NEXT_STEP[o.status];
        const canCancel = o.status === "PENDING" || o.status === "CONFIRMED";
        const items = (o.items || [])
          .map(
            (it) => `
            <li class="flex items-start gap-3 py-2">
              <img src="${encodeAssetUrl(it.image)}" alt="" class="w-11 h-11 rounded-lg object-contain bg-gray-50 border border-gray-100 p-0.5 shrink-0" onerror="window.HacipupuApp.handleImgError(this)" />
              <div class="flex-1 min-w-0">
                <div class="text-sm font-bold text-gray-900">${escapeHtml(it.name)} <span class="text-gray-400">×${it.quantity}</span></div>
                ${
                  it.item_type !== "FIGURE" && it.picked?.length
                    ? `<div class="text-[11px] font-semibold text-gray-500 mt-0.5">Lấy từ kho: ${it.picked
                        .map((p) => `${p.is_secret ? "👑 " : ""}${escapeHtml(p.name)}${p.qty > 1 ? ` ×${p.qty}` : ""}`)
                        .join(", ")}</div>`
                    : ""
                }
              </div>
              <div class="text-sm font-extrabold text-gray-700 whitespace-nowrap">${formatVND(it.unit_price * it.quantity)}</div>
            </li>`
          )
          .join("");
        return `
          <article class="bg-white rounded-[22px] p-5 sm:p-6 border border-gray-200 shadow-sm">
            <div class="flex flex-col md:flex-row md:items-start justify-between gap-3">
              <div>
                <div class="flex items-center gap-2 flex-wrap">
                  <span class="font-mono font-extrabold text-[#4D96FF]">${escapeHtml(o.code || `#${o.id}`)}</span>
                  <span class="px-2.5 py-1 rounded-full text-[11px] font-extrabold ${STATUS_STYLE[o.status]}">${escapeHtml(o.status_label)}</span>
                  ${paymentBadge(o)}
                </div>
                <div class="text-xs font-semibold text-gray-400 mt-1">Đặt lúc ${escapeHtml(o.created_at)}</div>
              </div>
              <div class="font-display font-bold text-2xl text-[#FF6B6B]">${formatVND(o.total_amount)}</div>
            </div>

            <div class="grid grid-cols-1 lg:grid-cols-3 gap-5 mt-4">
              <div class="text-sm space-y-1">
                <div class="text-[11px] font-extrabold uppercase text-gray-400">Khách hàng</div>
                <div class="font-bold text-gray-900">${escapeHtml(o.customer_name)}</div>
                <div class="font-semibold text-gray-600">📞 ${escapeHtml(o.customer_phone)}</div>
                <div class="font-semibold text-gray-600">📍 ${escapeHtml(o.customer_address)}</div>
                ${o.note ? `<div class="text-xs font-semibold text-gray-500 bg-amber-50 rounded-lg px-2 py-1 mt-1">📝 ${escapeHtml(o.note)}</div>` : ""}
              </div>
              <ul class="lg:col-span-2 divide-y divide-gray-100">${items || `<li class="text-xs text-gray-400 py-2">Không có chi tiết sản phẩm (đơn tạo từ phiên bản cũ).</li>`}</ul>
            </div>

            <div class="mt-4 pt-4 border-t border-gray-100 flex flex-col lg:flex-row lg:items-center justify-between gap-3">
              ${stepper(o)}
              <div class="flex gap-2 shrink-0">
                ${canCancel ? `<button type="button" data-cancel-order="${o.id}" class="px-4 py-2 rounded-xl bg-gray-100 hover:bg-rose-100 hover:text-rose-600 text-gray-600 text-xs font-extrabold cursor-pointer">Hủy đơn</button>` : ""}
                ${next ? `<button type="button" data-advance-order="${o.id}" data-to="${next.to}" class="px-4 py-2 rounded-xl btn-sky text-xs font-extrabold cursor-pointer">${next.label}</button>` : ""}
              </div>
            </div>
          </article>`;
      })
      .join("");

    list.querySelectorAll("[data-advance-order]").forEach((b) =>
      b.addEventListener("click", () => setOrderStatus(Number(b.dataset.advanceOrder), b.dataset.to, b))
    );
    list.querySelectorAll("[data-cancel-order]").forEach((b) =>
      b.addEventListener("click", () => {
        const o = ordersList.find((x) => x.id === Number(b.dataset.cancelOrder));
        askConfirm("Hủy đơn hàng?", `Đơn ${o.code} sẽ chuyển sang "Đã hủy" và số hàng trong đơn được trả lại kho.`, () =>
          setOrderStatus(o.id, "CANCELLED")
        );
      })
    );
  }

  async function setOrderStatus(id, status, btn) {
    try {
      if (btn) btn.disabled = true;
      const o = await apiFetch(`/api/orders/${id}`, { method: "PUT", body: JSON.stringify({ status }) });
      await reloadAll();
      showToast(`Đơn ${o.code}: ${o.status_label}`);
    } catch (err) {
      showToast(err.message, "error");
      if (btn) btn.disabled = false;
    }
  }

  // ---------- Ảnh: chọn có sẵn hoặc tải lên ----------
  function setImageField(field, value) {
    const input = field.querySelector("[data-image-input]");
    const preview = field.querySelector("[data-image-preview]");
    input.value = value || "";
    preview.dataset.fallbackStep = "0";
    preview.src = value ? encodeAssetUrl(value) : window.HacipupuApp.PLACEHOLDER_URL;
  }

  /** Thu nhỏ ảnh tải lên (≤ 600px) rồi lưu dạng data URL để không làm đầy bộ nhớ trình duyệt. */
  function resizeImage(file, max = 600) {
    return new Promise((resolve, reject) => {
      if (!file.type.startsWith("image/")) return reject(new Error("Vui lòng chọn file ảnh."));
      const reader = new FileReader();
      reader.onerror = () => reject(new Error("Không đọc được file ảnh."));
      reader.onload = () => {
        const img = new Image();
        img.onerror = () => reject(new Error("Trình duyệt không mở được ảnh này."));
        img.onload = () => {
          const scale = Math.min(1, max / Math.max(img.width, img.height));
          const canvas = document.createElement("canvas");
          canvas.width = Math.round(img.width * scale);
          canvas.height = Math.round(img.height * scale);
          const ctx = canvas.getContext("2d");
          ctx.fillStyle = "#FFFFFF";
          ctx.fillRect(0, 0, canvas.width, canvas.height);
          ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
          let url = canvas.toDataURL("image/webp", 0.85);
          if (!url.startsWith("data:image/webp")) url = canvas.toDataURL("image/jpeg", 0.85);
          resolve(url);
        };
        img.src = reader.result;
      };
      reader.readAsDataURL(file);
    });
  }

  function initImageFields() {
    document.querySelectorAll("[data-image-field]").forEach((field) => {
      const input = field.querySelector("[data-image-input]");
      const preview = field.querySelector("[data-image-preview]");
      input.addEventListener("input", () => {
        preview.dataset.fallbackStep = "0";
        preview.src = input.value.trim() ? encodeAssetUrl(input.value.trim()) : window.HacipupuApp.PLACEHOLDER_URL;
      });
      field.querySelector("[data-image-upload]").addEventListener("change", async (e) => {
        const file = e.target.files[0];
        if (!file) return;
        try {
          setImageField(field, await resizeImage(file));
          showToast("Đã tải ảnh lên (lưu trong trình duyệt).", "info");
        } catch (err) {
          showToast(err.message, "error");
        }
        e.target.value = "";
      });
    });
  }

  // ---------- Series ----------
  function renderSeriesManage() {
    document.getElementById("series-manage-list").innerHTML = seriesList
      .map(
        (s) => `
        <div class="flex items-center gap-3 p-2.5 rounded-2xl border border-gray-100 hover:bg-gray-50">
          <img src="${encodeAssetUrl(s.box_image)}" alt="" class="w-10 h-10 object-contain rounded-lg bg-amber-50 p-0.5 shrink-0" onerror="window.HacipupuApp.handleImgError(this)" />
          <div class="flex-1 min-w-0">
            <div class="text-sm font-bold text-gray-900 truncate">${escapeHtml(shortSeriesName(s.name))}</div>
            <div class="text-[11px] font-bold text-gray-400">${s.figure_count} mẫu • Box ${formatVND(s.blind_box_price)} • Full ${formatVND(s.full_set_price)}</div>
          </div>
          <button type="button" data-edit-series="${s.id}" class="px-3 py-1.5 rounded-lg bg-sky-100 hover:bg-sky-200 text-[#4D96FF] text-xs font-extrabold cursor-pointer">✏️ Sửa</button>
        </div>`
      )
      .join("");
    document.querySelectorAll("[data-edit-series]").forEach((b) =>
      b.addEventListener("click", () => {
        const s = seriesList.find((x) => x.id === Number(b.dataset.editSeries));
        const form = document.getElementById("edit-series-form");
        form.id.value = s.id;
        form.name.value = s.name;
        setImageField(form.querySelector("[data-image-field]"), s.box_image);
        form.blind_box_price.value = s.blind_box_price;
        form.full_set_price.value = s.full_set_price;
        form.description.value = s.description || "";
        form.youtube_embed_url.value = s.youtube_embed_url || "";
        openModal("edit-series-modal");
      })
    );
  }

  function fillSeriesSelects() {
    const optionsHtml = seriesList.map((s) => `<option value="${s.id}">${escapeHtml(s.name)}</option>`).join("");
    for (const id of ["create-series-select", "edit-series-select"]) {
      const sel = document.getElementById(id);
      const prev = sel.value;
      sel.innerHTML = optionsHtml;
      if (prev) sel.value = prev;
    }
    const filterSel = document.getElementById("admin-series-filter");
    const prevFilter = filterSel.value;
    filterSel.innerHTML = `<option value="">Tất cả Series (${seriesList.length})</option>` + optionsHtml;
    filterSel.value = prevFilter;
  }

  // ---------- Modal tiện ích ----------
  function openModal(id) {
    document.getElementById(id).classList.add("open");
  }
  function closeModals() {
    document.querySelectorAll(".modal-overlay.open").forEach((m) => {
      if (["edit-figure-modal", "edit-series-modal", "confirm-modal"].includes(m.id)) m.classList.remove("open");
    });
    confirmAction = null;
  }
  function askConfirm(title, text, action) {
    document.getElementById("confirm-title").textContent = title;
    document.getElementById("confirm-text").textContent = text;
    confirmAction = action;
    openModal("confirm-modal");
  }

  // ---------- Tải dữ liệu ----------
  async function reloadAll() {
    [seriesList, figuresList, ordersList] = await Promise.all([
      apiFetch("/api/series"),
      apiFetch("/api/figures"),
      apiFetch("/api/orders"),
    ]);
    fillSeriesSelects();
    updateKPIs();
    renderSeriesCards();
    renderFiguresTable();
    renderOrders();
    renderSeriesManage();
  }

  async function init() {
    if (!isStaff()) {
      document.getElementById("admin-locked").classList.remove("hidden");
      document.getElementById("locked-login-btn").addEventListener("click", openLoginModal);
      return;
    }
    document.getElementById("admin-app").classList.remove("hidden");
    showTab();
    window.addEventListener("hashchange", showTab);

    try {
      const images = await apiFetch("/api/images");
      document.getElementById("img-suggestions").innerHTML = images.map((p) => `<option value="${escapeHtml(p)}"></option>`).join("");
      await reloadAll();
      const createFigField = document.querySelector("#create-figure-form [data-image-field]");
      setImageField(createFigField, images.find((p) => /\/1\.(avif|jpg)$/.test(p)) || images[0] || "");
      setImageField(document.querySelector("#create-series-form [data-image-field]"), "");
    } catch (err) {
      showToast(err.message, "error");
    }

    initImageFields();
    document.getElementById("admin-search-input").addEventListener("input", renderFiguresTable);
    document.getElementById("admin-series-filter").addEventListener("change", renderFiguresTable);
    document.getElementById("admin-low-filter").addEventListener("change", renderFiguresTable);

    document.querySelectorAll("[data-close-modal]").forEach((b) => b.addEventListener("click", closeModals));
    ["edit-figure-modal", "edit-series-modal", "confirm-modal"].forEach((id) =>
      document.getElementById(id).addEventListener("click", (e) => {
        if (e.target.id === id) closeModals();
      })
    );
    document.getElementById("confirm-ok-btn").addEventListener("click", async (e) => {
      const action = confirmAction;
      if (!action) return;
      e.target.disabled = true;
      try {
        await action();
        closeModals();
      } catch (err) {
        showToast(err.message, "error");
      } finally {
        e.target.disabled = false;
      }
    });

    document.getElementById("create-figure-form").addEventListener("submit", async (e) => {
      e.preventDefault();
      const f = e.target;
      try {
        const created = await apiFetch("/api/figures", {
          method: "POST",
          body: JSON.stringify({
            name: f.name.value.trim(),
            series_id: Number(f.series_id.value),
            image_path: f.image_path.value.trim(),
            price: Number(f.price.value),
            stock: Number(f.stock.value),
            is_secret: f.is_secret.checked ? 1 : 0,
          }),
        });
        await reloadAll();
        f.name.value = "";
        f.is_secret.checked = false;
        showToast(`Đã thêm "${created.name}" vào ${shortSeriesName(created.series_name)}!`);
      } catch (err) {
        showToast(err.message, "error");
      }
    });

    document.getElementById("create-series-form").addEventListener("submit", async (e) => {
      e.preventDefault();
      const f = e.target;
      try {
        const created = await apiFetch("/api/series", {
          method: "POST",
          body: JSON.stringify({
            name: f.name.value.trim(),
            box_image: f.box_image.value.trim(),
            blind_box_price: Number(f.blind_box_price.value),
            full_set_price: Number(f.full_set_price.value),
            description: f.description.value.trim(),
            youtube_embed_url: f.youtube_embed_url.value.trim(),
          }),
        });
        await reloadAll();
        f.reset();
        setImageField(f.querySelector("[data-image-field]"), "");
        document.getElementById("create-series-select").value = String(created.id);
        showToast(`Đã tạo series "${shortSeriesName(created.name)}". Giờ hãy thêm các mẫu cho series này!`);
      } catch (err) {
        showToast(err.message, "error");
      }
    });

    document.getElementById("edit-figure-form").addEventListener("submit", async (e) => {
      e.preventDefault();
      const f = e.target;
      try {
        const updated = await apiFetch(`/api/figures/${Number(f.id.value)}`, {
          method: "PUT",
          body: JSON.stringify({
            name: f.name.value.trim(),
            series_id: Number(f.series_id.value),
            image_path: f.image_path.value.trim(),
            price: Number(f.price.value),
            stock: Number(f.stock.value),
            is_secret: f.is_secret.checked ? 1 : 0,
          }),
        });
        await reloadAll();
        closeModals();
        showToast(`Đã lưu thay đổi cho "${updated.name}"!`);
      } catch (err) {
        showToast(err.message, "error");
      }
    });

    document.getElementById("edit-series-form").addEventListener("submit", async (e) => {
      e.preventDefault();
      const f = e.target;
      try {
        const updated = await apiFetch(`/api/series/${Number(f.id.value)}`, {
          method: "PUT",
          body: JSON.stringify({
            name: f.name.value.trim(),
            box_image: f.box_image.value.trim(),
            blind_box_price: Number(f.blind_box_price.value),
            full_set_price: Number(f.full_set_price.value),
            description: f.description.value.trim(),
            youtube_embed_url: f.youtube_embed_url.value.trim(),
          }),
        });
        await reloadAll();
        closeModals();
        showToast(`Đã lưu series "${shortSeriesName(updated.name)}"!`);
      } catch (err) {
        showToast(err.message, "error");
      }
    });
  }

  document.addEventListener("DOMContentLoaded", init);

  // Khách đặt hàng / hủy đơn ở tab khác → cập nhật danh sách ngay.
  window.addEventListener("storage", async (e) => {
    if (e.key !== "hacipupu_store_v1" || !isStaff()) return;
    await window.HacipupuStore.reload();
    reloadAll().catch(() => {});
  });
})();
