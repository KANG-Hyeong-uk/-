"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase";
import { ProviderPicker } from "@/components/trust/ProviderPicker";
import { Shield, Zap, Clock, FileDown, CheckCircle2, X, Wand2, GitBranch } from "lucide-react";

interface UpgradeModalProps {
  open: boolean;
  onClose: () => void;
  trigger?: string;
  urlScansUsed?: number;
  urlScansLimit?: number;
  repoScansUsed?: number;
  repoScansLimit?: number;
}

export function UpgradeModal({ open, onClose, trigger, urlScansUsed = 0, urlScansLimit = 5, repoScansUsed = 0, repoScansLimit = 3 }: UpgradeModalProps) {
  const [plan, setPlan] = useState<"monthly" | "yearly">("monthly");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loginPickerOpen, setLoginPickerOpen] = useState(false);

  if (!open) return null;

  const handleUpgrade = async () => {
    setLoading(true);
    setError(null);
    try {
      const supabase = createClient();
      const { data: { user } } = await supabase.auth.getUser();

      if (!user) {
        setLoading(false);
        setLoginPickerOpen(true);
        return;
      }

      const priceId = plan === "monthly"
        ? process.env.NEXT_PUBLIC_PADDLE_PRICE_MONTHLY
        : process.env.NEXT_PUBLIC_PADDLE_PRICE_YEARLY;

      if (!window.Paddle || !priceId) {
        setError("Payment system is loading. Please try again.");
        setLoading(false);
        return;
      }

      onClose();
      window.Paddle.Checkout.open({
        items: [{ priceId, quantity: 1 }],
        customer: { email: user.email || "" },
        customData: { user_id: user.id },
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not open the payment page.");
    } finally {
      setLoading(false);
    }
  };

  const proFeatures = [
    { icon: Shield, text: "Unlimited URL + GitHub repo scans" },
    { icon: Zap, text: "Unlimited AI analysis — root cause + fix code" },
    { icon: GitBranch, text: "Auto-Fix PR — one-click GitHub PR with security fixes" },
    { icon: Wand2, text: "Fix with AI — fix prompt for your IDE" },
    { icon: Clock, text: "Scheduled scans — daily / weekly auto-check" },
    { icon: FileDown, text: "PDF / CSV report export" },
  ];

  return (
    <div
      className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center"
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div className="glass rounded-2xl border border-neon-cyan/20 max-w-lg w-full mx-4 p-6 shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-xl font-bold text-neon-cyan flex items-center gap-2">
            <Shield className="w-5 h-5" />
            Upgrade to Trust Pro
          </h2>
          <button
            onClick={onClose}
            aria-label="Close"
            className="text-muted-foreground hover:text-foreground transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Scan Usage Info */}
        {trigger === "scan_limit" && (
          <div className="mb-4 p-3 rounded-xl bg-white/5 border border-white/10 text-sm space-y-1">
            <div className="flex justify-between">
              <span className="text-muted-foreground">URL Scans this month</span>
              <span className={urlScansUsed >= urlScansLimit ? "text-red-400 font-medium" : "text-foreground"}>
                {urlScansUsed} / {urlScansLimit === Infinity ? "∞" : urlScansLimit}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Repo Scans this month</span>
              <span className={repoScansUsed >= repoScansLimit ? "text-red-400 font-medium" : "text-foreground"}>
                {repoScansUsed} / {repoScansLimit === Infinity ? "∞" : repoScansLimit}
              </span>
            </div>
          </div>
        )}

        {/* Plan Tabs */}
        <div className="flex rounded-xl border border-white/10 p-1 mb-6">
          <button
            onClick={() => setPlan("monthly")}
            className={`flex-1 py-2 rounded-lg text-sm font-medium transition-colors ${
              plan === "monthly"
                ? "bg-neon-cyan text-black"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            Monthly
          </button>
          <button
            onClick={() => setPlan("yearly")}
            className={`flex-1 py-2 rounded-lg text-sm font-medium transition-colors ${
              plan === "yearly"
                ? "bg-neon-cyan text-black"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            Yearly
            <span className="ml-1 text-xs text-green-400">Save 17%</span>
          </button>
        </div>

        {/* Price Display */}
        <div className="text-center mb-6">
          {plan === "monthly" ? (
            <div>
              <div className="flex items-baseline justify-center gap-2">
                <span className="text-muted-foreground line-through text-lg">$12</span>
                <span className="text-4xl font-bold text-neon-cyan">$9.9</span>
                <span className="text-muted-foreground">/mo</span>
              </div>
              <div className="mt-1 inline-block px-2 py-0.5 rounded-full bg-green-500/20 text-green-400 text-xs font-medium">
                Limited-time launch offer
              </div>
            </div>
          ) : (
            <div>
              <div className="flex items-baseline justify-center gap-2">
                <span className="text-4xl font-bold text-neon-cyan">$99</span>
                <span className="text-muted-foreground">/yr</span>
              </div>
              <div className="mt-1 text-sm text-muted-foreground">$8.25/mo — 2 months free</div>
            </div>
          )}
        </div>

        {/* Features */}
        <ul className="space-y-3 mb-6">
          {proFeatures.map(({ icon: Icon, text }) => (
            <li key={text} className="flex items-center gap-3 text-sm">
              <CheckCircle2 className="w-4 h-4 text-neon-cyan shrink-0" />
              <span>{text}</span>
            </li>
          ))}
        </ul>

        {/* Error */}
        {error && (
          <div className="mb-4 p-3 rounded-xl bg-red-500/10 border border-red-500/20 text-red-400 text-sm">
            {error}
          </div>
        )}

        {/* CTA */}
        <button
          onClick={handleUpgrade}
          disabled={loading}
          className="w-full py-3 rounded-xl bg-neon-cyan text-black font-bold text-sm hover:bg-neon-cyan/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {loading ? "Processing..." : "Start Pro →"}
        </button>

        <p className="text-center text-xs text-muted-foreground mt-3">
          Credit card · Cancel anytime · 30-day money-back guarantee
        </p>
      </div>
      <ProviderPicker open={loginPickerOpen} onClose={() => setLoginPickerOpen(false)} />
    </div>
  );
}
