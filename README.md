# Centro de Redes · Departamento de Filosofía UNAL

Aplicación web para manejar desde un solo lugar las redes del Departamento: Facebook, Instagram, YouTube, LinkedIn y X.

- **Publicar**: se escribe una vez, se eligen las redes y el formato (publicación, historia, reel o video), se suben las piezas gráficas y se ve una vista previa por red. La app avisa si el texto o los archivos no cumplen las reglas de alguna red.
- **Aprobar**: nada sale sin visto bueno. Los editores envían a revisión; aprobadores y administradores aprueban, rechazan con motivo o programan. Un ajuste permite que quien aprueba apruebe lo suyo (activo por defecto).
- **Comentarios**: bandeja única con los comentarios de todas las redes, su publicación de origen y el hilo. Se responde, se oculta o se archiva desde la app.
- **Estadísticas**: panorama global (seguidores, alcance, interacciones, tasa de interacción, composición de la audiencia, mejores publicaciones) y una página por red, en periodos de 7, 28 o 90 días.
- **Modo demostración**: cada red puede probarse con una cuenta simulada mientras llegan las credenciales reales. Al conectar la cuenta real, la de demostración se retira sola.

## Seguridad

| Capa | Qué hace |
|---|---|
| Contraseñas | Argon2id (parámetros OWASP), mínimo 12 caracteres con tres tipos de caracteres, sin nombre ni correo |
| Dos pasos | TOTP obligatorio para todas las cuentas (Google/Microsoft Authenticator), con 10 códigos de recuperación de un solo uso y protección contra reutilizar un código |
| Bloqueos | 5 fallos bloquean la cuenta 15 minutos; 20 fallos desde una IP la bloquean 15 minutos; respuestas iguales exista o no el correo |
| Sesiones | Token aleatorio guardado como hash, cookie `__Host-` HttpOnly + Secure + SameSite, cierre por 2 h de inactividad y 12 h máximo, token nuevo al pasar el segundo factor; se pueden ver y cerrar desde Mi cuenta |
| Permisos | Cuatro roles (administrador, aprobador, editor, solo lectura) verificados en el servidor en cada página y cada acción |
| Datos sensibles | Tokens de las redes y secretos 2FA cifrados con AES-256-GCM en la base de datos |
| Navegador | CSP con nonce por petición, HSTS, anti-iframe, nosniff, verificación de origen en rutas API (CSRF) |
| Archivos | Tipo comprobado por los bytes reales, límites de tamaño, URLs firmadas y temporales para que las redes descarguen las piezas |
| Bitácora | Cada ingreso, publicación, aprobación, respuesta y cambio queda registrado; la tabla no admite cambios ni borrados (lo impide un trigger de Postgres) |

## Desplegar en Vercel

1. **Sube el código** a un repositorio privado de GitHub (o usa `npx vercel` desde esta carpeta).
2. En Vercel: **Add New → Project**, importa el repositorio. Framework: Next.js (se detecta solo).
3. Antes del primer despliegue, en el proyecto ve a **Storage**:
   - **Create Database → Neon (Postgres)** y conéctala al proyecto. Esto crea `DATABASE_URL`.
   - **Create → Blob** y conéctalo. Esto crea `BLOB_READ_WRITE_TOKEN` (necesario para videos).
4. En **Settings → Environment Variables** agrega `ENCRYPTION_KEY`, `SETUP_TOKEN` y `CRON_SECRET` (ver `.env.example`). Marca `ENCRYPTION_KEY` como *Sensitive* y guarda una copia en un lugar seguro.
5. **Deploy**. El build aplica las migraciones de la base de datos automáticamente.
6. Abre la URL, entra a **/configuracion-inicial**, escribe el `SETUP_TOKEN` y crea tu cuenta de administrador. Configura la verificación en dos pasos y guarda los códigos de recuperación.
7. En **Cuentas de redes** puedes empezar con cuentas de demostración.

## Conectar las redes reales

En **Cuentas de redes** está la dirección de retorno exacta de cada proveedor. Por red:

- **Facebook e Instagram (Meta)**: crear una app tipo *Business* en developers.facebook.com, agregar *Facebook Login for Business*, e Instagram debe ser cuenta profesional vinculada a la página. Para usar la app con cuentas que no sean administradoras de la app de Meta, Meta exige *App Review* de los permisos `pages_manage_posts`, `pages_manage_engagement`, `instagram_content_publish`, `instagram_manage_comments` e `instagram_manage_insights`.
- **YouTube (Google)**: proyecto en Google Cloud con *YouTube Data API v3* y *YouTube Analytics API*, cliente OAuth tipo *Aplicación web*. Mientras la app esté en modo prueba, agregar el correo dueño del canal como usuario de prueba.
- **LinkedIn**: app en linkedin.com/developers asociada a la página del Departamento, con el producto *Community Management API* (LinkedIn lo aprueba manualmente).
- **X**: proyecto en developer.x.com con OAuth 2.0 (tipo *Web App, confidential client*). Leer menciones y respuestas requiere un plan de pago de la API de X; publicar funciona en el plan gratuito con límites.

Después de agregar las variables, vuelve a desplegar y pulsa **Conectar** en cada red.

## Tareas automáticas

`vercel.json` programa una sincronización diaria y una revisión diaria de publicaciones programadas (el plan gratuito de Vercel solo permite tareas diarias). Además, cada vez que alguien abre la app se publican las programadas que ya vencieron. Para publicar a la hora exacta, un servicio como cron-job.org puede llamar cada 5 minutos a `GET /api/cron/publicar` con la cabecera `Authorization: Bearer <CRON_SECRET>`.

## Relevo del cargo

En **Usuarios**, crea la cuenta de quien te reemplaza con rol de administrador (recibe una contraseña temporal que debe cambiar y debe activar sus dos pasos). Después desactiva tu cuenta o cámbiala a solo lectura. Debe quedar siempre al menos un administrador activo.

## Desarrollo local

```bash
npm install
cp .env.example .env.local      # llenar DATABASE_URL, ENCRYPTION_KEY, SETUP_TOKEN, CRON_SECRET
npm run db:migrate
npm run dev
```

Estructura: `src/app` (páginas y acciones), `src/lib` (seguridad, base de datos, estadísticas, publicador), `src/lib/conectores` (una integración por red más la de demostración), `db/migrations` (esquema SQL).
