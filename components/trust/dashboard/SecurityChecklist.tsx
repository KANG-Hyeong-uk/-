"use client";

import { motion, AnimatePresence } from "framer-motion";
import { Shield, Loader2, Lock, LockOpen, ChevronDown } from "lucide-react";
import { useState, useEffect } from "react";

interface HeaderResult {
  name: string;
  shortName: string;
  present: boolean;
  value: string | null;
}

interface SSLInfo {
  valid: boolean;
  issuer: string | null;
  subject: string | null;
  validFrom: string | null;
  validTo: string | null;
  daysRemaining: number | null;
  protocol: string | null;
}

interface SecurityCheckResult {
  url: string;
  statusCode: number;
  responseTime: number;
  headers: Record<string, HeaderResult>;
  server: string | null;
  ssl: SSLInfo | null;
  checkedAt: string;
}

interface SecurityChecklistProps {
  targetUrl: string;
}

interface HeaderInfo {
  summary: string;
  detail: string;
  fix: string;
  code: string;
}

const HEADER_INFO: Record<string, HeaderInfo> = {
  hsts: {
    summary: "Forces browsers to always use HTTPS on your site",
    detail: "Without this, attackers on public Wi-Fi can intercept your users' traffic by downgrading HTTPS to HTTP. Once set, browsers will refuse to connect over plain HTTP for the specified duration.",
    fix: "Add this header to your server or hosting config. On Vercel/Next.js, add it to next.config.js headers. On Nginx, add it to your server block.",
    code: "Strict-Transport-Security: max-age=31536000; includeSubDomains",
  },
  csp: {
    summary: "Controls which resources your site can load",
    detail: "This is the single most effective header against XSS attacks. It tells the browser exactly which scripts, styles, and images are allowed to run — anything else gets blocked. If your site was compromised, CSP limits what an attacker can do.",
    fix: "Start with a basic policy and expand as needed. This blocks all inline scripts and only allows resources from your own domain.",
    code: "Content-Security-Policy: default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'",
  },
  "x-frame": {
    summary: "Prevents your site from being embedded in other websites",
    detail: "Without this, attackers can put your site inside an invisible frame and trick users into clicking things they didn't intend to (clickjacking). For example, a user might think they're clicking a harmless button but are actually authorizing a payment on your site.",
    fix: "Use DENY to block all framing, or SAMEORIGIN to allow only your own site to embed it.",
    code: "X-Frame-Options: DENY",
  },
  "x-content-type": {
    summary: "Stops browsers from guessing file types incorrectly",
    detail: "Browsers sometimes try to be 'helpful' by guessing what type a file is, ignoring what the server says. An attacker can exploit this by uploading a file that looks like an image but is actually a script. This header tells the browser: trust the server, don't guess.",
    fix: "This is a one-liner with no configuration needed. Just add it.",
    code: "X-Content-Type-Options: nosniff",
  },
  permissions: {
    summary: "Controls which browser features your site can use",
    detail: "This lets you explicitly disable access to camera, microphone, geolocation, and other sensitive APIs. Even if an attacker injects code into your page, they can't activate these features if you've blocked them here.",
    fix: "Disable all features you don't use. This example blocks camera, microphone, and geolocation.",
    code: "Permissions-Policy: camera=(), microphone=(), geolocation=()",
  },
  referrer: {
    summary: "Controls what info is shared when visitors click links",
    detail: "When a user clicks a link on your site, the browser tells the destination where they came from (the 'referrer'). This can leak private URL paths, search queries, or session tokens. This header limits what gets shared.",
    fix: "strict-origin-when-cross-origin is the recommended default. It shares only the origin (not the full URL) to other sites.",
    code: "Referrer-Policy: strict-origin-when-cross-origin",
  },
  "x-xss": {
    summary: "Legacy browser protection against script injection",
    detail: "This header activated a built-in XSS filter in older browsers. Modern browsers have removed this filter in favor of CSP, but setting it still provides protection for users on outdated browsers.",
    fix: "Simple one-liner. mode=block tells the browser to block the page entirely rather than trying to sanitize it.",
    code: "X-XSS-Protection: 1; mode=block",
  },
};

export function SecurityChecklist({ targetUrl }: SecurityChecklistProps) {
  const [data, setData] = useState<SecurityCheckResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState(false);
  const [openDetail, setOpenDetail] = useState<string | null>(null);

  useEffect(() => {
    if (!targetUrl) return;

    const controller = new AbortController();
    setLoading(true);
    setError(null);

    fetch(`/api/security-check?url=${encodeURIComponent(targetUrl)}`, {
      signal: controller.signal,
    })
      .then((res) => {
        if (!res.ok) throw new Error("Check failed");
        return res.json();
      })
      .then(setData)
      .catch((err) => {
        if (err.name !== "AbortError") {
          setError(err.message);
        }
      })
      .finally(() => setLoading(false));

    return () => controller.abort();
  }, [targetUrl]);

  if (error) return null;

  const headerEntries = data
    ? Object.entries(data.headers) as [string, HeaderResult][]
    : [];
  const passCount = headerEntries.filter(([, h]) => h.present).length;
  const failCount = headerEntries.filter(([, h]) => !h.present).length;
  const total = headerEntries.length;

  const isHttpOnly = data ? data.url.startsWith("http://") : false;

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, delay: 0.3 }}
      className="glass rounded-2xl p-5 mb-10"
    >
      {/* Summary row — clickable to expand */}
      <button
        onClick={() => data && setExpanded((v) => !v)}
        className="w-full flex items-center gap-4 text-left"
      >
        <div className="w-10 h-10 bg-neon-cyan/10 rounded-xl flex items-center justify-center shrink-0">
          <Shield className="w-5 h-5 text-neon-cyan" />
        </div>

        {loading ? (
          <div className="flex-1 flex items-center gap-2">
            <Loader2 className="w-4 h-4 text-muted-foreground animate-spin" />
            <span className="text-base text-muted-foreground">Checking server protection...</span>
          </div>
        ) : data ? (
          <>
            <div className="flex-1 min-w-0">
              {/* Row 1: Title + progress */}
              <div className="flex items-center gap-4 mb-2">
                <h2 className="text-xl font-semibold text-foreground shrink-0">
                  Server Protection
                </h2>
                <span className={`text-sm font-medium ${
                  failCount === 0 ? "text-green-400" : failCount <= 2 ? "text-yellow-400" : "text-red-400"
                }`}>
                  {passCount} of {total} active
                </span>
                <div className="flex-1 h-2 bg-white/5 rounded-full overflow-hidden">
                  <motion.div
                    initial={{ width: 0 }}
                    animate={{ width: `${(passCount / total) * 100}%` }}
                    transition={{ duration: 0.8, delay: 0.2 }}
                    className="h-full rounded-full"
                    style={{
                      background:
                        passCount === total
                          ? "var(--neon-cyan)"
                          : passCount >= 4
                            ? "#4ade80"
                            : passCount >= 2
                              ? "#facc15"
                              : "#f87171",
                    }}
                  />
                </div>
              </div>

              {/* Row 2: HTTPS status */}
              <div className="flex items-center gap-2">
                {isHttpOnly ? (
                  <>
                    <LockOpen className="w-3.5 h-3.5 text-red-400 shrink-0" />
                    <span className="text-sm text-red-400 font-medium">No HTTPS — all traffic is unencrypted</span>
                  </>
                ) : data.ssl ? (
                  <>
                    {data.ssl.valid ? (
                      <Lock className="w-3.5 h-3.5 text-green-400 shrink-0" />
                    ) : (
                      <LockOpen className="w-3.5 h-3.5 text-red-400 shrink-0" />
                    )}
                    <span className={`text-sm ${data.ssl.valid ? "text-muted-foreground" : "text-red-400"}`}>
                      {data.ssl.valid ? "HTTPS OK" : "Invalid SSL certificate"}
                    </span>
                  </>
                ) : null}
              </div>
            </div>

            {/* Expand chevron */}
            <ChevronDown className={`w-5 h-5 text-muted-foreground shrink-0 transition-transform duration-200 ${expanded ? "rotate-180" : ""}`} />
          </>
        ) : null}
      </button>

      {/* Expanded detail list */}
      <AnimatePresence>
        {expanded && data && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="overflow-hidden"
          >
            <div className="mt-4 pt-4 border-t border-white/10 space-y-1.5">
              {headerEntries.map(([key, header]) => {
                const info = HEADER_INFO[key];
                const isOpen = openDetail === key;
                return (
                  <div key={key} className="rounded-xl bg-white/[0.03]">
                    <button
                      onClick={(e) => { e.stopPropagation(); setOpenDetail(isOpen ? null : key); }}
                      className="w-full flex items-center justify-between p-4 text-left"
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <span className={`w-2.5 h-2.5 rounded-full shrink-0 ${header.present ? "bg-green-400" : "bg-red-400"}`} />
                        <div className="min-w-0">
                          <span className="text-foreground font-medium">{header.name}</span>
                          <p className="text-sm text-foreground/60 mt-0.5">
                            {info?.summary || "Security response header"}
                          </p>
                        </div>
                      </div>
                      {info?.detail && (
                        <ChevronDown className={`w-4 h-4 text-muted-foreground shrink-0 ml-3 transition-transform duration-200 ${isOpen ? "rotate-180" : ""}`} />
                      )}
                    </button>
                    <AnimatePresence>
                      {isOpen && info?.detail && (
                        <motion.div
                          initial={{ height: 0, opacity: 0 }}
                          animate={{ height: "auto", opacity: 1 }}
                          exit={{ height: 0, opacity: 0 }}
                          transition={{ duration: 0.15 }}
                          className="overflow-hidden"
                        >
                          <div className="px-4 pb-4 ml-[22px] space-y-3">
                            <div className="p-4 rounded-lg bg-neon-cyan/[0.03] border border-neon-cyan/10">
                              <p className="text-sm text-foreground/70 leading-relaxed">
                                {info.detail}
                              </p>
                            </div>
                            {!header.present && info.fix && (
                              <div className="p-4 rounded-lg bg-white/[0.03] border border-white/10">
                                <p className="text-xs font-semibold text-neon-cyan uppercase tracking-wider mb-2">How to fix</p>
                                <p className="text-sm text-foreground/70 leading-relaxed mb-3">
                                  {info.fix}
                                </p>
                                <div className="relative group">
                                  <pre className="bg-black/30 rounded-lg px-4 py-3 text-sm font-mono text-foreground/80 overflow-x-auto">
                                    {info.code}
                                  </pre>
                                  <button
                                    onClick={(e) => { e.stopPropagation(); navigator.clipboard.writeText(info.code); }}
                                    className="absolute top-2 right-2 px-2 py-1 rounded text-xs text-muted-foreground hover:text-foreground bg-white/5 hover:bg-white/10 opacity-0 group-hover:opacity-100 transition-opacity"
                                  >
                                    Copy
                                  </button>
                                </div>
                              </div>
                            )}
                          </div>
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </div>
                );
              })}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}
