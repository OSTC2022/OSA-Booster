"""Unit tests for sync config / stagger / circuit logic (no Garmin network)."""

from __future__ import annotations

import unittest
from datetime import datetime, timedelta, timezone
from unittest.mock import MagicMock, patch

from app.sync_config import (
    compute_next_sync_at,
    resolve_fetch_window,
)
from app.sync_core import SyncResult, _is_auth_failure, _is_rate_limit


class SyncConfigTests(unittest.TestCase):
    def test_next_sync_has_jitter_and_interval(self) -> None:
        base = datetime(2026, 8, 11, 1, 0, tzinfo=timezone.utc)
        nxt = compute_next_sync_at(base=base, failures=0, interval_minutes=120)
        delta = (nxt - base).total_seconds()
        self.assertGreaterEqual(delta, 120 * 60)
        self.assertLessEqual(delta, 120 * 60 * 1.1)

    def test_backoff_increases_with_failures(self) -> None:
        base = datetime(2026, 8, 11, 1, 0, tzinfo=timezone.utc)
        # failures=1 still uses base 120m; high failures push interval via backoff
        a = compute_next_sync_at(base=base, failures=0, interval_minutes=120)
        b = compute_next_sync_at(base=base, failures=8, interval_minutes=120)
        self.assertGreaterEqual((b - base).total_seconds(), (a - base).total_seconds())

    def test_initial_window_month_capped(self) -> None:
        now = datetime(2026, 8, 11, 12, 0, tzinfo=timezone.utc)
        start, end = resolve_fetch_window(initial_sync_done=False, now=now)
        self.assertEqual(end, "2026-08-11")
        self.assertEqual(start, "2026-08-01")

    def test_incremental_window(self) -> None:
        now = datetime(2026, 8, 11, 12, 0, tzinfo=timezone.utc)
        start, end = resolve_fetch_window(initial_sync_done=True, now=now)
        self.assertEqual(end, "2026-08-11")
        self.assertEqual(start, "2026-08-08")  # 3-day default lookback


class ErrorClassificationTests(unittest.TestCase):
    def test_429(self) -> None:
        self.assertTrue(_is_rate_limit(Exception("HTTP 429 Too Many")))
        self.assertTrue(_is_rate_limit(type("GarminConnectTooManyRequestsError", (Exception,), {})()))

    def test_auth(self) -> None:
        self.assertTrue(_is_auth_failure(Exception("401 unauthorized")))
        self.assertFalse(_is_auth_failure(Exception("timeout")))


class CircuitBreakerTests(unittest.TestCase):
    @patch("app.circuit_breaker.get_supabase")
    def test_trip_rate_limit_writes_blocked_until(self, mock_sb: MagicMock) -> None:
        table = MagicMock()
        mock_sb.return_value.table.return_value = table
        table.upsert.return_value.execute.return_value = MagicMock(data=[])
        from app.circuit_breaker import trip_rate_limit

        trip_rate_limit("HTTP_429")
        args, _kwargs = table.upsert.call_args
        payload = args[0]
        self.assertEqual(payload["status"], "RATE_LIMITED")
        self.assertIn("blocked_until", payload)


class SyncResultSemanticsTests(unittest.TestCase):
    def test_zero_imported_still_success_shape(self) -> None:
        result = SyncResult(status="SUCCESS", fetched_count=3, running_count=2, duplicate_count=2)
        self.assertEqual(result.imported_count, 0)
        self.assertEqual(result.status, "SUCCESS")


if __name__ == "__main__":
    unittest.main()
