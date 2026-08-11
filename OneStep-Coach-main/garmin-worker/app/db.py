"""Supabase service-role client for Garmin worker (server-only)."""

from __future__ import annotations

import os
from functools import lru_cache
from pathlib import Path
from typing import Any

from dotenv import load_dotenv

ROOT = Path(__file__).resolve().parents[1]
REPO_ROOT = ROOT.parent


def load_worker_env() -> None:
    """Load garmin-worker/.env then repo .env.local (does not override existing)."""
    load_dotenv(ROOT / ".env")
    load_dotenv(REPO_ROOT / ".env.local")


def service_supabase_config() -> tuple[str, str]:
    load_worker_env()
    url = (os.getenv("SUPABASE_URL") or os.getenv("NEXT_PUBLIC_SUPABASE_URL") or "").strip()
    key = (os.getenv("SUPABASE_SERVICE_ROLE_KEY") or "").strip()
    if not url or not key:
        raise RuntimeError(
            "SUPABASE_URL/NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY required"
        )
    if key.startswith("eyJ") is False and "service" not in key.lower():
        # Soft check — still allow; never print key
        pass
    return url, key


@lru_cache(maxsize=1)
def get_supabase():
    from supabase import create_client

    url, key = service_supabase_config()
    return create_client(url, key)


def rpc(name: str, params: dict[str, Any]) -> Any:
    client = get_supabase()
    return client.rpc(name, params).execute()
