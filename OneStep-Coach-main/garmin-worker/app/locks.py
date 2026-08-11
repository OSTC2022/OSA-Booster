"""PostgreSQL advisory locks via SECURITY DEFINER RPCs."""

from __future__ import annotations

from contextlib import contextmanager
from typing import Iterator

from app.db import get_supabase, rpc
from app.sync_config import WORKER_LOCK_KEY


def try_worker_lock() -> bool:
    result = rpc("try_garmin_worker_lock", {"p_lock_key": WORKER_LOCK_KEY})
    return bool(result.data)


def release_worker_lock() -> None:
    try:
        rpc("release_garmin_worker_lock", {"p_lock_key": WORKER_LOCK_KEY})
    except Exception:
        pass


def try_member_lock(member_id: str) -> bool:
    result = rpc("try_garmin_member_lock", {"p_member_id": member_id})
    return bool(result.data)


def release_member_lock(member_id: str) -> None:
    try:
        rpc("release_garmin_member_lock", {"p_member_id": member_id})
    except Exception:
        pass


@contextmanager
def worker_lock() -> Iterator[bool]:
    acquired = try_worker_lock()
    try:
        yield acquired
    finally:
        if acquired:
            release_worker_lock()


@contextmanager
def member_lock(member_id: str) -> Iterator[bool]:
    acquired = try_member_lock(member_id)
    try:
        yield acquired
    finally:
        if acquired:
            release_member_lock(member_id)
