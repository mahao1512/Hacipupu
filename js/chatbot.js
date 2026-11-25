/*
 * Trợ lý HACIPUPU — chat box trả lời câu hỏi về sản phẩm của trang.
 *
 * Chạy hoàn toàn trên trình duyệt, KHÔNG gọi dịch vụ AI bên ngoài. Mọi câu trả
 * lời được dựng từ dữ liệu thật của trang (series, mẫu figure, giá, tồn kho,
 * đơn hàng của khách) qua HacipupuStore, nên không bao giờ bịa ra thông tin:
 *  - Hỏi đúng chủ đề và trang có dữ liệu → trả lời từ dữ liệu.
 *  - Hỏi đúng chủ đề nhưng trang không có thông tin → nói rõ là không có.
 *  - Hỏi ngoài lề (thời tiết, bài tập, chuyện khác...) → từ chối lịch sự.
 */
(() => {
  const App = window.HacipupuApp;
  const { apiFetch, formatVND, escapeHtml, encodeAssetUrl, shortSeriesName, isStaff } = App;

  // Những thông tin cố định đang hiển thị trên trang (detail.html, footer, store.js).
  const SITE_FACTS = {
    size: "khoảng 7 – 9 cm",
    material: "PVC / ABS cao cấp",
    store: "Hobiverse",
  };

  // ---------- Chuẩn hóa tiếng Việt (bỏ dấu) để hiểu cả câu gõ không dấu ----------
  function norm(text) {
    return String(text || "")
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "")
      .replace(/đ/gi, "d")
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, " ")
      .replace(/\s+/g, " ")
      .trim();
  }
  const pad = (s) => ` ${s} `;
  const hasAny = (q, phrases) => phrases.some((p) => q.includes(pad(p)));

  // ---------- Từ khóa ý định ----------
  const KW = {
    greet: ["xin chao", "chao", "hello", "hi", "alo", "chao ban", "hey"],
    thanks: ["cam on", "thanks", "thank you", "cam on ban", "ok cam on"],
    help: ["ban la ai", "ban lam duoc gi", "giup gi", "huong dan", "help", "tro giup", "hoi gi"],
    price: ["gia", "bao nhieu tien", "may tien", "nhieu tien", "gia bao nhieu", "chi phi", "het bao nhieu", "tra bao nhieu"],
    cheap: ["re nhat", "gia thap nhat", "re hon", "thap nhat"],
    expensive: ["dat nhat", "mac nhat", "gia cao nhat", "cao nhat"],
    stock: ["con hang", "het hang", "ton kho", "con khong", "con bao nhieu", "so luong", "con may", "con lai", "kho"],
    outOfStock: ["het hang", "het roi", "chay hang"],
    secret: ["secret", "hiem", "bi mat", "mau an", "nhan vat an"],
    rate: ["ty le", "xac suat", "kha nang", "trung"],
    figures: ["mau", "nhan vat", "figure", "figures", "gom", "gom nhung", "co nhung", "danh sach", "liet ke", "co gi", "nhung mau"],
    seriesWord: ["series"],
    allSeries: ["nhung series", "cac series", "series nao", "bao nhieu series", "co series", "tat ca series", "dong nao", "bo suu tap nao", "ban gi", "co ban gi", "san pham gi", "nhung san pham", "san pham nao"],
    fullset: ["full set", "fullset", "tron bo", "ca bo", "nguyen bo", "nguyen hop lon", "mua ca bo", "nguyen set"],
    blindbox: ["blind box", "blindbox", "hop mu", "mo hop", "ngau nhien", "1 hop", "mot hop", "moi hop", "gia hop", "hop nao"],
    howBuy: ["cach mua", "mua nhu the nao", "mua the nao", "dat hang", "dat mua", "lam sao mua", "mua o dau", "mua sao", "order"],
    payment: ["thanh toan", "tra tien", "the ngan hang", "bang the", "quet the", "the tin dung", "visa", "qr", "ma qr", "chuyen khoan", "cod", "tien mat", "khi nhan hang"],
    myOrders: ["don hang", "don cua toi", "don hang cua toi", "trang thai", "van chuyen", "giao den dau", "giao chua", "da giao", "theo doi don", "kiem tra don", "don"],
    cancel: ["huy don", "huy dat", "huy"],
    video: ["video", "clip", "xem mo hop"],
    collection: ["bo suu tap cua toi", "danh dau", "da co", "suu tam", "bong den"],
    size: ["kich thuoc", "bao lon", "cao bao nhieu", "to khong", "lon khong", "cm", "chieu cao"],
    material: ["chat lieu", "lam bang gi", "bang nhua", "nhua gi", "pvc", "abs"],
    store: ["dia chi", "o dau", "cua hang", "shop o dau", "ban do", "chi nhanh"],
    count: ["bao nhieu mau", "may mau", "tong so", "bao nhieu nhan vat", "may nhan vat", "co bao nhieu"],
    staff: ["dang nhap", "nhan vien", "admin", "quan ly"],
  };

  // Hỏi đúng chủ đề cửa hàng nhưng trang KHÔNG có thông tin → trả lời "không có".
  const NOT_ON_SITE = [
    { kw: ["phi ship", "phi van chuyen", "phi giao hang", "tien ship", "freeship", "mien phi ship", "ship bao nhieu"], topic: "phí vận chuyển" },
    { kw: ["bao lau", "may ngay", "khi nao nhan", "thoi gian giao", "bao gio den", "giao trong"], topic: "thời gian giao hàng dự kiến" },
    { kw: ["doi tra", "tra hang", "hoan tien", "bao hanh", "doi hang", "loi thi sao"], topic: "chính sách đổi trả / bảo hành" },
    { kw: ["khuyen mai", "giam gia", "voucher", "ma giam", "sale", "uu dai", "coupon"], topic: "chương trình khuyến mãi / mã giảm giá" },
    { kw: ["so dien thoai", "hotline", "sdt shop", "email", "lien he", "zalo", "facebook", "fanpage", "instagram"], topic: "số điện thoại / kênh liên hệ của shop" },
    { kw: ["gio mo cua", "mo cua", "dong cua", "may gio"], topic: "giờ mở cửa" },
    { kw: ["tra gop", "installment"], topic: "trả góp" },
    { kw: ["hang that", "chinh hang khong", "fake", "hang gia", "real khong"], topic: "giấy tờ chứng nhận chính hãng" },
    { kw: ["ship quoc te", "nuoc ngoai", "gui di"], topic: "giao hàng quốc tế" },
  ];

  // ---------- Dữ liệu ----------
  let data = null;

  async function loadData() {
    const [series, figures, orders] = await Promise.all([
      apiFetch("/api/series"),
      apiFetch("/api/figures"),
      apiFetch("/api/orders"),
    ]);
    const mine = new Set(App.getMyOrderIds ? App.getMyOrderIds() : []);
    const seriesAliases = series.map((s) => {
      const shortN = norm(shortSeriesName(s.name));
      const fullN = norm(s.name);
      const stop = new Set(["series", "figures", "with", "you", "my", "the", "of", "in", "one", "day", "little", "world"]);
      const words = shortN.split(" ").filter((w) => w.length >= 4 && !stop.has(w));
      return { s, phrases: [...new Set([fullN, shortN, ...words, ...(shortN.includes("shinchan") ? ["shin", "shin cau be but chi"] : [])])] };
    });
    const seriesShort = new Set(seriesAliases.flatMap((a) => [norm(shortSeriesName(a.s.name))]));
    const figureNames = figures.map((f) => {
      const full = norm(f.name);
      const base = norm(f.name.replace(/\(.*?\)/g, ""));
      const variants = [full];
      if (base && base !== full && !seriesShort.has(base)) variants.push(base);
      return { f, variants };
    });
    data = {
      series,
      figures,
      myOrders: orders.filter((o) => mine.has(o.id)),
      seriesAliases,
      figureNames,
    };
    return data;
  }

  function findSeries(q) {
    let best = null;
    for (const a of data.seriesAliases) {
      for (const p of a.phrases) {
        if (q.includes(pad(p)) && (!best || p.length > best.len)) best = { s: a.s, len: p.length };
      }
    }
    return best ? best.s : null;
  }

  function findFigures(q) {
    let bestLen = 0;
    let hits = [];
    for (const { f, variants } of data.figureNames) {
      for (const v of variants) {
        if (!q.includes(pad(v))) continue;
        if (v.length > bestLen) {
          bestLen = v.length;
          hits = [f];
        } else if (v.length === bestLen && !hits.includes(f)) hits.push(f);
      }
    }
    return hits;
  }

  // ---------- Dựng câu trả lời ----------
  const seriesLink = (s, label) =>
    `<a class="chat-link" href="detail.html?id=${s.id}">${escapeHtml(label || shortSeriesName(s.name))}</a>`;
  const stockText = (n) => (Number(n) > 0 ? `còn <b>${n}</b>` : `<b class="text-rose-600">hết hàng</b>`);
  const seriesOf = (f) => data.series.find((s) => s.id === f.series_id);
  const figsOf = (s) => data.figures.filter((f) => f.series_id === s.id);

  function figureCard(f) {
    const s = seriesOf(f);
    return `<div class="chat-card">
      <img src="${encodeAssetUrl(f.image_path)}" alt="" onerror="window.HacipupuApp.handleImgError(this)" />
      <div>
        <div class="font-bold">${escapeHtml(f.name)}${Number(f.is_secret) ? ` <span class="chat-secret">SECRET</span>` : ""}</div>
        <div>Series: ${s ? seriesLink(s) : "—"}</div>
        <div>Giá mua lẻ: <b>${formatVND(f.price)}</b> · ${stockText(f.stock)}</div>
      </div>
    </div>`;
  }

  function seriesSummary(s) {
    const figs = figsOf(s);
    const secrets = figs.filter((f) => Number(f.is_secret));
    const normals = figs.length - secrets.length;
    return `<b>${escapeHtml(shortSeriesName(s.name))}</b> có <b>${figs.length}</b> mẫu (${normals} mẫu thường${
      secrets.length ? `, ${secrets.length} Secret` : ""
    }).<br/>
      • 1 Blind Box: <b>${formatVND(s.blind_box_price)}</b><br/>
      • Full Set (${normals} mẫu thường, không gồm Secret): <b>${formatVND(s.full_set_price)}</b><br/>
      • Tổng tồn kho: <b>${figs.reduce((n, f) => n + Number(f.stock || 0), 0)}</b> sản phẩm<br/>
      ${seriesLink(s, "Xem chi tiết series →")}`;
  }

  const offTopic = () =>
    `Xin lỗi, mình chỉ trả lời các câu hỏi về <b>sản phẩm và việc mua hàng trên HACIPUPU Toy Box</b> (series, mẫu nhân vật, giá, tồn kho, blind box, thanh toán, đơn hàng). Câu hỏi này nằm ngoài phạm vi nên mình không trả lời được nhé.`;

  const notFoundProduct = () =>
    `Trang <b>không có</b> sản phẩm hay series nào như bạn hỏi.<br/>Các series hiện có: ${data.series
      .map((s) => seriesLink(s))
      .join(", ")}.`;

  function answer(raw) {
    const q = pad(norm(raw));
    if (!q.trim()) return "Bạn hãy nhập câu hỏi về sản phẩm nhé!";

    const series = findSeries(q);
    const figs = findFigures(q);
    const is = (k) => hasAny(q, KW[k]);
    const orderCode = q.match(/ hp\s?0*(\d{1,6}) /);

    // 1) Đúng chủ đề nhưng trang không có thông tin
    for (const item of NOT_ON_SITE) {
      if (hasAny(q, item.kw)) {
        return `Hiện trang <b>không có</b> thông tin về ${item.topic}, nên mình không trả lời được để tránh nói sai. Bạn có thể ghé ${SITE_FACTS.store} (bản đồ ở cuối trang) để hỏi trực tiếp nhé.`;
      }
    }

    // 2) Đơn hàng của khách
    if (orderCode || (is("myOrders") && !series && !figs.length)) {
      if (isStaff()) return `Bạn đang ở chế độ nhân viên — xem toàn bộ đơn ở trang <a class="chat-link" href="admin.html#don-hang">Đơn hàng</a>.`;
      const list = data.myOrders;
      if (orderCode) {
        const id = Number(orderCode[1]);
        const o = list.find((x) => x.id === id);
        if (!o) return `Trình duyệt này <b>không có</b> đơn <b>HP${String(id).padStart(5, "0")}</b> của bạn.`;
        return orderLine(o) + `<br/><a class="chat-link" href="orders.html">Xem chi tiết →</a>`;
      }
      if (is("cancel")) {
        return `Bạn chỉ hủy được đơn khi đơn còn <b>Chờ xác nhận</b>: vào <a class="chat-link" href="orders.html">Đơn hàng của tôi</a> và bấm “Hủy đơn” (bấm 2 lần để xác nhận).`;
      }
      if (!list.length) return `Bạn <b>chưa có</b> đơn hàng nào trên trình duyệt này.`;
      return `Bạn có <b>${list.length}</b> đơn hàng:<br/>${list
        .slice(0, 5)
        .map(orderLine)
        .join("<br/>")}${list.length > 5 ? "<br/>…" : ""}<br/><a class="chat-link" href="orders.html">Xem tất cả →</a>`;
    }

    // 3) Câu hỏi về một mẫu cụ thể
    if (figs.length) {
      const intro = is("stock") && !is("price") ? "Tình trạng tồn kho:" : "Thông tin mẫu:";
      return `${intro}${figs.map(figureCard).join("")}`;
    }

    // 4) Câu hỏi về một series cụ thể
    if (series) {
      const list = figsOf(series);
      if (is("secret") || is("rate")) {
        const sec = list.filter((f) => Number(f.is_secret));
        if (!sec.length) return `Series ${seriesLink(series)} <b>không có</b> mẫu Secret.`;
        return `Mẫu Secret của ${seriesLink(series)} (tỷ lệ trúng khi mở 1 blind box là <b>1/144</b>):${sec.map(figureCard).join("")}`;
      }
      if (is("outOfStock")) {
        const out = list.filter((f) => Number(f.stock) <= 0);
        return out.length
          ? `Các mẫu đã hết hàng của ${seriesLink(series)}: ${out.map((f) => escapeHtml(f.name)).join(", ")}.`
          : `Series ${seriesLink(series)} hiện <b>không có</b> mẫu nào hết hàng.`;
      }
      if (is("fullset")) {
        const normals = list.filter((f) => !Number(f.is_secret));
        return `Full Set ${seriesLink(series)} giá <b>${formatVND(series.full_set_price)}</b>, gồm đủ <b>${normals.length}</b> mẫu thường (không gồm mẫu Secret).`;
      }
      if (is("blindbox") && !is("figures")) {
        return `1 Blind Box ${seriesLink(series)} giá <b>${formatVND(series.blind_box_price)}</b>. Mỗi hộp chứa ngẫu nhiên 1 trong ${list.length} mẫu của series, tỷ lệ ra Secret 1/144.`;
      }
      if (is("figures") || is("count")) {
        return `${seriesLink(series)} có <b>${list.length}</b> mẫu:<br/>${list
          .map((f) => `• ${escapeHtml(f.name)}${Number(f.is_secret) ? " 👑" : ""} — ${formatVND(f.price)} (${Number(f.stock) > 0 ? `còn ${f.stock}` : "hết hàng"})`)
          .join("<br/>")}`;
      }
      if (is("video")) {
        return series.has_local_video || series.youtube_embed_url
          ? `Series ${seriesLink(series)} có video giới thiệu ${series.has_local_video ? "(video mở hộp)" : "(YouTube)"} — xem ở trang chi tiết series.`
          : `Series ${seriesLink(series)} <b>không có</b> video.`;
      }
      return seriesSummary(series);
    }

    // 5) Câu hỏi chung (không nêu series/mẫu)
    if (is("greet") && q.trim().split(" ").length <= 4) return greeting();
    if (is("thanks")) return "Không có chi! Bạn cần hỏi thêm gì về sản phẩm cứ nhắn mình nhé 💖";
    if (is("help")) return greeting();
    if (is("rate") || (is("secret") && !is("figures"))) {
      const sec = data.figures.filter((f) => Number(f.is_secret));
      return `Mỗi blind box có tỷ lệ ra mẫu Secret là <b>1/144</b>. Trang có <b>${sec.length}</b> mẫu Secret:<br/>${sec
        .map((f) => `• ${escapeHtml(f.name)} — ${seriesLink(seriesOf(f))} — ${formatVND(f.price)} (${Number(f.stock) > 0 ? `còn ${f.stock}` : "hết hàng"})`)
        .join("<br/>")}`;
    }
    if (is("secret")) {
      const sec = data.figures.filter((f) => Number(f.is_secret));
      return `Các mẫu Secret trên trang:<br/>${sec.map((f) => `• ${escapeHtml(f.name)} (${seriesLink(seriesOf(f))})`).join("<br/>")}`;
    }
    if (is("cheap")) {
      const box = [...data.series].sort((a, b) => a.blind_box_price - b.blind_box_price)[0];
      const fig = [...data.figures].filter((f) => f.stock > 0).sort((a, b) => a.price - b.price)[0];
      return `• Blind box rẻ nhất: ${seriesLink(box)} — <b>${formatVND(box.blind_box_price)}</b>/hộp.<br/>${
        fig ? `• Mẫu lẻ rẻ nhất còn hàng: <b>${escapeHtml(fig.name)}</b> (${seriesLink(seriesOf(fig))}) — <b>${formatVND(fig.price)}</b>.` : ""
      }`;
    }
    if (is("expensive")) {
      const set = [...data.series].sort((a, b) => b.full_set_price - a.full_set_price)[0];
      const fig = [...data.figures].sort((a, b) => b.price - a.price)[0];
      return `• Full Set đắt nhất: ${seriesLink(set)} — <b>${formatVND(set.full_set_price)}</b>.<br/>• Mẫu lẻ đắt nhất: <b>${escapeHtml(
        fig.name
      )}</b> (${seriesLink(seriesOf(fig))}) — <b>${formatVND(fig.price)}</b>.`;
    }
    if (is("outOfStock")) {
      const out = data.figures.filter((f) => Number(f.stock) <= 0);
      return out.length
        ? `Các mẫu đang hết hàng: ${out.map((f) => `${escapeHtml(f.name)} (${seriesLink(seriesOf(f))})`).join(", ")}.`
        : "Hiện <b>không có</b> mẫu nào hết hàng — tất cả đều còn hàng.";
    }
    if (is("payment")) {
      return `Trang hỗ trợ <b>3 cách thanh toán</b> khi đặt hàng trong giỏ:<br/>
        • 💵 Thanh toán khi nhận hàng (COD)<br/>
        • 💳 Thẻ ngân hàng — chỉ lưu 4 số cuối của thẻ<br/>
        • 📱 Quét mã QR chuyển khoản — nhân viên xác nhận sau khi đối soát`;
    }
    if (is("howBuy")) {
      return `Cách mua: chọn <b>Blind Box</b> (1 hộp ngẫu nhiên) hoặc <b>Full Set</b> ở trang chi tiết series, hoặc bấm vào hộp ở banner trang chủ để mở thử → thêm vào <b>Giỏ hàng</b> → điền thông tin nhận hàng → chọn cách thanh toán → <b>Xác nhận đặt hàng</b>. Theo dõi đơn ở <a class="chat-link" href="orders.html">Đơn hàng của tôi</a>.`;
    }
    if (is("fullset")) {
      return `Giá Full Set (đủ các mẫu thường, không gồm Secret):<br/>${data.series
        .map((s) => `• ${seriesLink(s)} — <b>${formatVND(s.full_set_price)}</b>`)
        .join("<br/>")}`;
    }
    if (is("blindbox") || (is("price") && !is("figures"))) {
      return `Giá 1 Blind Box của từng series:<br/>${data.series
        .map((s) => `• ${seriesLink(s)} — <b>${formatVND(s.blind_box_price)}</b>`)
        .join("<br/>")}<br/>Mỗi hộp chứa ngẫu nhiên 1 nhân vật của series đó, tỷ lệ Secret 1/144.`;
    }
    if (is("size")) return `Mỗi figure có kích thước <b>${SITE_FACTS.size}</b>.`;
    if (is("material")) return `Figure làm bằng chất liệu <b>${SITE_FACTS.material}</b>.`;
    if (is("store")) return `Cửa hàng: <b>${SITE_FACTS.store}</b> — xem bản đồ Google Maps ở cuối mỗi trang.`;
    if (is("collection")) {
      return `Ở trang <a class="chat-link" href="collection.html">Bộ sưu tập của tôi</a>, bạn bấm vào nhân vật để đánh dấu “Đã có”. Mẫu đã có hiện đầy đủ hình, mẫu chưa có chỉ là bóng đen mờ.`;
    }
    if (is("staff")) return `Nhân viên đăng nhập bằng nút hình tròn ở góc phải trên cùng → “Đăng nhập nhân viên”.`;
    if (is("video")) {
      return `Mỗi series có video giới thiệu ở trang chi tiết: ${data.series.map((s) => seriesLink(s)).join(", ")}.`;
    }
    if (is("allSeries") || is("count") || (is("seriesWord") && is("figures"))) {
      return `Trang có <b>${data.series.length}</b> series, tổng <b>${data.figures.length}</b> mẫu:<br/>${data.series
        .map((s) => `• ${seriesLink(s)} — ${figsOf(s).length} mẫu, ${formatVND(s.blind_box_price)}/hộp`)
        .join("<br/>")}`;
    }

    // 6) Có dáng hỏi về sản phẩm nhưng không khớp tên nào trên trang → không có
    const PRODUCT_WORDS = ["mau", "nhan vat", "figure", "series", "blind box", "blindbox", "san pham", "do choi", "hop mu", "co ban", "ban khong", "co hang", "mo hinh", "labubu", "molly", "skullpanda", "crybaby", "dimoo", "pucky", "hirono", "pop mart", "popmart"];
    if (hasAny(q, PRODUCT_WORDS)) {
      return notFoundProduct();
    }

    // 7) Ngoài lề
    return offTopic();
  }

  function orderLine(o) {
    return `• <b>${escapeHtml(o.code)}</b> — ${escapeHtml(o.status_label)} — ${formatVND(o.total_amount)}`;
  }

  function greeting() {
    return `Xin chào! Mình là <b>Trợ lý HACIPUPU</b> 🪄. Mình trả lời các câu hỏi về sản phẩm trên trang: series, mẫu nhân vật, giá, tồn kho, mẫu Secret, blind box / full set, thanh toán và đơn hàng của bạn. Mình chỉ dùng thông tin có trên trang — không có thì mình sẽ nói là không có.`;
  }

  // ---------- Giao diện ----------
  const SUGGESTIONS = [
    "Có những series nào?",
    "Giá blind box My Little Hero?",
    "Các mẫu Secret",
    "Mẫu nào rẻ nhất?",
    "Thanh toán thế nào?",
    "Đơn hàng của tôi",
  ];

  function mount() {
    const wrap = document.createElement("div");
    wrap.innerHTML = `
      <button type="button" id="chat-fab" class="chat-fab" aria-label="Mở Trợ lý HACIPUPU" aria-expanded="false" aria-controls="chat-panel">
        <i class="chat-fab-icon" aria-hidden="true">
          <svg viewBox="0 0 576 512" width="24" height="24" fill="currentColor"><path d="M234.7 42.7L197 56.8c-3 1.1-5 4-5 7.2s2 6.1 5 7.2l37.7 14.1L248.8 123c1.1 3 4 5 7.2 5s6.1-2 7.2-5l14.1-37.7L315 71.2c3-1.1 5-4 5-7.2s-2-6.1-5-7.2L277.3 42.7 263.2 5c-1.1-3-4-5-7.2-5s-6.1 2-7.2 5L234.7 42.7zM46.1 395.4c-18.7 18.7-18.7 49.1 0 67.9l34.6 34.6c18.7 18.7 49.1 18.7 67.9 0L529.9 116.5c18.7-18.7 18.7-49.1 0-67.9L495.3 14.1c-18.7-18.7-49.1-18.7-67.9 0L46.1 395.4zM484.6 82.6l-105 105-23.3-23.3 105-105 23.3 23.3zM7.5 117.2C3 118.9 0 123.2 0 128s3 9.1 7.5 10.8L64 160l21.2 56.5c1.7 4.5 6 7.5 10.8 7.5s9.1-3 10.8-7.5L128 160l56.5-21.2c4.5-1.7 7.5-6 7.5-10.8s-3-9.1-7.5-10.8L128 96 106.8 39.5C105.1 35 100.8 32 96 32s-9.1 3-10.8 7.5L64 96 7.5 117.2zm352 256c-4.5 1.7-7.5 6-7.5 10.8s3 9.1 7.5 10.8L416 416l21.2 56.5c1.7 4.5 6 7.5 10.8 7.5s9.1-3 10.8-7.5L480 416l56.5-21.2c4.5-1.7 7.5-6 7.5-10.8s-3-9.1-7.5-10.8L480 352l-21.2-56.5c-1.7-4.5-6-7.5-10.8-7.5s-9.1 3-10.8 7.5L416 352l-56.5 21.2z"/></svg>
        </i>
        <span class="chat-fab-text">Hỏi trợ lý</span>
      </button>

      <section id="chat-panel" class="chat-panel" role="dialog" aria-label="Trợ lý HACIPUPU" aria-hidden="true">
        <header class="chat-head">
          <div>
            <div class="chat-title">🪄 Trợ lý HACIPUPU</div>
            <div class="chat-sub">Chỉ trả lời về sản phẩm trên trang</div>
          </div>
          <button type="button" id="chat-close" class="chat-close" aria-label="Đóng trợ lý">✕</button>
        </header>
        <div id="chat-log" class="chat-log" aria-live="polite"></div>
        <div id="chat-suggest" class="chat-suggest"></div>
        <form id="chat-form" class="chat-form" autocomplete="off">
          <input id="chat-input" class="chat-input" maxlength="200" placeholder="Hỏi về series, mẫu, giá, tồn kho..." aria-label="Câu hỏi" />
          <button type="submit" class="chat-send" aria-label="Gửi">➤</button>
        </form>
      </section>`;
    document.body.appendChild(wrap);

    const fab = document.getElementById("chat-fab");
    const panel = document.getElementById("chat-panel");
    const log = document.getElementById("chat-log");
    const input = document.getElementById("chat-input");
    let greeted = false;

    const setOpen = (open) => {
      panel.classList.toggle("open", open);
      panel.setAttribute("aria-hidden", String(!open));
      fab.setAttribute("aria-expanded", String(open));
      fab.classList.toggle("hidden-fab", open);
      if (open) {
        if (!greeted) {
          greeted = true;
          push("bot", greeting());
        }
        setTimeout(() => input.focus(), 120);
      }
    };

    function push(who, html) {
      const div = document.createElement("div");
      div.className = `chat-msg ${who}`;
      div.innerHTML = html;
      log.appendChild(div);
      log.scrollTop = log.scrollHeight;
      return div;
    }

    async function ask(text) {
      const t = text.trim();
      if (!t) return;
      push("user", escapeHtml(t));
      input.value = "";
      const typing = push("bot typing", "<span></span><span></span><span></span>");
      try {
        await loadData(); // luôn đọc dữ liệu mới nhất (giá/tồn kho có thể vừa đổi)
        const reply = answer(t);
        await new Promise((r) => setTimeout(r, 350));
        typing.remove();
        push("bot", reply);
      } catch (err) {
        typing.remove();
        push("bot", "Xin lỗi, mình chưa đọc được dữ liệu sản phẩm. Bạn thử tải lại trang nhé.");
      }
    }

    document.getElementById("chat-suggest").innerHTML = SUGGESTIONS.map(
      (s) => `<button type="button" class="chat-chip">${escapeHtml(s)}</button>`
    ).join("");
    document.querySelectorAll(".chat-chip").forEach((b) => b.addEventListener("click", () => ask(b.textContent)));
    fab.addEventListener("click", () => setOpen(true));
    document.getElementById("chat-close").addEventListener("click", () => setOpen(false));
    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape" && panel.classList.contains("open")) setOpen(false);
    });
    document.getElementById("chat-form").addEventListener("submit", (e) => {
      e.preventDefault();
      ask(input.value);
    });
  }

  document.addEventListener("DOMContentLoaded", mount);

  // Cho phép kiểm thử: window.HacipupuChat.answer("câu hỏi")
  window.HacipupuChat = {
    async answer(text) {
      await loadData();
      return answer(text);
    },
  };
})();
