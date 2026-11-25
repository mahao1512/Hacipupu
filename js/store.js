/*
 * HACIPUPU Toy Box — kho dữ liệu chạy hoàn toàn trên trình duyệt.
 *
 * Thay thế cho server.py + SQLite để trang web chạy được trên hosting tĩnh
 * (GitHub Pages). Dữ liệu gốc được đọc từ data/series.csv và data/figures.csv,
 * mọi thay đổi (giỏ hàng, đơn hàng, kho, bộ sưu tập) được lưu vào localStorage
 * của trình duyệt. API giữ dạng /api/... như bản server cũ.
 *
 * Lưu ý: localStorage là riêng của từng trình duyệt — đơn hàng khách đặt trên
 * máy A sẽ không hiện ở trang nhân viên trên máy B.
 */
(() => {
  const STORAGE_KEY = "hacipupu_store_v1";

  /** Tỷ lệ ra mẫu Secret khi mở 1 blind box. */
  const SECRET_RATE = 1 / 144;

  const ORDER_STATUSES = {
    PENDING: "Chờ xác nhận",
    CONFIRMED: "Đã xác nhận",
    SHIPPING: "Đang vận chuyển",
    DELIVERED: "Đã nhận hàng",
    CANCELLED: "Đã hủy",
  };

  const PAYMENT_METHODS = {
    COD: "Thanh toán khi nhận hàng",
    CARD: "Thẻ ngân hàng",
    QR: "Mã QR chuyển khoản",
  };

  class ApiError extends Error {
    constructor(status, message) {
      super(message);
      this.status = status;
    }
  }

  // ---------- CSV ----------
  function parseCSV(text) {
    const rows = [];
    let row = [];
    let field = "";
    let inQuotes = false;
    text = text.replace(/^﻿/, "");
    for (let i = 0; i < text.length; i++) {
      const c = text[i];
      if (inQuotes) {
        if (c === '"') {
          if (text[i + 1] === '"') {
            field += '"';
            i++;
          } else inQuotes = false;
        } else field += c;
      } else if (c === '"') inQuotes = true;
      else if (c === ",") {
        row.push(field);
        field = "";
      } else if (c === "\n" || c === "\r") {
        if (c === "\r" && text[i + 1] === "\n") i++;
        row.push(field);
        rows.push(row);
        row = [];
        field = "";
      } else field += c;
    }
    if (field !== "" || row.length) {
      row.push(field);
      rows.push(row);
    }
    const header = rows.shift() || [];
    return rows
      .filter((r) => r.some((v) => v.trim() !== ""))
      .map((r) => Object.fromEntries(header.map((h, idx) => [h.trim(), (r[idx] ?? "").trim()])));
  }

  async function fetchText(path) {
    const res = await fetch(path, { cache: "no-cache" });
    if (!res.ok) throw new ApiError(500, `Không tải được ${path}`);
    return res.text();
  }

  // ---------- State ----------
  let state = null;
  let images = [];
  let readyPromise = null;

  function save() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch (e) {
      throw new ApiError(507, "Bộ nhớ trình duyệt đã đầy (thường do ảnh tải lên quá nhiều/quá lớn).");
    }
  }

  // Ưu tiên đọc CSV; nếu trình duyệt chặn (mở file:// trực tiếp) thì dùng bản nhúng data/seed.js.
  // Mở trực tiếp file HTML (file://): trình duyệt chặn fetch và báo lỗi CORS đỏ trong console,
  // nên dùng luôn dữ liệu nhúng mà không thử fetch.
  const IS_FILE = window.location.protocol === "file:";
  const EMBEDDED = () => window.HACIPUPU_SEED || null;

  async function loadSeedTexts() {
    const embedded = EMBEDDED();
    if (IS_FILE && embedded && embedded.seriesCsv) return [embedded.seriesCsv, embedded.figuresCsv];
    try {
      return await Promise.all([fetchText("data/series.csv"), fetchText("data/figures.csv")]);
    } catch (err) {
      if (embedded && embedded.seriesCsv) return [embedded.seriesCsv, embedded.figuresCsv];
      throw err;
    }
  }

  async function loadImages() {
    if (IS_FILE && EMBEDDED()) return EMBEDDED().images || [];
    try {
      const res = await fetch("data/images.json", { cache: "no-cache" });
      if (res.ok) return await res.json();
    } catch (e) {
      /* dùng bản nhúng bên dưới */
    }
    return (window.HACIPUPU_SEED && window.HACIPUPU_SEED.images) || [];
  }

  async function loadSeed() {
    const [seriesText, figuresText] = await loadSeedTexts();
    const series = parseCSV(seriesText).map((r) => ({
      id: Number(r.id),
      name: r.name,
      slug: r.slug,
      box_image: r.box_image,
      local_video: r.local_video || "",
      youtube_embed_url: r.youtube_embed_url || "",
      full_set_price: Number(r.full_set_price),
      blind_box_price: r.blind_box_price ? Number(r.blind_box_price) : null,
      description: r.description || "",
    }));
    const figures = parseCSV(figuresText).map((r) => ({
      id: Number(r.id),
      series_id: Number(r.series_id),
      name: r.name,
      image_path: r.image_path,
      price: Number(r.price),
      stock: r.stock === "" ? 10 : Number(r.stock),
      is_secret: Number(r.is_secret || 0) ? 1 : 0,
    }));
    return { series, figures, cart_items: [], orders: [], collection: [], seq: {} };
  }

  /** Giá 1 blind box mặc định = giá phổ biến nhất của các mẫu thường trong series. */
  function defaultBlindBoxPrice(s) {
    const prices = state.figures.filter((f) => f.series_id === s.id && !f.is_secret).map((f) => f.price);
    if (!prices.length) return Math.round((s.full_set_price || 0) / 12 / 1000) * 1000;
    const freq = {};
    prices.forEach((p) => (freq[p] = (freq[p] || 0) + 1));
    return Number(Object.entries(freq).sort((a, b) => b[1] - a[1] || a[0] - b[0])[0][0]);
  }

  function migrate() {
    state.collection = Array.isArray(state.collection) ? state.collection : [];
    state.seq = state.seq || {};
    for (const s of state.series) {
      if (!s.blind_box_price) s.blind_box_price = defaultBlindBoxPrice(s);
    }
    for (const c of state.cart_items) {
      if (c.revealed_figure_id === undefined) c.revealed_figure_id = null;
    }
    for (const o of state.orders) {
      o.items = o.items || [];
      o.status = o.status || "PENDING";
      o.payment_method = o.payment_method || "COD";
      o.payment_status = o.payment_status || (o.payment_method === "CARD" ? "PAID" : "UNPAID");
      o.status_history = o.status_history || [{ status: o.status, at: o.created_at }];
    }
    for (const t of ["series", "figures", "cart_items", "orders"]) {
      const maxId = Math.max(0, ...state[t].map((x) => x.id));
      state.seq[t] = Math.max(state.seq[t] || 0, maxId);
    }
  }

  function ready() {
    if (readyPromise) return readyPromise;
    readyPromise = (async () => {
      const imgPromise = loadImages();
      let stored = null;
      try {
        stored = JSON.parse(localStorage.getItem(STORAGE_KEY) || "null");
      } catch (e) {
        stored = null;
      }
      state = stored && Array.isArray(stored.series) && stored.series.length ? stored : await loadSeed();
      migrate();
      images = await imgPromise;
      try {
        save();
      } catch (e) {
        console.warn(e.message);
      }
    })();
    return readyPromise;
  }

  function nextId(table) {
    state.seq[table] = (state.seq[table] || 0) + 1;
    return state.seq[table];
  }

  function nowStamp() {
    const d = new Date();
    const p = (n) => String(n).padStart(2, "0");
    return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(
      d.getMinutes()
    )}:${p(d.getSeconds())}`;
  }

  // ---------- Helpers ----------
  const clone = (o) => JSON.parse(JSON.stringify(o));
  const toInt = (v) => {
    if (v === null || v === undefined || v === "" || typeof v === "boolean") return NaN;
    const n = Number(v);
    return Number.isInteger(n) ? n : Math.trunc(n);
  };
  const isTrue = (v) => [1, true, "1", "true"].includes(v);
  const findSeries = (id) => state.series.find((s) => s.id === id);
  const findFigure = (id) => state.figures.find((f) => f.id === id);
  const shortSeriesName = (name) => String(name || "").replace(/^HACIPUPU\s*/, "").replace(/\s*Series Figures$/, "");

  function normalizeImage(p) {
    let s = String(p ?? "").trim();
    if (/^(data:|https?:|blob:)/i.test(s)) return s;
    s = s.replace(/^\/+/, "");
    if (s && !s.startsWith("img/")) s = `img/${s}`;
    return s;
  }

  function slugify(name) {
    return String(name)
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "")
      .replace(/đ/gi, "d")
      .toLowerCase()
      .replace(/^hacipupu\s*/, "")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "");
  }

  function lineupImageFor(series) {
    if (series.lineup_image_custom) return series.lineup_image_custom;
    const box = series.box_image || "";
    const dir = box.includes("/") ? box.slice(0, box.lastIndexOf("/") + 1) : "";
    if (!dir || /^data:/i.test(box)) return "";
    for (const ext of [".png", ".avif", ".webp", ".jpg", ".jpeg"]) {
      const cand = `${dir}all${ext}`;
      if (images.includes(cand)) return cand;
    }
    return "";
  }

  /** Ảnh hộp đã cắt bỏ khoảng trống (box-trim.png) nếu có — để các hộp hiển thị to bằng nhau. */
  function trimmedBoxFor(series) {
    const box = series.box_image || "";
    if (/^data:/i.test(box) || !box.includes("/")) return box;
    const cand = `${box.slice(0, box.lastIndexOf("/") + 1)}box-trim.png`;
    return images.includes(cand) ? cand : box;
  }

  function serializeSeries(s, extra) {
    return {
      ...clone(s),
      has_local_video: Boolean(s.local_video),
      lineup_image: lineupImageFor(s),
      box_image_trim: trimmedBoxFor(s),
      ...(extra || {}),
    };
  }

  function figureWithSeries(f) {
    const s = findSeries(f.series_id) || {};
    return { ...clone(f), series_name: s.name, series_slug: s.slug };
  }

  function serializeOrder(o) {
    return {
      ...clone(o),
      status_label: ORDER_STATUSES[o.status] || o.status,
      payment_label: PAYMENT_METHODS[o.payment_method] || o.payment_method,
    };
  }

  function cartSummary() {
    const items = [...state.cart_items].sort(
      (a, b) => (b.added_at || "").localeCompare(a.added_at || "") || b.id - a.id
    );
    return {
      items: clone(items),
      total_quantity: items.reduce((n, i) => n + i.quantity, 0),
      total_amount: items.reduce((n, i) => n + i.unit_price * i.quantity, 0),
    };
  }

  /**
   * Bốc ngẫu nhiên 1 mẫu trong series. Mẫu Secret có tỷ lệ SECRET_RATE,
   * phần còn lại chia đều cho các mẫu thường. stockMap (nếu có) giới hạn chỉ
   * những mẫu còn hàng.
   */
  function drawFigure(seriesId, stockMap) {
    let pool = state.figures.filter((f) => f.series_id === seriesId);
    if (stockMap) pool = pool.filter((f) => (stockMap.get(f.id) || 0) > 0);
    if (!pool.length) return null;
    const secrets = pool.filter((f) => f.is_secret);
    const normals = pool.filter((f) => !f.is_secret);
    let group;
    if (!normals.length) group = secrets;
    else if (!secrets.length) group = normals;
    else group = Math.random() < SECRET_RATE ? secrets : normals;
    return group[Math.floor(Math.random() * group.length)];
  }

  // ---------- GET ----------
  function handleGet(path, query) {
    if (path === "/api/series") {
      return [...state.series]
        .sort((a, b) => a.id - b.id)
        .map((s) => {
          const figs = state.figures.filter((f) => f.series_id === s.id);
          return serializeSeries(s, {
            figure_count: figs.length,
            secret_count: figs.filter((f) => f.is_secret === 1).length,
            total_stock: figs.reduce((n, f) => n + (f.stock || 0), 0),
          });
        });
    }

    let m = path.match(/^\/api\/series\/(\d+)$/);
    if (m) {
      const s = findSeries(Number(m[1]));
      if (!s) throw new ApiError(404, "Không tìm thấy Series.");
      const figs = state.figures
        .filter((f) => f.series_id === s.id)
        .sort((a, b) => a.is_secret - b.is_secret || a.id - b.id);
      const data = serializeSeries(s);
      data.figures = clone(figs);
      data.figure_count = figs.length;
      data.total_stock = figs.reduce((n, f) => n + (f.stock || 0), 0);
      return data;
    }

    if (path === "/api/figures") {
      let list = state.figures.filter((f) => findSeries(f.series_id));
      const sid = query.get("series_id");
      if (sid && /^\d+$/.test(sid)) list = list.filter((f) => f.series_id === Number(sid));
      const secret = query.get("secret");
      if (secret === "1" || secret === "true") list = list.filter((f) => f.is_secret === 1);
      return list
        .sort((a, b) => a.series_id - b.series_id || b.is_secret - a.is_secret || a.id - b.id)
        .map(figureWithSeries);
    }

    if (path === "/api/draw") {
      const sid = toInt(query.get("series_id"));
      if (!findSeries(sid)) throw new ApiError(404, "Không tìm thấy Series.");
      const stockMap = new Map(state.figures.map((f) => [f.id, f.stock]));
      const fig = drawFigure(sid, stockMap) || drawFigure(sid);
      if (!fig) throw new ApiError(400, "Series này chưa có mẫu nào.");
      return figureWithSeries(fig);
    }

    if (path === "/api/cart") return cartSummary();

    if (path === "/api/orders") {
      return [...state.orders]
        .sort((a, b) => (b.created_at || "").localeCompare(a.created_at || "") || b.id - a.id)
        .map(serializeOrder);
    }

    if (path === "/api/collection") return [...state.collection];

    if (path === "/api/images") return [...images];

    if (path === "/api/meta") return { order_statuses: ORDER_STATUSES, payment_methods: PAYMENT_METHODS, secret_rate: SECRET_RATE };

    throw new ApiError(404, "Endpoint không tồn tại.");
  }

  // ---------- Series ----------
  function seriesPayload(body, existing = {}) {
    const name = String(body.name ?? existing.name ?? "").trim();
    const box_image = normalizeImage(body.box_image ?? existing.box_image);
    const full_set_price = toInt(body.full_set_price ?? existing.full_set_price);
    const blind_box_price = toInt(body.blind_box_price ?? existing.blind_box_price);
    if (!name || !box_image) throw new ApiError(400, "Vui lòng nhập tên series và ảnh hộp.");
    if ([full_set_price, blind_box_price].some((n) => Number.isNaN(n) || n < 0))
      throw new ApiError(400, "Giá Full Set và giá Blind Box phải là số hợp lệ.");
    const lineup = String(body.lineup_image ?? existing.lineup_image_custom ?? "").trim();
    return {
      name,
      box_image,
      full_set_price,
      blind_box_price,
      description: String(body.description ?? existing.description ?? "").trim(),
      youtube_embed_url: String(body.youtube_embed_url ?? existing.youtube_embed_url ?? "").trim(),
      local_video: String(body.local_video ?? existing.local_video ?? "").trim(),
      lineup_image_custom: lineup ? normalizeImage(lineup) : "",
    };
  }

  function createSeries(body) {
    const data = seriesPayload(body);
    let slug = slugify(data.name) || `series-${Date.now()}`;
    while (state.series.some((s) => s.slug === slug)) slug += "-2";
    const s = { id: nextId("series"), slug, ...data };
    state.series.push(s);
    return serializeSeries(s, { figure_count: 0, secret_count: 0, total_stock: 0 });
  }

  function updateSeries(id, body) {
    const s = findSeries(id);
    if (!s) throw new ApiError(404, "Không tìm thấy Series.");
    Object.assign(s, seriesPayload(body, s));
    return serializeSeries(s);
  }

  // ---------- Figures ----------
  function createFigure(body) {
    const name = String(body.name ?? "").trim();
    const image_path = normalizeImage(body.image_path);
    const series_id = toInt(body.series_id);
    const price = toInt(body.price);
    const stock = body.stock === undefined ? 10 : toInt(body.stock);
    if ([series_id, price, stock].some(Number.isNaN))
      throw new ApiError(400, "Thông số series_id, price hoặc stock không hợp lệ.");
    if (!name || !image_path || price < 0 || stock < 0)
      throw new ApiError(400, "Vui lòng nhập đầy đủ tên, ảnh, giá và tồn kho hợp lệ.");
    if (!findSeries(series_id)) throw new ApiError(400, "Series không tồn tại.");
    const fig = {
      id: nextId("figures"),
      series_id,
      name,
      image_path,
      price,
      stock,
      is_secret: isTrue(body.is_secret) ? 1 : 0,
    };
    state.figures.push(fig);
    return figureWithSeries(fig);
  }

  function updateFigure(id, body) {
    const f = findFigure(id);
    if (!f) throw new ApiError(404, "Không tìm thấy mô hình.");
    const name = String(body.name ?? f.name).trim();
    const image_path = normalizeImage(body.image_path ?? f.image_path);
    const series_id = toInt(body.series_id ?? f.series_id);
    const price = toInt(body.price ?? f.price);
    const stock = toInt(body.stock ?? f.stock);
    if ([series_id, price, stock].some(Number.isNaN))
      throw new ApiError(400, "Giá trị cập nhật không hợp lệ.");
    if (!name || price < 0 || stock < 0) throw new ApiError(400, "Tên, giá và tồn kho phải hợp lệ.");
    if (!findSeries(series_id)) throw new ApiError(400, "Series không tồn tại.");
    Object.assign(f, {
      series_id,
      name,
      image_path,
      price,
      stock,
      is_secret: isTrue(body.is_secret ?? f.is_secret) ? 1 : 0,
    });
    state.cart_items
      .filter((c) => c.item_type === "FIGURE" && c.item_id === id)
      .forEach((c) => Object.assign(c, { item_name: name, item_image: image_path, unit_price: price }));
    return figureWithSeries(f);
  }

  function deleteFigure(id) {
    if (!findFigure(id)) throw new ApiError(404, "Không tìm thấy mô hình.");
    state.cart_items = state.cart_items.filter(
      (c) => !(c.item_type === "FIGURE" && c.item_id === id) && c.revealed_figure_id !== id
    );
    state.figures = state.figures.filter((f) => f.id !== id);
    state.collection = state.collection.filter((x) => x !== id);
    return { deleted: true, id };
  }

  // ---------- Cart ----------
  function cartLineInfo(item_type, item_id, revealed_figure_id) {
    if (item_type === "FIGURE") {
      const f = findFigure(item_id);
      if (!f) throw new ApiError(404, "Không tìm thấy mô hình.");
      if (f.stock <= 0) throw new ApiError(400, "Mẫu mô hình này đã hết hàng.");
      return { item_name: f.name, item_image: f.image_path, unit_price: f.price };
    }
    const s = findSeries(item_id);
    if (!s) throw new ApiError(404, "Không tìm thấy Series.");
    const short = shortSeriesName(s.name);
    if (item_type === "FULL_SET") {
      return { item_name: `Full Set - ${short}`, item_image: s.box_image, unit_price: s.full_set_price };
    }
    // BLIND_BOX
    if (revealed_figure_id) {
      const f = findFigure(revealed_figure_id);
      if (!f || f.series_id !== s.id) throw new ApiError(400, "Mẫu đã mở không thuộc series này.");
      if (f.stock <= 0) throw new ApiError(400, `Mẫu "${f.name}" đã hết hàng, hãy mở hộp khác nhé.`);
      return {
        item_name: `Blind Box ${short} — đã mở: ${f.name}`,
        item_image: f.image_path,
        unit_price: s.blind_box_price,
      };
    }
    return { item_name: `Blind Box ${short} (ngẫu nhiên)`, item_image: s.box_image, unit_price: s.blind_box_price };
  }

  /**
   * Kiểm tra (và tùy chọn thực hiện) việc lấy hàng cho toàn bộ giỏ trên một bản
   * sao tồn kho. Trả về chi tiết từng dòng: những mẫu nào được trừ kho.
   */
  function allocateCart(cartItems) {
    const stockMap = new Map(state.figures.map((f) => [f.id, f.stock]));
    const take = (fig, qty, label) => {
      const have = stockMap.get(fig.id) || 0;
      if (have < qty) throw new ApiError(400, `${label}: mẫu "${fig.name}" không đủ tồn kho (còn ${have}).`);
      stockMap.set(fig.id, have - qty);
    };
    const lines = cartItems.map((item) => {
      const picked = [];
      if (item.item_type === "FIGURE") {
        const f = findFigure(item.item_id);
        if (!f) throw new ApiError(400, `Mẫu "${item.item_name}" không còn tồn tại.`);
        take(f, item.quantity, item.item_name);
        picked.push({ figure_id: f.id, qty: item.quantity });
      } else if (item.item_type === "FULL_SET") {
        const figs = state.figures.filter((f) => f.series_id === item.item_id && !f.is_secret);
        if (!figs.length) throw new ApiError(400, `${item.item_name}: series chưa có mẫu nào.`);
        figs.forEach((f) => {
          take(f, item.quantity, item.item_name);
          picked.push({ figure_id: f.id, qty: item.quantity });
        });
      } else if (item.revealed_figure_id) {
        const f = findFigure(item.revealed_figure_id);
        if (!f) throw new ApiError(400, `${item.item_name}: mẫu không còn tồn tại.`);
        take(f, item.quantity, item.item_name);
        picked.push({ figure_id: f.id, qty: item.quantity });
      } else {
        for (let i = 0; i < item.quantity; i++) {
          const f = drawFigure(item.item_id, stockMap);
          if (!f) throw new ApiError(400, `${item.item_name}: series đã hết hàng.`);
          take(f, 1, item.item_name);
          const prev = picked.find((p) => p.figure_id === f.id);
          if (prev) prev.qty += 1;
          else picked.push({ figure_id: f.id, qty: 1 });
        }
      }
      return { item, picked };
    });
    return { lines, stockMap };
  }

  function addToCart(body) {
    const item_type = String(body.item_type ?? "").trim().toUpperCase();
    const item_id = toInt(body.item_id);
    const quantity = body.quantity === undefined ? 1 : toInt(body.quantity);
    const revealed_figure_id =
      item_type === "BLIND_BOX" && body.revealed_figure_id ? toInt(body.revealed_figure_id) : null;
    if (Number.isNaN(item_id) || Number.isNaN(quantity))
      throw new ApiError(400, "item_id hoặc quantity không hợp lệ.");
    if (!["FIGURE", "FULL_SET", "BLIND_BOX"].includes(item_type) || quantity <= 0)
      throw new ApiError(400, "Loại sản phẩm hoặc số lượng không hợp lệ.");

    const info = cartLineInfo(item_type, item_id, revealed_figure_id);
    const existing = state.cart_items.find(
      (c) => c.item_type === item_type && c.item_id === item_id && (c.revealed_figure_id || null) === revealed_figure_id
    );
    const trial = existing
      ? state.cart_items.map((c) => (c === existing ? { ...c, quantity: c.quantity + quantity } : c))
      : [...state.cart_items, { item_type, item_id, revealed_figure_id, item_name: info.item_name, quantity }];
    allocateCart(trial); // ném lỗi nếu không đủ hàng

    if (existing) existing.quantity += quantity;
    else
      state.cart_items.push({
        id: nextId("cart_items"),
        item_type,
        item_id,
        revealed_figure_id,
        ...info,
        quantity,
        added_at: nowStamp(),
      });
    return cartSummary();
  }

  function updateCartItem(id, body) {
    const quantity = toInt(body.quantity);
    if (Number.isNaN(quantity)) throw new ApiError(400, "Số lượng không hợp lệ.");
    const item = state.cart_items.find((c) => c.id === id);
    if (!item) throw new ApiError(404, "Sản phẩm không có trong giỏ hàng.");
    if (quantity <= 0) {
      state.cart_items = state.cart_items.filter((c) => c.id !== id);
    } else {
      allocateCart(state.cart_items.map((c) => (c.id === id ? { ...c, quantity } : c)));
      item.quantity = quantity;
    }
    return cartSummary();
  }

  function deleteCartItem(id) {
    state.cart_items = state.cart_items.filter((c) => c.id !== id);
    return cartSummary();
  }

  // ---------- Orders ----------
  function createOrder(body) {
    const customer_name = String(body.customer_name ?? "").trim();
    const customer_phone = String(body.customer_phone ?? "").trim();
    const customer_address = String(body.customer_address ?? "").trim();
    const payment_method = String(body.payment_method ?? "COD").toUpperCase();
    if (!customer_name || !customer_phone || !customer_address)
      throw new ApiError(400, "Vui lòng điền đầy đủ họ tên, số điện thoại và địa chỉ giao hàng.");
    if (!PAYMENT_METHODS[payment_method]) throw new ApiError(400, "Phương thức thanh toán không hợp lệ.");
    const card_last4 = payment_method === "CARD" ? String(body.card_last4 ?? "").replace(/\D/g, "").slice(-4) : "";
    if (payment_method === "CARD" && card_last4.length !== 4)
      throw new ApiError(400, "Thông tin thẻ không hợp lệ.");
    if (!state.cart_items.length) throw new ApiError(400, "Giỏ hàng đang trống.");

    const { lines, stockMap } = allocateCart(state.cart_items);

    // Ghi nhận: trừ kho theo đúng kết quả đã kiểm tra.
    state.figures.forEach((f) => (f.stock = stockMap.get(f.id)));

    const items = lines.map(({ item, picked }) => ({
      item_type: item.item_type,
      item_id: item.item_id,
      name: item.item_name,
      image: item.item_image,
      unit_price: item.unit_price,
      quantity: item.quantity,
      picked: picked.map((p) => {
        const f = findFigure(p.figure_id);
        return { figure_id: p.figure_id, qty: p.qty, name: f.name, image: f.image_path, is_secret: f.is_secret };
      }),
    }));
    const total_amount = items.reduce((n, i) => n + i.unit_price * i.quantity, 0);
    const created_at = nowStamp();
    const id = nextId("orders");
    const order = {
      id,
      code: `HP${String(id).padStart(5, "0")}`,
      customer_name,
      customer_phone,
      customer_address,
      note: String(body.note ?? "").trim(),
      items,
      total_amount,
      payment_method,
      payment_status: payment_method === "CARD" ? "PAID" : "UNPAID",
      card_last4,
      status: "PENDING",
      status_history: [{ status: "PENDING", at: created_at }],
      created_at,
      updated_at: created_at,
    };
    state.orders.push(order);
    state.cart_items = [];
    return { order: serializeOrder(order), cart: cartSummary() };
  }

  const STATUS_FLOW = ["PENDING", "CONFIRMED", "SHIPPING", "DELIVERED"];

  function updateOrder(id, body) {
    const o = state.orders.find((x) => x.id === id);
    if (!o) throw new ApiError(404, "Không tìm thấy đơn hàng.");
    const status = String(body.status ?? "").toUpperCase();
    if (!ORDER_STATUSES[status]) throw new ApiError(400, "Trạng thái đơn hàng không hợp lệ.");
    if (status === o.status) return serializeOrder(o);
    if (o.status === "CANCELLED" || o.status === "DELIVERED")
      throw new ApiError(400, `Đơn đã ở trạng thái "${ORDER_STATUSES[o.status]}", không thể đổi nữa.`);
    if (status === "CANCELLED") {
      if (o.status === "SHIPPING") throw new ApiError(400, "Đơn đang vận chuyển, không thể hủy.");
      // Hoàn lại tồn kho
      o.items.forEach((it) =>
        (it.picked || []).forEach((p) => {
          const f = findFigure(p.figure_id);
          if (f) f.stock += p.qty;
        })
      );
    } else if (STATUS_FLOW.indexOf(status) < STATUS_FLOW.indexOf(o.status)) {
      throw new ApiError(400, "Không thể lùi trạng thái đơn hàng.");
    }
    o.status = status;
    o.updated_at = nowStamp();
    o.status_history.push({ status, at: o.updated_at });
    // Chuyển khoản QR được xác nhận khi nhân viên duyệt đơn; COD thu tiền khi giao xong.
    if (o.payment_method === "QR" && status === "CONFIRMED") o.payment_status = "PAID";
    if (status === "DELIVERED") o.payment_status = "PAID";
    return serializeOrder(o);
  }

  // ---------- Collection ----------
  function setCollection(figureId, body) {
    if (!findFigure(figureId)) throw new ApiError(404, "Không tìm thấy mô hình.");
    const owned = body.owned === undefined ? !state.collection.includes(figureId) : isTrue(body.owned);
    state.collection = state.collection.filter((x) => x !== figureId);
    if (owned) state.collection.push(figureId);
    return { figure_id: figureId, owned, collection: [...state.collection] };
  }

  // ---------- Router ----------
  async function request(url, options = {}) {
    await ready();
    const method = String(options.method || "GET").toUpperCase();
    const u = new URL(url, "http://local");
    const path = decodeURIComponent(u.pathname);
    let body = {};
    if (options.body) {
      try {
        body = typeof options.body === "string" ? JSON.parse(options.body) : options.body;
      } catch (e) {
        throw new ApiError(400, "Dữ liệu JSON không hợp lệ.");
      }
    }

    if (method === "GET") return handleGet(path, u.searchParams);

    const idOf = (re) => {
      const m = path.match(re);
      return m ? Number(m[1]) : null;
    };
    const figId = idOf(/^\/api\/figures\/(\d+)$/);
    const cartId = idOf(/^\/api\/cart\/(\d+)$/);
    const seriesId = idOf(/^\/api\/series\/(\d+)$/);
    const orderId = idOf(/^\/api\/orders\/(\d+)$/);
    const collId = idOf(/^\/api\/collection\/(\d+)$/);

    const snapshot = JSON.stringify(state);
    let result;
    try {
      if (method === "POST") {
        if (path === "/api/figures") result = createFigure(body);
        else if (path === "/api/series") result = createSeries(body);
        else if (path === "/api/cart") result = addToCart(body);
        else if (path === "/api/orders") result = createOrder(body);
      } else if (method === "PUT") {
        if (figId) result = updateFigure(figId, body);
        else if (cartId) result = updateCartItem(cartId, body);
        else if (seriesId) result = updateSeries(seriesId, body);
        else if (orderId) result = updateOrder(orderId, body);
        else if (collId) result = setCollection(collId, body);
      } else if (method === "DELETE") {
        if (figId) result = deleteFigure(figId);
        else if (cartId) result = deleteCartItem(cartId);
      }
      if (result === undefined) throw new ApiError(404, "Endpoint không tồn tại.");
      save();
      return result;
    } catch (err) {
      state = JSON.parse(snapshot); // hoàn tác nếu có lỗi giữa chừng
      throw err;
    }
  }

  /** Xóa mọi thay đổi trong trình duyệt và nạp lại dữ liệu gốc từ CSV. */
  async function resetData() {
    localStorage.removeItem(STORAGE_KEY);
    readyPromise = null;
    state = null;
    await ready();
  }

  /** Đọc lại dữ liệu từ localStorage (khi tab khác — ví dụ trang nhân viên — vừa thay đổi). */
  async function reload() {
    readyPromise = null;
    state = null;
    await ready();
  }

  window.HacipupuStore = { request, ready, reload, resetData, ORDER_STATUSES, PAYMENT_METHODS, SECRET_RATE };
})();
