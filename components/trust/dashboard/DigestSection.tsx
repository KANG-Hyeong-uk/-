"use client";

import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import { Mail, Loader2, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { getNotificationSettings, updateNotificationSettings } from "@/lib/api";

interface DigestSectionProps {
  authToken?: string | null;
}

export function DigestSection({ authToken }: DigestSectionProps) {
  const [enabled, setEnabled] = useState(false);
  const [email, setEmail] = useState("");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    if (!authToken) return;
    getNotificationSettings(authToken)
      .then((s) => {
        setEnabled(s.digest_enabled);
        setEmail(s.digest_email || "");
        setLoaded(true);
      })
      .catch(() => setLoaded(true));
  }, [authToken]);

  const handleSave = async () => {
    if (!authToken) return;
    setSaving(true);
    setSaved(false);
    try {
      await updateNotificationSettings(authToken, {
        digest_enabled: enabled,
        digest_email: email || null,
        digest_frequency: "weekly",
      });
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch (e) {
      console.error("Failed to save digest settings:", e);
    } finally {
      setSaving(false);
    }
  };

  if (!authToken || !loaded) return null;

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, delay: 0.8 }}
      className="mt-6"
    >
      <div className="glass rounded-2xl p-6">
        <div className="flex items-center gap-3 mb-4">
          <Mail className="w-5 h-5 text-neon-cyan" />
          <h2 className="text-lg font-semibold text-foreground">
            Weekly Security Digest
          </h2>
        </div>

        <p className="text-sm text-muted-foreground mb-4">
          Get a weekly email summarizing your scan results, score trends, and top vulnerabilities.
        </p>

        <div className="space-y-4">
          {/* Toggle */}
          <label className="flex items-center gap-3 cursor-pointer">
            <button
              role="switch"
              aria-checked={enabled}
              onClick={() => setEnabled(!enabled)}
              className={`relative w-10 h-6 rounded-full transition-colors ${
                enabled ? "bg-neon-cyan" : "bg-white/10"
              }`}
            >
              <span
                className={`absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white transition-transform ${
                  enabled ? "translate-x-4" : ""
                }`}
              />
            </button>
            <span className="text-sm text-foreground">
              {enabled ? "Digest enabled" : "Digest disabled"}
            </span>
          </label>

          {/* Email input (shown when enabled) */}
          {enabled && (
            <div>
              <label className="text-xs text-muted-foreground mb-2 block">
                Delivery email
              </label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
                aria-label="Digest email address"
                className="w-full sm:w-80 glass rounded-lg px-3 py-2 text-sm bg-transparent border border-white/10 outline-none text-foreground placeholder:text-muted-foreground focus:border-neon-cyan/30 transition-colors"
              />
            </div>
          )}

          {/* Save button */}
          <Button
            onClick={handleSave}
            disabled={saving || (enabled && !email)}
            size="sm"
            className="bg-neon-cyan text-background hover:bg-neon-cyan/90"
          >
            {saving ? (
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
            ) : saved ? (
              <Check className="w-4 h-4 mr-2" />
            ) : (
              <Mail className="w-4 h-4 mr-2" />
            )}
            {saving ? "Saving..." : saved ? "Saved!" : "Save Settings"}
          </Button>
        </div>
      </div>
    </motion.div>
  );
}
