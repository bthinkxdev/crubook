"""
Minimal Razorpay HTTP client (stdlib only).

Avoids the official SDK, which imports pkg_resources/setuptools
and breaks on lean Python 3.12 venvs.
"""

from __future__ import annotations

import base64
import hashlib
import hmac
import json
import urllib.error
import urllib.request
from typing import Any

from django.conf import settings
from django.core.exceptions import ImproperlyConfigured

API_BASE = "https://api.razorpay.com/v1"


def razorpay_configured() -> bool:
    return bool(settings.RAZORPAY_KEY_ID and settings.RAZORPAY_KEY_SECRET)


def _require_keys() -> tuple[str, str]:
    key_id = settings.RAZORPAY_KEY_ID
    key_secret = settings.RAZORPAY_KEY_SECRET
    if not key_id or not key_secret:
        raise ImproperlyConfigured(
            "Razorpay is not configured. Set RAZORPAY_KEY_ID and RAZORPAY_KEY_SECRET."
        )
    return key_id, key_secret


def _request(method: str, path: str, payload: dict[str, Any] | None = None) -> dict[str, Any]:
    key_id, key_secret = _require_keys()
    url = f"{API_BASE}{path}"
    data = None
    headers = {
        "Authorization": "Basic "
        + base64.b64encode(f"{key_id}:{key_secret}".encode()).decode(),
        "Content-Type": "application/json",
        "Accept": "application/json",
    }
    if payload is not None:
        data = json.dumps(payload).encode("utf-8")

    req = urllib.request.Request(url, data=data, headers=headers, method=method)
    try:
        with urllib.request.urlopen(req, timeout=30) as resp:
            body = resp.read().decode("utf-8")
            return json.loads(body) if body else {}
    except urllib.error.HTTPError as exc:
        detail = exc.read().decode("utf-8", errors="replace")
        raise RuntimeError(f"Razorpay API error ({exc.code}): {detail}") from exc


def create_order(
    *,
    amount_paise: int,
    currency: str = "INR",
    notes: dict[str, str] | None = None,
    payment_capture: int = 1,
) -> dict[str, Any]:
    return _request(
        "POST",
        "/orders",
        {
            "amount": amount_paise,
            "currency": currency,
            "payment_capture": payment_capture,
            "notes": notes or {},
        },
    )


def fetch_payment(payment_id: str) -> dict[str, Any]:
    return _request("GET", f"/payments/{payment_id}")


def verify_payment_signature(
    *,
    razorpay_order_id: str,
    razorpay_payment_id: str,
    razorpay_signature: str,
) -> bool:
    _, key_secret = _require_keys()
    message = f"{razorpay_order_id}|{razorpay_payment_id}".encode("utf-8")
    expected = hmac.new(
        key_secret.encode("utf-8"),
        message,
        hashlib.sha256,
    ).hexdigest()
    return hmac.compare_digest(expected, razorpay_signature)

