"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { connectVercel } from "@/lib/api";

interface UseVercelConnectOptions {
  authToken: string | null;
  /** Called after a successful connect with the Vercel username. */
  onConnected?: (vercelUsername: string | null) => void;
}

/**
 * Opens a popup to run the Vercel OAuth flow and calls /api/vercel/connect
 * with the resulting code so that the user's ``vercel_connections`` row is
 * created. Mirrors ``useGitHubConnect`` so the RepoSelector / landing flow
 * can offer the same connect UX.
 *
 * Returns an imperative ``connect()`` trigger plus flight state. The hook is
 * also responsible for picking up a popup-blocked fallback that the
 * ``/auth/vercel-callback`` page stores in ``sessionStorage``.
 */
export function useVercelConnect({ authToken, onConnected }: UseVercelConnectOptions) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Dedup guard — see useGitHubConnect for the rationale. Integration
  // install codes are also single-use and Vercel rejects reuse.
  const exchangedCodesRef = useRef<Set<string>>(new Set());
  // Success sticky flag — same rationale as useGitHubConnect. Ignore
  // late-arriving failures if an earlier parallel attempt already saved
  // the connection.
  const hasConnectedRef = useRef(false);

  const exchange = useCallback(
    async (code: string, redirectUri: string) => {
      if (!authToken) return;
      if (exchangedCodesRef.current.has(code)) return;
      exchangedCodesRef.current.add(code);
      setLoading(true);
      setError(null);
      try {
        const result = await connectVercel(code, redirectUri, authToken);
        hasConnectedRef.current = true;
        setError(null);
        onConnected?.(result.vercel_username ?? null);
      } catch (err) {
        if (!hasConnectedRef.current) {
          setError(err instanceof Error ? err.message : "Failed to connect Vercel");
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
    const stored = window.sessionStorage.getItem("vercel_oauth_result");
    if (!stored) return;
    window.sessionStorage.removeItem("vercel_oauth_result");
    window.sessionStorage.removeItem("vercel_oauth_return_url");
    try {
      const { code } = JSON.parse(stored) as { code?: string };
      // Presence of oauth_state is enough — Vercel's install flow strips
      // query params from `next`, so we can't rely on a URL round-trip.
      // Popup-origin check inside `connect()` covers CSRF.
      const hadSession = window.sessionStorage.getItem("vercel_oauth_state");
      if (!code || !hadSession) return;
      window.sessionStorage.removeItem("vercel_oauth_state");
      const redirectUri = `${window.location.origin}/auth/vercel-callback`;
      void exchange(code, redirectUri);
    } catch {
      // malformed
    }
  }, [authToken, exchange]);

  const connect = useCallback(() => {
    if (!authToken) {
      setError("Sign in first to connect Vercel");
      return;
    }

    // Reset per-flow state for the new attempt.
    exchangedCodesRef.current = new Set();
    hasConnectedRef.current = false;

    // Vercel integrations use the install flow, not the SIWV /oauth/authorize
    // endpoint (that one is identity-only and wouldn't authorise /v9/projects
    // calls). Slug matches the Integration registered at
    // vercel.com/integrations/console.
    const slug = "trust-scan";
    const redirectUri = `${window.location.origin}/auth/vercel-callback`;
    // A session marker just proves the flow was started from this tab.
    // Vercel's install flow strips query params from ``next`` so we can't
    // round-trip a state value — the popup-origin check in the message
    // handler is what actually enforces CSRF.
    window.sessionStorage.setItem("vercel_oauth_state", "1");
    window.sessionStorage.setItem("vercel_oauth_return_url", window.location.href);

    const url = `https://vercel.com/integrations/${slug}/new?next=${encodeURIComponent(redirectUri)}`;
    const popup = window.open(url, "vercel-oauth", "width=600,height=700");

    const handler = (event: MessageEvent) => {
      if (event.origin !== window.location.origin) return;
      if (event.data?.type !== "vercel-oauth-callback") return;
      window.removeEventListener("message", handler);
      popup?.close();

      const { code, error: oauthError } = event.data;
      if (oauthError) {
        setError(oauthError);
        return;
      }
      if (!code) {
        setError("Vercel authorization was cancelled");
        return;
      }
      const hadSession = window.sessionStorage.getItem("vercel_oauth_state");
      if (!hadSession) {
        setError("OAuth session expired — please try again");
        return;
      }
      window.sessionStorage.removeItem("vercel_oauth_state");
      void exchange(code, redirectUri);
    };

    window.addEventListener("message", handler);
  }, [authToken, exchange]);

  return { connect, loading, error };
}
