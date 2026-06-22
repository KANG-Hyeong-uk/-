"""
Tests for Account routes (DELETE /api/account).

Covers:
- Unauthenticated request → 401
- Active subscription (not canceling) → 400 block
- Active subscription with cancel_at_period_end → allowed
- Canceled subscription → allowed
- No subscription → allowed
- Supabase admin delete failure → 500
- Successful deletion → 200
- past_due subscription → allowed
"""

import pytest
from unittest.mock import MagicMock, AsyncMock, patch
from fastapi.testclient import TestClient


# ---------- helpers ----------

def _make_user(uid: str = "user-123"):
    """Fake Supabase user object returned by require_auth."""
    user = MagicMock()
    user.id = uid
    user.email = "test@example.com"
    return user


def _subscription(status: str = "active", cancel: bool = False):
    return {
        "id": "sub-uuid",
        "user_id": "user-123",
        "stripe_customer_id": "ctm_abc",
        "stripe_subscription_id": "sub_abc",
        "status": status,
        "plan": "pro_monthly",
        "current_period_end": "2026-05-13T00:00:00Z",
        "cancel_at_period_end": cancel,
    }


# ---------- fixtures ----------

@pytest.fixture
def app_and_client():
    """
    TestClient with mocked Supabase initialization.
    Returns (app, client) so tests can set dependency_overrides.
    """
    with patch("app.services.supabase_client.get_settings") as mock_settings, \
         patch("app.services.supabase_client.create_client") as mock_create:
        mock_settings.return_value = MagicMock(
            supabase_url="https://fake.supabase.co",
            supabase_service_role_key="fake-key",
            paddle_api_key="",
            paddle_webhook_secret="",
            paddle_price_monthly="",
            paddle_price_yearly="",
            paddle_discount_id="",
            environment="test",
        )
        mock_create.return_value = MagicMock()

        from app.main import app
        from app.api.auth import require_auth

        client = TestClient(app)
        yield app, client, require_auth

        # Clean up overrides after each test
        app.dependency_overrides.clear()


# ---------- 1. Auth ----------

class TestAccountAuth:
    def test_unauthenticated_returns_401(self, app_and_client):
        """No auth token → 401."""
        _, client, _ = app_and_client
        resp = client.delete("/api/account")
        assert resp.status_code == 401

    def test_no_bearer_prefix_returns_401(self, app_and_client):
        """Authorization header without Bearer prefix → 401."""
        _, client, _ = app_and_client
        resp = client.delete(
            "/api/account",
            headers={"Authorization": "Token some-value"},
        )
        assert resp.status_code == 401


# ---------- 2. Subscription blocking ----------

class TestAccountSubscriptionBlock:
    def test_active_subscription_blocks_delete(self, app_and_client):
        """Active subscription (not canceling) → 400."""
        app, client, require_auth = app_and_client
        app.dependency_overrides[require_auth] = lambda: _make_user()

        with patch("app.api.routes.account.get_supabase_service") as mock_supa:
            svc = MagicMock()
            svc.get_subscription_by_user = AsyncMock(
                return_value=_subscription(status="active", cancel=False)
            )
            mock_supa.return_value = svc

            resp = client.delete("/api/account")
            assert resp.status_code == 400
            assert "active subscription" in resp.json()["detail"].lower()

    def test_cancel_at_period_end_allows_delete(self, app_and_client):
        """Active but cancel_at_period_end=True → allowed (200)."""
        app, client, require_auth = app_and_client
        app.dependency_overrides[require_auth] = lambda: _make_user()

        with patch("app.api.routes.account.get_supabase_service") as mock_supa:
            svc = MagicMock()
            svc.get_subscription_by_user = AsyncMock(
                return_value=_subscription(status="active", cancel=True)
            )
            svc.client.auth.admin.delete_user = MagicMock()
            mock_supa.return_value = svc

            resp = client.delete("/api/account")
            assert resp.status_code == 200
            assert resp.json()["status"] == "deleted"
            svc.client.auth.admin.delete_user.assert_called_once_with("user-123")

    def test_canceled_subscription_allows_delete(self, app_and_client):
        """Subscription already canceled → allowed."""
        app, client, require_auth = app_and_client
        app.dependency_overrides[require_auth] = lambda: _make_user()

        with patch("app.api.routes.account.get_supabase_service") as mock_supa:
            svc = MagicMock()
            svc.get_subscription_by_user = AsyncMock(
                return_value=_subscription(status="canceled")
            )
            svc.client.auth.admin.delete_user = MagicMock()
            mock_supa.return_value = svc

            resp = client.delete("/api/account")
            assert resp.status_code == 200

    def test_no_subscription_allows_delete(self, app_and_client):
        """Free user (no subscription record) → allowed."""
        app, client, require_auth = app_and_client
        app.dependency_overrides[require_auth] = lambda: _make_user()

        with patch("app.api.routes.account.get_supabase_service") as mock_supa:
            svc = MagicMock()
            svc.get_subscription_by_user = AsyncMock(return_value=None)
            svc.client.auth.admin.delete_user = MagicMock()
            mock_supa.return_value = svc

            resp = client.delete("/api/account")
            assert resp.status_code == 200
            assert resp.json()["status"] == "deleted"


# ---------- 3. Deletion failure ----------

class TestAccountDeleteFailure:
    def test_supabase_admin_error_returns_500(self, app_and_client):
        """Supabase admin.delete_user raises → 500."""
        app, client, require_auth = app_and_client
        app.dependency_overrides[require_auth] = lambda: _make_user()

        with patch("app.api.routes.account.get_supabase_service") as mock_supa:
            svc = MagicMock()
            svc.get_subscription_by_user = AsyncMock(return_value=None)
            svc.client.auth.admin.delete_user = MagicMock(
                side_effect=Exception("Supabase internal error")
            )
            mock_supa.return_value = svc

            resp = client.delete("/api/account")
            assert resp.status_code == 500
            assert "contact support" in resp.json()["detail"].lower()


# ---------- 4. Successful deletion ----------

class TestAccountDeleteSuccess:
    def test_successful_delete_calls_admin_api(self, app_and_client):
        """Successful delete → calls admin.delete_user with correct user_id."""
        app, client, require_auth = app_and_client
        app.dependency_overrides[require_auth] = lambda: _make_user("uid-abc")

        with patch("app.api.routes.account.get_supabase_service") as mock_supa:
            svc = MagicMock()
            svc.get_subscription_by_user = AsyncMock(return_value=None)
            svc.client.auth.admin.delete_user = MagicMock()
            mock_supa.return_value = svc

            resp = client.delete("/api/account")
            assert resp.status_code == 200
            assert resp.json() == {"status": "deleted"}
            svc.client.auth.admin.delete_user.assert_called_once_with("uid-abc")

    def test_past_due_subscription_allows_delete(self, app_and_client):
        """past_due subscription → allowed (not blocking)."""
        app, client, require_auth = app_and_client
        app.dependency_overrides[require_auth] = lambda: _make_user()

        with patch("app.api.routes.account.get_supabase_service") as mock_supa:
            svc = MagicMock()
            svc.get_subscription_by_user = AsyncMock(
                return_value=_subscription(status="past_due")
            )
            svc.client.auth.admin.delete_user = MagicMock()
            mock_supa.return_value = svc

            resp = client.delete("/api/account")
            assert resp.status_code == 200

    def test_v1_route_also_works(self, app_and_client):
        """DELETE /api/v1/account also works (canonical route)."""
        app, client, require_auth = app_and_client
        app.dependency_overrides[require_auth] = lambda: _make_user()

        with patch("app.api.routes.account.get_supabase_service") as mock_supa:
            svc = MagicMock()
            svc.get_subscription_by_user = AsyncMock(return_value=None)
            svc.client.auth.admin.delete_user = MagicMock()
            mock_supa.return_value = svc

            resp = client.delete("/api/v1/account")
            assert resp.status_code == 200
            assert resp.json() == {"status": "deleted"}
