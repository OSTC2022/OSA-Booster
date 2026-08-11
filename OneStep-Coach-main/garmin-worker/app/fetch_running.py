"""CLI: fetch recent Garmin running activities and print safe summary."""

from __future__ import annotations

import os
import sys
from pathlib import Path

from dotenv import load_dotenv

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from app.client import (  # noqa: E402
    GarminAuthError,
    default_lookback_range,
    fetch_activities_by_date,
    login_with_token_reuse,
    token_store_relative,
    tokens_present,
)
from app.normalize import (  # noqa: E402
    extract_type_key,
    format_duration,
    is_running_activity,
    map_to_mileage_log_draft,
    normalize_activity,
)


def mask_activity_id(activity_id: str) -> str:
    text = str(activity_id)
    if len(text) <= 4:
        return "****"
    return f"...{text[-4:]}"


def safe_fail(label: str) -> int:
    print(f"{label}: FAIL")
    print("Garmin sync failed")
    return 1


def main() -> int:
    load_dotenv(ROOT / ".env")
    days = int(os.getenv("GARMIN_LOOKBACK_DAYS") or "7")
    start, end = default_lookback_range(days)

    print("Garmin Connect sync POC (unofficial / beta)")
    print(f"Token path (relative): {token_store_relative()}")
    print(f"Token store present before login: {'YES' if tokens_present() else 'NO'}")
    print(f"Range: {start} ~ {end} ({days} days)")
    print("Method: get_activities_by_date(..., activitytype='running')")
    print("---")

    try:
        # Token-only: never trigger mobile/widget/portal credential login (avoids 429)
        client, token_reused = login_with_token_reuse(allow_credential_fallback=False)
    except GarminAuthError as exc:
        code = getattr(exc, "code", "LOGIN")
        print(code)
        if code == "TOKEN_MISSING":
            print("Run first: python -m app.browser_bootstrap")
            return safe_fail("LOGIN")
        return safe_fail("TOKEN_RESTORE")
    except Exception:
        return safe_fail("TOKEN_RESTORE")

    print("LOGIN: PASS (token restore)")
    print(f"Token Reuse this run: {'YES' if token_reused else 'NO'}")
    print(f"Token store created/present: {'YES' if tokens_present() else 'NO'}")
    print("Password required: NO")

    try:
        raw_running = fetch_activities_by_date(
            client, start=start, end=end, activitytype="running"
        )
    except Exception as exc:
        name = type(exc).__name__
        if "429" in str(exc) or "TooMany" in name:
            print("GARMIN_API_REJECTED")
            print("429 after token restore")
        return safe_fail("FETCH")

    print(f"FETCH: PASS (running query count={len(raw_running)})")

    try:
        all_raw = fetch_activities_by_date(client, start=start, end=end, activitytype=None)
    except Exception:
        all_raw = []

    observed_types: dict[str, int] = {}
    for row in all_raw or raw_running:
        key = extract_type_key(row) or "(empty)"
        observed_types[key] = observed_types.get(key, 0) + 1

    print("Observed typeKey counts:")
    for key, count in sorted(observed_types.items(), key=lambda x: (-x[1], x[0])):
        print(f"  {key}: {count}")

    non_running_in_running_query = [row for row in raw_running if not is_running_activity(row)]
    if non_running_in_running_query:
        print(f"RUNNING FILTER: FAIL (non-running leaked={len(non_running_in_running_query)})")
    else:
        print("RUNNING FILTER: PASS")

    # Walking/cycling present in unfiltered list but excluded from normalized running
    excluded_sports = []
    for row in all_raw:
        key = extract_type_key(row)
        if key in {"walking", "cycling"} or "walk" in key or "cycl" in key:
            if normalize_activity(row) is not None:
                excluded_sports.append(key)
    if excluded_sports:
        print("WALKING/CYCLING EXCLUSION: FAIL")
    elif any(
        ("walk" in k or "cycl" in k or k in {"walking", "cycling"}) for k in observed_types
    ):
        print("WALKING/CYCLING EXCLUSION: PASS (present in feed, absent from running list)")
    else:
        print("WALKING/CYCLING EXCLUSION: NOT TESTED (no walking/cycling in window)")

    activities = []
    raw_by_id: dict[str, dict] = {}
    for row in raw_running:
        normalized = normalize_activity(row)
        if normalized:
            activities.append(normalized)
            raw_by_id[normalized.external_activity_id] = row

    print(f"NORMALIZE: PASS (running n={len(activities)})")
    print()
    print("GARMIN RUNNING ACTIVITIES")
    print()

    for index, item in enumerate(activities[:20], start=1):
        raw = raw_by_id.get(item.external_activity_id, {})
        raw_distance = raw.get("distance")
        print(f"{index}.")
        print(f"{item.started_at}")
        print(f"{item.distance_km} km")
        print(format_duration(item.duration_seconds))
        print(f"Type: {item.activity_type}")
        print(f"Activity ID: {mask_activity_id(item.external_activity_id)}")
        if raw_distance is not None:
            print(f"Raw distance field: {raw_distance} (compare to UI; meters if ~1000x km)")
        print()

    if not activities:
        print("No running activities in window.")
        print("INSUFFICIENT TEST DATA for 3-way UI comparison.")
    elif len(activities) < 3:
        print(f"Found {len(activities)} running activit(y/ies).")
        print("INSUFFICIENT TEST DATA for 3-activity UI comparison - compare available rows manually.")
    else:
        print("Compare at least the first 3 rows with Garmin Connect UI (date / km / duration).")

    print()
    print("DB Mapping draft (NOT inserted):")
    if activities:
        draft = map_to_mileage_log_draft(
            activities[0],
            member_id="<test-member-id>",
            participant_id="<participant-id>",
            league_id="<league-id>",
        )
        for key in (
            "distance_km",
            "logged_at",
            "duration",
            "activity_time",
            "source",
            "source_app",
            "external_activity_id",
        ):
            value = draft.get(key)
            if key == "external_activity_id" and value is not None:
                value = mask_activity_id(str(value))
            print(f"  {key}: {value}")
        print("Production Insert: use python -m app.sync_member --import")
        print("DB Mapping: READY (13-B external_activity_id)")
    else:
        print("DB Mapping: NOT READY (no activities)")

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
