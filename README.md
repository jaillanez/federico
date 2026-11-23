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

Otros comandos: `make help`, `make test`, `make lint`, `make migrate`, `make create-admin`, `make purge-leads`, `make logs`, `make down`.

`make purge-leads` borra las consultas inactivas con más de 24 meses (Ley 25.326); en producción se programa a diario (fase 5).

## Estructura

```
web/    Astro + Tailwind 4 + islas Preact
api/    FastAPI + SQLAlchemy 2 async + Alembic (gestionado con uv)
infra/  Docker Compose, Caddyfile, scripts de la base
```

## Build del sitio público

`astro build` lee obras, artículos, testimonios y ajustes de la API (`API_INTERNAL_URL`), así que
la API tiene que estar corriendo. Si no responde, el build falla a propósito, para no publicar un
sitio vacío. Para una prueba rápida de la interfaz sin API: `SEI_OFFLINE_BUILD=1 npm run build`.

Tests de la web (fórmulas del simulador y de cos φ, Markdown): `cd web && npm test`.

## Variables de entorno

Todas están documentadas en [.env.example](.env.example). La base usa dos usuarios:
`POSTGRES_USER` (dueño, solo para migraciones) y `DB_API_USER` (permisos mínimos, lo usa la API).

## Levantar en local sin Docker

Para máquinas donde Docker no funciona. Requisitos (Homebrew): `postgresql@16` (o superior),
`minio`, `mailpit`, además de [uv](https://docs.astral.sh/uv/) y Node 22.

```bash
make dev-local    # PostgreSQL + MinIO + Mailpit propios del proyecto, migraciones, API y Astro
make seed-local   # en otra terminal: datos de ejemplo + admin de desarrollo
```

| Servicio | URL |
| --- | --- |
| Sitio (Astro reenvía `/api` a la API) | http://localhost:4321 |
| API | http://localhost:8000/api/docs |
| Mailpit (correos de prueba) | http://localhost:8125 |
| Consola de MinIO (`sei-minio` / `sei-minio-secret`) | http://localhost:9011 |

- Todo vive en `.local/` (ignorado por git) y usa puertos propios: PostgreSQL 5433, MinIO 9010,
  Mailpit 1125/8125. No interfiere con servicios que ya tengas en 5432, 9000 o 1025/8025.
- El captcha usa las claves de prueba de Cloudflare (siempre pasan), así que necesita internet.
- Ctrl-C detiene la API y Astro; `make stop-local` apaga también PostgreSQL, MinIO y Mailpit.
- Otros: `make test-local`, `make create-admin-local`.

## Build del sitio público

`astro build` lee obras, artículos, testimonios y ajustes de la API (`API_INTERNAL_URL`), así que
la API tiene que estar corriendo. Si no responde, el build falla a propósito, para no publicar un
sitio vacío. Para una prueba rápida de la interfaz sin API: `SEI_OFFLINE_BUILD=1 npm run build`.

Tests de la web (fórmulas del simulador y de cos φ, Markdown): `cd web && npm test`.

## Variables de entorno

Todas están documentadas en [.env.example](.env.example). La base usa dos usuarios:
`POSTGRES_USER` (dueño, solo para migraciones) y `DB_API_USER` (permisos mínimos, lo usa la API).

## Levantar en local sin Docker

Para máquinas donde Docker no funciona. Requisitos: PostgreSQL de Homebrew (16 o superior;
`brew install postgresql@16`), [uv](https://docs.astral.sh/uv/) y Node 22.

```bash
make dev-local    # PostgreSQL propio del proyecto (.local/, puerto 5433) + migraciones + API + Astro
make seed-local   # en otra terminal: datos de ejemplo + admin de desarrollo
```

- Sitio: http://localhost:4321 (Astro reenvía `/api` a la API, igual que Caddy en producción).
- API: http://localhost:8000/api/health · http://localhost:8000/api/docs
- Ctrl-C detiene la API y Astro; `make stop-local` apaga también PostgreSQL.
- Otros: `make test-local`, `make create-admin-local`.

El cluster vive en `.local/pgdata` (ignorado por git) y escucha solo en `localhost:5433`, así que no
interfiere con otro PostgreSQL que ya tengas en el 5432. MinIO y Mailpit (fases 3 y 4) todavía no
tienen equivalente sin Docker.
