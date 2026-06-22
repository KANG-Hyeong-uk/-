/**
 * Trust Frontend TypeScript Types
 * Aligned with backend schemas and Nuclei output format
 */

// Severity levels (5 levels from Nuclei)
export type Severity = "critical" | "high" | "medium" | "low" | "info";

// Scan modes
export type ScanMode = "tech" | "quick" | "full" | "critical";

// Scan status
export type ScanStatus = "pending" | "processing" | "completed" | "failed";

// Vulnerability category from AI analysis
export type VulnerabilityCategory =
  | "api_leak"
  | "exposure"
  | "misconfig"
  | "cve"
  | "privacy_risk";

// Fix complexity from AI analysis
export type FixComplexity = "simple" | "moderate" | "complex";

// Summary of vulnerabilities by severity
export interface VulnerabilitySummary {
  critical: number;
  high: number;
  medium: number;
  low: number;
  info: number;
}

// Base vulnerability from Nuclei scan
export interface NucleiVulnerability {
  id: string;
  template_id: string;
  name: string;
  severity: Severity;
  matched_at: string;
  extracted_results: string[] | { data: string[]; matched_locations: string[] };
  matched_locations?: string[];
  ai_analyzed: boolean;
  is_fixed: boolean;
}

// Vulnerability with AI analysis
export interface VulnerabilityWithAnalysis extends NucleiVulnerability {
  category?: VulnerabilityCategory;
  description?: string;
  impact?: string;
  before_code?: string;
  after_code?: string;
  fix_steps?: string[];
  fix_complexity?: FixComplexity;
  reference_urls?: string[];
}

// Score breakdown item from calculate_score()
export interface ScoreBreakdownItem {
  template_id: string;
  name: string;
  severity: string;
  locations: number;
  base_deduction: number;
  weight: number;
  actual_deduction: number;
}

// Scan result from API
export interface ScanResult {
  scan_id: string;
  status: ScanStatus;
  target_url: string;
  progress?: number;
  current_stage?: string;
  score?: number;
  grade?: string;
  summary?: VulnerabilitySummary;
  vulnerabilities: VulnerabilityWithAnalysis[];
  score_breakdown?: ScoreBreakdownItem[];
  error_message?: string;
  started_at?: string;
  completed_at?: string;
}

// API Request types
export interface ScanRequest {
  target_url: string;
  scan_mode?: ScanMode;
}

export interface AnalyzeRequest {
  scan_id: string;
  vulnerability_ids?: string[];
}

// API Response types
export interface ScanStartResponse {
  scan_id: string;
  status: ScanStatus;
  target_url: string;
  created_at: string;
}

export interface AnalyzeResponse {
  analyzed_count: number;
  vulnerabilities: VulnerabilityWithAnalysis[];
}

// Recent scan item
export interface RecentScanItem {
  scan_id: string;
  target_url: string;
  score?: number;
  grade?: string;
  summary?: VulnerabilitySummary;
  scan_mode?: string;
  created_at: string;
  completed_at?: string;
}

export interface RecentScansResponse {
  items: RecentScanItem[];
  next_cursor?: string | null;
  has_more?: boolean;
}

// Scheduled scan
export interface ScheduledScan {
  id: string;
  target_url: string;
  cron_expression: string;
  notification_email?: string;
  slack_webhook_url?: string;
  last_run_at?: string;
  next_run_at?: string;
  enabled: boolean;
  created_at: string;
}

export interface ScheduledScansResponse {
  schedules: ScheduledScan[];
}

// Benchmark data from /api/stats/benchmark
export interface BenchmarkData {
  total_scans: number;
  avg_score: number;
  median_score: number;
  score_distribution: Array<{ range: string; count: number }>;
  percentile: number;
}

// UI Helper types
export interface SeverityConfig {
  label: string;
  color: string;
  bgColor: string;
  borderColor: string;
}

export const SEVERITY_CONFIGS: Record<Severity, SeverityConfig> = {
  critical: {
    label: "Critical",
    color: "text-red-500",
    bgColor: "bg-red-500/20",
    borderColor: "border-red-500/30",
  },
  high: {
    label: "High",
    color: "text-red-400",
    bgColor: "bg-red-400/20",
    borderColor: "border-red-400/30",
  },
  medium: {
    label: "Medium",
    color: "text-yellow-400",
    bgColor: "bg-yellow-400/20",
    borderColor: "border-yellow-400/30",
  },
  low: {
    label: "Low",
    color: "text-blue-400",
    bgColor: "bg-blue-400/20",
    borderColor: "border-blue-400/30",
  },
  info: {
    label: "Info",
    color: "text-gray-400",
    bgColor: "bg-gray-400/20",
    borderColor: "border-gray-400/30",
  },
};

// Grade configurations
export interface GradeConfig {
  color: string;
  textColor: string;
  description: string;
}

export const GRADE_CONFIGS: Record<string, GradeConfig> = {
  A: {
    color: "text-green-400",
    textColor: "text-green-400",
    description: "Excellent security posture",
  },
  "B+": {
    color: "text-green-300",
    textColor: "text-green-300",
    description: "Good security with minor issues",
  },
  B: {
    color: "text-yellow-400",
    textColor: "text-yellow-400",
    description: "Adequate security, improvements needed",
  },
  "B-": {
    color: "text-yellow-500",
    textColor: "text-yellow-500",
    description: "Below average, several issues found",
  },
  C: {
    color: "text-orange-400",
    textColor: "text-orange-400",
    description: "Poor security, action required",
  },
  D: {
    color: "text-red-400",
    textColor: "text-red-400",
    description: "Critical issues detected",
  },
  F: {
    color: "text-red-500",
    textColor: "text-red-500",
    description: "Severe vulnerabilities present",
  },
};

// ==================== REPO SCAN TYPES ====================
export type RepoScanType = "full" | "secrets" | "sast" | "sca";
export type RepoVulnType = "secret" | "sast" | "sca";

export interface RepoVulnerabilitySummary {
  secrets: number;
  sast: number;
  sca: number;
  critical: number;
  high: number;
  medium: number;
  low: number;
  info: number;
}

export interface RepoVulnerability {
  id: string;
  vuln_type: RepoVulnType;
  name: string;
  severity: Severity;
  file_path?: string;
  line_number?: number;
  code_snippet?: string;
  description?: string;
  fix_suggestion?: string;
  package_name?: string;
  installed_version?: string;
  fixed_version?: string;
  cve_id?: string;
  pattern_id?: string;
  matched_locations?: string[];
  location_count?: number;
  ai_analyzed: boolean;
  before_code?: string;
  after_code?: string;
  fix_steps?: string[];
  is_fixed: boolean;
}

export interface RepoScoreBreakdownItem {
  name: string;
  pattern_id: string;
  severity: string;
  base_deduction: number;
  location_weight: number;
  raw_deduction: number;
  capped_deduction: number;
  location_count: number;
}

export interface RepoScanResult {
  scan_id: string;
  status: ScanStatus;
  repo_url: string;
  repo_name: string;
  branch: string;
  commit_hash?: string;
  progress?: number;
  current_stage?: string;
  score?: number;
  grade?: string;
  summary?: RepoVulnerabilitySummary;
  vulnerabilities: RepoVulnerability[];
  score_breakdown?: RepoScoreBreakdownItem[];
  files_scanned: number;
  error_message?: string;
  started_at?: string;
  completed_at?: string;
}

export interface RepoScanRequest {
  repo_url: string;
  branch?: string;
  scan_type?: RepoScanType;
}

export interface RepoScanStartResponse {
  scan_id: string;
  status: ScanStatus;
  repo_url: string;
  repo_name: string;
  branch: string;
  created_at: string;
}

export interface RecentRepoScanItem {
  scan_id: string;
  repo_url: string;
  repo_name: string;
  branch: string;
  score?: number;
  grade?: string;
  summary?: RepoVulnerabilitySummary;
  scan_type?: string;
  files_scanned?: number;
  created_at: string;
  completed_at?: string;
}

export interface RecentRepoScansResponse {
  items: RecentRepoScanItem[];
  next_cursor?: string | null;
  has_more?: boolean;
}

export const VULN_TYPE_CONFIGS: Record<RepoVulnType, { label: string; color: string; bgColor: string }> = {
  secret: { label: "Secret", color: "text-red-400", bgColor: "bg-red-400/20" },
  sast: { label: "Code", color: "text-yellow-400", bgColor: "bg-yellow-400/20" },
  sca: { label: "Dependency", color: "text-blue-400", bgColor: "bg-blue-400/20" },
};

// ==================== VULNERABILITY TIER SYSTEM ====================
export type VulnTier = "must-fix" | "should-fix" | "good-to-know";

export interface TierConfig {
  label: string;
  color: string;
  bgColor: string;
  borderColor: string;
  description: string;
}

export const TIER_CONFIGS: Record<VulnTier, TierConfig> = {
  "must-fix": {
    label: "Must Fix",
    color: "text-red-400",
    bgColor: "bg-red-400/20",
    borderColor: "border-red-400/30",
    description: "Critical vulnerabilities that need immediate action",
  },
  "should-fix": {
    label: "Should Fix",
    color: "text-yellow-400",
    bgColor: "bg-yellow-400/20",
    borderColor: "border-yellow-400/30",
    description: "Security issues worth addressing soon",
  },
  "good-to-know": {
    label: "Good to Know",
    color: "text-blue-400",
    bgColor: "bg-blue-400/20",
    borderColor: "border-blue-400/30",
    description: "Informational findings for awareness",
  },
};

// Info-level template IDs that should be elevated to "should-fix"
const INFO_SHOULD_FIX_PATTERNS = [
  "missing-csp",
  "missing-hsts",
  "missing-x-frame",
  "missing-x-content-type",
  "missing-permissions-policy",
  "missing-referrer-policy",
  "missing-security-headers",
  "missing-sri",
  "sensitive-data",
  "exposure",
  "directory-listing",
  "cors-misconfig",
];

/**
 * Classify a URL scan vulnerability into a tier based on severity and template_id.
 */
export function classifyTier(severity: string, templateId?: string): VulnTier {
  const sev = severity.toLowerCase();
  if (sev === "critical" || sev === "high") return "must-fix";
  if (sev === "medium") return "should-fix";
  if (sev === "low") return "good-to-know";
  // info: check template patterns
  if (sev === "info" && templateId) {
    const tid = templateId.toLowerCase();
    if (INFO_SHOULD_FIX_PATTERNS.some((p) => tid.includes(p))) {
      return "should-fix";
    }
  }
  return "good-to-know";
}

/**
 * Classify a repo scan vulnerability into a tier based on severity and vuln_type.
 */
export function classifyRepoTier(severity: string, vulnType?: string): VulnTier {
  const sev = severity.toLowerCase();
  if (sev === "critical" || sev === "high") return "must-fix";
  if (sev === "medium") return "should-fix";
  if (sev === "low") return "good-to-know";
  // info: secrets are always should-fix, others good-to-know
  if (sev === "info" && vulnType === "secret") return "should-fix";
  return "good-to-know";
}

// ==================== GITHUB CONNECTION TYPES ====================

export interface GitHubConnection {
  id: string;
  github_username: string;
  github_avatar_url?: string;
  scopes: string;
  created_at: string;
}

export interface CreateFixPRResponse {
  pr_url: string;
  pr_number: number;
  branch: string;
  files_changed: number;
  vulnerabilities_fixed: number;
}
