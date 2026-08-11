"""Select due Garmin members and run sequential syncs (one tick or once)."""

from __future__ import annotations

import time
from typing import Any

from app.circuit_breaker import is_provider_blocked
from app.db import get_supabase
from app.locks import member_lock
from app.sync_config import (
    MAX_MEMBERS_PER_TICK,
    PROVIDER,
    is_garmin_sync_enabled,
    member_delay_sleep_seconds,
    utcnow,
)
from app.sync_core import SyncResult, sync_member

HEALTH_PRIMARY_PROVIDERS = frozenset({"APPLE_HEALTH", "HEALTH_CONNECT"})


def filter_auto_due_rows(
    rows: list[dict[str, Any]],
    members: list[dict[str, Any]] | None = None,
) -> list[dict[str, Any]]:
    """Skip paused AUTO sync and members whose primary is Health Bridge."""
    out = [row for row in rows if not row.get("auto_sync_paused")]
    if not members:
        return out
    health_primary = {
        str(row.get("id"))
        for row in members
        if str(row.get("preferred_activity_sync_provider") or "") in HEALTH_PRIMARY_PROVIDERS
    }
    if not health_primary:
        return out
    return [row for row in out if str(row.get("member_id")) not in health_primary]


def list_due_connections(limit: int = MAX_MEMBERS_PER_TICK) -> list[dict[str, Any]]:
    client = get_supabase()
    now = utcnow().isoformat()
    result = (
        client.table("member_activity_connections")
        .select("*")
        .eq("provider", PROVIDER)
        .eq("status", "CONNECTED")
        .or_(f"next_sync_at.is.null,next_sync_at.lte.{now}")
        .order("next_sync_at", desc=False, nullsfirst=True)
        .limit(limit)
        .execute()
    )
    rows = list(result.data or [])
    member_ids = [str(row.get("member_id") or "") for row in rows if row.get("member_id")]
    members: list[dict[str, Any]] = []
    if member_ids:
        try:
            member_res = (
                client.table("members")
                .select("id, preferred_activity_sync_provider")
                .in_("id", member_ids)
                .execute()
            )
            members = list(member_res.data or [])
        except Exception:
            members = []
    return filter_auto_due_rows(rows, members)


def list_pending_manual_requests(limit: int = MAX_MEMBERS_PER_TICK) -> list[dict[str, Any]]:
    client = get_supabase()
    result = (
        client.table("activity_sync_requests")
        .select("*")
        .eq("provider", PROVIDER)
        .eq("status", "PENDING")
        .order("requested_at", desc=False)
        .limit(limit)
        .execute()
    )
    return list(result.data or [])


def _mark_request(request_id: str, **patch: Any) -> None:
    client = get_supabase()
    client.table("activity_sync_requests").update(patch).eq("id", request_id).execute()


def process_manual_request(row: dict[str, Any]) -> SyncResult:
    request_id = str(row["id"])
    member_id = str(row["member_id"])
    _mark_request(
        request_id,
        status="RUNNING",
        started_at=utcnow().isoformat(),
    )
    with member_lock(member_id) as acquired:
        if not acquired:
            _mark_request(
                request_id,
                status="PENDING",
                error_code="MEMBER_BUSY",
            )
            return SyncResult(status="SKIPPED", error_code="MEMBER_BUSY", trigger_source="MANUAL")
        result = sync_member(member_id, trigger_source="MANUAL")
    _mark_request(
        request_id,
        status="SUCCESS" if result.status in {"SUCCESS", "PARTIAL"} else "FAILED",
        completed_at=utcnow().isoformat(),
        error_code=result.error_code,
        result_summary={
            "status": result.status,
            "imported": result.imported_count,
            "duplicates": result.duplicate_count,
            "candidates": result.candidate_count,
            "added_km": result.added_distance_km,
        },
    )
    return result


def run_sync_tick(*, max_members: int = MAX_MEMBERS_PER_TICK) -> dict[str, Any]:
    """
    One scheduler tick:
    1) Manual PENDING requests (priority)
    2) Due CONNECTED members
    Stops early on RATE_LIMITED.
    """
    summary: dict[str, Any] = {
        "manual": 0,
        "auto": 0,
        "imported": 0,
        "rate_limited": False,
        "blocked": False,
        "results": [],
    }

    if not is_garmin_sync_enabled():
        summary["blocked"] = True
        summary["disabled"] = True
        return summary

    if is_provider_blocked():
        summary["blocked"] = True
        return summary

    # Manual first
    for req in list_pending_manual_requests(limit=max_members):
        if is_provider_blocked():
            summary["blocked"] = True
            summary["rate_limited"] = True
            break
        result = process_manual_request(req)
        summary["manual"] += 1
        summary["imported"] += result.imported_count
        summary["results"].append(
            {"member": str(req["member_id"])[-6:], "source": "MANUAL", "status": result.status}
        )
        if result.status == "RATE_LIMITED":
            summary["rate_limited"] = True
            break
        time.sleep(member_delay_sleep_seconds())

    if summary["rate_limited"] or is_provider_blocked():
        return summary

    remaining = max(0, max_members - summary["manual"])
    for conn in list_due_connections(limit=remaining):
        if is_provider_blocked():
            summary["blocked"] = True
            summary["rate_limited"] = True
            break
        member_id = str(conn["member_id"])
        with member_lock(member_id) as acquired:
            if not acquired:
                summary["results"].append(
                    {"member": member_id[-6:], "source": "AUTO", "status": "SKIPPED_BUSY"}
                )
                continue
            result = sync_member(member_id, trigger_source="AUTO", connection_row=conn)
        summary["auto"] += 1
        summary["imported"] += result.imported_count
        summary["results"].append(
            {"member": member_id[-6:], "source": "AUTO", "status": result.status}
        )
        if result.status == "RATE_LIMITED":
            summary["rate_limited"] = True
            break
        time.sleep(member_delay_sleep_seconds())

    return summary
