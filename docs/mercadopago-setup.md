# Checklist — Pago con Mercado Pago (Checkout Pro)

La tienda **ya funciona hoy sin esto** (transferencia bancaria). Esta
checklist es para cuando quieran aceptar Mercado Pago también. Ningún paso lo
puedo hacer yo — son cuentas y credenciales que solo el dueño del negocio
puede generar.

## Por qué no es un simple link

Un "link de pago" de Mercado Pago tiene un monto fijo — solo sirve para un
producto a un precio exacto. Como el carrito puede tener varios productos o
varias unidades, se usa **Checkout Pro**: un link que se genera al momento,
con el total exacto del carrito de cada pedido.

## 1. Cuenta en Mercado Pago Developers
- [ ] Crear/entrar en https://www.mercadopago.cl/developers con la cuenta de
      Mercado Pago del negocio.
- [ ] Crear una aplicación ("Tus integraciones" → "Crear aplicación").
- [ ] Copiar el **Access Token** de producción (Producción, no el de prueba,
      cuando estén listos para cobrar de verdad).

## 2. Configurar y desplegar la Edge Function
```bash
supabase functions deploy create-mp-preference
supabase secrets set MP_ACCESS_TOKEN=tu_access_token_de_produccion
```

## 3. Habilitar en el panel admin
- [ ] Entrar a `admin.html` → Configuración → tildar "Habilitar Mercado Pago
      como método de pago".

## 4. Probar
- [ ] Hacer un pedido de prueba eligiendo Mercado Pago → confirmar que se
      abre Mercado Pago en otra pestaña con el monto correcto del carrito.
- [ ] Pagar (o usar credenciales de prueba de Mercado Pago) y verificar en tu
      cuenta de Mercado Pago que el pago aparece con la referencia externa
      igual al número de pedido (ej. `LF-123456`) — así sabes qué pedido
      corresponde a cada pago.
- [ ] En el panel admin (Pedidos), confirmar que el pedido queda "pendiente
      de revisión" y que podés Aceptar o Rechazar después de verificar el
      pago en tu cuenta de Mercado Pago.

---
Mientras estos pasos no estén completos, el botón de Mercado Pago en el
checkout queda deshabilitado y solo se puede pagar por transferencia.
