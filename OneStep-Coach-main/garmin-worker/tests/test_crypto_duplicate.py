"""Unit tests for token crypto + duplicate candidates (no network)."""

from __future__ import annotations

import os
import unittest
from unittest.mock import patch

from cryptography.fernet import Fernet

from app.crypto_tokens import (
    TokenCryptoError,
    decrypt_token_payload,
    encrypt_token_payload,
    generate_encryption_key,
)
from app.duplicate import distance_threshold_km, find_duplicate_candidate


class CryptoTokenTests(unittest.TestCase):
    def test_roundtrip(self) -> None:
        key = generate_encryption_key()
        with patch.dict(os.environ, {"GARMIN_TOKEN_ENCRYPTION_KEY": key}):
            cipher, version = encrypt_token_payload(
                {
                    "di_token": "access-aaa",
                    "di_refresh_token": "refresh-bbb",
                    "di_client_id": "client-ccc",
                }
            )
            self.assertEqual(version, 1)
            self.assertNotIn("access-aaa", cipher)
            out = decrypt_token_payload(cipher, token_format_version=version)
            self.assertEqual(out["di_token"], "access-aaa")
            self.assertEqual(out["di_refresh_token"], "refresh-bbb")

    def test_missing_key(self) -> None:
        with patch.dict(os.environ, {"GARMIN_TOKEN_ENCRYPTION_KEY": ""}, clear=False):
            os.environ.pop("GARMIN_TOKEN_ENCRYPTION_KEY", None)
            with self.assertRaises(TokenCryptoError) as ctx:
                encrypt_token_payload(
                    {"di_token": "a", "di_refresh_token": "b", "di_client_id": "c"}
                )
            self.assertEqual(ctx.exception.code, "ENCRYPTION_KEY_MISSING")

    def test_aes_gcm_v2_roundtrip_compat_shape(self) -> None:
        # Python-side AES-GCM encrypt/decrypt using same key derivation as Node
        from cryptography.hazmat.primitives.ciphers.aead import AESGCM
        import base64
        import json
        import os
        from unittest.mock import patch
        from app.crypto_tokens import _raw_key_material, decrypt_token_payload

        key = generate_encryption_key()
        with patch.dict(os.environ, {"GARMIN_TOKEN_ENCRYPTION_KEY": key}):
            material = _raw_key_material()
            nonce = os.urandom(12)
            plain = json.dumps(
                {"di_token": "a", "di_refresh_token": "b", "di_client_id": "c"},
                separators=(",", ":"),
                sort_keys=True,
            ).encode()
            # cryptography AESGCM returns ciphertext||tag
            ct = AESGCM(material).encrypt(nonce, plain, None)
            packed = base64.urlsafe_b64encode(nonce + ct).decode("ascii").rstrip("=")
            out = decrypt_token_payload(packed, token_format_version=2)
            self.assertEqual(out["di_token"], "a")


class DuplicateCandidateTests(unittest.TestCase):
    def test_threshold(self) -> None:
        self.assertEqual(distance_threshold_km(4.13), max(0.3, 4.13 * 0.05))

    def test_near_manual_same_day(self) -> None:
        candidate = find_duplicate_candidate(
            garmin_distance_km=4.13,
            garmin_logged_at="2026-07-13",
            garmin_activity_time="16:54:06",
            existing_logs=[
                {
                    "id": "log-1",
                    "distance_km": 4.1,
                    "logged_at": "2026-07-13",
                    "activity_time": "16:50:00",
                    "source": "manual",
                    "source_app": None,
                    "external_activity_id": None,
                }
            ],
        )
        assert candidate is not None
        self.assertEqual(candidate.existing_log_id, "log-1")
        self.assertIn("same_day", candidate.reason)

    def test_far_distance_not_candidate(self) -> None:
        candidate = find_duplicate_candidate(
            garmin_distance_km=4.13,
            garmin_logged_at="2026-07-13",
            garmin_activity_time="16:54:06",
            existing_logs=[
                {
                    "id": "log-2",
                    "distance_km": 10.0,
                    "logged_at": "2026-07-13",
                    "activity_time": "16:50:00",
                    "source": "manual",
                }
            ],
        )
        self.assertIsNone(candidate)

    def test_skips_existing_garmin_row(self) -> None:
        candidate = find_duplicate_candidate(
            garmin_distance_km=4.13,
            garmin_logged_at="2026-07-13",
            garmin_activity_time="16:54:06",
            existing_logs=[
                {
                    "id": "g-1",
                    "distance_km": 4.13,
                    "logged_at": "2026-07-13",
                    "activity_time": "16:54:06",
                    "source": "import",
                    "source_app": "GARMIN",
                    "external_activity_id": "999",
                }
            ],
        )
        self.assertIsNone(candidate)


if __name__ == "__main__":
    unittest.main()
