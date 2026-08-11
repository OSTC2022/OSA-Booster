"""Worker sync configuration (env-driven, single place)."""

from __future__ import annotations

import os
import random
from datetime import datetime, timedelta, timezone


def _int(name: str, default: int) -> int:
    raw = (os.getenv(name) or "").strip()
    if not raw:
        return default
    try:
        return int(raw)
    except ValueError:
        return default


def _float(name: str, default: float) -> float:
    raw = (os.getenv(name) or "").strip()
    if not raw:
        return default
    try:
        return float(raw)
    except ValueError:
        return default


def _bool(name: str, default: bool = True) -> bool:
    raw = (os.getenv(name) or "").strip().lower()
    if not raw:
        return default
    if raw in {"1", "true", "yes", "on"}:
        return True
    if raw in {"0", "false", "no", "off"}:
        return False
    return default


# Emergency stop / beta gate (no code deploy required to pause Garmin calls)
# GARMIN_SYNC_ENABLED=false → worker ticks but skips all Garmin API calls
def is_garmin_sync_enabled() -> bool:
    return _bool("GARMIN_SYNC_ENABLED", True)


def is_garmin_beta_enabled() -> bool:
    """Soft beta flag for ops/UI; worker Garmin calls use is_garmin_sync_enabled()."""
    return _bool("GARMIN_BETA_ENABLED", True)


# Worker loop tick (seconds) — prefer getenv helpers after dotenv load
def worker_tick_seconds() -> int:
    return _int("GARMIN_WORKER_TICK_SECONDS", 60)


def sync_interval_minutes() -> int:
    return _int("GARMIN_SYNC_INTERVAL_MINUTES", 120)


WORKER_TICK_SECONDS = worker_tick_seconds()
SYNC_INTERVAL_MINUTES = sync_interval_minutes()

# Delay between members in one tick
MEMBER_DELAY_SECONDS = _float("GARMIN_SYNC_MEMBER_DELAY_SECONDS", 5.0)
MEMBER_DELAY_JITTER_SECONDS = _float("GARMIN_SYNC_MEMBER_DELAY_JITTER_SECONDS", 3.0)

# Incremental fetch window after first sync
INCREMENTAL_LOOKBACK_DAYS = _int("GARMIN_INCREMENTAL_LOOKBACK_DAYS", 3)

# Initial import: current month (no ACTIVE season table yet) capped
INITIAL_IMPORT_MAX_DAYS = _int("GARMIN_INITIAL_IMPORT_MAX_DAYS", 62)

# Manual sync cooldown
MANUAL_SYNC_COOLDOWN_MINUTES = _int("GARMIN_MANUAL_SYNC_COOLDOWN_MINUTES", 5)

# Provider circuit breaker after 429
RATE_LIMIT_COOLDOWN_MINUTES = _int("GARMIN_RATE_LIMIT_COOLDOWN_MINUTES", 120)

# Max members processed per tick
MAX_MEMBERS_PER_TICK = _int("GARMIN_MAX_MEMBERS_PER_TICK", 3)

# Backoff caps
BACKOFF_BASE_MINUTES = _int("GARMIN_BACKOFF_BASE_MINUTES", 15)
BACKOFF_MAX_MINUTES = _int("GARMIN_BACKOFF_MAX_MINUTES", 360)

PROVIDER = "GARMIN"
WORKER_LOCK_KEY = 9134001


def utcnow() -> datetime:
    return datetime.now(timezone.utc)


def compute_next_sync_at(
    *,
    base: datetime | None = None,
    failures: int = 0,
    interval_minutes: int | None = None,
) -> datetime:
    """Schedule next sync with jitter; apply exponential backoff on failures."""
    now = base or utcnow()
    interval = interval_minutes if interval_minutes is not None else SYNC_INTERVAL_MINUTES
    if failures > 0:
        # 15, 30, 60, ... capped
        mins = min(BACKOFF_MAX_MINUTES, BACKOFF_BASE_MINUTES * (2 ** max(0, failures - 1)))
        interval = max(interval, mins)
    jitter = random.uniform(0, max(1.0, interval * 0.08)) * 60  # up to ~8% of interval
    return now + timedelta(minutes=interval, seconds=jitter)


def member_delay_sleep_seconds() -> float:
    return max(0.0, MEMBER_DELAY_SECONDS + random.uniform(0, MEMBER_DELAY_JITTER_SECONDS))


def resolve_fetch_window(
    *,
    initial_sync_done: bool,
    now: datetime | None = None,
) -> tuple[str, str]:
    """
    Returns (start_date, end_date) ISO dates for Garmin fetch.
    No ACTIVE season table in this repo yet → month start capped by max days.
    """
    end = now or utcnow()
    end_date = end.date()
    if not initial_sync_done:
        month_start = end_date.replace(day=1)
        earliest = end_date - timedelta(days=max(1, INITIAL_IMPORT_MAX_DAYS))
        start = month_start if month_start >= earliest else earliest
    else:
        start = end_date - timedelta(days=max(1, INCREMENTAL_LOOKBACK_DAYS))
    return start.isoformat(), end_date.isoformat()
