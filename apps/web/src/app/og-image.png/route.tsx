import { ImageResponse } from "next/og";

export const runtime = "edge";

export async function GET() {
  return new ImageResponse(
    (
      <div
        style={{
          height: "100%",
          width: "100%",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          backgroundColor: "#0a0a0f",
          backgroundImage:
            "radial-gradient(circle at 25% 25%, #1a1a3e 0%, transparent 50%), radial-gradient(circle at 75% 75%, #0f2a1f 0%, transparent 50%)",
        }}
      >
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <div
            style={{
              fontSize: 80,
              fontWeight: 900,
              background: "linear-gradient(135deg, #60a5fa, #a78bfa, #34d399)",
              backgroundClip: "text",
              color: "transparent",
              letterSpacing: "-2px",
            }}
          >
            CodeAbyss
          </div>
          <div
            style={{
              fontSize: 36,
              color: "#94a3b8",
              marginTop: 16,
              textAlign: "center",
            }}
          >
            Free AI-Powered Cloud IDE
          </div>
          <div
            style={{
              display: "flex",
              gap: "16px",
              marginTop: 40,
              fontSize: 20,
              color: "#64748b",
            }}
          >
            <span style={{ background: "#1e293b", padding: "8px 16px", borderRadius: "8px", color: "#60a5fa" }}>
              8+ Languages
            </span>
            <span style={{ background: "#1e293b", padding: "8px 16px", borderRadius: "8px", color: "#a78bfa" }}>
              AI Agent
            </span>
            <span style={{ background: "#1e293b", padding: "8px 16px", borderRadius: "8px", color: "#34d399" }}>
              Zero Setup
            </span>
            <span style={{ background: "#1e293b", padding: "8px 16px", borderRadius: "8px", color: "#f59e0b" }}>
              100% Free
            </span>
          </div>
        </div>
      </div>
    ),
    {
      width: 1200,
      height: 630,
    }
  );
}
