# Worker AI cho Trợ lý HACIPUPU

Chat box gọi Worker này; Worker giữ API key OpenRouter làm secret và chuyển câu hỏi
sang model `nvidia/nemotron-3-ultra-550b-a55b:free`. Key không bao giờ nằm trong code trang web.

## Deploy (một lần, miễn phí)

Chạy trong thư mục `worker/`:

```powershell
npx wrangler login
```

```powershell
npx wrangler secret put OPENROUTER_API_KEY
```
(dán key khi được hỏi — key đang có sẵn trong `worker/.dev.vars`)

1. Sửa `ALLOWED_ORIGINS` trong `wrangler.toml`: thêm domain GitHub Pages, ví dụ `https://ten-ban.github.io`.

```powershell
npx wrangler deploy
```

2. Copy URL Worker in ra (dạng `https://hacipupu-ai.<ten>.workers.dev`) vào `js/ai-config.js`:
   ```js
   window.HACIPUPU_AI = { endpoint: "https://hacipupu-ai.<ten>.workers.dev" };
   ```

## Chạy thử trên máy

```powershell
npx wrangler dev
```
Worker chạy ở `http://localhost:8787` (đọc key từ `.dev.vars`). Đặt `endpoint` thành địa chỉ này, mở trang ở `http://localhost:8000`.

## Lưu ý
- `.dev.vars` chứa key — đã nằm trong `.gitignore`, **không** đẩy lên GitHub.
- Nếu `endpoint` để trống hoặc AI lỗi/quá tải, chat box tự dùng bộ trả lời có sẵn.
- Worker giới hạn 12 lượt hội thoại gần nhất, 600 ký tự/câu hỏi, 700 token/trả lời.
- Đổi model: sửa `MODEL` trong `wrangler.toml`. Tắt suy luận cho nhanh hơn: `REASONING = "false"`.
