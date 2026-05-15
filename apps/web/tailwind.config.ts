import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/**/*.{js,ts,jsx,tsx,mdx}"],
  theme: {
    extend: {
      colors: {
        void: "#05070d",
        panel: "#0b1020",
        panelSoft: "#10172a",
        cyanForge: "#22d3ee",
        amberForge: "#f7c948",
        violetForge: "#8b5cf6",
        mintForge: "#34d399"
      },
      boxShadow: {
        neon: "0 0 30px rgba(34, 211, 238, 0.22)",
        amber: "0 0 24px rgba(247, 201, 72, 0.18)"
      }
    }
  },
  plugins: []
};

export default config;
