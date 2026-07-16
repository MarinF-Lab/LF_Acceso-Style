# Setup de Supabase — LF Acceso Style

Reemplaza Firestore + Storage + Cloud Functions de Firebase (bloqueados sin
plan Blaze / tarjeta de crédito) por Supabase (plan gratis, sin tarjeta).

## Pasos

1. Crear cuenta y proyecto en https://supabase.com/dashboard (plan **Free**).
2. En el proyecto: **SQL Editor** → pegar el contenido completo de
   `schema.sql` → **Run**. Esto crea las tablas `products`, `categories`,
   `orders`, `settings`, sus políticas de seguridad (RLS) y el bucket de
   Storage `products`.
3. En **Storage** → confirmar que el bucket `products` existe y quedó
   marcado como público.
4. En **Settings → API** → copiar **Project URL** y **anon public key**.
5. Pegar esos dos valores en `../supabase-config.js`, reemplazando
   `REEMPLAZAR_CON_TU_PROJECT_URL` y `REEMPLAZAR_CON_TU_ANON_KEY`.
6. Abrir `index.html` (o publicar en GitHub Pages) y probar: el catálogo
   debería cargar, y desde `admin.html` (contraseña `lfacceso2026` por
   defecto) deberías poder crear productos con imagen, ver pedidos y editar
   la configuración/textos de la tienda.

## Login de clientes (magic link) — paso obligatorio

El checkout ahora exige que el cliente inicie sesión con su email antes de
pagar (link mágico, sin contraseña). Para que el link del correo redirija de
vuelta a tu sitio (y no a `localhost`):

1. En el dashboard de Supabase: **Authentication → URL Configuration**.
2. En **Site URL**, poné la URL real de tu sitio (ej. `https://tuusuario.github.io/turepo/`).
3. En **Redirect URLs**, agregá esa misma URL (y `http://localhost:8000/` o el
   puerto que uses si vas a probar en local).
4. Sin este paso, el botón "Enviar link" funciona pero el correo puede
   redirigir a una URL que no existe.

No hace falta configurar nada más: el proveedor de email de Supabase viene
activado por defecto y alcanza para el volumen de una tienda chica.

## Envío automático de WhatsApp (opcional, Fase B)

No es necesario para que la tienda funcione — hoy usa enlaces `wa.me`
manuales. Si más adelante quieren automatizarlo, ver `functions/notify-whatsapp/`
y `../docs/whatsapp-setup.md`.

## Nota de seguridad

Igual que en el proyecto Firebase original, el panel admin usa una
contraseña local (no hay Supabase Auth todavía), por lo que las políticas
RLS quedan abiertas para lectura/escritura. Ver el comentario al inicio de
`schema.sql` para el camino de blindaje futuro (Supabase Auth + políticas
por rol).
