"""Server-side verification of Cloudflare Turnstile tokens. The client-side
widget alone proves nothing -- a bot can just skip calling the JS. The token
it produces must be verified against Cloudflare's API using the secret key
on every signup/login attempt for this to actually block anything."""
import httpx

from app.core.config import settings

VERIFY_URL = "https://challenges.cloudflare.com/turnstile/v0/siteverify"


async def verify_turnstile(token: str | None, remote_ip: str | None = None) -> bool:
    if not settings.turnstile_secret_key:
        # Not configured (e.g. local dev without a key set) -- fail open
        # only in debug mode, never in production.
        return settings.debug
    if not token:
        return False

    async with httpx.AsyncClient(timeout=5.0) as client:
        resp = await client.post(VERIFY_URL, data={
            "secret": settings.turnstile_secret_key,
            "response": token,
            **({"remoteip": remote_ip} if remote_ip else {}),
        })
    return resp.json().get("success", False)
