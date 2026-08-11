"""
CLI: restore Garmin session from DB encrypted token and optionally import mileage.

Usage:
  python -m app.sync_member --member-id <UUID> --lookback-days 30
  python -m app.sync_member --member-id <UUID> --lookback-days 30 --import
  python -m app.sync_member --member-id <UUID> --import --repeat 10
  python -m app.sync_member --member-id <UUID> --ignore-local-tokens

Never asks for Garmin password. Does not use data/tokens when --ignore-local-tokens.
"""

from __future__ import annotations

import argparse
import os
import shutil
import sys
import tempfile
from concurrent.futures import ThreadPoolExecutor, as_completed
from pathlib import Path

from dotenv import load_dotenv

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from app.client import (  # noqa: E402
    GarminAuthError,
    default_lookback_range,
    fetch_activities_by_date,
    login_from_di_tokens,
)
from app.connections import (  # noqa: E402
    ActivityConnectionError,
    load_tokens_from_db,
    mark_connection_status,
)
from app.db import load_worker_env  # noqa: E402
from app.import_mileage import (  # noqa: E402
    count_garmin_rows,
    import_activity,
    resolve_portal_participant,
)
from app.normalize import normalize_activity  # noqa: E402


def mask_id(value: str) -> str:
    text = str(value)
    if len(text) <= 4:
        return "****"
    return f"...{text[-4:]}"


def main() -> int:
    load_worker_env()
    load_dotenv(ROOT / ".env")

    parser = argparse.ArgumentParser(description="Sync Garmin from DB encrypted tokens")
    parser.add_argument("--member-id", required=True)
    parser.add_argument("--lookback-days", type=int, default=30)
    parser.add_argument(
        "--import",
        dest="do_import",
        action="store_true",
        help="Insert running activities into running_league_mileage_logs",
    )
    parser.add_argument(
        "--repeat",
        type=int,
        default=1,
        help="Repeat import N times (idempotency test)",
    )
    parser.add_argument(
        "--parallel",
        type=int,
        default=0,
        help="If >0, run that many parallel import workers for first activity",
    )
    parser.add_argument(
        "--ignore-local-tokens",
        action="store_true",
        help="Do not read/write local data/tokens; prove DB-only restore",
    )
    parser.add_argument(
        "--skip-duplicate-check",
        action="store_true",
        help="Skip manual DUPLICATE_CANDIDATE gate (idempotency still enforced)",
    )
    args = parser.parse_args()
    member_id = args.member_id.strip()

    if args.ignore_local_tokens:
        # Point library away from default local store for this process
        os.environ["GARMIN_TOKEN_DIR"] = str(
            Path(tempfile.mkdtemp(prefix="garmin-db-restore-")).resolve()
        )

    print("Garmin DB Token Sync")
    print(f"member_id: {member_id}")
    print(f"ignore_local_tokens: {'YES' if args.ignore_local_tokens else 'NO'}")
    print("---")

    try:
        tokens = load_tokens_from_db(member_id)
        print("DB TOKEN DECRYPT: PASS")
    except ActivityConnectionError as exc:
        print(exc.code)
        print("DB TOKEN RESTORE: FAIL")
        return 1

    tmp: Path | None = None
    try:
        if args.ignore_local_tokens:
            tmp = Path(tempfile.mkdtemp(prefix="garmin-ephemeral-"))
            client = login_from_di_tokens(tokens, store_dir=tmp)
        else:
            client = login_from_di_tokens(tokens)
        print("DB TOKEN RESTORE: PASS")
        print("Password required: NO")
    except GarminAuthError as exc:
        mark_connection_status(member_id, error_code=exc.code)
        print(exc.code)
        print("DB TOKEN RESTORE: FAIL")
        return 1
    except Exception:
        mark_connection_status(member_id, error_code="TOKEN_RESTORE_FAILED")
        print("TOKEN_RESTORE_FAILED")
        print("DB TOKEN RESTORE: FAIL")
        return 1

    start, end = default_lookback_range(args.lookback_days)
    print(f"Range: {start} ~ {end} ({args.lookback_days} days)")

    try:
        raw = fetch_activities_by_date(
            client, start=start, end=end, activitytype="running"
        )
        mark_connection_status(member_id, success=True, synced=True)
        print("Garmin Fetch From DB Token: PASS")
        print(f"Running activities: {len(raw)}")
    except Exception as exc:
        name = type(exc).__name__
        code = "GARMIN_API_REJECTED" if ("429" in str(exc) or "TooMany" in name) else "FETCH_FAILED"
        mark_connection_status(member_id, error_code=code, status="ERROR")
        print(code)
        print("Garmin Fetch From DB Token: FAIL")
        # Isolation: do not raise into web app — worker exit only
        return 1
    finally:
        if tmp and tmp.exists():
            shutil.rmtree(tmp, ignore_errors=True)

    activities = []
    for row in raw:
        normalized = normalize_activity(row)
        if normalized:
            activities.append(normalized)
            print(
                f"  {normalized.started_at} | {normalized.distance_km} km | "
                f"{normalized.activity_type} | {mask_id(normalized.external_activity_id)}"
            )

    if not args.do_import:
        print("Import: SKIPPED (pass --import to write mileage)")
        return 0

    try:
        participant = resolve_portal_participant(member_id)
    except Exception:
        print("PARTICIPANT_NOT_FOUND")
        return 1

    print(
        f"participant_id: ...{str(participant['participant_id'])[-4:]} "
        f"league_id: ...{str(participant['league_id'])[-4:]}"
    )

    if args.parallel > 1 and activities:
        target = activities[0]
        print(f"Parallel import workers: {args.parallel}")

        def _once() -> str:
            return import_activity(
                target,
                member_id=member_id,
                participant_id=participant["participant_id"],
                league_id=participant["league_id"],
                check_manual_duplicates=not args.skip_duplicate_check,
            )

        results = []
        with ThreadPoolExecutor(max_workers=args.parallel) as pool:
            futures = [pool.submit(_once) for _ in range(args.parallel)]
            for fut in as_completed(futures):
                results.append(fut.result())
        print(f"Parallel results: {results}")
        n = count_garmin_rows(member_id, target.external_activity_id)
        print(f"DB rows for activity: {n}")
        print("Activity Idempotency (parallel): PASS" if n == 1 else "Activity Idempotency (parallel): FAIL")
        return 0 if n == 1 else 1

    statuses: list[str] = []
    for round_i in range(max(1, args.repeat)):
        print(f"Import round {round_i + 1}/{args.repeat}")
        for activity in activities:
            status = import_activity(
                activity,
                member_id=member_id,
                participant_id=participant["participant_id"],
                league_id=participant["league_id"],
                check_manual_duplicates=not args.skip_duplicate_check,
            )
            statuses.append(status)
            print(
                f"  {mask_id(activity.external_activity_id)} → {status} "
                f"({activity.distance_km} km)"
            )

    if activities and args.repeat >= 2:
        first = statuses[0] if statuses else None
        rest = statuses[1:]
        ok = first in {"IMPORTED", "ALREADY_IMPORTED", "DUPLICATE_CANDIDATE"} and all(
            s in {"ALREADY_IMPORTED", "DUPLICATE_CANDIDATE"} for s in rest
        )
        # If first was IMPORTED, rest must be ALREADY_IMPORTED (or same candidate)
        if first == "IMPORTED":
            ok = all(s == "ALREADY_IMPORTED" for s in rest)
        n = count_garmin_rows(member_id, activities[0].external_activity_id)
        print(f"DB rows for first activity: {n}")
        print("Activity Idempotency: PASS" if ok and n <= 1 else "Activity Idempotency: FAIL")

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
