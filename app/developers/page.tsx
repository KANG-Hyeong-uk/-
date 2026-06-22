import type { Metadata } from "next";
import { DevelopersView } from "@/components/trust/developers-view";

export const metadata: Metadata = {
  title: "Developer API — Gwangju Security Scanner",
  description:
    "Integrate Gwangju Security into your CI/CD pipeline, app, or AI agent. REST API + MCP server for URL scanning, repo scanning, and code analysis.",
  openGraph: {
    title: "Gwangju Security Developer API",
    description:
      "REST API + MCP server for security scanning. Scan websites and GitHub repos programmatically. Free API keys available.",
    url: "https://trust-scan.me/developers",
  },
  alternates: {
    canonical: "https://trust-scan.me/developers",
  },
};

export default function DevelopersPage() {
  return (
    <div className="min-h-screen bg-background">
      <DevelopersView />
    </div>
  );
}
