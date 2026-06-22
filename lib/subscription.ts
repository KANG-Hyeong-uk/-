"use client";

import { useCallback } from "react";

export interface SubscriptionState {
  plan: "free" | "pro" | null;
  loading: boolean;
  user: null;
  accessToken: null;
  urlScansUsed: number;
  urlScansLimit: number;
  repoScansUsed: number;
  repoScansLimit: number;
}

export function useSubscription(): SubscriptionState & { refresh: () => void } {
  const refresh = useCallback(() => {}, []);
  return {
    plan: "pro",
    loading: false,
    user: null,
    accessToken: null,
    urlScansUsed: 0,
    urlScansLimit: Infinity,
    repoScansUsed: 0,
    repoScansLimit: Infinity,
    refresh,
  };
}
