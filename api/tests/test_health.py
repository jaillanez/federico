from collections.abc import AsyncIterator

from httpx import AsyncClient

from app.db import get_session
from app.main import app


async def test_health_ok(client: AsyncClient) -> None:
    res = await client.get("/api/health")
    assert res.status_code == 200
    assert res.json() == {"status": "ok", "database": "ok"}


async def test_unknown_route_uses_error_format(client: AsyncClient) -> None:
    res = await client.get("/api/no-existe")
    assert res.status_code == 404
    body = res.json()
    assert body["error"]["code"] == "not_found"
    assert body["error"]["message"]
    assert body["error"]["fields"] == {}


async def test_health_reports_database_down(client: AsyncClient) -> None:
    class BrokenSession:
        async def execute(self, *_: object) -> None:
            raise ConnectionError("db down")

    async def broken() -> AsyncIterator[BrokenSession]:
        yield BrokenSession()

    app.dependency_overrides[get_session] = broken
    try:
        res = await client.get("/api/health")
    finally:
        app.dependency_overrides.clear()
    assert res.status_code == 503
    assert res.json() == {"status": "degraded", "database": "error"}
