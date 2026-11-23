from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import AdminUser, Article, Project, Sector, ServiceCategory
from app.scripts.create_admin import create_admin
from app.scripts.seed import seed
from app.security import hash_password, verify_password


async def test_seed_is_idempotent(session: AsyncSession) -> None:
    await seed()
    await seed()
    counts = {
        m.__name__: await session.scalar(select(func.count()).select_from(m))
        for m in (ServiceCategory, Sector, Project, Article)
    }
    assert counts == {"ServiceCategory": 5, "Sector": 5, "Project": 6, "Article": 2}
    titles = (await session.scalars(select(Project.titulo))).all()
    assert all(t.startswith("[Ejemplo]") for t in titles)


async def test_create_admin_hashes_with_argon2id(session: AsyncSession) -> None:
    assert await create_admin("fede@example.com", "Federico", "una-clave-larga-1", "admin")
    assert not await create_admin("fede@example.com", "Federico", "otra-clave-larga-2", "admin")
    user = await session.scalar(select(AdminUser).where(AdminUser.email == "fede@example.com"))
    assert user is not None
    assert user.password_hash.startswith("$argon2id$")
    assert verify_password(user.password_hash, "otra-clave-larga-2")
    assert not verify_password(user.password_hash, "una-clave-larga-1")


def test_verify_password_handles_garbage() -> None:
    assert not verify_password("no-es-un-hash", "x")
    assert verify_password(hash_password("abc"), "abc")
