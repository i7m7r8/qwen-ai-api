/**
 * Cloudflare Pages Functions — Qwen AI API
 * Entry point: functions/index.js
 * Uses Workers AI binding: context.env.AI.run()
 */

export async function onRequest(context) {
  const { request, env } = context;
  const url = new URL(request.url);

  const jsonHeaders = { 
    "Content-Type": "application/json", 
    "Access-Control-Allow-Origin": "*" 
  };
  const sseHeaders = { 
    "Content-Type": "text/event-stream", 
    "Access-Control-Allow-Origin": "*",
    "Cache-Control": "no-cache"
  };

  // Handle CORS preflight
  if (request.method === "OPTIONS") {
    return new Response(null, {
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type, Authorization"
      }
    });
  }

  // Debug endpoint
  if (url.pathname === "/debug") {
    return new Response(JSON.stringify({
      ai_binding: !!(env.AI),
      model: "@cf/qwen/qwen3-30b-a3b-fp8",
      pages_functions: true
    }), { headers: jsonHeaders });
  }

  // OpenAI-compatible model listing - FIXED: added "data:" key
  if (url.pathname === "/v1/models" || url.pathname === "/models") {
    return new Response(JSON.stringify({
      object: "list",
      data: [{  // ← FIXED: Added "data:" key before array
        id: "qwen3-30b-a3b-fp8",        object: "model",
        owned_by: "qwen"
      }]
    }), { headers: jsonHeaders });
  }

  // Only handle POST for chat completions
  if (request.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed. Use POST." }), { 
      status: 405, 
      headers: jsonHeaders 
    });
  }

  // Parse request body
  let body = {};
  try {
    const text = await request.text();
    if (text) body = JSON.parse(text);
  } catch (e) {
    body = {};
  }

  const wantsStream = body.stream === true;
  
  // Normalize messages
  let messages = body.messages;
  if (!messages && body.prompt) {
    messages = [{ role: "user", content: body.prompt }];
  }
  if (!messages) {
    messages = [{ role: "user", content: "Hello" }];
  }

  // Check AI binding exists
  if (!env.AI) {
    return new Response(JSON.stringify({
      error: { 
        message: "AI binding not configured. Go to Cloudflare Dashboard > Pages > qwen-ai-api > Settings > Bindings > Add > Workers AI",
        type: "config_error" 
      }
    }), { status: 500, headers: jsonHeaders });
  }

  const id = "chatcmpl-" + Date.now();
  const created = Math.floor(Date.now() / 1000);

  // STREAMING MODE
  if (wantsStream) {
    try {      const stream = await env.AI.run("@cf/qwen/qwen3-30b-a3b-fp8", {
        messages: messages,
        stream: true
      });
      return new Response(stream, { headers: sseHeaders });
    } catch (err) {
      return new Response(JSON.stringify({ error: { message: err.message } }), { 
        status: 500, 
        headers: jsonHeaders 
      });
    }
  }

  // NON-STREAMING MODE
  try {
    const response = await env.AI.run("@cf/qwen/qwen3-30b-a3b-fp8", {
      messages: messages
    });

    // Return OpenAI-compatible format
    return new Response(JSON.stringify({
      id: id,
      object: "chat.completion",
      created: created,
      model: "qwen3-30b-a3b-fp8",
      choices: [{
        index: 0,
        message: { 
          role: "assistant", 
          content: response.response || response.result?.response || "" 
        },
        finish_reason: "stop"
      }],
      usage: { 
        prompt_tokens: 0, 
        completion_tokens: 0, 
        total_tokens: 0 
      }
    }), { headers: jsonHeaders });
    
  } catch (err) {
    return new Response(JSON.stringify({
      error: { message: err.message, type: "ai_error" }
    }), { status: 500, headers: jsonHeaders });
  }
}
