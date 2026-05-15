import { config } from "./config.js";

type AgentInput = {
  provider: string;
  prompt: string;
  apiKey?: string;
  files?: Record<string, string>;
};

export async function runAgent(input: AgentInput) {
  const provider = input.provider === "auto" ? pickAutoProvider(input.apiKey) : input.provider;
  const system = [
    "You are NovaForge, an autonomous coding agent for a browser IDE.",
    "Return a short implementation plan and concrete next actions.",
    "Prefer free, local, open-source tools. Never require paid APIs."
  ].join("\n");

  const userPrompt = `${system}\n\nUser request:\n${input.prompt}\n\nFiles:\n${Object.keys(input.files || {}).join(", ")}`;

  if (provider === "gemini") {
    return callGemini(userPrompt, input.apiKey);
  }

  if (provider === "openrouter" || provider === "deepseek") {
    return callOpenRouter(userPrompt, input.apiKey);
  }

  return callOllama(userPrompt);
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

async function callOllama(prompt: string) {
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
    return formatAgentResponse(data.response || "Ollama returned an empty response.");
  } catch {
    return {
      message: "Ollama is not running, so NovaForge used its offline planner.",
      steps: offlineSteps()
    };
  }
}

async function callGemini(prompt: string, browserKey?: string) {
  const key = browserKey || config.geminiApiKeys[0];
  if (!key) {
    return {
      message: "Gemini selected, but no BYO key was provided.",
      steps: ["Open Gemini AI Studio, create a free API key, and paste it into the BYO key field."]
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
    return formatAgentResponse(data.candidates?.[0]?.content?.parts?.[0]?.text || "");
  }

  return {
    message: "Gemini request failed for all configured fallback models.",
    steps: failures.slice(0, 3)
  };
}

async function callOpenRouter(prompt: string, browserKey?: string) {
  const key = browserKey || config.openRouterApiKey;
  if (!key) {
    return {
      message: "OpenRouter/DeepSeek selected, but no BYO key was provided.",
      steps: ["Use Ollama for fully offline operation or paste a free-tier compatible key."]
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
    return { message: "OpenRouter request failed.", steps: [await response.text()] };
  }
  const data = (await response.json()) as { choices?: Array<{ message?: { content?: string } }> };
  return formatAgentResponse(data.choices?.[0]?.message?.content || "");
}

function formatAgentResponse(text: string) {
  const lines = text
    .split("\n")
    .map((line) => line.replace(/^[-*\d.\s]+/, "").trim())
    .filter(Boolean)
    .slice(0, 8);
  return {
    message: lines[0] || "Agent generated a plan.",
    steps: lines.length > 1 ? lines.slice(1) : offlineSteps()
  };
}

function offlineSteps() {
  return [
    "Create or update project files in the workspace.",
    "Run package install commands through the guarded terminal.",
    "Execute smoke tests and inspect the preview.",
    "Retry failing build steps with focused fixes.",
    "Publish by pushing to GitHub and deploying web/API services on free tiers."
  ];
}
