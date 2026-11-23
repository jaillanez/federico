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

## Panel de administración

- Dirección: `/admin` (en local, http://localhost:4321/admin). No se indexa.
- Primer usuario: `make create-admin` (o `make create-admin-local`). Nunca hay credenciales por defecto.
- Roles: **admin** ve todo; **editor** maneja obras, artículos y testimonios, pero no las consultas
  (tienen documentación de clientes) ni la configuración.
- Seguridad: sesión de 12 h en cookie `HttpOnly` + `SameSite=Strict`, verificación de `Origin`
  contra CSRF y bloqueo de 15 minutos tras 5 intentos fallidos.
- Fotos de obras: se procesan en segundo plano (orientación, sin metadatos ni GPS, AVIF y WebP en
  400/800/1600/2400 px).
- Al publicar, despublicar o editar contenido público, la API llama a `REBUILD_WEBHOOK_URL` y agrupa
  los pedidos de 60 segundos en uno solo. En local lo atiende `web/scripts/build-server.mjs`
  (http://localhost:4322), que regenera el sitio y lo sirve como en producción.

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

## Producción

Arquitectura: un servidor (VPS) con Docker Compose (`infra/docker-compose.prod.yml`):

| Servicio | Qué hace |
| --- | --- |
| `caddy` | HTTPS automático (Let's Encrypt), encabezados de seguridad y CSP, sirve el sitio estático y reenvía `/api` |
| `api` | FastAPI (usuario de base con permisos mínimos) |
| `migrate` | Corre las migraciones y crea los buckets con el usuario dueño; después termina |
| `scheduler` | Cada hora regenera el sitio si llegó la fecha de un artículo programado; cada día a las 03:30 borra consultas vencidas (Ley 25.326) y hace el backup |
| `web-build` | Regenera el sitio estático cuando la API lo pide (al publicar) |
| `db` | PostgreSQL 16 |

Archivos en **Cloudflare R2**: `sei-public` (fotos, con dominio propio de R2), `sei-private`
(documentación de consultas) y `sei-backups`.

### Primera instalación

1. **Servidor**: Ubuntu 24.04 con Docker. Usuario de deploy sin contraseña, solo con clave SSH.
2. **Código**: `git clone https://github.com/jaillanez/federico.git /opt/sei`.
3. **Secretos**: copiá `infra/.env.prod.example` a `/opt/sei/.env.prod`, completalo
   (`openssl rand -hex 32` para cada secreto) y protegelo con `chmod 600 .env.prod`.
4. **DNS**: registros `A` (y `AAAA` si hay IPv6) de `servielect.com.ar` y `www` apuntando al
   servidor. El dominio está activo en NIC Argentina pero hoy no tiene DNS configurado.
5. **R2**: creá los 3 buckets, un token con permisos sobre ellos y un dominio público para
   `sei-public` (p. ej. `media.servielect.com.ar`, valor de `PUBLIC_MEDIA_URL` y `MEDIA_ORIGIN`).
6. **Turnstile**: creá el sitio en Cloudflare (modo invisible) y cargá las dos claves.
7. **Levantar**: `make deploy` (construye, migra, crea buckets, arranca y genera el sitio).
8. **Primer usuario del panel**: `make create-admin-prod`.

### Deploy

- **Un comando** en el servidor: `make deploy` (o `make deploy REF=<sha>`).
- **Automático**: al fusionar en `main`, cuando el CI pasa, el workflow `Deploy` entra por SSH y
  corre `infra/deploy.sh`. Necesita los secretos del repositorio `DEPLOY_HOST`, `DEPLOY_USER`,
  `DEPLOY_SSH_KEY` y `DEPLOY_KNOWN_HOSTS` (`ssh-keyscan <servidor>`, fija la huella del servidor).
  Sin ellos, el paso se omite.

### Backups y restauración

- Diario a las 03:30: `pg_dump` cifrado con AES-256 (`BACKUP_PASSPHRASE`) en `sei-backups`,
  30 días de retención. Forzarlo: `make backup`. Verificar el último sin tocar nada:
  `make restore-check`.
- **Guardá `BACKUP_PASSPHRASE` también fuera del servidor**: sin ella los backups no se pueden leer.
- Restaurar (reemplaza los datos de la base de destino):

  ```bash
  docker compose -f infra/docker-compose.prod.yml --env-file .env.prod exec scheduler \
    /app/infra/restore.sh latest postgresql://sei_owner:<clave>@db:5432/sei --yes
  ```

  Para probar en limpio, restaurá primero en una base nueva (`CREATE DATABASE sei_prueba`). El CI
  hace exactamente eso en cada PR (`infra/smoke-test.sh`).

### Monitoreo

El workflow `Uptime` revisa cada 10 minutos, desde GitHub (fuera del servidor), la home, la API
con la base y el vencimiento del certificado. Si falla, GitHub le manda un email al dueño del
repositorio. Se activa creando la variable de repositorio `SITE_URL=https://servielect.com.ar`.

### Redirecciones del sitio anterior

`infra/redirects.caddy` tiene las 301 desde las URLs viejas. Hoy está vacío porque el dominio no
tenía sitio ni registros archivados; agregá líneas si aparecen URLs viejas en Google Search Console.

### Guía para Federico

[docs/guia-panel.md](docs/guia-panel.md): subir una obra, responder una consulta y publicar un
artículo, con capturas.
