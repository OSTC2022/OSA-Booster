"""member_activity_connections: encrypt + store / load + decrypt Garmin DI tokens."""

from __future__ import annotations

import json
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from app.crypto_tokens import (
    TOKEN_FORMAT_VERSION,
    TokenCryptoError,
    decrypt_token_payload,
    encrypt_token_payload,
)
from app.db import get_supabase

PROVIDER_GARMIN = "GARMIN"


class ActivityConnectionError(RuntimeError):
    def __init__(self, code: str, message: str = "") -> None:
        self.code = code
        super().__init__(message or code)


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def read_local_token_file(path: Path) -> dict[str, str]:
    data = json.loads(path.read_text(encoding="utf-8"))
    if not data.get("di_token") or not data.get("di_refresh_token"):
        raise ActivityConnectionError("TOKEN_FILE_INVALID")
    return {
        "di_token": str(data["di_token"]),
        "di_refresh_token": str(data["di_refresh_token"]),
        "di_client_id": str(data.get("di_client_id") or ""),
    }


def upsert_encrypted_connection(member_id: str, tokens: dict[str, str]) -> dict[str, Any]:
    """Encrypt DI tokens and upsert member_activity_connections (no password)."""
    try:
        ciphertext, version = encrypt_token_payload(tokens)
    except TokenCryptoError as exc:
        raise ActivityConnectionError(exc.code) from None

    now = _now_iso()
    row = {
        "member_id": member_id,
        "provider": PROVIDER_GARMIN,
        "status": "CONNECTED",
        "encrypted_token": ciphertext,
        "token_format_version": version,
        "connected_at": now,
        "last_error_code": None,
        "last_error_at": None,
        "updated_at": now,
    }
    client = get_supabase()
    result = (
        client.table("member_activity_connections")
        .upsert(row, on_conflict="member_id,provider")
        .execute()
    )
    data = (result.data or [None])[0]
    if not data:
        raise ActivityConnectionError("CONNECTION_UPSERT_FAILED")
    # Never return encrypted_token to callers that might print
    return {
        "id": data.get("id"),
        "member_id": data.get("member_id"),
        "provider": data.get("provider"),
        "status": data.get("status"),
        "token_format_version": data.get("token_format_version"),
        "connected_at": data.get("connected_at"),
    }


def fetch_connection_row(member_id: str) -> dict[str, Any]:
    client = get_supabase()
    result = (
        client.table("member_activity_connections")
        .select(
            "id, member_id, provider, status, encrypted_token, token_format_version, "
            "connected_at, last_sync_at, last_success_at, last_error_code"
        )
        .eq("member_id", member_id)
        .eq("provider", PROVIDER_GARMIN)
        .limit(1)
        .execute()
    )
    rows = result.data or []
    if not rows:
        raise ActivityConnectionError("CONNECTION_NOT_FOUND")
    return rows[0]


def load_tokens_from_db(member_id: str) -> dict[str, str]:
    row = fetch_connection_row(member_id)
    if row.get("status") == "REAUTH_REQUIRED":
        raise ActivityConnectionError("REAUTH_REQUIRED")
    try:
        return decrypt_token_payload(
            str(row["encrypted_token"]),
            token_format_version=int(row.get("token_format_version") or TOKEN_FORMAT_VERSION),
        )
    except TokenCryptoError as exc:
        raise ActivityConnectionError(exc.code) from None


def mark_connection_status(
    member_id: str,
    *,
    status: str | None = None,
    error_code: str | None = None,
    success: bool = False,
    synced: bool = False,
) -> None:
    patch: dict[str, Any] = {"updated_at": _now_iso()}
    if status:
        patch["status"] = status
    if synced:
        patch["last_sync_at"] = _now_iso()
    if success:
        patch["last_success_at"] = _now_iso()
        patch["status"] = "CONNECTED"
        patch["last_error_code"] = None
        patch["last_error_at"] = None
    if error_code:
        patch["last_error_code"] = error_code
        patch["last_error_at"] = _now_iso()
        if status is None and error_code in {"REAUTH_REQUIRED", "TOKEN_RESTORE_FAILED"}:
            patch["status"] = "REAUTH_REQUIRED"
        elif status is None:
            patch["status"] = "ERROR"

    client = get_supabase()
    client.table("member_activity_connections").update(patch).eq(
        "member_id", member_id
    ).eq("provider", PROVIDER_GARMIN).execute()


def write_temp_tokenstore(tokens: dict[str, str], directory: Path) -> Path:
    """Write library-compatible garmin_tokens.json into an ephemeral directory."""
    directory.mkdir(parents=True, exist_ok=True)
    path = directory / "garmin_tokens.json"
    path.write_text(
        json.dumps(
            {
                "di_token": tokens["di_token"],
                "di_refresh_token": tokens["di_refresh_token"],
                "di_client_id": tokens.get("di_client_id") or "",
            }
        ),
        encoding="utf-8",
    )
    return directory
