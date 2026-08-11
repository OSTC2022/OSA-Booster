"""Core single-member Garmin sync (token restore only — never fresh login)."""

from __future__ import annotations

import tempfile
from dataclasses import dataclass, field
from datetime import date
from pathlib import Path
from typing import Any, Literal

from app.circuit_breaker import trip_rate_limit
from app.client import GarminAuthError, fetch_activities_by_date, login_from_di_tokens
from app.connections import ActivityConnectionError, load_tokens_from_db, mark_connection_status
from app.crypto_tokens import TokenCryptoError
from app.db import get_supabase
from app.import_mileage import import_activity, resolve_portal_participant, sync_participant_mileage_km
from app.normalize import normalize_activity
from app.sync_config import PROVIDER, compute_next_sync_at, resolve_fetch_window, utcnow

SyncStatus = Literal[
    "SUCCESS",
    "PARTIAL",
    "FAILED",
    "RATE_LIMITED",
    "REAUTH_REQUIRED",
    "SKIPPED",
]


@dataclass
class SyncResult:
    status: SyncStatus
    fetched_count: int = 0
    running_count: int = 0
    imported_count: int = 0
    duplicate_count: int = 0
    candidate_count: int = 0
    added_distance_km: float = 0.0
    error_code: str | None = None
    trigger_source: str = "AUTO"
    details: list[str] = field(default_factory=list)


def _is_rate_limit(exc: BaseException) -> bool:
    name = type(exc).__name__
    text = str(exc)
    return "429" in text or "TooMany" in name or "RATE_LIMIT" in text.upper()


def _is_auth_failure(exc: BaseException) -> bool:
    name = type(exc).__name__.lower()
    text = str(exc).lower()
    return (
        "auth" in name
        or "401" in text
        or "403" in text
        or "not authenticated" in text
        or "token" in text and "reject" in text
    )


def start_sync_run(member_id: str, trigger_source: str) -> str | None:
    client = get_supabase()
    result = (
        client.table("garmin_sync_runs")
        .insert(
            {
                "member_id": member_id,
                "provider": PROVIDER,
                "trigger_source": trigger_source,
                "status": "RUNNING",
                "started_at": utcnow().isoformat(),
            }
        )
        .select("id")
        .execute()
    )
    rows = result.data or []
    return str(rows[0]["id"]) if rows else None


def finish_sync_run(run_id: str | None, result: SyncResult) -> None:
    if not run_id:
        return
    client = get_supabase()
    client.table("garmin_sync_runs").update(
        {
            "finished_at": utcnow().isoformat(),
            "status": result.status,
            "fetched_count": result.fetched_count,
            "running_count": result.running_count,
            "imported_count": result.imported_count,
            "duplicate_count": result.duplicate_count,
            "candidate_count": result.candidate_count,
            "added_distance_km": round(result.added_distance_km, 2),
            "error_code": result.error_code,
        }
    ).eq("id", run_id).execute()


def update_connection_after_sync(
    member_id: str,
    result: SyncResult,
    *,
    connection_row: dict[str, Any],
) -> None:
    client = get_supabase()
    failures = int(connection_row.get("consecutive_failures") or 0)
    patch: dict[str, Any] = {
        "last_sync_at": utcnow().isoformat(),
        "updated_at": utcnow().isoformat(),
        "last_import_summary": {
            "status": result.status,
            "imported": result.imported_count,
            "duplicates": result.duplicate_count,
            "candidates": result.candidate_count,
            "added_km": result.added_distance_km,
        },
    }

    if result.status in {"SUCCESS", "PARTIAL"}:
        patch["last_success_at"] = utcnow().isoformat()
        patch["status"] = "CONNECTED"
        patch["last_error_code"] = None
        patch["last_error_at"] = None
        patch["consecutive_failures"] = 0
        patch["initial_sync_done"] = True
        if result.imported_count > 0:
            patch["last_imported_at"] = utcnow().isoformat()
        patch["next_sync_at"] = compute_next_sync_at(failures=0).isoformat()
    elif result.status == "REAUTH_REQUIRED":
        patch["status"] = "REAUTH_REQUIRED"
        patch["last_error_code"] = result.error_code or "REAUTH_REQUIRED"
        patch["last_error_at"] = utcnow().isoformat()
        patch["consecutive_failures"] = failures + 1
        # Do not schedule automatic retries until reauth
        patch["next_sync_at"] = None
    elif result.status == "RATE_LIMITED":
        patch["last_error_code"] = result.error_code or "HTTP_429"
        patch["last_error_at"] = utcnow().isoformat()
        patch["consecutive_failures"] = failures + 1
        patch["next_sync_at"] = compute_next_sync_at(failures=patch["consecutive_failures"]).isoformat()
    else:
        patch["status"] = "ERROR"
        patch["last_error_code"] = result.error_code or "SYNC_FAILED"
        patch["last_error_at"] = utcnow().isoformat()
        patch["consecutive_failures"] = failures + 1
        patch["next_sync_at"] = compute_next_sync_at(
            failures=patch["consecutive_failures"]
        ).isoformat()

    client.table("member_activity_connections").update(patch).eq(
        "member_id", member_id
    ).eq("provider", PROVIDER).execute()


def sync_member(
    member_id: str,
    *,
    trigger_source: str = "AUTO",
    connection_row: dict[str, Any] | None = None,
) -> SyncResult:
    """
    Sync one member using DB encrypted tokens only.
    Never prompts for password / never runs SSO credential strategies.
    """
    client = get_supabase()
    if connection_row is None:
        res = (
            client.table("member_activity_connections")
            .select("*")
            .eq("member_id", member_id)
            .eq("provider", PROVIDER)
            .limit(1)
            .execute()
        )
        rows = res.data or []
        if not rows:
            return SyncResult(status="SKIPPED", error_code="CONNECTION_NOT_FOUND", trigger_source=trigger_source)
        connection_row = rows[0]

    status = str(connection_row.get("status") or "")
    if status in {"DISCONNECTED", "REAUTH_REQUIRED"} and trigger_source == "AUTO":
        return SyncResult(status="SKIPPED", error_code=status, trigger_source=trigger_source)

    if trigger_source == "AUTO" and connection_row.get("auto_sync_paused"):
        return SyncResult(status="SKIPPED", error_code="AUTO_SYNC_PAUSED", trigger_source=trigger_source)

    run_id = start_sync_run(member_id, trigger_source)
    result = SyncResult(status="FAILED", trigger_source=trigger_source)

    try:
        tokens = load_tokens_from_db(member_id)
    except ActivityConnectionError as exc:
        code = exc.code
        if code in {"TOKEN_DECRYPT_FAILED", "ENCRYPTION_KEY_MISSING", "TOKEN_FORMAT_UNSUPPORTED"}:
            result = SyncResult(status="FAILED", error_code=code, trigger_source=trigger_source)
        elif code == "REAUTH_REQUIRED":
            result = SyncResult(status="REAUTH_REQUIRED", error_code=code, trigger_source=trigger_source)
        else:
            result = SyncResult(status="REAUTH_REQUIRED", error_code=code, trigger_source=trigger_source)
        finish_sync_run(run_id, result)
        update_connection_after_sync(member_id, result, connection_row=connection_row)
        return result
    except TokenCryptoError as exc:
        result = SyncResult(status="FAILED", error_code=exc.code, trigger_source=trigger_source)
        finish_sync_run(run_id, result)
        update_connection_after_sync(member_id, result, connection_row=connection_row)
        return result

    tmp = Path(tempfile.mkdtemp(prefix="garmin-autosync-"))
    try:
        garmin = login_from_di_tokens(tokens, store_dir=tmp)
    except GarminAuthError as exc:
        result = SyncResult(status="REAUTH_REQUIRED", error_code=exc.code, trigger_source=trigger_source)
        finish_sync_run(run_id, result)
        update_connection_after_sync(member_id, result, connection_row=connection_row)
        return result
    except Exception:
        result = SyncResult(status="FAILED", error_code="TOKEN_RESTORE_FAILED", trigger_source=trigger_source)
        finish_sync_run(run_id, result)
        update_connection_after_sync(member_id, result, connection_row=connection_row)
        return result

    initial_done = bool(connection_row.get("initial_sync_done"))
    start_s, end_s = resolve_fetch_window(initial_sync_done=initial_done)

    try:
        raw = fetch_activities_by_date(
            garmin,
            start=date.fromisoformat(start_s),
            end=date.fromisoformat(end_s),
            activitytype="running",
        )
    except Exception as exc:
        if _is_rate_limit(exc):
            trip_rate_limit("HTTP_429")
            result = SyncResult(status="RATE_LIMITED", error_code="HTTP_429", trigger_source=trigger_source)
        elif _is_auth_failure(exc):
            result = SyncResult(status="REAUTH_REQUIRED", error_code="GARMIN_AUTH_REJECTED", trigger_source=trigger_source)
        else:
            result = SyncResult(status="FAILED", error_code=type(exc).__name__, trigger_source=trigger_source)
        finish_sync_run(run_id, result)
        update_connection_after_sync(member_id, result, connection_row=connection_row)
        return result
    finally:
        try:
            for child in tmp.glob("*"):
                child.unlink(missing_ok=True)
            tmp.rmdir()
        except Exception:
            pass

    result.fetched_count = len(raw or [])
    activities = []
    for row in raw or []:
        normalized = normalize_activity(row)
        if normalized:
            activities.append(normalized)
    result.running_count = len(activities)

    try:
        participant = resolve_portal_participant(member_id)
    except Exception:
        result.status = "FAILED"
        result.error_code = "PARTICIPANT_NOT_FOUND"
        finish_sync_run(run_id, result)
        update_connection_after_sync(member_id, result, connection_row=connection_row)
        return result

    for activity in activities:
        # Skip invalid distances (normalize already requires >0, double-check)
        if activity.distance_km <= 0:
            continue
        try:
            status = import_activity(
                activity,
                member_id=member_id,
                participant_id=participant["participant_id"],
                league_id=participant["league_id"],
                check_manual_duplicates=True,
            )
        except Exception as exc:
            if _is_rate_limit(exc):
                trip_rate_limit("HTTP_429")
                result.status = "RATE_LIMITED"
                result.error_code = "HTTP_429"
                finish_sync_run(run_id, result)
                update_connection_after_sync(member_id, result, connection_row=connection_row)
                return result
            result.details.append(f"activity_error:{type(exc).__name__}")
            continue

        if status == "IMPORTED":
            result.imported_count += 1
            result.added_distance_km += float(activity.distance_km)
        elif status == "ALREADY_IMPORTED":
            result.duplicate_count += 1
        elif status == "DUPLICATE_CANDIDATE":
            result.candidate_count += 1
        elif status == "SKIPPED":
            # KEEP_MANUAL / resolved ignore — no mileage change
            result.duplicate_count += 1

    if result.imported_count > 0:
        try:
            sync_participant_mileage_km(participant["participant_id"])
        except Exception:
            pass

    if result.candidate_count > 0 and result.imported_count >= 0:
        result.status = "PARTIAL" if result.candidate_count > 0 else "SUCCESS"
    else:
        result.status = "SUCCESS"

    # PARTIAL when candidates present; SUCCESS when clean (including 0 new)
    if result.candidate_count > 0:
        result.status = "PARTIAL"

    finish_sync_run(run_id, result)
    update_connection_after_sync(member_id, result, connection_row=connection_row)
    return result
