"use client";

import { useState, useEffect, useCallback } from "react";
import { createClient } from "@/lib/supabase";
import type { User, Session } from "@supabase/supabase-js";

export interface SubscriptionState {
  plan: "free" | "pro" | null; // null = not logged in
  loading: boolean;
  user: User | null;
  accessToken: string | null; // Supabase JWT for API auth
  urlScansUsed: number;
  urlScansLimit: number;
  repoScansUsed: number;
  repoScansLimit: number;
}

/** getUser() with a timeout — prevents infinite hang if initializePromise never resolves */
async function getUserWithTimeout(supabase: ReturnType<typeof createClient>, ms = 10000) {
  const timeout = new Promise<never>((_, reject) =>
    setTimeout(() => reject(new Error("getUser timeout")), ms)
  );
  return Promise.race([supabase.auth.getUser(), timeout]);
}

export function useSubscription(): SubscriptionState & { refresh: () => void } {
  const [state, setState] = useState<SubscriptionState>({
    plan: null,
    loading: true,
    user: null,
    accessToken: null,
    urlScansUsed: 0,
    urlScansLimit: 5,
    repoScansUsed: 0,
    repoScansLimit: 3,
  });
  const [refreshKey, setRefreshKey] = useState(0);
  const refresh = useCallback(() => setRefreshKey((k) => k + 1), []);

  useEffect(() => {
    const supabase = createClient(); // singleton — no ref needed

    async function fetchUserPlan(userId: string) {
      const { data } = await supabase
        .from("users")
        .select("plan, plan_changed_at")
        .eq("id", userId)
        .single();
      return data;
    }

    async function fetchMonthlyCounts(userId: string, planChangedAt?: string | null) {
      const firstOfMonth = new Date();
      firstOfMonth.setDate(1);
      firstOfMonth.setHours(0, 0, 0, 0);

      let since = firstOfMonth.toISOString();
      if (planChangedAt) {
        const pca = new Date(planChangedAt);
        if (pca > firstOfMonth) since = pca.toISOString();
      }

      const [urlRes, repoRes] = await Promise.all([
        supabase
          .from("scans")
          .select("id", { count: "exact", head: true })
          .eq("user_id", userId)
          .gte("created_at", since),
        supabase
          .from("repo_scans")
          .select("id", { count: "exact", head: true })
          .eq("user_id", userId)
          .gte("created_at", since),
      ]);
      return {
        urlCount: urlRes.count ?? 0,
        repoCount: repoRes.count ?? 0,
      };
    }

    async function resolveState(user: User, accessToken: string | null) {
      const userData = await fetchUserPlan(user.id);
      const plan = (userData?.plan ?? "free") as "free" | "pro";
      const isPro = plan === "pro";
      const counts = await fetchMonthlyCounts(user.id, userData?.plan_changed_at);
      setState({
        plan,
        loading: false,
        user,
        accessToken,
        urlScansUsed: counts.urlCount,
        urlScansLimit: isPro ? Infinity : 5,
        repoScansUsed: counts.repoCount,
        repoScansLimit: isPro ? Infinity : 3,
      });
    }

    async function handleSession() {
      try {
        const { data: { user }, error: userError } = await getUserWithTimeout(supabase);
        if (userError || !user) {
          setState({ plan: null, loading: false, user: null, accessToken: null, urlScansUsed: 0, urlScansLimit: 5, repoScansUsed: 0, repoScansLimit: 3 });
          return;
        }
        const { data: { session } } = await supabase.auth.getSession();
        await resolveState(user, session?.access_token ?? null);
      } catch (err) {
        console.error("[useSubscription] handleSession error:", err);
        setState({ plan: null, loading: false, user: null, accessToken: null, urlScansUsed: 0, urlScansLimit: 5, repoScansUsed: 0, repoScansLimit: 3 });
      }
    }

    handleSession();

    // IMPORTANT: onAuthStateChange callback runs INSIDE the auth lock.
    // Keep it synchronous — schedule async work outside the lock to avoid
    // holding the lock during DB queries (which can cause lock-acquire
    // timeouts for other auth operations like getUser).
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event: string, session: Session | null) => {
      if (!session?.user) {
        setState({ plan: null, loading: false, user: null, accessToken: null, urlScansUsed: 0, urlScansLimit: 5, repoScansUsed: 0, repoScansLimit: 3 });
        return;
      }
      // Schedule plan fetch outside the lock
      const user = session.user;
      const accessToken = session.access_token;
      queueMicrotask(() => {
        resolveState(user, accessToken).catch((err) => {
          console.error("[useSubscription] onAuthStateChange resolveState error:", err);
        });
      });
    });

    return () => subscription.unsubscribe();
  }, [refreshKey]);

  return { ...state, refresh };
}
