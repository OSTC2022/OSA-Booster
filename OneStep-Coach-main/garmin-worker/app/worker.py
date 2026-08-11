"""
Long-running Garmin sync worker.

  python -m app.worker

- Token restore only (never password / browser bootstrap)
- Sequential members, staggered delays
- Global advisory lock + per-member lock
- Circuit breaker on HTTP 429
"""

from __future__ import annotations

import signal
import sys
import time
import uuid
from pathlib import Path

from dotenv import load_dotenv

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from app.circuit_breaker import heartbeat, is_provider_blocked  # noqa: E402
from app.db import load_worker_env  # noqa: E402
from app.locks import worker_lock  # noqa: E402
from app.scheduler import run_sync_tick  # noqa: E402
from app.sync_config import (  # noqa: E402
    is_garmin_sync_enabled,
    sync_interval_minutes,
    worker_tick_seconds,
)

_stop = False


def _handle_stop(_signum: int, _frame: object) -> None:
    global _stop
    _stop = True
    print("SHUTDOWN_REQUESTED")


def main() -> int:
    load_worker_env()
    load_dotenv(ROOT / ".env")

    # Fail fast on missing production secrets (never print values)
    import os

    if not (os.getenv("SUPABASE_URL") or os.getenv("NEXT_PUBLIC_SUPABASE_URL")):
        print("CONFIG_ERROR missing SUPABASE_URL")
        return 2
    if not os.getenv("SUPABASE_SERVICE_ROLE_KEY"):
        print("CONFIG_ERROR missing SUPABASE_SERVICE_ROLE_KEY")
        return 2
    if not (os.getenv("GARMIN_TOKEN_ENCRYPTION_KEY") or "").strip():
        print("CONFIG_ERROR missing GARMIN_TOKEN_ENCRYPTION_KEY")
        return 2

    instance_id = f"worker-{uuid.uuid4().hex[:10]}"
    tick = worker_tick_seconds()
    interval = sync_interval_minutes()
    sync_on = is_garmin_sync_enabled()
    print("ONE STEP Garmin Worker")
    print(f"instance: {instance_id}")
    print(f"tick_seconds: {tick}")
    print(f"sync_interval_minutes: {interval}")
    print(f"garmin_sync_enabled: {sync_on}")
    print("fresh_login: NO")
    print("browser_bootstrap: NO")
    print("local_token_file: NOT_USED (DB encrypted tokens only)")
    print("replica_policy: SINGLE (beta default)")
    print("---")

    signal.signal(signal.SIGINT, _handle_stop)
    signal.signal(signal.SIGTERM, _handle_stop)

    while not _stop:
        with worker_lock() as acquired:
            if not acquired:
                print("LOCK_BUSY skip_tick")
            else:
                try:
                    heartbeat(instance_id)
                except Exception:
                    print("HEARTBEAT_FAILED")
                if not is_garmin_sync_enabled():
                    print("GARMIN_SYNC_DISABLED emergency_stop")
                elif is_provider_blocked():
                    print("PROVIDER_RATE_LIMITED skip_garmin_calls")
                else:
                    try:
                        summary = run_sync_tick()
                        print(
                            "TICK",
                            f"manual={summary['manual']}",
                            f"auto={summary['auto']}",
                            f"imported={summary['imported']}",
                            f"blocked={summary['blocked']}",
                            f"rate_limited={summary['rate_limited']}",
                        )
                        for row in summary.get("results") or []:
                            print(f"  {row['source']} ...{row['member']} → {row['status']}")
                    except Exception:
                        # Isolate Garmin worker failures from web app
                        print("TICK_ERROR")

        # Sleep outside lock so other instances can acquire
        for _ in range(max(1, worker_tick_seconds())):
            if _stop:
                break
            time.sleep(1)

    print("WORKER_STOPPED")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
