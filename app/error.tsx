"use client";

import { useEffect } from "react";

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("[Error Boundary]", error);
  }, [error]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-background">
      <div className="text-center max-w-md px-6">
        <div className="text-6xl mb-6 select-none" aria-hidden="true">
          &#x26A0;
        </div>
        <h1 className="text-2xl font-bold text-foreground mb-2">
          Something went wrong
        </h1>
        <p className="text-muted-foreground mb-8">
          An unexpected error occurred. Please try again.
        </p>
        <div className="flex gap-4 justify-center">
          <button
            onClick={reset}
            className="px-5 py-2.5 rounded-lg bg-neon-cyan/10 text-neon-cyan border border-neon-cyan/30 hover:bg-neon-cyan/20 transition-colors font-medium"
          >
            Try Again
          </button>
          <a
            href="/"
            className="px-5 py-2.5 rounded-lg text-muted-foreground hover:text-foreground border border-border hover:border-foreground/20 transition-colors"
          >
            Return Home
          </a>
        </div>
      </div>
    </div>
  );
}
