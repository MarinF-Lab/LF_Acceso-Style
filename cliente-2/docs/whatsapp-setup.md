# Checklist — Envío automático de WhatsApp (Fase B)

La tienda **ya funciona hoy sin esto** (Fase A: enlaces `wa.me` prellenados
que tú o el cliente tocan "Enviar"). Esta checklist es para cuando quieran
pasar al envío 100% automático. Ningún paso lo puedo hacer yo — son cuentas
y verificaciones que solo el dueño del negocio puede completar.

## 1. Crear el proyecto Supabase real
- [ ] Crear proyecto en https://supabase.com (gratis, sin tarjeta).
- [ ] Ejecutar `supabase/schema.sql` en el SQL Editor (crea tablas, políticas
      y el bucket de Storage).
- [ ] Copiar Project URL y anon public key a `supabase-config.js` (reemplazar
      los valores `REEMPLAZAR_...`).

## 2. Meta Business + WhatsApp Business Platform
- [ ] Crear/verificar una cuenta de **Meta Business Suite**
      (business.facebook.com) con los documentos legales del negocio.
- [ ] Dentro de Meta Business, crear una app y agregar el producto
      **WhatsApp**.
- [ ] Registrar un **número de teléfono dedicado** para la API (⚠️ no puede
      ser el WhatsApp personal actual del dueño — ese número queda
      inhabilitado para la app normal de WhatsApp una vez migrado).
- [ ] Generar un **token de acceso permanente** (system user token, no el
      token temporal de prueba).
- [ ] Anotar el **Phone Number ID** que entrega Meta (no es el número de
      teléfono, es un ID interno).

## 3. Plantillas de mensaje (deben aprobarse antes de usarse)
Meta exige plantillas pre-aprobadas para mensajes que el negocio inicia
(no son respuesta a un mensaje del cliente). Crear estas 5, en español,
y esperar aprobación (típicamente 1–2 días hábiles):

- [ ] `nuevo_pedido_proveedor` — al proveedor, con imagen del producto.
- [ ] `pedido_armando` — al cliente.
- [ ] `pedido_listo` — al cliente.
- [ ] `pedido_en_camino` — al cliente.
- [ ] `pedido_entregado` — al cliente.

## 4. Configurar y desplegar la Edge Function
```bash
cd cliente-2
supabase functions deploy notify-whatsapp
supabase secrets set WHATSAPP_TOKEN=... WHATSAPP_PHONE_NUMBER_ID=... \
  WHATSAPP_SUPPLIER_PHONE=... TEMPLATE_SUPPLIER_NEW_ORDER=... \
  TEMPLATE_STATUS_ARMANDO=... TEMPLATE_STATUS_LISTO=... \
  TEMPLATE_STATUS_EN_CAMINO=... TEMPLATE_STATUS_ENTREGADO=...
```
- [ ] En el dashboard de Supabase: **Database → Webhooks** → crear un webhook
      sobre la tabla `orders` (eventos Insert y Update) que llame a la URL de
      la función `notify-whatsapp`.

## 5. Probar
- [ ] Crear un pedido de prueba en la tienda → confirmar que el proveedor
      recibe el WhatsApp automático con la imagen.
- [ ] Cambiar el estado del pedido en el admin → confirmar que el cliente
      recibe el WhatsApp correspondiente a cada estado.

---
Mientras estos pasos no estén completos, todo sigue funcionando por el
enlace `wa.me` manual ya implementado en `admin.js` (Pedidos) y en el
checkout de `script.js`.
