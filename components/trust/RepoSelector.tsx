"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Command } from "cmdk";
import { Github, ChevronsUpDown, Lock, Check, Loader2, X } from "lucide-react";
import { getGitHubRepos, type GitHubRepo } from "@/lib/api";
import { formatTimeAgo } from "@/lib/formatters";
import { cn } from "@/lib/utils";

interface RepoSelectorProps {
  /** Supabase JWT for the backend call. */
  authToken: string | null;
  /** The user's id — used to scope the localStorage key per user. */
  userId: string | null;
  /** Currently selected repo full_name, or null = "None". */
  value: string | null;
  /** Called with new selection. Second arg is the full repo object (or null)
   *  so callers can pull homepage/default_branch without re-querying. */
  onChange: (repoFullName: string | null, repo: GitHubRepo | null) => void;
  /** Compact width for inline layout; omit for full-width. */
  className?: string;
  /** Override the default label copy (e.g. "Scan source of"). */
  label?: string;
  /** Override the placeholder shown when nothing is selected. */
  placeholder?: string;
  /** Hide the inline "x" clear button — used when the selector is required. */
  hideClear?: boolean;
  /** Strip the trigger's own border/bg/padding so it blends inside a parent
   *  input pill. Also hides the uppercase prefix label. Use when the parent
   *  already provides the pill chrome (icon, padding, border). */
  bare?: boolean;
}

const LS_KEY_PREFIX = "trust:lastSelectedRepo:";

/**
 * Compact combobox for selecting a GitHub repo to seed URL-scan routes from.
 * - Self-fetches repos via /api/github/repos on first open (then caches).
 * - On fetch error (4xx/5xx) it calls onChange(null) and hides itself.
 * - Persists last selection in localStorage, scoped per-user.
 */
export function RepoSelector({
  authToken,
  userId,
  value,
  onChange,
  className,
  label,
  placeholder,
  hideClear,
  bare,
}: RepoSelectorProps) {
  const [open, setOpen] = useState(false);
  const [repos, setRepos] = useState<GitHubRepo[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [failed, setFailed] = useState(false);
  const [query, setQuery] = useState("");

  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);

  const lsKey = userId ? `${LS_KEY_PREFIX}${userId}` : null;

  // Rehydrate last selection (per-user) once we know the user.
  useEffect(() => {
    if (!lsKey) return;
    if (value !== null) return;
    try {
      const saved = window.localStorage.getItem(lsKey);
      if (saved) onChange(saved, null); // repo object not yet available; parent can look it up after fetch
    } catch {
      // localStorage unavailable — ignore
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lsKey]);

  // Persist current selection.
  useEffect(() => {
    if (!lsKey) return;
    try {
      if (value) window.localStorage.setItem(lsKey, value);
      else window.localStorage.removeItem(lsKey);
    } catch {
      // ignore
    }
  }, [lsKey, value]);

  const fetchRepos = useCallback(async () => {
    if (!authToken || loading || repos !== null || failed) return;
    setLoading(true);
    try {
      const res = await getGitHubRepos(authToken);
      setRepos(res.repos || []);
    } catch (err) {
      console.error("[RepoSelector] failed to fetch repos:", err);
      setFailed(true);
      // Per spec: silently hide; do not block scan.
      onChange(null, null);
    } finally {
      setLoading(false);
    }
  }, [authToken, loading, repos, failed, onChange]);

  // Fetch on mount so the trigger label can resolve immediately
  // (e.g. "private repo" badge for the saved value).
  useEffect(() => {
    if (!authToken) return;
    fetchRepos();
  }, [authToken, fetchRepos]);

  // Close on outside click / escape.
  useEffect(() => {
    if (!open) return;
    const onClickOutside = (e: MouseEvent) => {
      if (!containerRef.current) return;
      if (!containerRef.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onClickOutside);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onClickOutside);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const selectedRepo = useMemo(
    () => (value && repos ? repos.find((r) => r.full_name === value) : null),
    [value, repos]
  );

  // Error state: hide entirely.
  if (failed) return null;

  const hasRepos = repos !== null && repos.length > 0;
  const isEmpty = repos !== null && repos.length === 0;

  const handleSelect = (fullName: string | null) => {
    const repo = fullName && repos ? repos.find((r) => r.full_name === fullName) ?? null : null;
    onChange(fullName, repo);
    setOpen(false);
    setQuery("");
    // Return focus to trigger for keyboard flow.
    requestAnimationFrame(() => triggerRef.current?.focus());
  };

  // Once repos are loaded, resurface the rehydrated value's metadata so the
  // parent can react (e.g. auto-fill URL from homepage) without a second click.
  useEffect(() => {
    if (!value || !repos) return;
    const match = repos.find((r) => r.full_name === value) ?? null;
    if (match) onChange(value, match);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [repos]);

  return (
    <div ref={containerRef} className={cn("relative w-full", className)}>
      <div className="flex items-center gap-2">
        {!bare && (
          <span className="text-[11px] uppercase tracking-wider text-muted-foreground/80 whitespace-nowrap hidden sm:inline">
            {label ?? "Use routes from"}
          </span>
        )}
        <button
          ref={triggerRef}
          type="button"
          onClick={() => {
            setOpen((o) => !o);
            fetchRepos();
          }}
          disabled={loading && !hasRepos}
          aria-haspopup="listbox"
          aria-expanded={open}
          aria-label="Select GitHub repo to seed scan routes"
          className={cn(
            "group flex-1 min-w-0 flex items-center gap-3 text-left",
            bare
              ? "py-2 text-sm sm:text-lg bg-transparent border-none outline-none focus:outline-none"
              : cn(
                  "px-4 py-3 rounded-xl text-base min-h-[52px]",
                  "border border-white/10 bg-white/[0.02] hover:border-neon-cyan/30 hover:bg-white/[0.04]",
                  "transition-colors",
                  "focus:outline-none focus-visible:border-neon-cyan/50 focus-visible:ring-1 focus-visible:ring-neon-cyan/30",
                  open && "border-neon-cyan/40 bg-white/[0.04]"
                )
          )}
        >
          {!bare && (
            <Github className="w-5 h-5 text-neon-cyan/80 shrink-0" aria-hidden="true" />
          )}
          <span className="flex-1 min-w-0 truncate">
            {loading && !repos ? (
              <span className="inline-flex items-center gap-2 text-muted-foreground">
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                Loading repos…
              </span>
            ) : selectedRepo ? (
              <span className="inline-flex items-center gap-2 text-foreground">
                <span className="truncate">{selectedRepo.full_name}</span>
                {selectedRepo.private && (
                  <Lock className="w-3 h-3 text-muted-foreground shrink-0" aria-label="private" />
                )}
              </span>
            ) : value ? (
              // We have a saved value but repos not yet loaded — show the raw name.
              <span className="truncate text-foreground/90">{value}</span>
            ) : (
              <span className="text-muted-foreground">{placeholder ?? "None (URL-only scan)"}</span>
            )}
          </span>
          {value && !loading && !hideClear && (
            <span
              role="button"
              tabIndex={0}
              aria-label="Clear repo selection"
              onClick={(e) => {
                e.stopPropagation();
                handleSelect(null);
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  e.stopPropagation();
                  handleSelect(null);
                }
              }}
              className="p-0.5 rounded hover:bg-white/10 text-muted-foreground hover:text-foreground shrink-0"
            >
              <X className="w-3.5 h-3.5" />
            </span>
          )}
          <ChevronsUpDown className="w-3.5 h-3.5 text-muted-foreground/60 shrink-0" aria-hidden="true" />
        </button>
      </div>

      {open && (
        <div
          className={cn(
            "absolute z-50 mt-2 w-full min-w-[260px] rounded-xl overflow-hidden",
            "glass-strong border border-neon-cyan/20 shadow-[0_8px_32px_rgba(0,243,255,0.08)]",
            "backdrop-blur-xl"
          )}
        >
          <Command
            loop
            filter={(value, search) => {
              if (!search) return 1;
              return value.toLowerCase().includes(search.toLowerCase()) ? 1 : 0;
            }}
            className="w-full"
          >
            <div className="flex items-center gap-2 px-3 py-2 border-b border-white/5">
              <Github className="w-3.5 h-3.5 text-muted-foreground/70" />
              <Command.Input
                autoFocus
                value={query}
                onValueChange={setQuery}
                placeholder={hasRepos ? "Search your repos…" : "Search…"}
                className="flex-1 bg-transparent outline-none text-sm text-foreground placeholder:text-muted-foreground/60"
              />
            </div>
            <Command.List className="max-h-64 overflow-y-auto p-1">
              {loading && !hasRepos && (
                <div className="flex items-center gap-2 px-3 py-4 text-sm text-muted-foreground">
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Fetching your repos…
                </div>
              )}

              {isEmpty && !loading && (
                <div className="px-3 py-4 text-sm text-muted-foreground">
                  No repos accessible.{" "}
                  <span className="text-foreground/70">
                    Scan will proceed without GitHub routes.
                  </span>
                </div>
              )}

              {hasRepos && (
                <>
                  <Command.Empty className="px-3 py-4 text-sm text-muted-foreground">
                    No repos match &quot;{query}&quot;.
                  </Command.Empty>

                  {/* None option */}
                  <Command.Item
                    value="__none__ none url only"
                    onSelect={() => handleSelect(null)}
                    className={cn(
                      "flex items-center gap-2 px-3 py-2 rounded-lg cursor-pointer text-sm",
                      "text-foreground/90 aria-selected:bg-white/[0.06] aria-selected:text-foreground",
                      "transition-colors"
                    )}
                  >
                    <span className="w-4 h-4 flex items-center justify-center shrink-0">
                      {value === null && <Check className="w-3.5 h-3.5 text-neon-cyan" />}
                    </span>
                    <span className="flex-1">None</span>
                    <span className="text-[11px] text-muted-foreground/70">URL-only</span>
                  </Command.Item>

                  <div className="h-px bg-white/5 my-1" />

                  {repos!.map((repo) => (
                    <Command.Item
                      key={repo.full_name}
                      value={`${repo.full_name} ${repo.language ?? ""}`}
                      onSelect={() => handleSelect(repo.full_name)}
                      className={cn(
                        "flex items-center gap-2 px-3 py-2 rounded-lg cursor-pointer text-sm",
                        "text-foreground/90 aria-selected:bg-neon-cyan/10 aria-selected:text-foreground",
                        "transition-colors"
                      )}
                    >
                      <span className="w-4 h-4 flex items-center justify-center shrink-0">
                        {value === repo.full_name && (
                          <Check className="w-3.5 h-3.5 text-neon-cyan" />
                        )}
                      </span>
                      <span className="flex-1 min-w-0 truncate">{repo.full_name}</span>
                      <span className="flex items-center gap-1.5 shrink-0">
                        {repo.private && (
                          <span className="inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded bg-white/5 text-muted-foreground">
                            <Lock className="w-2.5 h-2.5" />
                            Private
                          </span>
                        )}
                        {repo.language && (
                          <span className="text-[10px] text-muted-foreground hidden sm:inline">
                            {repo.language}
                          </span>
                        )}
                        {repo.pushed_at && (
                          <span className="text-[10px] text-muted-foreground/70 hidden sm:inline">
                            {formatTimeAgo(repo.pushed_at)}
                          </span>
                        )}
                      </span>
                    </Command.Item>
                  ))}
                </>
              )}
            </Command.List>
            <div className="px-3 py-1.5 border-t border-white/5 text-[10px] text-muted-foreground/60 flex items-center gap-2">
              <span className="hidden sm:inline">↑↓ navigate</span>
              <span className="hidden sm:inline">·</span>
              <span>↵ select</span>
              <span>·</span>
              <span>Esc close</span>
            </div>
          </Command>
        </div>
      )}
    </div>
  );
}
