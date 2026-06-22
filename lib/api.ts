/**
 * Trust Frontend API Client
 * Functions for communicating with the Trust backend API
 */

import type {
  ScanRequest,
  ScanStartResponse,
  ScanResult,
  AnalyzeRequest,
  AnalyzeResponse,
  RecentScansResponse,
  BenchmarkData,
  ScheduledScan,
  ScheduledScansResponse,
  RepoScanStartResponse,
  RepoScanResult,
  RecentRepoScansResponse,
} from "./types";

// API base URL - uses environment variable or defaults to localhost
const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8080";

/**
 * Custom error class for API errors
 */
export class APIError extends Error {
  constructor(
    message: string,
    public status: number,
    public details?: unknown
  ) {
    super(message);
    this.name = "APIError";
  }
}

/**
 * Generic fetch wrapper with error handling, retry, and timeout
 */
async function apiFetch<T>(
  endpoint: string,
  options: RequestInit & { retries?: number; timeoutMs?: number } = {}
): Promise<T> {
  const url = `${API_URL}${endpoint}`;
  const { retries: maxRetries = 3, timeoutMs = 15000, ...fetchOptions } = options;
  let lastError!: Error;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), timeoutMs);

      const response = await fetch(url, {
        ...fetchOptions,
        signal: controller.signal,
        headers: {
          "Content-Type": "application/json",
          ...fetchOptions.headers,
        },
      });

      clearTimeout(timeout);

      if (!response.ok) {
        let errorMessage = `API error: ${response.status}`;
        try {
          const errorData = await response.json();
          errorMessage = errorData.detail || errorMessage;
        } catch {
          // Ignore JSON parse errors
        }
        throw new APIError(errorMessage, response.status);
      }

      return response.json();
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
      // Don't retry on 4xx client errors (except 408)
      if (error instanceof APIError && error.status >= 400 && error.status < 500 && error.status !== 408) {
        throw error;
      }
      if (attempt < maxRetries) {
        await new Promise((r) => setTimeout(r, Math.pow(2, attempt) * 1000));
        continue;
      }
    }
  }

  throw lastError;
}

/**
 * Start a new security scan
 *
 * @param targetUrl - URL to scan
 * @param mode - Scan mode (default: "quick")
 * @param authToken - Supabase JWT (optional, required for repo-seeded scans)
 * @param repoFullName - Optional connected GitHub repo ("owner/repo") to seed DAST routes from
 * @returns Scan start response with scan_id
 */
export async function startScan(
  targetUrl: string,
  mode: ScanRequest["scan_mode"] = "quick",
  authToken?: string | null,
  repoFullName?: string | null
): Promise<ScanStartResponse> {
  const body: Record<string, unknown> = {
    target_url: targetUrl,
    scan_mode: mode,
  };
  if (repoFullName) body.repo_full_name = repoFullName;
  return apiFetch<ScanStartResponse>("/api/scan", {
    method: "POST",
    body: JSON.stringify(body),
    ...(authToken && { headers: { Authorization: `Bearer ${authToken}` } }),
  });
}

/**
 * Get scan status and results
 *
 * @param scanId - UUID of the scan
 * @returns Current scan status and results
 */
export async function getScanStatus(scanId: string): Promise<ScanResult> {
  return apiFetch<ScanResult>(`/api/scan/${scanId}`);
}

/**
 * Analyze vulnerabilities with AI
 *
 * @param scanId - UUID of the scan
 * @param vulnerabilityIds - Optional specific vulnerability IDs to analyze
 * @returns Analysis results
 */
export async function analyzeVulnerabilities(
  scanId: string,
  vulnerabilityIds?: string[],
  authToken?: string
): Promise<AnalyzeResponse> {
  return apiFetch<AnalyzeResponse>("/api/analyze", {
    method: "POST",
    body: JSON.stringify({
      scan_id: scanId,
      vulnerability_ids: vulnerabilityIds,
    }),
    ...(authToken && { headers: { Authorization: `Bearer ${authToken}` } }),
  });
}

/**
 * Analyze repo vulnerabilities with AI
 *
 * @param scanId - UUID of the repo scan
 * @param vulnerabilityIds - Optional specific vulnerability IDs to analyze
 * @param authToken - Optional Supabase JWT for plan-based limits
 * @returns Analysis results
 */
export async function analyzeRepoVulnerabilities(
  scanId: string,
  vulnerabilityIds?: string[],
  authToken?: string
): Promise<{ analyzed_count: number; vulnerabilities: Array<{ id: string; name: string; severity: string; ai_analyzed: boolean; description: string; before_code?: string; after_code?: string; fix_steps?: string[] }>; scan_id: string }> {
  return apiFetch(`/api/repo-scan/${scanId}/analyze`, {
    method: "POST",
    body: JSON.stringify({
      vulnerability_ids: vulnerabilityIds,
    }),
    ...(authToken && { headers: { Authorization: `Bearer ${authToken}` } }),
  });
}

/**
 * Poll scan status until completion
 *
 * @param scanId - UUID of the scan
 * @param onUpdate - Callback for status updates
 * @param intervalMs - Polling interval in milliseconds
 * @param timeoutMs - Maximum time to wait
 * @returns Final scan result
 */
export async function pollScanStatus(
  scanId: string,
  onUpdate?: (result: ScanResult) => void,
  intervalMs: number = 2000,
  timeoutMs: number = 900000 // 15 minutes — match Cloud Run timeout
): Promise<ScanResult> {
  const startTime = Date.now();

  while (true) {
    const result = await getScanStatus(scanId);

    // Notify callback
    if (onUpdate) {
      onUpdate(result);
    }

    // Check if scan is complete
    if (result.status === "completed" || result.status === "failed") {
      return result;
    }

    // Check timeout
    if (Date.now() - startTime > timeoutMs) {
      throw new APIError("Scan timeout", 408);
    }

    // Wait before next poll
    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }
}

/**
 * Health check for the API
 *
 * @returns true if API is healthy
 */
export async function healthCheck(): Promise<boolean> {
  try {
    await apiFetch<{ status: string }>("/health");
    return true;
  } catch {
    return false;
  }
}

/**
 * Badge response from API
 */
export interface BadgeResponse {
  scan_id: string;
  badge_url: string;
  embed_code: string;
  markdown: string;
  html: string;
}

/**
 * Generate a trust badge for a scan
 *
 * @param scanId - UUID of the scan
 * @returns Badge URLs and embed codes
 */
export async function generateBadge(scanId: string): Promise<BadgeResponse> {
  return apiFetch<BadgeResponse>(`/api/badge/${scanId}`, {
    method: "POST",
  });
}

/**
 * Get existing badge for a scan
 *
 * @param scanId - UUID of the scan
 * @returns Badge URLs and embed codes
 */
export async function getBadge(scanId: string): Promise<BadgeResponse> {
  return apiFetch<BadgeResponse>(`/api/badge/${scanId}`);
}

/**
 * Get recent completed scans
 *
 * @param limit - Maximum number of scans to return (default 20)
 * @returns List of recent completed scans
 */
export async function getRecentScans(
  limit: number = 20
): Promise<RecentScansResponse> {
  return apiFetch<RecentScansResponse>(`/api/scans/recent?limit=${limit}`);
}

/**
 * Get community stats for landing page
 */
export interface CommunityStats {
  total_url_scans: number;
  total_repo_scans: number;
  total_scans: number;
  avg_grade: string | null;
}

export async function getCommunityStats(): Promise<CommunityStats> {
  return apiFetch<CommunityStats>("/api/stats/community");
}

/**
 * Get benchmark statistics
 *
 * @param score - Optional score to calculate percentile for
 * @returns Benchmark data with score distribution
 */
export async function getBenchmark(score?: number): Promise<BenchmarkData> {
  const params = score !== undefined ? `?score=${score}` : "";
  return apiFetch<BenchmarkData>(`/api/stats/benchmark${params}`);
}

/**
 * Export scan report as PDF or CSV
 *
 * @param scanId - UUID of the scan
 * @param format - Export format ('pdf' or 'csv')
 */
export async function exportReport(
  scanId: string,
  format: "pdf" | "csv"
): Promise<void> {
  const url = `${API_URL}/api/scan/${scanId}/export?format=${format}`;
  const response = await fetch(url);

  if (!response.ok) {
    throw new APIError(`Export failed: ${response.status}`, response.status);
  }

  const blob = await response.blob();
  const blobUrl = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = blobUrl;
  a.download = `trust-report-${scanId.slice(0, 8)}.${format}`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(blobUrl);
}

/**
 * Mark a vulnerability as fixed
 *
 * @param vulnId - UUID of the vulnerability
 * @returns Success response
 */
export async function markAsFixed(
  vulnId: string
): Promise<{ status: string; vulnerability_id: string; is_fixed: boolean }> {
  return apiFetch(`/api/vulnerability/${vulnId}/fix`, {
    method: "PATCH",
  });
}

/**
 * Create a scheduled scan
 */
export async function createScheduledScan(data: {
  target_url: string;
  cron_expression: string;
  notification_email?: string;
  slack_webhook_url?: string;
}): Promise<ScheduledScan> {
  return apiFetch<ScheduledScan>("/api/scheduled-scans", {
    method: "POST",
    body: JSON.stringify(data),
  });
}

/**
 * Get all scheduled scans
 */
export async function getScheduledScans(): Promise<ScheduledScansResponse> {
  return apiFetch<ScheduledScansResponse>("/api/scheduled-scans");
}

/**
 * Delete a scheduled scan
 */
export async function deleteScheduledScan(id: string): Promise<void> {
  await apiFetch(`/api/scheduled-scans/${id}`, {
    method: "DELETE",
  });
}

// ==================== REPO SCAN API ====================

/**
 * Start a new repository scan
 */
export async function startRepoScan(
  repoUrl: string,
  branch?: string,
  scanType: string = "full",
  authToken?: string | null
): Promise<RepoScanStartResponse> {
  const body: Record<string, string> = { repo_url: repoUrl, scan_type: scanType };
  if (branch) body.branch = branch;
  return apiFetch<RepoScanStartResponse>("/api/repo-scan", {
    method: "POST",
    body: JSON.stringify(body),
    ...(authToken && { headers: { Authorization: `Bearer ${authToken}` } }),
  });
}

/**
 * Get authenticated user's scan history (URL + repo scans)
 */
export interface ScanHistoryItem {
  scan_id: string;
  type: "url" | "repo";
  target: string;
  score: number | null;
  grade: string | null;
  created_at: string | null;
  completed_at: string | null;
}

export async function getScanHistory(
  authToken: string
): Promise<{ items: ScanHistoryItem[] }> {
  return apiFetch<{ items: ScanHistoryItem[] }>("/api/scans/history", {
    headers: { Authorization: `Bearer ${authToken}` },
    retries: 1,
  });
}

/**
 * Get repo scan status and results
 */
export async function getRepoScanStatus(scanId: string): Promise<RepoScanResult> {
  return apiFetch<RepoScanResult>(`/api/repo-scan/${scanId}`);
}

/**
 * Poll repo scan status until completion
 */
export async function pollRepoScanStatus(
  scanId: string,
  onUpdate?: (result: RepoScanResult) => void,
  intervalMs: number = 3000,
  timeoutMs: number = 900000
): Promise<RepoScanResult> {
  const startTime = Date.now();
  while (true) {
    const result = await getRepoScanStatus(scanId);
    if (onUpdate) onUpdate(result);
    if (result.status === "completed" || result.status === "failed") return result;
    if (Date.now() - startTime > timeoutMs) throw new APIError("Repo scan timeout", 408);
    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }
}

/**
 * Get recent repo scans
 */
export async function getRecentRepoScans(limit: number = 20): Promise<RecentRepoScansResponse> {
  return apiFetch<RecentRepoScansResponse>(`/api/repo-scans/recent?limit=${limit}`);
}

/**
 * Mark a repo vulnerability as fixed
 */
export async function markRepoVulnAsFixed(
  vulnId: string
): Promise<{ status: string; vulnerability_id: string; is_fixed: boolean }> {
  return apiFetch(`/api/repo-vulnerability/${vulnId}/fix`, { method: "PATCH" });
}

// ==================== FIX PROMPT API ====================

/**
 * Get AI fix prompt for scan vulnerabilities
 *
 * @param scanId - UUID of the scan
 * @param options - Severity filter and scan type
 * @returns Generated prompt, vulnerability count, and estimated changes
 */
export async function getFixPrompt(
  scanId: string,
  options: { severity?: string[]; isRepo?: boolean; authToken?: string }
): Promise<{ prompt: string; vuln_count: number; estimated_changes: number }> {
  const endpoint = options.isRepo
    ? `/api/repo-scan/${scanId}/fix-prompt`
    : `/api/scan/${scanId}/fix-prompt`;
  const params = new URLSearchParams();
  if (options.severity?.length) params.set("severity", options.severity.join(","));
  const qs = params.toString() ? `?${params.toString()}` : "";
  return apiFetch<{ prompt: string; vuln_count: number; estimated_changes: number }>(
    `${endpoint}${qs}`,
    options.authToken ? { headers: { Authorization: `Bearer ${options.authToken}` } } : {}
  );
}

// ==================== GITHUB CONNECTION API ====================

/**
 * Check GitHub connection status
 */
export async function getGitHubConnection(
  authToken: string
): Promise<{ connected: boolean; github_username?: string; github_avatar_url?: string }> {
  return apiFetch("/api/github/connection", {
    headers: { Authorization: `Bearer ${authToken}` },
  });
}

/**
 * Connect GitHub by exchanging OAuth code
 */
export async function connectGitHub(
  code: string,
  authToken: string
): Promise<{ connected: boolean; github_username: string; github_avatar_url?: string }> {
  return apiFetch("/api/github/connect", {
    method: "POST",
    headers: { Authorization: `Bearer ${authToken}` },
    body: JSON.stringify({ code }),
  });
}

/**
 * Disconnect GitHub
 */
export async function disconnectGitHub(
  authToken: string
): Promise<{ connected: boolean }> {
  return apiFetch("/api/github/connection", {
    method: "DELETE",
    headers: { Authorization: `Bearer ${authToken}` },
  });
}

/**
 * A GitHub repository accessible by the connected user.
 */
export interface GitHubRepo {
  full_name: string;
  private: boolean;
  default_branch: string;
  language: string | null;
  pushed_at: string | null;
  homepage: string | null;
}

/**
 * List GitHub repos accessible by the connected user.
 * Returns 400 if the user has no GitHub connection.
 */
export async function getGitHubRepos(
  authToken: string
): Promise<{ repos: GitHubRepo[] }> {
  return apiFetch<{ repos: GitHubRepo[] }>("/api/github/repos", {
    headers: { Authorization: `Bearer ${authToken}` },
    retries: 1,
  });
}

/**
 * Create a fix PR for repo scan vulnerabilities
 */
export async function createFixPR(
  scanId: string,
  options: {
    vulnerabilityIds?: string[];
    targetBranch?: string;
    authToken: string;
  }
): Promise<{
  pr_url: string;
  pr_number: number;
  branch: string;
  files_changed: number;
  vulnerabilities_fixed: number;
}> {
  const body: Record<string, unknown> = { scan_id: scanId };
  if (options.vulnerabilityIds?.length) body.vulnerability_ids = options.vulnerabilityIds;
  if (options.targetBranch) body.target_branch = options.targetBranch;

  return apiFetch("/api/github/create-fix-pr", {
    method: "POST",
    headers: { Authorization: `Bearer ${options.authToken}` },
    body: JSON.stringify(body),
    retries: 0,
    timeoutMs: 120000,
  });
}

/**
 * Submit feedback on fix PR quality
 */
export async function submitFixFeedback(
  scanId: string,
  feedback: "positive" | "negative",
  authToken: string
): Promise<{ status: string }> {
  return apiFetch("/api/github/fix-feedback", {
    method: "POST",
    headers: { Authorization: `Bearer ${authToken}` },
    body: JSON.stringify({ scan_id: scanId, feedback }),
    retries: 1,
  });
}

// ==================== VERCEL CONNECTION API ====================

export interface VercelConnectionStatus {
  connected: boolean;
  vercel_username?: string;
  vercel_team_id?: string;
}

/**
 * Check Vercel connection status
 */
export async function getVercelConnection(
  authToken: string
): Promise<VercelConnectionStatus> {
  return apiFetch<VercelConnectionStatus>("/api/vercel/connection", {
    headers: { Authorization: `Bearer ${authToken}` },
  });
}

/**
 * Connect Vercel by exchanging OAuth code
 */
export async function connectVercel(
  code: string,
  redirectUri: string,
  authToken: string
): Promise<{ connected: boolean; vercel_username: string; vercel_team_id?: string }> {
  return apiFetch("/api/vercel/connect", {
    method: "POST",
    headers: { Authorization: `Bearer ${authToken}` },
    body: JSON.stringify({ code, redirect_uri: redirectUri }),
  });
}

/**
 * Disconnect Vercel
 */
export async function disconnectVercel(
  authToken: string
): Promise<{ connected: false }> {
  return apiFetch("/api/vercel/connection", {
    method: "DELETE",
    headers: { Authorization: `Bearer ${authToken}` },
  });
}

/**
 * Look up the production URL of a Vercel project linked to a GitHub repo.
 * Returns 400 if the user has no Vercel connection.
 */
export async function getVercelProjectUrl(
  repoFullName: string,
  authToken: string
): Promise<{ project_url: string | null; repo: string }> {
  const q = new URLSearchParams({ repo: repoFullName }).toString();
  return apiFetch<{ project_url: string | null; repo: string }>(
    `/api/vercel/project-url?${q}`,
    {
      headers: { Authorization: `Bearer ${authToken}` },
      retries: 1,
    }
  );
}

// ==================== NOTIFICATION SETTINGS API ====================

export interface NotificationSettings {
  digest_enabled: boolean;
  digest_email: string | null;
  digest_frequency: string;
}

export async function getNotificationSettings(
  authToken: string
): Promise<NotificationSettings> {
  return apiFetch<NotificationSettings>("/api/notifications/settings", {
    headers: { Authorization: `Bearer ${authToken}` },
  });
}

export async function updateNotificationSettings(
  authToken: string,
  settings: Partial<NotificationSettings>
): Promise<NotificationSettings> {
  return apiFetch<NotificationSettings>("/api/notifications/settings", {
    method: "PUT",
    headers: { Authorization: `Bearer ${authToken}` },
    body: JSON.stringify(settings),
  });
}

// ==================== BILLING API ====================

/**
 * Create Paddle Checkout session
 */
export async function createCheckoutSession(
  plan: "monthly" | "yearly",
  authToken: string
): Promise<{ checkout_url: string }> {
  return apiFetch<{ checkout_url: string }>("/api/billing/create-checkout", {
    method: "POST",
    headers: { Authorization: `Bearer ${authToken}` },
    body: JSON.stringify({ plan }),
    retries: 0,
  });
}

/**
 * Create Paddle Customer Portal session
 */
export async function createCustomerPortal(
  authToken: string
): Promise<{ portal_url: string }> {
  return apiFetch<{ portal_url: string }>("/api/billing/customer-portal", {
    method: "POST",
    headers: { Authorization: `Bearer ${authToken}` },
    retries: 0,
  });
}

// ==================== ACCOUNT API ====================

/**
 * Delete the authenticated user's account.
 * Blocked if user has active subscription.
 */
export async function deleteAccount(
  authToken: string
): Promise<{ status: string }> {
  return apiFetch<{ status: string }>("/api/account", {
    method: "DELETE",
    headers: { Authorization: `Bearer ${authToken}` },
    retries: 0,
  });
}
