// Edge Function — LF Acceso Style — Checkout Pro de Mercado Pago
// ============================================================================
// Crea una "preferencia" de pago con el carrito completo del pedido (monto
// exacto, sin importar cuántos productos o unidades haya) — a diferencia de
// un link de pago fijo por producto, que solo sirve para un monto único.
//
// Requiere una cuenta en Mercado Pago Developers y un Access Token, que NUNCA
// debe exponerse en el código del navegador — por eso vive acá, en una Edge
// Function, y no en supabase-config.js. Ver docs/mercadopago-setup.md.
//
// Se invoca desde script.js con supabase.functions.invoke('create-mp-preference',
// { body: { items, externalReference } }) — como el checkout exige sesión
// iniciada, la función solo la puede llamar un cliente autenticado.
// ============================================================================

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const { items, externalReference } = await req.json();
    const token = Deno.env.get('MP_ACCESS_TOKEN');
    if (!token) throw new Error('MP_ACCESS_TOKEN no configurado (supabase secrets set MP_ACCESS_TOKEN=...)');
    if (!Array.isArray(items) || !items.length) throw new Error('El carrito viene vacío');

    const res = await fetch('https://api.mercadopago.com/checkout/preferences', {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        items: items.map((it: any) => ({
          title: `${it.name} (Talla ${it.size})`,
          quantity: it.qty,
          unit_price: Number(it.price),
          currency_id: 'CLP',
        })),
        external_reference: externalReference,
      }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.message || 'Mercado Pago rechazó la solicitud');

    return new Response(JSON.stringify({ url: data.init_point }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
