// ==========================================
// Cloudflare Worker — 马来亚1941 Gemini API 安全代理
// 安全设计：
//   1. API Key 仅存在于 Worker 环境变量 (env.GEMINI_API_KEY)，永不下发
//   2. Key 只在服务端 → Google API 的 x-goog-api-key header 中使用
//   3. CORS 白名单仅放行 GitHub Pages + 本地调试
//   4. 浏览器永远看不到 Key，即使抓包也只能看到 Worker URL
// 部署: npx wrangler deploy
// Secret: npx wrangler secret put GEMINI_API_KEY
// ==========================================

// 简易速率计数器（同一 Worker 实例内有效，防脚本滥用）
const rateMap = new Map();

export default {
  async fetch(request, env) {
    const origin = request.headers.get('Origin') || '';

    // --- CORS 白名单 ---
    const isAllowed =
      origin === 'https://chewyenhan.github.io' ||
      origin.startsWith('http://localhost') ||
      origin.startsWith('http://127.0.0.1');

    if (!isAllowed) {
      return new Response('CORS Blocked', { status: 403 });
    }

    // CORS headers（必须在 OPTIONS 和实际响应前定义）
    const corsHeaders = {
      'Access-Control-Allow-Origin': origin,
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type'
    };

    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: corsHeaders });
    }

    const url = new URL(request.url);

    // --- GET /models ---
    if (url.pathname === '/models' && request.method === 'GET') {
      return new Response(JSON.stringify({
        models: [
          { name: 'models/gemini-2.5-flash', displayName: 'Gemini 2.5 Flash (推荐)' },
          { name: 'models/gemini-2.5-pro',   displayName: 'Gemini 2.5 Pro' },
          { name: 'models/gemini-2.0-flash', displayName: 'Gemini 2.0 Flash' },
          { name: 'models/gemini-1.5-flash', displayName: 'Gemini 1.5 Flash' },
          { name: 'models/gemini-1.5-pro',   displayName: 'Gemini 1.5 Pro' }
        ]
      }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    // --- POST /gemini（带速率限制） ---
    if (url.pathname === '/gemini' && request.method === 'POST') {
      // 速率限制：每 IP 每分钟最多 15 次
      const ip = request.headers.get('CF-Connecting-IP') || 'unknown';
      const now = Date.now();
      const windowMs = 60_000;
      const maxReq = 15;

      let entry = rateMap.get(ip);
      if (!entry || (now - entry.resetAt) > windowMs) {
        entry = { count: 0, resetAt: now + windowMs };
        rateMap.set(ip, entry);
      }

      entry.count++;
      if (entry.count > maxReq) {
        return new Response(JSON.stringify({ error: '请求过于频繁，请稍后再试' }), {
          status: 429,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }

      // 清理过期条目（每 100 次请求清理一次）
      if (Math.random() < 0.01) {
        for (const [k, v] of rateMap) {
          if (now > v.resetAt) rateMap.delete(k);
        }
      }

      try {
        const body = await request.json();
        const model = body.model || 'gemini-2.5-flash';

        const geminiBody = {};
        if (body.contents) geminiBody.contents = body.contents;
        if (body.systemInstruction) geminiBody.systemInstruction = body.systemInstruction;
        if (body.generationConfig) geminiBody.generationConfig = body.generationConfig;

        // Key 仅在此处使用，浏览器永远不可见
        // --- 双 Key 阶梯：免费 Key 优先，失败自动换付费 Key 重试 ---
        const callGemini = (apiKey) => fetch(
          `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`,
          {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'x-goog-api-key': apiKey
            },
            body: JSON.stringify(geminiBody)
          }
        );

        let resp = await callGemini(env.GEMINI_API_KEY);
        let respText = await resp.text();

        // 免费档失败（地区限制 400 / 配额限流 429 等）→ 付费 Key 兜底重试一次
        if (!resp.ok && env.GEMINI_API_KEY_PAID) {
          resp = await callGemini(env.GEMINI_API_KEY_PAID);
          respText = await resp.text();
        }

        return new Response(respText, {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      } catch (e) {
        return new Response(JSON.stringify({ error: 'AI 请求失败: ' + e.message }), {
          status: 502,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }
    }

    return new Response('Not found', { status: 404, headers: corsHeaders });
  }
};
