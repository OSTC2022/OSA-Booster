"""Unit tests for browser bootstrap helpers (no network / no Playwright launch)."""

from __future__ import annotations

import tempfile
import unittest
from unittest.mock import patch

from app.browser_bootstrap import (
    _extract_ticket_from_text,
    _extract_ticket_from_url,
    _try_parse_di_token_payload,
)
from app.client import GarminAuthError, login_with_token_reuse, tokens_present


class BrowserBootstrapHelpersTests(unittest.TestCase):
    def test_extract_ticket_from_url(self) -> None:
        url = "https://sso.garmin.com/sso/embed?ticket=ST-abc123-XYZ&foo=1"
        self.assertEqual(_extract_ticket_from_url(url), "ST-abc123-XYZ")

    def test_extract_ticket_from_html(self) -> None:
        html = '<script>var t="ticket=ST-hello-world-99";</script>'
        self.assertEqual(_extract_ticket_from_text(html), "ST-hello-world-99")

    def test_parse_di_payload(self) -> None:
        parsed = _try_parse_di_token_payload(
            {
                "access_token": "aaa",
                "refresh_token": "bbb",
                "client_id": "GARMIN_CONNECT_MOBILE_ANDROID_DI",
            }
        )
        assert parsed is not None
        self.assertEqual(parsed["di_token"], "aaa")
        self.assertEqual(parsed["di_refresh_token"], "bbb")

    def test_parse_di_payload_rejects_incomplete(self) -> None:
        self.assertIsNone(_try_parse_di_token_payload({"access_token": "only"}))

    def test_token_only_fetch_refuses_missing_store(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            with patch.dict("os.environ", {"GARMIN_TOKEN_DIR": tmp}):
                self.assertFalse(tokens_present())
                with self.assertRaises(GarminAuthError) as ctx:
                    login_with_token_reuse(allow_credential_fallback=False)
                self.assertEqual(ctx.exception.code, "TOKEN_MISSING")


if __name__ == "__main__":
    unittest.main()
