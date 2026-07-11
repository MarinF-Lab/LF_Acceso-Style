# Checklist — Envío automático de WhatsApp (Fase B)

La tienda **ya funciona hoy sin esto** (Fase A: enlaces `wa.me` prellenados
que tú o el cliente tocan "Enviar"). Esta checklist es para cuando quieran
pasar al envío 100% automático. Ningún paso lo puedo hacer yo — son cuentas
y verificaciones que solo el dueño del negocio puede completar.

## 1. Crear el proyecto Firebase real
- [ ] Crear proyecto en https://console.firebase.google.com (gratis).
- [ ] Habilitar **Firestore Database** y **Storage**.
- [ ] Copiar las claves del SDK a `firebase-config.js` (reemplazar los
      valores `REEMPLAZAR_...`).
- [ ] Subir las reglas: `firebase deploy --only firestore:rules,storage`.
- [ ] Activar el plan **Blaze** (pago por uso) — requerido para Cloud
      Functions. Tiene cuota gratuita mensual generosa; solo se cobra si se
      supera.

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

## 4. Configurar y desplegar las Cloud Functions
```bash
cd jumpseller/disenos-origen/cliente-2
firebase functions:secrets:set WHATSAPP_TOKEN
firebase functions:secrets:set WHATSAPP_PHONE_NUMBER_ID
cp functions/.env.example functions/.env   # y completar con datos reales
firebase deploy --only functions
```

## 5. Probar
- [ ] Crear un pedido de prueba en la tienda → confirmar que el proveedor
      recibe el WhatsApp automático con la imagen.
- [ ] Cambiar el estado del pedido en el admin → confirmar que el cliente
      recibe el WhatsApp correspondiente a cada estado.

---
Mientras estos pasos no estén completos, todo sigue funcionando por el
enlace `wa.me` manual ya implementado en `admin.js` (Pedidos) y en el
checkout de `script.js`.
