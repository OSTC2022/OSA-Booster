"""Unit tests for 13-E reconciliation classification + duplicate confidence."""

from __future__ import annotations

import unittest

from app.duplicate import find_duplicate_candidate
from app.reconcile import (
    ActivitySnapshot,
    ChangeAction,
    ChangeKind,
    classify_garmin_activity_change,
    normalize_distance_km,
)


class DuplicateConfidenceTests(unittest.TestCase):
    def test_true_manual_duplicate_near_time(self):
        c = find_duplicate_candidate(
            garmin_distance_km=5.02,
            garmin_logged_at="2026-07-13",
            garmin_activity_time="07:03:00",
            existing_logs=[
                {
                    "id": "m1",
                    "distance_km": 5.00,
                    "logged_at": "2026-07-13",
                    "activity_time": "07:00:00",
                    "source_app": None,
                    "external_activity_id": None,
                }
            ],
        )
        self.assertIsNotNone(c)
        assert c is not None
        self.assertEqual(c.confidence, "HIGH")

    def test_false_positive_far_apart_same_day(self):
        c = find_duplicate_candidate(
            garmin_distance_km=5.02,
            garmin_logged_at="2026-07-13",
            garmin_activity_time="06:30:00",
            existing_logs=[
                {
                    "id": "m1",
                    "distance_km": 5.00,
                    "logged_at": "2026-07-13",
                    "activity_time": "19:00:00",
                    "source_app": None,
                }
            ],
        )
        self.assertIsNone(c)

    def test_manual_without_time_low_confidence(self):
        c = find_duplicate_candidate(
            garmin_distance_km=5.02,
            garmin_logged_at="2026-07-13",
            garmin_activity_time="07:03:00",
            existing_logs=[
                {
                    "id": "m1",
                    "distance_km": 5.0,
                    "logged_at": "2026-07-13",
                    "activity_time": None,
                    "source_app": "manual",
                }
            ],
        )
        self.assertIsNotNone(c)
        assert c is not None
        self.assertEqual(c.confidence, "LOW")


class ChangeClassificationTests(unittest.TestCase):
    def test_rounding_noop(self):
        prev = ActivitySnapshot(4.13, "2026-07-13", "16:54:00", 1387)
        curr = ActivitySnapshot(4.1298, "2026-07-13", "16:54:00", 1387)
        # normalize to 4.13 both
        self.assertEqual(normalize_distance_km(4.1298), 4.13)
        r = classify_garmin_activity_change(prev, curr)
        self.assertEqual(r.action, ChangeAction.NO_CHANGE)

    def test_distance_auto_update(self):
        prev = ActivitySnapshot(4.13, "2026-07-13", "16:54:00", 1387)
        curr = ActivitySnapshot(4.25, "2026-07-13", "16:54:00", 1387)
        r = classify_garmin_activity_change(prev, curr)
        self.assertEqual(r.kind, ChangeKind.DISTANCE_CHANGE)
        self.assertEqual(r.action, ChangeAction.AUTO_UPDATE)

    def test_duration_auto_update(self):
        prev = ActivitySnapshot(4.13, "2026-07-13", "16:54:00", 1387)
        curr = ActivitySnapshot(4.13, "2026-07-13", "16:54:00", 1378)
        r = classify_garmin_activity_change(prev, curr)
        self.assertEqual(r.action, ChangeAction.AUTO_UPDATE)

    def test_same_day_time_auto_update(self):
        prev = ActivitySnapshot(4.13, "2026-07-13", "16:54:00", 1387)
        curr = ActivitySnapshot(4.13, "2026-07-13", "17:04:00", 1387)
        r = classify_garmin_activity_change(prev, curr)
        self.assertEqual(r.action, ChangeAction.AUTO_UPDATE)

    def test_date_boundary_review(self):
        prev = ActivitySnapshot(4.13, "2026-08-31", "23:55:00", 1387)
        curr = ActivitySnapshot(4.13, "2026-09-01", "00:05:00", 1387)
        r = classify_garmin_activity_change(prev, curr)
        self.assertEqual(r.action, ChangeAction.REVIEW_REQUIRED)
        self.assertIn(
            r.kind,
            (
                ChangeKind.DATE_BOUNDARY_CHANGE,
                ChangeKind.WEEK_BOUNDARY_CHANGE,
                ChangeKind.MONTH_BOUNDARY_CHANGE,
            ),
        )

    def test_week_boundary_review(self):
        # Sunday → Monday (ISO week)
        prev = ActivitySnapshot(5.0, "2026-07-12", "10:00:00", 1800)  # Sun
        curr = ActivitySnapshot(5.0, "2026-07-13", "10:00:00", 1800)  # Mon
        r = classify_garmin_activity_change(prev, curr)
        self.assertEqual(r.action, ChangeAction.REVIEW_REQUIRED)

    def test_finalized_protection(self):
        prev = ActivitySnapshot(4.13, "2026-07-13", "16:54:00", 1387)
        curr = ActivitySnapshot(4.25, "2026-07-13", "16:54:00", 1387)
        r = classify_garmin_activity_change(prev, curr, finalized=True)
        self.assertEqual(r.action, ChangeAction.REVIEW_REQUIRED)
        self.assertEqual(r.reason, "finalized_season_protection")

    def test_type_change_review(self):
        prev = ActivitySnapshot(4.13, "2026-07-13", "16:54:00", 1387, "treadmill_running")
        curr = ActivitySnapshot(4.13, "2026-07-13", "16:54:00", 1387, "cycling")
        r = classify_garmin_activity_change(prev, curr)
        self.assertEqual(r.kind, ChangeKind.TYPE_CHANGE)
        self.assertEqual(r.action, ChangeAction.REVIEW_REQUIRED)


if __name__ == "__main__":
    unittest.main()
