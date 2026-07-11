/**
 * Cloud Functions — LF Acceso Style — Fase B (envío automático por WhatsApp)
 * ============================================================================
 * NO ACTIVO hasta que configures las credenciales de WhatsApp Cloud API (Meta).
 * Mientras tanto, la tienda funciona igual (Fase A): el checkout público y el
 * panel admin ya muestran enlaces `wa.me` de respaldo, así que ningún pedido
 * queda bloqueado por no tener esto desplegado.
 *
 * Qué hace cada función:
 *  - notifySupplierOnOrderCreate: al crearse un pedido, envía al PROVEEDOR
 *    (WHATSAPP_SUPPLIER_PHONE) las specs del producto + imagen, para que sepa
 *    qué armar.
 *  - notifyCustomerOnStatusChange: cuando el admin cambia el estado del
 *    pedido (nuevo → armando → listo → en_camino → entregado), avisa al
 *    CLIENTE que compró, vía plantilla aprobada por Meta.
 *
 * Requisitos antes de desplegar (ver docs/whatsapp-setup.md):
 *  1. Verificación de Meta Business para el negocio.
 *  2. Número de WhatsApp Business Platform (Cloud API) — no el WhatsApp
 *     personal actual.
 *  3. Plantillas de mensaje aprobadas por Meta: una para el proveedor y una
 *     por cada estado de pedido hacia el cliente.
 *  4. Plan Blaze en el proyecto Firebase (las Cloud Functions no corren en
 *     el plan gratuito Spark).
 *  5. Configurar los secrets/parámetros de abajo:
 *       firebase functions:secrets:set WHATSAPP_TOKEN
 *       firebase functions:secrets:set WHATSAPP_PHONE_NUMBER_ID
 *     y las variables de entorno (functions/.env, no versionar):
 *       WHATSAPP_SUPPLIER_PHONE=56912345678
 *       TEMPLATE_SUPPLIER_NEW_ORDER=nombre_de_la_plantilla
 *       TEMPLATE_STATUS_ARMANDO=nombre_de_la_plantilla
 *       TEMPLATE_STATUS_LISTO=nombre_de_la_plantilla
 *       TEMPLATE_STATUS_EN_CAMINO=nombre_de_la_plantilla
 *       TEMPLATE_STATUS_ENTREGADO=nombre_de_la_plantilla
 * ============================================================================
 */
const { onDocumentCreated, onDocumentUpdated } = require('firebase-functions/v2/firestore');
const { defineSecret } = require('firebase-functions/params');
const logger = require('firebase-functions/logger');
const admin = require('firebase-admin');

admin.initializeApp();

const WHATSAPP_TOKEN = defineSecret('WHATSAPP_TOKEN');
const WHATSAPP_PHONE_NUMBER_ID = defineSecret('WHATSAPP_PHONE_NUMBER_ID');

const GRAPH_API_VERSION = 'v19.0';

/** Llama a la WhatsApp Cloud API de Meta para enviar un mensaje de plantilla. */
async function sendWhatsAppTemplate({ token, phoneNumberId, to, templateName, components }) {
  if (!token || !phoneNumberId || !templateName || !to) {
    logger.warn('WhatsApp no configurado del todo — se omite el envío.', { hasToken: !!token, hasPhoneId: !!phoneNumberId, templateName, to });
    return { skipped: true };
  }
  const url = `https://graph.facebook.com/${GRAPH_API_VERSION}/${phoneNumberId}/messages`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      messaging_product: 'whatsapp',
      to,
      type: 'template',
      template: { name: templateName, language: { code: 'es' }, components },
    }),
  });
  const data = await res.json();
  if (!res.ok) logger.error('Error enviando WhatsApp:', data);
  return data;
}

/** Nuevo pedido → aviso al proveedor con specs + imagen para que arme el producto. */
exports.notifySupplierOnOrderCreate = onDocumentCreated(
  { document: 'orders/{orderId}', secrets: [WHATSAPP_TOKEN, WHATSAPP_PHONE_NUMBER_ID] },
  async (event) => {
    const order = event.data?.data();
    if (!order) return;

    const supplierPhone = process.env.WHATSAPP_SUPPLIER_PHONE;
    const templateName = process.env.TEMPLATE_SUPPLIER_NEW_ORDER;
    if (!supplierPhone || !templateName) {
      logger.info('Fase B no configurada aún (proveedor) — el admin debe reenviar manualmente por wa.me.');
      return;
    }

    const firstItem = order.items?.[0];
    const itemsSummary = (order.items || [])
      .map(it => `${it.name} (Talla ${it.size} x${it.qty})`)
      .join(', ');

    const components = [
      firstItem?.imageUrl
        ? { type: 'header', parameters: [{ type: 'image', image: { link: firstItem.imageUrl } }] }
        : null,
      {
        type: 'body',
        parameters: [
          { type: 'text', text: String(order.orderNumber) },
          { type: 'text', text: itemsSummary },
          { type: 'text', text: order.customerName || '' },
          { type: 'text', text: order.address || '' },
        ],
      },
    ].filter(Boolean);

    await sendWhatsAppTemplate({
      token: WHATSAPP_TOKEN.value(),
      phoneNumberId: WHATSAPP_PHONE_NUMBER_ID.value(),
      to: supplierPhone,
      templateName,
      components,
    });
  }
);

/** Cambio de estado del pedido → aviso al cliente con la plantilla correspondiente. */
exports.notifyCustomerOnStatusChange = onDocumentUpdated(
  { document: 'orders/{orderId}', secrets: [WHATSAPP_TOKEN, WHATSAPP_PHONE_NUMBER_ID] },
  async (event) => {
    const before = event.data?.before?.data();
    const after = event.data?.after?.data();
    if (!before || !after || before.status === after.status) return;

    const TEMPLATE_BY_STATUS = {
      armando: process.env.TEMPLATE_STATUS_ARMANDO,
      listo: process.env.TEMPLATE_STATUS_LISTO,
      en_camino: process.env.TEMPLATE_STATUS_EN_CAMINO,
      entregado: process.env.TEMPLATE_STATUS_ENTREGADO,
    };
    const templateName = TEMPLATE_BY_STATUS[after.status];
    if (!templateName || !after.customerPhone) {
      logger.info(`Fase B no configurada aún (estado "${after.status}") — el admin debe avisar manualmente por wa.me.`);
      return;
    }

    await sendWhatsAppTemplate({
      token: WHATSAPP_TOKEN.value(),
      phoneNumberId: WHATSAPP_PHONE_NUMBER_ID.value(),
      to: after.customerPhone,
      templateName,
      components: [
        { type: 'body', parameters: [{ type: 'text', text: after.customerName || '' }, { type: 'text', text: String(after.orderNumber) }] },
      ],
    });
  }
);
