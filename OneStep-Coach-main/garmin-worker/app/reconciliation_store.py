"""Persist / query reconciliation issues & resolutions (service role)."""

from __future__ import annotations

from typing import Any

from app.db import get_supabase
from app.normalize import GarminRunningActivity
from app.reconcile import (
    ActivitySnapshot,
    ChangeAction,
    ChangeClassification,
    ChangeKind,
    format_duration_seconds,
    normalize_distance_km,
    snapshot_from_activity,
    snapshot_from_db_row,
)


def get_resolution(
    member_id: str, external_activity_id: str, *, provider: str = "GARMIN"
) -> dict[str, Any] | None:
    client = get_supabase()
    result = (
        client.table("activity_sync_resolutions")
        .select("*")
        .eq("member_id", member_id)
        .eq("provider", provider)
        .eq("external_activity_id", external_activity_id)
        .limit(1)
        .execute()
    )
    rows = result.data or []
    return rows[0] if rows else None


def find_garmin_log(
    member_id: str, external_activity_id: str
) -> dict[str, Any] | None:
    client = get_supabase()
    result = (
        client.table("running_league_mileage_logs")
        .select(
            "id, member_id, participant_id, distance_km, logged_at, activity_time, "
            "duration, source, source_app, external_activity_id"
        )
        .eq("member_id", member_id)
        .eq("source_app", "GARMIN")
        .eq("external_activity_id", external_activity_id)
        .limit(1)
        .execute()
    )
    rows = result.data or []
    return rows[0] if rows else None


def open_issue_exists(
    member_id: str,
    external_activity_id: str,
    issue_type: str,
    *,
    provider: str = "GARMIN",
) -> bool:
    client = get_supabase()
    result = (
        client.table("member_mileage_duplicate_candidates")
        .select("id")
        .eq("member_id", member_id)
        .eq("provider", provider)
        .eq("external_activity_id", external_activity_id)
        .eq("issue_type", issue_type)
        .eq("status", "OPEN")
        .limit(1)
        .execute()
    )
    return bool(result.data)


def upsert_issue(
    *,
    member_id: str,
    existing_log_id: str | None,
    external_activity_id: str,
    issue_type: str,
    reason: str,
    proposed: ActivitySnapshot,
    existing: ActivitySnapshot | None = None,
    confidence: str = "HIGH",
    provider: str = "GARMIN",
) -> None:
    """Create or refresh OPEN issue. Never duplicates open rows (unique index)."""
    if open_issue_exists(member_id, external_activity_id, issue_type, provider=provider):
        return

    client = get_supabase()
    payload: dict[str, Any] = {
        "member_id": member_id,
        "existing_log_id": existing_log_id,
        "provider": provider,
        "external_activity_id": external_activity_id,
        "proposed_distance_km": normalize_distance_km(proposed.distance_km),
        "proposed_logged_at": proposed.logged_at[:10],
        "proposed_activity_time": proposed.activity_time,
        "proposed_duration": format_duration_seconds(proposed.duration_seconds),
        "reason": reason,
        "status": "OPEN",
        "issue_type": issue_type,
        "confidence": confidence,
        "proposed_summary": {
            "distance_km": normalize_distance_km(proposed.distance_km),
            "logged_at": proposed.logged_at[:10],
            "activity_time": proposed.activity_time,
            "duration": format_duration_seconds(proposed.duration_seconds),
            "activity_type": proposed.activity_type,
        },
        "existing_summary": {},
    }
    if existing:
        payload["existing_summary"] = {
            "distance_km": normalize_distance_km(existing.distance_km),
            "logged_at": existing.logged_at[:10],
            "activity_time": existing.activity_time,
            "duration": format_duration_seconds(existing.duration_seconds),
        }

    # Prefer insert; on conflict of unique (member,provider,external) for legacy
    # POSSIBLE_DUPLICATE-only uniqueness, try update-or-insert by open index.
    try:
        client.table("member_mileage_duplicate_candidates").insert(payload).execute()
    except Exception:
        # Legacy unique on (member, provider, external) — update if OPEN same external
        client.table("member_mileage_duplicate_candidates").upsert(
            payload,
            on_conflict="member_id,provider,external_activity_id",
        ).execute()


def write_audit(
    *,
    member_id: str,
    external_activity_id: str | None,
    mileage_log_id: str | None,
    event_type: str,
    previous_summary: dict[str, Any],
    new_summary: dict[str, Any],
    source: str = "worker",
) -> None:
    client = get_supabase()
    client.table("activity_reconciliation_events").insert(
        {
            "member_id": member_id,
            "provider": "GARMIN",
            "external_activity_id": external_activity_id,
            "mileage_log_id": mileage_log_id,
            "event_type": event_type,
            "previous_summary": previous_summary,
            "new_summary": new_summary,
            "source": source,
        }
    ).execute()


def auto_update_garmin_log(
    row: dict[str, Any],
    activity: GarminRunningActivity,
    classification: ChangeClassification,
) -> None:
    """Apply safe in-place update + audit. Never creates a new row."""
    from app.import_mileage import format_duration, sync_participant_mileage_km

    client = get_supabase()
    snap = snapshot_from_activity(activity)
    prev = snapshot_from_db_row(row)
    client.table("running_league_mileage_logs").update(
        {
            "distance_km": snap.distance_km,
            "logged_at": snap.logged_at,
            "activity_time": snap.activity_time,
            "duration": format_duration(activity.duration_seconds),
        }
    ).eq("id", row["id"]).execute()

    write_audit(
        member_id=str(row["member_id"]),
        external_activity_id=activity.external_activity_id,
        mileage_log_id=str(row["id"]),
        event_type="GARMIN_SOURCE_UPDATE",
        previous_summary={
            "distance_km": prev.distance_km,
            "logged_at": prev.logged_at,
            "activity_time": prev.activity_time,
            "duration": format_duration_seconds(prev.duration_seconds),
            "kind": classification.kind.value,
        },
        new_summary={
            "distance_km": snap.distance_km,
            "logged_at": snap.logged_at,
            "activity_time": snap.activity_time,
            "duration": format_duration_seconds(snap.duration_seconds),
        },
    )
    pid = row.get("participant_id")
    if pid:
        sync_participant_mileage_km(str(pid))


def reconcile_existing_garmin(
    activity: GarminRunningActivity,
    *,
    member_id: str,
) -> str:
    """
    Compare already-imported Garmin row with fresh activity.
    Returns: NO_CHANGE | AUTO_UPDATED | REVIEW_REQUIRED | MISSING
    """
    from app.reconcile import classify_garmin_activity_change

    row = find_garmin_log(member_id, activity.external_activity_id)
    if not row:
        return "MISSING"

    prev = snapshot_from_db_row(row)
    curr = snapshot_from_activity(activity)
    classification = classify_garmin_activity_change(prev, curr)

    if classification.action == ChangeAction.NO_CHANGE:
        return "NO_CHANGE"

    if classification.action == ChangeAction.AUTO_UPDATE:
        auto_update_garmin_log(row, activity, classification)
        return "AUTO_UPDATED"

    # REVIEW_REQUIRED
    issue_type = "SOURCE_CHANGED"
    if classification.kind == ChangeKind.WEEK_BOUNDARY_CHANGE:
        issue_type = "WEEK_BOUNDARY_CHANGED"
    elif classification.kind in (
        ChangeKind.DATE_BOUNDARY_CHANGE,
        ChangeKind.MONTH_BOUNDARY_CHANGE,
    ):
        issue_type = "DATE_BOUNDARY_CHANGED"
    elif classification.kind == ChangeKind.TYPE_CHANGE:
        issue_type = "ACTIVITY_NO_LONGER_RUNNING"
    elif classification.reason == "finalized_season_protection":
        issue_type = "SOURCE_CHANGED_AFTER_FINALIZATION"

    upsert_issue(
        member_id=member_id,
        existing_log_id=str(row["id"]),
        external_activity_id=activity.external_activity_id,
        issue_type=issue_type,
        reason=classification.reason,
        proposed=curr,
        existing=prev,
        confidence="HIGH",
    )
    return "REVIEW_REQUIRED"


def check_activity_exists_on_garmin(client: Any, activity_id: str) -> bool | None:
    """
    Explicit existence check via Garmin.get_activity (confirmed in python-garminconnect).
    Returns True / False / None (unknown error — do NOT treat as deleted).
    Must NOT be called for every historical import each sync.
    """
    try:
        client.get_activity(str(activity_id))
        return True
    except Exception as exc:
        msg = str(exc).lower()
        if any(
            x in msg
            for x in ("404", "not found", "not_found", "does not exist", "no activity")
        ):
            return False
        return None
