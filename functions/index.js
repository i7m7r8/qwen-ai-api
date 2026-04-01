/**
 * Cloudflare Pages Functions — Llama 4 Scout API
 * Model: @cf/meta/llama-4-scout-17b-16e-instruct
 * 17B params, 16 experts (MoE), 128K context
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
      model: "@cf/meta/llama-4-scout-17b-16e-instruct",
      pages_functions: true
    }), { headers: jsonHeaders });
  }

  // OpenAI-compatible model listing
  if (url.pathname === "/v1/models" || url.pathname === "/models") {
    return new Response(JSON.stringify({
      object: "list",
      data: [{
        id: "llama-4-scout",        object: "model",
        owned_by: "meta"
      }]
    }), { headers: jsonHeaders });
  }

  // Only handle POST for chat completions
  if (request.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), { 
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
    return new Response(JSON.stringify({ error: "Invalid JSON" }), { 
      status: 400, 
      headers: jsonHeaders 
    });
  }

  const wantsStream = body.stream === true;
  
  // Normalize messages
  let messages = body.messages;
  if (!messages && body.prompt) {
    messages = [{ role: "user", content: body.prompt }];
  }
  if (!messages || messages.length === 0) {
    messages = [{ role: "user", content: "Hello" }];
  }

  // Check AI binding exists
  if (!env.AI) {
    return new Response(JSON.stringify({
      error: { message: "AI binding not configured" }
    }), { status: 500, headers: jsonHeaders });
  }

  const id = "chatcmpl-" + Date.now();
  const created = Math.floor(Date.now() / 1000);

  // LLAMA 4 SCOUT MODEL
  const MODEL_NAME = "@cf/meta/llama-4-scout-17b-16e-instruct";
  // STREAMING MODE
  if (wantsStream) {
    try {
      const stream = await env.AI.run(MODEL_NAME, {
        messages: messages,
        stream: true,
        max_tokens: 4096,
        temperature: 0.7
      });
      return new Response(stream, { headers: sseHeaders });
    } catch (err) {
      return new Response(JSON.stringify({ 
        error: { message: err.message || "Streaming error" } 
      }), { status: 500, headers: jsonHeaders });
    }
  }

  // NON-STREAMING MODE
  try {
    const response = await env.AI.run(MODEL_NAME, {
      messages: messages,
      max_tokens: 4096,
      temperature: 0.7
    });

    // Handle response formats
    let content = "";
    if (response && response.response) {
      content = response.response;
    } else if (response && response.result && response.result.response) {
      content = response.result.response;
    } else if (response && Array.isArray(response.output)) {
      content = response.output.map(o => o.text || o.content || "").join("\n");
    } else if (typeof response === "string") {
      content = response;
    }

    return new Response(JSON.stringify({
      id: id,
      object: "chat.completion",
      created: created,
      model: "llama-4-scout",
      choices: [{
        index: 0,
        message: { role: "assistant", content: content || "" },
        finish_reason: "stop"
      }],
      usage: { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 }
    }), { headers: jsonHeaders });
      } catch (err) {
    return new Response(JSON.stringify({
      error: { message: err.message || "AI error" }
    }), { status: 500, headers: jsonHeaders });
  }
}
