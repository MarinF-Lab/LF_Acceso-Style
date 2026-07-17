// Categorías y tipos de producto — fuente compartida entre la tienda
// pública (script.js) y el panel admin (admin.js). Se guardan en Supabase
// (tablas "categories" y "product_types"); si no hay ninguna, se usan estos
// valores por defecto.
export const DEFAULT_CATEGORIES = [
  { id: 'hombre',    name: 'Hombre',    description: 'Poleras, polerones, cargos y más.', order: 0, hidden: false },
  { id: 'unisex',    name: 'Unisex',    description: 'Oversize y básicos para todes.',    order: 1, hidden: false },
  { id: 'novedades', name: 'Novedades', description: 'Lo último que llegó a la tienda.',   order: 2, hidden: false },
];

export const DEFAULT_PRODUCT_TYPES = [
  { id: 'polera',   name: 'Polera',   order: 0 },
  { id: 'poleron',  name: 'Polerón',  order: 1 },
  { id: 'pantalon', name: 'Pantalón', order: 2 },
  { id: 'chaqueta', name: 'Chaqueta', order: 3 },
];

// Tallas disponibles al crear/editar un producto y en el selector del
// quick view de la tienda.
export const SIZES = ['XS', 'S', 'M', 'L', 'XL', 'XXL'];

export function sortCategories(cats) {
  return [...cats].sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
}

function escapeHtml(s) {
  return String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

/**
 * Renderiza las tarjetas de categoría dentro del contenedor `.cats`.
 * @param includeHidden  si true (modo editor), muestra también las ocultas atenuadas.
 */
export function renderCategoryCards(container, cats, { includeHidden = false } = {}) {
  if (!container) return;
  const list = sortCategories(cats).filter(c => includeHidden || !c.hidden);
  container.innerHTML = list.map((c, i) => `
    <a href="#catalogo" class="cat ${c.hidden ? 'is-hidden-cat' : ''}" data-cat-id="${escapeHtml(c.id)}">
      <div class="cat__body">
        <span class="cat__kicker gold">${String(i + 1).padStart(2, '0')}</span>
        <h3>${escapeHtml(c.name)}</h3>
        <p>${escapeHtml(c.description)}</p>
        <span class="cat__link">Explorar →</span>
      </div>
    </a>
  `).join('');
}
