"""Every /api/admin route: 401 without a session; editors cannot reach leads or settings.

Routes are discovered from the app, so a new admin route is covered automatically.
"""

import re
import uuid

import pytest
from fastapi.routing import APIRoute
from httpx import ASGITransport, AsyncClient

from app.main import app
from tests.conftest import ORIGIN

ADMIN_ROUTES = sorted(
    (method, route.path)
    for route in app.routes
    if isinstance(route, APIRoute) and route.path.startswith("/api/admin")
    for method in route.methods
)
# Sensitive areas: client documents and site configuration.
ADMIN_ONLY = re.compile(r"^/api/admin/(leads|dashboard|settings)")


def concrete(path: str) -> str:
    return re.sub(r"\{[^}]+\}", str(uuid.uuid4()), path)


def test_routes_were_discovered() -> None:
    paths = {p for _, p in ADMIN_ROUTES}
    assert "/api/admin/leads.csv" in paths
    assert "/api/admin/projects/{project_id}/images" in paths
    assert len(ADMIN_ROUTES) >= 25


@pytest.mark.parametrize(("method", "path"), ADMIN_ROUTES)
async def test_without_session_every_admin_route_is_401(method: str, path: str) -> None:
    async with AsyncClient(
        transport=ASGITransport(app=app), base_url="http://test", headers=ORIGIN
    ) as c:
        res = await c.request(method, concrete(path))
    assert res.status_code == 401, (method, path, res.text)


@pytest.mark.parametrize(("method", "path"), [r for r in ADMIN_ROUTES if ADMIN_ONLY.match(r[1])])
async def test_editors_cannot_reach_admin_only_routes(
    editor_client: AsyncClient, method: str, path: str
) -> None:
    res = await editor_client.request(method, concrete(path))
    assert res.status_code == 403, (method, path, res.text)


@pytest.mark.parametrize(
    "path", ["/api/admin/projects", "/api/admin/articles", "/api/admin/testimonials",
             "/api/admin/catalog", "/api/admin/rebuild"],
)  # fmt: skip
async def test_editors_can_manage_content(editor_client: AsyncClient, path: str) -> None:
    assert (await editor_client.get(path)).status_code == 200


async def test_admins_reach_everything(admin_client: AsyncClient) -> None:
    for path in ("/api/admin/leads", "/api/admin/dashboard", "/api/admin/projects"):
        assert (await admin_client.get(path)).status_code == 200, path
