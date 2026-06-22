"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { connectGitHub } from "@/lib/api";

interface UseGitHubConnectOptions {
  authToken: string | null;
  /** Called after a successful connect with the GitHub username. */
  onConnected?: (githubUsername: string | null) => void;
}

/**
 * Opens a popup to run the GitHub OAuth flow and calls /api/github/connect
 * with the resulting code so that the user's ``github_connections`` row is
 * created. Extracted from CreateFixPRModal so the scan form can prompt the
 * same flow before the user needs Fix-PR.
 *
 * Returns an imperative ``connect()`` trigger plus flight state. The hook is
 * also responsible for picking up a popup-blocked fallback that the
 * ``/auth/github-callback`` page stores in ``sessionStorage``.
 */
export function useGitHubConnect({ authToken, onConnected }: UseGitHubConnectOptions) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Dedup guard: OAuth codes are single-use. The popup message handler and
  // the sessionStorage fallback useEffect can both fire for the same code
  // (React re-renders, strict-mode double-runs, popup messages re-delivered
  // in weird tab states). Tracking the set of codes we've already exchanged
  // in a ref keeps the 2nd call a no-op so we don't hit GitHub's
  // bad_verification_code rejection.
  const exchangedCodesRef = useRef<Set<string>>(new Set());

  // Success sticky flag. Rapid-click or double-popup scenarios run several
  // exchange() calls in parallel. If any one succeeds, the connection is
  // already saved server-side — subsequent late-arriving failures (e.g. a
  // parallel attempt that got a transient 404 from GitHub) must not clobber
  // the success state with an error banner.
  const hasConnectedRef = useRef(false);

  const exchange = useCallback(
    async (code: string) => {
      if (!authToken) return;
      if (exchangedCodesRef.current.has(code)) return;
      exchangedCodesRef.current.add(code);
      setLoading(true);
      setError(null);
      try {
        const result = await connectGitHub(code, authToken);
        hasConnectedRef.current = true;
        setError(null);
        onConnected?.(result.github_username ?? null);
      } catch (err) {
        if (!hasConnectedRef.current) {
          setError(err instanceof Error ? err.message : "Failed to connect GitHub");
        }
      } finally {
        setLoading(false);
      }
    },
    [authToken, onConnected],
  );

  // Fallback: popup was blocked and the callback page stashed the code in
  // sessionStorage. Pick it up on next mount.
  useEffect(() => {
    if (!authToken) return;
    if (typeof window === "undefined") return;
    const stored = window.sessionStorage.getItem("github_oauth_result");
    if (!stored) return;
    window.sessionStorage.removeItem("github_oauth_result");
    window.sessionStorage.removeItem("github_oauth_return_url");
    try {
      const { code, state: returnedState } = JSON.parse(stored) as {
        code?: string;
        state?: string;
      };
      const savedState = window.sessionStorage.getItem("github_oauth_state");
      if (!code || returnedState !== savedState) return;
      void exchange(code);
    } catch {
      // malformed
    }
  }, [authToken, exchange]);

  const connect = useCallback(() => {
    if (!authToken) {
      setError("Sign in first to connect GitHub");
      return;
    }
    const clientId = process.env.NEXT_PUBLIC_GITHUB_APP_CLIENT_ID;
    if (!clientId) {
      setError("GitHub OAuth is not configured");
      return;
    }

    // Reset per-flow state — each connect() starts a new authorization.
    exchangedCodesRef.current = new Set();
    hasConnectedRef.current = false;

    const redirectUri = `${window.location.origin}/auth/github-callback`;
    const scope = "repo";
    const state = crypto.randomUUID();
    window.sessionStorage.setItem("github_oauth_state", state);
    window.sessionStorage.setItem("github_oauth_return_url", window.location.href);

    const url = `https://github.com/login/oauth/authorize?client_id=${clientId}&redirect_uri=${encodeURIComponent(
      redirectUri,
    )}&scope=${scope}&state=${state}`;
    const popup = window.open(url, "github-oauth", "width=600,height=700");

    const handler = (event: MessageEvent) => {
      if (event.origin !== window.location.origin) return;
      if (event.data?.type !== "github-oauth-callback") return;
      window.removeEventListener("message", handler);
      popup?.close();

      const { code, state: returnedState, error: oauthError } = event.data;
      const savedState = window.sessionStorage.getItem("github_oauth_state");
      if (oauthError) {
        setError(oauthError);
        return;
      }
      if (!code || returnedState !== savedState) {
        setError("OAuth state mismatch");
        return;
      }
      void exchange(code);
    };

    window.addEventListener("message", handler);
  }, [authToken, exchange]);

  return { connect, loading, error };
}
