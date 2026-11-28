/*
 * Hướng dẫn nhanh dạng "chỉ tay" cho khách mới (coach marks).
 *
 * Làm tối màn hình, khoanh sáng từng phần của trang và hiện bong bóng lời thoại
 * của nhân vật HACIPUPU với các nút Bỏ qua · 1/6 · Quay lại · Tiếp.
 *  - Tự chạy ở Trang Chủ trong lần ghé đầu tiên (không chạy với nhân viên).
 *  - Xem lại bất cứ lúc nào: menu tài khoản → "Xem lại hướng dẫn nhanh".
 */
(() => {
  const DONE_KEY = "hacipupu_tour_done";
  const MASCOT = "img/HACIPUPU%20My%20Little%20Hero%20Series%20Figures/13.avif";

  // Mỗi bước: danh sách selector (lấy cái đầu tiên đang hiện trên màn hình), tiêu đề, nội dung.
  const STEPS = [
    {
      target: ["header nav", "#mobile-menu-btn"],
      title: "Chào bạn! Mình là HACIPUPU 👋",
      text: "Mình sẽ dẫn bạn đi một vòng nhé. Đây là <b>thanh menu</b>: Trang Chủ, About Us, Đơn Hàng Của Tôi, và <b>Bộ Sưu Tập</b> của bạn.",
    },
    {
      target: ["[data-hero-open-box]"],
      title: "Mở thử blind box",
      text: "Bấm vào hộp này để <b>chọn 1 trong 5 hộp</b> và mở ra xem bạn nhận được nhân vật nào. Mẫu <b>Secret 👑</b> hiếm lắm, tỷ lệ chỉ 1/144!",
    },
    {
      target: ["#series-grid > .blind-box-card", "#series-shelf"],
      title: "Kệ series",
      text: "Bấm vào ảnh để xem video, từng mẫu và mua <b>Blind Box</b>, <b>Full Set</b> hoặc <b>mẫu lẻ</b>. Nút <b>🎲 Khui thử</b> ở góc ảnh để chọn 1 trong 5 hộp và mở thử.",
    },
    {
      target: ["#open-cart-btn"],
      title: "Giỏ hàng",
      text: "Món bạn chọn nằm ở đây. Điền thông tin nhận hàng rồi thanh toán bằng <b>COD</b>, <b>thẻ ngân hàng</b> hoặc <b>mã QR</b>. Theo dõi đơn ở trang Đơn Hàng Của Tôi.",
    },
    {
      target: ["#chat-fab"],
      title: "Trợ lý HACIPUPU",
      text: "Có thắc mắc về giá, tồn kho, mẫu Secret hay đơn hàng? Bấm vào đây để <b>hỏi trợ lý AI</b> bất cứ lúc nào.",
    },
    {
      target: ["#account-btn"],
      title: "Menu tài khoản",
      text: "Chạm vào đây để mở đơn hàng, bộ sưu tập, hoặc <b>xem lại phần giới thiệu này</b>. Bạn là nhân viên? Đăng nhập cũng ở đây.",
    },
  ];

  const isVisible = (el) => {
    if (!el) return false;
    const r = el.getBoundingClientRect();
    const cs = getComputedStyle(el);
    return r.width > 0 && r.height > 0 && cs.visibility !== "hidden" && cs.display !== "none";
  };
  const findTarget = (sels) => {
    for (const s of sels) {
      const el = [...document.querySelectorAll(s)].find(isVisible);
      if (el) return el;
    }
    return null;
  };

  let ui = null;
  let steps = [];
  let index = 0;
  let current = null;

  function build() {
    const root = document.createElement("div");
    root.className = "tour-root";
    root.innerHTML = `
      <div class="tour-blocker"></div>
      <div class="tour-spot" aria-hidden="true"></div>
      <div class="tour-pop" role="dialog" aria-modal="true" aria-labelledby="tour-title">
        <img class="tour-mascot" src="${MASCOT}" alt="" onerror="this.style.display='none'" />
        <div class="tour-bubble">
          <div id="tour-title" class="tour-title"></div>
          <div class="tour-text"></div>
          <div class="tour-actions">
            <button type="button" class="tour-skip">Bỏ qua</button>
            <span class="tour-count"></span>
            <span class="tour-gap"></span>
            <button type="button" class="tour-back">Quay lại</button>
            <button type="button" class="tour-next">Tiếp</button>
          </div>
        </div>
      </div>`;
    document.body.appendChild(root);
    root.querySelector(".tour-skip").addEventListener("click", () => end());
    root.querySelector(".tour-back").addEventListener("click", () => go(index - 1));
    root.querySelector(".tour-next").addEventListener("click", () => (index >= steps.length - 1 ? end() : go(index + 1)));
    root.querySelector(".tour-blocker").addEventListener("click", () => root.querySelector(".tour-next").focus());
    return root;
  }

  function place() {
    if (!ui || !current) return;
    const pad = 8;
    const r = current.getBoundingClientRect();
    const spot = ui.querySelector(".tour-spot");
    Object.assign(spot.style, {
      left: `${r.left - pad}px`,
      top: `${r.top - pad}px`,
      width: `${r.width + pad * 2}px`,
      height: `${r.height + pad * 2}px`,
    });

    const pop = ui.querySelector(".tour-pop");
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const pw = Math.min(380, vw - 24);
    pop.style.width = `${pw}px`;
    const ph = pop.offsetHeight;
    const gap = 18;

    // Ưu tiên đặt bong bóng bên dưới; thiếu chỗ thì lên trên; vẫn thiếu thì đè lên phía dưới màn hình.
    let top;
    let below = true;
    if (r.bottom + pad + gap + ph <= vh - 8) top = r.bottom + pad + gap;
    else if (r.top - pad - gap - ph >= 8) {
      top = r.top - pad - gap - ph;
      below = false;
    } else top = Math.max(8, vh - ph - 12);
    let left = r.left + r.width / 2 - pw / 2;
    left = Math.max(12, Math.min(left, vw - pw - 12));
    pop.style.top = `${top}px`;
    pop.style.left = `${left}px`;
    pop.classList.toggle("is-above", !below);
    // Mũi nhọn chỉ vào giữa phần đang được khoanh.
    const arrowX = Math.max(28, Math.min(r.left + r.width / 2 - left, pw - 28));
    pop.style.setProperty("--arrow-x", `${arrowX}px`);
  }

  function go(i) {
    index = Math.max(0, Math.min(i, steps.length - 1));
    const step = steps[index];
    current = step.el;
    ui.querySelector(".tour-title").innerHTML = step.title;
    ui.querySelector(".tour-text").innerHTML = step.text;
    ui.querySelector(".tour-count").textContent = `${index + 1}/${steps.length}`;
    ui.querySelector(".tour-back").hidden = index === 0;
    ui.querySelector(".tour-next").textContent = index === steps.length - 1 ? "Bắt đầu" : "Tiếp";

    // Cuộn tức thì (không dùng cuộn mượt) để khoanh sáng đúng chỗ; chừa chỗ cho bong bóng.
    const r = current.getBoundingClientRect();
    const pinned = getComputedStyle(current).position === "fixed";
    const inHeader = !!current.closest("header");
    if (inHeader && window.scrollY > 0 && r.top < 0) window.scrollTo({ top: 0, behavior: "instant" });
    else if (!pinned && !inHeader && (r.top < 90 || r.bottom > window.innerHeight - 220)) {
      const want = window.scrollY + r.top - Math.max(90, (window.innerHeight - r.height - 220) / 2);
      window.scrollTo({ top: Math.max(0, want), behavior: "instant" });
    }
    requestAnimationFrame(() => {
      place();
      ui.querySelector(".tour-next").focus({ preventScroll: true });
    });
  }

  function onKey(e) {
    if (!ui) return;
    if (e.key === "Escape") end();
    else if (e.key === "ArrowRight") ui.querySelector(".tour-next").click();
    else if (e.key === "ArrowLeft" && index > 0) go(index - 1);
  }

  function end() {
    localStorage.setItem(DONE_KEY, "1");
    if (!ui) return;
    ui.remove();
    ui = null;
    current = null;
    document.documentElement.classList.remove("tour-open");
    window.removeEventListener("resize", place);
    window.removeEventListener("scroll", place, true);
    document.removeEventListener("keydown", onKey);
  }

  // Chờ các phần nạp sau (kệ series, nút chat) xuất hiện rồi mới bắt đầu.
  async function start() {
    if (ui) return;
    const deadline = Date.now() + 3000;
    let found = [];
    while (true) {
      found = STEPS.map((s) => ({ ...s, el: findTarget(s.target) })).filter((s) => s.el);
      const shelfReady = !document.getElementById("series-grid") || document.querySelector("#series-grid > .blind-box-card");
      if ((found.length === STEPS.length && shelfReady) || Date.now() > deadline) break;
      await new Promise((r) => setTimeout(r, 150));
    }
    if (!found.length) return;
    document.getElementById("account-menu")?.classList.add("hidden");
    document.getElementById("chat-panel")?.classList.contains("open") && document.getElementById("chat-close")?.click();
    steps = found;
    ui = build();
    document.documentElement.classList.add("tour-open");
    window.addEventListener("resize", place);
    window.addEventListener("scroll", place, true);
    document.addEventListener("keydown", onKey);
    go(0);
  }

  // Từ trang khác: chuyển về Trang Chủ rồi chạy hướng dẫn.
  function replay() {
    if (document.body.dataset.page === "home") start();
    else window.location.href = "index.html#tour";
  }

  document.addEventListener("DOMContentLoaded", () => {
    const staff = window.HacipupuApp && window.HacipupuApp.isStaff && window.HacipupuApp.isStaff();
    if (staff || document.body.dataset.page !== "home") return;
    if (window.location.hash === "#tour") {
      history.replaceState(null, "", window.location.pathname + window.location.search);
      setTimeout(start, 300);
    } else if (!localStorage.getItem(DONE_KEY)) {
      setTimeout(start, 700);
    }
  });

  window.HacipupuTour = { start, replay, end };
})();
