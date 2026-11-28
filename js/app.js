(() => {
  const PLACEHOLDER_URL = "https://placehold.co/400x400/FFD93D/333333?text=Figure+Preview";
  const OFFLINE_SVG_DATA =
    "data:image/svg+xml;utf8," +
    encodeURIComponent(
      `<svg xmlns="http://www.w3.org/2000/svg" width="400" height="400" viewBox="0 0 400 400">
        <defs>
          <linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stop-color="#FFD93D"/>
            <stop offset="100%" stop-color="#FF6B6B"/>
          </linearGradient>
        </defs>
        <rect width="400" height="400" rx="32" fill="url(#g)" opacity="0.25"/>
        <circle cx="200" cy="170" r="64" fill="#FFD93D"/>
        <circle cx="178" cy="162" r="7" fill="#1F2937"/>
        <circle cx="222" cy="162" r="7" fill="#1F2937"/>
        <path d="M184 188 Q200 202 216 188" stroke="#1F2937" stroke-width="5" fill="none" stroke-linecap="round"/>
        <text x="200" y="285" text-anchor="middle" font-family="sans-serif" font-size="22" font-weight="700" fill="#374151">HACIPUPU Preview</text>
      </svg>`
    );

  /*
   * Tài khoản nhân viên (bản demo). Vì website là trang tĩnh, việc kiểm tra
   * đăng nhập diễn ra ngay trên trình duyệt — chỉ dùng để phân vai trò trong
   * đồ án, KHÔNG phải bảo mật thật. Đổi tên đăng nhập / mật khẩu tại đây.
   */
  const STAFF_ACCOUNTS = [{ username: "admin", password: "admin2026", name: "Nhân viên kho" }];
  const SESSION_KEY = "hacipupu_session";
  /** Mã các đơn khách đã đặt trên trình duyệt này — dùng cho trang "Đơn hàng của tôi". */
  const MY_ORDERS_KEY = "hacipupu_my_orders";

  function getMyOrderIds() {
    try {
      const ids = JSON.parse(localStorage.getItem(MY_ORDERS_KEY) || "[]");
      return Array.isArray(ids) ? ids.map(Number) : [];
    } catch (e) {
      return [];
    }
  }

  function rememberMyOrder(id) {
    const ids = getMyOrderIds().filter((x) => x !== id);
    ids.push(id);
    localStorage.setItem(MY_ORDERS_KEY, JSON.stringify(ids));
  }

  const QR_LIB_URL = "https://cdn.jsdelivr.net/npm/qrcode-generator@1.4.4/qrcode.js";

  // ---------- Tiện ích chung ----------
  function formatVND(amount) {
    const num = Number(amount || 0);
    return new Intl.NumberFormat("vi-VN").format(num) + " ₫";
  }

  function escapeHtml(str) {
    return String(str ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  function encodeAssetUrl(path) {
    if (!path) return PLACEHOLDER_URL;
    const trimmed = String(path).trim();
    if (/^(https?:|data:|blob:)/i.test(trimmed)) return trimmed;
    return trimmed
      .replace(/^\/+/, "")
      .split("/")
      .map((seg) => encodeURIComponent(seg))
      .join("/");
  }

  function shortSeriesName(name) {
    return String(name || "").replace(/^HACIPUPU\s*(×\s*)?/, "").replace(/\s*Series Figures$/, "");
  }

  function handleImgError(imgEl) {
    if (!imgEl) return;
    const step = imgEl.dataset.fallbackStep || "0";
    if (step === "0") {
      imgEl.dataset.fallbackStep = "1";
      imgEl.src = PLACEHOLDER_URL;
    } else if (step === "1") {
      imgEl.dataset.fallbackStep = "2";
      imgEl.src = OFFLINE_SVG_DATA;
    }
  }

  function handleLogoError(imgEl) {
    if (!imgEl) return;
    imgEl.style.display = "none";
    const fallback = imgEl.nextElementSibling;
    if (fallback) fallback.classList.remove("hidden");
  }

  // Dữ liệu được xử lý ngay trên trình duyệt (js/store.js) để chạy được trên GitHub Pages.
  async function apiFetch(url, options = {}) {
    return window.HacipupuStore.request(url, options);
  }

  function showToast(message, type = "success") {
    let stack = document.getElementById("toast-stack");
    if (!stack) {
      stack = document.createElement("div");
      stack.id = "toast-stack";
      stack.className = "toast-stack";
      document.body.appendChild(stack);
    }
    const toast = document.createElement("div");
    toast.className = `toast-item ${type}`;
    const icon = type === "error" ? "⚠️" : type === "info" ? "✨" : "🎉";
    toast.innerHTML = `<span class="text-lg leading-none">${icon}</span><span>${escapeHtml(message)}</span>`;
    stack.appendChild(toast);
    setTimeout(() => {
      toast.style.opacity = "0";
      toast.style.transform = "translateY(8px)";
      toast.style.transition = "all 0.25s ease";
      setTimeout(() => toast.remove(), 260);
    }, 3000);
  }

  // ---------- Phiên đăng nhập ----------
  function getSession() {
    try {
      const s = JSON.parse(localStorage.getItem(SESSION_KEY) || "null");
      return s && s.role === "staff" ? s : { role: "guest" };
    } catch (e) {
      return { role: "guest" };
    }
  }

  function isStaff() {
    return getSession().role === "staff";
  }

  function loginStaff(username, password) {
    const acc = STAFF_ACCOUNTS.find(
      (a) => a.username === String(username).trim().toLowerCase() && a.password === String(password)
    );
    if (!acc) return false;
    localStorage.setItem(SESSION_KEY, JSON.stringify({ role: "staff", username: acc.username, name: acc.name }));
    return true;
  }

  function logout() {
    localStorage.removeItem(SESSION_KEY);
  }

  // ---------- Header ----------
  function getActiveNavKey() {
    const page = document.body.dataset.page || "home";
    if (page === "admin") {
      const hash = (window.location.hash || "#kho").slice(1);
      return ["kho", "don-hang", "them-moi"].includes(hash) ? hash : "kho";
    }
    return page;
  }

  function navItems() {
    if (isStaff()) {
      return [
        { key: "kho", href: "admin.html#kho", label: "📦 Quản Lý Kho" },
        { key: "don-hang", href: "admin.html#don-hang", label: "🧾 Đơn Hàng" },
        { key: "them-moi", href: "admin.html#them-moi", label: "➕ Thêm Sản Phẩm / Series" },
      ];
    }
    return [
      { key: "home", href: "index.html", label: "🏠 Trang Chủ" },
      { key: "about", href: "about.html", label: "💖 About Us" },
      { key: "my-orders", href: "orders.html", label: "🧾 Đơn Hàng Của Tôi" },
      { key: "collection", href: "collection.html", label: "⭐ Bộ Sưu Tập Của Tôi" },
    ];
  }

  function renderHeader() {
    const mount = document.getElementById("site-header");
    if (!mount) return;
    const active = getActiveNavKey();
    const staff = isStaff();
    const session = getSession();
    const navLinkClass = (key) =>
      active === key
        ? "px-4 py-2 rounded-full bg-rose-50 text-[#FF6B6B] font-extrabold shadow-sm border border-rose-200 transition whitespace-nowrap"
        : "px-4 py-2 rounded-full text-gray-600 hover:text-[#FF6B6B] hover:bg-rose-50/70 font-bold transition whitespace-nowrap";
    const links = (extra = "") =>
      navItems()
        .map((n) => `<a href="${n.href}" class="${navLinkClass(n.key)} ${extra}">${n.label}</a>`)
        .join("");

    const initials = staff
      ? escapeHtml(
          (session.name || "NV")
            .split(/\s+/)
            .map((w) => w[0])
            .join("")
            .slice(0, 2)
            .toUpperCase()
        )
      : "";

    mount.innerHTML = `
      <header class="glass-nav sticky top-0 z-50">
        <div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div class="flex items-center justify-between py-3 gap-2 sm:gap-4">
            <a href="${staff ? "admin.html#kho" : "index.html"}" class="flex items-center gap-2 sm:gap-3 group min-w-0">
              <div class="relative w-10 h-10 sm:w-11 sm:h-11 shrink-0 rounded-2xl bg-gradient-to-br from-[#FFD93D] via-[#FF9F68] to-[#FF6B6B] p-0.5 shadow-md group-hover:rotate-[-4deg] transition-transform">
                <div class="w-full h-full bg-white rounded-[14px] flex items-center justify-center overflow-hidden">
                  <img src="assets/logo.png" alt="HACIPUPU Logo" class="w-full h-full object-contain p-1"
                    onerror="window.HacipupuApp.handleLogoError(this)" />
                  <span class="hidden font-display font-bold text-lg text-[#FF6B6B]">HP</span>
                </div>
              </div>
              <div class="min-w-0">
                <div class="font-display font-bold text-base sm:text-xl leading-tight tracking-tight text-gray-900 truncate">
                  HACIPUPU <span class="text-[#FF6B6B]">Toy Box</span>
                </div>
                <div class="hidden sm:block text-[11px] font-bold tracking-wider uppercase ${staff ? "text-emerald-600" : "text-sky-500"}">
                  ${staff ? "Chế độ nhân viên" : "Designer Blind Box Store"}
                </div>
              </div>
            </a>

            <nav class="hidden xl:flex items-center gap-1.5 text-sm">${links()}</nav>

            <div class="flex items-center gap-1.5 sm:gap-2.5 shrink-0">
              ${
                staff
                  ? ""
                  : `<button id="open-cart-btn" type="button"
                      class="relative inline-flex items-center gap-1.5 sm:gap-2 px-3 sm:px-4 py-2.5 rounded-full bg-gray-900 hover:bg-[#FF6B6B] text-white font-bold text-sm shadow-md transition-colors cursor-pointer"
                      aria-label="Mở giỏ hàng">
                      <svg class="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2.2">
                        <path stroke-linecap="round" stroke-linejoin="round" d="M3 3h2l.4 2M7 13h10l4-8H5.4M7 13L5.4 5M7 13l-2.293 2.293c-.63.63-.184 1.707.707 1.707H17m0 0a2 2 0 100 4 2 2 0 000-4zm-8 2a2 2 0 11-4 0 2 2 0 014 0z"/>
                      </svg>
                      <span class="hidden sm:inline">Giỏ Hàng</span>
                      <span id="cart-count-badge"
                        class="inline-flex items-center justify-center min-w-[22px] h-[22px] px-1.5 rounded-full bg-[#FFD93D] text-gray-900 text-xs font-extrabold">0</span>
                    </button>`
              }

              <div class="relative">
                <button id="account-btn" type="button" aria-haspopup="true" aria-expanded="false"
                  title="${staff ? escapeHtml(session.name) : "Tài khoản — Đăng nhập nhân viên"}"
                  class="account-avatar ${staff ? "is-staff" : ""}">
                  ${
                    staff
                      ? `<span class="font-display font-bold text-sm">${initials}</span><span class="account-dot"></span>`
                      : `<svg class="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2.2">
                           <path stroke-linecap="round" stroke-linejoin="round" d="M15.75 6a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0zM4.5 20.1a7.5 7.5 0 0115 0A17.9 17.9 0 0112 21.75c-2.68 0-5.22-.58-7.5-1.65z"/>
                         </svg>`
                  }
                </button>
                <div id="account-menu" class="account-menu hidden" role="menu">
                  ${
                    staff
                      ? `<div class="px-4 py-3 border-b border-gray-100">
                           <div class="text-[11px] font-extrabold uppercase text-emerald-600">Đang đăng nhập</div>
                           <div class="font-bold text-gray-900">${escapeHtml(session.name)}</div>
                           <div class="text-xs text-gray-400 font-semibold">@${escapeHtml(session.username)}</div>
                         </div>
                         <a href="admin.html#kho" class="account-menu-item">📦 Quản lý kho</a>
                         <a href="admin.html#don-hang" class="account-menu-item">🧾 Đơn hàng</a>
                         <a href="admin.html#them-moi" class="account-menu-item">➕ Thêm sản phẩm / series</a>
                         <button type="button" id="logout-btn" class="account-menu-item text-[#FF6B6B] w-full text-left border-t border-gray-100">↩ Đăng xuất</button>`
                      : `<div class="px-4 py-3 border-b border-gray-100">
                           <div class="text-[11px] font-extrabold uppercase text-sky-600">Bạn đang xem với vai trò</div>
                           <div class="font-bold text-gray-900">Khách hàng</div>
                         </div>
                         <a href="orders.html" class="account-menu-item">🧾 Đơn hàng của tôi</a>
                         <a href="collection.html" class="account-menu-item">⭐ Bộ sưu tập của tôi</a>
                         <button type="button" id="replay-tour-btn" class="account-menu-item w-full text-left border-t border-gray-100">🧭 Xem lại hướng dẫn nhanh</button>
                         <button type="button" id="open-login-btn" class="account-menu-item w-full text-left border-t border-gray-100 text-emerald-700">🔐 Đăng nhập nhân viên</button>`
                  }
                </div>
              </div>

              <button id="mobile-menu-btn" type="button"
                class="xl:hidden p-2.5 rounded-2xl bg-gray-100 hover:bg-gray-200 text-gray-700" aria-label="Menu">
                <svg class="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2.2">
                  <path stroke-linecap="round" stroke-linejoin="round" d="M4 6h16M4 12h16M4 18h16"/>
                </svg>
              </button>
            </div>
          </div>

          <div id="mobile-nav" class="hidden xl:hidden pb-3 pt-1 flex flex-wrap gap-2 text-sm">${links()}</div>
        </div>
      </header>
    `;

    document.getElementById("open-cart-btn")?.addEventListener("click", openCartDrawer);
    document.getElementById("mobile-menu-btn")?.addEventListener("click", () => {
      document.getElementById("mobile-nav")?.classList.toggle("hidden");
    });

    const accountBtn = document.getElementById("account-btn");
    const accountMenu = document.getElementById("account-menu");
    accountBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      const open = accountMenu.classList.toggle("hidden") === false;
      accountBtn.setAttribute("aria-expanded", String(open));
    });
    document.getElementById("replay-tour-btn")?.addEventListener("click", () => {
      accountMenu.classList.add("hidden");
      window.HacipupuTour && window.HacipupuTour.replay();
    });
    document.getElementById("open-login-btn")?.addEventListener("click", () => {
      accountMenu.classList.add("hidden");
      openLoginModal();
    });
    document.getElementById("logout-btn")?.addEventListener("click", () => {
      logout();
      window.location.href = "index.html";
    });
    accountMenu.querySelectorAll("a").forEach((a) => a.addEventListener("click", () => accountMenu.classList.add("hidden")));
  }

  document.addEventListener("click", (e) => {
    const menu = document.getElementById("account-menu");
    if (menu && !menu.classList.contains("hidden") && !menu.contains(e.target)) menu.classList.add("hidden");
  });

  // ---------- Đăng nhập nhân viên ----------
  function ensureLoginModal() {
    if (document.getElementById("login-modal")) return;
    const wrap = document.createElement("div");
    wrap.innerHTML = `
      <div id="login-modal" class="modal-overlay" role="dialog" aria-modal="true" aria-labelledby="login-title">
        <div class="bg-white rounded-[28px] max-w-sm w-full p-7 shadow-2xl border-2 border-emerald-200 relative">
          <button type="button" data-close-login
            class="absolute top-4 right-4 w-9 h-9 rounded-full bg-gray-100 hover:bg-gray-200 text-gray-600 font-bold cursor-pointer" aria-label="Đóng">✕</button>
          <div class="w-14 h-14 rounded-2xl bg-emerald-100 text-2xl flex items-center justify-center mb-3">🔐</div>
          <h3 id="login-title" class="font-display font-bold text-2xl text-gray-900">Đăng nhập nhân viên</h3>
          <p class="text-sm text-gray-500 font-semibold mb-5">Quản lý kho, duyệt đơn hàng và thêm sản phẩm mới.</p>
          <form id="login-form" class="space-y-3">
            <div>
              <label class="block text-xs font-extrabold text-gray-600 mb-1" for="login-username">Tên đăng nhập</label>
              <input id="login-username" name="username" autocomplete="username" required
                class="w-full px-3.5 py-2.5 rounded-xl border border-gray-200 text-sm font-semibold focus:outline-none focus:ring-2 focus:ring-emerald-400" />
            </div>
            <div>
              <label class="block text-xs font-extrabold text-gray-600 mb-1" for="login-password">Mật khẩu</label>
              <input id="login-password" name="password" type="password" autocomplete="current-password" required
                class="w-full px-3.5 py-2.5 rounded-xl border border-gray-200 text-sm font-semibold focus:outline-none focus:ring-2 focus:ring-emerald-400" />
            </div>
            <p id="login-error" class="hidden text-xs font-bold text-[#FF6B6B]">Sai tên đăng nhập hoặc mật khẩu.</p>
            <button type="submit" class="w-full py-3 rounded-2xl bg-emerald-500 hover:bg-emerald-600 text-white font-extrabold text-sm shadow-md cursor-pointer transition">Đăng nhập</button>
          </form>
          <p class="mt-4 text-[11px] text-gray-400 font-semibold leading-relaxed">
            Tài khoản demo của đồ án: <code class="font-mono text-gray-600">admin</code> / <code class="font-mono text-gray-600">admin2026</code>
          </p>
        </div>
      </div>`;
    document.body.appendChild(wrap.firstElementChild);
    const modal = document.getElementById("login-modal");
    modal.addEventListener("click", (e) => {
      if (e.target === modal || e.target.closest("[data-close-login]")) modal.classList.remove("open");
    });
    document.getElementById("login-form").addEventListener("submit", (e) => {
      e.preventDefault();
      const f = e.target;
      if (loginStaff(f.username.value, f.password.value)) {
        window.location.href = "admin.html#kho";
        if (document.body.dataset.page === "admin") window.location.reload();
      } else {
        document.getElementById("login-error").classList.remove("hidden");
      }
    });
  }

  function openLoginModal() {
    ensureLoginModal();
    document.getElementById("login-error").classList.add("hidden");
    document.getElementById("login-modal").classList.add("open");
    setTimeout(() => document.getElementById("login-username")?.focus(), 50);
  }

  // ---------- Footer ----------
  function renderFooter() {
    const mount = document.getElementById("site-footer");
    if (!mount) return;
    mount.innerHTML = `
      <footer class="mt-20 border-t border-gray-200 bg-white">
        <div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
          <div class="grid grid-cols-1 md:grid-cols-3 gap-8 items-start">
            <div>
              <div class="font-display font-bold text-xl text-gray-900 mb-2">
                HACIPUPU <span class="text-[#FF6B6B]">Toy Box</span>
              </div>
              <p class="text-sm text-gray-500 leading-relaxed">
                Cửa hàng trưng bày & sưu tầm mô hình Blind Box HACIPUPU chính hãng.
                Không gian sắc màu pastel dành cho cộng đồng yêu thích Designer Toys.
              </p>
            </div>
            <div>
              <h4 class="font-display font-bold text-gray-900 mb-3">Điều Hướng Nhanh</h4>
              <ul class="space-y-2 text-sm text-gray-600 font-semibold">
                <li><a href="index.html" class="hover:text-[#FF6B6B] transition">Trang Chủ - Kệ Blind Box</a></li>
                <li><a href="detail.html?id=1" class="hover:text-[#FF6B6B] transition">My Little Hero Series</a></li>
                <li><a href="detail.html?id=2" class="hover:text-[#FF6B6B] transition">Adventures In The Woods</a></li>
                <li><a href="detail.html?id=3" class="hover:text-[#FF6B6B] transition">Snuggle With You Series</a></li>
                <li><a href="about.html" class="hover:text-[#FF6B6B] transition">About Us</a></li>
                <li><a href="orders.html" class="hover:text-[#FF6B6B] transition">Đơn Hàng Của Tôi</a></li>
                <li><a href="collection.html" class="hover:text-[#FF6B6B] transition">Bộ Sưu Tập Của Tôi</a></li>
                
              </ul>
            </div>
            <div class="rounded-2xl bg-gradient-to-br from-amber-50 via-rose-50 to-sky-50 p-3.5 border border-amber-200/70 shadow-sm">
              <div class="flex items-center justify-between gap-2 mb-2.5 px-1">
                <span class="inline-flex items-center gap-1.5 text-xs font-extrabold text-[#FF6B6B]">📍 Địa Chỉ Cửa Hàng (Hobiverse)</span>
                <span class="text-[11px] font-bold text-gray-500">Google Maps</span>
              </div>
              <div class="w-full h-48 rounded-xl overflow-hidden border border-white shadow-inner bg-white">
                <iframe
                  src="https://www.google.com/maps/embed?pb=!1m14!1m8!1m3!1d31354.89794480577!2d106.6630497!3d10.7835431!3m2!1i1024!2i768!4f13.1!3m3!1m2!1s0x31752f00173a4fb7%3A0x127ae5a1d74ce7e4!2sHobiverse!5e0!3m2!1svi!2s!4v1795620942268!5m2!1svi!2s"
                  width="600" height="450" class="w-full h-full" style="border:0;" allowfullscreen="" loading="lazy"
                  referrerpolicy="strict-origin-when-cross-origin" title="Bản đồ cửa hàng Hobiverse"></iframe>
              </div>
            </div>
          </div>
          <div class="mt-8 pt-6 border-t border-gray-100 flex flex-col sm:flex-row justify-between items-center gap-3 text-xs text-gray-400 font-semibold">
            <span>© 2026 HACIPUPU Toy Box — Educational Showcase</span>
            <span>Made with 💖 & Pastel Vibes</span>
          </div>
        </div>
      </footer>
    `;
  }

  // ---------- Giỏ hàng & thanh toán ----------
  let lastCart = { items: [], total_quantity: 0, total_amount: 0 };

  const ITEM_BADGES = {
    FULL_SET: { label: "Full Set", cls: "bg-amber-100 text-amber-800" },
    BLIND_BOX: { label: "Blind Box", cls: "bg-purple-100 text-purple-700" },
    FIGURE: { label: "Figure Lẻ", cls: "bg-sky-100 text-sky-700" },
  };

  const inputCls =
    "w-full px-3.5 py-2.5 rounded-xl border border-gray-200 text-sm font-semibold focus:outline-none focus:ring-2 focus:ring-[#4D96FF]";

  function ensureCartDrawerDOM() {
    if (document.getElementById("cart-drawer")) return;
    const wrapper = document.createElement("div");
    wrapper.innerHTML = `
      <div id="cart-backdrop" class="cart-backdrop"></div>
      <aside id="cart-drawer" class="cart-drawer" aria-label="Giỏ hàng của bạn">
        <div class="px-6 py-5 border-b border-gray-100 flex items-center justify-between bg-gradient-to-r from-rose-50 via-amber-50 to-sky-50">
          <div class="flex items-center gap-2.5">
            <span class="text-2xl">🛍️</span>
            <div>
              <h2 class="font-display font-bold text-xl text-gray-900">Giỏ Hàng Blind Box</h2>
              <p id="cart-subtitle" class="text-xs font-bold text-gray-500">Đang tải dữ liệu...</p>
            </div>
          </div>
          <button id="close-cart-btn" type="button"
            class="w-9 h-9 rounded-full bg-white hover:bg-gray-100 text-gray-600 flex items-center justify-center shadow-sm cursor-pointer"
            aria-label="Đóng giỏ hàng">✕</button>
        </div>

        <div id="cart-scroll" class="flex-1 overflow-y-auto bg-[#FAFAFA]">
          <div id="cart-items-list" class="p-5 space-y-3"></div>

          <form id="checkout-form" class="hidden px-5 pb-6 space-y-3" novalidate>
            <div class="text-xs font-extrabold uppercase tracking-wider text-sky-600 pt-1">1. Thông tin nhận hàng</div>
            <input type="text" name="customer_name" required placeholder="Họ và tên người nhận *" class="${inputCls}" />
            <input type="tel" name="customer_phone" required placeholder="Số điện thoại *" class="${inputCls}" />
            <input type="text" name="customer_address" required placeholder="Địa chỉ giao hàng chi tiết *" class="${inputCls}" />
            <input type="text" name="note" placeholder="Ghi chú cho shop (không bắt buộc)" class="${inputCls}" />

            <div class="text-xs font-extrabold uppercase tracking-wider text-sky-600 pt-2">2. Phương thức thanh toán</div>
            <div class="grid grid-cols-3 gap-2" role="radiogroup">
              <label class="pay-option">
                <input type="radio" name="payment_method" value="COD" checked class="sr-only" />
                <span class="text-xl">💵</span><span>Khi nhận hàng</span>
              </label>
              <label class="pay-option">
                <input type="radio" name="payment_method" value="CARD" class="sr-only" />
                <span class="text-xl">💳</span><span>Thẻ</span>
              </label>
              <label class="pay-option">
                <input type="radio" name="payment_method" value="QR" class="sr-only" />
                <span class="text-xl">📱</span><span>Mã QR</span>
              </label>
            </div>

            <div data-pay-panel="COD" class="pay-panel">
              Bạn thanh toán tiền mặt cho nhân viên giao hàng khi nhận được hộp. Kiểm tra hàng trước khi trả tiền nhé!
            </div>

            <div data-pay-panel="CARD" class="pay-panel hidden space-y-2.5">
              <input name="card_number" inputmode="numeric" autocomplete="cc-number" placeholder="Số thẻ (16 số)" class="${inputCls} font-mono" />
              <input name="card_name" autocomplete="cc-name" placeholder="Tên in trên thẻ" class="${inputCls} uppercase" />
              <div class="grid grid-cols-2 gap-2.5">
                <input name="card_exp" inputmode="numeric" autocomplete="cc-exp" placeholder="MM/YY" class="${inputCls} font-mono" />
                <input name="card_cvv" inputmode="numeric" autocomplete="cc-csc" placeholder="CVV" maxlength="4" class="${inputCls} font-mono" />
              </div>
              <p class="text-[11px] font-semibold text-gray-500">🔒 Website demo: không có giao dịch thật nào được thực hiện, chỉ lưu 4 số cuối của thẻ vào đơn.</p>
            </div>

            <div data-pay-panel="QR" class="pay-panel hidden text-center">
              <div id="qr-box" class="qr-box mx-auto"></div>
              <div class="mt-2 text-sm font-extrabold text-gray-900">Số tiền: <span id="qr-amount" class="text-[#FF6B6B]"></span></div>
              <div class="text-xs font-semibold text-gray-500">Nội dung chuyển khoản: <code id="qr-content" class="font-mono text-gray-800"></code></div>
              <label class="mt-3 inline-flex items-center gap-2 text-xs font-extrabold text-gray-700 cursor-pointer">
                <input type="checkbox" name="qr_done" class="w-4 h-4 accent-emerald-500" /> Tôi đã quét mã và chuyển khoản
              </label>
              <p class="text-[11px] font-semibold text-gray-400 mt-1">Mã QR minh họa cho đồ án. Nhân viên sẽ đối soát và xác nhận đơn.</p>
            </div>

            <p id="checkout-error" class="hidden text-xs font-bold text-[#FF6B6B]"></p>
          </form>
        </div>

        <div class="p-5 border-t border-gray-100 bg-white space-y-3">
          <div class="flex items-center justify-between">
            <span class="text-sm font-bold text-gray-500">Tổng thanh toán:</span>
            <span id="cart-total-amount" class="font-display font-bold text-2xl text-[#FF6B6B]">0 ₫</span>
          </div>
          <div id="checkout-actions" class="hidden flex gap-2">
            <button type="button" id="cancel-checkout-btn"
              class="px-4 py-3 rounded-xl bg-gray-100 hover:bg-gray-200 text-gray-700 font-bold text-sm cursor-pointer">Quay lại</button>
            <button type="submit" form="checkout-form" id="submit-order-btn"
              class="flex-1 py-3 rounded-xl btn-coral font-extrabold text-sm cursor-pointer">Xác nhận đặt hàng ✨</button>
          </div>
          <button id="show-checkout-btn" type="button"
            class="w-full py-3.5 rounded-2xl btn-coral font-extrabold text-base cursor-pointer disabled:opacity-50">Tiến hành đặt hàng</button>
        </div>
      </aside>

      <div id="order-success-modal" class="modal-overlay">
        <div class="bg-white rounded-3xl max-w-md w-full p-7 text-center shadow-2xl border-2 border-emerald-200 relative max-h-[90vh] overflow-y-auto">
          <div class="w-16 h-16 mx-auto mb-4 rounded-2xl bg-emerald-100 text-3xl flex items-center justify-center">🎁</div>
          <h3 class="font-display font-bold text-2xl text-gray-900 mb-2">Đặt hàng thành công!</h3>
          <div id="order-success-text" class="text-sm text-gray-600 leading-relaxed mb-4"></div>
          <div id="order-success-picked" class="hidden text-left mb-5"></div>
          <a href="orders.html" class="block w-full mb-2.5 py-3 rounded-2xl bg-amber-100 hover:bg-amber-200 text-amber-900 font-extrabold text-sm">🧾 Theo dõi đơn hàng của tôi</a>
          <button id="close-order-modal-btn" type="button"
            class="w-full py-3 rounded-2xl btn-sky font-extrabold text-sm cursor-pointer">Tuyệt vời, tiếp tục mua sắm!</button>
        </div>
      </div>
    `;
    document.body.appendChild(wrapper);

    const form = document.getElementById("checkout-form");
    document.getElementById("cart-backdrop").addEventListener("click", closeCartDrawer);
    document.getElementById("close-cart-btn").addEventListener("click", closeCartDrawer);
    document.getElementById("show-checkout-btn").addEventListener("click", () => setCheckoutOpen(true));
    document.getElementById("cancel-checkout-btn").addEventListener("click", () => setCheckoutOpen(false));
    document.getElementById("close-order-modal-btn").addEventListener("click", () => {
      document.getElementById("order-success-modal").classList.remove("open");
    });
    form.addEventListener("submit", handleCheckoutSubmit);
    form.querySelectorAll('input[name="payment_method"]').forEach((r) => r.addEventListener("change", syncPaymentPanels));

    form.card_number.addEventListener("input", (e) => {
      const digits = e.target.value.replace(/\D/g, "").slice(0, 19);
      e.target.value = digits.replace(/(.{4})/g, "$1 ").trim();
    });
    form.card_exp.addEventListener("input", (e) => {
      const d = e.target.value.replace(/\D/g, "").slice(0, 4);
      e.target.value = d.length > 2 ? `${d.slice(0, 2)}/${d.slice(2)}` : d;
    });
    form.card_cvv.addEventListener("input", (e) => (e.target.value = e.target.value.replace(/\D/g, "").slice(0, 4)));
    form.customer_phone.addEventListener("input", () => {
      if (selectedPayment() === "QR") renderQR();
    });
  }

  function setCheckoutOpen(open) {
    document.getElementById("checkout-form").classList.toggle("hidden", !open);
    document.getElementById("checkout-actions").classList.toggle("hidden", !open);
    document.getElementById("show-checkout-btn").classList.toggle("hidden", open);
    document.getElementById("checkout-error").classList.add("hidden");
    if (open) {
      syncPaymentPanels();
      document.getElementById("checkout-form").scrollIntoView({ behavior: "smooth", block: "start" });
    }
  }

  function selectedPayment() {
    return document.querySelector('#checkout-form input[name="payment_method"]:checked')?.value || "COD";
  }

  function syncPaymentPanels() {
    const method = selectedPayment();
    document.querySelectorAll("#checkout-form [data-pay-panel]").forEach((p) => {
      p.classList.toggle("hidden", p.dataset.payPanel !== method);
    });
    document.querySelectorAll("#checkout-form .pay-option").forEach((opt) => {
      opt.classList.toggle("active", opt.querySelector("input").checked);
    });
    if (method === "QR") renderQR();
  }

  let qrLibPromise = null;
  function loadQrLib() {
    if (window.qrcode) return Promise.resolve(window.qrcode);
    if (!qrLibPromise) {
      qrLibPromise = new Promise((resolve, reject) => {
        const s = document.createElement("script");
        s.src = QR_LIB_URL;
        s.onload = () => (window.qrcode ? resolve(window.qrcode) : reject(new Error("QR lib")));
        s.onerror = () => {
          qrLibPromise = null;
          reject(new Error("Không tải được thư viện QR"));
        };
        document.head.appendChild(s);
      });
    }
    return qrLibPromise;
  }

  function qrTransferContent() {
    const phone = (document.querySelector('#checkout-form [name="customer_phone"]')?.value || "").replace(/\D/g, "");
    return `HACIPUPU ${phone || "SDT"}`;
  }

  async function renderQR() {
    const box = document.getElementById("qr-box");
    if (!box) return;
    const amount = lastCart.total_amount || 0;
    const content = qrTransferContent();
    document.getElementById("qr-amount").textContent = formatVND(amount);
    document.getElementById("qr-content").textContent = content;
    const payload = `HACIPUPU TOY BOX | So tien: ${amount} VND | Noi dung: ${content}`;
    try {
      const qrcode = await loadQrLib();
      const qr = qrcode(0, "M");
      qr.addData(payload);
      qr.make();
      box.innerHTML = qr.createSvgTag({ cellSize: 4, margin: 2, scalable: true });
    } catch (e) {
      box.innerHTML = `<div class="qr-fallback">QR<br/><span>Cần kết nối mạng để tạo mã</span></div>`;
    }
  }

  function openCartDrawer() {
    if (isStaff()) return;
    ensureCartDrawerDOM();
    document.getElementById("cart-backdrop").classList.add("open");
    document.getElementById("cart-drawer").classList.add("open");
    refreshCart();
  }

  function closeCartDrawer() {
    document.getElementById("cart-backdrop")?.classList.remove("open");
    document.getElementById("cart-drawer")?.classList.remove("open");
  }

  function renderCartData(cart) {
    lastCart = cart || lastCart;
    const badge = document.getElementById("cart-count-badge");
    if (badge) badge.textContent = String(cart.total_quantity || 0);

    const subtitle = document.getElementById("cart-subtitle");
    if (subtitle) {
      subtitle.textContent =
        cart.total_quantity > 0 ? `${cart.total_quantity} sản phẩm đang chờ mở hộp` : "Giỏ hàng đang trống";
    }

    const totalEl = document.getElementById("cart-total-amount");
    if (totalEl) totalEl.textContent = formatVND(cart.total_amount || 0);

    const empty = !cart.items || cart.items.length === 0;
    const showCheckoutBtn = document.getElementById("show-checkout-btn");
    if (showCheckoutBtn) showCheckoutBtn.disabled = empty;
    if (empty && document.getElementById("checkout-form")) setCheckoutOpen(false);
    if (!empty && selectedPayment() === "QR" && !document.getElementById("checkout-form")?.classList.contains("hidden")) {
      renderQR();
    }

    const listEl = document.getElementById("cart-items-list");
    if (!listEl) return;

    if (empty) {
      listEl.innerHTML = `
        <div class="text-center py-14 px-4">
          <div class="w-20 h-20 mx-auto mb-4 rounded-3xl bg-amber-100/70 flex items-center justify-center text-4xl">🧸</div>
          <p class="font-display font-bold text-lg text-gray-800 mb-1">Chưa có Blind Box nào!</p>
          <p class="text-sm text-gray-500">Hãy chọn 1 hộp blind box hoặc Full Set yêu thích để thêm vào giỏ nhé.</p>
        </div>`;
      return;
    }

    listEl.innerHTML = cart.items
      .map((item) => {
        const badgeInfo = ITEM_BADGES[item.item_type] || ITEM_BADGES.FIGURE;
        return `
          <div class="bg-white rounded-2xl p-3.5 border border-gray-100 shadow-sm flex items-center gap-3.5">
            <img src="${encodeAssetUrl(item.item_image)}" alt="${escapeHtml(item.item_name)}"
              class="w-16 h-16 rounded-xl object-contain bg-amber-50/50 p-1 shrink-0 border border-gray-100"
              onerror="window.HacipupuApp.handleImgError(this)" />
            <div class="flex-1 min-w-0">
              <span class="inline-block px-2 py-0.5 rounded-full text-[10px] font-extrabold uppercase ${badgeInfo.cls}">${badgeInfo.label}</span>
              <div class="font-bold text-sm text-gray-900 leading-snug line-clamp-2" title="${escapeHtml(item.item_name)}">${escapeHtml(item.item_name)}</div>
              <div class="text-xs font-extrabold text-[#FF6B6B] mt-0.5">${formatVND(item.unit_price)}</div>
            </div>
            <div class="flex flex-col items-end gap-2 shrink-0">
              <button type="button" data-cart-delete="${item.id}" class="text-gray-400 hover:text-[#FF6B6B] text-xs font-bold cursor-pointer" title="Xóa khỏi giỏ">🗑️</button>
              <div class="inline-flex items-center rounded-xl bg-gray-100 p-0.5">
                <button type="button" data-cart-dec="${item.id}" data-qty="${item.quantity}"
                  class="w-7 h-7 rounded-lg hover:bg-white text-gray-700 font-extrabold text-sm cursor-pointer" aria-label="Giảm">−</button>
                <span class="px-2.5 text-xs font-extrabold text-gray-900">${item.quantity}</span>
                <button type="button" data-cart-inc="${item.id}" data-qty="${item.quantity}"
                  class="w-7 h-7 rounded-lg hover:bg-white text-gray-700 font-extrabold text-sm cursor-pointer" aria-label="Tăng">+</button>
              </div>
            </div>
          </div>`;
      })
      .join("");

    listEl.querySelectorAll("[data-cart-inc]").forEach((btn) => {
      btn.addEventListener("click", () => updateCartQuantity(Number(btn.dataset.cartInc), Number(btn.dataset.qty) + 1));
    });
    listEl.querySelectorAll("[data-cart-dec]").forEach((btn) => {
      btn.addEventListener("click", () => updateCartQuantity(Number(btn.dataset.cartDec), Number(btn.dataset.qty) - 1));
    });
    listEl.querySelectorAll("[data-cart-delete]").forEach((btn) => {
      btn.addEventListener("click", () => removeCartItem(Number(btn.dataset.cartDelete)));
    });
  }

  async function refreshCart() {
    try {
      const cart = await apiFetch("/api/cart");
      renderCartData(cart);
      return cart;
    } catch (err) {
      console.error(err);
    }
  }

  /**
   * Thêm vào giỏ. itemType: FIGURE | BLIND_BOX | FULL_SET.
   * extra.revealedFigureId: mẫu đã mở sẵn từ trò chọn hộp ở trang chủ.
   */
  async function addToCart(itemType, itemId, quantity = 1, openDrawer = false, extra = {}) {
    if (isStaff()) {
      showToast("Bạn đang ở chế độ nhân viên. Đăng xuất để mua hàng như khách.", "info");
      return null;
    }
    try {
      const cart = await apiFetch("/api/cart", {
        method: "POST",
        body: JSON.stringify({
          item_type: itemType,
          item_id: itemId,
          quantity,
          revealed_figure_id: extra.revealedFigureId || null,
        }),
      });
      renderCartData(cart);
      showToast("Đã thêm vào giỏ hàng!");
      if (openDrawer) openCartDrawer();
      return cart;
    } catch (err) {
      showToast(err.message, "error");
      throw err;
    }
  }

  async function updateCartQuantity(cartId, newQty) {
    try {
      const cart = await apiFetch(`/api/cart/${cartId}`, { method: "PUT", body: JSON.stringify({ quantity: newQty }) });
      renderCartData(cart);
    } catch (err) {
      showToast(err.message, "error");
    }
  }

  async function removeCartItem(cartId) {
    try {
      const cart = await apiFetch(`/api/cart/${cartId}`, { method: "DELETE" });
      renderCartData(cart);
      showToast("Đã xóa sản phẩm khỏi giỏ.", "info");
    } catch (err) {
      showToast(err.message, "error");
    }
  }

  function luhnValid(digits) {
    let sum = 0;
    let dbl = false;
    for (let i = digits.length - 1; i >= 0; i--) {
      let d = Number(digits[i]);
      if (dbl) {
        d *= 2;
        if (d > 9) d -= 9;
      }
      sum += d;
      dbl = !dbl;
    }
    return sum % 10 === 0;
  }

  function validateCheckout(form, method) {
    if (!form.customer_name.value.trim()) return "Vui lòng nhập họ tên người nhận.";
    if (!/^0\d{9,10}$/.test(form.customer_phone.value.replace(/[\s.]/g, "")))
      return "Số điện thoại chưa hợp lệ (10–11 số, bắt đầu bằng 0).";
    if (!form.customer_address.value.trim()) return "Vui lòng nhập địa chỉ giao hàng.";
    if (method === "CARD") {
      const digits = form.card_number.value.replace(/\D/g, "");
      if (digits.length < 13 || !luhnValid(digits)) return "Số thẻ không hợp lệ.";
      if (!form.card_name.value.trim()) return "Vui lòng nhập tên in trên thẻ.";
      const m = form.card_exp.value.match(/^(\d{2})\/(\d{2})$/);
      if (!m || Number(m[1]) < 1 || Number(m[1]) > 12) return "Ngày hết hạn phải có dạng MM/YY.";
      const expEnd = new Date(2000 + Number(m[2]), Number(m[1]), 1);
      if (expEnd <= new Date()) return "Thẻ đã hết hạn.";
      if (!/^\d{3,4}$/.test(form.card_cvv.value)) return "CVV gồm 3–4 chữ số.";
    }
    if (method === "QR" && !form.qr_done.checked) return "Hãy quét mã QR, chuyển khoản rồi tích ô xác nhận.";
    return "";
  }

  async function handleCheckoutSubmit(e) {
    e.preventDefault();
    const form = e.target;
    const method = selectedPayment();
    const errEl = document.getElementById("checkout-error");
    const problem = validateCheckout(form, method);
    if (problem) {
      errEl.textContent = problem;
      errEl.classList.remove("hidden");
      errEl.scrollIntoView({ behavior: "smooth", block: "nearest" });
      return;
    }
    errEl.classList.add("hidden");

    const submitBtn = document.getElementById("submit-order-btn");
    const payload = {
      customer_name: form.customer_name.value.trim(),
      customer_phone: form.customer_phone.value.trim(),
      customer_address: form.customer_address.value.trim(),
      note: form.note.value.trim(),
      payment_method: method,
      // Chỉ gửi 4 số cuối — số thẻ đầy đủ, tên thẻ và CVV không được lưu ở đâu cả.
      card_last4: method === "CARD" ? form.card_number.value.replace(/\D/g, "").slice(-4) : "",
    };

    try {
      submitBtn.disabled = true;
      const res = await apiFetch("/api/orders", { method: "POST", body: JSON.stringify(payload) });
      rememberMyOrder(res.order.id);
      form.reset();
      renderCartData(res.cart);
      closeCartDrawer();
      showOrderSuccess(res.order);
      window.dispatchEvent(new CustomEvent("hacipupu:order-completed", { detail: res.order }));
    } catch (err) {
      errEl.textContent = err.message;
      errEl.classList.remove("hidden");
      showToast(err.message, "error");
    } finally {
      submitBtn.disabled = false;
    }
  }

  function showOrderSuccess(order) {
    const textEl = document.getElementById("order-success-text");
    const payText =
      order.payment_method === "CARD"
        ? `đã thanh toán bằng thẻ •••• ${escapeHtml(order.card_last4)}`
        : order.payment_method === "QR"
        ? "thanh toán qua mã QR (chờ shop đối soát)"
        : "thanh toán khi nhận hàng";
    textEl.innerHTML = `Cảm ơn <strong>${escapeHtml(order.customer_name)}</strong>! Đơn <strong>${escapeHtml(
      order.code
    )}</strong> trị giá <strong class="text-[#FF6B6B]">${formatVND(order.total_amount)}</strong>, ${payText}.<br/>
      Trạng thái: <span class="inline-block mt-1 px-2.5 py-0.5 rounded-full bg-amber-100 text-amber-800 text-xs font-extrabold">${escapeHtml(
        order.status_label
      )}</span>`;

    // Các blind box mua ngẫu nhiên: cho khách xem mình đã "mở" được mẫu nào.
    const boxes = order.items.filter((i) => i.item_type === "BLIND_BOX");
    const pickedEl = document.getElementById("order-success-picked");
    const picked = boxes.flatMap((i) => i.picked);
    if (!picked.length) {
      pickedEl.classList.add("hidden");
    } else {
      pickedEl.classList.remove("hidden");
      pickedEl.innerHTML = `
        <div class="text-xs font-extrabold uppercase text-purple-600 mb-2">🎲 Blind box của bạn chứa:</div>
        <div class="grid grid-cols-3 gap-2">
          ${picked
            .map(
              (p) => `
            <div class="rounded-xl border ${p.is_secret ? "border-amber-300 bg-amber-50" : "border-gray-100 bg-gray-50"} p-2 text-center">
              <img src="${encodeAssetUrl(p.image)}" alt="" class="w-full h-16 object-contain" onerror="window.HacipupuApp.handleImgError(this)" />
              <div class="text-[11px] font-bold text-gray-800 truncate" title="${escapeHtml(p.name)}">${escapeHtml(p.name)}${
                p.qty > 1 ? ` ×${p.qty}` : ""
              }</div>
            </div>`
            )
            .join("")}
        </div>
        <button type="button" id="add-picked-collection" class="mt-3 w-full py-2.5 rounded-xl bg-purple-100 hover:bg-purple-200 text-purple-800 font-extrabold text-xs cursor-pointer">⭐ Đánh dấu các mẫu này là "Đã có" trong bộ sưu tập</button>`;
      document.getElementById("add-picked-collection").onclick = async (ev) => {
        for (const p of picked) await setOwned(p.figure_id, true);
        ev.target.disabled = true;
        ev.target.textContent = "✓ Đã thêm vào bộ sưu tập";
      };
    }
    document.getElementById("order-success-modal")?.classList.add("open");
  }

  // ---------- Bộ sưu tập ----------
  async function setOwned(figureId, owned) {
    const res = await apiFetch(`/api/collection/${figureId}`, { method: "PUT", body: JSON.stringify({ owned }) });
    window.dispatchEvent(new CustomEvent("hacipupu:collection-changed", { detail: res }));
    return res;
  }

  // ---------- Khởi động ----------
  document.addEventListener("DOMContentLoaded", () => {
    renderHeader();
    renderFooter();
    if (!isStaff()) {
      ensureCartDrawerDOM();
      refreshCart();
    }
  });

  window.addEventListener("hashchange", () => {
    if (document.body.dataset.page === "admin") renderHeader();
  });

  window.HacipupuApp = {
    PLACEHOLDER_URL,
    formatVND,
    escapeHtml,
    encodeAssetUrl,
    shortSeriesName,
    handleImgError,
    handleLogoError,
    apiFetch,
    showToast,
    refreshCart,
    addToCart,
    openCartDrawer,
    closeCartDrawer,
    getSession,
    isStaff,
    openLoginModal,
    setOwned,
    getMyOrderIds,
  };
})();
