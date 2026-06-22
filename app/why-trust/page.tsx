import type { Metadata } from "next";
import WhyTrustClient from "./why-trust-client";

export const metadata: Metadata = {
  title: "Why Trust? — How We Detect Real Vulnerabilities",
  description:
    "Trust scans 10,000+ vulnerability templates with Nuclei, Semgrep, and Gitleaks. Compare Trust vs Snyk, Copilot, and Cursor — see what we detect that others miss.",
  alternates: {
    canonical: "https://www.trust-scan.me/why-trust",
  },
  openGraph: {
    title: "Why Trust? — How We Detect Real Vulnerabilities",
    description:
      "10,000+ vulnerability templates. AI-powered fix code. No install required. See how Trust compares to Snyk, Copilot, and Cursor.",
    url: "https://www.trust-scan.me/why-trust",
  },
};

export default function WhyTrustPage() {
  return <WhyTrustClient />;
}
