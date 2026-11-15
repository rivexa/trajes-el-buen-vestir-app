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
| `CORS_ORIGIN` | no | Orígenes del admin separados por coma. Sin valor = CORS abierto (solo local) |
| `SRI_ENVIRONMENT` | sí* | `pruebas` o `produccion` (*para emitir) |
| `SRI_CERT_BASE64` | no | `.p12` en base64 si no hay archivo local |

Ejemplo CORS en deploy:

```bash
CORS_ORIGIN=http://localhost:5173,https://admin.tudominio.com
```

## Auth admin (JWT)

1. Ejecuta en Supabase SQL Editor: [`sql/003_usuarios.sql`](sql/003_usuarios.sql) y recarga el schema del API.
2. Usuario seed de prueba:
   - **usuario:** `admin`
   - **password:** `Admin123!`
   - Cámbialo en producción.
3. Login y APIs del panel usan `Authorization: Bearer <access_token>`.
4. `POST /auth/login` es público y tiene rate limit (5 intentos / minuto por IP). El resto de rutas exige JWT.

Las respuestas de auth nunca incluyen `password_hash` (solo `id`, `nombre`, `rol` / `usuario` en `/auth/me`).

### Probar con curl

```bash
# Login
curl -s -X POST http://localhost:3000/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"usuario":"admin","password":"Admin123!"}'

# Sesión
TOKEN='pega_access_token_aqui'
curl -s http://localhost:3000/auth/me -H "Authorization: Bearer $TOKEN"

# Endpoint protegido
curl -s http://localhost:3000/dashboard -H "Authorization: Bearer $TOKEN"

# Sin token → 401
curl -si http://localhost:3000/dashboard | head -n 1
```

## Scripts

```bash
npm run start:dev   # desarrollo
npm run build
npm run start:prod
npm test
npm run lint
```
