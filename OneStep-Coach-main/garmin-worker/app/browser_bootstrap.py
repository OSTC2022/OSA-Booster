"""
Browser bootstrap for Garmin auth (headed Playwright).

User logs in manually in Chromium. We capture a service ticket and/or DI OAuth
tokens, then write python-garminconnect-compatible garmin_tokens.json.

Never auto-fills password. Never logs tokens/cookies.
"""

from __future__ import annotations

import re
import sys
import time
from pathlib import Path
from typing import Any
from urllib.parse import parse_qs, urlparse

from dotenv import load_dotenv

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from app.client import token_dir  # noqa: E402

# Match SSO service used by the embed widget (ticket is bound to this URL).
SSO_EMBED_SERVICE = "https://sso.garmin.com/sso/embed"
SSO_EMBED_URL = (
    "https://sso.garmin.com/sso/embed"
    "?id=gauth-widget"
    "&embedWidget=true"
    "&gauthHost=https://sso.garmin.com/sso"
    "&clientId=GarminConnect"
    "&locale=en_US"
    "&redirectAfterAccountLoginUrl=https://sso.garmin.com/sso/embed"
    f"&service={SSO_EMBED_SERVICE}"
)

TICKET_RE = re.compile(r"(ST-[A-Za-z0-9\-]+)")
MAX_WAIT_SECONDS = 300


class BootstrapError(RuntimeError):
    def __init__(self, code: str, message: str = "") -> None:
        self.code = code
        super().__init__(message or code)


def _extract_ticket_from_text(text: str) -> str | None:
    if "ticket=" in text:
        m = re.search(r"ticket=(ST-[A-Za-z0-9\-]+)", text)
        if m:
            return m.group(1)
    m = TICKET_RE.search(text)
    if m and "ST-" in m.group(1):
        # Prefer only explicit ticket= matches for safety
        return None
    return None


def _extract_ticket_from_url(url: str) -> str | None:
    parsed = urlparse(url)
    qs = parse_qs(parsed.query)
    ticket_vals = qs.get("ticket") or []
    if ticket_vals:
        value = ticket_vals[0]
        if value.startswith("ST-"):
            return value
    return _extract_ticket_from_text(url)


def _try_parse_di_token_payload(payload: dict[str, Any]) -> dict[str, str] | None:
    access = payload.get("access_token")
    refresh = payload.get("refresh_token")
    if not access or not refresh:
        return None
    client_id = payload.get("client_id")
    if not client_id:
        # python-garminconnect extracts client_id from JWT; leave empty for loads path
        client_id = ""
    return {
        "di_token": str(access),
        "di_refresh_token": str(refresh),
        "di_client_id": str(client_id) if client_id else "",
    }


def capture_auth_via_browser() -> dict[str, Any]:
    """
    Open headed Chromium. User completes Garmin login / MFA / Cloudflare manually.
    Returns dict with either di tokens and/or service_ticket (+ service_url).
    """
    try:
        from playwright.sync_api import sync_playwright
    except ImportError as exc:
        raise BootstrapError(
            "PLAYWRIGHT_MISSING",
            "playwright not installed. Run: pip install playwright && playwright install chromium",
        ) from exc

    ticket: str | None = None
    di_tokens: dict[str, str] | None = None
    cloudflare_seen = False

    print("Garmin Browser Bootstrap")
    print("Opening Garmin login...")
    print("Log in in the browser window (email / password / MFA / Cloudflare if shown).")
    print("Do not paste credentials into the terminal.")
    print("---")

    with sync_playwright() as playwright:
        browser = playwright.chromium.launch(headless=False)
        context = browser.new_context()
        page = context.new_page()

        def on_response(response: Any) -> None:
            nonlocal di_tokens, cloudflare_seen
            try:
                url = response.url
                if "challenges.cloudflare.com" in url or response.status == 403:
                    cloudflare_seen = True
                if "diauth.garmin.com" in url and "/oauth/token" in url:
                    if response.status != 200:
                        return
                    data = response.json()
                    parsed = _try_parse_di_token_payload(data if isinstance(data, dict) else {})
                    if parsed:
                        di_tokens = parsed
            except Exception:
                # Never print response bodies
                return

        page.on("response", on_response)
        page.goto(SSO_EMBED_URL, wait_until="domcontentloaded")

        deadline = time.time() + MAX_WAIT_SECONDS
        while time.time() < deadline:
            if di_tokens:
                break
            try:
                ticket = _extract_ticket_from_url(page.url) or ticket
                if not ticket:
                    content = page.content()
                    ticket = _extract_ticket_from_text(content) or ticket
            except Exception:
                pass
            if ticket:
                break
            page.wait_for_timeout(500)

        browser.close()

    if di_tokens:
        return {
            "mode": "di_network",
            "tokens": di_tokens,
            "cloudflare_seen": cloudflare_seen,
        }
    if ticket:
        return {
            "mode": "service_ticket",
            "service_ticket": ticket,
            "service_url": SSO_EMBED_SERVICE,
            "cloudflare_seen": cloudflare_seen,
        }
    raise BootstrapError("BROWSER_LOGIN_NOT_COMPLETED")


def exchange_ticket_for_di_tokens(service_ticket: str, service_url: str) -> dict[str, str]:
    """Use python-garminconnect Client._exchange_service_ticket (no credential login)."""
    from garminconnect.client import Client
    from garminconnect.exceptions import GarminConnectTooManyRequestsError

    client = Client()
    try:
        client._exchange_service_ticket(service_ticket, service_url=service_url)
    except GarminConnectTooManyRequestsError:
        raise BootstrapError("GARMIN_API_REJECTED", "429") from None
    except Exception as exc:
        raise BootstrapError("TOKEN_CAPTURE_FAILED", type(exc).__name__) from None

    if not client.di_token or not client.di_refresh_token:
        raise BootstrapError("TOKEN_CAPTURE_FAILED")

    return {
        "di_token": str(client.di_token),
        "di_refresh_token": str(client.di_refresh_token),
        "di_client_id": str(client.di_client_id or ""),
    }


def bootstrap_garmin_auth() -> dict[str, str]:
    """
    Shared browser bootstrap used by browser_bootstrap + connect_member.
    Returns DI token dict. Never logs token values. Never auto-fills password.
    """
    captured = capture_auth_via_browser()
    if captured["mode"] == "di_network":
        tokens = captured["tokens"]
    else:
        tokens = exchange_ticket_for_di_tokens(
            captured["service_ticket"],
            captured["service_url"],
        )
    if not tokens.get("di_token") or not tokens.get("di_refresh_token"):
        raise BootstrapError("TOKEN_CAPTURE_FAILED")
    return {
        "di_token": str(tokens["di_token"]),
        "di_refresh_token": str(tokens["di_refresh_token"]),
        "di_client_id": str(tokens.get("di_client_id") or ""),
    }


def write_token_store(tokens: dict[str, str]) -> Path:
    """Write garminconnect-compatible garmin_tokens.json via Client.dump (values never printed)."""
    if not tokens.get("di_token") or not tokens.get("di_refresh_token"):
        raise BootstrapError("TOKEN_CAPTURE_FAILED")

    from garminconnect.client import Client

    client = Client()
    client.di_token = tokens["di_token"]
    client.di_refresh_token = tokens["di_refresh_token"]
    client.di_client_id = tokens.get("di_client_id") or None
    if not client.di_client_id:
        extracted = client._extract_client_id_from_jwt(tokens["di_token"])
        if extracted:
            client.di_client_id = extracted

    store = str(token_dir())
    client.dump(store)
    return token_dir() / "garmin_tokens.json"


def verify_token_restore() -> None:
    """Load tokens without credential login strategies; light API probe."""
    from app.client import login_token_only

    try:
        client = login_token_only()
    except Exception as exc:
        code = getattr(exc, "code", None) or "TOKEN_RESTORE_FAILED"
        if code == "TOKEN_MISSING":
            raise BootstrapError("TOKEN_RESTORE_FAILED") from None
        raise BootstrapError("TOKEN_RESTORE_FAILED", type(exc).__name__) from None

    # Prefer library's token validation (profile) when available
    try:
        if hasattr(client.client, "_verify_token"):
            ok = client.client._verify_token()
            if ok is False:
                raise BootstrapError("TOKEN_RESTORE_FAILED")
            return
    except BootstrapError:
        raise
    except Exception:
        pass

    try:
        from datetime import date

        end = date.today().isoformat()
        client.get_activities_by_date(end, end, "running")
    except Exception as exc:
        name = type(exc).__name__
        if "429" in str(exc) or "TooMany" in name:
            raise BootstrapError("GARMIN_API_REJECTED", "429") from None
        msg = str(exc).lower()
        if "auth" in msg or "401" in msg or "403" in msg:
            raise BootstrapError("TOKEN_RESTORE_FAILED", name) from None


def main() -> int:
    load_dotenv(ROOT / ".env")
    try:
        tokens = bootstrap_garmin_auth()
        print("BROWSER_LOGIN_SUCCESS")
        print("Token format: DI OAuth (browser bootstrap)")

        write_token_store(tokens)
        print("TOKEN_CAPTURE_SUCCESS")
        print("Authentication captured: YES")
        print("Token store path: data/tokens (relative)")
        print("Token store created: YES")

        verify_token_restore()
        print("TOKEN_RESTORE_SUCCESS")
        print("---")
        print("Next (new process, no password):")
        print("  python -m app.fetch_running")
        return 0
    except BootstrapError as exc:
        print(exc.code)
        if exc.code == "BROWSER_LOGIN_NOT_COMPLETED":
            print("AUTH_NOT_COMPLETED")
        print("Garmin sync failed")
        return 1
    except Exception:
        print("TOKEN_CAPTURE_FAILED")
        print("Garmin sync failed")
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
