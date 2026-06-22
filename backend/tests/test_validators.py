"""
Tests for validate_scan_target() URL/SSRF validation.
"""

import pytest
from unittest.mock import patch, MagicMock
import socket

from fastapi import HTTPException

from app.api.routes.scan import validate_scan_target


class TestValidTargets:
    """Valid URLs that should pass validation."""

    @patch("app.api.routes.scan.socket.getaddrinfo")
    def test_valid_https_url(self, mock_getaddrinfo):
        mock_getaddrinfo.return_value = [
            (socket.AF_INET, socket.SOCK_STREAM, 0, "", ("93.184.216.34", 0))
        ]
        # Should not raise
        validate_scan_target("https://example.com")

    @patch("app.api.routes.scan.socket.getaddrinfo")
    def test_valid_http_url(self, mock_getaddrinfo):
        mock_getaddrinfo.return_value = [
            (socket.AF_INET, socket.SOCK_STREAM, 0, "", ("93.184.216.34", 0))
        ]
        validate_scan_target("http://example.com")

    @patch("app.api.routes.scan.socket.getaddrinfo")
    def test_valid_url_with_path(self, mock_getaddrinfo):
        mock_getaddrinfo.return_value = [
            (socket.AF_INET, socket.SOCK_STREAM, 0, "", ("93.184.216.34", 0))
        ]
        validate_scan_target("https://example.com/path/to/page")

    @patch("app.api.routes.scan.socket.getaddrinfo")
    def test_valid_url_with_port(self, mock_getaddrinfo):
        mock_getaddrinfo.return_value = [
            (socket.AF_INET, socket.SOCK_STREAM, 0, "", ("93.184.216.34", 0))
        ]
        validate_scan_target("https://example.com:8443")


class TestInvalidURLs:
    """URLs that should be rejected."""

    def test_no_hostname(self):
        with pytest.raises(HTTPException) as exc_info:
            validate_scan_target("not-a-url")
        assert exc_info.value.status_code == 400

    def test_empty_url(self):
        with pytest.raises(HTTPException) as exc_info:
            validate_scan_target("")
        assert exc_info.value.status_code == 400


class TestBlockedHostnames:
    """Cloud metadata and localhost endpoints should be blocked."""

    def test_block_metadata_google(self):
        with pytest.raises(HTTPException) as exc_info:
            validate_scan_target("http://metadata.google.internal/computeMetadata/v1/")
        assert exc_info.value.status_code == 400
        assert "internal" in exc_info.value.detail.lower() or "metadata" in exc_info.value.detail.lower()

    def test_block_metadata_ip(self):
        with pytest.raises(HTTPException) as exc_info:
            validate_scan_target("http://169.254.169.254/latest/meta-data/")
        assert exc_info.value.status_code == 400

    def test_block_localhost(self):
        with pytest.raises(HTTPException) as exc_info:
            validate_scan_target("http://localhost/admin")
        assert exc_info.value.status_code == 400
        assert "localhost" in exc_info.value.detail.lower()

    def test_block_zero_address(self):
        with pytest.raises(HTTPException) as exc_info:
            validate_scan_target("http://0.0.0.0/")
        assert exc_info.value.status_code == 400


class TestPrivateIPs:
    """Private/internal IP ranges should be blocked after DNS resolution."""

    @patch("app.api.routes.scan.socket.getaddrinfo")
    def test_block_10_network(self, mock_getaddrinfo):
        mock_getaddrinfo.return_value = [
            (socket.AF_INET, socket.SOCK_STREAM, 0, "", ("10.0.0.1", 0))
        ]
        with pytest.raises(HTTPException) as exc_info:
            validate_scan_target("http://internal.example.com")
        assert exc_info.value.status_code == 400
        assert "private" in exc_info.value.detail.lower()

    @patch("app.api.routes.scan.socket.getaddrinfo")
    def test_block_172_network(self, mock_getaddrinfo):
        mock_getaddrinfo.return_value = [
            (socket.AF_INET, socket.SOCK_STREAM, 0, "", ("172.16.0.1", 0))
        ]
        with pytest.raises(HTTPException) as exc_info:
            validate_scan_target("http://internal.example.com")
        assert exc_info.value.status_code == 400

    @patch("app.api.routes.scan.socket.getaddrinfo")
    def test_block_192_168_network(self, mock_getaddrinfo):
        mock_getaddrinfo.return_value = [
            (socket.AF_INET, socket.SOCK_STREAM, 0, "", ("192.168.1.1", 0))
        ]
        with pytest.raises(HTTPException) as exc_info:
            validate_scan_target("http://internal.example.com")
        assert exc_info.value.status_code == 400

    @patch("app.api.routes.scan.socket.getaddrinfo")
    def test_block_loopback(self, mock_getaddrinfo):
        mock_getaddrinfo.return_value = [
            (socket.AF_INET, socket.SOCK_STREAM, 0, "", ("127.0.0.1", 0))
        ]
        with pytest.raises(HTTPException) as exc_info:
            validate_scan_target("http://sneaky.example.com")
        assert exc_info.value.status_code == 400

    @patch("app.api.routes.scan.socket.getaddrinfo")
    def test_block_ipv6_loopback(self, mock_getaddrinfo):
        mock_getaddrinfo.return_value = [
            (socket.AF_INET6, socket.SOCK_STREAM, 0, "", ("::1", 0, 0, 0))
        ]
        with pytest.raises(HTTPException) as exc_info:
            validate_scan_target("http://ipv6-sneaky.example.com")
        assert exc_info.value.status_code == 400


class TestDNSFailure:
    """DNS resolution failure should raise 400."""

    @patch("app.api.routes.scan.socket.getaddrinfo", side_effect=socket.gaierror("DNS failed"))
    def test_dns_failure(self, mock_getaddrinfo):
        with pytest.raises(HTTPException) as exc_info:
            validate_scan_target("http://nonexistent.example.invalid")
        assert exc_info.value.status_code == 400
        assert "resolve" in exc_info.value.detail.lower()
