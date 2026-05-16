import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "CodeAbyss – Free AI Cloud IDE & Online Code Editor",
  description: "CodeAbyss is a free, open-source AI-powered cloud IDE and online compiler. Write, run, and deploy code in 8+ languages with an autonomous AI coding agent. No signup required.",
  keywords: ["online compiler", "online IDE", "cloud IDE", "AI code editor", "free IDE", "code agent", "AI code", "online code editor", "web IDE", "CodeAbyss", "free compiler", "coding playground", "browser IDE"],
  authors: [{ name: "CodeAbyss", url: "https://github.com/AbyssalCoder/CodeAbyss_Free_AI_IDE" }],
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
        <meta name="google-site-verification" content="" />
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
