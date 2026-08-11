"""Normalized Garmin running activity (provider-agnostic shape for 13-B)."""

from __future__ import annotations

from dataclasses import asdict, dataclass
from datetime import datetime
from typing import Any


@dataclass(frozen=True)
class GarminRunningActivity:
    external_activity_id: str
    started_at: str  # local ISO-like startTimeLocal from Garmin
    distance_meters: float
    duration_seconds: float
    activity_type: str
    activity_name: str | None = None

    @property
    def distance_km(self) -> float:
        return round(self.distance_meters / 1000.0, 2)

    def to_public_dict(self) -> dict[str, Any]:
        """Safe fields for console output — no GPS/HR/tokens."""
        return {
            "external_activity_id": self.external_activity_id,
            "activity_type": self.activity_type,
            "started_at": self.started_at,
            "distance_km": self.distance_km,
            "distance_meters": self.distance_meters,
            "duration_seconds": self.duration_seconds,
            "activity_name": self.activity_name,
        }


# Documented by python-garminconnect demo.py activity list responses:
# activity.get("activityType", {}).get("typeKey")
# Library get_activities_by_date(activitytype=...) accepts:
#   cycling, running, swimming, multi_sport, fitness_equipment, hiking, walking, other
#
# Subtype typeKeys are confirmed from live responses; do not invent.
# Initial accept rule (conservative): typeKey == "running" OR typeKey endswith "_running"
# Explicit rejects for non-running sports.

EXPLICIT_NON_RUNNING = frozenset(
    {
        "walking",
        "cycling",
        "swimming",
        "hiking",
        "fitness_equipment",
        "multi_sport",
        "other",
        "strength_training",
        "yoga",
        "cardio",
    }
)


def extract_type_key(raw: dict[str, Any]) -> str:
    activity_type = raw.get("activityType")
    if isinstance(activity_type, dict):
        return str(activity_type.get("typeKey") or "").strip().lower()
    if isinstance(activity_type, str):
        return activity_type.strip().lower()
    return ""


def is_running_activity(raw: dict[str, Any]) -> bool:
    """Return True only for running-family activities."""
    type_key = extract_type_key(raw)
    if not type_key:
        return False
    if type_key in EXPLICIT_NON_RUNNING:
        return False
    if "walk" in type_key or "cycl" in type_key or "swim" in type_key or "hik" in type_key:
        return False
    if type_key == "running" or type_key.endswith("_running"):
        return True
    # Unknown typeKey: reject until live allowlist is updated (no guessing).
    return False


def format_duration(seconds: float) -> str:
    total = max(0, int(round(seconds)))
    h = total // 3600
    m = (total % 3600) // 60
    s = total % 60
    if h > 0:
        return f"{h:02d}:{m:02d}:{s:02d}"
    return f"{m:02d}:{s:02d}"


def normalize_activity(raw: dict[str, Any]) -> GarminRunningActivity | None:
    """
    Map Garmin Connect activity JSON → GarminRunningActivity.

    Field names taken from python-garminconnect demo.py (not guessed):
      activityId, activityType.typeKey, startTimeLocal, distance (meters), duration (seconds),
      activityName
    """
    if not is_running_activity(raw):
        return None

    activity_id = raw.get("activityId")
    if activity_id is None:
        return None

    distance = raw.get("distance")
    if distance is None:
        return None
    try:
        distance_meters = float(distance)
    except (TypeError, ValueError):
        return None
    if distance_meters <= 0:
        return None

    duration_raw = raw.get("duration")
    try:
        duration_seconds = float(duration_raw) if duration_raw is not None else 0.0
    except (TypeError, ValueError):
        duration_seconds = 0.0

    started = str(raw.get("startTimeLocal") or raw.get("startTimeGMT") or "").strip()
    if not started:
        return None

    type_key = extract_type_key(raw)
    name = raw.get("activityName")
    activity_name = str(name).strip() if name else None

    return GarminRunningActivity(
        external_activity_id=str(activity_id),
        started_at=started,
        distance_meters=distance_meters,
        duration_seconds=duration_seconds,
        activity_type=type_key,
        activity_name=activity_name,
    )


def map_to_mileage_log_draft(
    activity: GarminRunningActivity,
    *,
    member_id: str,
    participant_id: str,
    league_id: str,
) -> dict[str, Any]:
    """
    Proposed insert payload for running_league_mileage_logs (13-A dry mapping only).

    Current DB:
      distance_km NUMERIC — kilometers
      logged_at DATE
      source TEXT CHECK (manual|lesson|import|other)
      source_app TEXT (nullable)
      duration TEXT (e.g. 1:00:27)
      activity_time TEXT

    Missing historically (13-B migration adds):
      external_activity_id TEXT + unique (member_id, source_app, external_activity_id)
    """
    # Prefer local date portion of startTimeLocal (YYYY-MM-DDTHH:MM:SS)
    date_part = activity.started_at.split("T")[0]
    time_part = ""
    if "T" in activity.started_at:
        time_part = activity.started_at.split("T", 1)[1][:8]

    return {
        "member_id": member_id,
        "participant_id": participant_id,
        "league_id": league_id,
        "distance_km": activity.distance_km,
        "logged_at": date_part,
        "source": "import",
        "source_app": "GARMIN",
        "notes": f"Garmin Connect 자동동기화 id={activity.external_activity_id}",
        "duration": format_duration(activity.duration_seconds),
        "activity_time": time_part or None,
        "external_activity_id": activity.external_activity_id,
    }


def as_dict(activity: GarminRunningActivity) -> dict[str, Any]:
    return asdict(activity)
