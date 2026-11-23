# CLAUDE.md: sitio web de S.E.I. (Ing. Federico Delgado)

Instrucciones para el agente de IA que construye el sitio. Leelas completas antes de empezar y volvé a ellas en cada sesión. Trabajá una fase por vez (sección 9) y detenete al final de cada una para que se revise. Lo que dependa de Federico (logo, WhatsApp, dominio, fotos, cifras) va como `TODO(federico)` hasta que llegue.

> Nota de implementación: la raíz de este repositorio (`jaillanez/federico`) **es** el monorepo `sei-web/` descrito en la sección 3.

## 1. Rol, contexto y objetivo

Sos un desarrollador full stack senior. Vas a construir desde cero el sitio web de **S.E.I. Servicio Eléctrico Integral**, la empresa del **Ing. Federico Delgado** (San Juan, Argentina). Todo el contenido visible va en **español de Argentina** (voseo y tono profesional: "Subí tu factura", no "Sube tu factura").

**Quién es el cliente**: ingeniero eléctrico y consultor independiente. Servicios: obras eléctricas de media y baja tensión, tableros industriales y de bombeo, canalizaciones, fuerza motriz e iluminación, corrección de factor de potencia (tg φ), relevamiento y diagnóstico, mantenimiento, asesoramiento tarifario para grandes consumos, mercado eléctrico mayorista (MEM) y consultoría solar imparcial.

**Diferencial que todo el sitio debe transmitir**: S.E.I. no vende paneles ni equipos. Audita, diseña y ejecuta del lado del cliente, "poniendo las cartas sobre la mesa".

**Público**: gerentes de planta, directores financieros y dueños de industrias, agro, minería, fincas y riego, envasadoras. Foco en San Juan, Mendoza, La Rioja, Catamarca y todo el país.

**Objetivos del sitio, en orden**:

1. Convertir visitas en consultas: formulario "Diagnóstico Exprés" (subir factura eléctrica o presupuesto solar) y WhatsApp.
2. Construir autoridad nacional: galería de obras reales, artículos técnicos, SEO.
3. Que Federico lo administre solo desde un panel privado, incluso desde el celular.

**Datos de contacto actuales** (de su tarjeta): Brasil 359 (O), San Juan. Tel/Fax 0264-4220106. Cel. 0264 15 5651609. servielect@infovia.com.ar. Dominio actual: servielect.com.ar. Guárdalos en configuración, nunca repetidos a mano en las plantillas.

## 2. Stack y reglas no negociables

| Capa | Usar | Versión mínima |
| --- | --- | --- |
| Frontend | Astro (salida estática + endpoints SSR solo donde haga falta), TypeScript estricto, Tailwind CSS | Astro 5, Node 22 LTS |
| Islas interactivas | Preact (`@astrojs/preact`) | última estable |
| Backend | Python + FastAPI + SQLAlchemy 2 (async) + Pydantic v2 + Alembic | Python 3.12 |
| Base de datos | PostgreSQL | 16 |
| Archivos | Almacenamiento compatible con S3 (Cloudflare R2 en producción, MinIO en local) vía boto3 |  |
| Imágenes | Pillow (+ pillow-avif-plugin) |  |
| Servidor web | Caddy (HTTPS automático, proxy a la API) | 2 |
| Orquestación | Docker Compose (local y producción) |  |
| CI | GitHub Actions |  |

Reglas:

- **No cambies el stack.** Si algo parece requerir otra tecnología, preguntá antes.
- El sitio público se genera estático. Solo el formulario y el panel hablan con la API en tiempo de ejecución.
- Toda escritura de datos pasa por la API de Python. Astro nunca se conecta a PostgreSQL.
- Nada de secretos en el repositorio: todo por variables de entorno, con un `.env.example` documentado.
- JavaScript mínimo: cada isla debe justificar su peso. Presupuesto: menos de 100 KB de JS por página pública.
- Accesibilidad AA: contraste, foco visible, navegación por teclado, `alt` en todas las imágenes.
- No inventes datos: métricas, testimonios, clientes o años de experiencia van como `TODO(federico)` hasta que se confirmen.

## 3. Estructura del repositorio

Monorepo con esta forma (podés agregar archivos, no cambies la forma sin preguntar):

```
sei-web/
├─ web/                      # Astro
│  ├─ src/
│  │  ├─ components/         # .astro reutilizables (Hero, Card, CTA, Footer...)
│  │  ├─ islands/            # Preact: DiagnosticoForm, Galeria, SimuladorRepago, CalculadoraCosPhi, MapaCobertura, AdminApp
│  │  ├─ layouts/            # BaseLayout (SEO, WhatsApp flotante), AdminLayout
│  │  ├─ pages/              # rutas de la sección 6
│  │  ├─ lib/                # cliente de la API, helpers SEO, schema.org
│  │  ├─ content/            # textos de servicios en Markdown (colecciones de Astro)
│  │  └─ styles/
│  ├─ public/                # favicon, robots.txt, og por defecto
│  └─ astro.config.mjs
├─ api/                      # FastAPI
│  ├─ app/
│  │  ├─ main.py
│  │  ├─ config.py           # pydantic-settings
│  │  ├─ db.py
│  │  ├─ models/             # SQLAlchemy
│  │  ├─ schemas/            # Pydantic
│  │  ├─ routers/            # public.py, admin_*.py, auth.py
│  │  ├─ services/           # storage.py, images.py, mail.py, captcha.py, rebuild.py
│  │  └─ security.py
│  ├─ alembic/
│  ├─ tests/
│  └─ pyproject.toml          # gestionado con uv
├─ infra/
│  ├─ docker-compose.yml      # db, minio, api, web-build, caddy
│  ├─ docker-compose.prod.yml
│  ├─ Caddyfile
│  └─ backup.sh               # pg_dump diario a R2
├─ .github/workflows/ci.yml
├─ .env.example
├─ Makefile                  # make dev, make test, make migrate, make seed
└─ README.md                 # cómo levantar todo en 3 comandos
```

`make dev` debe levantar todo en local (PostgreSQL, MinIO, API con recarga, Astro en modo desarrollo) y `make seed` cargar datos de ejemplo: las 5 categorías, los 5 sectores, 6 obras ficticias marcadas como ejemplo, 2 artículos y un usuario admin.

## 4. Modelo de datos

PostgreSQL 16, todo con migraciones de Alembic. Claves `id` UUID (`gen_random_uuid()`), `created_at` y `updated_at` con zona horaria en todas las tablas. Los archivos van al almacenamiento de objetos; la base guarda solo la clave (`storage_key`).

| Tabla | Campos | Notas |
| --- | --- | --- |
| `admin_users` | email (único), password\_hash, nombre, rol (`admin`, `editor`), activo, ultimo\_acceso | Hash Argon2 |
| `service_categories` | slug (único), nombre, descripcion, orden | Semilla: tableros-y-bombeo, canalizaciones, media-y-baja-tension, fuerza-motriz-e-iluminacion, relevamiento-de-campo |
| `sectors` | slug (único), nombre, icono | Semilla: agroindustria, mineria, plantas-industriales, fincas-y-riego, envasadoras |
| `projects` | slug (único), titulo, resumen, problema, solucion, resultado, provincia, localidad, lat, lng, category\_id, sector\_id, fecha\_obra, potencia\_kw, destacado, publicado, seo\_title, seo\_description | Índices por (publicado, category\_id) y provincia |
| `project_images` | project\_id (cascade), storage\_key, ancho, alto, alt\_text, orden, es\_portada, tipo (`general`, `antes`, `despues`) | Una sola portada por obra (índice único parcial) |
| `leads` | empresa, contacto\_nombre, cargo, email, whatsapp, provincia, localidad, objetivos (text\[\]), mensaje, origen (`diagnostico`, `contacto`), utm\_source, utm\_medium, utm\_campaign, estado, consentimiento\_at, ip\_hash | Estado: `nuevo`, `en_analisis`, `respondido`, `cliente`, `descartado` |
| `lead_files` | lead\_id (cascade), tipo (`factura`, `presupuesto_solar`, `otro`), storage\_key, nombre\_original, mime, bytes, sha256 | Solo en el bucket privado |
| `lead_notes` | lead\_id (cascade), autor\_id, texto, estado\_anterior, estado\_nuevo | Historial de seguimiento |
| `articles` | slug (único), titulo, extracto, cuerpo\_md, portada\_key, tags (text\[\]), publicado\_at (nulo = borrador), seo\_title, seo\_description |  |
| `testimonials` | nombre, cargo, empresa, provincia, texto, logo\_key, publicado, orden |  |
| `site_settings` | clave (única), valor (jsonb) | Teléfonos, WhatsApp, email, dirección, métricas del inicio |

Objetivos válidos de un lead: `reducir_costo_fijo`, `eliminar_penalizaciones`, `evaluar_solar`, `revisar_categoria`. Agregá una tarea programada que borre leads `descartado` o `nuevo` con más de 24 meses, con sus archivos (Ley 25.326).

## 5. API del backend

FastAPI bajo el prefijo `/api`. Respuestas JSON con esquemas Pydantic; errores con formato `{"error": {"code", "message", "fields"}}` y mensajes en español. Paginación `?page=&per_page=` (máx. 50). Documentación OpenAPI en `/api/docs` solo fuera de producción.

| Método y ruta | Acceso | Comportamiento |
| --- | --- | --- |
| `GET /api/health` | Público | Estado de la API y de la base |
| `GET /api/projects` | Público | Obras publicadas; filtros `categoria`, `sector`, `provincia`, `destacado` |
| `GET /api/projects/{slug}` | Público | Obra con imágenes ordenadas y URLs de cada tamaño |
| `GET /api/articles`, `GET /api/articles/{slug}` | Público | Solo con `publicado_at` pasado |
| `GET /api/testimonials`, `GET /api/settings/public` | Público | Testimonios publicados y datos de contacto y métricas |
| `POST /api/leads` | Público | `multipart/form-data`: campos del lead + hasta 3 archivos + token del captcha. Ver sección 7 |
| `POST /api/auth/login`, `POST /api/auth/logout`, `GET /api/auth/me` | Panel | Sesión en cookie `HttpOnly`, `Secure`, `SameSite=Strict`, 12 h |
| `GET/POST /api/admin/projects`, `GET/PATCH/DELETE /api/admin/projects/{id}` | Panel | CRUD de obras |
| `POST /api/admin/projects/{id}/images`, `PATCH/DELETE /api/admin/images/{id}` | Panel | Subida múltiple, orden, portada, texto alternativo |
| `GET /api/admin/leads`, `GET/PATCH /api/admin/leads/{id}` | Panel | Filtros por estado, provincia y fecha; cambio de estado crea un `lead_note` |
| `POST /api/admin/leads/{id}/notes` | Panel | Nota interna |
| `GET /api/admin/leads/{id}/files/{file_id}` | Panel | Redirige a URL firmada que vence en 5 minutos |
| `GET /api/admin/leads.csv` | Panel | Exportación |
| CRUD `/api/admin/articles`, `/api/admin/testimonials`, `/api/admin/settings` | Panel |  |
| `POST /api/admin/rebuild` | Panel | Dispara la regeneración del sitio (se llama solo al publicar) |

Procesamiento de imágenes de obras (en segundo plano): corregir orientación EXIF, borrar todos los metadatos (incluido GPS), generar 400, 800, 1600 y 2400 px de ancho en AVIF y WebP, guardar ancho y alto. Claves: `projects/{project_id}/{image_id}-{ancho}.{ext}`.

Regeneración del sitio: `services/rebuild.py` llama a un webhook configurable (`REBUILD_WEBHOOK_URL`). En local, un contenedor `web-build` escucha y ejecuta `astro build`; en producción puede ser el mismo contenedor o un deploy hook de Cloudflare Pages. Agrupá pedidos seguidos (espera de 60 s).

## 6. Páginas, contenido y diseño

**Elementos globales** (en `BaseLayout`): encabezado fijo con logo, menú y botón destacado **"Auditar mi factura"** → `/diagnostico`; botón flotante de WhatsApp (`https://wa.me/<número>?text=Hola%20Federico%2C%20te%20escribo%20desde%20la%20web...`) en todas las páginas públicas; pie con datos de contacto, cobertura, enlaces legales. Cada página termina con un bloque CTA: "Solicitar diagnóstico" + "Consultar por WhatsApp".

| Ruta | Página | Contenido y componentes |
| --- | --- | --- |
| `/` | Inicio | H1 "Ingeniería eléctrica y consultoría solar 100% independiente para grandes empresas". Subtítulo: optimizamos costos energéticos y auditamos proyectos solares sin venderte equipos. 3 tarjetas (Sin conflicto de interés, Ingeniería electromecánica dura, Gestión tarifaria estratégica). Contadores animados desde `site_settings`. Obras destacadas, sectores, testimonios, últimos artículos |
| `/consultoria-solar` | Consultoría Solar Imparcial | H1 "Consultoría y auditoría solar 100% imparcial para empresas" + "Poniendo las cartas sobre la mesa antes de tu inversión". Comparativa "Lo que te dice el vendedor" vs. "Lo que analiza Federico". 4 pilares: auditoría de presupuestos de terceros, repago real y financiamiento, riesgos fiscales (AFIP, generación distribuida), Tarifa T5 y potencia. Metodología en 3 pasos. Isla `SimuladorRepago`. FAQ |
| `/asesoramiento-tarifario` | Optimización Tarifaria | H1 "Asesoramiento y optimización tarifaria para grandes consumos" + "Reducimos tus costos fijos sin obras ni inversiones". 4 tarjetas de fugas de dinero: potencia contratada inadecuada, penalización por energía reactiva, incertidumbre regulatoria (AFIP, T5), descalce de bandas horarias. Servicios, cobertura. Isla `CalculadoraCosPhi`. FAQ |
| `/obras` | Obras Eléctricas | H1 "Infraestructura y obras eléctricas de media y baja tensión". Servicios: tableros (bombeo, distribución, CCM), canalizaciones, fuerza motriz e iluminación, subestaciones y acometidas. Isla `Galeria` con filtros (categoría, sector, provincia) por URL y visor a pantalla completa con teclado y gestos |
| `/obras/[slug]` | Ficha de obra | Fotos, problema → solución → resultado, datos (provincia, sector, potencia, fecha), deslizador antes/después si hay ambas, obras relacionadas |
| `/cobertura` | Cobertura nacional | Isla `MapaCobertura`: SVG de Argentina por provincia con cantidad de obras; clic filtra la galería |
| `/articulos`, `/articulos/[slug]` | Artículos | Listado con etiquetas, artículo con índice, tiempo de lectura, autor (Federico) y CTA al final |
| `/sobre-federico` | Sobre Federico y S.E.I. | H1 "Respaldo técnico, experiencia en campo e independencia profesional". Foto, trayectoria en línea de tiempo, valores, sectores |
| `/diagnostico` | Diagnóstico Exprés | Ver sección 7 |
| `/privacidad`, `/confidencialidad` | Legales | Textos con `TODO(federico)` para revisión |
| `/404` | No encontrada | Enlaces a servicios y diagnóstico |
| `/admin/*` | Panel | Ver sección 7. Sin indexar |

**Islas de cálculo** (orientativas, con aviso "estimación, no reemplaza el diagnóstico" y CTA al final):

- `SimuladorRepago`: entradas inversión (USD), ahorro anual (USD), mantenimiento anual (%), degradación anual (% por defecto 0,5), horizonte 25 años. Salida: año de repago y gráfico de flujo acumulado.
- `CalculadoraCosPhi`: entradas energía activa (kWh) y reactiva (kVArh) del período. Salida: tg φ = kVArh / kWh, cos φ = 1 / √(1 + tg² φ), y si supera el límite configurable (tg φ > 0,62 por defecto, `TODO(federico)` confirmar según distribuidora) un mensaje de que probablemente haya recargo.

**Diseño visual**:

- Colores como variables de Tailwind: `primary` azul técnico (#0B3D91 base, escala 50 a 900), `accent` naranja solar (#F59E0B) solo para CTA y elementos solares, `ink` grafito (#1F2933), fondos gris claro (#F5F7FA) y blanco. Modo oscuro no requerido en la primera versión.
- Tipografía: Inter o Manrope para texto, una variante con más carácter para titulares; tamaños fluidos con `clamp()`.
- Estética industrial y sobria: fotos reales grandes, líneas finas tipo plano eléctrico como detalle, tarjetas con bordes sutiles. Nada de ilustraciones genéricas ni fotos de stock de paneles.
- Movimiento: aparición suave al hacer scroll, transiciones de página (View Transitions de Astro), contadores. Respetar `prefers-reduced-motion`.
- Primero celular: muchos clientes llegan desde el teléfono o un enlace de WhatsApp. Probar en 360 px de ancho.

## 7. Diagnóstico Exprés y panel de administración

### Diagnóstico Exprés (`/diagnostico`, isla `DiagnosticoForm`)

Es el motor de conversión del sitio. Tiene que sentirse corto, seguro y confidencial.

Encabezado: "Auditá tu factura eléctrica o evaluá tu presupuesto solar" + "Recibí un primer diagnóstico técnico e imparcial en menos de 48 horas".

Formulario en 3 pasos con indicador de progreso, que conserva lo cargado si el usuario vuelve atrás:

1. **Datos**: empresa o razón social (opcional), nombre y cargo, provincia (desplegable con las 24 jurisdicciones; San Juan, Mendoza, La Rioja y Catamarca primero), localidad, email, WhatsApp. Validación de email y teléfono argentino.
2. **Archivos**: zona de arrastrar y soltar con dos campos: "Factura de energía eléctrica" (PDF, JPG, PNG) con ayuda "Adjuntá la última factura completa, donde figure el consumo, la potencia contratada (kW) y los cargos por energía reactiva" y "Presupuesto solar de terceros (opcional)". En el celular, permitir sacar foto con la cámara. Vista previa, barra de progreso, quitar archivo.
3. **Objetivo**: casillas (al menos una): reducir costos fijos, eliminar penalizaciones por potencia o reactiva, evaluar si conviene instalar paneles y su repago real, revisar la categoría tarifaria. Mensaje libre opcional.

Antes de enviar: bloque "Garantía de confidencialidad comercial" (la documentación se usa solo para el diagnóstico, no se comercializa ni se transfiere a terceros ni a distribuidoras), casilla obligatoria de aceptación con enlace a `/confidencialidad`, captcha invisible Cloudflare Turnstile.

Botón "Enviar documentación para diagnóstico" y alternativa "¿Preferís no completar el formulario? Enviá tu factura por WhatsApp" (mensaje precargado: "Hola Federico, te adjunto la factura de mi empresa para un diagnóstico tarifario/solar").

Al enviar con éxito: pantalla "¡Recibimos tu documentación! Federico la va a revisar personalmente. En 24 a 48 horas hábiles te contactamos por email o WhatsApp". Evento de analítica `lead_enviado`.

En el backend, `POST /api/leads`:

- Verifica Turnstile, límite de 5 envíos por hora por IP, campo trampa oculto.
- Valida tipo real de cada archivo por su contenido (no por la extensión): solo PDF, JPEG, PNG, WebP, HEIC; máx. 15 MB por archivo, 3 archivos, 40 MB en total.
- Guarda archivos en el bucket **privado** con clave `leads/{lead_id}/{uuid}.{ext}` y su SHA-256.
- Envía un email a Federico con el resumen y enlace al panel (nunca los archivos adjuntos) y un email de confirmación al cliente.
- Guarda UTM y origen. Nunca registra en logs el contenido de los archivos ni datos personales completos.

También hay un formulario corto de contacto (nombre, email, teléfono, mensaje) en el pie de `/sobre-federico`, que usa el mismo endpoint con `origen=contacto`.

### Panel de administración (`/admin`, isla `AdminApp`)

Una aplicación Preact dentro de una página Astro con `noindex`, que habla solo con `/api/admin`. Tiene que ser cómoda en el celular: Federico va a subir fotos desde la obra.

- **Ingreso** con email y contraseña; bloqueo de 15 minutos tras 5 intentos fallidos.
- **Inicio del panel**: consultas nuevas, consultas de la semana por provincia, últimas obras.
- **Consultas**: lista con filtros y búsqueda; detalle con datos, objetivos, archivos (descarga por URL firmada), notas y cambio de estado; botón "Responder por WhatsApp" y "Responder por email". Exportar CSV.
- **Obras**: crear y editar con todos los campos; subida múltiple de fotos con arrastrar y soltar o cámara, reordenar arrastrando, marcar portada, editar texto alternativo, tipo antes/después; slug generado del título; publicar u ocultar.
- **Artículos**: editor Markdown con vista previa, imagen de portada, etiquetas, fecha de publicación (permite programar), campos SEO.
- **Testimonios** y **Configuración** (contacto, WhatsApp, métricas del inicio).
- Al publicar, despublicar o editar contenido público se dispara la regeneración y se muestra "El sitio se está actualizando".

## 8. Seguridad, SEO y rendimiento

**Seguridad** (el sitio recibe facturas de empresas: tratalo como datos sensibles)

- HTTPS en todo (Caddy). Cabeceras: `Strict-Transport-Security`, `Content-Security-Policy` estricta (permitir solo Turnstile y la analítica), `X-Content-Type-Options`, `Referrer-Policy`, `Permissions-Policy`.
- Contraseñas con Argon2id. Sesiones en cookie `HttpOnly`. Protección CSRF en rutas del panel (token doble o verificación de `Origin`).
- CORS solo para el dominio propio.
- Dos buckets: `sei-public` (fotos de obras, detrás de CDN) y `sei-private` (archivos de leads, sin acceso público, solo URLs firmadas).
- SQLAlchemy con parámetros siempre; nada de SQL armado con strings.
- Usuario de base con permisos mínimos para la API; otro para migraciones.
- Copia diaria con `pg_dump` cifrada a R2, 30 días de retención, y un script documentado de restauración.
- Crear el primer admin por comando (`make create-admin`), nunca con credenciales por defecto.

**SEO**

- Componente `<Seo>` en `BaseLayout`: `title` (máx. 60 caracteres, formato "… | S.E.I. Ing. Federico Delgado"), `description` (máx. 155), canonical, Open Graph y Twitter con imagen 1200×630 por página (generada en build si no hay una).
- JSON-LD: `ProfessionalService` con `areaServed` (Argentina y las 4 provincias foco), dirección y teléfono; `Person` para Federico; `Article` en artículos; `FAQPage` en las páginas de servicio; `BreadcrumbList` en fichas.
- `@astrojs/sitemap`, `robots.txt` (bloquear `/admin` y `/api`), URLs en español con guiones y sin barras finales.
- Un H1 por página, jerarquía de títulos correcta, texto alternativo descriptivo en cada imagen.
- Redirecciones 301 desde las URLs del sitio actual servielect.com.ar (relevarlas antes del lanzamiento; `TODO`).
- Analítica sin cookies (Plausible o Umami autoalojado), con eventos: `lead_enviado`, `whatsapp_click`, `simulador_usado`.

**Rendimiento**

- Lighthouse en celular: 90 o más en Rendimiento, Accesibilidad, Buenas prácticas y SEO en todas las páginas públicas. LCP menor a 2,5 s, CLS menor a 0,1.
- Imágenes con `<picture>` (AVIF, WebP), `srcset`, `width`/`height` siempre, `loading="lazy"` salvo la principal.
- Fuentes autoalojadas con `font-display: swap` y subconjunto latino.
- Islas con `client:visible` o `client:idle`; solo el formulario y el panel con `client:load`.

## 9. Fases y criterios de aceptación

Trabajá una fase por vez. Al terminar cada una, verificá todos sus criterios, escribí un resumen (qué hiciste, cómo probarlo, qué quedó pendiente) y **detenete a esperar aprobación** antes de seguir.

### Fase 1: Base

Repo, Docker Compose, modelos y migraciones, semillas, sistema de diseño (colores, tipografía, botones, tarjetas, formularios), `BaseLayout` con encabezado, pie y WhatsApp flotante, CI.

- [ ] `make dev` levanta todo desde cero en una máquina limpia con solo Docker instalado
- [ ] `alembic upgrade head` crea las 11 tablas; `make seed` carga los datos de ejemplo
- [ ] `GET /api/health` responde 200 con la base conectada
- [ ] Página `/estilos` (solo en desarrollo) muestra todos los componentes base
- [ ] CI ejecuta lint (ruff, eslint), tipos (mypy o pyright, `astro check`) y tests, y pasa en verde

### Fase 2: Sitio público

Todas las páginas públicas de la sección 6 con sus textos, galería y fichas leyendo de la API en build, artículos, simulador de repago, calculadora de cos φ, mapa de cobertura, SEO completo.

- [ ] Todas las rutas existen y se ven bien en 360, 768 y 1440 px
- [ ] `astro build` genera las fichas de obra y artículos desde la API
- [ ] Lighthouse en celular 90+ en las 4 categorías en Inicio, Obras, una ficha y un artículo
- [ ] Validador de datos estructurados de Google sin errores en Inicio, un servicio y un artículo
- [ ] Simulador y calculadora con tests unitarios de sus fórmulas
- [ ] Navegación completa con teclado; sin errores de axe

### Fase 3: Diagnóstico Exprés

Formulario de 3 pasos, `POST /api/leads`, almacenamiento privado, captcha, emails, páginas legales.

- [ ] Envío completo con factura y presupuesto funciona en escritorio y en un celular real
- [ ] Un archivo `.exe` renombrado a `.pdf` es rechazado; uno de 16 MB también, con mensaje claro
- [ ] El sexto envío en una hora desde la misma IP es rechazado con 429
- [ ] El archivo no es accesible por URL pública; solo por URL firmada
- [ ] Federico recibe el email de aviso y el cliente el de confirmación (probado con Mailpit en local)
- [ ] Tests de integración del endpoint: caso feliz, validaciones, captcha inválido, límite de envíos

### Fase 4: Panel, galería y artículos

Ingreso, consultas, obras con fotos, artículos, testimonios, configuración, regeneración del sitio.

- [ ] Desde un celular se crea una obra, se suben 10 fotos con la cámara, se elige portada y se publica
- [ ] La obra aparece en `/obras` en menos de 2 minutos sin intervención manual
- [ ] Las fotos publicadas no tienen metadatos GPS (verificado con exiftool en un test)
- [ ] Cambiar el estado de una consulta deja registro en su historial
- [ ] Sin sesión, todas las rutas `/api/admin/*` devuelven 401
- [ ] Tests de permisos para cada router del panel

### Fase 5: Producción y lanzamiento

`docker-compose.prod.yml`, Caddy con dominio real, R2, backups, monitoreo, deploy automático desde `main`, redirecciones del sitio viejo.

- [ ] Deploy con un solo comando o al fusionar en `main`
- [ ] Copia de seguridad diaria creada y restauración probada en un entorno limpio
- [ ] securityheaders.com con calificación A o superior
- [ ] Monitoreo de disponibilidad (Uptime Kuma o similar) y alertas por email
- [ ] `README.md` con: levantar en local, variables de entorno, deploy, restaurar backup, crear admin
- [ ] Guía corta para Federico (`docs/guia-panel.md`) con capturas: subir una obra, responder una consulta, publicar un artículo

## 10. Convenciones de trabajo

- **Idioma**: código, nombres de variables y commits en inglés; textos visibles, slugs y contenido en español. Los nombres de campos de la base pueden quedar en español como en la sección 4.
- **Git**: una rama por fase (`fase-1-base`, …), commits chicos con Conventional Commits (`feat(api): add lead upload endpoint`), un PR por fase con descripción, capturas y cómo probar. No hagas `push --force` sobre `main`.
- **Python**: ruff (lint y formato), tipado en todo, pytest con base de datos real en contenedor (no mocks de la base), cobertura mínima 80% en `routers` y `services`.
- **Frontend**: TypeScript estricto, eslint + prettier, componentes chicos, nada de estilos en línea salvo variables CSS. Textos largos en `src/content`, no en los componentes.
- **Configuración**: toda variable nueva va a `config.py` y a `.env.example` con un comentario.
- **Dependencias**: antes de agregar una, verificá que no se resuelva con lo que ya hay; fijá versiones.
- **Pendientes**: lo que dependa de Federico se marca `TODO(federico): <qué falta>` y se lista al final de cada resumen de fase. Lista actual: logo, número de WhatsApp, dominio definitivo, foto de perfil, fotos de obras, trayectoria y métricas reales, testimonios, alcance de su servicio en el MEM, límite de tg φ según distribuidora, textos legales, URLs del sitio actual.
- **Ante dudas**: si una decisión cambia el alcance, el stack o algo visible para el cliente, preguntá. Si es un detalle técnico interno, decidí, documentá el porqué en el PR y seguí.
