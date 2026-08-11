"""Garmin activity change classification (13-E).

Never auto-deletes. Ambiguous / boundary / finalized → REVIEW_REQUIRED.
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import date, datetime
from enum import Enum
from typing import Any


# Canonical distance comparison uses DB precision (2 decimal km)
DISTANCE_EPS_KM = 0.005  # half-cent of a km after round(2)
DURATION_EPS_SECONDS = 2


class ChangeKind(str, Enum):
    NONE = "NONE"
    MINOR = "MINOR"
    DISTANCE_CHANGE = "DISTANCE_CHANGE"
    TIME_CHANGE = "TIME_CHANGE"
    DATE_BOUNDARY_CHANGE = "DATE_BOUNDARY_CHANGE"
    WEEK_BOUNDARY_CHANGE = "WEEK_BOUNDARY_CHANGE"
    MONTH_BOUNDARY_CHANGE = "MONTH_BOUNDARY_CHANGE"
    TYPE_CHANGE = "TYPE_CHANGE"
    SOURCE_DELETED = "SOURCE_DELETED"


class ChangeAction(str, Enum):
    NO_CHANGE = "NO_CHANGE"
    AUTO_UPDATE = "AUTO_UPDATE"
    REVIEW_REQUIRED = "REVIEW_REQUIRED"


@dataclass(frozen=True)
class ActivitySnapshot:
    distance_km: float
    logged_at: str  # YYYY-MM-DD
    activity_time: str | None  # HH:MM:SS or HH:MM
    duration_seconds: float | None
    activity_type: str | None = None


@dataclass(frozen=True)
class ChangeClassification:
    kind: ChangeKind
    action: ChangeAction
    reason: str


def normalize_distance_km(value: float | int | str | None) -> float:
    try:
        return round(float(value or 0), 2)
    except (TypeError, ValueError):
        return 0.0


def _parse_date(value: str | None) -> date | None:
    if not value:
        return None
    text = str(value).strip()[:10]
    try:
        return date.fromisoformat(text)
    except ValueError:
        return None


def _parse_time(value: str | None) -> datetime | None:
    if not value:
        return None
    text = str(value).strip()
    for fmt in ("%H:%M:%S", "%H:%M"):
        try:
            return datetime.strptime(text[:8] if fmt == "%H:%M:%S" else text[:5], fmt)
        except ValueError:
            continue
    return None


def _iso_week_key(d: date) -> tuple[int, int]:
    iso = d.isocalendar()
    return (iso.year, iso.week)


def is_date_in_finalized_season(_logged_at: str) -> bool:
    """
    Running-league FINALIZED seasons are not yet modeled in this codebase.
    Always False until a season SoT exists — Hall of Fame snapshots remain untouched anyway.
    """
    return False


def classify_garmin_activity_change(
    previous: ActivitySnapshot,
    current: ActivitySnapshot,
    *,
    finalized: bool | None = None,
) -> ChangeClassification:
    """Compare stored Garmin row vs freshly normalized Garmin values."""
    if finalized is None:
        finalized = is_date_in_finalized_season(previous.logged_at)

    prev_type = (previous.activity_type or "").strip().lower()
    curr_type = (current.activity_type or "").strip().lower()
    if prev_type and curr_type and prev_type != curr_type:
        # Running → non-running handled by caller when curr is not running
        if "running" in prev_type and "running" not in curr_type:
            return ChangeClassification(
                ChangeKind.TYPE_CHANGE,
                ChangeAction.REVIEW_REQUIRED,
                "activity_type_no_longer_running",
            )
        if prev_type != curr_type:
            return ChangeClassification(
                ChangeKind.TYPE_CHANGE,
                ChangeAction.REVIEW_REQUIRED,
                f"activity_type_changed|{prev_type}->{curr_type}",
            )

    prev_d = _parse_date(previous.logged_at)
    curr_d = _parse_date(current.logged_at)
    if prev_d and curr_d and prev_d != curr_d:
        if prev_d.year != curr_d.year or prev_d.month != curr_d.month:
            return ChangeClassification(
                ChangeKind.MONTH_BOUNDARY_CHANGE,
                ChangeAction.REVIEW_REQUIRED,
                f"month_boundary|{prev_d.isoformat()}->{curr_d.isoformat()}",
            )
        if _iso_week_key(prev_d) != _iso_week_key(curr_d):
            return ChangeClassification(
                ChangeKind.WEEK_BOUNDARY_CHANGE,
                ChangeAction.REVIEW_REQUIRED,
                f"week_boundary|{prev_d.isoformat()}->{curr_d.isoformat()}",
            )
        return ChangeClassification(
            ChangeKind.DATE_BOUNDARY_CHANGE,
            ChangeAction.REVIEW_REQUIRED,
            f"date_changed|{prev_d.isoformat()}->{curr_d.isoformat()}",
        )

    prev_km = normalize_distance_km(previous.distance_km)
    curr_km = normalize_distance_km(current.distance_km)
    distance_changed = abs(prev_km - curr_km) > DISTANCE_EPS_KM

    prev_dur = previous.duration_seconds
    curr_dur = current.duration_seconds
    duration_changed = False
    if prev_dur is not None and curr_dur is not None:
        duration_changed = abs(float(prev_dur) - float(curr_dur)) > DURATION_EPS_SECONDS

    prev_t = _parse_time(previous.activity_time)
    curr_t = _parse_time(current.activity_time)
    time_changed = False
    if prev_t is not None and curr_t is not None:
        time_changed = abs((prev_t - curr_t).total_seconds()) > 60  # >1 min

    if not distance_changed and not duration_changed and not time_changed:
        return ChangeClassification(ChangeKind.NONE, ChangeAction.NO_CHANGE, "identical")

    if finalized:
        return ChangeClassification(
            ChangeKind.DISTANCE_CHANGE if distance_changed else ChangeKind.TIME_CHANGE,
            ChangeAction.REVIEW_REQUIRED,
            "finalized_season_protection",
        )

    # Same calendar day: distance / duration / time → safe auto-update
    if distance_changed:
        return ChangeClassification(
            ChangeKind.DISTANCE_CHANGE,
            ChangeAction.AUTO_UPDATE,
            f"distance|{prev_km}->{curr_km}",
        )
    if duration_changed:
        return ChangeClassification(
            ChangeKind.MINOR,
            ChangeAction.AUTO_UPDATE,
            "duration_change",
        )
    if time_changed:
        return ChangeClassification(
            ChangeKind.TIME_CHANGE,
            ChangeAction.AUTO_UPDATE,
            "same_day_time_change",
        )

    return ChangeClassification(ChangeKind.MINOR, ChangeAction.NO_CHANGE, "noop")


def format_duration_seconds(seconds: float | None) -> str | None:
    if seconds is None:
        return None
    total = int(round(float(seconds)))
    if total < 0:
        total = 0
    h, rem = divmod(total, 3600)
    m, s = divmod(rem, 60)
    if h:
        return f"{h}:{m:02d}:{s:02d}"
    return f"{m:02d}:{s:02d}"


def snapshot_from_db_row(row: dict[str, Any]) -> ActivitySnapshot:
    duration = row.get("duration")
    duration_seconds = None
    if duration and isinstance(duration, str):
        parts = duration.strip().split(":")
        try:
            if len(parts) == 3:
                duration_seconds = int(parts[0]) * 3600 + int(parts[1]) * 60 + int(parts[2])
            elif len(parts) == 2:
                duration_seconds = int(parts[0]) * 60 + int(parts[1])
        except ValueError:
            duration_seconds = None
    return ActivitySnapshot(
        distance_km=normalize_distance_km(row.get("distance_km")),
        logged_at=str(row.get("logged_at") or "")[:10],
        activity_time=str(row["activity_time"]) if row.get("activity_time") else None,
        duration_seconds=duration_seconds,
        activity_type=None,
    )


def snapshot_from_activity(activity: Any) -> ActivitySnapshot:
    started = str(getattr(activity, "started_at", "") or "")
    logged_at = started[:10]
    activity_time = None
    if "T" in started:
        activity_time = started.split("T", 1)[1][:8]
    elif " " in started:
        activity_time = started.split(" ", 1)[1][:8]
    return ActivitySnapshot(
        distance_km=normalize_distance_km(getattr(activity, "distance_km", 0)),
        logged_at=logged_at,
        activity_time=activity_time,
        duration_seconds=float(getattr(activity, "duration_seconds", 0) or 0),
        activity_type=str(getattr(activity, "activity_type", "") or "") or None,
    )
