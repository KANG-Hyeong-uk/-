"use client";

import { useState } from "react";
import Link from "next/link";
import { motion } from "framer-motion";
import {
  Shield,
  FileCode,
  Check,
  Book,
  ChevronLeft,
  Bot,
  Sparkles,
  Copy,
  Terminal,
  Settings,
  Monitor,
  Code2,
  ExternalLink,
  GitBranch,
  Globe,
  FolderGit2,
  Search,
  Wrench,
  Database,
  MessageSquare,
} from "lucide-react";
import { Button } from "@/components/ui/button";

interface MCPViewProps {
  onNavigate?: (state: string) => void;
}

const MCP_URL = "https://trust-mcp-knnd76vaqq-du.a.run.app/mcp";

const mcpConfigs = {
  claudeDesktop: {
    name: "Claude Desktop",
    icon: Monitor,
    path: "~/Library/Application Support/Claude/claude_desktop_config.json",
    pathWindows: "%APPDATA%\\Claude\\claude_desktop_config.json",
    config: `{
  "mcpServers": {
    "trust-security": {
      "type": "http",
      "url": "${MCP_URL}"
    }
  }
}`,
  },
  claudeCode: {
    name: "Claude Code",
    icon: Terminal,
    path: "Terminal (one-liner)",
    config: `claude mcp add --transport http trust-security "${MCP_URL}"`,
  },
  cursor: {
    name: "Cursor IDE",
    icon: Code2,
    path: "Settings > MCP",
    config: `{
  "trust-security": {
    "type": "http",
    "url": "${MCP_URL}"
  }
}`,
  },
  githubAction: {
    name: "GitHub Action",
    icon: GitBranch,
    path: ".github/workflows/trust-scan.yml",
    config: `name: Gwangju Security Scan

on:
  deployment_status:
  workflow_dispatch:
    inputs:
      url:
        description: 'URL to scan'
        required: true

jobs:
  security-scan:
    runs-on: ubuntu-latest
    steps:
      - name: Gwangju Security Scan
        uses: trust-security/scan-action@v1
        with:
          url: \${{ github.event.inputs.url || env.DEPLOY_URL }}
          mode: quick
          fail-on-critical: true`,
  },
};

const toolCategories = [
  {
    title: "URL Scanning",
    icon: Globe,
    tools: [
      {
        name: "scan_and_wait",
        description: "Scan a website and return results with AI analysis",
        example: '"Scan https://my-app.com for vulnerabilities"',
        badge: "Recommended",
      },
      {
        name: "scan_url",
        description: "Start a URL scan (non-blocking, returns scan ID)",
        example: '"Start scanning https://my-app.com"',
      },
      {
        name: "get_scan_result",
        description: "Get results of a URL scan by scan ID",
        example: '"Get results for scan abc-123"',
      },
    ],
  },
  {
    title: "Repo Scanning",
    icon: FolderGit2,
    tools: [
      {
        name: "scan_repo_and_wait",
        description: "Scan a GitHub repo for secrets, code issues, and vulnerable dependencies",
        example: '"Scan github.com/owner/repo for security issues"',
        badge: "Recommended",
      },
      {
        name: "scan_repo",
        description: "Start a repo scan (non-blocking, returns scan ID)",
        example: '"Start scanning owner/repo"',
      },
      {
        name: "get_repo_scan_result",
        description: "Get results of a repo scan by scan ID",
        example: '"Get repo scan results for abc-123"',
      },
    ],
  },
  {
    title: "Code Analysis",
    icon: Search,
    tools: [
      {
        name: "analyze_code_security",
        description: "Analyze code for vulnerabilities and exposed secrets (37+ patterns)",
        example: '"Is this code vulnerable to SQL injection?"',
      },
      {
        name: "check_secrets",
        description: "Scan code for exposed API keys, tokens, and credentials (20+ patterns)",
        example: '"Check this config for exposed secrets"',
      },
    ],
  },
  {
    title: "Fix Planning",
    icon: Wrench,
    tools: [
      {
        name: "get_fix_plan",
        description: "Get a structured fix plan with before/after code for scan vulnerabilities",
        example: '"Get fix plan for scan abc-123"',
      },
    ],
  },
  {
    title: "Resources (Context)",
    icon: Database,
    tools: [
      {
        name: "trust://scans/latest",
        description: "Read your most recent scan result — score, grade, vulnerability count",
        example: "Auto-loaded as context by AI agents",
        badge: "New",
      },
      {
        name: "trust://scans/history",
        description: "Last 10 scan results with targets, scores, and dates",
        example: "Auto-loaded as context by AI agents",
        badge: "New",
      },
      {
        name: "trust://security/posture",
        description: "Aggregated security posture — avg score, trend, grade distribution",
        example: "Auto-loaded as context by AI agents",
        badge: "New",
      },
    ],
  },
];

export function MCPView({ onNavigate }: MCPViewProps) {
  const [selectedConfig, setSelectedConfig] = useState<keyof typeof mcpConfigs>("claudeDesktop");
  const [copiedConfig, setCopiedConfig] = useState(false);

  const copyConfig = async () => {
    await navigator.clipboard.writeText(mcpConfigs[selectedConfig].config);
    setCopiedConfig(true);
    setTimeout(() => setCopiedConfig(false), 2000);
  };

  const currentConfig = mcpConfigs[selectedConfig];

  return (
    <div className="min-h-screen flex flex-col">
      {/* Header */}
      <header className="flex items-center justify-between px-6 py-4 border-b border-border/50">
        <div className="flex items-center gap-4">
          {onNavigate ? (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => onNavigate("landing")}
              className="text-muted-foreground hover:text-foreground"
            >
              <ChevronLeft className="w-4 h-4 mr-1" />
              Back to Home
            </Button>
          ) : (
            <Link
              href="/"
              className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors"
            >
              <ChevronLeft className="w-4 h-4" />
              Back to Home
            </Link>
          )}
        </div>
        <div className="flex items-center gap-3">
          <Shield className="w-6 h-6 text-neon-cyan" />
          <span className="font-semibold text-foreground">Gwangju Security MCP Server</span>
          <span className="px-2 py-1 text-xs rounded-full bg-neon-cyan/10 text-neon-cyan border border-neon-cyan/30 font-mono">
            v2.1
          </span>
          <span className="px-2 py-1 text-xs rounded-full bg-green-400/10 text-green-400 border border-green-400/30">
            Available
          </span>
        </div>
        <div className="w-32" />
      </header>

      {/* Content */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="flex-1 overflow-auto"
      >
        <div className="max-w-5xl mx-auto p-8">
          {/* Hero Section */}
          <div className="text-center mb-12">
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-neon-cyan/10 border border-neon-cyan/30 mb-4"
            >
              <Bot className="w-8 h-8 text-neon-cyan" />
            </motion.div>
            <h1 className="text-3xl font-bold text-foreground mb-3">
              Gwangju Security MCP Server
            </h1>
            <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
              Security scanning for AI-native development. Scan websites, GitHub repos, and code snippets directly from Claude Desktop, Claude Code, Cursor, or any MCP-compatible tool.
            </p>
          </div>

          {/* One-Line Install Notice */}
          <div className="glass rounded-2xl p-6 mb-8 border border-green-400/30">
            <div className="flex items-center gap-3 mb-3">
              <div className="w-10 h-10 rounded-xl bg-green-400/10 flex items-center justify-center">
                <Check className="w-5 h-5 text-green-400" />
              </div>
              <div>
                <h2 className="text-lg font-semibold text-foreground">No Installation Required</h2>
                <p className="text-sm text-muted-foreground">HTTP transport - just add the URL to your config. 9 tools + 3 resources available instantly.</p>
              </div>
            </div>
          </div>

          {/* Configuration */}
          <div className="glass rounded-2xl p-6 mb-8">
            <h2 className="text-lg font-semibold text-foreground mb-4 flex items-center gap-2">
              <Settings className="w-5 h-5 text-neon-cyan" />
              Add to Your Environment
            </h2>

            {/* Environment Selector */}
            <div className="flex gap-2 mb-6 flex-wrap">
              {(Object.keys(mcpConfigs) as Array<keyof typeof mcpConfigs>).map((key) => {
                const config = mcpConfigs[key];
                const Icon = config.icon;
                return (
                  <button
                    key={key}
                    onClick={() => setSelectedConfig(key)}
                    className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all ${
                      selectedConfig === key
                        ? "bg-neon-cyan/10 text-neon-cyan border border-neon-cyan/30"
                        : "bg-secondary/50 text-muted-foreground hover:text-foreground border border-transparent"
                    }`}
                  >
                    <Icon className="w-4 h-4" />
                    {config.name}
                  </button>
                );
              })}
            </div>

            {/* Config Display */}
            <div className="space-y-3">
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <FileCode className="w-4 h-4" />
                <span className="font-mono">{currentConfig.path}</span>
                {selectedConfig === "claudeDesktop" && (
                  <span className="text-xs">
                    (Windows: <code className="font-mono">{mcpConfigs.claudeDesktop.pathWindows}</code>)
                  </span>
                )}
              </div>
              <div className="relative group">
                <pre className="bg-[#0a0a0f] rounded-xl p-4 font-mono text-sm overflow-x-auto">
                  <code className="text-foreground">{currentConfig.config}</code>
                </pre>
                <button
                  onClick={copyConfig}
                  className="absolute top-3 right-3 p-1.5 rounded-md text-muted-foreground/60 hover:text-foreground hover:bg-white/10 transition-colors"
                  title={copiedConfig ? "Copied!" : "Copy to clipboard"}
                >
                  {copiedConfig ? (
                    <Check className="w-4 h-4 text-green-400" />
                  ) : (
                    <Copy className="w-4 h-4" />
                  )}
                </button>
              </div>

              {/* GitHub Action setup instructions */}
              {selectedConfig === "githubAction" && (
                <div className="bg-secondary/30 rounded-xl p-4 border border-border/50 space-y-3">
                  <h4 className="text-sm font-medium text-foreground">Setup</h4>
                  <ol className="list-decimal list-inside space-y-2 text-sm text-muted-foreground">
                    <li>
                      Copy the workflow above into{" "}
                      <code className="bg-secondary/80 px-1.5 py-0.5 rounded text-xs text-foreground font-mono">
                        .github/workflows/trust-scan.yml
                      </code>
                    </li>
                    <li>
                      Set <code className="bg-secondary/80 px-1.5 py-0.5 rounded text-xs text-foreground font-mono">DEPLOY_URL</code>{" "}
                      in your repository&apos;s environment variables (Settings &gt; Secrets and variables &gt; Actions)
                    </li>
                    <li>
                      The scan runs automatically on deployments, or manually via <span className="text-foreground">Actions &gt; Gwangju Security Scan &gt; Run workflow</span>
                    </li>
                  </ol>
                  <p className="text-xs text-muted-foreground/70">
                    The action will fail the workflow if critical vulnerabilities are detected.
                  </p>
                </div>
              )}
            </div>
          </div>

          {/* Available Tools - Categorized */}
          <div className="glass rounded-2xl p-6 mb-8">
            <h2 className="text-lg font-semibold text-foreground mb-6 flex items-center gap-2">
              <Sparkles className="w-5 h-5 text-neon-cyan" />
              Available Tools & Resources
              <span className="text-xs text-muted-foreground font-normal ml-2">9 tools + 3 resources</span>
            </h2>

            <div className="space-y-8">
              {toolCategories.map((category) => {
                const CategoryIcon = category.icon;
                return (
                  <div key={category.title}>
                    <h3 className="text-sm font-medium text-muted-foreground mb-3 flex items-center gap-2">
                      <CategoryIcon className="w-4 h-4" />
                      {category.title}
                    </h3>
                    <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
                      {category.tools.map((tool) => (
                        <div
                          key={tool.name}
                          className="bg-secondary/30 rounded-xl p-4 border border-border/50"
                        >
                          <div className="flex items-center gap-2 mb-1">
                            <h4 className="font-mono text-sm text-neon-cyan">{tool.name}</h4>
                            {"badge" in tool && tool.badge && (
                              <span className="px-1.5 py-0.5 text-[10px] rounded-full bg-neon-cyan/10 text-neon-cyan border border-neon-cyan/20">
                                {tool.badge}
                              </span>
                            )}
                          </div>
                          <p className="text-sm text-muted-foreground mb-2">{tool.description}</p>
                          <div className="text-xs text-foreground/70 italic">{tool.example}</div>
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Usage Examples */}
          <div className="glass rounded-2xl p-6 mb-8">
            <h2 className="text-lg font-semibold text-foreground mb-6 flex items-center gap-2">
              <MessageSquare className="w-5 h-5 text-neon-cyan" />
              How to Use
            </h2>

            <div className="space-y-6">
              {/* Example 1 */}
              <div className="bg-secondary/30 rounded-xl p-5 border border-border/50">
                <h3 className="text-sm font-semibold text-neon-cyan mb-2">Scan a live website</h3>
                <div className="bg-[#0a0a0f] rounded-lg p-3 font-mono text-sm text-foreground/80 mb-3">
                  &quot;Scan https://my-app.com for security vulnerabilities&quot;
                </div>
                <p className="text-xs text-muted-foreground">
                  Gwangju Security sends 5,000+ real HTTP requests to detect live vulnerabilities (SQLi, XSS, misconfigurations). Returns a score, grade, and AI-analyzed fix suggestions.
                </p>
              </div>

              {/* Example 2 */}
              <div className="bg-secondary/30 rounded-xl p-5 border border-border/50">
                <h3 className="text-sm font-semibold text-neon-cyan mb-2">Scan a GitHub repo</h3>
                <div className="bg-[#0a0a0f] rounded-lg p-3 font-mono text-sm text-foreground/80 mb-3">
                  &quot;Check owner/repo for exposed secrets and vulnerable dependencies&quot;
                </div>
                <p className="text-xs text-muted-foreground">
                  Clones the repo and runs SAST + secret detection + SCA across every file. Finds API keys, hardcoded passwords, and known CVEs in packages.
                </p>
              </div>

              {/* Example 3 */}
              <div className="bg-secondary/30 rounded-xl p-5 border border-border/50">
                <h3 className="text-sm font-semibold text-neon-cyan mb-2">Analyze code inline</h3>
                <div className="bg-[#0a0a0f] rounded-lg p-3 font-mono text-sm text-foreground/80 mb-3">
                  &quot;Is this code safe?&quot; (paste or select your code)
                </div>
                <p className="text-xs text-muted-foreground">
                  Runs 37 detection patterns locally — no code leaves your machine. Catches SQL injection, eval(), exposed secrets, weak crypto, and more.
                </p>
              </div>

              {/* Example 4 */}
              <div className="bg-secondary/30 rounded-xl p-5 border border-border/50">
                <h3 className="text-sm font-semibold text-neon-cyan mb-2">Get a fix plan</h3>
                <div className="bg-[#0a0a0f] rounded-lg p-3 font-mono text-sm text-foreground/80 mb-3">
                  &quot;Give me a fix plan for scan abc-123, critical and high only&quot;
                </div>
                <p className="text-xs text-muted-foreground">
                  Returns structured before/after code diffs and step-by-step fix instructions for each vulnerability. Ready to apply directly in your IDE.
                </p>
              </div>

              {/* Example 5 - Resources */}
              <div className="bg-secondary/30 rounded-xl p-5 border border-neon-cyan/20">
                <div className="flex items-center gap-2 mb-2">
                  <h3 className="text-sm font-semibold text-neon-cyan">Auto-context with Resources</h3>
                  <span className="px-1.5 py-0.5 text-[10px] rounded-full bg-neon-cyan/10 text-neon-cyan border border-neon-cyan/20">New</span>
                </div>
                <p className="text-xs text-muted-foreground mb-3">
                  MCP Resources are automatically available as context to AI agents. Your agent can read your latest scan result, full history, and security posture without any action from you.
                </p>
                <div className="space-y-2">
                  <div className="flex items-start gap-2 text-xs">
                    <code className="text-neon-cyan/80 font-mono shrink-0">trust://scans/latest</code>
                    <span className="text-muted-foreground">— Latest scan score, grade, and vulnerability count</span>
                  </div>
                  <div className="flex items-start gap-2 text-xs">
                    <code className="text-neon-cyan/80 font-mono shrink-0">trust://scans/history</code>
                    <span className="text-muted-foreground">— Last 10 scans with targets and scores</span>
                  </div>
                  <div className="flex items-start gap-2 text-xs">
                    <code className="text-neon-cyan/80 font-mono shrink-0">trust://security/posture</code>
                    <span className="text-muted-foreground">— Avg score, trend direction, grade distribution</span>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Links */}
          <div className="text-center">
            <a
              href="https://modelcontextprotocol.io/introduction"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-neon-cyan transition-colors"
            >
              <Book className="w-4 h-4" />
              Learn about MCP
              <ExternalLink className="w-4 h-4" />
            </a>
          </div>
        </div>
      </motion.div>
    </div>
  );
}
