export const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8787";
export const WS_URL = process.env.NEXT_PUBLIC_WS_URL || "ws://localhost:8787/ws";

export const geminiStudioUrl = "https://aistudio.google.com/app/apikey";

export const demoFiles = {
  "app/page.tsx": `export default function Page() {
  return (
    <main>
      <h1>Hello from NovaForge</h1>
      <p>Ask the agent to turn this into a complete app.</p>
    </main>
  );
}
`,
  "styles.css": `body {
  background: #05070d;
  color: #e5f6ff;
  font-family: system-ui, sans-serif;
}
`
};

// Auth helpers
export function getAuthToken(): string | null {
  if (typeof window === "undefined") return null;
  return window.localStorage.getItem("novaforge_token");
}

export function setAuthToken(token: string) {
  window.localStorage.setItem("novaforge_token", token);
}

export function clearAuthToken() {
  window.localStorage.removeItem("novaforge_token");
}

export function authHeaders(): Record<string, string> {
  const token = getAuthToken();
  return token ? { authorization: `Bearer ${token}` } : {};
}

export async function apiFetch(path: string, options: RequestInit = {}) {
  const headers = { "content-type": "application/json", ...authHeaders(), ...(options.headers || {}) };
  const res = await fetch(`${API_URL}${path}`, { ...options, headers });
  return res;
}
