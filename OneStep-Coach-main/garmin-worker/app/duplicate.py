"""Manual vs Garmin duplicate-candidate detection (no auto-merge/delete)."""

from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime
from typing import Any

# Config — adjustable without inventing unknown sport types
# Central constants (mirrored names for ops docs)
GARMIN_DUPLICATE_TIME_WINDOW_MINUTES = 30
GARMIN_DUPLICATE_DISTANCE_ABSOLUTE_KM = 0.3
GARMIN_DUPLICATE_DISTANCE_PERCENT = 0.05

TIME_WINDOW_MINUTES = GARMIN_DUPLICATE_TIME_WINDOW_MINUTES
DISTANCE_ABS_KM = GARMIN_DUPLICATE_DISTANCE_ABSOLUTE_KM
DISTANCE_REL_FRACTION = GARMIN_DUPLICATE_DISTANCE_PERCENT


@dataclass(frozen=True)
class DuplicateCandidate:
    existing_log_id: str
    reason: str
    confidence: str = "HIGH"  # HIGH | LOW (no activity_time on manual)


def _parse_activity_time(value: str | None) -> datetime | None:
    if not value:
        return None
    text = value.strip()
    for fmt in ("%H:%M:%S", "%H:%M"):
        try:
            return datetime.strptime(text[: len(fmt) + 2], fmt)
        except ValueError:
            continue
    return None


def distance_threshold_km(garmin_distance_km: float) -> float:
    return max(DISTANCE_ABS_KM, abs(garmin_distance_km) * DISTANCE_REL_FRACTION)


def find_duplicate_candidate(
    *,
    garmin_distance_km: float,
    garmin_logged_at: str,
    garmin_activity_time: str | None,
    existing_logs: list[dict[str, Any]],
) -> DuplicateCandidate | None:
    """
    Compare proposed Garmin activity against existing non-GARMIN (or any) logs.

    Skips rows that already have the same external_activity_id (handled elsewhere).
    Never deletes/modifies existing rows.
    """
    threshold = distance_threshold_km(garmin_distance_km)
    garmin_time = _parse_activity_time(garmin_activity_time)

    for row in existing_logs:
        # Already a Garmin import with external id — not a manual collision case here
        source_app = str(row.get("source_app") or "").strip().upper()
        if source_app == "GARMIN" and row.get("external_activity_id"):
            continue

        logged_at = str(row.get("logged_at") or "")[:10]
        if logged_at != garmin_logged_at[:10]:
            continue

        try:
            existing_km = float(row.get("distance_km"))
        except (TypeError, ValueError):
            continue

        if abs(existing_km - garmin_distance_km) > threshold:
            continue

        existing_time = _parse_activity_time(
            str(row.get("activity_time")) if row.get("activity_time") is not None else None
        )

        if garmin_time is not None and existing_time is not None:
            delta = abs(
                (
                    datetime.combine(datetime.min.date(), garmin_time.time())
                    - datetime.combine(datetime.min.date(), existing_time.time())
                ).total_seconds()
            )
            if delta > TIME_WINDOW_MINUTES * 60:
                # Far apart in time → legitimate separate runs, not a candidate
                continue
            reason = (
                f"same_day_near_distance_near_time"
                f"|km_diff={abs(existing_km - garmin_distance_km):.2f}"
                f"|min_diff={int(delta // 60)}"
            )
            confidence = "HIGH"
        else:
            # No usable clock on manual row — same date + near distance only
            reason = (
                f"same_day_near_distance_no_time"
                f"|km_diff={abs(existing_km - garmin_distance_km):.2f}"
            )
            confidence = "LOW"

        return DuplicateCandidate(
            existing_log_id=str(row.get("id")),
            reason=reason,
            confidence=confidence,
        )

    return None
