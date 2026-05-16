# CodeAbyss – Free AI Cloud IDE & Online Compiler

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![Node 22+](https://img.shields.io/badge/Node-22%2B-green)](https://nodejs.org)
[![Next.js 15](https://img.shields.io/badge/Next.js-15-black)](https://nextjs.org)

CodeAbyss is a **free, open-source, AI-powered cloud IDE** and autonomous coding agent. Write, run, and preview code in **8+ languages** directly in your browser — no signup required. Powered by free AI providers (Gemini, OpenRouter, Ollama).

## Features

- **AI Coding Agent** – Autonomous multi-file project generation with planning, coding, and review steps
- **Multi-Language Support** – Python, JavaScript, TypeScript, C, C++, Java, Rust, HTML/CSS/JS
- **Monaco Editor** – VS Code-grade editor with syntax highlighting, IntelliSense, and themes
- **Live Preview** – Instant HTML/CSS/JS preview in an embedded iframe
- **WebSocket Terminal** – Full xterm.js terminal with authenticated connections
- **Docker Sandbox** – Isolated code execution with CPU/RAM limits and network isolation
- **Three AI Providers** – Gemini (free), OpenRouter (free), Ollama (local/offline)
- **API Key Rotation** – Built-in round-robin load balancing across multiple API keys
- **Project Templates** – Quick-start templates for all supported languages
- **Dark Neon UI** – Framer Motion animated interface with cyan/amber/violet/mint themes
- **Auth System** – JWT-based authentication with user management
- **Auto-Save** – Debounced file saving with stale closure protection
- **Keyboard Shortcuts** – Ctrl+S (save), Ctrl+Enter (run), Ctrl+N (new file)
- **Error Boundary** – Graceful crash recovery with reload option
- **SEO Optimized** – Full Open Graph, Twitter Cards, JSON-LD structured data, sitemap
- **Production Docker** – Multi-stage Dockerfile with health checks

## Security

- SQL injection protection via parameterized queries and column whitelists
- Command injection prevention (subshell & newline blocking)
- WebSocket terminal authentication
- Helmet.js security headers
- Input sanitization and validation
- Sandbox network isolation

> **Important:** Do not commit real API keys. Any keys in screenshots, chats, or repos should be rotated. Use `.env` files only.

## Requirements

- Node.js 22+
- Python 3.12+ (optional, for analysis service)
- Docker Desktop (optional, for isolated sandbox execution)
- Ollama (optional, for fully local/offline AI)

## Quick Start

```powershell
cd "$env:USERPROFILE\Desktop\CodeAbyss_Free_AI_IDE"
npm install
Copy-Item .env.example .env
npm run dev
```

Open:

| Service   | URL                             |
| --------- | ------------------------------- |
| Web IDE   | http://localhost:3000            |
| Node API  | http://localhost:8787/health     |
| Python API| http://localhost:8788/health     |

## AI Configuration

### Free AI (No Cost)

**Gemini** – Get a free key at [aistudio.google.com](https://aistudio.google.com/app/apikey):
```env
GEMINI_API_KEYS=your-key-here
```

**OpenRouter** – Get free keys at [openrouter.ai](https://openrouter.ai):
```env
OPENROUTER_API_KEYS=key1,key2,key3
```

### Local AI (Offline)

```powershell
ollama pull qwen2.5-coder:7b
ollama serve
```

```env
AI_PROVIDER=auto
OLLAMA_BASE_URL=http://127.0.0.1:11434
OLLAMA_MODEL=qwen2.5-coder:7b
```

Auto mode cascades: Gemini → OpenRouter → Ollama.

## Docker Sandbox

Install compiler images:

```powershell
.\scripts\setup-compilers.ps1
```

Sandbox features:
- Network disabled
- 1 CPU / 512 MB RAM limit
- 30-second timeout
- Per-project workspace volume
- Command allowlist

## Architecture

```
apps/web/          → Next.js 15 frontend (port 3000)
services/api-node/ → Express API + SQLite (port 8787)
services/api-python/ → FastAPI analysis (port 8788)
demo-projects/     → Starter code for all languages
```

## Deployment

See [docs/FREE_DEPLOYMENT.md](docs/FREE_DEPLOYMENT.md) for free hosting on Vercel + Render.

## Contributing

1. Fork the repo
2. Create a feature branch
3. Make your changes
4. Submit a pull request

## License

MIT

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
