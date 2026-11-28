/*
 * Cloudflare Worker — proxy giữa chat box HACIPUPU và OpenRouter.
 *
 * API key nằm trong secret OPENROUTER_API_KEY của Worker (không bao giờ xuất
 * hiện trong code của trang web). Worker chỉ nhận request từ các domain trong
 * ALLOWED_ORIGINS, tự đặt model + giới hạn độ dài để key không bị lạm dụng.
 *
 * Request:  POST { system: string, messages: [{ role: "user"|"assistant", content: string }] }
 * Response: { reply: string }  hoặc  { error: string }
 */

const OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions";
const DEFAULT_MODEL = "nvidia/nemotron-3-ultra-550b-a55b:free";

const MAX_MESSAGES = 12; // số lượt hội thoại gần nhất được gửi
const MAX_MSG_CHARS = 600; // mỗi tin nhắn của khách
const MAX_SYSTEM_CHARS = 24000; // dữ liệu sản phẩm gửi kèm
const MAX_TOKENS = 700;

function corsHeaders(origin, env) {
  const allowed = String(env.ALLOWED_ORIGINS || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  const ok = origin && (allowed.includes("*") || allowed.includes(origin));
  return {
    ok,
    headers: {
      "Access-Control-Allow-Origin": ok ? origin : "null",
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
      "Access-Control-Max-Age": "86400",
      Vary: "Origin",
    },
  };
}

const json = (body, status, headers) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...headers, "Content-Type": "application/json; charset=utf-8" },
  });

export default {
  async fetch(request, env) {
    const origin = request.headers.get("Origin") || "";
    const cors = corsHeaders(origin, env);

    if (request.method === "OPTIONS") {
      return new Response(null, { status: cors.ok ? 204 : 403, headers: cors.headers });
    }
    if (request.method !== "POST") return json({ error: "Method not allowed" }, 405, cors.headers);
    if (!cors.ok) return json({ error: "Origin not allowed" }, 403, cors.headers);
    const apiKey = String(env.OPENROUTER_API_KEY || "").trim().replace(/^OPENROUTER_API_KEY=/, "").replace(/^["']|["']$/g, "");
    if (!apiKey) return json({ error: "Worker chưa cấu hình OPENROUTER_API_KEY" }, 500, cors.headers);

    let body;
    try {
      body = await request.json();
    } catch {
      return json({ error: "Body phải là JSON" }, 400, cors.headers);
    }

    const system = String(body.system || "").slice(0, MAX_SYSTEM_CHARS);
    const messages = (Array.isArray(body.messages) ? body.messages : [])
      .filter((m) => m && (m.role === "user" || m.role === "assistant") && typeof m.content === "string")
      .slice(-MAX_MESSAGES)
      .map((m) => ({ role: m.role, content: m.content.slice(0, m.role === "user" ? MAX_MSG_CHARS : 2000) }));
    if (!messages.length || messages[messages.length - 1].role !== "user") {
      return json({ error: "Thiếu câu hỏi" }, 400, cors.headers);
    }

    const payload = {
      model: env.MODEL || DEFAULT_MODEL,
      messages: [...(system ? [{ role: "system", content: system }] : []), ...messages],
      max_tokens: MAX_TOKENS,
      temperature: 0.3,
      reasoning: { enabled: String(env.REASONING || "true") === "true", exclude: true },
    };

    let upstream;
    try {
      upstream = await fetch(OPENROUTER_URL, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
          "HTTP-Referer": origin,
          "X-Title": "HACIPUPU Toy Box",
        },
        body: JSON.stringify(payload),
      });
    } catch {
      return json({ error: "Không kết nối được OpenRouter" }, 502, cors.headers);
    }

    const data = await upstream.json().catch(() => null);
    if (!upstream.ok || !data) {
      const msg = (data && data.error && data.error.message) || `OpenRouter lỗi ${upstream.status}`;
      return json({ error: msg }, upstream.status === 429 ? 429 : 502, cors.headers);
    }
    const reply = data.choices && data.choices[0] && data.choices[0].message && data.choices[0].message.content;
    if (!reply) return json({ error: "Model không trả lời" }, 502, cors.headers);
    return json({ reply: String(reply).trim() }, 200, cors.headers);
  },
};
