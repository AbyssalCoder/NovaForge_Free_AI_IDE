import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "CodeAbyss – Free Online Compiler & AI IDE | Run Code Online",
  description: "Free online compiler and AI-powered IDE. Run Python, JavaScript, Java, C++, Rust, TypeScript code online instantly. AI coding agent writes code for you. No download, no signup. Best free online IDE and agentic coding platform.",
  keywords: ["online compiler", "online IDE", "run code online", "free online compiler", "compile code online", "online code editor", "AI IDE", "agentic IDE", "cloud IDE", "free IDE", "AI code editor", "code agent", "python compiler online", "java compiler online", "c++ compiler online", "javascript compiler online", "rust compiler online", "browser IDE", "web IDE", "CodeAbyss", "free compiler", "coding playground", "run python online", "run java online", "online coding", "code online free", "AI coding assistant", "cursor alternative free", "replit alternative free"],
  authors: [{ name: "CodeAbyss", url: "https://github.com/AbyssalCoder/CodeAbyss_AI_IDE" }],
  openGraph: {
    title: "CodeAbyss – Free AI Cloud IDE & Online Compiler",
    description: "Free AI-powered cloud IDE. Write, run & deploy code in 8+ languages with an autonomous coding agent. Python, JavaScript, TypeScript, Java, C++, Rust, HTML/CSS.",
    url: "https://codeabyss.vercel.app",
    siteName: "CodeAbyss",
    type: "website",
    locale: "en_US",
    images: [{ url: "https://codeabyss.vercel.app/og-image.png", width: 1200, height: 630, alt: "CodeAbyss - Free AI Cloud IDE" }],
  },
  twitter: {
    card: "summary_large_image",
    title: "CodeAbyss – Free AI Cloud IDE",
    description: "Free AI-powered cloud IDE with autonomous coding agent. 8+ languages, zero setup.",
    images: ["https://codeabyss.vercel.app/og-image.png"],
  },
  robots: {
    index: true,
    follow: true,
    googleBot: { index: true, follow: true },
  },
  alternates: { canonical: "https://codeabyss.vercel.app" },
};

export default function RootLayout({
  children
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <meta name="google-site-verification" content="darGlGX7WYwkygmGlEqHpSoPlujwbwc8wu1JCTZcVMg" />
        <link rel="canonical" href="https://codeabyss.vercel.app" />
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{
            __html: JSON.stringify({
              "@context": "https://schema.org",
              "@type": "WebApplication",
              name: "CodeAbyss",
              url: "https://codeabyss.vercel.app",
              description: "Free AI-powered cloud IDE and online compiler with autonomous coding agent.",
              applicationCategory: "DeveloperApplication",
              operatingSystem: "Web",
              offers: { "@type": "Offer", price: "0", priceCurrency: "USD" },
              featureList: "AI Code Agent, Online Compiler, 8+ Languages, Live Preview, Terminal, Monaco Editor",
            }),
          }}
        />
      </head>
      <body>{children}</body>
    </html>
  );
}
