# Cloudflare Qwen AI API

Primary: Qwen3-30B-A3B-FP8 | Fallback: Qwen2.5-Coder-32B-Instruct

## Deploy

1. Push to GitHub
2. Connect to Cloudflare Pages
3. Enable AI binding in Dashboard > Pages > Settings > Functions

## Test

curl -X POST https://your-worker.pages.dev/ -H "Content-Type: application/json" -d '{"messages":[{"role":"user","content":"Hello"}]}'
