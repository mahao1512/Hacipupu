/*
 * Cấu hình AI cho Trợ lý HACIPUPU.
 *
 * endpoint: URL của Cloudflare Worker (thư mục worker/), ví dụ
 *   "https://hacipupu-ai.ten-ban.workers.dev"
 * Để trống "" → chat box dùng bộ trả lời có sẵn (không gọi AI).
 *
 * KHÔNG đặt API key OpenRouter ở đây — file này công khai trên trang web.
 */
window.HACIPUPU_AI = {
  endpoint: "https://hacipupu-ai.mahao2600.workers.dev",
};
