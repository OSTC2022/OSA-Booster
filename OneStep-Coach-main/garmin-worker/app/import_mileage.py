"""Import Garmin running activities into running_league_mileage_logs."""

from __future__ import annotations

from typing import Any, Literal

from app.db import get_supabase, rpc
from app.duplicate import find_duplicate_candidate
from app.normalize import GarminRunningActivity, format_duration, map_to_mileage_log_draft

ImportStatus = Literal[
    "IMPORTED",
    "ALREADY_IMPORTED",
    "DUPLICATE_CANDIDATE",
    "SKIPPED",
]


def resolve_portal_participant(member_id: str) -> dict[str, str]:
    """
    Resolve ranking league participant for member.
    Prefer center portal ranking league (__center_portal_ranking__).
    """
    client = get_supabase()

    leagues = (
        client.table("running_leagues")
        .select("id, name, description")
        .order("created_at", desc=True)
        .limit(50)
        .execute()
    )
    ranking_ids: list[str] = []
    other_ids: list[str] = []
    for row in leagues.data or []:
        desc = str(row.get("description") or "")
        lid = str(row["id"])
        if "__center_portal_ranking__" in desc:
            ranking_ids.append(lid)
        else:
            other_ids.append(lid)

    result = (
        client.table("running_league_participants")
        .select("id, league_id, member_id")
        .eq("member_id", member_id)
        .limit(20)
        .execute()
    )
    rows = result.data or []
    if not rows:
        raise RuntimeError("PARTICIPANT_NOT_FOUND")

    by_league = {str(r["league_id"]): r for r in rows}
    for lid in ranking_ids:
        if lid in by_league:
            row = by_league[lid]
            return {
                "participant_id": str(row["id"]),
                "league_id": str(row["league_id"]),
                "member_id": str(row["member_id"]),
            }
    row = rows[0]
    return {
        "participant_id": str(row["id"]),
        "league_id": str(row["league_id"]),
        "member_id": str(row["member_id"]),
    }


def _existing_logs_for_day(member_id: str, logged_at: str) -> list[dict[str, Any]]:
    client = get_supabase()
    result = (
        client.table("running_league_mileage_logs")
        .select(
            "id, distance_km, logged_at, activity_time, duration, source, source_app, "
            "external_activity_id"
        )
        .eq("member_id", member_id)
        .eq("logged_at", logged_at[:10])
        .execute()
    )
    return list(result.data or [])


def _record_duplicate_candidate(
    *,
    member_id: str,
    existing_log_id: str,
    activity: GarminRunningActivity,
    reason: str,
    confidence: str = "HIGH",
) -> None:
    from app.reconcile import snapshot_from_activity
    from app.reconciliation_store import open_issue_exists

    if open_issue_exists(member_id, activity.external_activity_id, "POSSIBLE_DUPLICATE"):
        return

    client = get_supabase()
    date_part = activity.started_at.split("T")[0]
    time_part = ""
    if "T" in activity.started_at:
        time_part = activity.started_at.split("T", 1)[1][:8]
    snap = snapshot_from_activity(activity)
    payload = {
        "member_id": member_id,
        "existing_log_id": existing_log_id,
        "provider": "GARMIN",
        "external_activity_id": activity.external_activity_id,
        "proposed_distance_km": activity.distance_km,
        "proposed_logged_at": date_part,
        "proposed_activity_time": time_part or None,
        "proposed_duration": format_duration(activity.duration_seconds),
        "reason": reason,
        "status": "OPEN",
        "issue_type": "POSSIBLE_DUPLICATE",
        "confidence": confidence if confidence in ("HIGH", "LOW") else "HIGH",
        "proposed_summary": {
            "distance_km": snap.distance_km,
            "logged_at": snap.logged_at,
            "activity_time": snap.activity_time,
            "duration": format_duration(activity.duration_seconds),
        },
    }
    try:
        client.table("member_mileage_duplicate_candidates").insert(payload).execute()
    except Exception:
        # Pre-migration unique (member, provider, external) — upsert fallback
        client.table("member_mileage_duplicate_candidates").upsert(
            payload,
            on_conflict="member_id,provider,external_activity_id",
        ).execute()


def sync_participant_mileage_km(participant_id: str) -> float:
    """Recompute participant.mileage_km from logs (existing SoT path)."""
    from datetime import datetime, timezone

    client = get_supabase()
    result = (
        client.table("running_league_mileage_logs")
        .select("distance_km")
        .eq("participant_id", participant_id)
        .execute()
    )
    total = 0.0
    for row in result.data or []:
        try:
            total += float(row.get("distance_km") or 0)
        except (TypeError, ValueError):
            continue
    total = round(total, 2)
    client.table("running_league_participants").update(
        {"mileage_km": total, "updated_at": datetime.now(timezone.utc).isoformat()}
    ).eq("id", participant_id).execute()
    return total


def import_activity(
    activity: GarminRunningActivity,
    *,
    member_id: str,
    participant_id: str,
    league_id: str,
    check_manual_duplicates: bool = True,
) -> ImportStatus:
    from app.reconciliation_store import get_resolution, reconcile_existing_garmin

    draft = map_to_mileage_log_draft(
        activity,
        member_id=member_id,
        participant_id=participant_id,
        league_id=league_id,
    )
    logged_at = str(draft["logged_at"])
    activity_time = draft.get("activity_time")

    # Exact external id already imported → reconcile changes, never double-insert
    resolution = get_resolution(member_id, activity.external_activity_id)
    if resolution:
        rtype = str(resolution.get("resolution_type") or "")
        if rtype == "KEEP_MANUAL":
            return "SKIPPED"  # IGNORED_RESOLVED
        if rtype in (
            "KEEP_LOCAL_AFTER_SOURCE_DELETE",
            "REMOVE_LOCAL_AFTER_SOURCE_DELETE",
            "KEEP_LOCAL_AFTER_TYPE_CHANGE",
            "REMOVE_LOCAL_AFTER_TYPE_CHANGE",
        ):
            # Already decided — do not reopen unless USE path needs import
            if rtype.startswith("REMOVE_"):
                return "SKIPPED"
            # KEEP_LOCAL*: do not re-import another copy
            if rtype.startswith("KEEP_LOCAL"):
                return "SKIPPED"
        # USE_GARMIN / ALLOW_BOTH: continue; unique index is final guard

    if check_manual_duplicates:
        existing = _existing_logs_for_day(member_id, logged_at)
        for row in existing:
            if (
                str(row.get("external_activity_id") or "") == activity.external_activity_id
                and str(row.get("source_app") or "").upper() == "GARMIN"
            ):
                reconcile_existing_garmin(activity, member_id=member_id)
                return "ALREADY_IMPORTED"

        # Global exact check (not only same day)
        from app.reconciliation_store import find_garmin_log

        existing_garmin = find_garmin_log(member_id, activity.external_activity_id)
        if existing_garmin:
            reconcile_existing_garmin(activity, member_id=member_id)
            return "ALREADY_IMPORTED"

        if resolution and str(resolution.get("resolution_type")) == "ALLOW_BOTH":
            # User already allowed both — skip duplicate gate, import Garmin
            pass
        elif resolution and str(resolution.get("resolution_type")) == "USE_GARMIN":
            # Should already be linked; if missing, fall through to import
            pass
        else:
            candidate = find_duplicate_candidate(
                garmin_distance_km=float(draft["distance_km"]),
                garmin_logged_at=logged_at,
                garmin_activity_time=str(activity_time) if activity_time else None,
                existing_logs=existing,
            )
            if candidate:
                _record_duplicate_candidate(
                    member_id=member_id,
                    existing_log_id=candidate.existing_log_id,
                    activity=activity,
                    reason=candidate.reason,
                    confidence=candidate.confidence,
                )
                return "DUPLICATE_CANDIDATE"

    try:
        result = rpc(
            "import_garmin_mileage_log",
            {
                "p_member_id": member_id,
                "p_participant_id": participant_id,
                "p_league_id": league_id,
                "p_distance_km": float(draft["distance_km"]),
                "p_logged_at": logged_at,
                "p_duration": draft.get("duration"),
                "p_activity_time": activity_time,
                "p_external_activity_id": activity.external_activity_id,
                "p_notes": draft.get("notes") or "",
            },
        )
        status = result.data
        if status == "IMPORTED":
            sync_participant_mileage_km(participant_id)
            return "IMPORTED"
        if status == "ALREADY_IMPORTED":
            reconcile_existing_garmin(activity, member_id=member_id)
            return "ALREADY_IMPORTED"
        return "ALREADY_IMPORTED" if status else "SKIPPED"
    except Exception as exc:
        msg = str(exc).lower()
        if "duplicate" in msg or "23505" in msg or "unique" in msg:
            return "ALREADY_IMPORTED"
        raise


def count_garmin_rows(member_id: str, external_activity_id: str) -> int:
    client = get_supabase()
    result = (
        client.table("running_league_mileage_logs")
        .select("id", count="exact")
        .eq("member_id", member_id)
        .eq("source_app", "GARMIN")
        .eq("external_activity_id", external_activity_id)
        .execute()
    )
    if result.count is not None:
        return int(result.count)
    return len(result.data or [])
