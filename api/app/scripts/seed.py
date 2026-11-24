"""Load sample data for local development. Idempotent: safe to run repeatedly.

All sample projects and articles are clearly marked as examples ("[Ejemplo]").
"""

import asyncio
import secrets
from datetime import UTC, date, datetime, timedelta
from decimal import Decimal
from typing import Any

from sqlalchemy import select
from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import get_settings
from app.db import SessionLocal
from app.models import AdminUser, Article, Project, Sector, ServiceCategory, SiteSetting
from app.security import hash_password

CATEGORIES = [
    ("tableros-y-bombeo", "Tableros y bombeo", "Tableros de bombeo, distribución y CCM."),
    ("canalizaciones", "Canalizaciones", "Bandejas, cañerías y tendidos subterráneos."),
    ("media-y-baja-tension", "Media y baja tensión", "Subestaciones, acometidas y líneas."),
    (
        "fuerza-motriz-e-iluminacion",
        "Fuerza motriz e iluminación",
        "Alimentación de motores e iluminación industrial.",
    ),
    (
        "relevamiento-de-campo",
        "Relevamiento de campo",
        "Diagnóstico, mediciones y documentación de instalaciones.",
    ),
]

SECTORS = [
    ("agroindustria", "Agroindustria", "wheat"),
    ("mineria", "Minería", "pickaxe"),
    ("plantas-industriales", "Plantas industriales", "factory"),
    ("fincas-y-riego", "Fincas y riego", "droplet"),
    ("envasadoras", "Envasadoras", "package"),
]

# (slug, title, category, sector, provincia, localidad, lat, lng, kW, destacado)
PROJECTS = [
    (
        "ejemplo-tablero-bombeo-finca",
        "[Ejemplo] Tablero de bombeo para finca",
        "tableros-y-bombeo",
        "fincas-y-riego",
        "San Juan",
        "Pocito",
        "-31.6800",
        "-68.5800",
        "75",
        True,
    ),
    (
        "ejemplo-subestacion-planta",
        "[Ejemplo] Subestación para planta industrial",
        "media-y-baja-tension",
        "plantas-industriales",
        "Mendoza",
        "Luján de Cuyo",
        "-33.0400",
        "-68.8800",
        "630",
        True,
    ),
    (
        "ejemplo-canalizacion-envasadora",
        "[Ejemplo] Canalización de línea de envasado",
        "canalizaciones",
        "envasadoras",
        "San Juan",
        "Rawson",
        "-31.5800",
        "-68.5300",
        None,
        True,
    ),
    (
        "ejemplo-iluminacion-galpon",
        "[Ejemplo] Iluminación de galpón agroindustrial",
        "fuerza-motriz-e-iluminacion",
        "agroindustria",
        "La Rioja",
        "Chilecito",
        "-29.1600",
        "-67.5000",
        "40",
        False,
    ),
    (
        "ejemplo-relevamiento-mina",
        "[Ejemplo] Relevamiento eléctrico en yacimiento",
        "relevamiento-de-campo",
        "mineria",
        "Catamarca",
        "Belén",
        "-27.6500",
        "-67.0300",
        None,
        False,
    ),
    (
        "ejemplo-ccm-bodega",
        "[Ejemplo] CCM para bodega",
        "tableros-y-bombeo",
        "agroindustria",
        "Mendoza",
        "San Rafael",
        "-34.6100",
        "-68.3300",
        "110",
        False,
    ),
]

EXAMPLE_TEXT = "Contenido de ejemplo para desarrollo. Reemplazar por una obra real."

ARTICLES: list[dict[str, Any]] = [
    {
        "slug": "ejemplo-que-es-la-energia-reactiva",
        "titulo": "[Ejemplo] Qué es la energía reactiva y por qué te la cobran",
        "extracto": "Artículo de ejemplo para desarrollo.",
        "cuerpo_md": "## Introducción\n\nTexto de ejemplo.\n\n## Cómo se calcula tg φ\n\nTexto de ejemplo.",
        "tags": ["tarifas", "energia-reactiva"],
        "days_ago": 10,
    },
    {
        "slug": "ejemplo-como-leer-un-presupuesto-solar",
        "titulo": "[Ejemplo] Cómo leer un presupuesto solar sin que te vendan humo",
        "extracto": "Artículo de ejemplo para desarrollo.",
        "cuerpo_md": "## Introducción\n\nTexto de ejemplo.\n\n## El repago real\n\nTexto de ejemplo.",
        "tags": ["solar", "repago"],
        "days_ago": 3,
    },
]

# Contact data from Federico's business card. Metrics stay null until confirmed.
SETTINGS: dict[str, Any] = {
    "contacto": {
        "direccion": "Brasil 359 (O), San Juan",
        "telefono": "0264-4220106",
        "celular": "0264 15 5651609",
        "email": "monetidel@gmail.com",
    },
    # TODO(federico): confirm the WhatsApp number (assumed: cell phone on the card).
    "whatsapp": {"numero": "5492645651609"},
    # TODO(federico): real figures for the home counters.
    "metricas": [
        {"clave": "obras", "etiqueta": "Obras ejecutadas", "valor": None},
        {"clave": "anios", "etiqueta": "Años de experiencia", "valor": None},
        {"clave": "provincias", "etiqueta": "Provincias", "valor": None},
    ],
    # TODO(federico): confirm the tg φ limit with each distributor.
    "tg_phi_limite": 0.62,
}

SEED_ADMIN_EMAIL = "admin@sei.local"


async def _upsert(session: AsyncSession, model: Any, key: str, rows: list[dict[str, Any]]) -> None:
    for row in rows:
        stmt = insert(model).values(**row)
        update = {k: stmt.excluded[k] for k in row if k != key}
        await session.execute(stmt.on_conflict_do_update(index_elements=[key], set_=update))


async def seed() -> None:
    if get_settings().is_production:
        raise SystemExit("El seed no se ejecuta en producción.")

    async with SessionLocal() as session:
        await _upsert(
            session,
            ServiceCategory,
            "slug",
            [
                {"slug": s, "nombre": n, "descripcion": d, "orden": i}
                for i, (s, n, d) in enumerate(CATEGORIES)
            ],
        )
        await _upsert(
            session, Sector, "slug", [{"slug": s, "nombre": n, "icono": i} for s, n, i in SECTORS]
        )
        cats = {c.slug: c.id for c in await session.scalars(select(ServiceCategory))}
        secs = {s.slug: s.id for s in await session.scalars(select(Sector))}

        await _upsert(
            session,
            Project,
            "slug",
            [
                {
                    "slug": slug,
                    "titulo": title,
                    "resumen": EXAMPLE_TEXT,
                    "problema": EXAMPLE_TEXT,
                    "solucion": EXAMPLE_TEXT,
                    "resultado": EXAMPLE_TEXT,
                    "provincia": prov,
                    "localidad": loc,
                    "lat": Decimal(lat),
                    "lng": Decimal(lng),
                    "category_id": cats[cat],
                    "sector_id": secs[sec],
                    "fecha_obra": date(2024, 1 + i, 15),
                    "potencia_kw": Decimal(kw) if kw else None,
                    "destacado": featured,
                    "publicado": True,
                }
                for i, (slug, title, cat, sec, prov, loc, lat, lng, kw, featured) in enumerate(
                    PROJECTS
                )
            ],
        )

        now = datetime.now(UTC)
        await _upsert(
            session,
            Article,
            "slug",
            [
                {
                    **{k: v for k, v in a.items() if k != "days_ago"},
                    "publicado_at": now - timedelta(days=a["days_ago"]),
                }
                for a in ARTICLES
            ],
        )
        await _upsert(
            session, SiteSetting, "clave", [{"clave": k, "valor": v} for k, v in SETTINGS.items()]
        )

        password: str | None = None
        existing = await session.scalar(
            select(AdminUser).where(AdminUser.email == SEED_ADMIN_EMAIL)
        )
        if existing is None:
            # Random password, never a fixed default credential.
            password = secrets.token_urlsafe(12)
            session.add(
                AdminUser(
                    email=SEED_ADMIN_EMAIL,
                    password_hash=hash_password(password),
                    nombre="Admin de desarrollo",
                    rol="admin",
                )
            )
        await session.commit()

    print("Datos de ejemplo cargados: 5 categorías, 5 sectores, 6 obras, 2 artículos.")
    if password:
        print(
            f"Admin de desarrollo: {SEED_ADMIN_EMAIL} / {password}  (guardala, no se vuelve a mostrar)"
        )
    else:
        print(f"Admin de desarrollo ya existente: {SEED_ADMIN_EMAIL}")


if __name__ == "__main__":
    asyncio.run(seed())
