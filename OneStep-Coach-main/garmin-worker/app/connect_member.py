"""
ONE STEP Garmin Connector (member pairing).

Usage:
  python -m app.connect_member

Prompts for Connection Code from the web app (pairingCode-connectorSecret).
Opens Chromium for manual Garmin login. Posts DI tokens to the Next.js API
(HTTPS POST body). Never accepts --email/--password. Never embeds service_role.
"""

from __future__ import annotations

import json
import os
import sys
import tempfile
from pathlib import Path
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen

from dotenv import load_dotenv

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from app.browser_bootstrap import BootstrapError, bootstrap_garmin_auth  # noqa: E402
from app.client import login_from_di_tokens  # noqa: E402
from app.db import load_worker_env  # noqa: E402


def _api_base() -> str:
    return (
        os.getenv("ONE_STEP_API_BASE")
        or os.getenv("NEXT_PUBLIC_SITE_URL")
        or "http://localhost:3000"
    ).rstrip("/")


def _parse_connection_code(raw: str) -> tuple[str, str]:
    text = raw.strip().replace(" ", "")
    if "-" not in text:
        raise ValueError("INVALID_CODE_FORMAT")
    pairing, secret = text.split("-", 1)
    pairing = "".join(ch for ch in pairing if ch.isdigit())
    if len(pairing) != 6 or len(secret) < 16:
        raise ValueError("INVALID_CODE_FORMAT")
    return pairing, secret


def _post_json(path: str, payload: dict) -> dict:
    url = f"{_api_base()}{path}"
    data = json.dumps(payload).encode("utf-8")
    req = Request(
        url,
        data=data,
        headers={"Content-Type": "application/json", "Accept": "application/json"},
        method="POST",
    )
    try:
        with urlopen(req, timeout=60) as resp:
            body = resp.read().decode("utf-8")
            return json.loads(body) if body else {}
    except HTTPError as exc:
        try:
            err_body = exc.read().decode("utf-8")
            parsed = json.loads(err_body) if err_body else {}
        except Exception:
            parsed = {}
        code = parsed.get("error") or f"HTTP_{exc.code}"
        raise RuntimeError(code) from None
    except URLError:
        raise RuntimeError("API_UNREACHABLE") from None


def main() -> int:
    load_worker_env()
    load_dotenv(ROOT / ".env")

    print("ONE STEP Garmin Connector")
    print(f"API: {_api_base()}")
    print("Garmin password is never stored by One Step.")
    print("---")

    raw = input("Connection Code: ").strip()
    try:
        pairing_code, connector_secret = _parse_connection_code(raw)
    except ValueError:
        print("INVALID_CODE_FORMAT")
        print("웹에서 '코드 복사'한 전체 연결 코드를 붙여넣으세요.")
        return 1

    try:
        claim = _post_json(
            "/api/garmin/connector/claim",
            {"pairingCode": pairing_code, "connectorSecret": connector_secret},
        )
    except RuntimeError as exc:
        print(str(exc))
        print("CLAIM_FAILED")
        return 1

    if not claim.get("ok"):
        print(claim.get("error") or "CLAIM_DENIED")
        return 1

    session_id = str(claim.get("sessionId") or "")
    completion_token = str(claim.get("completionToken") or "")
    if not session_id or not completion_token:
        print("CLAIM_FAILED")
        return 1

    print("Session claimed.")
    try:
        _post_json(
            "/api/garmin/connector/complete",
            {
                "sessionId": session_id,
                "completionToken": completion_token,
                "phase": "authenticating",
            },
        )
    except RuntimeError:
        pass

    try:
        tokens = bootstrap_garmin_auth()
        print("BROWSER_LOGIN_SUCCESS")
    except BootstrapError as exc:
        print(exc.code)
        return 1

    # Light local validity check before upload (no password)
    tmp = Path(tempfile.mkdtemp(prefix="garmin-connect-"))
    try:
        client = login_from_di_tokens(tokens, store_dir=tmp)
        from datetime import date

        end = date.today().isoformat()
        client.get_activities_by_date(end, end, "running")
        print("TOKEN_VALIDATE: PASS")
    except Exception:
        print("TOKEN_VALIDATE: FAIL")
        return 1
    finally:
        try:
            for child in tmp.glob("*"):
                child.unlink(missing_ok=True)
            tmp.rmdir()
        except Exception:
            pass

    try:
        complete = _post_json(
            "/api/garmin/connector/complete",
            {
                "sessionId": session_id,
                "completionToken": completion_token,
                "phase": "complete",
                "tokens": {
                    "di_token": tokens["di_token"],
                    "di_refresh_token": tokens["di_refresh_token"],
                    "di_client_id": tokens.get("di_client_id") or "",
                },
            },
        )
    except RuntimeError as exc:
        print(str(exc))
        print("COMPLETE_FAILED")
        return 1

    if not complete.get("ok"):
        print(complete.get("error") or "COMPLETE_FAILED")
        return 1

    print("CONNECTION_COMPLETE")
    print("Garmin 연결이 완료되었습니다.")
    print("이 창을 닫아도 됩니다.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
