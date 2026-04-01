export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const jsonHeaders = { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" };
    const sseHeaders = { "Content-Type": "text/event-stream", "Access-Control-Allow-Origin": "*", "Cache-Control": "no-cache" };

    // CORS
    if (request.method === "OPTIONS") {
      return new Response(null, { headers: { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Methods": "POST, GET, OPTIONS", "Access-Control-Allow-Headers": "Content-Type, Authorization" } });
    }

    // POST = chat completion
    if (request.method === "POST") {
      let body = {};
      try { const t = await request.text(); if (t) body = JSON.parse(t); } catch (e) { return new Response(JSON.stringify({error:"Invalid JSON"}), {status:400,headers:jsonHeaders}); }
      const stream = body.stream === true;
      const messages = body.messages || (body.prompt ? [{role:"user",content:body.prompt}] : [{role:"user",content:"Hello"}]);
      
      if (!env.AI) return new Response(JSON.stringify({error:{message:"AI binding not configured. Add Workers AI binding in Dashboard."}}), {status:500,headers:jsonHeaders});
      
      const id = body.id || "chatcmpl-"+Date.now();
      const created = body.created || Math.floor(Date.now()/1000);
      
      // Try Llama 4 Scout first, fallback to Qwen3 if unavailable
      const MODELS = ["@cf/meta/llama-4-scout-17b-16e-instruct", "@cf/qwen/qwen3-30b-a3b-fp8", "@cf/qwen/qwen2.5-coder-32b-instruct"];
      let lastError = null;
      
      for (const MODEL of MODELS) {
        try {
          if (stream) {
            const s = await env.AI.run(MODEL, {messages, stream:true, max_tokens:4096, temperature:0.7});
            return new Response(s, {headers:sseHeaders});
          } else {
            const r = await env.AI.run(MODEL, {messages, max_tokens:4096, temperature:0.7});
            let c = "";
            if (r && r.response) c = r.response;
            else if (r && r.result && r.result.response) c = r.result.response;
            else if (r && Array.isArray(r.output)) c = r.output.map(o=>o.text||o.content||"").join("\n");
            else if (typeof r === "string") c = r;
            return new Response(JSON.stringify({id,object:"chat.completion",created,model:MODEL.split("/").pop(),choices:[{index:0,message:{role:"assistant",content:c||""},finish_reason:"stop"}],usage:{prompt_tokens:0,completion_tokens:0,total_tokens:0}}), {headers:jsonHeaders});
          }
        } catch (err) {
          lastError = err.message;
          // Continue to next model if this one fails
          continue;
        }
      }
      
      // All models failed
      return new Response(JSON.stringify({error:{message:"All models failed: "+lastError, tried:MODELS}}), {status:500,headers:jsonHeaders});
    }

    // GET endpoints
    if (request.method === "GET") {
      if (url.pathname === "/debug") return new Response(JSON.stringify({ai_binding:!!env.AI, available_models:["@cf/meta/llama-4-scout-17b-16e-instruct","@cf/qwen/qwen3-30b-a3b-fp8"], fallback_enabled:true}), {headers:jsonHeaders});
      if (url.pathname === "/v1/models" || url.pathname === "/models") return new Response(JSON.stringify({object:"list",[{id:"llama-4-scout",object:"model",owned_by:"meta"}]}), {headers:jsonHeaders});
      if (url.pathname === "/") return new Response(JSON.stringify({status:"ok"}), {headers:jsonHeaders});
    }

    return new Response(JSON.stringify({error:"Not found"}), {status: request.method==="GET"?404:405, headers:jsonHeaders});
  }
};
