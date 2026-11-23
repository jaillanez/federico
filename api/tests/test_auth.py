from datetime import UTC, datetime, timedelta

from httpx import ASGITransport, AsyncClient
from sqlalchemy import select, update

from app.db import SessionLocal
from app.main import app
from app.models import AdminSession, AdminUser
from tests.conftest import ORIGIN, PASSWORD, make_user


def client() -> AsyncClient:
    return AsyncClient(transport=ASGITransport(app=app), base_url="http://test", headers=ORIGIN)


async def test_login_sets_a_strict_httponly_cookie_and_me_works() -> None:
    user = await make_user("admin")
    async with client() as c:
        res = await c.post(
            "/api/auth/login", json={"email": user.email.upper(), "password": PASSWORD}
        )
        assert res.status_code == 200
        assert res.json()["rol"] == "admin"
        cookie = res.headers["set-cookie"].lower()
        assert "httponly" in cookie and "samesite=strict" in cookie and "path=/api" in cookie
        assert "max-age=43200" in cookie  # 12 hours
        me = await c.get("/api/auth/me")
        assert me.status_code == 200 and me.json()["email"] == user.email
    async with SessionLocal() as s:
        stored = await s.scalar(select(AdminSession).where(AdminSession.user_id == user.id))
        assert stored is not None and len(stored.token_hash) == 64  # only a hash is stored
        u = await s.get(AdminUser, user.id)
        assert u is not None and u.ultimo_acceso is not None


async def test_wrong_password_and_unknown_email_get_the_same_answer() -> None:
    user = await make_user("admin")
    async with client() as c:
        wrong = await c.post("/api/auth/login", json={"email": user.email, "password": "x"})
        unknown = await c.post(
            "/api/auth/login", json={"email": "nadie@example.com", "password": "x"}
        )
    assert wrong.status_code == unknown.status_code == 401
    assert wrong.json() == unknown.json()


async def test_five_failures_lock_the_account_for_15_minutes() -> None:
    user = await make_user("admin")
    async with client() as c:
        for _ in range(5):
            assert (
                await c.post("/api/auth/login", json={"email": user.email, "password": "x"})
            ).status_code == 401
        locked = await c.post("/api/auth/login", json={"email": user.email, "password": PASSWORD})
        assert locked.status_code == 429
        assert "15 minutos" in locked.json()["error"]["message"]
        # Once the lock expires, the right password works again.
        async with SessionLocal() as s:
            await s.execute(
                update(AdminUser)
                .where(AdminUser.id == user.id)
                .values(bloqueado_hasta=datetime.now(UTC) - timedelta(seconds=1))
            )
            await s.commit()
        ok = await c.post("/api/auth/login", json={"email": user.email, "password": PASSWORD})
        assert ok.status_code == 200


async def test_logout_invalidates_the_session() -> None:
    user = await make_user("admin")
    async with client() as c:
        await c.post("/api/auth/login", json={"email": user.email, "password": PASSWORD})
        token = c.cookies.get("sei_session")
        assert (await c.post("/api/auth/logout")).status_code == 204
    # Reusing the old cookie after logout must fail.
    async with client() as c2:
        c2.cookies.set("sei_session", token or "", path="/api")
        assert (await c2.get("/api/auth/me")).status_code == 401


async def test_expired_session_and_inactive_user_are_rejected() -> None:
    user = await make_user("admin")
    async with client() as c:
        await c.post("/api/auth/login", json={"email": user.email, "password": PASSWORD})
        async with SessionLocal() as s:
            await s.execute(
                update(AdminSession)
                .where(AdminSession.user_id == user.id)
                .values(expires_at=datetime.now(UTC) - timedelta(minutes=1))
            )
            await s.commit()
        assert (await c.get("/api/auth/me")).status_code == 401

        await c.post("/api/auth/login", json={"email": user.email, "password": PASSWORD})
        async with SessionLocal() as s:
            await s.execute(update(AdminUser).where(AdminUser.id == user.id).values(activo=False))
            await s.commit()
        assert (await c.get("/api/auth/me")).status_code == 401


async def test_csrf_unsafe_requests_need_our_origin(admin_client: AsyncClient) -> None:
    body = {"titulo": "Obra CSRF"}
    no_origin = await admin_client.post("/api/admin/projects", json=body, headers={"Origin": ""})
    assert no_origin.status_code == 403
    evil = await admin_client.post(
        "/api/admin/projects", json=body, headers={"Origin": "https://evil.example"}
    )
    assert evil.status_code == 403
    assert evil.json()["error"]["code"] == "csrf"
    via_referer = await admin_client.post(
        "/api/admin/projects",
        json=body,
        headers={"Origin": "", "Referer": "http://localhost:4321/admin"},
    )
    assert via_referer.status_code == 201
    # Login itself is protected too (login CSRF).
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as c:
        res = await c.post("/api/auth/login", json={"email": "a@b.co", "password": "x"})
        assert res.status_code == 403
