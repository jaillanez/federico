# S.E.I. Servicio Eléctrico Integral: sitio web

Sitio de S.E.I. (Ing. Federico Delgado): Astro (estático) + API FastAPI + PostgreSQL + almacenamiento S3.
Las instrucciones completas del proyecto están en [CLAUDE.md](CLAUDE.md).

## Levantar en local (3 comandos)

Requisitos: Docker (Docker Desktop, OrbStack o similar) y `make`.

```bash
git clone https://github.com/jaillanez/federico.git && cd federico
make dev     # crea .env, levanta todo y espera a que esté sano
make seed    # datos de ejemplo + admin de desarrollo (imprime la contraseña una sola vez)
```

| Servicio | URL |
| --- | --- |
| Sitio (vía Caddy) | http://localhost:8080 |
| Catálogo de componentes (solo en desarrollo) | http://localhost:8080/estilos |
| API | http://localhost:8080/api/health · http://localhost:8080/api/docs |
| MinIO (consola) | http://localhost:9001 |
| Mailpit | http://localhost:8025 |

Otros comandos: `make help`, `make test`, `make lint`, `make migrate`, `make create-admin`, `make logs`, `make down`.

## Estructura

```
web/    Astro + Tailwind 4 + islas Preact
api/    FastAPI + SQLAlchemy 2 async + Alembic (gestionado con uv)
infra/  Docker Compose, Caddyfile, scripts de la base
```

## Variables de entorno

Todas están documentadas en [.env.example](.env.example). La base usa dos usuarios:
`POSTGRES_USER` (dueño, solo para migraciones) y `DB_API_USER` (permisos mínimos, lo usa la API).

## Desarrollo sin Docker (opcional)

```bash
cd api && uv sync && DATABASE_URL=postgresql+asyncpg://usuario@localhost:5432/sei uv run uvicorn app.main:app --reload
cd web && npm install && npm run dev
```
