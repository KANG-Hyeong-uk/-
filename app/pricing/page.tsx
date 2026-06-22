import type { Metadata } from "next";
import PricingClient from "./pricing-client";

export const metadata: Metadata = {
  title: "Pricing — Gwangju Security",
  description:
    "Start for free with 5 URL scans and 3 repo scans per month. Upgrade to Pro for unlimited scans, AI fix code, Auto-Fix PRs, scheduled scans, and more.",
  alternates: {
    canonical: "https://www.trust-scan.me/pricing",
  },
  openGraph: {
    title: "Pricing — Gwangju Security",
    description:
      "Free AI security scanner for developers. Upgrade to Pro for unlimited scans and AI-powered fixes.",
    url: "https://www.trust-scan.me/pricing",
  },
};

export default function PricingPage() {
  return <PricingClient />;
}
