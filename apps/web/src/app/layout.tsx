import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "NovaForge – Free AI Cloud IDE & Online Code Editor",
  description: "NovaForge is a free, open-source AI-powered cloud IDE and online compiler. Write, run, and deploy code in 8+ languages with an autonomous AI coding agent. No signup required.",
  keywords: ["online compiler", "online IDE", "cloud IDE", "AI code editor", "free IDE", "code agent", "AI code", "online code editor", "web IDE", "NovaForge", "free compiler", "coding playground", "browser IDE"],
  authors: [{ name: "NovaForge", url: "https://github.com/AbyssalCoder/NovaForge_Free_AI_IDE" }],
  openGraph: {
    title: "NovaForge – Free AI Cloud IDE & Online Compiler",
    description: "Free AI-powered cloud IDE. Write, run & deploy code in 8+ languages with an autonomous coding agent. Python, JavaScript, TypeScript, Java, C++, Rust, HTML/CSS.",
    url: "https://novaforge.dev",
    siteName: "NovaForge",
    type: "website",
    locale: "en_US",
  },
  twitter: {
    card: "summary_large_image",
    title: "NovaForge – Free AI Cloud IDE",
    description: "Free AI-powered cloud IDE with autonomous coding agent. 8+ languages, zero setup.",
  },
  robots: {
    index: true,
    follow: true,
    googleBot: { index: true, follow: true },
  },
  alternates: { canonical: "https://novaforge.dev" },
};

export default function RootLayout({
  children
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <head>
        <meta name="google-site-verification" content="" />
        <link rel="canonical" href="https://novaforge.dev" />
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{
            __html: JSON.stringify({
              "@context": "https://schema.org",
              "@type": "WebApplication",
              name: "NovaForge",
              url: "https://novaforge.dev",
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
