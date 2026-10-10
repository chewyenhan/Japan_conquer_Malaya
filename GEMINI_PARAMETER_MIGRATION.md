# Gemini 参数迁移（2026-10-10）

根据2026-10-07 Google AI Studio通知清理旧参数；保留generateContent、模型、Key、权限及预算限制。官方文档：https://ai.google.dev/gemini-api/docs/thinking ，https://ai.google.dev/gemini-api/docs/migrate-to-interactions 。

index.html删除temperature:0.7，保留maxOutputTokens:2000。内联JS语法通过，无真实API调用。Worker仍转发generationConfig，旧浏览器缓存可能继续发送旧字段。需发布静态页面并核实正式入口；尚未部署。
