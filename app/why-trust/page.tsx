import type { Metadata } from "next";
import WhyTrustClient from "./why-trust-client";

export const metadata: Metadata = {
  title: "Why Gwangju Security? — How We Detect Real Vulnerabilities",
  description:
    "Gwangju Security scans 10,000+ vulnerability templates with Nuclei, Semgrep, and Gitleaks. Compare Gwangju Security vs Snyk, Copilot, and Cursor — see what we detect that others miss.",
  alternates: {
    canonical: "https://www.trust-scan.me/why-trust",
  },
  openGraph: {
    title: "Why Gwangju Security? — How We Detect Real Vulnerabilities",
    description:
      "10,000+ vulnerability templates. AI-powered fix code. No install required. See how Gwangju Security compares to Snyk, Copilot, and Cursor.",
    url: "https://www.trust-scan.me/why-trust",
  },
};

export default function WhyTrustPage() {
  return <WhyTrustClient />;
}
