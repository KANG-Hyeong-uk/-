import React from "react"
import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";
import { Analytics } from "@vercel/analytics/next";
import { PostHogProvider } from "@/components/providers/PostHogProvider";
import "./globals.css";

const inter = Inter({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: "Trust - AI-Native Security for Indie Devs",
  description:
    "Free AI security scanner for indie developers. Detect vulnerabilities, exposed API keys, and privacy risks in your websites and GitHub repos in 30 seconds — with AI-powered fix suggestions.",
  generator: "Trust Security",
  metadataBase: new URL("https://www.trust-scan.me"),
  icons: {
    icon: [
      { url: "/icon.svg", type: "image/svg+xml" },
    ],
  },
  openGraph: {
    title: "Your code has secrets. Find them before hackers do.",
    description:
      "Free AI security scanner — scan your website or GitHub repo in 30 seconds. Detect vulnerabilities, exposed API keys, and get AI-powered fix suggestions.",
    url: "https://www.trust-scan.me",
    siteName: "Trust Security",
    images: [
      {
        url: "/og.png",
        width: 1200,
        height: 630,
        alt: "Trust - AI Security Scanner for Developers",
      },
    ],
    type: "website",
    locale: "en_US",
  },
  twitter: {
    card: "summary_large_image",
    title: "Your code has secrets. Find them before hackers do.",
    description:
      "Free AI security scanner — scan your website or GitHub repo in 30 seconds.",
    images: ["/og.png"],
  },
};

export const viewport: Viewport = {
  themeColor: "#00f3ff",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className={`${inter.className} antialiased`}>
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{
            __html: JSON.stringify({
              "@context": "https://schema.org",
              "@type": "SoftwareApplication",
              name: "Trust Security",
              applicationCategory: "SecurityApplication",
              operatingSystem: "Web",
              offers: {
                "@type": "Offer",
                price: "0",
                priceCurrency: "USD",
              },
              description:
                "Free AI security scanner for indie developers. Detect vulnerabilities, exposed API keys, and privacy risks in your websites and GitHub repos.",
            }),
          }}
        />
        <PostHogProvider>
          {children}
        </PostHogProvider>
        <Analytics />
      </body>
    </html>
  );
}
