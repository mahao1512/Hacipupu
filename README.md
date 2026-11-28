# HACIPUPU Toy Box

Trang bán figure blind box HACIPUPU — web tĩnh, chạy trên Cloudflare Pages.

## Cấu trúc thư mục

```
DA/
├── index.html, detail.html, collection.html,   ← các trang (để ở gốc để giữ đường dẫn URL)
│   orders.html, about.html, admin.html
├── assets/    favicon, apple-touch-icon, logo
├── css/       tailwind.css (đã build) + styles.css (style riêng)
├── js/        app.js (dùng chung), store.js (dữ liệu), chatbot.js + ai-config.js (trợ lý AI), tour.js (hướng dẫn nhanh cho khách mới),
│              index/detail/collection/orders/admin/blindbox.js (từng trang)
├── data/      series.csv, figures.csv (dữ liệu gốc), images.json (danh sách ảnh),
│              seed.js (bản sao dữ liệu để mở trực tiếp file://)
├── img/       ảnh + video sản phẩm, mỗi series một thư mục
├── worker/    Cloudflare Worker gọi OpenRouter cho chat box (xem worker/README.md)
└── scripts/   deploy-site.ps1 — đóng gói và deploy trang lên Cloudflare Pages
```

## Deploy

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\deploy-site.ps1
```
Script tạo `dist/` (chỉ chứa file trang web, không có `worker/`) rồi upload. `dist/` và `.wrangler/` là file tạm, có thể xoá bất cứ lúc nào.
