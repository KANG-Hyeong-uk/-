"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  ArrowLeft,
  Shield,
  User,
  Mail,
  Calendar,
  CreditCard,
  BarChart3,
  ExternalLink,
  Trash2,
  MessageCircle,
  Crown,
  Github,
  Loader2,
  AlertTriangle,
  X,
} from "lucide-react";
import { useSubscription } from "@/lib/subscription";
import { createClient } from "@/lib/supabase";
import { createCustomerPortal, deleteAccount } from "@/lib/api";
import { UpgradeModal } from "@/components/trust/UpgradeModal";
import { ProviderPicker } from "@/components/trust/ProviderPicker";

interface SubscriptionDetails {
  plan: string | null;
  status: string | null;
  current_period_end: string | null;
  cancel_at_period_end: boolean;
}

function formatDate(dateStr?: string | null): string {
  if (!dateStr) return "-";
  return new Date(dateStr).toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

function getProviderLabel(user: { app_metadata?: Record<string, unknown>; identities?: Array<{ provider: string }> }): { label: string; icon: "github" | "google" } {
  const provider =
    (user.app_metadata?.provider as string) ??
    user.identities?.[0]?.provider ??
    "unknown";
  if (provider === "google") return { label: "Google", icon: "google" };
  return { label: "GitHub", icon: "github" };
}

function GoogleIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="currentColor">
      <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" />
      <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
      <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
      <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
    </svg>
  );
}

// ---------- Delete Confirmation Modal ----------
function DeleteConfirmModal({
  open,
  onClose,
  onConfirm,
  loading,
  hasActiveSubscription,
}: {
  open: boolean;
  onClose: () => void;
  onConfirm: () => void;
  loading: boolean;
  hasActiveSubscription: boolean;
}) {
  const [typed, setTyped] = useState("");

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div className="w-full max-w-md rounded-2xl border border-red-500/30 bg-[#0a1a1f] p-6 shadow-2xl">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2 text-red-400">
            <AlertTriangle className="w-5 h-5" />
            <h3 className="text-lg font-semibold">Delete Account</h3>
          </div>
          <button onClick={onClose} className="text-foreground/40 hover:text-foreground/70 transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>

        {hasActiveSubscription ? (
          <>
            <p className="text-sm text-foreground/70 mb-4">
              You have an active Pro subscription. Please cancel your subscription first
              before deleting your account.
            </p>
            <p className="text-xs text-foreground/50 mb-6">
              Go to <span className="text-neon-cyan">Manage Billing</span> to cancel your subscription,
              then return here to delete your account.
            </p>
            <button
              onClick={onClose}
              className="w-full py-2.5 rounded-lg border border-white/10 text-sm text-foreground/80 hover:bg-white/5 transition-colors"
            >
              Close
            </button>
          </>
        ) : (
          <>
            <p className="text-sm text-foreground/70 mb-2">
              This action is <span className="text-red-400 font-semibold">permanent and irreversible</span>.
              All your data will be deleted:
            </p>
            <ul className="text-xs text-foreground/50 mb-4 space-y-1 ml-4 list-disc">
              <li>Account profile and login credentials</li>
              <li>All scan history and reports</li>
              <li>Scheduled scans and notification settings</li>
              <li>Subscription and billing records</li>
            </ul>
            <p className="text-sm text-foreground/70 mb-3">
              Type <span className="font-mono text-red-400 font-bold">DELETE</span> to confirm:
            </p>
            <input
              type="text"
              value={typed}
              onChange={(e) => setTyped(e.target.value)}
              placeholder="Type DELETE"
              className="w-full px-3 py-2 rounded-lg bg-white/5 border border-white/10 text-sm text-foreground placeholder:text-foreground/30 focus:outline-none focus:border-red-500/50 mb-4"
              autoFocus
            />
            <div className="flex gap-3">
              <button
                onClick={onClose}
                className="flex-1 py-2.5 rounded-lg border border-white/10 text-sm text-foreground/80 hover:bg-white/5 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={onConfirm}
                disabled={typed !== "DELETE" || loading}
                className="flex-1 py-2.5 rounded-lg bg-red-500/20 border border-red-500/30 text-sm text-red-400 font-semibold hover:bg-red-500/30 transition-colors disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center gap-2"
              >
                {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
                Delete Account
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

// ---------- Main Account Page ----------
export function AccountClient() {
  const router = useRouter();
  const subscription = useSubscription();
  const [subDetails, setSubDetails] = useState<SubscriptionDetails | null>(null);
  const [subLoading, setSubLoading] = useState(true);
  const [portalLoading, setPortalLoading] = useState(false);
  const [upgradeOpen, setUpgradeOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleteLoading, setDeleteLoading] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);

  // Fetch subscription details from Supabase
  useEffect(() => {
    if (subscription.loading) return;
    if (!subscription.user) {
      setSubLoading(false);
      return;
    }

    async function loadSubscription() {
      try {
        const supabase = createClient();
        const { data } = await supabase
          .from("subscriptions")
          .select("plan, status, current_period_end, cancel_at_period_end")
          .eq("user_id", subscription.user!.id)
          .single();
        setSubDetails(data);
      } catch {
        // No subscription record = free user
      } finally {
        setSubLoading(false);
      }
    }
    loadSubscription();
  }, [subscription.loading, subscription.user]);

  const handleManageBilling = useCallback(async () => {
    if (!subscription.accessToken) return;
    setPortalLoading(true);
    try {
      const { portal_url } = await createCustomerPortal(subscription.accessToken);
      window.location.href = portal_url;
    } catch {
      alert("Failed to open billing portal. Please try again.");
    } finally {
      setPortalLoading(false);
    }
  }, [subscription.accessToken]);

  const handleDeleteAccount = useCallback(async () => {
    if (!subscription.accessToken) return;
    setDeleteLoading(true);
    try {
      await deleteAccount(subscription.accessToken);
      // Clear cookies and redirect
      document.cookie.split(";").forEach((c) => {
        const name = c.trim().split("=")[0];
        if (name.startsWith("sb-")) {
          document.cookie = `${name}=; path=/; expires=Thu, 01 Jan 1970 00:00:00 GMT`;
        }
      });
      window.location.href = "/";
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Failed to delete account.";
      alert(message);
    } finally {
      setDeleteLoading(false);
    }
  }, [subscription.accessToken]);

  const { user, plan, loading } = subscription;
  const isPro = plan === "pro";
  const hasActiveSubscription = subDetails?.status === "active" && !subDetails?.cancel_at_period_end;

  // --- Loading ---
  if (loading || subLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Loader2 className="w-8 h-8 text-neon-cyan animate-spin" />
      </div>
    );
  }

  // --- Not logged in ---
  if (!user) {
    return (
      <div className="min-h-screen bg-background">
        <header className="flex items-center gap-3 px-4 sm:px-6 md:px-12 py-4">
          <Link href="/" className="text-foreground/60 hover:text-foreground transition-colors">
            <ArrowLeft className="w-5 h-5" />
          </Link>
          <h1 className="text-xl font-semibold text-foreground">Account</h1>
        </header>
        <div className="flex flex-col items-center justify-center px-4 pt-32">
          <div className="w-16 h-16 rounded-full bg-neon-cyan/10 flex items-center justify-center mb-4">
            <User className="w-8 h-8 text-neon-cyan/60" />
          </div>
          <p className="text-foreground/70 text-sm mb-6">Sign in to manage your account</p>
          <button
            onClick={() => setPickerOpen(true)}
            className="px-6 py-2.5 rounded-lg bg-neon-cyan text-black font-semibold text-sm hover:bg-neon-cyan/90 transition-colors"
          >
            Sign in
          </button>
          <ProviderPicker open={pickerOpen} onClose={() => setPickerOpen(false)} />
        </div>
      </div>
    );
  }

  // --- User data ---
  const avatarUrl = user.user_metadata?.avatar_url as string | undefined;
  const displayName = (user.user_metadata?.full_name ?? user.user_metadata?.user_name ?? user.email?.split("@")[0]) as string;
  const providerInfo = getProviderLabel(user);
  const joinedDate = formatDate(user.created_at);

  // Subscription display
  const subPlanLabel =
    subDetails?.plan === "pro_yearly" ? "Pro Yearly" :
    subDetails?.plan === "pro_monthly" ? "Pro Monthly" :
    isPro ? "Pro" : "Free";

  const renewalDate = subDetails?.current_period_end ? formatDate(subDetails.current_period_end) : null;

  // Usage
  const urlPct = subscription.urlScansLimit === Infinity ? 0 : Math.min((subscription.urlScansUsed / subscription.urlScansLimit) * 100, 100);
  const repoPct = subscription.repoScansLimit === Infinity ? 0 : Math.min((subscription.repoScansUsed / subscription.repoScansLimit) * 100, 100);

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="flex items-center gap-3 px-4 sm:px-6 md:px-12 py-4">
        <Link href="/" className="text-foreground/60 hover:text-foreground transition-colors">
          <ArrowLeft className="w-5 h-5" />
        </Link>
        <div className="flex items-center gap-2">
          <Shield className="w-6 h-6 text-neon-cyan" />
          <h1 className="text-xl font-semibold text-foreground">Account</h1>
        </div>
      </header>

      <main className="max-w-2xl mx-auto px-4 sm:px-6 pb-16 space-y-6">
        {/* ── Profile ── */}
        <section className="rounded-2xl border border-white/8 bg-white/[0.02] p-6">
          <h2 className="text-sm font-medium text-foreground/50 uppercase tracking-wider mb-4">Profile</h2>
          <div className="flex items-start gap-4">
            {avatarUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={avatarUrl} alt={displayName} className="w-14 h-14 rounded-full border border-white/10" />
            ) : (
              <div className="w-14 h-14 rounded-full bg-neon-cyan/10 flex items-center justify-center border border-white/10">
                <User className="w-7 h-7 text-neon-cyan/60" />
              </div>
            )}
            <div className="flex-1 min-w-0 space-y-2">
              <p className="text-lg font-semibold text-foreground truncate">{displayName}</p>
              <div className="flex items-center gap-2 text-sm text-foreground/60">
                <Mail className="w-3.5 h-3.5 shrink-0" />
                <span className="truncate">{user.email}</span>
              </div>
              <div className="flex items-center gap-2 text-sm text-foreground/60">
                {providerInfo.icon === "github" ? (
                  <Github className="w-3.5 h-3.5 shrink-0" />
                ) : (
                  <GoogleIcon className="w-3.5 h-3.5 shrink-0" />
                )}
                <span>Signed in with {providerInfo.label}</span>
              </div>
              <div className="flex items-center gap-2 text-sm text-foreground/60">
                <Calendar className="w-3.5 h-3.5 shrink-0" />
                <span>Member since {joinedDate}</span>
              </div>
            </div>
          </div>
        </section>

        {/* ── Subscription ── */}
        <section className="rounded-2xl border border-white/8 bg-white/[0.02] p-6">
          <h2 className="text-sm font-medium text-foreground/50 uppercase tracking-wider mb-4">Subscription</h2>

          <div className="flex items-center gap-3 mb-4">
            {isPro ? (
              <div className="flex items-center gap-2">
                <Crown className="w-5 h-5 text-neon-cyan" />
                <span className="text-lg font-semibold text-foreground">{subPlanLabel}</span>
                <span className="px-2 py-0.5 rounded-full bg-neon-cyan/15 border border-neon-cyan/30 text-neon-cyan text-xs font-bold">
                  ACTIVE
                </span>
              </div>
            ) : (
              <div className="flex items-center gap-2">
                <Shield className="w-5 h-5 text-foreground/40" />
                <span className="text-lg font-semibold text-foreground">Free Plan</span>
              </div>
            )}
          </div>

          {isPro && subDetails && (
            <div className="space-y-2 mb-5 text-sm">
              {subDetails.cancel_at_period_end ? (
                <div className="flex items-center gap-2 text-amber-400">
                  <AlertTriangle className="w-4 h-4 shrink-0" />
                  <span>Cancels on {renewalDate} — you can keep using Pro until then</span>
                </div>
              ) : renewalDate ? (
                <div className="flex items-center gap-2 text-foreground/60">
                  <CreditCard className="w-4 h-4 shrink-0" />
                  <span>Next renewal: {renewalDate}</span>
                </div>
              ) : null}
            </div>
          )}

          {!isPro && (
            <p className="text-sm text-foreground/50 mb-5">
              5 URL scans + 3 repo scans per month. Upgrade to Pro for unlimited scans, AI analysis, and more.
            </p>
          )}

          {isPro ? (
            <button
              onClick={handleManageBilling}
              disabled={portalLoading}
              className="inline-flex items-center gap-2 px-4 py-2.5 rounded-lg border border-white/10 text-sm text-foreground/80 hover:bg-white/5 hover:text-foreground transition-colors disabled:opacity-50"
            >
              {portalLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <ExternalLink className="w-4 h-4" />}
              Manage Billing
            </button>
          ) : (
            <button
              onClick={() => setUpgradeOpen(true)}
              className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg bg-neon-cyan text-black font-semibold text-sm hover:bg-neon-cyan/90 transition-colors"
            >
              <Crown className="w-4 h-4" />
              Upgrade to Pro
            </button>
          )}
        </section>

        {/* ── Usage This Month ── */}
        <section className="rounded-2xl border border-white/8 bg-white/[0.02] p-6">
          <h2 className="text-sm font-medium text-foreground/50 uppercase tracking-wider mb-4">
            <span className="flex items-center gap-2">
              <BarChart3 className="w-4 h-4" />
              Usage This Month
            </span>
          </h2>

          <div className="space-y-4">
            {/* URL Scans */}
            <div>
              <div className="flex items-center justify-between text-sm mb-1.5">
                <span className="text-foreground/70">URL Scans</span>
                <span className="text-foreground/90 font-medium">
                  {subscription.urlScansUsed} / {isPro ? "∞" : subscription.urlScansLimit}
                </span>
              </div>
              {isPro ? (
                <div className="h-2 rounded-full bg-white/5">
                  <div className="h-full rounded-full bg-neon-cyan/40 w-0" />
                </div>
              ) : (
                <div className="h-2 rounded-full bg-white/5">
                  <div
                    className="h-full rounded-full bg-neon-cyan/60 transition-all duration-300"
                    style={{ width: `${urlPct}%` }}
                  />
                </div>
              )}
            </div>

            {/* Repo Scans */}
            <div>
              <div className="flex items-center justify-between text-sm mb-1.5">
                <span className="text-foreground/70">Repo Scans</span>
                <span className="text-foreground/90 font-medium">
                  {subscription.repoScansUsed} / {isPro ? "∞" : subscription.repoScansLimit}
                </span>
              </div>
              {isPro ? (
                <div className="h-2 rounded-full bg-white/5">
                  <div className="h-full rounded-full bg-neon-cyan/40 w-0" />
                </div>
              ) : (
                <div className="h-2 rounded-full bg-white/5">
                  <div
                    className="h-full rounded-full bg-neon-cyan/60 transition-all duration-300"
                    style={{ width: `${repoPct}%` }}
                  />
                </div>
              )}
            </div>
          </div>
        </section>

        {/* ── Support ── */}
        <section className="rounded-2xl border border-white/8 bg-white/[0.02] p-6">
          <h2 className="text-sm font-medium text-foreground/50 uppercase tracking-wider mb-4">Support</h2>
          <a
            href="mailto:contact@trust-scan.me"
            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-lg border border-white/10 text-sm text-foreground/80 hover:bg-white/5 hover:text-foreground transition-colors"
          >
            <MessageCircle className="w-4 h-4" />
            Contact Support
          </a>
          <p className="text-xs text-foreground/40 mt-2">
            contact@trust-scan.me — we typically respond within 1 business day
          </p>
        </section>

        {/* ── Danger Zone ── */}
        <section className="rounded-2xl border border-red-500/15 bg-red-500/[0.02] p-6">
          <h2 className="text-sm font-medium text-red-400/70 uppercase tracking-wider mb-4">Danger Zone</h2>
          <p className="text-sm text-foreground/50 mb-4">
            Permanently delete your account and all associated data. This action cannot be undone.
          </p>
          <button
            onClick={() => setDeleteOpen(true)}
            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-lg border border-red-500/20 text-sm text-red-400/80 hover:bg-red-500/10 hover:text-red-400 transition-colors"
          >
            <Trash2 className="w-4 h-4" />
            Delete Account
          </button>
          {isPro && hasActiveSubscription && (
            <p className="text-xs text-amber-400/70 mt-2">
              You must cancel your Pro subscription before deleting your account.
            </p>
          )}
        </section>

        {/* Footer links */}
        <div className="flex items-center justify-center gap-4 text-xs text-foreground/30 pt-4">
          <Link href="/terms" className="hover:text-foreground/50 transition-colors">Terms</Link>
          <span>·</span>
          <Link href="/privacy" className="hover:text-foreground/50 transition-colors">Privacy</Link>
        </div>
      </main>

      {/* Modals */}
      <UpgradeModal
        open={upgradeOpen}
        onClose={() => setUpgradeOpen(false)}
        trigger="account_page"
        urlScansUsed={subscription.urlScansUsed}
        urlScansLimit={subscription.urlScansLimit}
        repoScansUsed={subscription.repoScansUsed}
        repoScansLimit={subscription.repoScansLimit}
      />
      <DeleteConfirmModal
        open={deleteOpen}
        onClose={() => setDeleteOpen(false)}
        onConfirm={handleDeleteAccount}
        loading={deleteLoading}
        hasActiveSubscription={!!hasActiveSubscription}
      />
    </div>
  );
}
