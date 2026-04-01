/**
 * Cloudflare Pages Functions — Llama 4 Scout API
 * Catch-all POST handler: ANY POST → chat completion
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

  // ✅ CORS: Handle for ALL paths/methods
  if (request.method === "OPTIONS") {
    return new Response(null, {
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type, Authorization"
      }
    });
  }

  // ✅ CATCH-ALL: Handle ANY POST request as chat completion
  // This must come BEFORE specific pathname checks
  if (request.method === "POST") {
    return handleChatCompletion(request, env, jsonHeaders, sseHeaders);
  }

  // GET endpoints (only after POST catch-all)
  if (request.method === "GET") {
    // Debug endpoint
    if (url.pathname === "/debug") {
      return new Response(JSON.stringify({
        ai_binding: !!(env.AI),
        model: "@cf/meta/llama-4-scout-17b-16e-instruct",
        pages_functions: true
      }), { headers: jsonHeaders });
    }
        // Model listing
    if (url.pathname === "/v1/models" || url.pathname === "/models") {
      return new Response(JSON.stringify({
        object: "list",
         [{
          id: "llama-4-scout",
          object: "model",
          owned_by: "meta"
        }]
      }), { headers: jsonHeaders });
    }
    
    // Root GET
    if (url.pathname === "/") {
      return new Response(JSON.stringify({ status: "ok", model: "llama-4-scout" }), { headers: jsonHeaders });
    }
  }

  // Default 404 for unmatched GET, 405 for other methods
  const status = request.method === "GET" ? 404 : 405;
  return new Response(JSON.stringify({ error: "Not found" }), { 
    status: status, 
    headers: jsonHeaders 
  });
}

// Chat completion handler (called for ANY POST)
async function handleChatCompletion(request, env, jsonHeaders, sseHeaders) {
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
  
  let messages = body.messages;
  if (!messages && body.prompt) {
    messages = [{ role: "user", content: body.prompt }];
  }
  if (!messages || messages.length === 0) {
    messages = [{ role: "user", content: "Hello" }];
  }

  if (!env.AI) {    return new Response(JSON.stringify({ error: { message: "AI binding not configured" } }), { 
      status: 500, 
      headers: jsonHeaders 
    });
  }

  const id = body.id || "chatcmpl-" + Date.now();
  const created = body.created || Math.floor(Date.now() / 1000);
  const MODEL_NAME = "@cf/meta/llama-4-scout-17b-16e-instruct";

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
      return new Response(JSON.stringify({ error: { message: err.message || "Streaming error" } }), { 
        status: 500, 
        headers: jsonHeaders 
      });
    }
  }

  try {
    const response = await env.AI.run(MODEL_NAME, {
      messages: messages,
      max_tokens: 4096,
      temperature: 0.7
    });

    let content = "";
    if (response && response.response) content = response.response;
    else if (response && response.result?.response) content = response.result.response;
    else if (Array.isArray(response?.output)) content = response.output.map(o => o.text || o.content || "").join("\n");
    else if (typeof response === "string") content = response;

    return new Response(JSON.stringify({
      id: id,
      object: "chat.completion",
      created: created,
      model: "llama-4-scout",
      choices: [{
        index: 0,
        message: { role: "assistant", content: content || "" },
        finish_reason: "stop"
      }],      usage: { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 }
    }), { headers: jsonHeaders });
    
  } catch (err) {
    return new Response(JSON.stringify({ error: { message: err.message || "AI error" } }), { 
      status: 500, 
      headers: jsonHeaders 
    });
  }
}
