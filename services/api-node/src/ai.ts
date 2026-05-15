import { config } from "./config.js";

type AgentInput = {
  provider: string;
  prompt: string;
  apiKey?: string;
  files?: Record<string, string>;
};

export type AgentResult = {
  message: string;
  steps: string[];
  files?: Record<string, string>;
};

export async function runAgent(input: AgentInput): Promise<AgentResult> {
  const provider = input.provider === "auto" ? pickAutoProvider(input.apiKey) : input.provider;

  // Always try AI first for structured code generation
  const system = [
    "You are NovaForge, an autonomous coding agent for a browser IDE.",
    "When asked to build something, respond with ACTUAL FILE CONTENTS.",
    "Format your response as a series of FILE blocks like this:",
    "===FILE: path/to/file.ext===",
    "file contents here",
    "===END FILE===",
    "After all files, add a brief summary line.",
    "Create complete, working, production-quality code.",
    "Use modern HTML5, CSS3, and vanilla JavaScript unless specified otherwise.",
    "Always include proper styling - make it look professional and polished."
  ].join("\n");

  const userPrompt = `${system}\n\nUser request:\n${input.prompt}\n\nExisting files:\n${Object.keys(input.files || {}).join(", ")}`;

  let result: AgentResult;

  if (provider === "gemini") {
    result = await callGemini(userPrompt, input.apiKey);
  } else if (provider === "openrouter" || provider === "deepseek") {
    result = await callOpenRouter(userPrompt, input.apiKey);
  } else {
    result = await callOllama(userPrompt);
  }

  // If AI returned files, use them; otherwise fall back to offline generator
  if (!result.files || Object.keys(result.files).length === 0) {
    const offlineResult = generateOfflineProject(input.prompt);
    result.files = offlineResult.files;
    result.steps = offlineResult.steps;
    result.message = offlineResult.message;
  }

  return result;
}

export function getProviderSummary() {
  return {
    defaultProvider: pickAutoProvider(),
    hasServerGeminiKey: config.geminiApiKeys.length > 0,
    hasOpenRouterKey: Boolean(config.openRouterApiKey),
    ollamaModel: config.ollamaModel,
    geminiModel: config.geminiModel,
    openRouterModel: config.openRouterModel
  };
}

function pickAutoProvider(browserKey?: string) {
  if (browserKey || config.geminiApiKeys.length > 0) return "gemini";
  return "ollama";
}

async function callOllama(prompt: string): Promise<AgentResult> {
  try {
    const response = await fetch(`${config.ollamaBaseUrl}/api/generate`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        model: config.ollamaModel,
        prompt,
        stream: false
      })
    });

    if (!response.ok) throw new Error(await response.text());
    const data = (await response.json()) as { response?: string };
    return parseAgentResponse(data.response || "");
  } catch {
    return {
      message: "Ollama is not running — using offline project generator.",
      steps: [],
      files: {}
    };
  }
}

async function callGemini(prompt: string, browserKey?: string): Promise<AgentResult> {
  const key = browserKey || config.geminiApiKeys[0];
  if (!key) {
    return {
      message: "Gemini selected, but no BYO key was provided.",
      steps: ["Open Gemini AI Studio, create a free API key, and paste it into the BYO key field."],
      files: {}
    };
  }

  const models = [...new Set([config.geminiModel, "gemini-2.5-flash-lite", "gemini-2.0-flash"])];
  const failures: string[] = [];

  for (const model of models) {
    const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${encodeURIComponent(key)}`;
    const response = await fetch(endpoint, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        contents: [{ role: "user", parts: [{ text: prompt }] }]
      })
    });
    if (!response.ok) {
      failures.push(`${model}: ${response.status} ${await response.text()}`);
      continue;
    }
    const data = (await response.json()) as {
      candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
    };
    return parseAgentResponse(data.candidates?.[0]?.content?.parts?.[0]?.text || "");
  }

  return {
    message: "Gemini request failed for all configured fallback models.",
    steps: failures.slice(0, 3),
    files: {}
  };
}

async function callOpenRouter(prompt: string, browserKey?: string): Promise<AgentResult> {
  const key = browserKey || config.openRouterApiKey;
  if (!key) {
    return {
      message: "OpenRouter/DeepSeek selected, but no BYO key was provided.",
      steps: ["Use Ollama for fully offline operation or paste a free-tier compatible key."],
      files: {}
    };
  }

  const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${key}`,
      "http-referer": "http://localhost:3000",
      "x-title": "NovaForge"
    },
    body: JSON.stringify({
      model: config.openRouterModel,
      messages: [{ role: "user", content: prompt }]
    })
  });
  if (!response.ok) {
    return { message: "OpenRouter request failed.", steps: [await response.text()], files: {} };
  }
  const data = (await response.json()) as { choices?: Array<{ message?: { content?: string } }> };
  return parseAgentResponse(data.choices?.[0]?.message?.content || "");
}

/** Parse AI text that may contain ===FILE: path=== blocks */
function parseAgentResponse(text: string): AgentResult {
  const files: Record<string, string> = {};
  const steps: string[] = [];
  const fileRegex = /===FILE:\s*(.+?)===\n([\s\S]*?)===END FILE===/g;
  let match: RegExpExecArray | null;

  while ((match = fileRegex.exec(text)) !== null) {
    const filePath = match[1].trim();
    files[filePath] = match[2].trimEnd();
    steps.push(`Created ${filePath}`);
  }

  // Extract summary (text outside file blocks)
  const summary = text.replace(fileRegex, "").trim().split("\n").filter(Boolean);
  const message = summary[0] || (Object.keys(files).length > 0 ? `Created ${Object.keys(files).length} files.` : "Agent generated a plan.");

  // If no file blocks found, try to extract from markdown code fences
  if (Object.keys(files).length === 0) {
    const fenceRegex = /```(\w+)?\s*\n([\s\S]*?)```/g;
    const fileNames: Record<string, string> = { html: "index.html", css: "style.css", javascript: "script.js", js: "script.js", python: "main.py", java: "Main.java", c: "main.c", cpp: "main.cpp", rust: "main.rs", typescript: "app.ts" };
    let fenceMatch: RegExpExecArray | null;
    while ((fenceMatch = fenceRegex.exec(text)) !== null) {
      const lang = fenceMatch[1] || "html";
      const name = fileNames[lang] || `file.${lang}`;
      if (!files[name]) {
        files[name] = fenceMatch[2].trimEnd();
        steps.push(`Created ${name}`);
      }
    }
  }

  return { message, steps, files };
}

// ── Offline Project Generator ─────────────────────────────────────
function generateOfflineProject(prompt: string): AgentResult {
  const lower = prompt.toLowerCase();

  if (lower.includes("ecommerce") || lower.includes("e-commerce") || lower.includes("shop") || lower.includes("store") || lower.includes("product")) {
    return generateEcommerce();
  }
  if (lower.includes("todo") || lower.includes("task")) {
    return generateTodo();
  }
  if (lower.includes("portfolio") || lower.includes("personal") || lower.includes("resume")) {
    return generatePortfolio();
  }
  if (lower.includes("landing") || lower.includes("homepage")) {
    return generateLandingPage();
  }
  if (lower.includes("calculator")) {
    return generateCalculator();
  }
  if (lower.includes("weather")) {
    return generateWeatherApp();
  }
  if (lower.includes("chat") || lower.includes("messenger")) {
    return generateChatUI();
  }
  if (lower.includes("dashboard") || lower.includes("admin panel")) {
    return generateDashboard();
  }

  // Default: generate based on detected language or HTML app
  if (lower.includes("python")) return generatePythonApp(prompt);
  if (lower.includes("java") && !lower.includes("javascript")) return generateJavaApp(prompt);
  if (lower.includes("rust")) return generateRustApp(prompt);
  if (lower.includes("c++") || lower.includes("cpp")) return generateCppApp(prompt);

  return generateGenericHTML(prompt);
}

function generateEcommerce(): AgentResult {
  const files: Record<string, string> = {
    "index.html": `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>ShopForge - Online Store</title>
  <link rel="stylesheet" href="style.css">
</head>
<body>
  <header class="header">
    <div class="container">
      <a href="#" class="logo">🛒 ShopForge</a>
      <nav>
        <a href="#products">Products</a>
        <a href="#categories">Categories</a>
        <a href="#" id="cart-btn" class="cart-btn">🛍️ Cart (<span id="cart-count">0</span>)</a>
      </nav>
    </div>
  </header>

  <section class="hero">
    <div class="container">
      <h1>Summer Sale — Up to 50% Off</h1>
      <p>Premium products at unbeatable prices. Free shipping on orders over ₹999.</p>
      <a href="#products" class="btn btn-primary">Shop Now</a>
    </div>
  </section>

  <section id="categories" class="categories">
    <div class="container">
      <h2>Shop by Category</h2>
      <div class="category-grid">
        <div class="category-card" onclick="filterCategory('electronics')">📱 Electronics</div>
        <div class="category-card" onclick="filterCategory('clothing')">👕 Clothing</div>
        <div class="category-card" onclick="filterCategory('books')">📚 Books</div>
        <div class="category-card" onclick="filterCategory('home')">🏠 Home & Living</div>
      </div>
    </div>
  </section>

  <section id="products" class="products">
    <div class="container">
      <div class="products-header">
        <h2>Featured Products</h2>
        <div class="search-bar">
          <input type="text" id="search" placeholder="Search products..." oninput="searchProducts()">
        </div>
      </div>
      <div class="product-grid" id="product-grid"></div>
    </div>
  </section>

  <div id="cart-modal" class="modal hidden">
    <div class="modal-content">
      <div class="modal-header">
        <h2>Your Cart</h2>
        <button onclick="closeCart()" class="close-btn">&times;</button>
      </div>
      <div id="cart-items"></div>
      <div class="cart-footer">
        <div class="cart-total">Total: ₹<span id="cart-total">0</span></div>
        <button class="btn btn-primary" onclick="checkout()">Checkout</button>
      </div>
    </div>
  </div>

  <footer class="footer">
    <div class="container">
      <p>&copy; 2026 ShopForge. Built with NovaForge.</p>
    </div>
  </footer>

  <div id="toast" class="toast hidden"></div>
  <script src="script.js"></script>
</body>
</html>`,

    "style.css": `* { margin: 0; padding: 0; box-sizing: border-box; }
:root {
  --primary: #00e5ff;
  --bg: #0a0e17;
  --surface: #111827;
  --surface2: #1e293b;
  --text: #e2e8f0;
  --text-dim: #94a3b8;
  --accent: #f59e0b;
  --success: #10b981;
  --danger: #ef4444;
  --radius: 12px;
}
body { font-family: 'Segoe UI', system-ui, sans-serif; background: var(--bg); color: var(--text); line-height: 1.6; }
.container { max-width: 1200px; margin: 0 auto; padding: 0 20px; }
a { color: var(--primary); text-decoration: none; }
.btn { display: inline-block; padding: 12px 28px; border-radius: var(--radius); font-weight: 600; border: none; cursor: pointer; transition: all 0.3s; font-size: 1rem; }
.btn-primary { background: var(--primary); color: var(--bg); }
.btn-primary:hover { background: #00b8d4; transform: translateY(-2px); box-shadow: 0 4px 20px rgba(0,229,255,0.3); }

.header { background: var(--surface); border-bottom: 1px solid var(--surface2); padding: 16px 0; position: sticky; top: 0; z-index: 100; backdrop-filter: blur(10px); }
.header .container { display: flex; align-items: center; justify-content: space-between; }
.logo { font-size: 1.5rem; font-weight: 700; color: var(--primary); }
.header nav { display: flex; gap: 24px; align-items: center; }
.header nav a { color: var(--text-dim); transition: color 0.3s; }
.header nav a:hover { color: var(--primary); }
.cart-btn { background: var(--surface2); padding: 8px 16px; border-radius: var(--radius); color: var(--primary) !important; }

.hero { padding: 100px 0; text-align: center; background: linear-gradient(135deg, var(--surface) 0%, var(--bg) 100%); }
.hero h1 { font-size: 3rem; margin-bottom: 16px; background: linear-gradient(90deg, var(--primary), var(--accent)); -webkit-background-clip: text; -webkit-text-fill-color: transparent; }
.hero p { font-size: 1.2rem; color: var(--text-dim); margin-bottom: 32px; }

.categories { padding: 60px 0; }
.categories h2 { text-align: center; margin-bottom: 32px; font-size: 2rem; }
.category-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 20px; }
.category-card { background: var(--surface); border: 1px solid var(--surface2); border-radius: var(--radius); padding: 32px; text-align: center; font-size: 1.2rem; cursor: pointer; transition: all 0.3s; }
.category-card:hover { border-color: var(--primary); transform: translateY(-4px); box-shadow: 0 8px 30px rgba(0,229,255,0.15); }

.products { padding: 60px 0; }
.products-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 32px; flex-wrap: wrap; gap: 16px; }
.products-header h2 { font-size: 2rem; }
.search-bar input { background: var(--surface); border: 1px solid var(--surface2); border-radius: var(--radius); padding: 10px 20px; color: var(--text); font-size: 1rem; width: 300px; outline: none; transition: border-color 0.3s; }
.search-bar input:focus { border-color: var(--primary); }

.product-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(260px, 1fr)); gap: 24px; }
.product-card { background: var(--surface); border: 1px solid var(--surface2); border-radius: var(--radius); overflow: hidden; transition: all 0.3s; }
.product-card:hover { transform: translateY(-4px); box-shadow: 0 8px 30px rgba(0,0,0,0.3); border-color: var(--primary); }
.product-img { width: 100%; height: 200px; background: var(--surface2); display: flex; align-items: center; justify-content: center; font-size: 4rem; }
.product-info { padding: 20px; }
.product-info h3 { margin-bottom: 8px; font-size: 1.1rem; }
.product-info .category-tag { display: inline-block; background: var(--primary); color: var(--bg); padding: 2px 10px; border-radius: 20px; font-size: 0.75rem; margin-bottom: 8px; }
.product-info .price { font-size: 1.4rem; font-weight: 700; color: var(--accent); margin-bottom: 4px; }
.product-info .old-price { font-size: 0.9rem; color: var(--text-dim); text-decoration: line-through; margin-bottom: 12px; }
.product-info .rating { color: var(--accent); margin-bottom: 12px; font-size: 0.9rem; }
.add-to-cart { width: 100%; padding: 10px; background: var(--primary); color: var(--bg); border: none; border-radius: 8px; font-weight: 600; cursor: pointer; transition: background 0.3s; }
.add-to-cart:hover { background: #00b8d4; }

.modal { position: fixed; inset: 0; background: rgba(0,0,0,0.7); display: flex; align-items: center; justify-content: center; z-index: 200; }
.modal.hidden { display: none; }
.modal-content { background: var(--surface); border: 1px solid var(--surface2); border-radius: var(--radius); padding: 24px; width: 90%; max-width: 500px; max-height: 80vh; overflow-y: auto; }
.modal-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px; }
.close-btn { background: none; border: none; color: var(--text-dim); font-size: 1.5rem; cursor: pointer; }
.cart-item { display: flex; justify-content: space-between; align-items: center; padding: 12px 0; border-bottom: 1px solid var(--surface2); }
.cart-item-info { flex: 1; }
.cart-item-info h4 { margin-bottom: 4px; }
.cart-item-qty { display: flex; align-items: center; gap: 8px; }
.cart-item-qty button { width: 28px; height: 28px; border-radius: 50%; border: 1px solid var(--surface2); background: var(--surface2); color: var(--text); cursor: pointer; }
.cart-item-remove { background: none; border: none; color: var(--danger); cursor: pointer; font-size: 1.2rem; margin-left: 12px; }
.cart-footer { margin-top: 20px; display: flex; justify-content: space-between; align-items: center; }
.cart-total { font-size: 1.3rem; font-weight: 700; color: var(--accent); }

.footer { padding: 32px 0; text-align: center; border-top: 1px solid var(--surface2); margin-top: 60px; color: var(--text-dim); }

.toast { position: fixed; bottom: 24px; right: 24px; background: var(--success); color: #fff; padding: 12px 24px; border-radius: var(--radius); font-weight: 600; z-index: 300; transition: opacity 0.3s, transform 0.3s; }
.toast.hidden { opacity: 0; transform: translateY(20px); pointer-events: none; }

@media (max-width: 768px) {
  .hero h1 { font-size: 2rem; }
  .products-header { flex-direction: column; align-items: stretch; }
  .search-bar input { width: 100%; }
}`,

    "script.js": `const products = [
  { id: 1, name: "Wireless Earbuds Pro", price: 2499, oldPrice: 4999, category: "electronics", emoji: "🎧", rating: 4.5, reviews: 234 },
  { id: 2, name: "Smart Watch Ultra", price: 3999, oldPrice: 7999, category: "electronics", emoji: "⌚", rating: 4.7, reviews: 189 },
  { id: 3, name: "Classic Cotton T-Shirt", price: 599, oldPrice: 1199, category: "clothing", emoji: "👕", rating: 4.2, reviews: 567 },
  { id: 4, name: "Denim Jacket", price: 1999, oldPrice: 3499, category: "clothing", emoji: "🧥", rating: 4.4, reviews: 123 },
  { id: 5, name: "JavaScript: The Good Parts", price: 449, oldPrice: 699, category: "books", emoji: "📘", rating: 4.8, reviews: 891 },
  { id: 6, name: "Clean Code", price: 549, oldPrice: 899, category: "books", emoji: "📗", rating: 4.9, reviews: 1203 },
  { id: 7, name: "LED Desk Lamp", price: 899, oldPrice: 1599, category: "home", emoji: "💡", rating: 4.3, reviews: 345 },
  { id: 8, name: "Ceramic Plant Pot Set", price: 749, oldPrice: 1299, category: "home", emoji: "🪴", rating: 4.6, reviews: 210 },
  { id: 9, name: "Bluetooth Speaker", price: 1499, oldPrice: 2999, category: "electronics", emoji: "🔊", rating: 4.4, reviews: 432 },
  { id: 10, name: "Running Shoes", price: 2799, oldPrice: 4999, category: "clothing", emoji: "👟", rating: 4.6, reviews: 678 },
  { id: 11, name: "Scented Candle Set", price: 399, oldPrice: 799, category: "home", emoji: "🕯️", rating: 4.1, reviews: 156 },
  { id: 12, name: "Python Crash Course", price: 499, oldPrice: 849, category: "books", emoji: "📕", rating: 4.7, reviews: 934 }
];

let cart = [];
let activeFilter = "all";

function renderProducts(filter = "all", search = "") {
  const grid = document.getElementById("product-grid");
  let filtered = products;
  if (filter !== "all") filtered = filtered.filter(p => p.category === filter);
  if (search) filtered = filtered.filter(p => p.name.toLowerCase().includes(search.toLowerCase()));

  grid.innerHTML = filtered.map(p => \`
    <div class="product-card">
      <div class="product-img">\${p.emoji}</div>
      <div class="product-info">
        <span class="category-tag">\${p.category}</span>
        <h3>\${p.name}</h3>
        <div class="rating">\${"★".repeat(Math.floor(p.rating))}\${"☆".repeat(5 - Math.floor(p.rating))} \${p.rating} (\${p.reviews})</div>
        <div class="price">₹\${p.price.toLocaleString()}</div>
        <div class="old-price">₹\${p.oldPrice.toLocaleString()}</div>
        <button class="add-to-cart" onclick="addToCart(\${p.id})">Add to Cart</button>
      </div>
    </div>
  \`).join("");
}

function addToCart(id) {
  const product = products.find(p => p.id === id);
  const existing = cart.find(item => item.id === id);
  if (existing) { existing.qty++; }
  else { cart.push({ ...product, qty: 1 }); }
  updateCartCount();
  showToast(\`\${product.name} added to cart!\`);
}

function removeFromCart(id) {
  cart = cart.filter(item => item.id !== id);
  updateCartCount();
  renderCart();
}

function changeQty(id, delta) {
  const item = cart.find(i => i.id === id);
  if (!item) return;
  item.qty += delta;
  if (item.qty <= 0) { removeFromCart(id); return; }
  updateCartCount();
  renderCart();
}

function updateCartCount() {
  document.getElementById("cart-count").textContent = cart.reduce((sum, item) => sum + item.qty, 0);
}

function renderCart() {
  const container = document.getElementById("cart-items");
  if (cart.length === 0) {
    container.innerHTML = '<p style="text-align:center;color:var(--text-dim);padding:32px;">Your cart is empty</p>';
  } else {
    container.innerHTML = cart.map(item => \`
      <div class="cart-item">
        <div class="cart-item-info">
          <h4>\${item.emoji} \${item.name}</h4>
          <span style="color:var(--accent);">₹\${(item.price * item.qty).toLocaleString()}</span>
        </div>
        <div class="cart-item-qty">
          <button onclick="changeQty(\${item.id}, -1)">−</button>
          <span>\${item.qty}</span>
          <button onclick="changeQty(\${item.id}, 1)">+</button>
        </div>
        <button class="cart-item-remove" onclick="removeFromCart(\${item.id})">✕</button>
      </div>
    \`).join("");
  }
  document.getElementById("cart-total").textContent = cart.reduce((sum, item) => sum + item.price * item.qty, 0).toLocaleString();
}

function openCart() { document.getElementById("cart-modal").classList.remove("hidden"); renderCart(); }
function closeCart() { document.getElementById("cart-modal").classList.add("hidden"); }

document.getElementById("cart-btn").addEventListener("click", (e) => { e.preventDefault(); openCart(); });

function filterCategory(cat) {
  activeFilter = cat;
  renderProducts(cat);
  document.getElementById("products").scrollIntoView({ behavior: "smooth" });
}

function searchProducts() {
  const query = document.getElementById("search").value;
  renderProducts(activeFilter, query);
}

function showToast(message) {
  const toast = document.getElementById("toast");
  toast.textContent = message;
  toast.classList.remove("hidden");
  setTimeout(() => toast.classList.add("hidden"), 2500);
}

function checkout() {
  if (cart.length === 0) { showToast("Cart is empty!"); return; }
  const total = cart.reduce((sum, item) => sum + item.price * item.qty, 0);
  showToast(\`Order placed! Total: ₹\${total.toLocaleString()}\`);
  cart = [];
  updateCartCount();
  closeCart();
}

// Initial render
renderProducts();`
  };

  return {
    message: "Built a complete ecommerce storefront with product catalog, cart, and checkout.",
    steps: [
      "Created index.html — storefront with header, hero, categories, products grid, cart modal",
      "Created style.css — dark theme, responsive grid, animations, mobile-friendly",
      "Created script.js — product rendering, cart management, search, category filters, checkout"
    ],
    files
  };
}

function generateTodo(): AgentResult {
  const files: Record<string, string> = {
    "index.html": `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>TaskForge - Todo App</title>
  <link rel="stylesheet" href="style.css">
</head>
<body>
  <div class="app">
    <header><h1>✅ TaskForge</h1><p class="subtitle">Stay productive, stay focused</p></header>
    <div class="input-group">
      <input type="text" id="task-input" placeholder="What needs to be done?" autofocus>
      <select id="priority"><option value="low">Low</option><option value="medium" selected>Medium</option><option value="high">High</option></select>
      <button onclick="addTask()" id="add-btn">Add</button>
    </div>
    <div class="filters">
      <button class="filter active" onclick="setFilter('all', this)">All</button>
      <button class="filter" onclick="setFilter('active', this)">Active</button>
      <button class="filter" onclick="setFilter('completed', this)">Done</button>
    </div>
    <ul id="task-list"></ul>
    <div class="stats">
      <span id="stats"></span>
      <button onclick="clearCompleted()" class="clear-btn">Clear Done</button>
    </div>
  </div>
  <script src="script.js"></script>
</body>
</html>`,
    "style.css": `* { margin: 0; padding: 0; box-sizing: border-box; }
:root { --primary: #00e5ff; --bg: #0a0e17; --surface: #111827; --surface2: #1e293b; --text: #e2e8f0; --dim: #94a3b8; --success: #10b981; --warning: #f59e0b; --danger: #ef4444; }
body { font-family: 'Segoe UI', system-ui, sans-serif; background: var(--bg); color: var(--text); min-height: 100vh; display: flex; justify-content: center; padding: 40px 16px; }
.app { width: 100%; max-width: 600px; }
header { text-align: center; margin-bottom: 32px; }
header h1 { font-size: 2.5rem; background: linear-gradient(90deg, var(--primary), var(--success)); -webkit-background-clip: text; -webkit-text-fill-color: transparent; }
.subtitle { color: var(--dim); margin-top: 4px; }
.input-group { display: flex; gap: 8px; margin-bottom: 16px; }
.input-group input { flex: 1; background: var(--surface); border: 1px solid var(--surface2); border-radius: 10px; padding: 12px 16px; color: var(--text); font-size: 1rem; outline: none; }
.input-group input:focus { border-color: var(--primary); }
.input-group select { background: var(--surface); border: 1px solid var(--surface2); border-radius: 10px; padding: 8px; color: var(--text); outline: none; }
#add-btn { background: var(--primary); color: var(--bg); border: none; padding: 12px 24px; border-radius: 10px; font-weight: 600; cursor: pointer; }
#add-btn:hover { background: #00b8d4; }
.filters { display: flex; gap: 8px; margin-bottom: 16px; }
.filter { background: var(--surface); border: 1px solid var(--surface2); color: var(--dim); padding: 8px 16px; border-radius: 8px; cursor: pointer; }
.filter.active { background: var(--primary); color: var(--bg); border-color: var(--primary); font-weight: 600; }
ul { list-style: none; }
.task { display: flex; align-items: center; gap: 12px; background: var(--surface); border: 1px solid var(--surface2); border-radius: 10px; padding: 14px; margin-bottom: 8px; transition: all 0.3s; }
.task:hover { border-color: var(--primary); }
.task.done { opacity: 0.5; }
.task.done .task-text { text-decoration: line-through; }
.task input[type=checkbox] { width: 20px; height: 20px; accent-color: var(--primary); cursor: pointer; }
.task-text { flex: 1; }
.priority { font-size: 0.7rem; padding: 2px 8px; border-radius: 12px; font-weight: 600; text-transform: uppercase; }
.priority.high { background: rgba(239,68,68,0.2); color: var(--danger); }
.priority.medium { background: rgba(245,158,11,0.2); color: var(--warning); }
.priority.low { background: rgba(16,185,129,0.2); color: var(--success); }
.delete-btn { background: none; border: none; color: var(--dim); cursor: pointer; font-size: 1.2rem; padding: 4px; }
.delete-btn:hover { color: var(--danger); }
.stats { display: flex; justify-content: space-between; align-items: center; padding: 12px; color: var(--dim); font-size: 0.9rem; }
.clear-btn { background: none; border: 1px solid var(--surface2); color: var(--dim); padding: 6px 14px; border-radius: 8px; cursor: pointer; }
.clear-btn:hover { border-color: var(--danger); color: var(--danger); }`,
    "script.js": `let tasks = JSON.parse(localStorage.getItem("tasks") || "[]");
let filter = "all";

function save() { localStorage.setItem("tasks", JSON.stringify(tasks)); }

function addTask() {
  const input = document.getElementById("task-input");
  const text = input.value.trim();
  if (!text) return;
  tasks.push({ id: Date.now(), text, priority: document.getElementById("priority").value, done: false });
  input.value = "";
  save(); render();
}

document.getElementById("task-input").addEventListener("keydown", e => { if (e.key === "Enter") addTask(); });

function toggleTask(id) { const t = tasks.find(t => t.id === id); if (t) t.done = !t.done; save(); render(); }
function deleteTask(id) { tasks = tasks.filter(t => t.id !== id); save(); render(); }
function clearCompleted() { tasks = tasks.filter(t => !t.done); save(); render(); }
function setFilter(f, btn) { filter = f; document.querySelectorAll(".filter").forEach(b => b.classList.remove("active")); btn.classList.add("active"); render(); }

function render() {
  const list = document.getElementById("task-list");
  let filtered = tasks;
  if (filter === "active") filtered = tasks.filter(t => !t.done);
  if (filter === "completed") filtered = tasks.filter(t => t.done);
  const priorityOrder = { high: 0, medium: 1, low: 2 };
  filtered.sort((a, b) => a.done - b.done || priorityOrder[a.priority] - priorityOrder[b.priority]);

  list.innerHTML = filtered.map(t => \`
    <li class="task \${t.done ? "done" : ""}">
      <input type="checkbox" \${t.done ? "checked" : ""} onchange="toggleTask(\${t.id})">
      <span class="task-text">\${t.text}</span>
      <span class="priority \${t.priority}">\${t.priority}</span>
      <button class="delete-btn" onclick="deleteTask(\${t.id})">✕</button>
    </li>
  \`).join("");

  const active = tasks.filter(t => !t.done).length;
  document.getElementById("stats").textContent = \`\${active} task\${active !== 1 ? "s" : ""} remaining\`;
}

render();`
  };
  return {
    message: "Built a complete todo app with priorities, filters, and local storage persistence.",
    steps: ["Created index.html — task input, filters, task list", "Created style.css — dark theme, priority colors, responsive", "Created script.js — CRUD, localStorage, filtering, priority sorting"],
    files
  };
}

function generatePortfolio(): AgentResult {
  const files: Record<string, string> = {
    "index.html": `<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"><title>My Portfolio</title><link rel="stylesheet" href="style.css"></head>
<body>
  <nav><div class="container"><a href="#" class="logo">Portfolio</a><div class="nav-links"><a href="#about">About</a><a href="#skills">Skills</a><a href="#projects">Projects</a><a href="#contact">Contact</a></div></div></nav>
  <section class="hero"><div class="container"><h1>Hi, I'm <span class="highlight">Your Name</span></h1><p>Full-Stack Developer | Open Source Enthusiast</p><a href="#projects" class="btn">View My Work</a></div></section>
  <section id="about" class="section"><div class="container"><h2>About Me</h2><p>Passionate developer with experience in modern web technologies. I love building elegant solutions to complex problems.</p></div></section>
  <section id="skills" class="section dark"><div class="container"><h2>Skills</h2><div class="skill-grid"><div class="skill-card">⚛️<h3>React</h3></div><div class="skill-card">▲<h3>Next.js</h3></div><div class="skill-card">🟢<h3>Node.js</h3></div><div class="skill-card">🐍<h3>Python</h3></div><div class="skill-card">🗄️<h3>PostgreSQL</h3></div><div class="skill-card">🐳<h3>Docker</h3></div></div></div></section>
  <section id="projects" class="section"><div class="container"><h2>Projects</h2><div class="project-grid"><div class="project-card"><h3>🛒 E-Commerce Platform</h3><p>Full-stack store with payment integration</p><div class="tags"><span>React</span><span>Node.js</span><span>Stripe</span></div></div><div class="project-card"><h3>📊 Analytics Dashboard</h3><p>Real-time data visualization tool</p><div class="tags"><span>Next.js</span><span>D3.js</span><span>PostgreSQL</span></div></div><div class="project-card"><h3>🤖 AI Chat Bot</h3><p>NLP-powered customer support bot</p><div class="tags"><span>Python</span><span>FastAPI</span><span>GPT</span></div></div></div></div></section>
  <section id="contact" class="section dark"><div class="container"><h2>Get In Touch</h2><form class="contact-form"><input type="text" placeholder="Name" required><input type="email" placeholder="Email" required><textarea placeholder="Message" rows="5" required></textarea><button type="submit" class="btn">Send Message</button></form></div></section>
  <footer><p>&copy; 2026 Your Name. Built with NovaForge.</p></footer>
</body></html>`,
    "style.css": `*{margin:0;padding:0;box-sizing:border-box}:root{--primary:#00e5ff;--bg:#0a0e17;--surface:#111827;--surface2:#1e293b;--text:#e2e8f0;--dim:#94a3b8}body{font-family:'Segoe UI',system-ui,sans-serif;background:var(--bg);color:var(--text);line-height:1.6}
.container{max-width:1000px;margin:0 auto;padding:0 20px}.highlight{color:var(--primary)}.btn{display:inline-block;padding:12px 28px;background:var(--primary);color:var(--bg);border:none;border-radius:10px;font-weight:600;cursor:pointer;text-decoration:none;transition:all .3s}.btn:hover{background:#00b8d4;transform:translateY(-2px)}
nav{background:var(--surface);padding:16px 0;position:sticky;top:0;z-index:100;border-bottom:1px solid var(--surface2)}nav .container{display:flex;justify-content:space-between;align-items:center}.logo{color:var(--primary);font-size:1.3rem;font-weight:700;text-decoration:none}.nav-links{display:flex;gap:24px}.nav-links a{color:var(--dim);text-decoration:none}.nav-links a:hover{color:var(--primary)}
.hero{padding:120px 0;text-align:center}.hero h1{font-size:3rem;margin-bottom:12px}.hero p{color:var(--dim);font-size:1.2rem;margin-bottom:32px}
.section{padding:80px 0}.section h2{font-size:2rem;text-align:center;margin-bottom:40px}.dark{background:var(--surface)}
.skill-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(140px,1fr));gap:20px}.skill-card{background:var(--surface2);padding:24px;text-align:center;border-radius:12px;font-size:2rem;transition:transform .3s}.skill-card:hover{transform:translateY(-4px)}.skill-card h3{font-size:.9rem;margin-top:8px}
.project-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(280px,1fr));gap:24px}.project-card{background:var(--surface);border:1px solid var(--surface2);border-radius:12px;padding:24px;transition:all .3s}.project-card:hover{border-color:var(--primary);transform:translateY(-4px)}.project-card h3{margin-bottom:8px}.project-card p{color:var(--dim);margin-bottom:12px}.tags{display:flex;gap:8px;flex-wrap:wrap}.tags span{background:var(--surface2);padding:4px 10px;border-radius:6px;font-size:.8rem;color:var(--primary)}
.contact-form{max-width:500px;margin:0 auto;display:flex;flex-direction:column;gap:12px}.contact-form input,.contact-form textarea{background:var(--bg);border:1px solid var(--surface2);border-radius:10px;padding:12px;color:var(--text);font-size:1rem;outline:none}.contact-form input:focus,.contact-form textarea:focus{border-color:var(--primary)}
footer{text-align:center;padding:32px;color:var(--dim);border-top:1px solid var(--surface2)}`
  };
  return {
    message: "Built a professional developer portfolio with about, skills, projects, and contact sections.",
    steps: ["Created index.html — hero, about, skills grid, projects, contact form", "Created style.css — dark theme, responsive, hover animations"],
    files
  };
}

function generateLandingPage(): AgentResult {
  const files: Record<string, string> = {
    "index.html": `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"><title>Landing Page</title><link rel="stylesheet" href="style.css"></head>
<body><header><div class="container"><a class="logo">🚀 Product</a><nav><a href="#features">Features</a><a href="#pricing">Pricing</a><a href="#" class="btn-sm">Get Started</a></nav></div></header>
<section class="hero"><div class="container"><h1>Build something <span>amazing</span></h1><p>The all-in-one platform for modern teams. Ship faster, collaborate better.</p><div class="cta-group"><a class="btn">Start Free Trial</a><a class="btn btn-outline">Watch Demo</a></div></div></section>
<section id="features" class="features"><div class="container"><h2>Features</h2><div class="grid"><div class="card">⚡<h3>Lightning Fast</h3><p>Built for speed from the ground up.</p></div><div class="card">🔒<h3>Secure</h3><p>Enterprise-grade security by default.</p></div><div class="card">📊<h3>Analytics</h3><p>Real-time insights at your fingertips.</p></div></div></div></section>
<section id="pricing" class="pricing"><div class="container"><h2>Pricing</h2><div class="grid"><div class="card"><h3>Free</h3><div class="price">$0</div><ul><li>✓ 3 Projects</li><li>✓ Basic Analytics</li><li>✓ Community Support</li></ul><a class="btn btn-outline">Get Started</a></div><div class="card featured"><h3>Pro</h3><div class="price">$19/mo</div><ul><li>✓ Unlimited Projects</li><li>✓ Advanced Analytics</li><li>✓ Priority Support</li><li>✓ Custom Domains</li></ul><a class="btn">Start Free Trial</a></div></div></div></section>
<footer><p>&copy; 2026 Product. Built with NovaForge.</p></footer></body></html>`,
    "style.css": `*{margin:0;padding:0;box-sizing:border-box}:root{--primary:#00e5ff;--bg:#0a0e17;--surface:#111827;--surface2:#1e293b;--text:#e2e8f0;--dim:#94a3b8}body{font-family:'Segoe UI',system-ui,sans-serif;background:var(--bg);color:var(--text)}
.container{max-width:1000px;margin:0 auto;padding:0 20px}a{text-decoration:none;color:var(--primary)}
.btn{display:inline-block;padding:12px 28px;background:var(--primary);color:var(--bg);border-radius:10px;font-weight:600;transition:all .3s}.btn:hover{background:#00b8d4;transform:translateY(-2px)}.btn-outline{background:transparent;border:1px solid var(--primary);color:var(--primary)}.btn-sm{padding:8px 16px;font-size:.9rem}
header{padding:16px 0;border-bottom:1px solid var(--surface2);position:sticky;top:0;background:var(--bg);z-index:100}header .container{display:flex;justify-content:space-between;align-items:center}.logo{font-size:1.3rem;font-weight:700;color:var(--primary)}header nav{display:flex;gap:20px;align-items:center}header nav a{color:var(--dim)}
.hero{padding:120px 0;text-align:center}.hero h1{font-size:3.5rem;margin-bottom:16px}.hero h1 span{color:var(--primary)}.hero p{color:var(--dim);font-size:1.2rem;margin-bottom:32px;max-width:600px;margin-left:auto;margin-right:auto}.cta-group{display:flex;gap:12px;justify-content:center}
.features,.pricing{padding:80px 0}.features h2,.pricing h2{text-align:center;font-size:2rem;margin-bottom:40px}.grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(260px,1fr));gap:24px}.card{background:var(--surface);border:1px solid var(--surface2);border-radius:12px;padding:32px;text-align:center;transition:all .3s}.card:hover{border-color:var(--primary);transform:translateY(-4px)}.card h3{margin:12px 0 8px}.card p,.card li{color:var(--dim)}.card ul{list-style:none;text-align:left;margin:16px 0}.card li{padding:8px 0;border-bottom:1px solid var(--surface2)}.card .price{font-size:2.5rem;font-weight:700;color:var(--primary);margin:12px 0}.card.featured{border-color:var(--primary);background:linear-gradient(135deg,var(--surface),var(--surface2))}
footer{padding:32px;text-align:center;color:var(--dim);border-top:1px solid var(--surface2);margin-top:40px}`
  };
  return {
    message: "Built a modern SaaS landing page with hero, features, and pricing sections.",
    steps: ["Created index.html — hero, features, pricing tiers", "Created style.css — dark theme, responsive, featured card highlight"],
    files
  };
}

function generateCalculator(): AgentResult {
  const files: Record<string, string> = {
    "index.html": `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"><title>Calculator</title><link rel="stylesheet" href="style.css"></head>
<body><div class="calc"><div class="display"><div class="prev" id="prev"></div><div class="current" id="current">0</div></div>
<div class="buttons"><button class="span-2 op" onclick="clearAll()">AC</button><button class="op" onclick="del()">⌫</button><button class="op" onclick="op('/')">÷</button>
<button onclick="num('7')">7</button><button onclick="num('8')">8</button><button onclick="num('9')">9</button><button class="op" onclick="op('*')">×</button>
<button onclick="num('4')">4</button><button onclick="num('5')">5</button><button onclick="num('6')">6</button><button class="op" onclick="op('-')">−</button>
<button onclick="num('1')">1</button><button onclick="num('2')">2</button><button onclick="num('3')">3</button><button class="op" onclick="op('+')">+</button>
<button class="span-2" onclick="num('0')">0</button><button onclick="num('.')">.</button><button class="eq" onclick="eq()">=</button></div></div>
<script src="script.js"></script></body></html>`,
    "style.css": `*{margin:0;padding:0;box-sizing:border-box}body{font-family:'Segoe UI',system-ui,sans-serif;background:#0a0e17;min-height:100vh;display:flex;align-items:center;justify-content:center}
.calc{width:320px;background:#111827;border-radius:16px;overflow:hidden;border:1px solid #1e293b;box-shadow:0 20px 60px rgba(0,0,0,.5)}
.display{padding:24px;text-align:right;min-height:100px;display:flex;flex-direction:column;justify-content:flex-end}.prev{color:#94a3b8;font-size:.9rem;min-height:1.2em}.current{color:#e2e8f0;font-size:2.5rem;font-weight:700;word-break:break-all}
.buttons{display:grid;grid-template-columns:repeat(4,1fr);gap:1px;background:#1e293b}button{background:#111827;border:none;color:#e2e8f0;font-size:1.3rem;padding:20px;cursor:pointer;transition:background .15s}button:hover{background:#1e293b}
.op{color:#00e5ff}.eq{background:#00e5ff;color:#0a0e17;font-weight:700}.eq:hover{background:#00b8d4}.span-2{grid-column:span 2}`,
    "script.js": `let current="0",prev="",operator="";const $c=document.getElementById("current"),$p=document.getElementById("prev");
function update(){$c.textContent=current;$p.textContent=prev+(operator?{"/":"÷","*":"×","-":"−","+":"+"}[operator]:"")}
function num(n){if(n==="."&&current.includes("."))return;current=current==="0"&&n!=="."?n:current+n;update()}
function op(o){if(operator&&prev)eq();prev=current;current="0";operator=o;update()}
function eq(){if(!operator||!prev)return;const a=parseFloat(prev),b=parseFloat(current);let r;if(operator==="+")r=a+b;else if(operator==="-")r=a-b;else if(operator==="*")r=a*b;else{if(b===0){current="Error";prev="";operator="";update();return}r=a/b}
current=String(Math.round(r*1e10)/1e10);prev="";operator="";update()}
function clearAll(){current="0";prev="";operator="";update()}function del(){current=current.length>1?current.slice(0,-1):"0";update()}`
  };
  return { message: "Built a sleek calculator with full arithmetic operations.", steps: ["Created index.html — calculator layout", "Created style.css — dark glass theme", "Created script.js — arithmetic engine"], files };
}

function generateWeatherApp(): AgentResult {
  const files: Record<string, string> = {
    "index.html": `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"><title>Weather App</title><link rel="stylesheet" href="style.css"></head>
<body><div class="app"><h1>🌤️ WeatherForge</h1>
<div class="search"><input type="text" id="city" placeholder="Enter city name..." value="London"><button onclick="getWeather()">Search</button></div>
<div id="weather" class="weather-card hidden">
  <h2 id="city-name"></h2><div class="temp" id="temp"></div><div class="desc" id="desc"></div>
  <div class="details"><div><span>💧</span><span id="humidity"></span><small>Humidity</small></div><div><span>💨</span><span id="wind"></span><small>Wind</small></div><div><span>👁️</span><span id="visibility"></span><small>Visibility</small></div></div>
</div>
<div id="forecast" class="forecast"></div>
<p class="note">Demo mode — showing simulated weather data</p>
</div><script src="script.js"></script></body></html>`,
    "style.css": `*{margin:0;padding:0;box-sizing:border-box}body{font-family:'Segoe UI',system-ui,sans-serif;background:#0a0e17;color:#e2e8f0;min-height:100vh;display:flex;justify-content:center;padding:40px 16px}
.app{width:100%;max-width:500px;text-align:center}.app h1{font-size:2rem;margin-bottom:24px;color:#00e5ff}
.search{display:flex;gap:8px;margin-bottom:24px}.search input{flex:1;background:#111827;border:1px solid #1e293b;border-radius:10px;padding:12px;color:#e2e8f0;font-size:1rem;outline:none}.search input:focus{border-color:#00e5ff}.search button{background:#00e5ff;color:#0a0e17;border:none;padding:12px 20px;border-radius:10px;font-weight:600;cursor:pointer}
.weather-card{background:#111827;border:1px solid #1e293b;border-radius:16px;padding:32px;margin-bottom:24px}.weather-card.hidden{display:none}.weather-card h2{font-size:1.5rem;margin-bottom:8px}.temp{font-size:4rem;font-weight:700;color:#00e5ff}.desc{color:#94a3b8;text-transform:capitalize;margin-bottom:20px;font-size:1.1rem}
.details{display:flex;justify-content:space-around}.details>div{display:flex;flex-direction:column;align-items:center;gap:4px}.details span:first-child{font-size:1.5rem}.details small{color:#94a3b8;font-size:.8rem}
.forecast{display:grid;grid-template-columns:repeat(5,1fr);gap:8px}.forecast .day{background:#111827;border:1px solid #1e293b;border-radius:10px;padding:12px;text-align:center}.forecast .day h4{font-size:.8rem;color:#94a3b8;margin-bottom:4px}.forecast .day .ftemp{font-size:1.1rem;font-weight:600;color:#00e5ff}
.note{color:#64748b;font-size:.8rem;margin-top:20px}`,
    "script.js": `const cities={london:{temp:18,desc:"partly cloudy",icon:"⛅",humidity:65,wind:12,vis:"10km"},tokyo:{temp:24,desc:"sunny",icon:"☀️",humidity:55,wind:8,vis:"15km"},paris:{temp:16,desc:"overcast",icon:"☁️",humidity:72,wind:15,vis:"8km"},
"new york":{temp:22,desc:"clear sky",icon:"🌤️",humidity:48,wind:10,vis:"12km"},mumbai:{temp:32,desc:"hot & humid",icon:"🌡️",humidity:85,wind:6,vis:"6km"},sydney:{temp:20,desc:"light rain",icon:"🌧️",humidity:78,wind:18,vis:"7km"}};
const defaultWeather={temp:20,desc:"fair weather",icon:"🌤️",humidity:60,wind:10,vis:"10km"};
const days=["Mon","Tue","Wed","Thu","Fri"];

function getWeather(){const city=document.getElementById("city").value.trim().toLowerCase();const data=cities[city]||defaultWeather;
document.getElementById("city-name").textContent=city.charAt(0).toUpperCase()+city.slice(1)+" "+data.icon;
document.getElementById("temp").textContent=data.temp+"°C";document.getElementById("desc").textContent=data.desc;
document.getElementById("humidity").textContent=data.humidity+"%";document.getElementById("wind").textContent=data.wind+" km/h";document.getElementById("visibility").textContent=data.vis;
document.getElementById("weather").classList.remove("hidden");
const forecast=document.getElementById("forecast");forecast.innerHTML=days.map((d,i)=>{const t=data.temp+Math.floor(Math.random()*6-3);return\`<div class="day"><h4>\${d}</h4><div style="font-size:1.5rem">\${["☀️","⛅","🌧️","☁️","🌤️"][i]}</div><div class="ftemp">\${t}°C</div></div>\`}).join("");}

document.getElementById("city").addEventListener("keydown",e=>{if(e.key==="Enter")getWeather()});
getWeather();`
  };
  return { message: "Built a weather app with city search, current conditions, and 5-day forecast.", steps: ["Created index.html — search, weather display, forecast grid", "Created style.css — dark theme, card layout", "Created script.js — simulated weather data for demo"], files };
}

function generateChatUI(): AgentResult {
  const files: Record<string, string> = {
    "index.html": `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"><title>Chat App</title><link rel="stylesheet" href="style.css"></head>
<body><div class="app"><div class="sidebar"><h2>💬 ChatForge</h2><div class="channels"><div class="channel active"># general</div><div class="channel"># random</div><div class="channel"># dev-talk</div></div><div class="online"><h3>Online — 3</h3><div class="user">🟢 Alice</div><div class="user">🟢 Bob</div><div class="user">🟡 Charlie</div></div></div>
<div class="main"><div class="chat-header"><h3># general</h3><span>3 members</span></div>
<div class="messages" id="messages"></div>
<div class="input-area"><input type="text" id="msg" placeholder="Type a message..."><button onclick="send()">Send</button></div></div></div>
<script src="script.js"></script></body></html>`,
    "style.css": `*{margin:0;padding:0;box-sizing:border-box}body{font-family:'Segoe UI',system-ui,sans-serif;background:#0a0e17;color:#e2e8f0;height:100vh}
.app{display:flex;height:100%}.sidebar{width:240px;background:#111827;border-right:1px solid #1e293b;padding:16px;display:flex;flex-direction:column}
.sidebar h2{color:#00e5ff;margin-bottom:20px;font-size:1.2rem}.channels{flex:1}.channel{padding:8px 12px;border-radius:8px;cursor:pointer;margin-bottom:4px;color:#94a3b8}.channel:hover,.channel.active{background:#1e293b;color:#e2e8f0}
.online{border-top:1px solid #1e293b;padding-top:12px}.online h3{font-size:.8rem;color:#94a3b8;margin-bottom:8px}.user{padding:4px 0;font-size:.9rem}
.main{flex:1;display:flex;flex-direction:column}.chat-header{padding:12px 20px;border-bottom:1px solid #1e293b;display:flex;justify-content:space-between;align-items:center}.chat-header span{color:#94a3b8;font-size:.9rem}
.messages{flex:1;overflow-y:auto;padding:20px;display:flex;flex-direction:column;gap:12px}
.msg{display:flex;gap:12px;max-width:80%}.msg.self{align-self:flex-end;flex-direction:row-reverse}.msg .avatar{width:36px;height:36px;border-radius:50%;background:#1e293b;display:flex;align-items:center;justify-content:center;font-size:1rem;flex-shrink:0}
.msg .bubble{background:#1e293b;padding:10px 14px;border-radius:12px;line-height:1.4}.msg.self .bubble{background:#00e5ff;color:#0a0e17}.msg .meta{font-size:.75rem;color:#64748b;margin-top:4px}
.input-area{padding:16px 20px;border-top:1px solid #1e293b;display:flex;gap:8px}.input-area input{flex:1;background:#111827;border:1px solid #1e293b;border-radius:10px;padding:10px 16px;color:#e2e8f0;outline:none;font-size:1rem}.input-area input:focus{border-color:#00e5ff}
.input-area button{background:#00e5ff;color:#0a0e17;border:none;padding:10px 20px;border-radius:10px;font-weight:600;cursor:pointer}`,
    "script.js": `const msgs=[{user:"Alice",avatar:"👩",text:"Hey everyone! How's the project going?",time:"10:30 AM"},
{user:"Bob",avatar:"👨",text:"Just pushed the new feature. Ready for review!",time:"10:32 AM"},
{user:"Alice",avatar:"👩",text:"Awesome! I'll check it out after lunch.",time:"10:33 AM"},
{user:"Charlie",avatar:"🧑",text:"The build is passing. Nice work Bob! 🎉",time:"10:35 AM"}];
const container=document.getElementById("messages");

function render(){container.innerHTML=msgs.map(m=>\`<div class="msg\${m.user==="You"?" self":""}"><div class="avatar">\${m.avatar}</div><div><div class="bubble">\${m.text}</div><div class="meta">\${m.user} · \${m.time}</div></div></div>\`).join("");
container.scrollTop=container.scrollHeight;}

function send(){const input=document.getElementById("msg");const text=input.value.trim();if(!text)return;
const now=new Date();const time=now.toLocaleTimeString([],{hour:"2-digit",minute:"2-digit"});
msgs.push({user:"You",avatar:"😎",text,time});input.value="";render();
setTimeout(()=>{const replies=["That's great!","Interesting idea 🤔","Let me look into that.","Sounds good! 👍","I agree!"];
msgs.push({user:"Alice",avatar:"👩",text:replies[Math.floor(Math.random()*replies.length)],time});render()},1500);}

document.getElementById("msg").addEventListener("keydown",e=>{if(e.key==="Enter")send()});
render();`
  };
  return { message: "Built a chat app UI with sidebar, channels, messages, and auto-reply.", steps: ["Created index.html — sidebar, message list, input", "Created style.css — Discord-like dark theme", "Created script.js — message rendering, send, auto-reply"], files };
}

function generateDashboard(): AgentResult {
  const files: Record<string, string> = {
    "index.html": `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"><title>Dashboard</title><link rel="stylesheet" href="style.css"></head>
<body><div class="dashboard"><aside class="sidebar"><h2>📊 Dashboard</h2><nav><a class="active">🏠 Overview</a><a>📈 Analytics</a><a>👥 Users</a><a>📦 Products</a><a>⚙️ Settings</a></nav></aside>
<main><header><h1>Overview</h1><span>Welcome back, Admin</span></header>
<div class="stats-grid"><div class="stat-card"><span class="stat-icon">💰</span><div><h3>₹2,45,000</h3><p>Total Revenue</p></div><span class="trend up">↑ 12%</span></div>
<div class="stat-card"><span class="stat-icon">👥</span><div><h3>1,234</h3><p>Total Users</p></div><span class="trend up">↑ 8%</span></div>
<div class="stat-card"><span class="stat-icon">📦</span><div><h3>456</h3><p>Orders</p></div><span class="trend down">↓ 3%</span></div>
<div class="stat-card"><span class="stat-icon">⭐</span><div><h3>4.8</h3><p>Rating</p></div><span class="trend up">↑ 0.2</span></div></div>
<div class="grid-2"><div class="card"><h3>Recent Orders</h3><table><thead><tr><th>Order</th><th>Customer</th><th>Amount</th><th>Status</th></tr></thead><tbody id="orders"></tbody></table></div>
<div class="card"><h3>Top Products</h3><div id="products"></div></div></div></main></div>
<script src="script.js"></script></body></html>`,
    "style.css": `*{margin:0;padding:0;box-sizing:border-box}:root{--primary:#00e5ff;--bg:#0a0e17;--surface:#111827;--surface2:#1e293b;--text:#e2e8f0;--dim:#94a3b8;--success:#10b981;--danger:#ef4444}body{font-family:'Segoe UI',system-ui,sans-serif;background:var(--bg);color:var(--text)}
.dashboard{display:flex;min-height:100vh}.sidebar{width:220px;background:var(--surface);padding:20px;border-right:1px solid var(--surface2)}.sidebar h2{color:var(--primary);margin-bottom:24px;font-size:1.1rem}.sidebar nav{display:flex;flex-direction:column;gap:4px}.sidebar a{display:block;padding:10px 12px;border-radius:8px;color:var(--dim);cursor:pointer;transition:all .2s}.sidebar a:hover,.sidebar a.active{background:var(--surface2);color:var(--text)}
main{flex:1;padding:24px;overflow-y:auto}main header{display:flex;justify-content:space-between;align-items:center;margin-bottom:24px}main header span{color:var(--dim)}
.stats-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:16px;margin-bottom:24px}.stat-card{background:var(--surface);border:1px solid var(--surface2);border-radius:12px;padding:20px;display:flex;align-items:center;gap:16px}.stat-icon{font-size:2rem}.stat-card h3{font-size:1.3rem}.stat-card p{color:var(--dim);font-size:.85rem}.trend{margin-left:auto;font-weight:600;font-size:.9rem}.trend.up{color:var(--success)}.trend.down{color:var(--danger)}
.grid-2{display:grid;grid-template-columns:1.5fr 1fr;gap:16px}.card{background:var(--surface);border:1px solid var(--surface2);border-radius:12px;padding:20px}.card h3{margin-bottom:16px}
table{width:100%;border-collapse:collapse}th,td{text-align:left;padding:10px;border-bottom:1px solid var(--surface2)}th{color:var(--dim);font-size:.85rem;font-weight:500}
.status{padding:4px 10px;border-radius:12px;font-size:.8rem;font-weight:600}.status.delivered{background:rgba(16,185,129,.15);color:var(--success)}.status.pending{background:rgba(245,158,11,.15);color:#f59e0b}.status.cancelled{background:rgba(239,68,68,.15);color:var(--danger)}
.product-item{display:flex;justify-content:space-between;align-items:center;padding:10px 0;border-bottom:1px solid var(--surface2)}.product-item:last-child{border:none}.bar{height:6px;background:var(--surface2);border-radius:3px;flex:1;margin:0 12px;max-width:100px}.bar-fill{height:100%;background:var(--primary);border-radius:3px}`,
    "script.js": `const orders=[{id:"#1234",customer:"Rahul S.",amount:"₹2,499",status:"delivered"},{id:"#1233",customer:"Priya K.",amount:"₹1,899",status:"pending"},
{id:"#1232",customer:"Amit P.",amount:"₹3,200",status:"delivered"},{id:"#1231",customer:"Sneha R.",amount:"₹999",status:"cancelled"},{id:"#1230",customer:"Vijay M.",amount:"₹4,500",status:"pending"}];
const products=[{name:"Wireless Earbuds",sales:234,pct:92},{name:"Smart Watch",sales:189,pct:74},{name:"Phone Case",sales:156,pct:61},{name:"USB-C Cable",sales:134,pct:53},{name:"Power Bank",sales:98,pct:38}];

document.getElementById("orders").innerHTML=orders.map(o=>\`<tr><td>\${o.id}</td><td>\${o.customer}</td><td>\${o.amount}</td><td><span class="status \${o.status}">\${o.status}</span></td></tr>\`).join("");
document.getElementById("products").innerHTML=products.map(p=>\`<div class="product-item"><span>\${p.name}</span><div class="bar"><div class="bar-fill" style="width:\${p.pct}%"></div></div><span style="color:var(--dim);font-size:.85rem">\${p.sales}</span></div>\`).join("");`
  };
  return { message: "Built an admin dashboard with stats, orders table, and product analytics.", steps: ["Created index.html — sidebar, stats, orders, products", "Created style.css — dashboard layout, stat cards, tables", "Created script.js — data rendering, status badges"], files };
}

function generatePythonApp(prompt: string): AgentResult {
  const files: Record<string, string> = {
    "main.py": `# ${prompt}\n\ndef main():\n    print("Hello from NovaForge Python!")\n    print("Project: ${prompt.slice(0, 60)}")\n\nif __name__ == "__main__":\n    main()`
  };
  return { message: "Created a Python starter project.", steps: ["Created main.py"], files };
}

function generateJavaApp(prompt: string): AgentResult {
  const files: Record<string, string> = {
    "Main.java": `// ${prompt}\npublic class Main {\n    public static void main(String[] args) {\n        System.out.println("Hello from NovaForge Java!");\n        System.out.println("Project: ${prompt.slice(0, 60)}");\n    }\n}`
  };
  return { message: "Created a Java starter project.", steps: ["Created Main.java"], files };
}

function generateRustApp(prompt: string): AgentResult {
  const files: Record<string, string> = {
    "main.rs": `// ${prompt}\nfn main() {\n    println!("Hello from NovaForge Rust!");\n    println!("Project: ${prompt.slice(0, 60)}");\n}`
  };
  return { message: "Created a Rust starter project.", steps: ["Created main.rs"], files };
}

function generateCppApp(prompt: string): AgentResult {
  const files: Record<string, string> = {
    "main.cpp": `// ${prompt}\n#include <iostream>\nint main() {\n    std::cout << "Hello from NovaForge C++!" << std::endl;\n    std::cout << "Project: ${prompt.slice(0, 60)}" << std::endl;\n    return 0;\n}`
  };
  return { message: "Created a C++ starter project.", steps: ["Created main.cpp"], files };
}

function generateGenericHTML(prompt: string): AgentResult {
  const files: Record<string, string> = {
    "index.html": `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"><title>${prompt.slice(0, 40)}</title><link rel="stylesheet" href="style.css"></head>
<body><div class="app"><h1>🚀 ${prompt.slice(0, 50)}</h1><p>Built with NovaForge</p><div class="card"><p>Edit these files to build your project!</p></div></div>
<script src="script.js"></script></body></html>`,
    "style.css": `*{margin:0;padding:0;box-sizing:border-box}body{font-family:'Segoe UI',system-ui,sans-serif;background:#0a0e17;color:#e2e8f0;min-height:100vh;display:flex;align-items:center;justify-content:center}
.app{text-align:center;padding:40px}.app h1{font-size:2rem;margin-bottom:12px;color:#00e5ff}.card{background:#111827;border:1px solid #1e293b;border-radius:12px;padding:24px;margin-top:20px}`,
    "script.js": `console.log("Project initialized: ${prompt.slice(0, 40)}");`
  };
  return { message: `Created a starter project for: ${prompt.slice(0, 60)}`, steps: ["Created index.html", "Created style.css", "Created script.js"], files };
}
