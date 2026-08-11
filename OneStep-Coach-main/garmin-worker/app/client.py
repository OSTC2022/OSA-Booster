"""Garmin Connect client wrapper — token reuse first, credential strategies retained."""

from __future__ import annotations

import getpass
import os
from datetime import date, timedelta
from pathlib import Path
from typing import Any

from garminconnect import Garmin


class GarminAuthError(RuntimeError):
    def __init__(self, code: str, message: str = "") -> None:
        self.code = code
        super().__init__(message or code)


def token_dir() -> Path:
    raw = os.getenv("GARMIN_TOKEN_DIR", "./data/tokens")
    path = Path(raw).expanduser().resolve()
    path.mkdir(parents=True, exist_ok=True)
    return path


def token_store_relative() -> str:
    """Relative path for reports only — never print token contents."""
    try:
        return str(token_dir().relative_to(Path.cwd()))
    except ValueError:
        return "data/tokens"


def tokens_present() -> bool:
    """True if garmin_tokens.json exists (contents never read/logged here)."""
    return (token_dir() / "garmin_tokens.json").is_file()


def prompt_mfa() -> str:
    # Interactive MFA — never log / never persist the code
    return input("Garmin MFA code: ").strip()


def resolve_credentials() -> tuple[str, str]:
    """
    Credential path retained for recovery only (not used by fetch_running after bootstrap).

    Priority:
      1) GARMIN_EMAIL + GARMIN_PASSWORD env
      2) interactive input + getpass
    Password is never written to disk by this function.
    """
    email = (os.getenv("GARMIN_EMAIL") or "").strip()
    password = os.getenv("GARMIN_PASSWORD") or ""

    if email and password:
        return email, password

    if not email:
        email = input("Garmin email: ").strip()
    if not password:
        password = getpass.getpass("Garmin password: ")

    if not email or not password:
        raise GarminAuthError(
            "CREDENTIALS_REQUIRED",
            "Garmin email and password are required for credential login.",
        )

    return email, password


def login_from_di_tokens(tokens: dict[str, str], *, store_dir: Path | None = None) -> Garmin:
    """
    Restore Garmin client from in-memory DI tokens (DB decrypt path).
    Never prompts for password / never runs credential strategies.
    """
    from garminconnect.client import Client

    client = Garmin("token-reuse", "", prompt_mfa=prompt_mfa)
    underlying: Client = client.client
    underlying.di_token = tokens.get("di_token")
    underlying.di_refresh_token = tokens.get("di_refresh_token")
    underlying.di_client_id = tokens.get("di_client_id") or None
    if not underlying.is_authenticated:
        raise GarminAuthError("TOKEN_RESTORE_FAILED")

    if store_dir is not None:
        store_dir.mkdir(parents=True, exist_ok=True)
        underlying._tokenstore_path = str(store_dir)
        try:
            if underlying.di_refresh_token and underlying._token_expires_soon():
                underlying._refresh_session()
            underlying.dump(str(store_dir))
        except Exception:
            pass
    else:
        try:
            if underlying.di_refresh_token and underlying._token_expires_soon():
                underlying._refresh_session()
        except Exception:
            pass
    return client


def login_token_only() -> Garmin:
    """
    Restore DI tokens from store. Never runs mobile/widget/portal credential login.

    If tokens are missing/invalid → raise with code directing user to browser_bootstrap.
    """
    if not tokens_present():
        raise GarminAuthError(
            "TOKEN_MISSING",
            "No token store. Run: python -m app.browser_bootstrap",
        )

    store = str(token_dir())
    client = Garmin("token-reuse", "", prompt_mfa=prompt_mfa)
    try:
        client.client.load(store)
        client.client._tokenstore_path = store
        if not client.client.is_authenticated:
            raise GarminAuthError("TOKEN_RESTORE_FAILED")
        # Proactive refresh uses DI refresh_token only — no SSO login endpoints.
        try:
            if getattr(client.client, "di_refresh_token", None):
                if (
                    hasattr(client.client, "_token_expires_soon")
                    and client.client._token_expires_soon()
                ):
                    client.client._refresh_session()
                    client.client.dump(store)
        except Exception:
            # Keep loaded access token; fetch may still succeed or fail clearly later
            pass
        return client
    except GarminAuthError:
        raise
    except Exception:
        raise GarminAuthError("TOKEN_RESTORE_FAILED") from None


def login_with_token_reuse(
    *,
    allow_credential_fallback: bool = True,
) -> tuple[Garmin, bool]:
    """
    Returns (client, token_reused).

    1) If token store exists → restore tokens only (no password, no SSO login strategies).
    2) Else if allow_credential_fallback → env/interactive credentials + library strategies.
    3) Else → TOKEN_MISSING (direct user to browser_bootstrap).

    fetch_running must call with allow_credential_fallback=False to avoid 429 loops.
    """
    if tokens_present():
        return login_token_only(), True

    if not allow_credential_fallback:
        raise GarminAuthError(
            "TOKEN_MISSING",
            "No token store. Run: python -m app.browser_bootstrap",
        )

    store = str(token_dir())
    email, password = resolve_credentials()
    client = Garmin(email, password, prompt_mfa=prompt_mfa)
    try:
        client.login(store)
    except Exception as exc:
        raise GarminAuthError("LOGIN_FAILED", type(exc).__name__) from None

    return client, False


def fetch_activities_by_date(
    client: Garmin,
    *,
    start: date,
    end: date,
    activitytype: str | None = "running",
) -> list[dict[str, Any]]:
    """
    Documented method:
      Garmin.get_activities_by_date(startdate, enddate, activitytype=...)
    """
    return client.get_activities_by_date(
        start.isoformat(),
        end.isoformat(),
        activitytype,
    )


def default_lookback_range(days: int = 7) -> tuple[date, date]:
    end = date.today()
    start = end - timedelta(days=max(1, days))
    return start, end
