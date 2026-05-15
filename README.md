# NovaForge

NovaForge is a zero-budget, browser-based AI Cloud IDE and autonomous coding agent MVP. It is designed to run locally without paid AI APIs by default, using Ollama-compatible local models such as Qwen Coder or DeepSeek Coder.

## What Is Included

- Next.js + TailwindCSS frontend
- Monaco editor
- xterm.js WebSocket terminal
- Framer Motion animated dark neon interface
- Node.js + Express API
- Python FastAPI analysis service
- SQLite database
- NextAuth Google login scaffold
- Ollama local AI support
- Bring-your-own-key Gemini/OpenRouter/DeepSeek-compatible support
- Docker sandbox runner with CPU/RAM limits
- Waitlist table for future PRO plan
- Donation and GitHub Sponsors placeholders
- Public sharing/fork/clone UI placeholders
- Demo projects for Python, C, C++, Java, Rust, HTML, CSS, and JavaScript
- GitHub Actions CI

## Important Security Note

Do not commit real API keys. Any keys pasted into chat, screenshots, repositories, or shared logs should be rotated in the provider dashboard. Add keys only to local `.env` files or the browser BYO-key field.

## Requirements

- Node.js 22+
- Python 3.12+
- Docker Desktop for isolated code execution and compiler images
- Ollama for fully local AI

Docker is optional for opening the IDE, but required for real isolated sandboxes.

Install language compiler images:

```powershell
.\scripts\setup-compilers.ps1
```

## Setup

```powershell
cd "$env:USERPROFILE\Desktop\NovaForge_Free_AI_IDE"
npm install
python -m pip install -r services/api-python/requirements.txt
Copy-Item .env.example .env
npm run dev
```

Open:

- Web IDE: http://localhost:3000
- Node API: http://localhost:8787/health
- Python API: http://localhost:8788/health

## Local AI With No Paid APIs

Install Ollama and pull a coding model:

```powershell
ollama pull qwen2.5-coder:7b
ollama serve
```

Then keep:

```env
AI_PROVIDER=auto
OLLAMA_BASE_URL=http://127.0.0.1:11434
OLLAMA_MODEL=qwen2.5-coder:7b
```

Auto mode uses Gemini when a BYO Gemini key is present, otherwise Ollama.

## Bring Your Own API Key

NovaForge supports optional browser-session keys for Gemini/OpenRouter-compatible providers. Use the Gemini AI Studio button inside the app or visit:

https://aistudio.google.com/app/apikey

## Sandbox Execution

The Node API exposes `/api/sandbox/run`. It uses Docker with:

- network disabled
- 1 CPU
- 512 MB RAM
- 30 second timeout
- per-project workspace volume
- command allowlist

This is still an MVP sandbox. For public multi-user hosting, use dedicated worker machines, stronger filesystem isolation, per-user quotas, and never mount host-sensitive paths.

## Free Deployment

See [FREE_DEPLOYMENT.md](docs/FREE_DEPLOYMENT.md).

Recommended split:

- Frontend: Vercel free tier
- Node API: Render free tier
- Python API: Render free tier
- Database: SQLite volume locally or Render disk where available; Supabase free tier later only if you outgrow SQLite
- Storage: Cloudflare R2 free tier only when file assets exceed local needs

## Scripts

```powershell
npm run dev
npm run build
npm run lint
npm run smoke
```

## Roadmap

- Real file tree sync from backend workspaces
- Agent tool-call protocol for create/edit/delete/run/test loops
- Public project share pages
- One-click fork and clone APIs
- Resource metering and free-plan rate limits
- Optional Stripe placeholder activation after traction
