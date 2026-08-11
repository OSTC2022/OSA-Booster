"""Dry-run duplicate diagnostic — never deletes or mutates mileage."""

from __future__ import annotations

from collections import defaultdict

from app.db import get_supabase, load_worker_env
from app.duplicate import find_duplicate_candidate


def main() -> None:
    load_worker_env()
    client = get_supabase()

    garmin = (
        client.table("running_league_mileage_logs")
        .select(
            "id, member_id, distance_km, logged_at, activity_time, external_activity_id, source_app"
        )
        .eq("source_app", "GARMIN")
        .not_.is_("external_activity_id", "null")
        .limit(5000)
        .execute()
    ).data or []

    # Exact Garmin duplicates
    exact_key_counts: dict[tuple[str, str], int] = defaultdict(int)
    for row in garmin:
        key = (str(row["member_id"]), str(row["external_activity_id"]))
        exact_key_counts[key] += 1
    exact_dups = sum(1 for n in exact_key_counts.values() if n > 1)

    # Potential manual duplicates (sample: compare each Garmin to same-day manuals)
    potential = 0
    members = {str(r["member_id"]) for r in garmin}
    for member_id in list(members)[:200]:
        manuals = (
            client.table("running_league_mileage_logs")
            .select(
                "id, distance_km, logged_at, activity_time, source_app, external_activity_id"
            )
            .eq("member_id", member_id)
            .limit(500)
            .execute()
        ).data or []
        for g in [r for r in garmin if str(r["member_id"]) == member_id]:
            day = str(g["logged_at"])[:10]
            day_logs = [r for r in manuals if str(r.get("logged_at") or "")[:10] == day]
            c = find_duplicate_candidate(
                garmin_distance_km=float(g["distance_km"]),
                garmin_logged_at=day,
                garmin_activity_time=str(g["activity_time"]) if g.get("activity_time") else None,
                existing_logs=day_logs,
            )
            if c:
                potential += 1

    print("=== Garmin duplicate dry-run (no mutations) ===")
    print(f"Garmin rows scanned: {len(garmin)}")
    print(f"Exact Garmin duplicate keys (>1 row): {exact_dups}")
    print(f"Potential manual/Garmin candidates (heuristic): {potential}")
    print("Auto delete: NO")


if __name__ == "__main__":
    main()
