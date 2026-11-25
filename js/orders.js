(() => {
  const { apiFetch, formatVND, escapeHtml, encodeAssetUrl, showToast, isStaff, getMyOrderIds } = window.HacipupuApp;
  const { ORDER_STATUSES } = window.HacipupuStore;

  const FLOW = ["PENDING", "CONFIRMED", "SHIPPING", "DELIVERED"];
  const STEP_ICONS = { PENDING: "🕒", CONFIRMED: "✅", SHIPPING: "🚚", DELIVERED: "📦" };
  const STATUS_STYLE = {
    PENDING: "bg-amber-100 text-amber-800",
    CONFIRMED: "bg-sky-100 text-sky-700",
    SHIPPING: "bg-purple-100 text-purple-700",
    DELIVERED: "bg-emerald-100 text-emerald-700",
    CANCELLED: "bg-gray-200 text-gray-500",
  };
  const FILTERS = [
    ["ALL", "Tất cả"],
    ["ACTIVE", "Đang xử lý"],
    ["DELIVERED", "Đã nhận hàng"],
    ["CANCELLED", "Đã hủy"],
  ];

  let orders = [];
  let filter = "ALL";
  let confirmCancelId = null;

  const isActive = (o) => ["PENDING", "CONFIRMED", "SHIPPING"].includes(o.status);

  function paymentText(o) {
    if (o.payment_method === "CARD") return `💳 Thẻ •••• ${escapeHtml(o.card_last4)}`;
    if (o.payment_method === "QR") return "📱 Chuyển khoản QR";
    return "💵 Thanh toán khi nhận hàng";
  }

  function paymentState(o) {
    if (o.status === "CANCELLED") return o.payment_status === "PAID" ? ["Shop sẽ hoàn tiền", "bg-rose-100 text-rose-600"] : ["Không thu tiền", "bg-gray-100 text-gray-500"];
    if (o.payment_status === "PAID") return ["Đã thanh toán", "bg-emerald-100 text-emerald-700"];
    if (o.payment_method === "QR") return ["Chờ shop xác nhận chuyển khoản", "bg-amber-50 text-amber-700"];
    return ["Trả tiền khi nhận hàng", "bg-amber-50 text-amber-700"];
  }

  function progress(o) {
    if (o.status === "CANCELLED") {
      const at = (o.status_history || []).find((h) => h.status === "CANCELLED")?.at || "";
      return `<div class="rounded-2xl bg-gray-50 border border-gray-200 px-4 py-3 text-sm font-bold text-gray-500">❌ Đơn đã hủy ${at ? `lúc ${escapeHtml(at)}` : ""}</div>`;
    }
    const idx = FLOW.indexOf(o.status);
    return `
      <ol class="grid grid-cols-4 gap-1.5 sm:gap-3">
        ${FLOW.map((s, i) => {
          const done = i <= idx;
          const current = i === idx;
          const at = (o.status_history || []).find((h) => h.status === s)?.at || "";
          return `
            <li class="relative text-center">
              ${i > 0 ? `<span class="absolute top-5 right-1/2 w-full h-1 -z-0 ${i <= idx ? "bg-emerald-300" : "bg-gray-200"}"></span>` : ""}
              <span class="relative z-10 mx-auto w-10 h-10 rounded-full flex items-center justify-center text-lg border-2 ${
                done ? "bg-emerald-50 border-emerald-400" : "bg-white border-gray-200 grayscale opacity-50"
              } ${current ? "ring-4 ring-emerald-100" : ""}">${STEP_ICONS[s]}</span>
              <span class="block mt-1.5 text-[11px] sm:text-xs font-extrabold ${done ? "text-gray-900" : "text-gray-400"}">${ORDER_STATUSES[s]}</span>
              <span class="block text-[10px] font-semibold text-gray-400 min-h-[14px]">${at ? escapeHtml(at.slice(5, 16)) : ""}</span>
            </li>`;
        }).join("")}
      </ol>`;
  }

  function orderCard(o) {
    const [payState, payCls] = paymentState(o);
    const items = (o.items || [])
      .map(
        (it) => `
        <li class="flex items-start gap-3 py-2.5">
          <img src="${encodeAssetUrl(it.image)}" alt="" class="w-12 h-12 rounded-xl object-contain bg-gray-50 border border-gray-100 p-0.5 shrink-0" onerror="window.HacipupuApp.handleImgError(this)" />
          <div class="flex-1 min-w-0">
            <div class="text-sm font-bold text-gray-900">${escapeHtml(it.name)} <span class="text-gray-400">×${it.quantity}</span></div>
            ${
              it.item_type === "BLIND_BOX" && it.picked?.length
                ? `<div class="text-[11px] font-semibold text-purple-700 mt-0.5">🎲 Trong hộp: ${it.picked
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
      <article class="bg-white rounded-[24px] p-5 sm:p-6 border border-gray-200 shadow-sm space-y-5">
        <div class="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
          <div>
            <div class="flex items-center gap-2 flex-wrap">
              <span class="font-mono font-extrabold text-[#4D96FF]">${escapeHtml(o.code)}</span>
              <span class="px-2.5 py-1 rounded-full text-[11px] font-extrabold ${STATUS_STYLE[o.status]}">${escapeHtml(o.status_label)}</span>
            </div>
            <div class="text-xs font-semibold text-gray-400 mt-1">Đặt lúc ${escapeHtml(o.created_at)}</div>
          </div>
          <div class="sm:text-right">
            <div class="font-display font-bold text-2xl text-[#FF6B6B]">${formatVND(o.total_amount)}</div>
            <div class="flex sm:justify-end flex-wrap gap-1.5 mt-1">
              <span class="px-2.5 py-1 rounded-full bg-gray-100 text-gray-700 text-[11px] font-extrabold">${paymentText(o)}</span>
              <span class="px-2.5 py-1 rounded-full text-[11px] font-extrabold ${payCls}">${payState}</span>
            </div>
          </div>
        </div>

        ${progress(o)}

        <div class="grid grid-cols-1 md:grid-cols-5 gap-5">
          <ul class="md:col-span-3 divide-y divide-gray-100">${items}</ul>
          <div class="md:col-span-2 rounded-2xl bg-[#FAFAFA] border border-gray-100 p-4 text-sm space-y-1 h-fit">
            <div class="text-[11px] font-extrabold uppercase text-gray-400">Giao đến</div>
            <div class="font-bold text-gray-900">${escapeHtml(o.customer_name)}</div>
            <div class="font-semibold text-gray-600">📞 ${escapeHtml(o.customer_phone)}</div>
            <div class="font-semibold text-gray-600">📍 ${escapeHtml(o.customer_address)}</div>
            ${o.note ? `<div class="text-xs font-semibold text-gray-500 pt-1">📝 ${escapeHtml(o.note)}</div>` : ""}
          </div>
        </div>

        ${
          o.status === "PENDING"
            ? `<div class="flex justify-end">
                 <button type="button" data-cancel-my-order="${o.id}"
                   class="px-4 py-2 rounded-xl text-xs font-extrabold cursor-pointer ${
                     confirmCancelId === o.id ? "bg-rose-500 text-white hover:bg-rose-600" : "bg-gray-100 text-gray-600 hover:bg-rose-100 hover:text-rose-600"
                   }">${confirmCancelId === o.id ? "Bấm lần nữa để xác nhận hủy đơn" : "Hủy đơn"}</button>
               </div>`
            : ""
        }
      </article>`;
  }

  function render() {
    const list = document.getElementById("my-orders-list");
    document.getElementById("count-all").textContent = String(orders.length);
    document.getElementById("count-active").textContent = String(orders.filter(isActive).length);
    document.getElementById("count-done").textContent = String(orders.filter((o) => o.status === "DELIVERED").length);

    const counts = {
      ALL: orders.length,
      ACTIVE: orders.filter(isActive).length,
      DELIVERED: orders.filter((o) => o.status === "DELIVERED").length,
      CANCELLED: orders.filter((o) => o.status === "CANCELLED").length,
    };
    document.getElementById("my-order-filters").innerHTML = FILTERS.map(
      ([key, label]) => `
      <button type="button" data-my-filter="${key}" aria-pressed="${filter === key}"
        class="px-4 py-2 rounded-xl text-xs font-extrabold border transition cursor-pointer ${
          filter === key ? "bg-gray-900 text-white border-gray-900" : "bg-white text-gray-600 border-gray-200 hover:border-gray-400"
        }">${label} <span class="opacity-60">${counts[key]}</span></button>`
    ).join("");
    document.querySelectorAll("[data-my-filter]").forEach((b) =>
      b.addEventListener("click", () => {
        filter = b.dataset.myFilter;
        render();
      })
    );

    if (!orders.length) {
      list.innerHTML = `
        <div class="bg-white rounded-[24px] p-10 text-center border border-gray-200">
          <div class="w-20 h-20 mx-auto mb-4 rounded-3xl bg-amber-100/70 flex items-center justify-center text-4xl">🛍️</div>
          <p class="font-display font-bold text-xl text-gray-900">Bạn chưa có đơn hàng nào</p>
          <p class="text-sm text-gray-500 font-semibold mt-1 mb-5">Chọn một blind box hoặc full set yêu thích rồi đặt hàng nhé!</p>
          <a href="index.html#series-shelf" class="inline-block px-6 py-3 rounded-2xl btn-coral font-extrabold text-sm">Đi mua sắm →</a>
        </div>`;
      return;
    }

    const shown = orders.filter((o) =>
      filter === "ALL" ? true : filter === "ACTIVE" ? isActive(o) : o.status === filter
    );
    list.innerHTML = shown.length
      ? shown.map(orderCard).join("")
      : `<div class="bg-white rounded-[24px] p-8 text-center text-gray-400 font-bold border border-gray-200">Không có đơn nào ở mục này.</div>`;

    list.querySelectorAll("[data-cancel-my-order]").forEach((b) =>
      b.addEventListener("click", async () => {
        const id = Number(b.dataset.cancelMyOrder);
        if (confirmCancelId !== id) {
          confirmCancelId = id;
          render();
          return;
        }
        confirmCancelId = null;
        try {
          const o = await apiFetch(`/api/orders/${id}`, { method: "PUT", body: JSON.stringify({ status: "CANCELLED" }) });
          showToast(`Đã hủy đơn ${o.code}.`, "info");
          await load();
        } catch (err) {
          showToast(err.message, "error");
          await load();
        }
      })
    );
  }

  async function load() {
    try {
      const mine = new Set(getMyOrderIds());
      orders = (await apiFetch("/api/orders")).filter((o) => mine.has(o.id));
      render();
    } catch (err) {
      document.getElementById("my-orders-list").innerHTML = `<div class="text-center py-10 text-rose-500 font-bold">Không tải được đơn hàng: ${escapeHtml(
        err.message
      )}</div>`;
    }
  }

  document.addEventListener("DOMContentLoaded", () => {
    if (isStaff()) {
      document.getElementById("my-orders-list").innerHTML = `
        <div class="bg-white rounded-[24px] p-8 text-center border border-emerald-200">
          <p class="font-bold text-gray-700">Bạn đang ở chế độ nhân viên.</p>
          <a href="admin.html#don-hang" class="inline-block mt-3 px-5 py-2.5 rounded-xl btn-sky font-extrabold text-sm">Đến trang quản lý đơn hàng →</a>
        </div>`;
      document.getElementById("my-order-filters").innerHTML = "";
      return;
    }
    load();
  });

  // Nhân viên cập nhật trạng thái ở tab khác → trang này tự làm mới.
  window.addEventListener("storage", async (e) => {
    if (e.key === "hacipupu_store_v1" || e.key === "hacipupu_my_orders") {
      await window.HacipupuStore.reload();
      load();
    }
  });
  window.addEventListener("hacipupu:order-completed", load);
})();
