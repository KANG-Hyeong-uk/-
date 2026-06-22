"""Tests for calculate_score() in nuclei_scanner module.

Expectations here track the SEVERITY_CONFIG in nuclei_scanner.py:
    critical: base=30, cap=60
    high:     base=20, cap=40
    medium:   base=10, cap=25
    low:      base=3,  cap=10
"""

import pytest
from app.services.nuclei_scanner import calculate_score, _location_weight


class TestLocationWeight:
    """Tests for the _location_weight helper."""

    def test_single_location(self):
        assert _location_weight(1) == 1.0

    def test_two_locations(self):
        assert _location_weight(2) == 1.2

    def test_six_locations_capped(self):
        # 1.0 + 0.2*5 = 2.0 (cap)
        assert _location_weight(6) == 2.0

    def test_ten_locations_still_capped(self):
        assert _location_weight(10) == 2.0


class TestCalculateScoreEmpty:
    """Tests with no vulnerabilities."""

    def test_empty_list_returns_perfect_score(self):
        score, grade, breakdown = calculate_score([])
        assert score == 100
        assert grade == "A"
        assert breakdown == []


class TestCalculateScoreGrades:
    """Verify grade boundaries (single-location vulns = weight 1.0).

    Grade thresholds: A≥90, B+≥80, B≥70, B-≥60, C≥50, D≥40, F<40.
    """

    def test_grade_A(self):
        # 1 low (-3) → 97
        vulns = [{"severity": "low", "template_id": "x"}]
        score, grade, _ = calculate_score(vulns)
        assert score == 97
        assert grade == "A"

    def test_grade_B_plus(self):
        # 1 medium (-10) + 1 low (-3) = -13 → 87
        vulns = [
            {"severity": "medium", "template_id": "a"},
            {"severity": "low", "template_id": "b"},
        ]
        score, grade, _ = calculate_score(vulns)
        assert score == 87
        assert grade == "B+"

    def test_grade_B(self):
        # 1 high (-20) + 1 low (-3) = -23 → 77
        vulns = [
            {"severity": "high", "template_id": "a"},
            {"severity": "low", "template_id": "b"},
        ]
        score, grade, _ = calculate_score(vulns)
        assert score == 77
        assert grade == "B"

    def test_grade_B_minus(self):
        # 2 high = -20*2 = -40 (at cap) → 60
        vulns = [
            {"severity": "high", "template_id": "a"},
            {"severity": "high", "template_id": "b"},
        ]
        score, grade, _ = calculate_score(vulns)
        assert score == 60
        assert grade == "B-"

    def test_grade_C(self):
        # 2 high (-40, capped) + 1 medium (-10) = -50 → 50
        vulns = [
            {"severity": "high", "template_id": "a"},
            {"severity": "high", "template_id": "b"},
            {"severity": "medium", "template_id": "c"},
        ]
        score, grade, _ = calculate_score(vulns)
        assert score == 50
        assert grade == "C"

    def test_grade_D(self):
        # 2 critical = -60 (at cap) → 40
        vulns = [
            {"severity": "critical", "template_id": "a"},
            {"severity": "critical", "template_id": "b"},
        ]
        score, grade, _ = calculate_score(vulns)
        assert score == 40
        assert grade == "D"

    def test_grade_F(self):
        # 2 critical (-60 capped) + 2 high (-40 capped) = -100 → 0
        vulns = [
            {"severity": "critical", "template_id": "a"},
            {"severity": "critical", "template_id": "b"},
            {"severity": "high", "template_id": "c"},
            {"severity": "high", "template_id": "d"},
        ]
        score, grade, _ = calculate_score(vulns)
        assert score == 0
        assert grade == "F"


class TestCalculateScoreCaps:
    """Verify severity deduction caps."""

    def test_critical_cap_at_60(self):
        # 5 critical each -30 raw=150, capped at -60 → 40
        vulns = [{"severity": "critical", "template_id": f"c{i}"} for i in range(5)]
        score, _, _ = calculate_score(vulns)
        assert score == 40

    def test_high_cap_at_40(self):
        # 5 high each -20 raw=100, capped at -40 → 60
        vulns = [{"severity": "high", "template_id": f"h{i}"} for i in range(5)]
        score, _, _ = calculate_score(vulns)
        assert score == 60

    def test_medium_cap_at_25(self):
        # 10 medium each -10 raw=100, capped at -25 → 75
        vulns = [{"severity": "medium", "template_id": f"m{i}"} for i in range(10)]
        score, _, _ = calculate_score(vulns)
        assert score == 75

    def test_low_cap_at_10(self):
        # 10 low each -3 raw=30, capped at -10 → 90
        vulns = [{"severity": "low", "template_id": f"l{i}"} for i in range(10)]
        score, _, _ = calculate_score(vulns)
        assert score == 90


class TestCalculateScoreMinimum:
    """Score should never go below 0."""

    def test_score_minimum_zero(self):
        # Hit every cap + info floods → well below 0, clamped to 0.
        vulns = [{"severity": "critical", "template_id": f"c{i}"} for i in range(5)]
        vulns += [{"severity": "high", "template_id": f"h{i}"} for i in range(5)]
        vulns += [{"severity": "medium", "template_id": f"m{i}"} for i in range(5)]
        vulns += [{"severity": "low", "template_id": f"l{i}"} for i in range(5)]
        vulns += [{"severity": "info", "template_id": "env-file-exposure"} for _ in range(20)]
        score, grade, _ = calculate_score(vulns)
        assert score == 0
        assert grade == "F"


class TestCalculateScoreInfoOverride:
    """Test INFO_SEVERITY_OVERRIDE per-template deductions."""

    def test_info_env_file_deducts_5(self):
        vulns = [{"severity": "info", "template_id": "env-file"}]
        score, grade, _ = calculate_score(vulns)
        assert score == 95
        assert grade == "A"

    def test_info_missing_security_headers_deducts_3(self):
        vulns = [{"severity": "info", "template_id": "http-missing-security-headers"}]
        score, grade, _ = calculate_score(vulns)
        assert score == 97
        assert grade == "A"

    def test_info_php_eol_deducts_2(self):
        vulns = [{"severity": "info", "template_id": "php-eol-version"}]
        score, grade, _ = calculate_score(vulns)
        assert score == 98
        assert grade == "A"

    def test_info_tech_detect_no_deduction(self):
        """Regular info templates not in the override map should not deduct."""
        vulns = [{"severity": "info", "template_id": "tech-detect-nginx"}]
        score, grade, breakdown = calculate_score(vulns)
        assert score == 100
        assert grade == "A"
        # No breakdown items for zero-deduction info
        assert len(breakdown) == 0

    def test_info_no_cap_on_overrides(self):
        """Info override deductions have no cap."""
        vulns = [{"severity": "info", "template_id": "env-file"} for _ in range(10)]
        score, grade, _ = calculate_score(vulns)
        assert score == 50  # 100 - 10*5

    def test_multiple_info_templates(self):
        vulns = [
            {"severity": "info", "template_id": "env-file"},            # -5
            {"severity": "info", "template_id": "git-config"},          # -5
            {"severity": "info", "template_id": "http-missing-security-headers"},  # -3
            {"severity": "info", "template_id": "php-eol"},             # -2
            {"severity": "info", "template_id": "tech-detect"},         # -0
        ]
        score, grade, _ = calculate_score(vulns)
        assert score == 85  # 100 - 5 - 5 - 3 - 2 - 0


class TestCalculateScoreMixed:
    """Tests with mixed severity levels."""

    def test_mixed_severities(self, sample_vulnerabilities):
        # 3 critical (capped -60) + 3 high (capped -40) + 4 medium (capped -25)
        # + 4 low (capped -10) = -135, clamped to 0.
        score, grade, _ = calculate_score(sample_vulnerabilities)
        assert score == 0
        assert grade == "F"

    def test_single_critical(self):
        # 1 critical (-30) → 70 → B
        vulns = [{"severity": "critical", "template_id": "rce"}]
        score, grade, _ = calculate_score(vulns)
        assert score == 70
        assert grade == "B"

    def test_unknown_severity_ignored(self):
        """Vulnerabilities with unknown severity should not affect score."""
        vulns = [{"severity": "unknown", "template_id": "x"}]
        score, _, _ = calculate_score(vulns)
        assert score == 100

    def test_missing_severity_defaults_to_info(self):
        """Missing severity key should be treated as info."""
        vulns = [{"template_id": "x"}]
        score, _, _ = calculate_score(vulns)
        assert score == 100


class TestDiminishingPenalty:
    """Tests for location-based diminishing penalty."""

    def test_single_location_weight_1x(self):
        # high (-20) × 1.0 → 80
        vulns = [{"severity": "high", "template_id": "sqli", "matched_locations": ["/page1"]}]
        score, _, breakdown = calculate_score(vulns)
        assert score == 80
        assert breakdown[0]["weight"] == 1.0
        assert breakdown[0]["actual_deduction"] == 20

    def test_multiple_locations_increase_weight(self):
        # high (-20) × weight 1.4 (3 locs) = round(28) → 72
        vulns = [{"severity": "high", "template_id": "sqli", "matched_locations": ["/p1", "/p2", "/p3"]}]
        score, _, breakdown = calculate_score(vulns)
        assert breakdown[0]["weight"] == 1.4
        assert breakdown[0]["actual_deduction"] == 28
        assert score == 72

    def test_weight_capped_at_2x(self):
        # medium (-10) × cap 2.0 = 20
        locs = [f"/p{i}" for i in range(10)]
        vulns = [{"severity": "medium", "template_id": "xss", "matched_locations": locs}]
        _, _, breakdown = calculate_score(vulns)
        assert breakdown[0]["weight"] == 2.0
        assert breakdown[0]["actual_deduction"] == 20

    def test_info_with_locations(self):
        # info env-file (-5) × weight 1.4 = round(7) → 93
        vulns = [{"severity": "info", "template_id": "env-file", "matched_locations": ["/a", "/b", "/c"]}]
        score, _, breakdown = calculate_score(vulns)
        assert score == 93
        assert breakdown[0]["weight"] == 1.4


class TestScoreBreakdown:
    """Tests for the score_breakdown output."""

    def test_breakdown_structure(self):
        vulns = [{"severity": "high", "template_id": "sqli", "name": "SQL Injection"}]
        _, _, breakdown = calculate_score(vulns)
        assert len(breakdown) == 1
        item = breakdown[0]
        assert item["template_id"] == "sqli"
        assert item["name"] == "SQL Injection"
        assert item["severity"] == "high"
        assert item["locations"] == 1
        assert item["base_deduction"] == 20
        assert item["weight"] == 1.0
        assert item["actual_deduction"] == 20

    def test_breakdown_excludes_zero_info(self):
        """tech-detect (0 deduction) should not appear in breakdown."""
        vulns = [{"severity": "info", "template_id": "tech-detect"}]
        _, _, breakdown = calculate_score(vulns)
        assert len(breakdown) == 0

    def test_breakdown_cap_item_added(self):
        """When cap is hit, a cap info item should appear."""
        vulns = [{"severity": "critical", "template_id": f"c{i}"} for i in range(5)]
        _, _, breakdown = calculate_score(vulns)
        cap_items = [b for b in breakdown if b["template_id"].startswith("_cap_")]
        assert len(cap_items) == 1
        assert cap_items[0]["severity"] == "critical"
        assert cap_items[0]["actual_deduction"] < 0  # negative = reduction from cap
