// Fuente única de verdad para los textos editables del sitio.
// Usado por script.js (para aplicar los textos guardados) y por admin.js
// (para generar el formulario de edición + vista previa en vivo).
// El valor de "default" es el texto original del diseño — si Firestore
// (settings/content) no tiene el campo aún, se usa este.
export const CONTENT_SECTIONS = [
  {
    section: 'Barra de anuncios',
    fields: [
      { key: 'announce1', label: 'Mensaje 1', default: 'Envío gratis desde $49.990' },
      { key: 'announce2', label: 'Mensaje 2', default: 'Nueva temporada · Otoño/Invierno' },
      { key: 'announce3', label: 'Mensaje 3', default: 'Cambios gratis dentro de 30 días' },
    ],
  },
  {
    section: 'Hero (portada)',
    fields: [
      { key: 'heroEyebrow', label: 'Etiqueta superior', default: 'Colección 2026 · Hombre & Unisex' },
      { key: 'heroTitle', label: 'Título (frase completa)', long: true, special: true, default: 'Tu acceso al estilo.' },
      { key: 'heroHighlight', label: 'Palabra a destacar (debe escribirse igual que en el título)', special: true, default: 'estilo' },
      { key: 'heroHighlightColor', label: 'Color de la palabra destacada', color: true, special: true, default: '#d6b25e' },
      { key: 'heroSub', label: 'Subtítulo', long: true, default: 'Streetwear y básicos de calidad en tonos oscuros. Piezas que combinan con todo y no pasan de moda.' },
    ],
  },
  {
    section: 'Catálogo',
    fields: [
      { key: 'catalogEyebrow', label: 'Etiqueta superior', default: 'El catálogo' },
      { key: 'catalogHeading', label: 'Título', default: 'Lo más nuevo' },
    ],
  },
  {
    section: 'Promoción',
    fields: [
      { key: 'promoEyebrow', label: 'Etiqueta superior', default: 'Oferta de temporada' },
      { key: 'promoHeading', label: 'Título', default: '−25% en tu primera compra' },
      { key: 'promoText', label: 'Texto', long: true, default: 'Suscríbete y recibe el código en tu correo. Válido en toda la colección de temporada.' },
    ],
  },
  {
    section: 'Ventajas',
    fields: [
      { key: 'perk1Hidden', label: 'Ocultar ventaja 1', toggle: true, default: false },
      { key: 'perk1Title', label: 'Ventaja 1 — título', default: 'Despacho rápido' },
      { key: 'perk1Sub', label: 'Ventaja 1 — texto', default: '24–48 h en RM' },
      { key: 'perk2Hidden', label: 'Ocultar ventaja 2', toggle: true, default: false },
      { key: 'perk2Title', label: 'Ventaja 2 — título', default: 'Cambios fáciles' },
      { key: 'perk2Sub', label: 'Ventaja 2 — texto', default: '30 días gratis' },
      { key: 'perk3Hidden', label: 'Ocultar ventaja 3', toggle: true, default: false },
      { key: 'perk3Title', label: 'Ventaja 3 — título', default: 'Pago seguro' },
      { key: 'perk3Sub', label: 'Ventaja 3 — texto', default: 'Webpay & tarjetas' },
      { key: 'perk4Hidden', label: 'Ocultar ventaja 4', toggle: true, default: false },
      { key: 'perk4Title', label: 'Ventaja 4 — título', default: 'Calidad real' },
      { key: 'perk4Sub', label: 'Ventaja 4 — texto', default: 'Telas premium' },
    ],
  },
  {
    section: 'Footer',
    fields: [
      { key: 'footerDesc', label: 'Descripción de marca', long: true, default: 'Ropa urbana y casual para hombre y unisex. Hecha para durar.' },
    ],
  },
];

// Lista plana (todas las secciones juntas), útil para iterar sin agrupar.
export const CONTENT_FIELDS = CONTENT_SECTIONS.flatMap(s => s.fields);
const DEFAULTS = Object.fromEntries(CONTENT_FIELDS.map(f => [f.key, f.default]));

export function escapeHtml(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

export function getContent(content, key) {
  return (content && content[key] != null && content[key] !== '') ? content[key] : DEFAULTS[key];
}
function get(content, key) { return getContent(content, key); }

/** Título del hero: una sola frase con una palabra resaltada en el color elegido. */
export function renderHeroTitle(rootDoc, content) {
  const el = rootDoc.querySelector('[data-content-title]');
  if (!el) return;
  const title = get(content, 'heroTitle');
  const highlight = get(content, 'heroHighlight');
  const color = get(content, 'heroHighlightColor');

  const escTitle = escapeHtml(title);
  const escHl = escapeHtml(highlight || '');
  let html = escTitle;
  if (escHl) {
    const idx = escTitle.toLowerCase().indexOf(escHl.toLowerCase());
    if (idx !== -1) {
      html = escTitle.slice(0, idx)
        + `<span style="color:${color}">${escTitle.slice(idx, idx + escHl.length)}</span>`
        + escTitle.slice(idx + escHl.length);
    }
  }
  el.innerHTML = html.replace(/\n/g, '<br>');
}

/** Aplica los textos (guardados o por defecto) al DOM indicado (document o iframe.contentDocument). */
export function applyContent(rootDoc, content) {
  CONTENT_FIELDS.forEach(({ key, special, toggle, default: def }) => {
    if (special) return; // se manejan aparte (ej. título del hero con palabra resaltada)
    if (toggle) {
      const hidden = content ? content[key] === true : def === true;
      rootDoc.querySelectorAll(`[data-content-visible="${key}"]`).forEach(el => { el.style.display = hidden ? 'none' : ''; });
      return;
    }
    const value = (content && content[key]) || def;
    rootDoc.querySelectorAll(`[data-content="${key}"]`).forEach(el => { el.textContent = value; });
  });
  renderHeroTitle(rootDoc, content);
}
