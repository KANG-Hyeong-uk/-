"use client";

import Link from "next/link";
import { useState } from "react";
import { motion } from "framer-motion";
import {
  ArrowLeft,
  Shield,
  ShieldAlert,
  ShieldCheck,
  XCircle,
  CheckCircle2,
  Minus,
  AlertTriangle,
  DollarSign,
  Cpu,
  Crosshair,
  Bug,
  Zap,
  Lock,
  Eye,
  Server,
  Globe,
  Github,
  Bot,
  ChevronRight,
  GitBranch,
} from "lucide-react";

/* ------------------------------------------------------------------ */
/*  Data                                                               */
/* ------------------------------------------------------------------ */

const DETECTION_CARDS = [
  {
    icon: ShieldAlert,
    title: "OWASP Top 10",
    items: ["SQL Injection", "XSS", "SSRF", "Broken Auth"],
    color: "text-red-400",
    bg: "bg-red-400/10",
  },
  {
    icon: Lock,
    title: "Exposed Secrets",
    items: ["API Keys", "DB Credentials", "JWT Secrets", ".env Leaks"],
    color: "text-yellow-400",
    bg: "bg-yellow-400/10",
  },
  {
    icon: Eye,
    title: "Privacy Risks",
    items: ["Tracking Scripts", "Data Exfiltration", "3rd-party Leaks", "Cookie Issues"],
    color: "text-purple-400",
    bg: "bg-purple-400/10",
  },
  {
    icon: Server,
    title: "Infra Misconfig",
    items: ["Open Ports", "Missing Headers", "SSL Issues", "CORS Errors"],
    color: "text-blue-400",
    bg: "bg-blue-400/10",
  },
  {
    icon: Github,
    title: "GitHub Repo Scan",
    items: ["SAST (Semgrep)", "Secret Detection", "Dependency CVEs", "Auto-Fix PR"],
    color: "text-green-400",
    bg: "bg-green-400/10",
  },
];

type Check = "yes" | "partial" | "no";

interface CompRow {
  feature: string;
  trust: Check;
  copilot: Check;
  cursor: Check;
  vercel: Check;
  snyk: Check;
}

const COMPARISON: CompRow[] = [
  { feature: "OWASP Top 10 Detection",          trust: "yes",     copilot: "partial", cursor: "partial", vercel: "no",      snyk: "yes" },
  { feature: "Exposed API Key / Secret Scan",    trust: "yes",     copilot: "no",      cursor: "no",      vercel: "no",      snyk: "yes" },
  { feature: "Dependency Vulnerability (SCA)",   trust: "yes",     copilot: "no",      cursor: "no",      vercel: "no",      snyk: "yes" },
  { feature: "GitHub Repo Scan (SAST)",          trust: "yes",     copilot: "no",      cursor: "no",      vercel: "no",      snyk: "yes" },
  { feature: "AI Root-Cause + Fix Code",         trust: "yes",     copilot: "partial", cursor: "partial", vercel: "no",      snyk: "no" },
  { feature: "One-Click Auto-Fix PR",            trust: "yes",     copilot: "no",      cursor: "no",      vercel: "no",      snyk: "no" },
  { feature: "One-Click AI Fix Prompt",          trust: "yes",     copilot: "no",      cursor: "no",      vercel: "no",      snyk: "no" },
  { feature: "Runtime Header / SSL Check",       trust: "yes",     copilot: "no",      cursor: "no",      vercel: "partial", snyk: "no" },
  { feature: "Scheduled Auto-Scan (Daily/Weekly)", trust: "yes",   copilot: "no",      cursor: "no",      vercel: "no",      snyk: "yes" },
  { feature: "MCP / AI IDE Integration",         trust: "yes",     copilot: "no",      cursor: "no",      vercel: "no",      snyk: "no" },
  { feature: "CI/CD GitHub Action",              trust: "yes",     copilot: "no",      cursor: "no",      vercel: "no",      snyk: "yes" },
  { feature: "No Install Required",              trust: "yes",     copilot: "no",      cursor: "no",      vercel: "yes",     snyk: "no" },
  { feature: "Free Tier Available",              trust: "yes",     copilot: "no",      cursor: "no",      vercel: "yes",     snyk: "yes" },
];

const COST_ROWS = [
  { name: "Trust Pro",      cost: "$9.9/mo",           note: "Unlimited scans + AI fix + Auto PR" },
  { name: "Snyk Team",      cost: "$25+/dev/mo",       note: "Min 5 devs = $125/mo" },
  { name: "Checkmarx",      cost: "$59,000+/yr",       note: "Enterprise sales only" },
  { name: "Veracode",       cost: "$15,000+/yr",       note: "Per-app pricing" },
  { name: "SonarQube",      cost: "$2,500+/yr",        note: "Self-hosted, setup required" },
  { name: "Penetration Test", cost: "$5,000~30,000",   note: "Per engagement, one-time" },
];

const DONT_NEED = [
  {
    icon: DollarSign,
    title: "Expensive enterprise contracts",
    desc: "Checkmarx starts at $59K/yr. Veracode starts at $15K/yr. Trust Pro is $9.9/mo.",
  },
  {
    icon: Cpu,
    title: "Kernel-level security agents",
    desc: "No software to install on your machine. Scan from your browser in 30 seconds.",
  },
  {
    icon: Crosshair,
    title: "Paid penetration testing",
    desc: "A single pentest costs $5K~$30K. Trust runs automated checks on every deploy.",
  },
  {
    icon: Bug,
    title: "Antivirus startup scans",
    desc: "No background processes slowing your dev machine. Scan only when you need it.",
  },
];

/* ------------------------------------------------------------------ */
/*  Helper                                                             */
/* ------------------------------------------------------------------ */

function CheckIcon({ value }: { value: Check }) {
  if (value === "yes")
    return <CheckCircle2 className="w-4 h-4 text-green-400 mx-auto" />;
  if (value === "partial")
    return <Minus className="w-4 h-4 text-yellow-400 mx-auto" />;
  return <XCircle className="w-4 h-4 text-white/20 mx-auto" />;
}

/* ------------------------------------------------------------------ */
/*  Animation                                                          */
/* ------------------------------------------------------------------ */

const fadeUp = {
  hidden: { opacity: 0, y: 32 },
  visible: { opacity: 1, y: 0 },
};

const staggerContainer = {
  hidden: {},
  visible: { transition: { staggerChildren: 0.1 } },
};

const fadeUpItem = {
  hidden: { opacity: 0, y: 24 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.45, ease: "easeOut" as const } },
};

/* ------------------------------------------------------------------ */
/*  Page                                                               */
/* ------------------------------------------------------------------ */

export default function WhyTrustClient() {
  const [expandedCost, setExpandedCost] = useState(false);

  return (
    <div className="min-h-screen bg-background">
      {/* Nav */}
      <nav className="border-b border-white/8 px-6 py-4">
        <div className="max-w-5xl mx-auto flex items-center justify-between">
          <Link
            href="/"
            className="inline-flex items-center gap-2 text-muted-foreground hover:text-foreground transition-colors text-sm"
          >
            <ArrowLeft className="w-4 h-4" />
            Trust
          </Link>
          <Link
            href="/pricing"
            className="text-sm text-neon-cyan hover:underline"
          >
            View Pricing →
          </Link>
        </div>
      </nav>

      <main className="max-w-5xl mx-auto px-6 py-16 space-y-24">
        {/* ───── Hero ───── */}
        <motion.section
          className="text-center max-w-3xl mx-auto"
          initial="hidden"
          animate="visible"
          variants={fadeUp}
          transition={{ duration: 0.6, ease: "easeOut" }}
        >
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full border border-neon-cyan/30 bg-neon-cyan/5 text-neon-cyan text-xs font-medium mb-6">
            <ShieldCheck className="w-3 h-3" />
            For Vibe Coders Who Ship Fast
          </div>
          <h1 className="text-3xl md:text-5xl font-bold mb-4 text-balance">
            Why <span className="text-neon-cyan neon-text">Trust</span>?
          </h1>
          <p className="text-muted-foreground text-lg leading-relaxed max-w-2xl mx-auto">
            You build with AI. You ship in days, not months.<br className="hidden md:block" />
            But one exposed API key or unpatched vulnerability can undo everything.<br className="hidden md:block" />
            <span className="text-foreground font-medium">Trust is the last checkpoint before you go live.</span>
          </p>
        </motion.section>

        {/* ───── What We Detect ───── */}
        <motion.section
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true, amount: 0.2 }}
          variants={fadeUp}
          transition={{ duration: 0.5, ease: "easeOut" }}
        >
          <h2 className="text-xl font-semibold text-center mb-2">What We Detect</h2>
          <p className="text-sm text-muted-foreground text-center mb-8">
            One scan covers what used to take 5+ separate tools.
          </p>
          <motion.div
            className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-4"
            variants={staggerContainer}
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true, amount: 0.2 }}
          >
            {DETECTION_CARDS.map((card) => (
              <motion.div
                key={card.title}
                className="glass rounded-2xl p-5 flex flex-col"
                variants={fadeUpItem}
              >
                <div
                  className={`w-10 h-10 rounded-xl ${card.bg} flex items-center justify-center mb-3`}
                >
                  <card.icon className={`w-5 h-5 ${card.color}`} />
                </div>
                <h3 className="text-sm font-semibold text-foreground mb-2">
                  {card.title}
                </h3>
                <ul className="space-y-1">
                  {card.items.map((item) => (
                    <li
                      key={item}
                      className="text-xs text-muted-foreground flex items-center gap-1.5"
                    >
                      <ChevronRight className="w-3 h-3 text-white/20 shrink-0" />
                      {item}
                    </li>
                  ))}
                </ul>
              </motion.div>
            ))}
          </motion.div>
        </motion.section>

        {/* ───── Comparison Table ───── */}
        <motion.section
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true, amount: 0.15 }}
          variants={fadeUp}
          transition={{ duration: 0.5, ease: "easeOut" }}
        >
          <h2 className="text-xl font-semibold text-center mb-2">
            Trust vs. The Alternatives
          </h2>
          <p className="text-sm text-muted-foreground text-center mb-8">
            AI coding assistants help you write code &mdash; but they don&apos;t verify what ships.
          </p>

          <div className="glass rounded-2xl overflow-hidden border border-white/8">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-white/8">
                    <th className="text-left px-4 py-3 text-muted-foreground font-medium">
                      Feature
                    </th>
                    <th className="px-3 py-3 text-neon-cyan font-semibold whitespace-nowrap">
                      <div className="flex items-center justify-center gap-1.5">
                        <Shield className="w-3.5 h-3.5" /> Trust
                      </div>
                    </th>
                    <th className="px-3 py-3 text-muted-foreground font-medium whitespace-nowrap">
                      <div className="flex items-center justify-center gap-1.5">
                        <Github className="w-3.5 h-3.5" /> Copilot
                      </div>
                    </th>
                    <th className="px-3 py-3 text-muted-foreground font-medium whitespace-nowrap">
                      Cursor
                    </th>
                    <th className="px-3 py-3 text-muted-foreground font-medium whitespace-nowrap">
                      Vercel
                    </th>
                    <th className="px-3 py-3 text-muted-foreground font-medium whitespace-nowrap">
                      Snyk
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {COMPARISON.map((row, i) => (
                    <tr
                      key={row.feature}
                      className={
                        i < COMPARISON.length - 1
                          ? "border-b border-white/5"
                          : ""
                      }
                    >
                      <td className="px-4 py-3 text-foreground text-xs sm:text-sm">
                        {row.feature}
                      </td>
                      <td className="px-3 py-3">
                        <CheckIcon value={row.trust} />
                      </td>
                      <td className="px-3 py-3">
                        <CheckIcon value={row.copilot} />
                      </td>
                      <td className="px-3 py-3">
                        <CheckIcon value={row.cursor} />
                      </td>
                      <td className="px-3 py-3">
                        <CheckIcon value={row.vercel} />
                      </td>
                      <td className="px-3 py-3">
                        <CheckIcon value={row.snyk} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="px-4 py-3 border-t border-white/5 flex flex-wrap gap-4 text-xs text-muted-foreground">
              <span className="flex items-center gap-1.5">
                <CheckCircle2 className="w-3 h-3 text-green-400" /> Supported
              </span>
              <span className="flex items-center gap-1.5">
                <Minus className="w-3 h-3 text-yellow-400" /> Partial
              </span>
              <span className="flex items-center gap-1.5">
                <XCircle className="w-3 h-3 text-white/20" /> Not available
              </span>
            </div>
          </div>

          <p className="text-xs text-muted-foreground text-center mt-4">
            * GitHub Copilot & Cursor can flag some issues during code writing, but do not perform post-build security scanning.
          </p>
        </motion.section>

        {/* ───── Cost Comparison ───── */}
        <motion.section
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true, amount: 0.15 }}
          variants={fadeUp}
          transition={{ duration: 0.5, ease: "easeOut" }}
        >
          <h2 className="text-xl font-semibold text-center mb-2">
            Cost Comparison
          </h2>
          <p className="text-sm text-muted-foreground text-center mb-8">
            Enterprise-grade detection at indie-friendly pricing.
          </p>

          <motion.div
            className="max-w-2xl mx-auto space-y-2"
            variants={staggerContainer}
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true, amount: 0.15 }}
          >
            {COST_ROWS.map((row, i) => (
              <motion.div
                key={row.name}
                variants={fadeUpItem}
                className={`flex items-center justify-between px-5 py-3.5 rounded-xl ${
                  i === 0
                    ? "glass-strong border border-neon-cyan/30"
                    : "glass border border-white/8"
                }`}
              >
                <div className="flex items-center gap-3">
                  {i === 0 && <Shield className="w-4 h-4 text-neon-cyan shrink-0" />}
                  <div>
                    <span
                      className={`text-sm font-medium ${
                        i === 0 ? "text-neon-cyan" : "text-foreground"
                      }`}
                    >
                      {row.name}
                    </span>
                    <p className="text-xs text-muted-foreground">{row.note}</p>
                  </div>
                </div>
                <span
                  className={`text-sm font-bold whitespace-nowrap ${
                    i === 0 ? "text-neon-cyan" : "text-foreground"
                  }`}
                >
                  {row.cost}
                </span>
              </motion.div>
            ))}
          </motion.div>
        </motion.section>

        {/* ───── You Don't Need ───── */}
        <motion.section
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true, amount: 0.15 }}
          variants={fadeUp}
          transition={{ duration: 0.5, ease: "easeOut" }}
        >
          <h2 className="text-xl font-semibold text-center mb-2">
            What You Don&apos;t Need Anymore
          </h2>
          <p className="text-sm text-muted-foreground text-center mb-8">
            Trust replaces the overhead that slows indie devs down.
          </p>

          <motion.div
            className="grid grid-cols-1 sm:grid-cols-2 gap-4 max-w-3xl mx-auto"
            variants={staggerContainer}
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true, amount: 0.15 }}
          >
            {DONT_NEED.map((item) => (
              <motion.div
                key={item.title}
                className="glass rounded-2xl p-5 flex gap-4"
                variants={fadeUpItem}
              >
                <div className="w-10 h-10 rounded-xl bg-red-500/10 flex items-center justify-center shrink-0">
                  <item.icon className="w-5 h-5 text-red-400" />
                </div>
                <div>
                  <h3 className="text-sm font-semibold text-foreground mb-1 flex items-center gap-2">
                    <XCircle className="w-3.5 h-3.5 text-red-400 shrink-0" />
                    {item.title}
                  </h3>
                  <p className="text-xs text-muted-foreground leading-relaxed">
                    {item.desc}
                  </p>
                </div>
              </motion.div>
            ))}
          </motion.div>
        </motion.section>

        {/* ───── Bottom Line ───── */}
        <motion.section
          className="text-center max-w-2xl mx-auto"
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true, amount: 0.2 }}
          variants={fadeUp}
          transition={{ duration: 0.5, ease: "easeOut" }}
        >
          <div className="glass-strong rounded-2xl p-8 border border-neon-cyan/20">
            <AlertTriangle className="w-8 h-8 text-neon-cyan mx-auto mb-4" />
            <h2 className="text-lg font-bold mb-3">
              The Bottom Line
            </h2>
            <p className="text-sm text-muted-foreground leading-relaxed mb-6">
              AI coding tools help you <span className="text-foreground">write</span> code faster.
              But they don&apos;t <span className="text-foreground">verify</span> what you ship.<br />
              Copilot generates code &mdash; <span className="text-neon-cyan">29.8% of which contains security weaknesses.</span><br />
              Vercel deploys your app &mdash; but doesn&apos;t scan it.<br /><br />
              <span className="text-foreground font-medium">
                Trust scans your URL or GitHub repo, finds vulnerabilities with AI,
                and creates a Fix PR &mdash; all in one click.
              </span>
            </p>
            <div className="flex flex-col sm:flex-row gap-3 justify-center">
              <Link
                href="/"
                className="inline-flex items-center justify-center gap-2 px-6 py-3 rounded-xl bg-neon-cyan text-black font-bold text-sm hover:bg-neon-cyan/90 transition-colors"
              >
                <Zap className="w-4 h-4" />
                Start Free Scan
              </Link>
              <Link
                href="/pricing"
                className="inline-flex items-center justify-center gap-2 px-6 py-3 rounded-xl border border-white/15 text-sm font-medium text-foreground hover:bg-white/5 transition-colors"
              >
                View Pricing
              </Link>
            </div>
          </div>
        </motion.section>
      </main>

      {/* Footer */}
      <footer className="border-t border-white/8 mt-10 py-8 text-center text-xs text-muted-foreground">
        <div className="flex justify-center gap-6">
          <Link href="/pricing" className="hover:text-foreground transition-colors">
            Pricing
          </Link>
          <Link href="/terms" className="hover:text-foreground transition-colors">
            Terms
          </Link>
          <Link href="/privacy" className="hover:text-foreground transition-colors">
            Privacy
          </Link>
          <Link href="/" className="hover:text-foreground transition-colors">
            Trust Security
          </Link>
        </div>
      </footer>
    </div>
  );
}
