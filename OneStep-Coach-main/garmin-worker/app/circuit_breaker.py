"""Provider circuit breaker + heartbeat (no secrets logged)."""

from __future__ import annotations

from datetime import timedelta
from typing import Any

from app.db import get_supabase
from app.sync_config import PROVIDER, RATE_LIMIT_COOLDOWN_MINUTES, utcnow


def get_provider_state() -> dict[str, Any]:
    client = get_supabase()
    result = (
        client.table("activity_provider_sync_state")
        .select("*")
        .eq("provider", PROVIDER)
        .limit(1)
        .execute()
    )
    rows = result.data or []
    if not rows:
        client.table("activity_provider_sync_state").upsert(
            {"provider": PROVIDER, "status": "NORMAL", "updated_at": utcnow().isoformat()}
        ).execute()
        return {"provider": PROVIDER, "status": "NORMAL"}
    return rows[0]


def is_provider_blocked() -> bool:
    state = get_provider_state()
    if state.get("status") != "RATE_LIMITED":
        return False
    blocked_until = state.get("blocked_until")
    if not blocked_until:
        return True
    try:
        # Handle Z suffix
        text = str(blocked_until).replace("Z", "+00:00")
        from datetime import datetime

        until = datetime.fromisoformat(text)
        if until.tzinfo is None:
            from datetime import timezone

            until = until.replace(tzinfo=timezone.utc)
        if until <= utcnow():
            # Auto clear
            clear_rate_limit()
            return False
        return True
    except Exception:
        return True


def trip_rate_limit(error_code: str = "HTTP_429") -> None:
    until = utcnow() + timedelta(minutes=RATE_LIMIT_COOLDOWN_MINUTES)
    client = get_supabase()
    client.table("activity_provider_sync_state").upsert(
        {
            "provider": PROVIDER,
            "status": "RATE_LIMITED",
            "blocked_until": until.isoformat(),
            "last_rate_limit_at": utcnow().isoformat(),
            "last_error_code": error_code,
            "updated_at": utcnow().isoformat(),
        }
    ).execute()


def clear_rate_limit() -> None:
    client = get_supabase()
    client.table("activity_provider_sync_state").upsert(
        {
            "provider": PROVIDER,
            "status": "NORMAL",
            "blocked_until": None,
            "last_error_code": None,
            "updated_at": utcnow().isoformat(),
        }
    ).execute()


def heartbeat(instance_id: str) -> None:
    client = get_supabase()
    client.table("activity_provider_sync_state").upsert(
        {
            "provider": PROVIDER,
            "last_worker_heartbeat": utcnow().isoformat(),
            "worker_instance_id": instance_id[:80],
            "updated_at": utcnow().isoformat(),
        }
    ).execute()
