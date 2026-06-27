// ==========================================
// Cloudflare Worker — 马来亚1941 Gemini API 安全代理
// 1. API Key 藏在 Worker 环境变量，学生无需手动输入
// 2. CORS 白名单：仅放行 GitHub Pages 及本地调试
// 部署: wrangler deploy (需先设置 GEMINI_API_KEY 环境变量)
// ==========================================

export default {
  async fetch(request, env) {
    const origin = request.headers.get('Origin') || '';

    // --- 安全验证：域名白名单 ---
    const isAllowed =
      origin === 'https://chewyenhan.github.io' ||
      origin.startsWith('http://localhost') ||
      origin.startsWith('http://127.0.0.1') ||
      origin === 'null' ||
      origin === '';

    if (!isAllowed) {
      return new Response('CORS Blocked: Unauthorized Origin', {
        status: 403,
        headers: { 'Content-Type': 'text/plain' }
      });
    }

    const corsHeaders = {
      'Access-Control-Allow-Origin': origin || '*',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type'
    };

    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: corsHeaders });
    }

    const url = new URL(request.url);

    // --- GET /models — 获取可用模型列表 ---
    if (url.pathname === '/models' && request.method === 'GET') {
      const models = {
        models: [
          { name: 'models/gemini-2.5-flash', displayName: 'Gemini 2.5 Flash (推荐)' },
          { name: 'models/gemini-2.5-pro', displayName: 'Gemini 2.5 Pro' },
          { name: 'models/gemini-2.0-flash', displayName: 'Gemini 2.0 Flash' },
          { name: 'models/gemini-1.5-flash', displayName: 'Gemini 1.5 Flash' },
          { name: 'models/gemini-1.5-pro', displayName: 'Gemini 1.5 Pro' }
        ]
      };
      return new Response(JSON.stringify(models), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    // --- POST /gemini — 代理 Gemini API 调用 ---
    if (url.pathname === '/gemini' && request.method === 'POST') {
      try {
        const body = await request.json();
        const model = body.model || 'gemini-2.5-flash';

        const geminiBody = {};
        if (body.contents) geminiBody.contents = body.contents;
        if (body.systemInstruction) geminiBody.systemInstruction = body.systemInstruction;
        if (body.generationConfig) geminiBody.generationConfig = body.generationConfig;

        const resp = await fetch(
          `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`,
          {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'x-goog-api-key': env.GEMINI_API_KEY
            },
            body: JSON.stringify(geminiBody)
          }
        );

        return new Response(await resp.text(), {
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
