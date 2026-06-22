"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase";
import { Github, X } from "lucide-react";
import type { Provider } from "@supabase/supabase-js";

interface ProviderPickerProps {
  open: boolean;
  onClose: () => void;
  /** Optional intent to resume after login (e.g. pending scan) */
  pendingIntent?: { type: "url" | "repo"; target: string; branch?: string } | null;
}

function GoogleIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor">
      <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" fill="#4285F4"/>
      <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
      <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
      <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
    </svg>
  );
}

export function ProviderPicker({ open, onClose, pendingIntent }: ProviderPickerProps) {
  const [loading, setLoading] = useState<Provider | null>(null);

  if (!open) return null;

  const handleProvider = async (provider: Provider) => {
    setLoading(provider);
    try {
      if (pendingIntent) {
        sessionStorage.setItem("pending_scan", JSON.stringify(pendingIntent));
      }
      const supabase = createClient();
      const currentPath = window.location.pathname + window.location.search;
      document.cookie = `auth_redirect=${encodeURIComponent(currentPath)}; path=/; max-age=600; SameSite=Lax; Secure`;
      await supabase.auth.signInWithOAuth({
        provider,
        options: { redirectTo: `${window.location.origin}/auth/callback` },
      });
    } catch {
      setLoading(null);
    }
  };

  return (
    <div
      className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center"
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div className="glass rounded-2xl border border-white/10 max-w-sm w-full mx-4 p-6 shadow-2xl">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-lg font-semibold text-foreground">Sign in</h2>
          <button
            onClick={onClose}
            className="text-muted-foreground hover:text-foreground transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="space-y-3">
          <button
            onClick={() => handleProvider("github")}
            disabled={loading !== null}
            className="w-full flex items-center gap-3 px-4 py-3 rounded-xl border border-white/15 hover:bg-white/5 transition-colors disabled:opacity-50"
          >
            <Github className="w-5 h-5 text-foreground" />
            <span className="text-sm font-medium text-foreground">
              {loading === "github" ? "Redirecting..." : "Continue with GitHub"}
            </span>
          </button>

          <button
            onClick={() => handleProvider("google")}
            disabled={loading !== null}
            className="w-full flex items-center gap-3 px-4 py-3 rounded-xl border border-white/15 hover:bg-white/5 transition-colors disabled:opacity-50"
          >
            <GoogleIcon className="w-5 h-5" />
            <span className="text-sm font-medium text-foreground">
              {loading === "google" ? "Redirecting..." : "Continue with Google"}
            </span>
          </button>
        </div>

        <p className="text-xs text-muted-foreground text-center mt-4">
          Free — 5 URL scans + 3 repo scans per month
        </p>
      </div>
    </div>
  );
}

/** Standalone helper: sign in directly with a provider (no picker UI). */
export async function signInDirect(
  provider: Provider,
  pendingIntent?: { type: "url" | "repo"; target: string; branch?: string } | null
) {
  if (pendingIntent) {
    sessionStorage.setItem("pending_scan", JSON.stringify(pendingIntent));
  }
  const supabase = createClient();
  const currentPath = window.location.pathname + window.location.search;
  document.cookie = `auth_redirect=${encodeURIComponent(currentPath)}; path=/; max-age=600; SameSite=Lax; Secure`;
  await supabase.auth.signInWithOAuth({
    provider,
    options: { redirectTo: `${window.location.origin}/auth/callback` },
  });
}
