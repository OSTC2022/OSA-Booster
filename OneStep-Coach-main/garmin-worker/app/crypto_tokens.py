"""Authenticated encryption for Garmin DI token payloads.

v1 = Fernet (local worker encrypt)
v2 = AES-256-GCM (Next.js connector complete endpoint)
"""

from __future__ import annotations

import base64
import hashlib
import json
import os
from typing import Any

from cryptography.fernet import Fernet, InvalidToken
from cryptography.hazmat.primitives.ciphers.aead import AESGCM

TOKEN_FORMAT_VERSION = 1
TOKEN_FORMAT_VERSION_AES_GCM = 2


class TokenCryptoError(RuntimeError):
    def __init__(self, code: str, message: str = "") -> None:
        self.code = code
        super().__init__(message or code)


def _raw_key_material() -> bytes:
    raw = (os.getenv("GARMIN_TOKEN_ENCRYPTION_KEY") or "").strip()
    if not raw:
        raise TokenCryptoError(
            "ENCRYPTION_KEY_MISSING",
            "Set GARMIN_TOKEN_ENCRYPTION_KEY (server-only, never NEXT_PUBLIC).",
        )
    for decoder in ("base64url", "base64"):
        try:
            if decoder == "base64url":
                pad = "=" * (-len(raw) % 4)
                decoded = base64.urlsafe_b64decode(raw + pad)
            else:
                decoded = base64.b64decode(raw)
            if len(decoded) == 32:
                return decoded
        except Exception:
            continue
    return hashlib.sha256(raw.encode("utf-8")).digest()


def _fernet_from_env() -> Fernet:
    raw = (os.getenv("GARMIN_TOKEN_ENCRYPTION_KEY") or "").strip()
    if not raw:
        raise TokenCryptoError("ENCRYPTION_KEY_MISSING")
    try:
        return Fernet(raw.encode("ascii"))
    except Exception:
        digest = hashlib.sha256(raw.encode("utf-8")).digest()
        return Fernet(base64.urlsafe_b64encode(digest))


def generate_encryption_key() -> str:
    return Fernet.generate_key().decode("ascii")


def serialize_di_tokens(tokens: dict[str, Any]) -> str:
    payload = {
        "di_token": str(tokens.get("di_token") or ""),
        "di_refresh_token": str(tokens.get("di_refresh_token") or ""),
        "di_client_id": str(tokens.get("di_client_id") or ""),
    }
    if not payload["di_token"] or not payload["di_refresh_token"]:
        raise TokenCryptoError("TOKEN_PAYLOAD_INVALID")
    return json.dumps(payload, separators=(",", ":"), sort_keys=True)


def encrypt_token_payload(tokens: dict[str, Any]) -> tuple[str, int]:
    plaintext = serialize_di_tokens(tokens)
    cipher = _fernet_from_env().encrypt(plaintext.encode("utf-8")).decode("ascii")
    return cipher, TOKEN_FORMAT_VERSION


def _decrypt_aes_gcm(ciphertext: str) -> dict[str, str]:
    key = _raw_key_material()
    try:
        pad = "=" * (-len(ciphertext) % 4)
        packed = base64.urlsafe_b64decode(ciphertext + pad)
    except Exception:
        raise TokenCryptoError("TOKEN_DECRYPT_FAILED") from None
    if len(packed) < 12 + 16 + 1:
        raise TokenCryptoError("TOKEN_DECRYPT_FAILED")
    nonce = packed[:12]
    tag = packed[-16:]
    data = packed[12:-16]
    try:
        plain = AESGCM(key).decrypt(nonce, data + tag, None).decode("utf-8")
    except Exception:
        raise TokenCryptoError("TOKEN_DECRYPT_FAILED") from None
    try:
        parsed = json.loads(plain)
    except json.JSONDecodeError:
        raise TokenCryptoError("TOKEN_PAYLOAD_INVALID") from None
    out = {
        "di_token": str(parsed.get("di_token") or ""),
        "di_refresh_token": str(parsed.get("di_refresh_token") or ""),
        "di_client_id": str(parsed.get("di_client_id") or ""),
    }
    if not out["di_token"] or not out["di_refresh_token"]:
        raise TokenCryptoError("TOKEN_PAYLOAD_INVALID")
    return out


def decrypt_token_payload(
    ciphertext: str,
    *,
    token_format_version: int = TOKEN_FORMAT_VERSION,
) -> dict[str, str]:
    if token_format_version == TOKEN_FORMAT_VERSION_AES_GCM:
        return _decrypt_aes_gcm(ciphertext)
    if token_format_version != TOKEN_FORMAT_VERSION:
        raise TokenCryptoError("TOKEN_FORMAT_UNSUPPORTED")
    try:
        plain = _fernet_from_env().decrypt(ciphertext.encode("ascii")).decode("utf-8")
    except InvalidToken:
        raise TokenCryptoError("TOKEN_DECRYPT_FAILED") from None
    except Exception:
        raise TokenCryptoError("TOKEN_DECRYPT_FAILED") from None

    try:
        data = json.loads(plain)
    except json.JSONDecodeError:
        raise TokenCryptoError("TOKEN_PAYLOAD_INVALID") from None

    out = {
        "di_token": str(data.get("di_token") or ""),
        "di_refresh_token": str(data.get("di_refresh_token") or ""),
        "di_client_id": str(data.get("di_client_id") or ""),
    }
    if not out["di_token"] or not out["di_refresh_token"]:
        raise TokenCryptoError("TOKEN_PAYLOAD_INVALID")
    return out
