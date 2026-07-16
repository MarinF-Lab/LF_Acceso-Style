// Edge Function — LF Acceso Style — Fase B (envío automático por WhatsApp)
// ============================================================================
// NO ACTIVA hasta que configures las credenciales de WhatsApp Cloud API (Meta)
// y conectes un Database Webhook. Mientras tanto, la tienda funciona igual
// (Fase A): el checkout público y el panel admin ya muestran enlaces `wa.me`
// de respaldo, así que ningún pedido queda bloqueado por no tener esto
// desplegado.
//
// Reemplaza a functions/index.js (Firebase Cloud Functions). En vez de
// triggers de Firestore (onDocumentCreated / onDocumentUpdated), esta función
// se invoca vía Database Webhooks de Supabase (Database → Webhooks), que
// llaman a esta URL en cada INSERT/UPDATE de la tabla "orders" con un payload
// { type, table, record, old_record }.
//
// Requisitos antes de desplegar (ver docs/whatsapp-setup.md):
//  1. Verificación de Meta Business para el negocio.
//  2. Número de WhatsApp Business Platform (Cloud API) — no el WhatsApp
//     personal actual.
//  3. Plantillas de mensaje aprobadas por Meta: una para el proveedor y una
//     por cada estado de pedido hacia el cliente.
//  4. Configurar los secrets (Supabase Dashboard → Edge Functions → Secrets,
//     o `supabase secrets set`):
//       WHATSAPP_TOKEN, WHATSAPP_PHONE_NUMBER_ID, WHATSAPP_SUPPLIER_PHONE,
//       TEMPLATE_SUPPLIER_NEW_ORDER, TEMPLATE_STATUS_ARMANDO,
//       TEMPLATE_STATUS_LISTO, TEMPLATE_STATUS_EN_CAMINO,
//       TEMPLATE_STATUS_ENTREGADO
//  5. Crear un Database Webhook en la tabla "orders" (eventos Insert y
//     Update) apuntando a esta función.
// ============================================================================

const GRAPH_API_VERSION = 'v19.0';

const TEMPLATE_BY_STATUS: Record<string, string | undefined> = {
  armando: Deno.env.get('TEMPLATE_STATUS_ARMANDO'),
  listo: Deno.env.get('TEMPLATE_STATUS_LISTO'),
  en_camino: Deno.env.get('TEMPLATE_STATUS_EN_CAMINO'),
  entregado: Deno.env.get('TEMPLATE_STATUS_ENTREGADO'),
};

async function sendWhatsAppTemplate({ to, templateName, components }: {
  to: string; templateName: string; components: unknown[];
}) {
  const token = Deno.env.get('WHATSAPP_TOKEN');
  const phoneNumberId = Deno.env.get('WHATSAPP_PHONE_NUMBER_ID');
  if (!token || !phoneNumberId || !templateName || !to) {
    console.warn('WhatsApp no configurado del todo — se omite el envío.', { hasToken: !!token, hasPhoneId: !!phoneNumberId, templateName, to });
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
  if (!res.ok) console.error('Error enviando WhatsApp:', data);
  return data;
}

/** Nuevo pedido → aviso al proveedor con specs + imagen para que arme el producto. */
async function notifySupplierOnOrderCreate(order: Record<string, any>) {
  const supplierPhone = Deno.env.get('WHATSAPP_SUPPLIER_PHONE');
  const templateName = Deno.env.get('TEMPLATE_SUPPLIER_NEW_ORDER');
  if (!supplierPhone || !templateName) {
    console.info('Fase B no configurada aún (proveedor) — el admin debe reenviar manualmente por wa.me.');
    return;
  }

  const firstItem = order.items?.[0];
  const itemsSummary = (order.items || [])
    .map((it: any) => `${it.name} (Talla ${it.size} x${it.qty})`)
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

  await sendWhatsAppTemplate({ to: supplierPhone, templateName, components });
}

/** Cambio de estado del pedido → aviso al cliente con la plantilla correspondiente. */
async function notifyCustomerOnStatusChange(before: Record<string, any>, after: Record<string, any>) {
  if (!before || !after || before.status === after.status) return;

  const templateName = TEMPLATE_BY_STATUS[after.status];
  if (!templateName || !after.customerPhone) {
    console.info(`Fase B no configurada aún (estado "${after.status}") — el admin debe avisar manualmente por wa.me.`);
    return;
  }

  await sendWhatsAppTemplate({
    to: after.customerPhone,
    templateName,
    components: [
      { type: 'body', parameters: [{ type: 'text', text: after.customerName || '' }, { type: 'text', text: String(after.orderNumber) }] },
    ],
  });
}

Deno.serve(async (req) => {
  const payload = await req.json();
  const { type, record, old_record } = payload;

  if (type === 'INSERT') {
    await notifySupplierOnOrderCreate(record);
  } else if (type === 'UPDATE') {
    await notifyCustomerOnStatusChange(old_record, record);
  }

  return new Response(JSON.stringify({ ok: true }), { headers: { 'Content-Type': 'application/json' } });
});
