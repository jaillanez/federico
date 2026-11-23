"""Cloudflare Turnstile verification (invisible captcha)."""

import logging

import httpx

from app.config import get_settings

log = logging.getLogger(__name__)
VERIFY_URL = "https://challenges.cloudflare.com/turnstile/v0/siteverify"


async def verify_turnstile(
    token: str | None, ip: str | None, transport: httpx.AsyncBaseTransport | None = None
) -> bool:
    secret = get_settings().turnstile_secret_key.get_secret_value()
    if not secret:
        # Only reachable outside production (enforced in Settings.check_secure).
        return True
    if not token:
        return False
    data = {"secret": secret, "response": token}
    if ip:
        data["remoteip"] = ip
    try:
        async with httpx.AsyncClient(timeout=10, transport=transport) as http:
            res = await http.post(VERIFY_URL, data=data)
            res.raise_for_status()
            return bool(res.json().get("success"))
    except (httpx.HTTPError, ValueError):
        log.warning("turnstile verification failed (network or invalid response)")
        return False
