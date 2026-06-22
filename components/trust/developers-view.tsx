"use client";

import { useState, useCallback } from "react";
import Link from "next/link";
import { motion, AnimatePresence } from "framer-motion";
import {
  Shield,
  Key,
  Copy,
  Check,
  ChevronLeft,
  Zap,
  Globe,
  Code2,
  Wrench,
  Eye,
  EyeOff,
  Plus,
  Trash2,
  AlertTriangle,
  Terminal,
  BookOpen,
  Lock,
  Sparkles,
  Bot,
  ExternalLink,
  RefreshCw,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { useSubscription } from "@/lib/subscription";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8080";
const MCP_URL = "https://trust-scan.me/mcp";

// ─── types ────────────────────────────────────────────────────────────────

interface ApiKey {
  id: string;
  name: string;
  key_prefix: string;
  plan: string;
  scans_used: number;
  last_used_at: string | null;
  revoked: boolean;
  created_at: string;
}

// ─── API helpers ──────────────────────────────────────────────────────────

async function fetchKeys(token: string): Promise<ApiKey[]> {
  const r = await fetch(`${API_URL}/api/v1/developer/keys`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!r.ok) throw new Error("키 목록을 불러오지 못했습니다");
  return r.json();
}

async function createKey(token: string, name: string): Promise<{ key: string } & ApiKey> {
  const r = await fetch(`${API_URL}/api/v1/developer/keys`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ name }),
  });
  if (!r.ok) {
    const err = await r.json().catch(() => ({}));
    throw new Error(err.detail || "키 생성에 실패했습니다");
  }
  return r.json();
}

async function issueFreeKey(): Promise<{ key: string; key_prefix: string; message: string }> {
  const r = await fetch(`${API_URL}/api/v1/developer/keys/free`, { method: "POST" });
  if (!r.ok) {
    const err = await r.json().catch(() => ({}));
    throw new Error(err.detail || "키 발급에 실패했습니다");
  }
  return r.json();
}

async function revokeKey(token: string, keyId: string): Promise<void> {
  const r = await fetch(`${API_URL}/api/v1/developer/keys/${keyId}`, {
    method: "DELETE",
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!r.ok) throw new Error("키 폐기에 실패했습니다");
}

// ─── Copy button ──────────────────────────────────────────────────────────

function CopyButton({ text, className = "" }: { text: string; className?: string }) {
  const [copied, setCopied] = useState(false);
  const copy = useCallback(async () => {
    await navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }, [text]);
  return (
    <button
      onClick={copy}
      className={`p-1.5 rounded-md text-muted-foreground/60 hover:text-foreground hover:bg-white/10 transition-colors ${className}`}
    >
      {copied ? <Check className="w-4 h-4 text-green-400" /> : <Copy className="w-4 h-4" />}
    </button>
  );
}

// ─── 데이터 ───────────────────────────────────────────────────────────────

const endpoints = [
  {
    method: "POST",
    path: "/api/v1/scan",
    description: "URL 보안 스캔 시작",
    body: `{ "url": "https://example.com", "scan_mode": "quick" }`,
    response: `{ "scan_id": "uuid", "status": "pending" }`,
    auth: "API Key",
    note: "스캔을 시작하고 scan_id를 반환합니다. 결과는 GET으로 폴링하세요.",
  },
  {
    method: "GET",
    path: "/api/v1/scan/{scan_id}",
    description: "URL 스캔 상태 및 결과 조회",
    body: null,
    response: `{ "status": "completed", "score": 82, "grade": "B", "vulnerabilities": [...] }`,
    auth: "API Key",
    note: "status가 pending / processing이면 3초 후 재요청하세요. completed가 되면 전체 취약점 목록이 포함됩니다.",
  },
  {
    method: "POST",
    path: "/api/v1/repo-scan",
    description: "GitHub 저장소 스캔 시작",
    body: `{ "repo_url": "https://github.com/owner/repo" }`,
    response: `{ "scan_id": "uuid", "status": "pending" }`,
    auth: "API Key",
    note: "SAST(Semgrep) + 시크릿 탐지(Gitleaks) + 의존성 취약점(SCA)을 한 번에 실행합니다.",
  },
  {
    method: "GET",
    path: "/api/v1/repo-scan/{scan_id}",
    description: "저장소 스캔 결과 조회",
    body: null,
    response: `{ "status": "completed", "score": 74, "grade": "C", "vulnerabilities": [...] }`,
    auth: "API Key",
    note: "파일별 취약점, 심각도, 수정 제안이 함께 반환됩니다.",
  },
  {
    method: "POST",
    path: "/api/v1/developer/keys",
    description: "API 키 발급",
    body: `{ "name": "My App" }`,
    response: `{ "id": "uuid", "key": "tsec_...", "key_prefix": "tsec_XXXX", "plan": "free" }`,
    auth: "JWT (로그인 필요)",
    note: "발급된 키는 응답에서 딱 한 번만 표시됩니다. 반드시 안전한 곳에 저장하세요.",
  },
  {
    method: "GET",
    path: "/api/v1/developer/keys",
    description: "내 API 키 목록 조회",
    body: null,
    response: `[{ "id": "uuid", "key_prefix": "tsec_XXXX", "plan": "free", "scans_used": 12 }]`,
    auth: "JWT (로그인 필요)",
    note: "보안상 key_prefix(앞 12자)만 반환됩니다. 전체 키는 다시 확인할 수 없습니다.",
  },
  {
    method: "DELETE",
    path: "/api/v1/developer/keys/{key_id}",
    description: "API 키 폐기",
    body: null,
    response: `204 No Content`,
    auth: "JWT (로그인 필요)",
    note: "폐기된 키는 즉시 인증이 거부됩니다. 복구할 수 없으니 주의하세요.",
  },
];

const mcpTools = [
  { name: "scan_and_wait", desc: "URL을 스캔하고 결과가 나올 때까지 대기 (권장)", tag: "권장" },
  { name: "scan_url", desc: "URL 스캔 시작 (비동기, scan_id 반환)" },
  { name: "get_scan_result", desc: "scan_id로 URL 스캔 결과 조회" },
  { name: "scan_repo_and_wait", desc: "GitHub 저장소 스캔 후 결과까지 대기 (권장)", tag: "권장" },
  { name: "scan_repo", desc: "저장소 스캔 시작 (비동기)" },
  { name: "get_repo_scan_result", desc: "scan_id로 저장소 스캔 결과 조회" },
  { name: "analyze_code_security", desc: "코드 스니펫에서 37개+ 취약점 패턴 검사 (로컬 실행)" },
  { name: "check_secrets", desc: "코드에서 API 키·토큰·비밀번호 노출 탐지 (로컬 실행)" },
  { name: "get_fix_plan", desc: "스캔 결과에 대한 Before/After 수정 코드 플랜 조회" },
];

const rateLimits = [
  { plan: "Free", urlScans: "5회 / 월", repoScans: "3회 / 월", rateLimit: "분당 10 요청" },
  { plan: "Pro", urlScans: "무제한", repoScans: "무제한", rateLimit: "분당 120 요청" },
];

// ─── 키 관리 섹션 ─────────────────────────────────────────────────────────

function KeyManager({ token }: { token: string }) {
  const [keys, setKeys] = useState<ApiKey[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [creating, setCreating] = useState(false);
  const [newKeyName, setNewKeyName] = useState("");
  const [newKeyRaw, setNewKeyRaw] = useState<string | null>(null);
  const [showKey, setShowKey] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [revoking, setRevoking] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setKeys(await fetchKeys(token));
    } catch (e) {
      setError(e instanceof Error ? e.message : "오류가 발생했습니다");
    } finally {
      setLoading(false);
    }
  }, [token]);

  useState(() => { void load(); });

  const handleCreate = async () => {
    if (!newKeyName.trim()) return;
    setCreating(true);
    setError(null);
    try {
      const created = await createKey(token, newKeyName.trim());
      setNewKeyRaw(created.key);
      setShowKey(true);
      setNewKeyName("");
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "키 생성에 실패했습니다");
    } finally {
      setCreating(false);
    }
  };

  const handleRevoke = async (keyId: string) => {
    setRevoking(keyId);
    try {
      await revokeKey(token, keyId);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "키 폐기에 실패했습니다");
    } finally {
      setRevoking(null);
    }
  };

  return (
    <div className="space-y-4">
      {/* 새 키 — 한 번만 표시 */}
      <AnimatePresence>
        {newKeyRaw && (
          <motion.div
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            className="rounded-xl border border-green-400/30 bg-green-400/5 p-4"
          >
            <div className="flex items-center gap-2 mb-2">
              <Check className="w-4 h-4 text-green-400" />
              <span className="text-sm font-medium text-green-400">API 키가 생성됐어요 — 지금 바로 복사해 두세요. 다시 표시되지 않습니다.</span>
            </div>
            <div className="flex items-center gap-2">
              <code className="flex-1 font-mono text-sm text-foreground bg-[#0a0a0f] rounded-lg px-3 py-2 break-all">
                {showKey ? newKeyRaw : newKeyRaw.slice(0, 12) + "••••••••••••••••••••••••"}
              </code>
              <button
                onClick={() => setShowKey((v) => !v)}
                className="p-1.5 text-muted-foreground hover:text-foreground"
              >
                {showKey ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
              <CopyButton text={newKeyRaw} />
              <button onClick={() => setNewKeyRaw(null)} className="p-1.5 text-muted-foreground hover:text-foreground text-xs">✕</button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {error && (
        <div className="rounded-xl border border-destructive/30 bg-destructive/5 p-3 flex items-center gap-2">
          <AlertTriangle className="w-4 h-4 text-destructive shrink-0" />
          <span className="text-sm text-destructive">{error}</span>
        </div>
      )}

      {/* 키 생성 폼 */}
      <div className="flex gap-2">
        <input
          type="text"
          value={newKeyName}
          onChange={(e) => setNewKeyName(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") void handleCreate(); }}
          placeholder="키 이름 (예: 내 CI 서버)"
          maxLength={60}
          className="flex-1 bg-secondary/50 border border-border rounded-xl px-4 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-neon-cyan/50"
        />
        <Button
          onClick={() => void handleCreate()}
          disabled={creating || !newKeyName.trim()}
          className="bg-neon-cyan/10 text-neon-cyan border border-neon-cyan/30 hover:bg-neon-cyan/20 rounded-xl px-4"
        >
          {creating ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
          <span className="ml-1.5">새 키 발급</span>
        </Button>
      </div>

      {loading && (
        <div className="flex items-center gap-2 text-muted-foreground text-sm py-4">
          <RefreshCw className="w-4 h-4 animate-spin" />
          키 목록 불러오는 중…
        </div>
      )}
      {keys && keys.length === 0 && !loading && (
        <p className="text-muted-foreground text-sm py-4 text-center">발급된 API 키가 없습니다. 위에서 새 키를 만들어보세요.</p>
      )}
      {keys && keys.length > 0 && (
        <div className="space-y-2">
          {keys.map((k) => (
            <div
              key={k.id}
              className={`flex items-center gap-3 rounded-xl border px-4 py-3 ${
                k.revoked ? "border-border/30 opacity-50" : "border-border bg-secondary/20"
              }`}
            >
              <Key className="w-4 h-4 text-neon-cyan shrink-0" />
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium text-foreground truncate">{k.name}</span>
                  <span className={`text-[10px] px-1.5 py-0.5 rounded-full border font-mono ${
                    k.plan === "pro"
                      ? "bg-purple-400/10 text-purple-400 border-purple-400/20"
                      : "bg-neon-cyan/10 text-neon-cyan border-neon-cyan/20"
                  }`}>
                    {k.plan}
                  </span>
                  {k.revoked && (
                    <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-destructive/10 text-destructive border border-destructive/20">폐기됨</span>
                  )}
                </div>
                <div className="text-xs text-muted-foreground font-mono mt-0.5">
                  {k.key_prefix}••••••••
                  <span className="ml-3 font-sans">{k.scans_used}회 사용</span>
                  {k.last_used_at && (
                    <span className="ml-3 font-sans">마지막 사용 {new Date(k.last_used_at).toLocaleDateString("ko-KR")}</span>
                  )}
                </div>
              </div>
              {!k.revoked && (
                <button
                  onClick={() => void handleRevoke(k.id)}
                  disabled={revoking === k.id}
                  className="p-1.5 text-muted-foreground/60 hover:text-destructive transition-colors"
                  title="키 폐기"
                >
                  {revoking === k.id
                    ? <RefreshCw className="w-4 h-4 animate-spin" />
                    : <Trash2 className="w-4 h-4" />}
                </button>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── 메인 페이지 ──────────────────────────────────────────────────────────

// ─── 무료 키 즉시 발급 카드 ──────────────────────────────────────────────

function FreeKeyIssuer() {
  const [issuing, setIssuing] = useState(false);
  const [issuedKey, setIssuedKey] = useState<string | null>(null);
  const [showKey, setShowKey] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleIssue = async () => {
    setIssuing(true);
    setError(null);
    try {
      const result = await issueFreeKey();
      setIssuedKey(result.key);
      setShowKey(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : "오류가 발생했습니다");
    } finally {
      setIssuing(false);
    }
  };

  if (issuedKey) {
    return (
      <motion.div
        initial={{ opacity: 0, scale: 0.97 }}
        animate={{ opacity: 1, scale: 1 }}
        className="rounded-2xl border border-green-400/30 bg-green-400/5 p-5"
      >
        <div className="flex items-center gap-2 mb-3">
          <Check className="w-5 h-5 text-green-400" />
          <span className="text-sm font-semibold text-green-400">
            API 키가 발급됐습니다! 지금 바로 복사해 두세요 — 다시 표시되지 않습니다.
          </span>
        </div>
        <div className="flex items-center gap-2">
          <code className="flex-1 font-mono text-sm text-foreground bg-[#0a0a0f] rounded-xl px-4 py-3 break-all">
            {showKey ? issuedKey : issuedKey.slice(0, 12) + "••••••••••••••••••••••••"}
          </code>
          <button
            onClick={() => setShowKey((v) => !v)}
            className="p-2 text-muted-foreground hover:text-foreground shrink-0"
          >
            {showKey ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
          </button>
          <CopyButton text={issuedKey} className="shrink-0" />
        </div>
        <p className="text-xs text-muted-foreground mt-3">
          Free 플랜 · URL 스캔 5회/월 · 저장소 스캔 3회/월 포함
        </p>
      </motion.div>
    );
  }

  return (
    <div className="space-y-3">
      {error && (
        <div className="rounded-xl border border-destructive/30 bg-destructive/5 p-3 flex items-center gap-2">
          <AlertTriangle className="w-4 h-4 text-destructive shrink-0" />
          <span className="text-sm text-destructive">{error}</span>
        </div>
      )}
      <Button
        onClick={() => void handleIssue()}
        disabled={issuing}
        className="w-full h-12 bg-neon-cyan/10 text-neon-cyan border border-neon-cyan/30 hover:bg-neon-cyan/20 rounded-xl text-sm font-semibold"
      >
        {issuing ? (
          <><RefreshCw className="w-4 h-4 animate-spin mr-2" />발급 중…</>
        ) : (
          <><Zap className="w-4 h-4 mr-2" />무료 API 키 즉시 발급받기</>
        )}
      </Button>
      <p className="text-xs text-muted-foreground text-center">
        로그인 불필요 · IP당 하루 3개까지 · 신용카드 불필요
      </p>
    </div>
  );
}

// ─── 메인 페이지 ──────────────────────────────────────────────────────────

export function DevelopersView() {
  const subscription = useSubscription();
  const [activeTab, setActiveTab] = useState<"overview" | "rest" | "mcp" | "keys">("overview");
  const [expandedEndpoint, setExpandedEndpoint] = useState<number | null>(null);

  const token = subscription.accessToken;
  const isLoggedIn = !!subscription.user && !!token;

  return (
    <div className="min-h-screen flex flex-col bg-background">
      {/* 헤더 */}
      <header className="flex items-center justify-between px-6 py-4 border-b border-border/50">
        <div className="flex items-center gap-4">
          <Link
            href="/"
            className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors"
          >
            <ChevronLeft className="w-4 h-4" />
            홈으로
          </Link>
        </div>
        <div className="flex items-center gap-3">
          <Shield className="w-6 h-6 text-neon-cyan" />
          <span className="font-semibold text-foreground">Developer API</span>
          <span className="px-2 py-1 text-xs rounded-full bg-neon-cyan/10 text-neon-cyan border border-neon-cyan/30 font-mono">
            v1
          </span>
        </div>
        <div className="w-32" />
      </header>

      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="flex-1 overflow-auto"
      >
        <div className="max-w-5xl mx-auto p-8">

          {/* 히어로 */}
          <div className="text-center mb-12">
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-neon-cyan/10 border border-neon-cyan/30 mb-4"
            >
              <Zap className="w-8 h-8 text-neon-cyan" />
            </motion.div>
            <h1 className="text-3xl font-bold text-foreground mb-3">
              Gwangju Security Developer API
            </h1>
            <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
              보안 스캔 기능을 내 서비스, CI/CD 파이프라인, AI 에이전트에 직접 연동하세요.
              REST API와 MCP 서버를 모두 지원합니다.
            </p>
          </div>

          {/* 탭 */}
          <div className="flex gap-2 mb-8 flex-wrap">
            {[
              { id: "overview", label: "Overview", icon: BookOpen },
              { id: "rest", label: "REST API", icon: Globe },
              { id: "mcp", label: "MCP Server", icon: Bot },
              { id: "keys", label: "API Keys", icon: Key },
            ].map(({ id, label, icon: Icon }) => (
              <button
                key={id}
                onClick={() => setActiveTab(id as typeof activeTab)}
                className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all ${
                  activeTab === id
                    ? "bg-neon-cyan/10 text-neon-cyan border border-neon-cyan/30"
                    : "bg-secondary/50 text-muted-foreground hover:text-foreground border border-transparent"
                }`}
              >
                <Icon className="w-4 h-4" />
                {label}
              </button>
            ))}
          </div>

          <AnimatePresence mode="wait">

            {/* ── OVERVIEW ── */}
            {activeTab === "overview" && (
              <motion.div
                key="overview"
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -8 }}
                className="space-y-6"
              >
                {/* 무료 키 즉시 발급 */}
                <div className="glass rounded-2xl p-6 border border-neon-cyan/20">
                  <h2 className="text-lg font-semibold text-foreground mb-1 flex items-center gap-2">
                    <Key className="w-5 h-5 text-neon-cyan" />
                    API 키 무료 발급
                  </h2>
                  <p className="text-sm text-muted-foreground mb-4">
                    로그인 없이 버튼 한 번으로 즉시 발급됩니다. 발급된 키는 한 번만 표시되니 바로 복사해 두세요.
                  </p>
                  <FreeKeyIssuer />
                </div>

                {/* 빠른 시작 */}
                <div className="glass rounded-2xl p-6">
                  <h2 className="text-lg font-semibold text-foreground mb-4 flex items-center gap-2">
                    <Sparkles className="w-5 h-5 text-neon-cyan" />
                    Quick Start
                  </h2>
                  <ol className="space-y-3 text-sm text-muted-foreground list-decimal list-inside">
                    <li>
                      <span className="text-foreground font-medium">API 키 발급</span>{" "}
                      — 위 버튼으로 바로 받거나, <span className="text-neon-cyan">API Keys</span> 탭에서 관리하세요.
                    </li>
                    <li>
                      <span className="text-foreground font-medium">요청 헤더에 키 추가</span>{" "}
                      —{" "}
                      <code className="bg-secondary/80 px-1.5 py-0.5 rounded text-xs font-mono text-foreground">X-MCP-Api-Key: tsec_...</code>
                    </li>
                    <li>
                      <span className="text-foreground font-medium">스캔 엔드포인트 호출</span>{" "}
                      — 결과를 폴링하거나, MCP 서버를 통해 Claude / Cursor에서 바로 사용하세요.
                    </li>
                  </ol>
                </div>

                {/* curl 예제 */}
                <div className="glass rounded-2xl p-6">
                  <h2 className="text-lg font-semibold text-foreground mb-1 flex items-center gap-2">
                    <Terminal className="w-5 h-5 text-neon-cyan" />
                    예제: URL 스캔
                  </h2>
                  <p className="text-sm text-muted-foreground mb-4">
                    스캔을 시작하고 3초 간격으로 폴링하면 30초 이내에 결과를 받을 수 있습니다.
                  </p>
                  <div className="relative">
                    <pre className="bg-[#0a0a0f] rounded-xl p-4 font-mono text-sm overflow-x-auto text-foreground/90">
{`# 1. 스캔 시작
curl -X POST https://api.trust-scan.me/api/v1/scan \\
  -H "Content-Type: application/json" \\
  -H "X-MCP-Api-Key: tsec_YOUR_KEY" \\
  -d '{"url":"https://example.com","scan_mode":"quick"}'

# → { "scan_id": "abc-123", "status": "pending" }

# 2. 결과 조회 (status가 completed 될 때까지 반복)
curl https://api.trust-scan.me/api/v1/scan/abc-123 \\
  -H "X-MCP-Api-Key: tsec_YOUR_KEY"

# → { "status": "completed", "score": 82, "grade": "B", ... }`}
                    </pre>
                    <CopyButton
                      text={`curl -X POST https://api.trust-scan.me/api/v1/scan -H "Content-Type: application/json" -H "X-MCP-Api-Key: tsec_YOUR_KEY" -d '{"url":"https://example.com","scan_mode":"quick"}'`}
                      className="absolute top-3 right-3"
                    />
                  </div>
                </div>

                {/* 요금 및 한도 */}
                <div className="glass rounded-2xl p-6">
                  <h2 className="text-lg font-semibold text-foreground mb-4 flex items-center gap-2">
                    <Lock className="w-5 h-5 text-neon-cyan" />
                    요금제별 사용 한도
                  </h2>
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b border-border/50">
                          <th className="text-left py-2 pr-6 text-muted-foreground font-medium">플랜</th>
                          <th className="text-left py-2 pr-6 text-muted-foreground font-medium">URL 스캔</th>
                          <th className="text-left py-2 pr-6 text-muted-foreground font-medium">저장소 스캔</th>
                          <th className="text-left py-2 text-muted-foreground font-medium">Rate Limit</th>
                        </tr>
                      </thead>
                      <tbody>
                        {rateLimits.map((r) => (
                          <tr key={r.plan} className="border-b border-border/20">
                            <td className="py-3 pr-6 font-medium text-foreground">{r.plan}</td>
                            <td className="py-3 pr-6 text-muted-foreground">{r.urlScans}</td>
                            <td className="py-3 pr-6 text-muted-foreground">{r.repoScans}</td>
                            <td className="py-3 text-muted-foreground">{r.rateLimit}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  <p className="text-xs text-muted-foreground mt-3">
                    API 키 사용량은 웹 UI 스캔 횟수와 별도로 집계됩니다.{" "}
                    <Link href="/pricing" className="text-neon-cyan hover:underline">요금제 자세히 보기 →</Link>
                  </p>
                </div>

                {/* 인증 방법 */}
                <div className="glass rounded-2xl p-6 border border-neon-cyan/20">
                  <h2 className="text-lg font-semibold text-foreground mb-2 flex items-center gap-2">
                    <Key className="w-5 h-5 text-neon-cyan" />
                    인증 방법
                  </h2>
                  <p className="text-sm text-muted-foreground mb-3">
                    모든 API 요청에 아래 헤더를 추가하세요.
                  </p>
                  <div className="relative">
                    <pre className="bg-[#0a0a0f] rounded-xl p-3 font-mono text-sm text-foreground/90">
                      X-MCP-Api-Key: tsec_YOUR_KEY_HERE
                    </pre>
                    <CopyButton text="X-MCP-Api-Key: tsec_YOUR_KEY_HERE" className="absolute top-2 right-2" />
                  </div>
                  <p className="text-xs text-muted-foreground mt-3">
                    키는 항상 <code className="font-mono text-neon-cyan">tsec_</code>로 시작하며,
                    API Keys 탭에서 발급받을 수 있습니다.
                    발급 직후에만 전체 값이 표시되므로 즉시 안전한 곳에 저장하세요.
                  </p>
                </div>
              </motion.div>
            )}

            {/* ── REST API ── */}
            {activeTab === "rest" && (
              <motion.div
                key="rest"
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -8 }}
                className="glass rounded-2xl p-6"
              >
                <h2 className="text-lg font-semibold text-foreground mb-1 flex items-center gap-2">
                  <Globe className="w-5 h-5 text-neon-cyan" />
                  REST API 레퍼런스
                </h2>
                <p className="text-sm text-muted-foreground mb-6">
                  Base URL: <code className="font-mono text-neon-cyan">https://api.trust-scan.me</code>
                  &nbsp;— 엔드포인트를 클릭하면 요청/응답 예시를 확인할 수 있어요.
                </p>
                <div className="space-y-3">
                  {endpoints.map((ep, i) => (
                    <div key={i} className="bg-secondary/30 rounded-xl border border-border/50 overflow-hidden">
                      <button
                        onClick={() => setExpandedEndpoint(expandedEndpoint === i ? null : i)}
                        className="w-full flex items-center gap-3 px-4 py-3 hover:bg-secondary/50 transition-colors text-left"
                      >
                        <span className={`font-mono text-xs px-2 py-1 rounded font-bold shrink-0 ${
                          ep.method === "GET"
                            ? "bg-green-400/10 text-green-400"
                            : ep.method === "POST"
                            ? "bg-blue-400/10 text-blue-400"
                            : "bg-red-400/10 text-red-400"
                        }`}>
                          {ep.method}
                        </span>
                        <code className="font-mono text-sm text-foreground flex-1 truncate">{ep.path}</code>
                        <span className="text-xs text-muted-foreground hidden sm:block shrink-0">{ep.description}</span>
                        <span className="text-muted-foreground text-xs shrink-0">{expandedEndpoint === i ? "▲" : "▼"}</span>
                      </button>

                      <AnimatePresence>
                        {expandedEndpoint === i && (
                          <motion.div
                            initial={{ height: 0, opacity: 0 }}
                            animate={{ height: "auto", opacity: 1 }}
                            exit={{ height: 0, opacity: 0 }}
                            className="border-t border-border/30 px-4 py-4 space-y-3"
                          >
                            <p className="text-sm text-foreground font-medium">{ep.description}</p>
                            <p className="text-sm text-muted-foreground">{ep.note}</p>
                            <div className="flex items-center gap-2 text-xs">
                              <Lock className="w-3 h-3 text-muted-foreground" />
                              <span className="text-muted-foreground">인증: <span className="text-foreground">{ep.auth}</span></span>
                            </div>
                            {ep.body && (
                              <div>
                                <p className="text-xs text-muted-foreground mb-1">요청 본문 (Request body)</p>
                                <div className="relative">
                                  <pre className="bg-[#0a0a0f] rounded-lg p-3 font-mono text-xs text-foreground/80 overflow-x-auto">
                                    {ep.body}
                                  </pre>
                                  <CopyButton text={ep.body} className="absolute top-1.5 right-1.5" />
                                </div>
                              </div>
                            )}
                            <div>
                              <p className="text-xs text-muted-foreground mb-1">응답 예시 (Response)</p>
                              <pre className="bg-[#0a0a0f] rounded-lg p-3 font-mono text-xs text-foreground/80 overflow-x-auto">
                                {ep.response}
                              </pre>
                            </div>
                          </motion.div>
                        )}
                      </AnimatePresence>
                    </div>
                  ))}
                </div>
              </motion.div>
            )}

            {/* ── MCP ── */}
            {activeTab === "mcp" && (
              <motion.div
                key="mcp"
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -8 }}
                className="space-y-6"
              >
                <div className="glass rounded-2xl p-6">
                  <div className="flex items-start gap-4 mb-6">
                    <div className="w-12 h-12 rounded-xl bg-neon-cyan/10 border border-neon-cyan/30 flex items-center justify-center shrink-0">
                      <Bot className="w-6 h-6 text-neon-cyan" />
                    </div>
                    <div>
                      <h2 className="text-lg font-semibold text-foreground mb-1">MCP Server</h2>
                      <p className="text-sm text-muted-foreground">
                        Claude Desktop, Claude Code, Cursor 등 MCP를 지원하는 모든 AI 도구에서
                        광주 보안관의 스캔 기능을 직접 사용할 수 있습니다.
                        별도 설치 없이 URL 하나만 추가하면 됩니다.
                      </p>
                    </div>
                  </div>

                  <div className="mb-6">
                    <p className="text-xs text-muted-foreground mb-1">MCP Server URL (HTTP transport)</p>
                    <div className="relative">
                      <pre className="bg-[#0a0a0f] rounded-xl p-3 font-mono text-sm text-neon-cyan">
                        {MCP_URL}
                      </pre>
                      <CopyButton text={MCP_URL} className="absolute top-2 right-2" />
                    </div>
                  </div>

                  <div className="mb-6">
                    <p className="text-xs text-muted-foreground mb-1">Claude Code에 추가하기 (터미널 명령어 한 줄)</p>
                    <div className="relative">
                      <pre className="bg-[#0a0a0f] rounded-xl p-3 font-mono text-sm text-foreground/90">
                        {`claude mcp add --transport http trust-security "${MCP_URL}"`}
                      </pre>
                      <CopyButton text={`claude mcp add --transport http trust-security "${MCP_URL}"`} className="absolute top-2 right-2" />
                    </div>
                  </div>

                  <div>
                    <p className="text-xs text-muted-foreground mb-1">
                      Claude Desktop 설정 파일{" "}
                      <span className="font-mono">~/Library/Application Support/Claude/claude_desktop_config.json</span>
                    </p>
                    <div className="relative">
                      <pre className="bg-[#0a0a0f] rounded-xl p-3 font-mono text-sm text-foreground/90">
{`{
  "mcpServers": {
    "trust-security": {
      "type": "http",
      "url": "${MCP_URL}"
    }
  }
}`}
                      </pre>
                      <CopyButton
                        text={`{\n  "mcpServers": {\n    "trust-security": {\n      "type": "http",\n      "url": "${MCP_URL}"\n    }\n  }\n}`}
                        className="absolute top-2 right-2"
                      />
                    </div>
                  </div>
                </div>

                {/* 툴 목록 */}
                <div className="glass rounded-2xl p-6">
                  <h2 className="text-lg font-semibold text-foreground mb-2 flex items-center gap-2">
                    <Wrench className="w-5 h-5 text-neon-cyan" />
                    사용 가능한 Tools
                    <span className="text-xs text-muted-foreground font-normal ml-1">9개</span>
                  </h2>
                  <p className="text-sm text-muted-foreground mb-4">
                    AI 에이전트가 자연어 명령으로 아래 기능을 직접 호출합니다.
                    <code className="font-mono text-neon-cyan mx-1">api_key</code> 파라미터로 발급받은 키를 전달하세요.
                  </p>
                  <div className="grid gap-3 sm:grid-cols-2">
                    {mcpTools.map((t) => (
                      <div key={t.name} className="bg-secondary/30 rounded-xl p-4 border border-border/50">
                        <div className="flex items-center gap-2 mb-1">
                          <code className="font-mono text-sm text-neon-cyan">{t.name}</code>
                          {t.tag && (
                            <span className="px-1.5 py-0.5 text-[10px] rounded-full bg-neon-cyan/10 text-neon-cyan border border-neon-cyan/20">
                              {t.tag}
                            </span>
                          )}
                        </div>
                        <p className="text-sm text-muted-foreground">{t.desc}</p>
                      </div>
                    ))}
                  </div>
                </div>

                {/* MCP 리소스 */}
                <div className="glass rounded-2xl p-6 border border-neon-cyan/20">
                  <h2 className="text-lg font-semibold text-foreground mb-2 flex items-center gap-2">
                    <Sparkles className="w-5 h-5 text-neon-cyan" />
                    Context Resources
                    <span className="px-1.5 py-0.5 text-[10px] rounded-full bg-neon-cyan/10 text-neon-cyan border border-neon-cyan/20 ml-1">
                      자동 로드
                    </span>
                  </h2>
                  <p className="text-sm text-muted-foreground mb-4">
                    MCP Resource는 AI 에이전트가 대화를 시작할 때 자동으로 컨텍스트로 로드됩니다.
                    별도 호출 없이도 최근 스캔 현황을 AI가 바로 파악할 수 있습니다.
                  </p>
                  <div className="space-y-2">
                    {[
                      { uri: "trust://scans/latest", desc: "가장 최근 스캔 — 점수, 등급, 취약점 수" },
                      { uri: "trust://scans/history", desc: "최근 10건의 스캔 기록과 대상 URL, 점수" },
                      { uri: "trust://security/posture", desc: "평균 점수, 추세 방향, 등급 분포" },
                    ].map((r) => (
                      <div key={r.uri} className="flex items-start gap-3 text-sm">
                        <code className="text-neon-cyan/80 font-mono shrink-0 mt-0.5">{r.uri}</code>
                        <span className="text-muted-foreground">{r.desc}</span>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="text-center">
                  <Link
                    href="/mcp"
                    className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-neon-cyan transition-colors"
                  >
                    MCP 전체 가이드 보기
                    <ExternalLink className="w-4 h-4" />
                  </Link>
                </div>
              </motion.div>
            )}

            {/* ── API KEYS ── */}
            {activeTab === "keys" && (
              <motion.div
                key="keys"
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -8 }}
                className="space-y-6"
              >
                {/* 비로그인: 무료 즉시 발급 + 로그인 안내 */}
                {!isLoggedIn && (
                  <div className="glass rounded-2xl p-6 border border-neon-cyan/20">
                    <h2 className="text-lg font-semibold text-foreground mb-1 flex items-center gap-2">
                      <Key className="w-5 h-5 text-neon-cyan" />
                      API 키 무료 발급
                    </h2>
                    <p className="text-sm text-muted-foreground mb-5">
                      로그인 없이 지금 바로 받을 수 있습니다. 키는 한 번만 표시되니 즉시 복사해 두세요.
                    </p>
                    <FreeKeyIssuer />
                    <div className="mt-5 pt-5 border-t border-border/30 flex items-center gap-3">
                      <p className="text-xs text-muted-foreground flex-1">
                        로그인하면 최대 5개의 키를 발급·관리하고 사용 현황을 확인할 수 있어요.
                      </p>
                      <Link href="/">
                        <Button variant="outline" className="rounded-xl border-border text-muted-foreground hover:text-foreground text-xs shrink-0">
                          로그인하기
                        </Button>
                      </Link>
                    </div>
                  </div>
                )}
                {isLoggedIn && (
                  <div className="glass rounded-2xl p-6">
                    <h2 className="text-lg font-semibold text-foreground mb-1 flex items-center gap-2">
                      <Key className="w-5 h-5 text-neon-cyan" />
                      내 API 키
                    </h2>
                    <p className="text-sm text-muted-foreground mb-6">
                      계정당 최대 5개의 키를 발급할 수 있습니다. 키는 항상{" "}
                      <code className="font-mono text-neon-cyan">tsec_</code>로 시작하며,
                      발급 직후에만 전체 값을 확인할 수 있으니 즉시 저장해 두세요.
                    </p>
                    <KeyManager token={token!} />
                  </div>
                )}

                {/* Python 예제 */}
                <div className="glass rounded-2xl p-6">
                  <h2 className="text-lg font-semibold text-foreground mb-1 flex items-center gap-2">
                    <Code2 className="w-5 h-5 text-neon-cyan" />
                    Python 사용 예제
                  </h2>
                  <p className="text-sm text-muted-foreground mb-4">
                    스캔 시작 후 완료될 때까지 자동으로 폴링하는 간단한 함수입니다.
                  </p>
                  <div className="relative">
                    <pre className="bg-[#0a0a0f] rounded-xl p-4 font-mono text-sm overflow-x-auto text-foreground/90">
{`import httpx, time

API_BASE = "https://api.trust-scan.me/api/v1"
API_KEY  = "tsec_YOUR_KEY"
HEADERS  = {"X-MCP-Api-Key": API_KEY}

def scan_and_wait(url: str, timeout: int = 120) -> dict:
    # 스캔 시작
    r = httpx.post(f"{API_BASE}/scan",
                   json={"url": url, "scan_mode": "quick"},
                   headers=HEADERS)
    r.raise_for_status()
    scan_id = r.json()["scan_id"]

    # 결과 폴링
    deadline = time.time() + timeout
    while time.time() < deadline:
        r = httpx.get(f"{API_BASE}/scan/{scan_id}", headers=HEADERS)
        data = r.json()
        if data["status"] not in ("pending", "processing"):
            return data
        time.sleep(3)
    raise TimeoutError("스캔이 제한 시간 내에 완료되지 않았습니다")

result = scan_and_wait("https://example.com")
print(f"점수: {result['score']}점  등급: {result['grade']}")`}
                    </pre>
                    <CopyButton
                      text={`import httpx, time\n\nAPI_BASE = "https://api.trust-scan.me/api/v1"\nAPI_KEY  = "tsec_YOUR_KEY"\nHEADERS  = {"X-MCP-Api-Key": API_KEY}\n\ndef scan_and_wait(url: str, timeout: int = 120) -> dict:\n    r = httpx.post(f"{API_BASE}/scan",\n                   json={"url": url, "scan_mode": "quick"},\n                   headers=HEADERS)\n    r.raise_for_status()\n    scan_id = r.json()["scan_id"]\n\n    deadline = time.time() + timeout\n    while time.time() < deadline:\n        r = httpx.get(f"{API_BASE}/scan/{scan_id}", headers=HEADERS)\n        data = r.json()\n        if data["status"] not in ("pending", "processing"):\n            return data\n        time.sleep(3)\n    raise TimeoutError("스캔이 제한 시간 내에 완료되지 않았습니다")\n\nresult = scan_and_wait("https://example.com")\nprint(f"점수: {result['score']}점  등급: {result['grade']}")`}
                      className="absolute top-3 right-3"
                    />
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </motion.div>
    </div>
  );
}
