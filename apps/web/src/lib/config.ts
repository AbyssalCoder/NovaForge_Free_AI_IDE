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
