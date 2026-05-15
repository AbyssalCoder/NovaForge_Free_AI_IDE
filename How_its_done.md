# How NovaForge Is Done

## Current Build

NovaForge is a free-first local beta environment:

- `apps/web`: Next.js browser IDE with TailwindCSS, Monaco, xterm.js, and Framer Motion.
- `services/api-node`: Express API, WebSocket terminal, SQLite, AI provider routing, workspace files, and Docker sandbox execution.
- `services/api-python`: FastAPI helper service for smoke checks and lightweight static analysis.
- `demo-projects`: starter examples for Python, C, C++, Java, Rust, HTML, CSS, and JavaScript.
- `scripts`: smoke test, browser check, and Docker compiler setup.

## Files And Folders

The left sidebar now has VS Code-style tabs:

- `Home`: local beta status.
- `File`: create files, create folders, save, delete, and refresh.
- `View`: show/hide agent and preview panels.
- `Run`: run the active file and view Docker compiler image status.

The backend persists workspace files under:

```text
workspaces/demo-js
```

The file APIs are:

- `GET /api/workspace/tree`
- `GET /api/workspace/file?path=...`
- `PUT /api/workspace/file`
- `POST /api/workspace/folder`
- `DELETE /api/workspace/entry`

## Run Button

The Run button now saves the active editor file, picks the correct command for the file extension, and sends it to:

```text
POST /api/sandbox/run
```

Runtime mapping:

- `.js`: `node file.js`
- `.py`: `python file.py`
- `.c`: `gcc file.c -o main && ./main`
- `.cpp`: `g++ file.cpp -o main && ./main`
- `.java`: `javac Main.java && java -cp folder Main`
- `.rs`: `rustc main.rs -o main && ./main`
- `.html` / `.css`: save/preview readiness checks
- `.ts` / `.tsx`: save and tell the user to run the full Next.js build from the terminal

## Compiler Strategy

Compilers are provided through Docker images, not host installs:

- Node.js: `node:22-alpine`
- Python: `python:3.12-alpine`
- C/C++: `gcc:14`
- Java: `eclipse-temurin:21`
- Rust: `rust:1.82`

Setup command:

```powershell
.\scripts\setup-compilers.ps1
```

The sandbox runs with:

- network disabled
- one CPU
- 512 MB RAM
- 30 second timeout
- scoped project workspace mount
- command allowlist

## AI Provider Behavior

Provider mode defaults to `auto`.

Auto mode means:

- If a Gemini API key is supplied in the browser BYO field or server env, use Gemini.
- Otherwise use Ollama local models.

Gemini uses the official `generateContent` REST endpoint against:

- `gemini-2.5-flash`
- fallback `gemini-2.5-flash-lite`
- fallback `gemini-2.0-flash`

Real API keys are never committed. Keys pasted into chat should be treated as exposed and rotated.

## Free Deployment

The deployment guide is in:

```text
docs/FREE_DEPLOYMENT.md
```

Recommended beta setup:

- Frontend: Vercel free tier
- APIs: Render free tier
- Database: SQLite first
- Optional storage: Cloudflare R2 free tier later
- Optional hosted database: Supabase free tier later

## Verification Commands

```powershell
npm run lint
npm run build
npm run smoke
npm run browser-check
```

Current limitation: public multi-user beta should move code execution to separate worker machines before inviting untrusted users.
