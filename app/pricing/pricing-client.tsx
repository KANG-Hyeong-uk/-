"use client";

import { useState } from "react";
import Link from "next/link";
import { motion } from "framer-motion";
import {
  Shield,
  Zap,
  Clock,
  FileDown,
  CheckCircle2,
  X,
  ArrowLeft,
  Wand2,
  GitBranch,
  Mail,
  Bell,
} from "lucide-react";
import { createClient } from "@/lib/supabase";
import { ProviderPicker } from "@/components/trust/ProviderPicker";
import { PaddleLoader } from "@/components/trust/PaddleLoader";

const fadeUp = {
  hidden: { opacity: 0, y: 32 },
  visible: { opacity: 1, y: 0 },
};

const staggerContainer = {
  hidden: {},
  visible: { transition: { staggerChildren: 0.1 } },
};

const fadeUpItem = {
  hidden: { opacity: 0, y: 24 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.45, ease: "easeOut" as const } },
};

const FREE_FEATURES = [
  "5 URL scans per month",
  "3 GitHub repo scans per month",
  "Vulnerability list with severity ratings",
  "2 free AI analyses per scan",
  "Shareable report link",
];

const PRO_FEATURES = [
  { icon: Shield, text: "Unlimited URL + GitHub repo scans" },
  { icon: Zap, text: "Unlimited AI analysis — root cause + fix code" },
  { icon: GitBranch, text: "Auto-Fix PR — one-click GitHub PR with security fixes" },
  { icon: Wand2, text: "Fix with AI — full fix prompt for your IDE" },
  { icon: Clock, text: "Scheduled scans — daily / weekly auto-check" },
  { icon: Mail, text: "Weekly security digest — score trends + top vulnerabilities" },
  { icon: Bell, text: "Browser notifications — get alerted when scans complete" },
  { icon: FileDown, text: "PDF / CSV report export" },
];

const FAQ = [
  {
    q: "Can I upgrade from Free to Pro at any time?",
    a: "Yes. Your Pro features activate instantly the moment you upgrade.",
  },
  {
    q: "What is your refund policy?",
    a: "We offer a full refund within 30 days of payment, no questions asked. Email contact@trust-scan.me and we'll process it within 3–5 business days.",
  },
  {
    q: "Which payment methods are accepted?",
    a: "Visa, Mastercard, American Express, and most major debit cards. Payments are processed securely by Paddle.",
  },
  {
    q: "How long is the launch event price valid?",
    a: "The launch price is available for a limited time only. After the launch period ends, the regular price ($12/month) will apply. Existing subscribers keep their launch rate.",
  },
  {
    q: "Is my data safe?",
    a: "Scan results are stored encrypted in Supabase. We never sell your data or share it with third parties beyond what's necessary to run the service.",
  },
];

export default function PricingClient() {
  const [plan, setPlan] = useState<"monthly" | "yearly">("monthly");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loginPickerOpen, setLoginPickerOpen] = useState(false);

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

      window.Paddle.Checkout.open({
        items: [{ priceId, quantity: 1 }],
        customer: { email: user.email || "" },
        customData: { user_id: user.id },
      });
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Could not open the checkout page."
      );
      setLoading(false);
    }
  };

  const faqJsonLd = {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: FAQ.map(({ q, a }) => ({
      "@type": "Question",
      name: q,
      acceptedAnswer: {
        "@type": "Answer",
        text: a,
      },
    })),
  };

  return (
    <div className="min-h-screen bg-background">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(faqJsonLd) }}
      />
      <PaddleLoader />
      {/* Nav */}
      <nav className="border-b border-white/8 px-6 py-4">
        <div className="max-w-5xl mx-auto flex items-center gap-3">
          <Link
            href="/"
            className="flex items-center gap-2 text-muted-foreground hover:text-foreground transition-colors text-sm"
          >
            <ArrowLeft className="w-4 h-4" />
            Trust
          </Link>
        </div>
      </nav>

      <main className="max-w-5xl mx-auto px-6 py-20">
        {/* Header */}
        <motion.div
          className="text-center mb-12"
          initial="hidden"
          animate="visible"
          variants={fadeUp}
          transition={{ duration: 0.6, ease: "easeOut" }}
        >
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full border border-neon-cyan/30 bg-neon-cyan/5 text-neon-cyan text-xs font-medium mb-4">
            <Shield className="w-3 h-3" />
            Limited-time launch offer
          </div>
          <h1 className="text-4xl font-bold mb-4">
            Security made{" "}
            <span className="text-neon-cyan neon-text">simple</span>
          </h1>
          <p className="text-muted-foreground text-lg max-w-xl mx-auto">
            Start for free. Upgrade when you need more coverage.
          </p>
        </motion.div>

        {/* Billing Toggle */}
        <div className="flex justify-center mb-10">
          <div className="flex rounded-xl border border-white/10 p-1 bg-white/3">
            <button
              onClick={() => setPlan("monthly")}
              className={`px-6 py-2 rounded-lg text-sm font-medium transition-colors ${
                plan === "monthly"
                  ? "bg-neon-cyan text-black"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              Monthly
            </button>
            <button
              onClick={() => setPlan("yearly")}
              className={`px-6 py-2 rounded-lg text-sm font-medium transition-colors ${
                plan === "yearly"
                  ? "bg-neon-cyan text-black"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              Yearly
              <span className="ml-2 text-xs text-green-400 font-semibold">
                Save 17%
              </span>
            </button>
          </div>
        </div>

        {/* Pricing Cards */}
        <motion.div
          className="grid md:grid-cols-2 gap-6 max-w-3xl mx-auto"
          variants={staggerContainer}
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true, amount: 0.15 }}
        >
          {/* Free */}
          <motion.div className="glass rounded-2xl p-8 border border-white/8" variants={fadeUpItem}>
            <div className="mb-6">
              <h2 className="text-lg font-semibold text-foreground mb-1">
                Free
              </h2>
              <p className="text-muted-foreground text-sm">
                Your first scan is on us
              </p>
            </div>
            <div className="mb-8">
              <span className="text-4xl font-bold">$0</span>
              <span className="text-muted-foreground ml-1">/month</span>
            </div>
            <ul className="space-y-3 mb-8">
              {FREE_FEATURES.map((f) => (
                <li
                  key={f}
                  className="flex items-start gap-3 text-sm text-muted-foreground"
                >
                  <CheckCircle2 className="w-4 h-4 text-white/30 shrink-0 mt-0.5" />
                  {f}
                </li>
              ))}
            </ul>
            <Link
              href="/"
              className="block w-full py-3 rounded-xl border border-white/15 text-center text-sm font-medium text-foreground hover:bg-white/5 transition-colors"
            >
              Get started free
            </Link>
          </motion.div>

          {/* Pro */}
          <motion.div className="glass-strong rounded-2xl p-8 border border-neon-cyan/30 relative overflow-hidden neon-glow" variants={fadeUpItem}>
            <div className="absolute top-0 right-0 w-32 h-32 bg-neon-cyan/5 rounded-full blur-2xl pointer-events-none" />

            <div className="mb-6 relative">
              <div className="flex items-center gap-2 mb-1">
                <h2 className="text-lg font-semibold text-neon-cyan">Pro</h2>
                <span className="px-2 py-0.5 rounded-full bg-green-500/20 text-green-400 text-xs font-medium">
                  Launch offer
                </span>
              </div>
              <p className="text-muted-foreground text-sm">
                Unlimited scans + AI analysis
              </p>
            </div>

            <div className="mb-8 relative">
              {plan === "monthly" ? (
                <>
                  <div className="flex items-baseline gap-2">
                    <span className="text-muted-foreground line-through">
                      $12
                    </span>
                    <span className="text-4xl font-bold text-neon-cyan">
                      $9.9
                    </span>
                    <span className="text-muted-foreground">/month</span>
                  </div>
                  <p className="text-xs text-muted-foreground mt-1">
                    Limited-time launch price
                  </p>
                </>
              ) : (
                <>
                  <div className="flex items-baseline gap-2">
                    <span className="text-4xl font-bold text-neon-cyan">
                      $99
                    </span>
                    <span className="text-muted-foreground">/year</span>
                  </div>
                  <p className="text-xs text-muted-foreground mt-1">
                    $8.25/month · 2 months free
                  </p>
                </>
              )}
            </div>

            <ul className="space-y-3 mb-8 relative">
              {PRO_FEATURES.map(({ icon: Icon, text }) => (
                <li key={text} className="flex items-center gap-3 text-sm">
                  <CheckCircle2 className="w-4 h-4 text-neon-cyan shrink-0" />
                  {text}
                </li>
              ))}
            </ul>

            {error && (
              <div className="mb-4 p-3 rounded-xl bg-red-500/10 border border-red-500/20 text-red-400 text-sm flex items-start gap-2">
                <X className="w-4 h-4 shrink-0 mt-0.5" />
                {error}
              </div>
            )}

            <button
              onClick={handleUpgrade}
              disabled={loading}
              className="relative w-full py-3 rounded-xl bg-neon-cyan text-black font-bold text-sm hover:bg-neon-cyan/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loading ? "Loading..." : "Start Pro →"}
            </button>
            <p className="text-center text-xs text-muted-foreground mt-3">
              Cancel anytime · 30-day money-back guarantee
            </p>
          </motion.div>
        </motion.div>

        {/* FAQ */}
        <motion.div
          className="max-w-2xl mx-auto mt-20"
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true, amount: 0.15 }}
          variants={fadeUp}
          transition={{ duration: 0.5, ease: "easeOut" }}
        >
          <h2 className="text-xl font-semibold text-center mb-8">
            Frequently asked questions
          </h2>
          <motion.div
            className="space-y-4"
            variants={staggerContainer}
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true, amount: 0.15 }}
          >
            {FAQ.map(({ q, a }) => (
              <motion.div
                key={q}
                className="glass rounded-xl p-5 border border-white/8"
                variants={fadeUpItem}
              >
                <p className="font-medium text-sm mb-2">{q}</p>
                <p className="text-muted-foreground text-sm">{a}</p>
              </motion.div>
            ))}
          </motion.div>
        </motion.div>
      </main>

      {/* Footer */}
      <footer className="border-t border-white/8 mt-20 py-8 text-center text-xs text-muted-foreground">
        <div className="flex justify-center gap-6">
          <Link
            href="/terms"
            className="hover:text-foreground transition-colors"
          >
            Terms of Service
          </Link>
          <Link
            href="/privacy"
            className="hover:text-foreground transition-colors"
          >
            Privacy Policy
          </Link>
          <Link href="/" className="hover:text-foreground transition-colors">
            Trust Security
          </Link>
        </div>
      </footer>
      <ProviderPicker open={loginPickerOpen} onClose={() => setLoginPickerOpen(false)} />
    </div>
  );
}
