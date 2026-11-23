"""Static site regeneration. Publishing calls `request_rebuild()`; requests arriving within
REBUILD_DELAY_SECONDS are grouped into a single webhook call.

State lives in this process (the API runs a single worker). A restart loses at most one pending
rebuild; the next publication or the scheduled task (phase 5) catches up.
"""

import asyncio
import logging
from dataclasses import dataclass
from datetime import UTC, datetime, timedelta

import httpx

from app.config import get_settings

log = logging.getLogger(__name__)


@dataclass
class RebuildStatus:
    pending: bool
    scheduled_for: datetime | None
    last_run_at: datetime | None
    last_ok: bool | None
    configured: bool


class Rebuilder:
    def __init__(self) -> None:
        self._task: asyncio.Task[None] | None = None
        self._scheduled_for: datetime | None = None
        self._last_run_at: datetime | None = None
        self._last_ok: bool | None = None
        self.transport: httpx.AsyncBaseTransport | None = None  # tests inject one

    def status(self) -> RebuildStatus:
        pending = self._task is not None and not self._task.done()
        return RebuildStatus(
            pending=pending,
            scheduled_for=self._scheduled_for if pending else None,
            last_run_at=self._last_run_at,
            last_ok=self._last_ok,
            configured=bool(get_settings().rebuild_webhook_url),
        )

    def request(self) -> RebuildStatus:
        """Schedule a rebuild (or join the one already pending)."""
        if self._task is None or self._task.done():
            delay = get_settings().rebuild_delay_seconds
            self._scheduled_for = datetime.now(UTC) + timedelta(seconds=delay)
            self._task = asyncio.create_task(self._run(delay))
        return self.status()

    async def wait(self) -> None:
        if self._task is not None:
            await self._task

    async def _run(self, delay: float) -> None:
        await asyncio.sleep(delay)
        s = get_settings()
        self._last_run_at = datetime.now(UTC)
        if not s.rebuild_webhook_url:
            log.info("rebuild requested but REBUILD_WEBHOOK_URL is not set")
            self._last_ok = None
            return
        headers = {}
        if token := s.rebuild_webhook_token.get_secret_value():
            headers["Authorization"] = f"Bearer {token}"
        try:
            async with httpx.AsyncClient(timeout=30, transport=self.transport) as http:
                res = await http.post(s.rebuild_webhook_url, headers=headers)
                res.raise_for_status()
            self._last_ok = True
            log.info("rebuild triggered")
        except httpx.HTTPError:
            self._last_ok = False
            log.exception("rebuild webhook failed")


rebuilder = Rebuilder()


def request_rebuild() -> RebuildStatus:
    return rebuilder.request()
