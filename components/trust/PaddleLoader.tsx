"use client";

import Script from "next/script";

/**
 * Loads Paddle.js and initializes it.
 * Auto-detects sandbox from client token prefix (test_ vs live_).
 * Place this once in the app layout or root component.
 */
export function PaddleLoader() {
  const token = process.env.NEXT_PUBLIC_PADDLE_CLIENT_TOKEN;

  if (!token) return null;

  const isSandbox = token.startsWith("test_");

  return (
    <Script
      src="https://cdn.paddle.com/paddle/v2/paddle.js"
      strategy="afterInteractive"
      onLoad={() => {
        if (typeof window !== "undefined" && window.Paddle) {
          if (isSandbox) {
            window.Paddle.Environment.set("sandbox");
          }
          window.Paddle.Initialize({
            token,
            eventCallback: (event: PaddleEvent) => {
              if (event.name === "checkout.completed") {
                // Redirect to success page after checkout
                window.location.href = "/?checkout=success";
              }
            },
          });
        }
      }}
    />
  );
}

// Type declarations for Paddle.js
interface PaddleEvent {
  name: string;
  data?: Record<string, unknown>;
}

interface PaddleCheckoutOpenParams {
  items?: Array<{ priceId: string; quantity: number }>;
  transactionId?: string;
  customer?: { email: string };
  customData?: Record<string, string>;
  settings?: {
    successUrl?: string;
    theme?: "light" | "dark";
    locale?: string;
    displayMode?: "overlay" | "inline";
  };
}

declare global {
  interface Window {
    Paddle?: {
      Environment: { set: (env: "sandbox" | "production") => void };
      Initialize: (config: { token: string; eventCallback?: (event: PaddleEvent) => void }) => void;
      Checkout: {
        open: (params: PaddleCheckoutOpenParams) => void;
      };
    };
  }
}
