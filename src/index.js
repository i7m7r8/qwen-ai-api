export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const headers = { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" };
    
    // CORS
    if (request.method === "OPTIONS") {
      return new Response(null, { headers: { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Methods": "POST, GET, OPTIONS", "Access-Control-Allow-Headers": "Content-Type, Authorization" } });
    }
    
    // Debug endpoint
    if (url.pathname === "/debug" && request.method === "GET") {
      return new Response(JSON.stringify({ ai_binding: !!env.AI, status: "ok" }), { headers });
    }
    
    // Model listing - FIXED: added "data:" key before array
    if ((url.pathname === "/v1/models" || url.pathname === "/models") && request.method === "GET") {
      return new Response(JSON.stringify({ object: "list", data: [{ id: "qwen3-30b-a3b-fp8", object: "model", owned_by: "qwen" }] }), { headers });
    }
    
    // POST = chat completion
    if (request.method === "POST") {
      if (!env.AI) {
        return new Response(JSON.stringify({ error: "AI binding not connected" }), { status: 500, headers });
      }
      
      let body = {};
      try { const t = await request.text(); if (t) body = JSON.parse(t); } catch (e) { return new Response(JSON.stringify({ error: "Invalid JSON" }), { status: 400, headers }); }
      
      const messages = body.messages || (body.prompt ? [{ role: "user", content: body.prompt }] : [{ role: "user", content: "Hello" }]);
      const stream = body.stream === true;
      const MODEL = "@cf/qwen/qwen3-30b-a3b-fp8";
      
      if (stream) {
        try {
          const s = await env.AI.run(MODEL, { messages, stream: true });
          return new Response(s, { headers: { "Content-Type": "text/event-stream", "Access-Control-Allow-Origin": "*", "Cache-Control": "no-cache" } });
        } catch (err) { return new Response(JSON.stringify({ error: err.message }), { status: 500, headers }); }
      }
      
      try {
        const r = await env.AI.run(MODEL, { messages });
        const content = r?.response || r?.result?.response || "";
        return new Response(JSON.stringify({ id: "chatcmpl-" + Date.now(), object: "chat.completion", created: Math.floor(Date.now()/1000), model: "qwen3-30b-a3b-fp8", choices: [{ index: 0, message: { role: "assistant", content: content }, finish_reason: "stop" }], usage: { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 } }), { headers });
      } catch (err) { return new Response(JSON.stringify({ error: err.message }), { status: 500, headers }); }
    }
    
    // Default response
    return new Response(JSON.stringify({ status: "ok" }), { headers });
  }
};
