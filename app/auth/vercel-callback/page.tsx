"use client";

import { useEffect, useState, Suspense } from "react";
import { useSearchParams } from "next/navigation";

function VercelCallbackHandler() {
  const searchParams = useSearchParams();
  const [status, setStatus] = useState("Connecting to Vercel...");

  useEffect(() => {
    const code = searchParams.get("code");
    const state = searchParams.get("state");
    const error = searchParams.get("error");

    if (window.opener) {
      // Popup mode: send message back to parent and close
      window.opener.postMessage(
        { type: "vercel-oauth-callback", code, state, error },
        window.location.origin
      );
      setTimeout(() => window.close(), 500);
    } else {
      // Fallback: popup was blocked or opened as a new tab.
      // Store the OAuth result and redirect back to dashboard.
      if (code && state) {
        sessionStorage.setItem(
          "vercel_oauth_result",
          JSON.stringify({ code, state, error })
        );
        setStatus("Redirecting back...");
        // Redirect back to the page that initiated the OAuth flow
        const returnUrl = sessionStorage.getItem("vercel_oauth_return_url") || "/";
        window.location.href = returnUrl;
      } else {
        setStatus(error || "Vercel connection failed. Please close this tab and try again.");
      }
    }
  }, [searchParams]);

  return <p className="text-muted-foreground text-sm">{status}</p>;
}

export default function VercelCallbackPage() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-background">
      <Suspense fallback={<p className="text-muted-foreground text-sm">Loading...</p>}>
        <VercelCallbackHandler />
      </Suspense>
    </div>
  );
}
