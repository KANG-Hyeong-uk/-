import posthog from "posthog-js";

/** Type-safe analytics event helpers for PostHog */

export function trackScanStarted(type: "url" | "repo", target: string) {
  posthog.capture("scan_started", { type, target });
}

export function trackScanCompleted(props: {
  type: "url" | "repo";
  score?: number;
  grade?: string;
  vuln_count: number;
}) {
  posthog.capture("scan_completed", props);
}

export function trackTierFilterClicked(tier: string | null) {
  posthog.capture("tier_filter_clicked", { tier: tier ?? "all" });
}

export function trackAiAnalysisClicked(vulnId: string, severity: string) {
  posthog.capture("ai_analysis_clicked", { vuln_id: vulnId, severity });
}

export function trackAiAnalysisAll(vulnCount: number) {
  posthog.capture("ai_analysis_all", { vuln_count: vulnCount });
}

export function trackFixWithAiClicked(scanId: string, isRepo: boolean) {
  posthog.capture("fix_with_ai_clicked", { scan_id: scanId, is_repo: isRepo });
}

export function trackFixPRClicked(scanId: string) {
  posthog.capture("fix_pr_clicked", { scan_id: scanId });
}

export function trackReportShared(method: "copy" | "twitter" | "linkedin") {
  posthog.capture("report_shared", { method });
}

export function trackBadgeGenerated(grade: string) {
  posthog.capture("badge_generated", { grade });
}

export function trackSignupClicked(from: string) {
  posthog.capture("signup_clicked", { from });
}

export function trackUpgradeModalOpened(trigger: string) {
  posthog.capture("upgrade_modal_opened", { trigger });
}
