import type { Metadata } from "next";
import { MCPView } from "@/components/trust/mcp-view";

export const metadata: Metadata = {
  title: "MCP Server — Trust Security Scanner",
  description:
    "Connect Trust Security Scanner to Claude Desktop, Claude Code, Cursor, or any MCP-compatible AI tool. Scan websites and GitHub repos for vulnerabilities directly from your IDE.",
  openGraph: {
    title: "Trust MCP Server — Security Scanning for AI IDEs",
    description:
      "9 security tools + 3 context resources for Claude, Cursor, and MCP-compatible AI agents. URL scanning, repo scanning, code analysis, and security posture — no installation required.",
    url: "https://trust-scan.me/mcp",
  },
  alternates: {
    canonical: "https://trust-scan.me/mcp",
  },
};

export default function MCPPage() {
  return (
    <div className="min-h-screen bg-background">
      <MCPView />
    </div>
  );
}
