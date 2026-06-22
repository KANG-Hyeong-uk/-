"use client";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <html lang="en">
      <body
        style={{
          margin: 0,
          minHeight: "100vh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          backgroundColor: "#0a0a0a",
          color: "#e5e5e5",
          fontFamily:
            '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
        }}
      >
        <div style={{ textAlign: "center", maxWidth: "420px", padding: "24px" }}>
          <div
            style={{ fontSize: "48px", marginBottom: "24px" }}
            aria-hidden="true"
          >
            &#x26A0;
          </div>
          <h1 style={{ fontSize: "24px", fontWeight: 700, marginBottom: "8px" }}>
            Something went wrong
          </h1>
          <p
            style={{
              color: "#a3a3a3",
              marginBottom: "32px",
              lineHeight: 1.6,
            }}
          >
            A critical error occurred. Please try reloading the page.
          </p>
          <div style={{ display: "flex", gap: "16px", justifyContent: "center" }}>
            <button
              onClick={reset}
              style={{
                padding: "10px 20px",
                borderRadius: "8px",
                backgroundColor: "rgba(0, 243, 255, 0.1)",
                color: "#00f3ff",
                border: "1px solid rgba(0, 243, 255, 0.3)",
                cursor: "pointer",
                fontWeight: 500,
                fontSize: "14px",
              }}
            >
              Try Again
            </button>
            <a
              href="/"
              style={{
                padding: "10px 20px",
                borderRadius: "8px",
                color: "#a3a3a3",
                border: "1px solid #333",
                textDecoration: "none",
                fontSize: "14px",
              }}
            >
              Return Home
            </a>
          </div>
        </div>
      </body>
    </html>
  );
}
