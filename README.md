# Trajes El Buen Vestir — API

Backend NestJS para el panel admin (clientes, órdenes, facturación electrónica SRI).

## Setup

```bash
npm install
cp .env.example .env   # si existe; o crea .env con las variables de abajo
npm run start:dev
```

Swagger: `http://localhost:3000/api/docs`

## Variables de entorno

| Variable | Requerida | Descripción |
|---|---|---|
| `PORT` | no | Puerto HTTP (default `3000`) |
| `SUPABASE_URL` | sí | URL del proyecto Supabase |
| `SUPABASE_KEY` | sí | Service role / key del API |
| `JWT_SECRET` | sí | Secreto para firmar tokens del panel |
| `JWT_EXPIRES_IN` | no | Expiración JWT (default `12h`, formato `ms`) |
| `CORS_ORIGIN` | no | Orígenes del admin separados por coma |
| `SRI_ENVIRONMENT` | sí* | `pruebas` o `produccion` (*para emitir) |
| `SRI_CERT_BASE64` | no | `.p12` en base64 si no hay archivo local |
| `EVOLUTION_API_URL` | no* | Base URL Evolution API en la VPS |
| `EVOLUTION_API_KEY` | no* | API key Evolution |
| `EVOLUTION_INSTANCE` | no* | Nombre de instancia WhatsApp |
| `NEGOCIO_EMAIL` | no* | Correo del negocio (recordatorios) |
| `NEGOCIO_WHATSAPP` | no* | Celular del negocio (recordatorios Evolution) |
| `SMTP_HOST` | no* | SMTP para correos |
| `SMTP_PORT` | no | Default `587` |
| `SMTP_USER` / `SMTP_PASS` / `SMTP_FROM` | no* | Credenciales SMTP |

## Auth admin (JWT)

1. Ejecuta [`sql/003_usuarios.sql`](sql/003_usuarios.sql) y recarga el schema.
2. Seed: `admin` / `Admin123!` (cámbialo en producción).
3. APIs del panel: `Authorization: Bearer <token>`.
4. `POST /auth/login` es público (rate limit 5/min).

## Órdenes (estado por línea)

Ejecuta [`sql/004_orden_detalles_estado_fecha.sql`](sql/004_orden_detalles_estado_fecha.sql).

## Mensajería

Ejecuta [`sql/005_mensaje_envios.sql`](sql/005_mensaje_envios.sql).

### WhatsApp al cliente (Evolution)

Al cambiar estado de línea:
- **Listo para Prueba** / **Terminado** → texto al celular del cliente.
- Pendiente / En Confección / Entregado / Anulada → sin mensaje.

### Recordatorio al negocio (no al cliente)

Job horario: líneas con `fecha_entrega = hoy+2` (Ecuador).
Avisa al negocio por **correo** (`NEGOCIO_EMAIL`) y **WhatsApp Evolution** (`NEGOCIO_WHATSAPP`).

### Reintentos

- `GET /mensajes/fallidos`
- `POST /mensajes/:id/reintentar` — reintenta avisos WhatsApp de estado o recordatorios al negocio.

Click-to-chat (`wa.me`) lo arma el **front** con el teléfono del cliente; no hay endpoint dedicado.

### Probar con curl

```bash
curl -s -X POST http://localhost:3000/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"usuario":"admin","password":"Admin123!"}'
```

## Scripts

```bash
npm run start:dev
npm run build
npm run start:prod
npm test
npm run lint
```
