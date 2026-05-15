# Free Deployment Guide

NovaForge is designed to work on free tiers first.

## Frontend: Vercel Free Tier

1. Push the repository to GitHub.
2. Import the project in Vercel.
3. Set root directory to `apps/web`.
4. Add environment variables:

```env
NEXT_PUBLIC_API_URL=https://your-render-node-api.onrender.com
NEXT_PUBLIC_WS_URL=wss://your-render-node-api.onrender.com/ws
NEXTAUTH_URL=https://your-vercel-app.vercel.app
NEXTAUTH_SECRET=replace-with-random-secret
GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=
```

5. Deploy.

## Backend: Render Free Tier

Create two free web services:

### Node API

- Root directory: `services/api-node`
- Build command: `npm install && npm run build`
- Start command: `npm run start`
- Environment variables:

```env
NODE_API_PORT=8787
JWT_SECRET=replace-with-random-secret
SQLITE_PATH=./data/novaforge.db
WORKSPACE_ROOT=./workspaces
ALLOWED_ORIGINS=https://your-vercel-app.vercel.app
PYTHON_SERVICE_URL=https://your-python-api.onrender.com
OLLAMA_BASE_URL=http://127.0.0.1:11434
OLLAMA_MODEL=qwen2.5-coder:7b
GEMINI_API_KEYS=
OPENROUTER_API_KEY=
```

Render free instances may sleep. The browser UI should tolerate cold starts.

### Python API

- Root directory: `services/api-python`
- Build command: `pip install -r requirements.txt`
- Start command: `uvicorn main:app --host 0.0.0.0 --port $PORT`

## Database

Start with SQLite. For free public hosting, SQLite is best when:

- user count is low
- writes are modest
- single backend instance is enough

Optional future migration:

- Supabase free tier for hosted Postgres
- Keep migrations explicit
- Preserve local SQLite for offline development

## AI Providers

Fully free/local:

- Ollama on the user's own machine
- Qwen Coder or DeepSeek Coder local model

Free-tier optional:

- Gemini AI Studio BYO key
- OpenRouter free models when available

Never require paid keys to use NovaForge.

## Storage

Do not add cloud storage at first. Use local workspace folders.

Use Cloudflare R2 free tier later for:

- shared project archives
- uploaded assets
- template bundles

## Security Before Public Launch

- Put code execution in separate worker hosts.
- Use Docker rootless mode where possible.
- Disable network by default for untrusted runs.
- Add per-user rate limits and quotas.
- Run containers with read-only base filesystems.
- Keep workspace mount scoped to one project.
- Never forward host Docker socket to user-controlled code.
