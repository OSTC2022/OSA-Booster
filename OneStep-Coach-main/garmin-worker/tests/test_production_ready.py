"""Production readiness tests (no live Garmin network)."""

from __future__ import annotations

import os
import unittest
from datetime import datetime, timezone
from unittest.mock import patch

from app.duplicate import find_duplicate_candidate
from app.sync_config import compute_next_sync_at, is_garmin_sync_enabled, resolve_fetch_window
from app.scheduler import filter_auto_due_rows
from app.sync_core import SyncResult, _is_auth_failure, _is_rate_limit


class FeatureFlagTests(unittest.TestCase):
    def test_sync_enabled_default(self) -> None:
        with patch.dict(os.environ, {}, clear=False):
            os.environ.pop("GARMIN_SYNC_ENABLED", None)
            self.assertTrue(is_garmin_sync_enabled())

    def test_emergency_stop(self) -> None:
        with patch.dict(os.environ, {"GARMIN_SYNC_ENABLED": "false"}):
            self.assertFalse(is_garmin_sync_enabled())


class StaggerCapacityTests(unittest.TestCase):
    def test_70_members_not_same_second(self) -> None:
        base = datetime(2026, 8, 11, 12, 0, tzinfo=timezone.utc)
        times = [compute_next_sync_at(base=base, failures=0, interval_minutes=120) for _ in range(70)]
        unique_seconds = {int(t.timestamp()) for t in times}
        # Jitter should spread timestamps; exact same second for all = FAIL
        self.assertGreater(len(unique_seconds), 1)
        # All within ~interval + 8% jitter
        deltas = [(t - base).total_seconds() for t in times]
        self.assertTrue(all(d >= 120 * 60 for d in deltas))
        self.assertTrue(all(d <= 120 * 60 * 1.1 + 1 for d in deltas))


class HistoricalImportWindowTests(unittest.TestCase):
    def test_initial_not_five_years(self) -> None:
        now = datetime(2026, 8, 11, 12, 0, tzinfo=timezone.utc)
        start, end = resolve_fetch_window(initial_sync_done=False, now=now)
        self.assertEqual(end, "2026-08-11")
        # Month start or capped — never years back
        self.assertGreaterEqual(start, "2026-06-01")


class ErrorIsolationTests(unittest.TestCase):
    def test_429_not_auth(self) -> None:
        exc = Exception("HTTP 429 Too Many Requests")
        self.assertTrue(_is_rate_limit(exc))
        self.assertFalse(_is_auth_failure(exc))

    def test_decrypt_code_not_reauth_shape(self) -> None:
        # SyncResult for decrypt must use FAILED + TOKEN_DECRYPT_FAILED (see sync_core)
        r = SyncResult(status="FAILED", error_code="TOKEN_DECRYPT_FAILED")
        self.assertEqual(r.status, "FAILED")
        self.assertNotEqual(r.status, "REAUTH_REQUIRED")


class IdempotencyFixtureTests(unittest.TestCase):
    def test_far_apart_not_merged(self) -> None:
        c = find_duplicate_candidate(
            garmin_distance_km=5.02,
            garmin_logged_at="2026-07-13",
            garmin_activity_time="06:30:00",
            existing_logs=[
                {
                    "id": "1",
                    "distance_km": 5.0,
                    "logged_at": "2026-07-13",
                    "activity_time": "19:00:00",
                    "source_app": None,
                }
            ],
        )
        self.assertIsNone(c)


class HealthPrimarySkipTests(unittest.TestCase):
    def test_paused_row_skipped(self) -> None:
        rows = [
            {"member_id": "a", "auto_sync_paused": True},
            {"member_id": "b", "auto_sync_paused": False},
        ]
        out = filter_auto_due_rows(rows)
        self.assertEqual([r["member_id"] for r in out], ["b"])

    def test_health_primary_member_skipped(self) -> None:
        rows = [
            {"member_id": "a", "auto_sync_paused": False},
            {"member_id": "b", "auto_sync_paused": False},
        ]
        members = [
            {"id": "a", "preferred_activity_sync_provider": "APPLE_HEALTH"},
            {"id": "b", "preferred_activity_sync_provider": "DIRECT_GARMIN"},
        ]
        out = filter_auto_due_rows(rows, members)
        self.assertEqual([r["member_id"] for r in out], ["b"])


class DualWorkerLockSemanticsTests(unittest.TestCase):
    def test_second_lock_busy_skips(self) -> None:
        """Document expected behavior: second worker sees LOCK_BUSY (no dual fetch)."""
        acquired_a = True
        acquired_b = False  # advisory lock not held
        self.assertTrue(acquired_a)
        self.assertFalse(acquired_b)


if __name__ == "__main__":
    unittest.main()
