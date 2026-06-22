"use client";

import { motion, AnimatePresence } from "framer-motion";
import {
  Clock,
  Bell,
  Loader2,
  Trash2,
  Plus,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import type { ScheduledScan } from "@/lib/types";

interface ScheduleSectionProps {
  targetUrl?: string;
  schedules: ScheduledScan[];
  showScheduleForm: boolean;
  setShowScheduleForm: (show: boolean) => void;
  scheduleFreq: "hourly" | "daily" | "weekly";
  setScheduleFreq: (freq: "hourly" | "daily" | "weekly") => void;
  scheduleEmail: string;
  setScheduleEmail: (email: string) => void;
  scheduleSlack: string;
  setScheduleSlack: (slack: string) => void;
  isCreatingSchedule: boolean;
  onCreateSchedule: () => void;
  deletingScheduleId: string | null;
  onDeleteSchedule: (id: string) => void;
}

const cronLabel = (cron: string) => {
  if (cron === "0 * * * *") return "Hourly";
  if (cron === "0 9 * * *") return "Daily at 9:00 AM";
  if (cron === "0 9 * * 1") return "Weekly on Monday";
  return cron;
};

export function ScheduleSection({
  targetUrl,
  schedules,
  showScheduleForm,
  setShowScheduleForm,
  scheduleFreq,
  setScheduleFreq,
  scheduleEmail,
  setScheduleEmail,
  scheduleSlack,
  setScheduleSlack,
  isCreatingSchedule,
  onCreateSchedule,
  deletingScheduleId,
  onDeleteSchedule,
}: ScheduleSectionProps) {
  // Compact bar when no schedules and form not open
  const isEmpty = schedules.length === 0 && !showScheduleForm;

  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, delay: 0.7 }}
      className="mt-6"
    >
      {isEmpty ? (
        <div className="glass rounded-2xl p-5 flex items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <div className="w-10 h-10 bg-neon-cyan/10 rounded-lg flex items-center justify-center shrink-0">
              <Clock className="w-5 h-5 text-neon-cyan" />
            </div>
            <div>
              <p className="text-sm font-semibold text-foreground">Recurring Scan</p>
              <p className="text-xs text-muted-foreground">Monitor your site automatically</p>
            </div>
          </div>
          <Button
            onClick={() => setShowScheduleForm(true)}
            variant="outline"
            size="sm"
            aria-label="Create new scheduled scan"
            className="border-neon-cyan/30 text-neon-cyan hover:bg-neon-cyan/10 shrink-0"
          >
            <Plus className="w-4 h-4 mr-1.5" aria-hidden="true" />
            Schedule
          </Button>
        </div>
      ) : (
      <div className="glass rounded-2xl p-6">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            <Clock className="w-5 h-5 text-neon-cyan" />
            <h2 className="text-lg font-semibold text-foreground">
              Schedule Recurring Scan
            </h2>
          </div>
          {!showScheduleForm && (
            <Button
              onClick={() => setShowScheduleForm(true)}
              size="sm"
              aria-label="Create new scheduled scan"
              className="bg-neon-cyan text-background hover:bg-neon-cyan/90"
            >
              <Plus className="w-4 h-4 mr-2" aria-hidden="true" />
              New Schedule
            </Button>
          )}
        </div>

        {/* Schedule Form */}
        <AnimatePresence>
          {showScheduleForm && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: "auto", opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.3 }}
              className="overflow-hidden"
            >
              <div className="glass-strong rounded-xl p-4 mb-4 space-y-4">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-medium text-foreground">
                    Schedule for{" "}
                    <span className="text-neon-cyan">{targetUrl}</span>
                  </h3>
                  <button
                    onClick={() => setShowScheduleForm(false)}
                    aria-label="Close schedule form"
                    className="p-1 rounded-md text-muted-foreground hover:text-foreground hover:bg-white/10 transition-colors"
                  >
                    <X className="w-4 h-4" aria-hidden="true" />
                  </button>
                </div>

                {/* Frequency */}
                <div>
                  <label className="text-xs text-muted-foreground mb-2 block">Frequency</label>
                  <div className="flex gap-2" role="radiogroup" aria-label="Scan frequency">
                    {(["hourly", "daily", "weekly"] as const).map((freq) => (
                      <button
                        key={freq}
                        onClick={() => setScheduleFreq(freq)}
                        role="radio"
                        aria-checked={scheduleFreq === freq}
                        className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${
                          scheduleFreq === freq
                            ? "bg-neon-cyan/10 text-neon-cyan border border-neon-cyan/30"
                            : "bg-secondary/50 text-muted-foreground hover:text-foreground border border-transparent"
                        }`}
                      >
                        {freq.charAt(0).toUpperCase() + freq.slice(1)}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Notification Email */}
                <div>
                  <label className="text-xs text-muted-foreground mb-2 flex items-center gap-1.5">
                    <Bell className="w-3.5 h-3.5" />
                    Email notification (optional)
                  </label>
                  <input
                    type="email"
                    value={scheduleEmail}
                    onChange={(e) => setScheduleEmail(e.target.value)}
                    placeholder="you@example.com"
                    aria-label="Email notification address"
                    className="w-full sm:w-80 glass rounded-lg px-3 py-2 text-sm bg-transparent border border-white/10 outline-none text-foreground placeholder:text-muted-foreground focus:border-neon-cyan/30 transition-colors"
                  />
                </div>

                {/* Slack Webhook */}
                <div>
                  <label className="text-xs text-muted-foreground mb-2 flex items-center gap-1.5">
                    <Bell className="w-3.5 h-3.5" />
                    Slack webhook URL (optional)
                  </label>
                  <input
                    type="url"
                    value={scheduleSlack}
                    onChange={(e) => setScheduleSlack(e.target.value)}
                    placeholder="https://hooks.slack.com/services/..."
                    aria-label="Slack webhook URL"
                    className="w-full glass rounded-lg px-3 py-2 text-sm bg-transparent border border-white/10 outline-none text-foreground placeholder:text-muted-foreground focus:border-neon-cyan/30 transition-colors"
                  />
                </div>

                <Button
                  onClick={onCreateSchedule}
                  disabled={isCreatingSchedule}
                  className="bg-neon-cyan text-background hover:bg-neon-cyan/90"
                >
                  {isCreatingSchedule ? (
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  ) : (
                    <Clock className="w-4 h-4 mr-2" />
                  )}
                  {isCreatingSchedule ? "Creating..." : "Create Schedule"}
                </Button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Existing Schedules List */}
        {schedules.length > 0 ? (
          <div className="space-y-2">
            {schedules.map((sched) => (
              <div
                key={sched.id}
                className="flex items-center justify-between glass-strong rounded-xl px-4 py-3"
              >
                <div className="flex items-center gap-4">
                  <div className={`w-2 h-2 rounded-full ${sched.enabled ? "bg-green-400" : "bg-gray-500"}`} />
                  <div>
                    <p className="text-sm text-foreground font-medium">
                      {sched.target_url}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {cronLabel(sched.cron_expression)}
                      {sched.next_run_at && (
                        <> &middot; Next: {new Date(sched.next_run_at).toLocaleString()}</>
                      )}
                      {sched.notification_email && (
                        <> &middot; <Bell className="w-3 h-3 inline" /> {sched.notification_email}</>
                      )}
                    </p>
                  </div>
                </div>
                <button
                  onClick={() => onDeleteSchedule(sched.id)}
                  disabled={deletingScheduleId === sched.id}
                  className="p-2 rounded-lg text-muted-foreground hover:text-red-400 hover:bg-red-400/10 transition-colors disabled:opacity-50"
                  title="Delete schedule"
                  aria-label={`Delete schedule for ${sched.target_url}`}
                >
                  {deletingScheduleId === sched.id ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <Trash2 className="w-4 h-4" />
                  )}
                </button>
              </div>
            ))}
          </div>
        ) : null}
      </div>
      )}
    </motion.div>
  );
}
