"""
Trust Backend Pydantic Schemas
Data validation models for API requests and responses
"""

from datetime import datetime
from enum import Enum
from typing import Generic, Optional, TypeVar
from pydantic import BaseModel, Field, HttpUrl

T = TypeVar("T")


class ScanMode(str, Enum):
    """Scan mode options"""
    TECH = "tech"
    QUICK = "quick"
    FULL = "full"
    CRITICAL = "critical"


class ScanStatus(str, Enum):
    """Scan status options"""
    PENDING = "pending"
    PROCESSING = "processing"
    COMPLETED = "completed"
    FAILED = "failed"


class Severity(str, Enum):
    """Vulnerability severity levels"""
    CRITICAL = "critical"
    HIGH = "high"
    MEDIUM = "medium"
    LOW = "low"
    INFO = "info"


class ExportFormat(str, Enum):
    """Export format options"""
    PDF = "pdf"
    CSV = "csv"


class FixComplexity(str, Enum):
    """Fix complexity levels"""
    SIMPLE = "simple"
    MODERATE = "moderate"
    COMPLEX = "complex"


class VulnerabilityCategory(str, Enum):
    """Vulnerability categories"""
    API_LEAK = "api_leak"
    EXPOSURE = "exposure"
    MISCONFIG = "misconfig"
    CVE = "cve"
    PRIVACY_RISK = "privacy_risk"


# Request Schemas
class ScanRequest(BaseModel):
    """Request to start a new scan"""
    target_url: str = Field(..., description="URL to scan")
    scan_mode: ScanMode = Field(default=ScanMode.QUICK, description="Scan mode")
    repo_full_name: Optional[str] = Field(
        default=None,
        description=(
            "Optional GitHub repo 'owner/repo' to pull route hints from. "
            "Requires the caller's GitHub connection to have access."
        ),
    )


class AnalyzeRequest(BaseModel):
    """Request to analyze vulnerabilities with AI"""
    scan_id: str = Field(..., description="Scan ID to analyze")
    vulnerability_ids: Optional[list[str]] = Field(
        default=None,
        description="Specific vulnerability IDs to analyze (empty for all)"
    )


# Response Schemas
class ScanStartResponse(BaseModel):
    """Response when scan is started"""
    scan_id: str
    status: ScanStatus
    target_url: str
    created_at: datetime


class VulnerabilitySummary(BaseModel):
    """Summary counts by severity"""
    critical: int = 0
    high: int = 0
    medium: int = 0
    low: int = 0
    info: int = 0


class VulnerabilityBase(BaseModel):
    """Base vulnerability data from Nuclei"""
    id: str
    template_id: str
    name: str
    severity: Severity
    matched_at: str
    extracted_results: list[str] = []
    matched_locations: list[str] = []
    ai_analyzed: bool = False
    is_fixed: bool = False


class VulnerabilityWithAnalysis(VulnerabilityBase):
    """Vulnerability with AI analysis"""
    category: Optional[VulnerabilityCategory] = None
    description: Optional[str] = None
    impact: Optional[str] = None
    before_code: Optional[str] = None
    after_code: Optional[str] = None
    fix_steps: Optional[list[str]] = None
    fix_complexity: Optional[FixComplexity] = None
    reference_urls: Optional[list[str]] = None


class ScanStatusResponse(BaseModel):
    """Response for scan status check"""
    scan_id: str
    status: ScanStatus
    target_url: str
    progress: Optional[int] = None
    current_stage: Optional[str] = None
    score: Optional[int] = None
    grade: Optional[str] = None
    score_breakdown: Optional[list[dict]] = None
    summary: Optional[VulnerabilitySummary] = None
    vulnerabilities: list[VulnerabilityWithAnalysis] = []
    error_message: Optional[str] = None
    started_at: Optional[datetime] = None
    completed_at: Optional[datetime] = None


class RecentScanItem(BaseModel):
    """A single recent scan entry"""
    scan_id: str
    target_url: str
    score: Optional[int] = None
    grade: Optional[str] = None
    summary: Optional[VulnerabilitySummary] = None
    scan_mode: Optional[str] = None
    created_at: datetime
    completed_at: Optional[datetime] = None


class RecentScansResponse(BaseModel):
    """Response for recent scans list"""
    scans: list[RecentScanItem]


class AnalyzeResponse(BaseModel):
    """Response from AI analysis"""
    analyzed_count: int
    vulnerabilities: list[VulnerabilityWithAnalysis]


class ScoreDistributionBucket(BaseModel):
    """A single bucket in the score histogram"""
    range: str
    count: int


class BenchmarkResponse(BaseModel):
    """Benchmark statistics for all completed scans"""
    total_scans: int
    avg_score: float
    median_score: float
    score_distribution: list[ScoreDistributionBucket]
    percentile: Optional[float] = None


# Scheduled Scans
class ScheduledScanCreate(BaseModel):
    """Request to create a scheduled scan"""
    target_url: str = Field(..., description="URL to scan on schedule")
    cron_expression: str = Field(default="0 * * * *", description="Cron expression (default: every hour)")
    notification_email: Optional[str] = Field(default=None, description="Email for scan result notifications")
    slack_webhook_url: Optional[str] = Field(default=None, description="Slack webhook URL for notifications")


class ScheduledScanResponse(BaseModel):
    """Response for a scheduled scan"""
    id: str
    target_url: str
    cron_expression: str
    notification_email: Optional[str] = None
    slack_webhook_url: Optional[str] = None
    last_run_at: Optional[datetime] = None
    next_run_at: Optional[datetime] = None
    enabled: bool = True
    created_at: datetime


class ScheduledScansListResponse(BaseModel):
    """Response for list of scheduled scans"""
    schedules: list[ScheduledScanResponse]


# Internal Schemas (for database)
class ScanCreate(BaseModel):
    """Schema for creating a scan in database"""
    target_url: str
    scan_mode: str = "quick"
    status: str = "pending"


class VulnerabilityCreate(BaseModel):
    """Schema for creating a vulnerability in database"""
    scan_id: str
    template_id: str
    name: str
    severity: str
    matched_at: str
    extracted_results: list[str] = []


class AIAnalysisResult(BaseModel):
    """Result from Claude AI analysis"""
    description: str
    impact: str
    category: VulnerabilityCategory
    before_code: str
    after_code: str
    fix_steps: list[str]
    fix_complexity: FixComplexity
    reference_urls: list[str] = []


# ==================== REPO SCAN SCHEMAS ====================


class RepoScanType(str, Enum):
    """Repo scan type options"""
    FULL = "full"
    SECRETS = "secrets"
    SAST = "sast"
    SCA = "sca"


class RepoVulnType(str, Enum):
    """Repo vulnerability type"""
    SECRET = "secret"
    SAST = "sast"
    SCA = "sca"


class RepoScanRequest(BaseModel):
    """Request to start a new repo scan"""
    repo_url: str = Field(..., description="GitHub repository URL")
    branch: Optional[str] = Field(default=None, description="Branch to scan (None = repo default branch)")
    scan_type: RepoScanType = Field(default=RepoScanType.FULL, description="Scan type")


class RepoScanCreate(BaseModel):
    """Schema for creating a repo scan in database"""
    repo_url: str
    repo_name: str
    branch: Optional[str] = None
    scan_type: str = "full"
    status: str = "pending"


class RepoVulnerabilitySummary(BaseModel):
    """Summary counts by severity for repo scan"""
    critical: int = 0
    high: int = 0
    medium: int = 0
    low: int = 0
    info: int = 0
    secrets: int = 0
    sast: int = 0
    sca: int = 0


class RepoVulnerabilityBase(BaseModel):
    """Base repo vulnerability data"""
    id: str
    vuln_type: str
    name: str
    severity: Severity
    file_path: Optional[str] = None
    line_number: Optional[int] = None
    code_snippet: Optional[str] = None
    description: Optional[str] = None
    fix_suggestion: Optional[str] = None
    package_name: Optional[str] = None
    installed_version: Optional[str] = None
    fixed_version: Optional[str] = None
    cve_id: Optional[str] = None
    pattern_id: Optional[str] = None
    ai_analyzed: bool = False
    before_code: Optional[str] = None
    after_code: Optional[str] = None
    fix_steps: Optional[list[str]] = None
    # Dedup support
    matched_locations: Optional[list[str]] = None
    location_count: Optional[int] = None
    is_fixed: bool = False


class RepoScanStartResponse(BaseModel):
    """Response when repo scan is started"""
    scan_id: str
    status: ScanStatus
    repo_url: str
    repo_name: str
    branch: Optional[str] = None
    created_at: datetime


class RepoScanStatusResponse(BaseModel):
    """Response for repo scan status check"""
    scan_id: str
    status: ScanStatus
    repo_url: str
    repo_name: str
    branch: Optional[str] = None
    commit_hash: Optional[str] = None
    progress: Optional[int] = None
    current_stage: Optional[str] = None
    scan_type: str = "full"
    score: Optional[int] = None
    grade: Optional[str] = None
    score_breakdown: Optional[list[dict]] = None
    summary: Optional[RepoVulnerabilitySummary] = None
    vulnerabilities: list[RepoVulnerabilityBase] = []
    files_scanned: int = 0
    error_message: Optional[str] = None
    started_at: Optional[datetime] = None
    completed_at: Optional[datetime] = None


class RecentRepoScanItem(BaseModel):
    """A single recent repo scan entry"""
    scan_id: str
    repo_url: str
    repo_name: str
    score: Optional[int] = None
    grade: Optional[str] = None
    score_breakdown: Optional[list[dict]] = None
    summary: Optional[RepoVulnerabilitySummary] = None
    scan_type: Optional[str] = None
    created_at: datetime
    completed_at: Optional[datetime] = None


class RecentRepoScansResponse(BaseModel):
    """Response for recent repo scans list"""
    scans: list[RecentRepoScanItem]


# ==================== API v1 SCHEMAS ====================


class PaginatedResponse(BaseModel, Generic[T]):
    """Cursor-based paginated response"""
    items: list[T]
    next_cursor: Optional[str] = None
    has_more: bool = False


class ProblemDetail(BaseModel):
    """RFC 7807 Problem Details error response"""
    type: str = "about:blank"
    title: str
    status: int
    detail: str
    instance: str = ""
