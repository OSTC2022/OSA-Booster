"""
One-shot due-member sync (cron-friendly).

  python -m app.sync_all
  python -m app.sync_all --once
"""

from __future__ import annotations

import argparse
import sys
from pathlib import Path

from dotenv import load_dotenv

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from app.circuit_breaker import heartbeat, is_provider_blocked  # noqa: E402
from app.db import load_worker_env  # noqa: E402
from app.locks import worker_lock  # noqa: E402
from app.scheduler import run_sync_tick  # noqa: E402


def main() -> int:
    load_worker_env()
    load_dotenv(ROOT / ".env")

    parser = argparse.ArgumentParser(description="Sync due Garmin members once")
    parser.add_argument("--max-members", type=int, default=None)
    args = parser.parse_args()

    print("Garmin sync_all (one tick)")
    print("fresh_login: NO")

    with worker_lock() as acquired:
        if not acquired:
            print("LOCK_BUSY")
            return 0
        heartbeat("sync-all")
        if is_provider_blocked():
            print("PROVIDER_RATE_LIMITED")
            return 0
        kwargs = {}
        if args.max_members is not None:
            kwargs["max_members"] = args.max_members
        summary = run_sync_tick(**kwargs)
        print(
            f"manual={summary['manual']} auto={summary['auto']} "
            f"imported={summary['imported']} rate_limited={summary['rate_limited']}"
        )
        for row in summary.get("results") or []:
            print(f"  {row['source']} ...{row['member']} → {row['status']}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
