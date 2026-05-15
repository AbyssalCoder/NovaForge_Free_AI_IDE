const api = process.env.NOVAFORGE_API_URL || "http://127.0.0.1:8787";
const py = process.env.NOVAFORGE_PYTHON_URL || "http://127.0.0.1:8788";

async function check(name, url) {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`${name} failed: ${response.status} ${await response.text()}`);
  }
  const body = await response.json();
  console.log(`${name}: ok`, body);
}

await check("node-api", `${api}/health`);
await check("python-api", `${py}/health`);
console.log("NovaForge smoke test passed.");
