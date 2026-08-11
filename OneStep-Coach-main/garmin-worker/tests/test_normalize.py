"""Unit tests for normalize / running filter (no network, no credentials)."""

from __future__ import annotations

import unittest

from app.normalize import (
    is_running_activity,
    map_to_mileage_log_draft,
    normalize_activity,
)


def sample(
    *,
    activity_id: int = 123,
    type_key: str = "running",
    distance: float = 8420.0,
    duration: float = 2538.0,
    start: str = "2026-08-10T07:32:00",
    name: str = "Morning Run",
) -> dict:
    # Shape mirrors python-garminconnect demo.py fields
    return {
        "activityId": activity_id,
        "activityName": name,
        "activityType": {"typeKey": type_key},
        "startTimeLocal": start,
        "distance": distance,
        "duration": duration,
    }


class NormalizeTests(unittest.TestCase):
    def test_running_normalize_meters_to_km(self) -> None:
        act = normalize_activity(sample())
        assert act is not None
        self.assertEqual(act.external_activity_id, "123")
        self.assertEqual(act.activity_type, "running")
        self.assertEqual(act.distance_meters, 8420.0)
        self.assertEqual(act.distance_km, 8.42)
        self.assertEqual(act.duration_seconds, 2538.0)
        self.assertEqual(act.started_at, "2026-08-10T07:32:00")

    def test_trail_running_accepted(self) -> None:
        act = normalize_activity(sample(type_key="trail_running"))
        self.assertIsNotNone(act)

    def test_treadmill_running_accepted(self) -> None:
        act = normalize_activity(sample(type_key="treadmill_running"))
        self.assertIsNotNone(act)

    def test_walking_rejected(self) -> None:
        self.assertFalse(is_running_activity(sample(type_key="walking")))
        self.assertIsNone(normalize_activity(sample(type_key="walking")))

    def test_cycling_rejected(self) -> None:
        self.assertFalse(is_running_activity(sample(type_key="cycling")))
        self.assertIsNone(normalize_activity(sample(type_key="cycling")))

    def test_missing_activity_id_rejected(self) -> None:
        raw = sample()
        del raw["activityId"]
        self.assertIsNone(normalize_activity(raw))

    def test_mileage_mapping_uses_km_and_import_source(self) -> None:
        act = normalize_activity(sample())
        assert act is not None
        draft = map_to_mileage_log_draft(
            act,
            member_id="m1",
            participant_id="p1",
            league_id="l1",
        )
        self.assertEqual(draft["distance_km"], 8.42)
        self.assertEqual(draft["logged_at"], "2026-08-10")
        self.assertEqual(draft["source"], "import")
        self.assertEqual(draft["source_app"], "GARMIN")
        self.assertEqual(draft["external_activity_id"], "123")
        self.assertEqual(draft["activity_time"], "07:32:00")
        self.assertNotIn("_proposed_external_activity_id", draft)


if __name__ == "__main__":
    unittest.main()
