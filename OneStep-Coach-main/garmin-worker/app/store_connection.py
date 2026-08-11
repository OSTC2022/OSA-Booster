"""
CLI: encrypt local browser-bootstrap tokens → member_activity_connections.

Usage:
  python -m app.store_connection --member-id <UUID>

Reads data/tokens/garmin_tokens.json (or GARMIN_TOKEN_DIR).
Does NOT store Garmin password. Does NOT print token values.
"""

from __future__ import annotations

import argparse
import sys
from pathlib import Path

from dotenv import load_dotenv

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from app.client import token_dir  # noqa: E402
from app.connections import (  # noqa: E402
    ActivityConnectionError,
    read_local_token_file,
    upsert_encrypted_connection,
)
from app.crypto_tokens import TokenCryptoError, generate_encryption_key  # noqa: E402
from app.db import load_worker_env  # noqa: E402


def main() -> int:
    load_worker_env()
    load_dotenv(ROOT / ".env")

    parser = argparse.ArgumentParser(description="Store encrypted Garmin DI tokens for a member")
    parser.add_argument("--member-id", required=True, help="members.id UUID")
    parser.add_argument(
        "--generate-key",
        action="store_true",
        help="Print a new GARMIN_TOKEN_ENCRYPTION_KEY and exit",
    )
    args = parser.parse_args()

    if args.generate_key:
        print("GARMIN_TOKEN_ENCRYPTION_KEY (store server-only, never commit):")
        print(generate_encryption_key())
        return 0

    token_path = token_dir() / "garmin_tokens.json"
    if not token_path.is_file():
        print("TOKEN_FILE_MISSING")
        print("Run first: python -m app.browser_bootstrap")
        return 1

    try:
        tokens = read_local_token_file(token_path)
        meta = upsert_encrypted_connection(args.member_id, tokens)
    except (ActivityConnectionError, TokenCryptoError) as exc:
        print(getattr(exc, "code", type(exc).__name__))
        return 1
    except Exception as exc:
        print("CONNECTION_UPSERT_FAILED")
        print(type(exc).__name__)
        return 1

    print("TOKEN_ENCRYPT_SUCCESS")
    print("CONNECTION_SAVE_SUCCESS")
    print(f"member_id: {meta.get('member_id')}")
    print(f"provider: {meta.get('provider')}")
    print(f"status: {meta.get('status')}")
    print(f"token_format_version: {meta.get('token_format_version')}")
    print("Password stored: NO")
    print("Token plaintext logged: NO")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
