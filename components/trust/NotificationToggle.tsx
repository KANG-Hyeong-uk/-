"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { Bell, BellRing, BellOff, CheckCircle, ExternalLink } from "lucide-react";
import { createClient } from "@/lib/supabase";

type PermissionState = "default" | "granted" | "denied";

const STORAGE_KEY = "trust-notifications-enabled";
const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8080";
const VAPID_PUBLIC_KEY =
  process.env.NEXT_PUBLIC_VAPID_KEY ||
  "BK7MUPZL_rNyhIzhuFRh4oox7zEKJqSqvEwV7kFMhyx_Jry6wK-UoRzKuPpMd4Cy3q3LLuvdwhYk92FGOzemQpg";

/** Convert a URL-safe base64 VAPID key to a Uint8Array for pushManager.subscribe */
function urlBase64ToUint8Array(base64String: string): Uint8Array<ArrayBuffer> {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const rawData = atob(base64);
  const buffer = new ArrayBuffer(rawData.length);
  const outputArray = new Uint8Array(buffer);
  for (let i = 0; i < rawData.length; i++) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}

/** Get Supabase access token if user is logged in */
async function getAuthToken(): Promise<string | null> {
  try {
    const supabase = createClient();
    const { data: { session } } = await supabase.auth.getSession();
    return session?.access_token ?? null;
  } catch {
    return null;
  }
}

/** Send push subscription to backend (with auth if available) */
async function sendSubscriptionToBackend(subscription: PushSubscription): Promise<void> {
  const keys = subscription.toJSON().keys;
  const token = await getAuthToken();
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (token) headers["Authorization"] = `Bearer ${token}`;

  await fetch(`${API_URL}/api/push/subscribe`, {
    method: "POST",
    headers,
    body: JSON.stringify({
      endpoint: subscription.endpoint,
      keys: {
        p256dh: keys?.p256dh || "",
        auth: keys?.auth || "",
      },
    }),
  });
}

/** Remove push subscription from backend */
async function removeSubscriptionFromBackend(endpoint: string): Promise<void> {
  await fetch(`${API_URL}/api/push/subscribe`, {
    method: "DELETE",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ endpoint }),
  });
}

export function useNotifications() {
  const [permission, setPermission] = useState<PermissionState>("default");
  const [enabled, setEnabled] = useState(false);
  const [showDeniedGuide, setShowDeniedGuide] = useState(false);
  const [isIncognito, setIsIncognito] = useState(false);
  const [testSent, setTestSent] = useState(false);
  const swRegistrationRef = useRef<ServiceWorkerRegistration | null>(null);

  // On mount: check support, register SW, sync permission state
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!("serviceWorker" in navigator) || !("PushManager" in window)) return;

    // Sync permission state from Notification API
    if ("Notification" in window) {
      setPermission(Notification.permission as PermissionState);
    }

    // Detect incognito/private mode: storage quota is very limited (~120MB vs several GB)
    if ("storage" in navigator && navigator.storage.estimate) {
      navigator.storage.estimate().then((est) => {
        // In incognito, quota is typically ~120MB. Normal mode is several GB+.
        if (est.quota && est.quota < 200 * 1024 * 1024) {
          setIsIncognito(true);
        }
      }).catch(() => {});
    }

    // Listen for permission changes in real-time (e.g. user changes in Chrome settings)
    // Only use the onchange listener — do NOT override initial state from Notification.permission
    if ("permissions" in navigator) {
      navigator.permissions.query({ name: "notifications" }).then((perm) => {
        perm.addEventListener("change", () => {
          const state = perm.state === "prompt" ? "default" : perm.state;
          setPermission(state as PermissionState);
          // Auto-dismiss denied guide if permission changes to granted
          if (state === "granted") setShowDeniedGuide(false);
        });
      }).catch(() => {});
    }

    // Read localStorage toggle state
    const storedEnabled = localStorage.getItem(STORAGE_KEY) === "true";

    // Register service worker and check existing subscription
    navigator.serviceWorker
      .register("/sw.js")
      .then((registration) => {
        swRegistrationRef.current = registration;

        return registration.pushManager.getSubscription();
      })
      .then((existingSubscription) => {
        if (existingSubscription && storedEnabled) {
          setEnabled(true);
          // Re-sync subscription with backend to ensure user_id is linked
          sendSubscriptionToBackend(existingSubscription).catch(() => {});
        } else if (!existingSubscription && storedEnabled) {
          // localStorage says enabled, but no subscription exists (user cleared data, etc.)
          // Reset localStorage to match reality
          localStorage.setItem(STORAGE_KEY, "false");
          setEnabled(false);
        } else {
          setEnabled(false);
        }
      })
      .catch((err) => {
        console.warn("Service worker registration failed:", err);
      });
  }, []);

  const requestPermission = useCallback(async () => {
    if (typeof window === "undefined") return;
    if (!("serviceWorker" in navigator) || !("PushManager" in window)) return;

    const registration = swRegistrationRef.current;
    if (!registration) return;

    // Re-read current permission (may have changed via browser settings)
    const currentPermission = Notification.permission;
    setPermission(currentPermission as PermissionState);

    // If denied, show the troubleshooting guide instead of silently failing
    if (currentPermission === "denied") {
      setShowDeniedGuide(true);
      return;
    }

    // If already granted, toggle on/off
    if (currentPermission === "granted") {
      if (enabled) {
        // Disable: unsubscribe from push
        setEnabled(false);
        localStorage.setItem(STORAGE_KEY, "false");
        try {
          const subscription = await registration.pushManager.getSubscription();
          if (subscription) {
            const endpoint = subscription.endpoint;
            await subscription.unsubscribe();
            removeSubscriptionFromBackend(endpoint).catch(() => {});
          }
        } catch (err) {
          console.warn("Failed to unsubscribe:", err);
        }
        return;
      }

      // Enable: subscribe to push
      try {
        const subscription = await registration.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY),
        });
        setEnabled(true);
        localStorage.setItem(STORAGE_KEY, "true");
        sendSubscriptionToBackend(subscription).catch(() => {});
      } catch (err) {
        console.warn("Failed to subscribe to push:", err);
      }
      return;
    }

    // First time ("default"): ask for permission
    const result = await Notification.requestPermission();
    setPermission(result as PermissionState);

    if (result === "granted") {
      try {
        const subscription = await registration.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY),
        });
        setEnabled(true);
        localStorage.setItem(STORAGE_KEY, "true");
        sendSubscriptionToBackend(subscription).catch(() => {});
      } catch (err) {
        console.warn("Failed to subscribe to push after permission grant:", err);
      }
    } else if (result === "denied") {
      setShowDeniedGuide(true);
    }
  }, [enabled]);

  /** Send a local test notification via the Service Worker to verify the full pipeline */
  const sendTestNotification = useCallback(async () => {
    const registration = swRegistrationRef.current;
    if (!registration || Notification.permission !== "granted") return;

    try {
      await registration.showNotification("Trust Security — Test", {
        body: "Notifications are working! You'll see alerts when scans complete.",
        icon: "/icon.svg",
        badge: "/icon.svg",
      });
      setTestSent(true);
      setTimeout(() => setTestSent(false), 3000);
    } catch (err) {
      console.warn("Test notification failed:", err);
    }
  }, []);

  /** Re-check permission after user changes browser settings (call from "I've allowed it" button) */
  const recheckPermission = useCallback(async () => {
    const current = Notification.permission;
    setPermission(current as PermissionState);

    if (current === "granted") {
      setShowDeniedGuide(false);
      // Auto-subscribe
      const registration = swRegistrationRef.current;
      if (registration) {
        try {
          const subscription = await registration.pushManager.subscribe({
            userVisibleOnly: true,
            applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY),
          });
          setEnabled(true);
          localStorage.setItem(STORAGE_KEY, "true");
          sendSubscriptionToBackend(subscription).catch(() => {});
        } catch (err) {
          console.warn("Failed to subscribe after recheck:", err);
        }
      }
    }
  }, []);

  return {
    permission,
    enabled,
    requestPermission,
    showDeniedGuide,
    setShowDeniedGuide,
    isIncognito,
    sendTestNotification,
    testSent,
    recheckPermission,
  };
}

interface NotificationToggleProps {
  permission: PermissionState;
  enabled: boolean;
  onToggle: () => void;
  showDeniedGuide?: boolean;
  isIncognito?: boolean;
  onDismissGuide?: () => void;
  onRecheckPermission?: () => void;
  onSendTest?: () => void;
  testSent?: boolean;
}

export function NotificationToggle({
  permission,
  enabled,
  onToggle,
  showDeniedGuide,
  isIncognito,
  onDismissGuide,
  onRecheckPermission,
  onSendTest,
  testSent,
}: NotificationToggleProps) {
  const [showTooltip, setShowTooltip] = useState(false);
  const hideTimeout = useRef<NodeJS.Timeout>(undefined);
  const containerRef = useRef<HTMLDivElement>(null);

  // Close tooltip on outside click (mobile)
  useEffect(() => {
    if (!showTooltip && !showDeniedGuide) return;
    const handleClick = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setShowTooltip(false);
        onDismissGuide?.();
      }
    };
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [showTooltip, showDeniedGuide, onDismissGuide]);

  if (typeof window !== "undefined" && !("Notification" in window)) return null;

  const isDenied = permission === "denied";
  const isActive = enabled && permission === "granted";

  const Icon = isDenied ? BellOff : isActive ? BellRing : Bell;

  const handleMouseEnter = () => {
    if (showDeniedGuide) return; // don't show tooltip when guide is open
    clearTimeout(hideTimeout.current);
    setShowTooltip(true);
  };

  const handleMouseLeave = () => {
    hideTimeout.current = setTimeout(() => setShowTooltip(false), 150);
  };

  const isMac = typeof navigator !== "undefined" && /Mac/.test(navigator.userAgent);

  return (
    <div
      className="relative"
      ref={containerRef}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
    >
      <button
        onClick={onToggle}
        aria-label={
          isDenied
            ? "Fix notification permissions"
            : isActive
              ? "Disable scan notifications"
              : "Enable scan notifications"
        }
        className={`relative p-2 rounded-lg transition-all duration-200 min-h-[40px] min-w-[40px] flex items-center justify-center border ${
          isDenied
            ? "text-red-400/60 border-red-400/20 hover:text-red-400 hover:border-red-400/40"
            : isActive
              ? "text-neon-cyan border-neon-cyan/40 bg-neon-cyan/10"
              : "text-white/70 border-white/15 hover:text-white hover:border-white/30 hover:bg-white/5"
        }`}
      >
        <Icon className="w-[18px] h-[18px]" />
        {isActive && (
          <span className="absolute -top-0.5 -right-0.5 w-2 h-2 bg-neon-cyan rounded-full" />
        )}
      </button>

      {/* Denied state: step-by-step fix guide */}
      {showDeniedGuide && (
        <div className="absolute top-full right-0 mt-2 w-80 p-4 rounded-xl bg-card/95 backdrop-blur-md border border-red-400/20 shadow-xl z-50">
          {isIncognito ? (
            <>
              <p className="text-xs font-semibold text-red-400 mb-2">Not available in Incognito</p>
              <p className="text-[11px] text-muted-foreground mb-3 leading-relaxed">
                Push notifications are blocked in incognito / private browsing mode. Please use a <strong className="text-foreground">regular browser window</strong> to enable scan notifications.
              </p>
              <button
                onClick={onDismissGuide}
                className="w-full px-3 py-1.5 text-[11px] font-medium rounded-lg bg-white/5 text-muted-foreground border border-white/10 hover:bg-white/10 transition-colors"
              >
                Got it
              </button>
            </>
          ) : (
            <>
              <p className="text-xs font-semibold text-red-400 mb-3">Notifications are blocked</p>
              <p className="text-[11px] text-muted-foreground mb-3 leading-relaxed">
                Chrome won&apos;t re-ask for permission once denied. Follow these steps to fix it:
              </p>

              <ol className="space-y-2.5 text-[11px] text-muted-foreground mb-4">
                <li className="flex gap-2">
                  <span className="shrink-0 w-4 h-4 rounded-full bg-white/10 text-white/70 flex items-center justify-center text-[10px] font-bold mt-0.5">1</span>
                  <span>
                    Click the <strong className="text-foreground">lock icon</strong> (or tune icon) in Chrome&apos;s address bar →
                    set <strong className="text-foreground">Notifications</strong> to <strong className="text-foreground">Allow</strong>
                  </span>
                </li>
                <li className="flex gap-2">
                  <span className="shrink-0 w-4 h-4 rounded-full bg-white/10 text-white/70 flex items-center justify-center text-[10px] font-bold mt-0.5">2</span>
                  <span>
                    Also check <strong className="text-foreground">chrome://settings/content/notifications</strong> — make sure
                    &quot;Sites can ask to send notifications&quot; is <strong className="text-foreground">on</strong>
                  </span>
                </li>
                {isMac && (
                  <li className="flex gap-2">
                    <span className="shrink-0 w-4 h-4 rounded-full bg-white/10 text-white/70 flex items-center justify-center text-[10px] font-bold mt-0.5">3</span>
                    <span>
                      macOS: <strong className="text-foreground">System Settings → Notifications → Google Chrome</strong> → toggle <strong className="text-foreground">Allow Notifications</strong> on
                    </span>
                  </li>
                )}
              </ol>

              <div className="flex gap-2">
                <button
                  onClick={onRecheckPermission}
                  className="flex-1 px-3 py-1.5 text-[11px] font-medium rounded-lg bg-neon-cyan/20 text-neon-cyan border border-neon-cyan/30 hover:bg-neon-cyan/30 transition-colors"
                >
                  I&apos;ve allowed it — recheck
                </button>
                <button
                  onClick={onDismissGuide}
                  className="px-3 py-1.5 text-[11px] font-medium rounded-lg bg-white/5 text-muted-foreground border border-white/10 hover:bg-white/10 transition-colors"
                >
                  Dismiss
                </button>
              </div>
            </>
          )}
        </div>
      )}

      {/* Enabled state: hover tooltip with test button */}
      {showTooltip && !showDeniedGuide && (
        <div
          className="absolute top-full right-0 mt-2 w-64 p-3 rounded-xl bg-card/95 backdrop-blur-md border border-white/10 shadow-xl z-50"
          onMouseEnter={handleMouseEnter}
          onMouseLeave={handleMouseLeave}
        >
          <p className="text-xs font-medium text-foreground mb-1.5">
            {isActive ? "Notifications enabled" : "Scan notifications"}
          </p>
          <p className="text-[11px] text-muted-foreground leading-relaxed">
            Get a desktop alert when your scan finishes while you&apos;re in another tab. Desktop browsers only.
          </p>
          {isActive && onSendTest && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                onSendTest();
              }}
              className="mt-2 w-full flex items-center justify-center gap-1.5 px-2 py-1.5 text-[11px] font-medium rounded-lg bg-white/5 text-muted-foreground border border-white/10 hover:bg-white/10 hover:text-foreground transition-colors"
            >
              {testSent ? (
                <>
                  <CheckCircle className="w-3 h-3 text-green-400" />
                  <span className="text-green-400">Test sent! Check your notifications</span>
                </>
              ) : (
                "Send test notification"
              )}
            </button>
          )}
        </div>
      )}
    </div>
  );
}
