"""
Trust Backend Analyze API Routes
POST /api/analyze - Analyze vulnerabilities with Claude AI
"""

from fastapi import APIRouter, HTTPException

from app.logging_config import get_logger
from app.models.schemas import (
    AnalyzeRequest,
    AnalyzeResponse,
    VulnerabilityWithAnalysis,
    Severity,
    VulnerabilityCategory,
    FixComplexity,
)
from app.services.supabase_client import get_supabase_service
from app.services.claude_analyzer import get_claude_analyzer

logger = get_logger(__name__)

router = APIRouter(tags=["analyze"])


@router.post("/analyze", response_model=AnalyzeResponse)
async def analyze_vulnerabilities(request: AnalyzeRequest):
    """
    Analyze vulnerabilities with Claude AI

    - **scan_id**: UUID of the scan to analyze
    - **vulnerability_ids**: Optional list of specific vulnerability IDs (empty for all)
    """
    supabase = get_supabase_service()
    analyzer = get_claude_analyzer()

    # Verify scan exists
    scan = await supabase.get_scan(request.scan_id)
    if not scan:
        raise HTTPException(status_code=404, detail="Scan not found")

    # Get vulnerabilities to analyze
    if request.vulnerability_ids:
        vulnerabilities = await supabase.get_vulnerabilities_by_ids(request.vulnerability_ids)
    else:
        vulnerabilities = await supabase.get_vulnerabilities_by_scan(request.scan_id)

    if not vulnerabilities:
        return AnalyzeResponse(analyzed_count=0, vulnerabilities=[])

    # Filter out already analyzed vulnerabilities (unless specifically requested)
    if not request.vulnerability_ids:
        vulnerabilities = [v for v in vulnerabilities if not v.get("ai_analyzed", False)]

    if not vulnerabilities:
        # Return existing analyzed vulnerabilities
        all_vulns = await supabase.get_vulnerabilities_by_scan(request.scan_id)
        return AnalyzeResponse(
            analyzed_count=0,
            vulnerabilities=[
                _build_vulnerability_with_analysis(v)
                for v in all_vulns
                if v.get("ai_analyzed", False)
            ]
        )

    # Analyze with Claude
    try:
        analyses = await analyzer.analyze_batch(vulnerabilities)
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"AI analysis failed: {str(e)}"
        )

    # Update vulnerabilities with analysis results
    updated_vulns = []

    for vuln, analysis in zip(vulnerabilities, analyses):
        try:
            await supabase.update_vulnerability_analysis(vuln["id"], analysis)

            raw_er = vuln.get("extracted_results", [])
            if isinstance(raw_er, dict):
                er_data = raw_er.get("data", [])
                matched_locs = raw_er.get("matched_locations", [])
            else:
                er_data = raw_er if isinstance(raw_er, list) else []
                matched_locs = []
            updated_vulns.append(
                VulnerabilityWithAnalysis(
                    id=vuln["id"],
                    template_id=vuln["template_id"],
                    name=vuln["name"],
                    severity=Severity(vuln["severity"]),
                    matched_at=vuln["matched_at"],
                    extracted_results=er_data,
                    matched_locations=matched_locs,
                    ai_analyzed=True,
                    category=_safe_category(analysis.get("category")),
                    description=analysis.get("description"),
                    impact=analysis.get("impact"),
                    before_code=analysis.get("before_code"),
                    after_code=analysis.get("after_code"),
                    fix_steps=analysis.get("fix_steps", []),
                    fix_complexity=_safe_complexity(analysis.get("fix_complexity")),
                    reference_urls=analysis.get("references", []),
                )
            )
        except Exception as e:
            # Continue with other vulnerabilities even if one fails
            logger.error("vulnerability_analysis_update_failed", vuln_id=vuln["id"], error=str(e))

    return AnalyzeResponse(
        analyzed_count=len(updated_vulns),
        vulnerabilities=updated_vulns
    )


def _parse_extracted_results(raw_er) -> tuple[list, list]:
    """Parse extracted_results from DB (handles old list and new dict formats)."""
    if isinstance(raw_er, dict):
        return raw_er.get("data", []), raw_er.get("matched_locations", [])
    return (raw_er if isinstance(raw_er, list) else []), []


def _build_vulnerability_with_analysis(vuln: dict) -> VulnerabilityWithAnalysis:
    """Build VulnerabilityWithAnalysis from database record"""
    er_data, matched_locs = _parse_extracted_results(vuln.get("extracted_results", []))
    return VulnerabilityWithAnalysis(
        id=vuln["id"],
        template_id=vuln["template_id"],
        name=vuln["name"],
        severity=Severity(vuln["severity"]),
        matched_at=vuln["matched_at"],
        extracted_results=er_data,
        matched_locations=matched_locs,
        ai_analyzed=vuln.get("ai_analyzed", False),
        category=_safe_category(vuln.get("category")),
        description=vuln.get("description"),
        impact=vuln.get("impact"),
        before_code=vuln.get("before_code"),
        after_code=vuln.get("after_code"),
        fix_steps=vuln.get("fix_steps", []),
        fix_complexity=_safe_complexity(vuln.get("fix_complexity")),
        reference_urls=vuln.get("reference_urls", []),
    )


def _safe_category(value: str | None) -> VulnerabilityCategory | None:
    """Safely convert string to VulnerabilityCategory"""
    if not value:
        return None
    try:
        return VulnerabilityCategory(value)
    except ValueError:
        return VulnerabilityCategory.EXPOSURE


def _safe_complexity(value: str | None) -> FixComplexity | None:
    """Safely convert string to FixComplexity"""
    if not value:
        return None
    try:
        return FixComplexity(value)
    except ValueError:
        return FixComplexity.MODERATE
