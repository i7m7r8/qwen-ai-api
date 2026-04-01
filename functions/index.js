/**
 * Cloudflare Pages — Qwen AI API
 * Primary: Qwen3-30B-A3B-FP8 | Fallback: Qwen2.5-Coder-32B-Instruct
 */

function normalizeMessages(rawMessages) {
  return rawMessages.map(function(msg) {
    let c = msg.content;
    if (Array.isArray(c)) {
      c = c.map(function(part) {
        if (typeof part === "string") return part;
        if (part && part.type === "text") return part.text || "";
        return "";
      }).join("\n").trim();
    }
    return { role: msg.role, content: c || "" };
  });
}

async function callQwen3(env, messages) {
  try {
    const aiResponse = await env.AI.run("@cf/qwen/qwen3-30b-a3b-fp8", {
      messages: messages,
      max_tokens: 16384,
      temperature: 0.7
    });
    let content = "";
    if (aiResponse && aiResponse.response) content = aiResponse.response;
    else if (aiResponse && aiResponse.result && aiResponse.result.response) content = aiResponse.result.response;
    return { ok: true, content: content };
  } catch (e) {
    return { ok: false, error: e.message };
  }
}

async function callQwenCoder(env, messages) {
  try {
    const aiResponse = await env.AI.run("@cf/qwen/qwen2.5-coder-32b-instruct", {
      messages: messages,
      max_tokens: 16384,
      temperature: 0.7
    });
    let content = "";
    if (aiResponse && aiResponse.response) content = aiResponse.response;
    else if (aiResponse && aiResponse.result && aiResponse.result.response) content = aiResponse.result.response;
    return { ok: true, content: content };
  } catch (e) {
    return { ok: false, error: e.message };
  }
}

export default {
  async fetch(request, env) {
    try {
      const url = new URL(request.url);
      const jsonHeaders = { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" };
      const sseHeaders = { "Content-Type": "text/event-stream", "Access-Control-Allow-Origin": "*", "Cache-Control": "no-cache" };

      if (request.method === "OPTIONS") {
        return new Response(null, { headers: { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Methods": "POST, OPTIONS", "Access-Control-Allow-Headers": "Content-Type, Authorization" } });
      }

      if (url.pathname === "/debug") {
        return new Response(JSON.stringify({ ai_binding: !!(env.AI), models: ["qwen3-30b-a3b-fp8", "qwen2.5-coder-32b-instruct"] }), { headers: jsonHeaders });
      }

      if (url.pathname === "/v1/models" || url.pathname === "/models") {
        return new Response(JSON.stringify({ object: "list", data: [{ id: "qwen3-30b-a3b-fp8", object: "model", owned_by: "qwen" }] }), { headers: jsonHeaders });
      }

      let body = {};
      try { const text = await request.text(); if (text) body = JSON.parse(text); } catch (e) { body = {}; }

      const wantsStream = body.stream === true;
      const messages = normalizeMessages(body.messages || [{ role: "user", content: "Hello" }]);

      if (!env.AI) {
        return new Response(JSON.stringify({ error: { message: "AI binding not configured in Cloudflare Dashboard" } }), { status: 500, headers: jsonHeaders });
      }

      const id = "chatcmpl-" + Date.now();
      const created = Math.floor(Date.now() / 1000);
      const encoder = new TextEncoder();

      if (wantsStream) {
        let result = await callQwen3(env, messages);
        if (!result.ok) result = await callQwenCoder(env, messages);
        
        if (result.ok) {
          const stream = new ReadableStream({
            async start(controller) {
              controller.enqueue(encoder.encode("data: " + JSON.stringify({ id, object: "chat.completion.chunk", created, model: "qwen3-30b-a3b-fp8", choices: [{ index: 0, delta: { role: "assistant", content: result.content }, finish_reason: null }] }) + "\n\n"));
              controller.enqueue(encoder.encode("data: " + JSON.stringify({ id, object: "chat.completion.chunk", created, model: "qwen3-30b-a3b-fp8", choices: [{ index: 0, delta: {}, finish_reason: "stop" }] }) + "\n\n"));
              controller.enqueue(encoder.encode("data: [DONE]\n\n"));
              controller.close();
            }
          });
          return new Response(stream, { headers: sseHeaders });
        }
        return new Response(JSON.stringify({ error: { message: result.error } }), { status: 500, headers: jsonHeaders });
      }

      let result = await callQwen3(env, messages);
      if (!result.ok) result = await callQwenCoder(env, messages);
      
      if (result.ok) {
        return new Response(JSON.stringify({ id, object: "chat.completion", created, model: "qwen3-30b-a3b-fp8", choices: [{ index: 0, message: { role: "assistant", content: result.content }, finish_reason: "stop" }] }), { headers: jsonHeaders });
      }
      
      return new Response(JSON.stringify({ error: { message: result.error } }), { status: 500, headers: jsonHeaders });

    } catch (err) {
      return new Response(JSON.stringify({ error: { message: err.message } }), { status: 500, headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" } });
    }
  }
};
