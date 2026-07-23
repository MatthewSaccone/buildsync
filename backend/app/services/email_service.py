"""Minimal email sending shim. Defaults to logging to the console so local
dev doesn't need SMTP configured; swap in real SMTP/provider calls here
when you're ready to actually deliver mail."""

import logging

logger = logging.getLogger("buildsync.email")


def send_password_reset_email(to_email: str, raw_token: str) -> None:
    # In production this would build a reset URL from a FRONTEND_URL setting
    # and send via SMTP or a provider (SES, Postmark, etc). For now it logs,
    # which is enough to test the flow end-to-end locally.
    logger.info("PASSWORD RESET for %s — token: %s", to_email, raw_token)
    print(f"[email] Password reset for {to_email}: token={raw_token}")