"use client";

import { useState, useEffect, useRef } from "react";
import { createClient } from "@/lib/supabase";
import { LogOut, User, History, Settings } from "lucide-react";
import { trackSignupClicked } from "@/lib/analytics";
import { ProviderPicker } from "@/components/trust/ProviderPicker";
import type { User as SupabaseUser, Session } from "@supabase/supabase-js";

/** Delete all Supabase auth cookies from the browser. */
function clearSupabaseCookies() {
  document.cookie.split(";").forEach((c) => {
    const name = c.trim().split("=")[0];
    if (name.startsWith("sb-")) {
      document.cookie = `${name}=; path=/; expires=Thu, 01 Jan 1970 00:00:00 GMT`;
    }
  });
}

interface AuthButtonProps {
  /** Pre-loaded user from parent — skips independent fetch when provided */
  initialUser?: SupabaseUser | null;
  /** Pre-loaded plan from parent */
  initialPlan?: string | null;
}

export function AuthButton({ initialUser, initialPlan }: AuthButtonProps = {}) {
  const [user, setUser] = useState<SupabaseUser | null>(initialUser ?? null);
  const [plan, setPlan] = useState<string | null>(initialPlan ?? null);
  const [open, setOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Sync with parent props when they change
  useEffect(() => {
    if (initialUser !== undefined) setUser(initialUser);
  }, [initialUser]);
  useEffect(() => {
    if (initialPlan !== undefined) setPlan(initialPlan);
  }, [initialPlan]);

  useEffect(() => {
    // If parent already provided user, skip independent fetch
    if (initialUser !== undefined) return;

    const supabase = createClient();

    async function loadPlan(session: Session) {
      const res = await fetch(
        `${process.env.NEXT_PUBLIC_SUPABASE_URL}/rest/v1/users?id=eq.${session.user.id}&select=plan`,
        {
          headers: {
            apikey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
            Authorization: `Bearer ${session.access_token}`,
          },
        }
      );
      if (res.ok) {
        const data = await res.json();
        setPlan(data?.[0]?.plan ?? "free");
      } else {
        setPlan("free");
      }
    }

    supabase.auth.getUser().then(({ data: { user: freshUser } }: { data: { user: SupabaseUser | null } }) => {
      setUser(freshUser ?? null);
      if (freshUser) {
        supabase.auth.getSession().then(({ data: { session } }: { data: { session: Session | null } }) => {
          if (session) loadPlan(session);
        });
      }
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event: string, session: Session | null) => {
      setUser(session?.user ?? null);
      if (session) loadPlan(session);
      else setPlan(null);
    });

    return () => subscription.unsubscribe();
  }, [initialUser]);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const [pickerOpen, setPickerOpen] = useState(false);

  const handleSignOut = async () => {
    const supabase = createClient();
    await supabase.auth.signOut();
    clearSupabaseCookies();
    window.location.href = "/";
  };

  if (!user) {
    return (
      <>
        <button
          onClick={() => { trackSignupClicked("header"); setPickerOpen(true); }}
          className="flex items-center gap-2 px-4 py-2 rounded-lg border border-neon-cyan/30 text-neon-cyan hover:bg-neon-cyan/10 hover:border-neon-cyan/50 transition-colors text-sm font-medium"
        >
          <User className="w-4 h-4" />
          Sign in
        </button>
        <ProviderPicker open={pickerOpen} onClose={() => setPickerOpen(false)} />
      </>
    );
  }

  const avatarUrl = user.user_metadata?.avatar_url as string | undefined;
  const username = (user.user_metadata?.user_name ?? user.user_metadata?.full_name ?? user.email?.split("@")[0]) as string | undefined;
  const isPro = plan === "pro";

  return (
    <div className="relative" ref={dropdownRef}>
      <button
        onClick={() => setOpen((o) => !o)}
        className="flex items-center gap-2 px-3 py-1.5 rounded-lg border border-white/10 hover:border-white/20 transition-colors"
        aria-haspopup="true"
        aria-expanded={open}
      >
        {avatarUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={avatarUrl}
            alt={username ?? "avatar"}
            className="w-6 h-6 rounded-full"
          />
        ) : (
          <div className="w-6 h-6 rounded-full bg-neon-cyan/20 flex items-center justify-center">
            <User className="w-3 h-3 text-neon-cyan" />
          </div>
        )}
        <span className="text-sm text-foreground">{username ?? user.email}</span>
        {isPro && (
          <span className="px-1.5 py-0.5 rounded-md bg-neon-cyan/15 border border-neon-cyan/30 text-neon-cyan text-[10px] font-bold leading-none">
            PRO
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 top-full mt-2 w-48 rounded-xl border border-white/10 shadow-2xl shadow-black/50 z-50 overflow-hidden bg-[#0a1a1f] backdrop-blur-md">
          <div className="px-3 py-2.5 border-b border-white/10">
            <p className="text-sm text-foreground/80 truncate">{user.email}</p>
            {isPro && (
              <p className="text-xs text-neon-cyan font-semibold mt-1">Pro Plan</p>
            )}
          </div>
          <a
            href="/history"
            className="w-full flex items-center gap-2 px-3 py-2.5 text-sm text-foreground/80 hover:text-foreground hover:bg-white/5 transition-colors cursor-pointer"
          >
            <History className="w-3.5 h-3.5" />
            Scan History
          </a>
          <a
            href="/account"
            className="w-full flex items-center gap-2 px-3 py-2.5 text-sm text-foreground/80 hover:text-foreground hover:bg-white/5 transition-colors cursor-pointer"
          >
            <Settings className="w-3.5 h-3.5" />
            Account
          </a>
          <button
            onClick={handleSignOut}
            className="w-full flex items-center gap-2 px-3 py-2.5 text-sm text-red-400 hover:text-red-300 hover:bg-white/5 transition-colors cursor-pointer"
          >
            <LogOut className="w-3.5 h-3.5" />
            Sign out
          </button>
        </div>
      )}
    </div>
  );
}
