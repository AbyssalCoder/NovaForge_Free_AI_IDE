import { chromium } from "playwright-core";

const executablePath =
  process.env.CHROME_PATH ||
  "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe";

const browser = await chromium.launch({
  executablePath,
  headless: true
});

const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
const consoleErrors = [];
page.on("console", (message) => {
  if (message.type() === "error") {
    const text = message.text();
    if (!text.includes("caret-color")) {
      consoleErrors.push(text);
    }
  }
});
page.on("pageerror", (error) => consoleErrors.push(error.message));

await page.goto("http://localhost:3000", { waitUntil: "domcontentloaded", timeout: 30_000 });
await page.getByText("Autonomous Agent").waitFor({ timeout: 30_000 });
await page.getByText("Gemini AI Studio").waitFor({ timeout: 30_000 });
await page.screenshot({ path: "logs/novaforge-preview.png", fullPage: false });

const body = await page.textContent("body");
const overlay = await page.locator("[data-nextjs-dialog]").count();
const required = ["NovaForge", "Home", "File", "View", "Run", "Autonomous Agent", "Terminal", "Live Preview", "Gemini AI Studio"];
const missing = required.filter((text) => !body?.includes(text));

await browser.close();

if (overlay > 0 || missing.length > 0 || consoleErrors.length > 0) {
  console.error(
    JSON.stringify(
      {
        ok: false,
        overlay,
        missing,
        consoleErrors: consoleErrors.slice(0, 5)
      },
      null,
      2
    )
  );
  process.exit(1);
}

console.log("Browser check passed: page renders key IDE panels with no captured console errors.");
