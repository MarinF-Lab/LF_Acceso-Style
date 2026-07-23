import { supabase } from './supabase-config.js';
import { applyContent } from './content-fields.js';
import { DEFAULT_CATEGORIES, DEFAULT_PRODUCT_TYPES, DEFAULT_SEASONS, SIZES, renderCategoryCards } from './categories.js';
import { STARKEN_BRANCHES } from './starken-branches.js';

/* ===================================================================
   UI base (menú móvil, scroll nav, newsletter)
   =================================================================== */
const burger = document.getElementById('burger');
const navLinks = document.getElementById('navLinks');
const navOverlay = document.getElementById('navOverlay');
function closeMobileNav() {
  burger.classList.remove('open');
  navLinks.classList.remove('open');
  navOverlay.classList.remove('open');
}
burger?.addEventListener('click', () => {
  burger.classList.toggle('open');
  navLinks.classList.toggle('open');
  navOverlay.classList.toggle('open');
});
navOverlay?.addEventListener('click', closeMobileNav);
navLinks?.querySelectorAll('a').forEach(a =>
  a.addEventListener('click', closeMobileNav)
);

/* ===================================================================
   CÓDIGO DE DESCUENTO (10% en la segunda compra, único por usuario)
   El botón "Quiero mi código" pide iniciar sesión con el link mágico;
   al volver logueado, el código se genera y se muestra aquí y en
   Mi cuenta (no llega por correo — el correo solo trae el link).
   =================================================================== */
const DISCOUNT_PERCENT = 10;

function generateDiscountCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // sin 0/O/1/I para evitar confusiones
  let out = 'LF-';
  for (let i = 0; i < 5; i++) out += chars[Math.floor(Math.random() * chars.length)];
  return out;
}

/** Devuelve el código del usuario logueado, creándolo si aún no existe. */
async function ensureDiscountCode() {
  const { data: existing, error } = await supabase.from('discount_codes')
    .select('*').eq('userId', currentUser.id).limit(1);
  if (error) throw error;
  if (existing?.length) return existing[0];
  for (let attempt = 0; attempt < 3; attempt++) {
    const row = { code: generateDiscountCode(), userId: currentUser.id, percent: DISCOUNT_PERCENT, used: false, createdAt: Date.now() };
    const { error: insertError } = await supabase.from('discount_codes').insert(row);
    if (!insertError) return row;
    if (insertError.code !== '23505') throw insertError; // 23505 = código repetido, reintentar
  }
  throw new Error('No se pudo generar un código único.');
}

async function showMyDiscountCode() {
  const note = document.getElementById('promoNote');
  try {
    const row = await ensureDiscountCode();
    note.innerHTML = row.used
      ? `Tu código <strong>${row.code}</strong> ya fue usado.`
      : `✓ Tu código es <strong>${row.code}</strong> — ${row.percent}% de descuento, válido en tu segunda compra. También lo verás en Mi cuenta.`;
    note.hidden = false;
  } catch (err) {
    console.error('No se pudo obtener el código de descuento:', err);
    note.textContent = 'No se pudo generar tu código. Intenta nuevamente.';
    note.hidden = false;
  }
}

document.getElementById('newsletter')?.addEventListener('submit', async e => {
  e.preventDefault();
  const note = document.getElementById('promoNote');
  const email = document.getElementById('newsletterEmail').value.trim();
  if (currentUser) { showMyDiscountCode(); return; }
  localStorage.setItem('lf_pending_code', '1');
  try {
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: { emailRedirectTo: location.origin + location.pathname },
    });
    if (error) throw error;
    note.textContent = '✓ Te enviamos un link a tu correo. Al iniciar sesión, tu código aparecerá aquí y en Mi cuenta.';
    note.hidden = false;
    e.target.reset();
  } catch (err) {
    note.textContent = 'No se pudo enviar el link: ' + err.message;
    note.hidden = false;
  }
});

const nav = document.getElementById('nav');
addEventListener('scroll', () => nav?.classList.toggle('scrolled', scrollY > 10));

/* ===================================================================
   ESTADO
   =================================================================== */
let allProducts = [];
let storeSettings = {};
let cart = JSON.parse(localStorage.getItem('lf_cart') || '[]');
let quickViewProduct = null;
let quickViewSize = null;
let quickViewQty = 1;
let quickViewImages = [];
let quickViewImageIndex = 0;

function renderQuickViewMedia() {
  const media = document.getElementById('qvMedia');
  if (!quickViewImages.length) {
    media.innerHTML = `<span class="card__ph">${(quickViewProduct.type || 'Producto').toUpperCase()}</span>`;
    return;
  }
  const url = quickViewImages[quickViewImageIndex];
  const arrows = quickViewImages.length > 1
    ? `<button type="button" class="qv-arrow qv-arrow--prev" id="qvPrev">‹</button><button type="button" class="qv-arrow qv-arrow--next" id="qvNext">›</button>`
    : '';
  const dots = quickViewImages.length > 1
    ? `<div class="qv-dots">${quickViewImages.map((_, i) => `<button type="button" class="qv-dot ${i === quickViewImageIndex ? 'is-active' : ''}" data-dot="${i}"></button>`).join('')}</div>`
    : '';
  media.innerHTML = `<img src="${url}" alt="${quickViewProduct.name}" />${arrows}${dots}`;
  document.getElementById('qvPrev')?.addEventListener('click', () => {
    quickViewImageIndex = (quickViewImageIndex - 1 + quickViewImages.length) % quickViewImages.length;
    renderQuickViewMedia();
  });
  document.getElementById('qvNext')?.addEventListener('click', () => {
    quickViewImageIndex = (quickViewImageIndex + 1) % quickViewImages.length;
    renderQuickViewMedia();
  });
  media.querySelectorAll('[data-dot]').forEach(dot => {
    dot.addEventListener('click', () => { quickViewImageIndex = Number(dot.dataset.dot); renderQuickViewMedia(); });
  });
}
let selectedPayMethod = null;
let receiptFile = null;
let currentUser = null;
const ORDER_STATUS_LABELS = {
  nuevo: 'Nuevo', armando: 'Armando', en_camino: 'En camino', entregado: 'Entregado', rechazado: 'Rechazado', reembolso: 'Reembolso',
};

function fmt(n) { return '$' + Number(n || 0).toLocaleString('es-CL'); }
function saveCart() { localStorage.setItem('lf_cart', JSON.stringify(cart)); }

/* ===================================================================
   FORMATO DE TELÉFONO (+56 9 xxxx xxxx)
   =================================================================== */
function formatClPhone(raw) {
  let digits = raw.replace(/\D/g, '');
  if (digits.startsWith('56')) digits = digits.slice(2);
  if (digits.startsWith('9')) digits = digits.slice(1);
  digits = digits.slice(0, 8);
  let out = '+56 9';
  if (digits.length) out += ' ' + digits.slice(0, 4);
  if (digits.length > 4) out += ' ' + digits.slice(4, 8);
  return out;
}
const coPhoneInput = document.getElementById('coPhone');
coPhoneInput.addEventListener('focus', () => { if (!coPhoneInput.value) coPhoneInput.value = '+56 9 '; });
coPhoneInput.addEventListener('input', (e) => {
  const pos = e.target.selectionStart;
  const before = e.target.value.length;
  e.target.value = formatClPhone(e.target.value);
  e.target.selectionEnd = pos + (e.target.value.length - before);
});

/* ===================================================================
   FORMATO DE RUT (xx.xxx.xxx-x)
   =================================================================== */
function formatClRut(raw) {
  const clean = raw.replace(/[^0-9kK]/g, '').toUpperCase().slice(0, 9);
  if (clean.length <= 1) return clean;
  const verifier = clean.slice(-1);
  const body = clean.slice(0, -1);
  let formattedBody = '';
  for (let i = 0; i < body.length; i++) {
    const posFromEnd = body.length - i;
    formattedBody += body[i];
    if (posFromEnd > 1 && posFromEnd % 3 === 1) formattedBody += '.';
  }
  return `${formattedBody}-${verifier}`;
}
const coRutInput = document.getElementById('coRut');
coRutInput.addEventListener('input', (e) => {
  const pos = e.target.selectionStart;
  const before = e.target.value.length;
  e.target.value = formatClRut(e.target.value);
  e.target.selectionEnd = pos + (e.target.value.length - before);
});

/* ===================================================================
   CARGA DE DATOS (Supabase)
   Se agrega un timeout manual para no dejar la UI colgada en "Cargando..."
   si el proyecto no existe (ej. supabase-config.js aún con placeholders).
   =================================================================== */
function withTimeout(promise, ms, label) {
  return Promise.race([
    promise,
    new Promise((_, reject) => setTimeout(() => reject(new Error(`Timeout: ${label}`)), ms)),
  ]);
}

async function loadProducts() {
  try {
    const { data, error } = await withTimeout(supabase.from('products').select('*'), 8000, 'products');
    if (error) throw error;
    allProducts = data;
  } catch (err) {
    console.error('No se pudo cargar el catálogo:', err);
    allProducts = [];
    throw err;
  }
}

async function loadSettings() {
  try {
    const { data, error } = await withTimeout(
      supabase.from('settings').select('data').eq('id', 'store').maybeSingle(), 8000, 'settings'
    );
    if (error) throw error;
    storeSettings = data?.data || {};
  } catch (err) {
    console.error('No se pudo cargar la configuración de la tienda:', err);
    storeSettings = {};
  }
}

async function loadPageContent() {
  try {
    const { data, error } = await withTimeout(
      supabase.from('settings').select('data').eq('id', 'content').maybeSingle(), 8000, 'content'
    );
    if (error) throw error;
    applyContent(document, data?.data || {});
  } catch (err) {
    console.error('No se pudo cargar los textos de la página (se mantienen los de por defecto):', err);
    applyContent(document, {});
  } finally {
    // Se guarda después de aplicar el contenido del admin, para poder
    // restaurar el título real al quitar el filtro de categoría.
    defaultCatalogHeading = document.getElementById('catalogHeading').textContent;
  }
}
let defaultCatalogHeading = 'Lo más nuevo';

let currentCategoryFilter = null; // id de categoría activa (tarjetas Hombre/Mujer/...), o null = todas

async function loadCategories() {
  const container = document.getElementById('cats');
  try {
    const { data, error } = await withTimeout(supabase.from('categories').select('*'), 8000, 'categories');
    if (error) throw error;
    renderCategoryCards(container, data.length ? data : DEFAULT_CATEGORIES);
  } catch (err) {
    console.error('No se pudieron cargar las categorías (se usan las por defecto):', err);
    renderCategoryCards(container, DEFAULT_CATEGORIES);
  }
  container.querySelectorAll('.cat[data-cat-id]').forEach(card => {
    card.addEventListener('click', (e) => {
      e.preventDefault();
      const name = card.querySelector('h3')?.textContent || card.dataset.catId;
      container.querySelectorAll('.cat').forEach(c => c.classList.remove('is-active'));
      card.classList.add('is-active');
      currentCategoryFilter = card.dataset.catId;
      document.getElementById('catalogHeading').textContent = name;
      document.getElementById('clearCategoryFilter').hidden = false;
      applyCatalogFilters();
      document.getElementById('catalogo').scrollIntoView({ behavior: 'smooth' });
    });
  });
}

document.getElementById('clearCategoryFilter').addEventListener('click', () => {
  currentCategoryFilter = null;
  document.getElementById('catalogHeading').textContent = defaultCatalogHeading;
  document.getElementById('clearCategoryFilter').hidden = true;
  document.querySelectorAll('#cats .cat').forEach(c => c.classList.remove('is-active'));
  applyCatalogFilters();
});

async function loadProductTypes() {
  const filters = document.getElementById('filters');
  const renderChips = (types) => {
    const sorted = [...types].sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
    filters.innerHTML = `<button class="chip is-active" data-filter="all">Todo</button>` +
      sorted.map(t => `<button class="chip" data-filter="${t.id}">${t.name}</button>`).join('');
  };
  try {
    const { data, error } = await withTimeout(supabase.from('product_types').select('*'), 8000, 'product_types');
    if (error) throw error;
    renderChips(data.length ? data : DEFAULT_PRODUCT_TYPES);
  } catch (err) {
    console.error('No se pudieron cargar los tipos de producto (se usan los por defecto):', err);
    renderChips(DEFAULT_PRODUCT_TYPES);
  }
}

let currentSeasonFilter = 'all';

async function loadSeasons() {
  const el = document.getElementById('seasonFilters');
  const groupEl = document.getElementById('seasonFiltersGroup');
  const renderChips = (seasons) => {
    const sorted = [...seasons].sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
    groupEl.hidden = !sorted.length;
    if (!sorted.length) { el.innerHTML = ''; return; }
    el.innerHTML = `<button type="button" class="chip is-active" data-season="all">Todas las temporadas</button>` +
      sorted.map(s => `<button type="button" class="chip" data-season="${s.id}">${s.name}</button>`).join('');
    el.querySelectorAll('.chip').forEach(chip => {
      chip.addEventListener('click', () => {
        el.querySelectorAll('.chip').forEach(c => c.classList.remove('is-active'));
        chip.classList.add('is-active');
        currentSeasonFilter = chip.dataset.season;
        applyCatalogFilters();
      });
    });
  };
  try {
    const { data, error } = await withTimeout(supabase.from('seasons').select('*'), 8000, 'seasons');
    if (error) throw error;
    renderChips(data.length ? data : []);
  } catch (err) {
    console.error('No se pudieron cargar las estaciones:', err);
    el.innerHTML = '';
    groupEl.hidden = true;
  }
}

/* ===================================================================
   CATÁLOGO
   =================================================================== */
const grid = document.getElementById('grid');
const GRADIENTS = [
  ['#1b2740', '#0d1526'], ['#22304d', '#0e1626'], ['#1d2a45', '#0c1220'],
  ['#243456', '#0d1424'], ['#1f2c48', '#0e1524'], ['#212f4d', '#0d1421'],
];

function productImageOrPlaceholder(p, idx) {
  if (p.imageUrl) return `<img class="card__img" src="${p.imageUrl}" alt="${p.name}" loading="lazy" />`;
  const [c1, c2] = GRADIENTS[idx % GRADIENTS.length];
  return `<span class="card__ph" style="position:relative">${(p.type || 'Producto').toUpperCase()}</span>
    <style>#grid .card:nth-child(${idx + 1}) .card__media{--c1:${c1};--c2:${c2}}</style>`;
}

function renderCatalog() {
  if (!allProducts.length) {
    grid.innerHTML = `<p class="catalog__empty">Aún no hay productos publicados. Vuelve pronto.</p>`;
    return;
  }
  grid.innerHTML = allProducts.map((p, idx) => {
    const stock = totalStock(p);
    const tagHtml = p.tag === 'nuevo' ? `<span class="tag tag--new">Nuevo</span>`
      : p.tag === 'top' ? `<span class="tag tag--gold">Top ventas</span>` : '';
    const swatches = (p.colors || []).slice(0, 3).map(c => `<i style="--s:${c}"></i>`).join('');
    const media = p.imageUrl
      ? `<img class="card__img" src="${p.imageUrl}" alt="${p.name}" loading="lazy" />`
      : `<span class="card__ph">${(p.type || 'Producto').toUpperCase()}</span>`;
    return `
      <article class="card" data-type="${p.type || ''}" data-category="${p.category || ''}" data-season="${p.season || ''}" data-price="${p.price || 0}" data-colors="${(p.colors || []).join('|')}" data-id="${p.id}" ${p.imageUrl ? '' : `style="--c1:${GRADIENTS[idx % GRADIENTS.length][0]};--c2:${GRADIENTS[idx % GRADIENTS.length][1]}"`}>
        <div class="card__media">
          ${tagHtml}
          ${media}
          <button class="quick" data-add ${stock === 0 ? 'disabled' : ''}>${stock === 0 ? 'Agotado' : 'Agregar'}</button>
        </div>
        <div class="card__body">
          <h3 class="card__name">${p.name}</h3>
          <div class="card__row"><span class="card__price">${fmt(p.price)}</span><span class="card__swatches">${swatches}</span></div>
        </div>
      </article>`;
  }).join('');

  grid.querySelectorAll('.card').forEach(card => {
    card.addEventListener('click', (e) => {
      if (e.target.closest('[data-add]') && e.target.disabled) return;
      openQuickView(card.dataset.id);
    });
  });

  wireFilters();
  renderExtraFilters();
  applyCatalogFilters();
}

function totalStock(p) {
  if (!p.sizeStock) return p.stock || 0;
  return Object.values(p.sizeStock).reduce((a, b) => a + (Number(b) || 0), 0);
}

let currentTypeFilter = 'all';
let currentSort = 'none';
let currentPriceRange = null; // { min, max } o null
let currentColor = null;

function applyCatalogFilters() {
  const cards = [...document.querySelectorAll('#grid .card')];
  cards.forEach(c => {
    const matchesCategory = !currentCategoryFilter || c.dataset.category === currentCategoryFilter;
    const matchesType = currentTypeFilter === 'all' || c.dataset.type === currentTypeFilter;
    const matchesSeason = currentSeasonFilter === 'all' || c.dataset.season === currentSeasonFilter;
    const price = Number(c.dataset.price) || 0;
    const matchesPrice = !currentPriceRange || (price >= currentPriceRange.min && price <= currentPriceRange.max);
    const matchesColor = !currentColor || (c.dataset.colors || '').split('|').includes(currentColor);
    c.style.display = (matchesCategory && matchesType && matchesSeason && matchesPrice && matchesColor) ? '' : 'none';
  });

  if (currentSort === 'price-asc' || currentSort === 'price-desc') {
    const sorted = [...cards].sort((a, b) => {
      const diff = Number(a.dataset.price) - Number(b.dataset.price);
      return currentSort === 'price-asc' ? diff : -diff;
    });
    sorted.forEach(c => grid.appendChild(c));
  }

  updateFiltersCount();
}

function updateFiltersCount() {
  const count = [
    currentSort !== 'none',
    !!currentPriceRange,
    !!currentColor,
    currentSeasonFilter !== 'all',
  ].filter(Boolean).length;
  const badge = document.getElementById('filtersCount');
  badge.textContent = count;
  badge.hidden = count === 0;
}

function renderExtraFilters() {
  const prices = allProducts.map(p => Number(p.price) || 0).filter(p => p > 0);
  const priceEl = document.getElementById('priceRangeFilters');
  document.getElementById('priceRangeFiltersGroup').hidden = prices.length <= 1;
  if (prices.length > 1) {
    const min = Math.min(...prices), max = Math.max(...prices);
    const bucketCount = 4;
    const step = Math.ceil((max - min + 1) / bucketCount);
    const buckets = [];
    for (let i = 0; i < bucketCount; i++) {
      const bMin = min + step * i;
      if (bMin > max) break;
      const bMax = i === bucketCount - 1 ? max : bMin + step - 1;
      buckets.push({ min: bMin, max: bMax });
    }
    priceEl.innerHTML = `<button type="button" class="chip is-active" data-price-all>Todos los precios</button>` +
      buckets.map(b => `<button type="button" class="chip" data-price-min="${b.min}" data-price-max="${b.max}">${fmt(b.min)} – ${fmt(b.max)}</button>`).join('');
    priceEl.querySelectorAll('.chip').forEach(chip => {
      chip.addEventListener('click', () => {
        priceEl.querySelectorAll('.chip').forEach(c => c.classList.remove('is-active'));
        chip.classList.add('is-active');
        currentPriceRange = chip.dataset.priceMin !== undefined
          ? { min: Number(chip.dataset.priceMin), max: Number(chip.dataset.priceMax) }
          : null;
        applyCatalogFilters();
      });
    });
  } else {
    priceEl.innerHTML = '';
  }

  const colorSet = [...new Set(allProducts.flatMap(p => p.colors || []))];
  const colorEl = document.getElementById('colorFilters');
  document.getElementById('colorFiltersGroup').hidden = !colorSet.length;
  if (colorSet.length) {
    colorEl.innerHTML = `<button type="button" class="chip is-active" data-color-all>Todos los colores</button>` +
      colorSet.map(c => `<button type="button" class="color-swatch-btn" data-color="${c}" style="--s:${c}" title="${c}"></button>`).join('');
    colorEl.querySelectorAll('[data-color], [data-color-all]').forEach(btn => {
      btn.addEventListener('click', () => {
        colorEl.querySelectorAll('.color-swatch-btn').forEach(b => b.classList.remove('is-active'));
        colorEl.querySelector('[data-color-all]').classList.remove('is-active');
        btn.classList.add('is-active');
        currentColor = btn.dataset.color || null;
        applyCatalogFilters();
      });
    });
  } else {
    colorEl.innerHTML = '';
  }
}

document.getElementById('sortPriceFilter').addEventListener('change', (e) => {
  currentSort = e.target.value;
  applyCatalogFilters();
});

document.getElementById('filtersToggleBtn').addEventListener('click', () => {
  const panel = document.getElementById('filtersPanel');
  const btn = document.getElementById('filtersToggleBtn');
  panel.hidden = !panel.hidden;
  btn.setAttribute('aria-expanded', String(!panel.hidden));
});

document.getElementById('clearAllFiltersBtn').addEventListener('click', () => {
  currentSort = 'none';
  currentPriceRange = null;
  currentColor = null;
  currentSeasonFilter = 'all';
  document.getElementById('sortPriceFilter').value = 'none';
  document.querySelectorAll('#priceRangeFilters .chip').forEach(c => c.classList.remove('is-active'));
  document.querySelector('#priceRangeFilters [data-price-all]')?.classList.add('is-active');
  document.querySelectorAll('#colorFilters .color-swatch-btn').forEach(c => c.classList.remove('is-active'));
  document.querySelector('#colorFilters [data-color-all]')?.classList.add('is-active');
  document.querySelectorAll('#seasonFilters .chip').forEach(c => c.classList.remove('is-active'));
  document.querySelector('#seasonFilters [data-season="all"]')?.classList.add('is-active');
  applyCatalogFilters();
});

function wireFilters() {
  const filters = document.getElementById('filters');
  filters?.querySelectorAll('.chip').forEach(chip => {
    chip.onclick = () => {
      filters.querySelectorAll('.chip').forEach(c => c.classList.remove('is-active'));
      chip.classList.add('is-active');
      currentTypeFilter = chip.dataset.filter;
      applyCatalogFilters();
    };
  });
}

/* ===================================================================
   QUICK VIEW (selección de talla + agregar al carrito)
   =================================================================== */
const qvOverlay = document.getElementById('quickViewOverlay');

function openQuickView(productId) {
  const p = allProducts.find(x => x.id === productId);
  if (!p) return;
  quickViewProduct = p;
  quickViewQty = 1;
  quickViewSize = null;

  quickViewImages = p.images?.length ? p.images : (p.imageUrl ? [p.imageUrl] : []);
  quickViewImageIndex = 0;
  renderQuickViewMedia();
  document.getElementById('qvName').textContent = p.name;
  document.getElementById('qvPrice').textContent = fmt(p.price);
  document.getElementById('qvDesc').textContent = p.description || '';
  document.getElementById('qvQty').textContent = quickViewQty;
  document.getElementById('qvNote').hidden = true;

  const sizeStock = p.sizeStock || {};
  const sizesRow = document.getElementById('qvSizes');
  const storedSizes = Object.keys(sizeStock);
  const sizes = storedSizes.length ? SIZES.filter(s => storedSizes.includes(s)) : SIZES;
  sizesRow.innerHTML = sizes.map(s => {
    const available = sizeStock[s] === undefined ? true : sizeStock[s] > 0;
    return `<button type="button" class="size-btn" data-size="${s}" ${available ? '' : 'disabled'}>${s}</button>`;
  }).join('');
  sizesRow.querySelectorAll('.size-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      sizesRow.querySelectorAll('.size-btn').forEach(b => b.classList.remove('is-active'));
      btn.classList.add('is-active');
      quickViewSize = btn.dataset.size;
    });
  });

  qvOverlay.classList.add('open');
  document.body.style.overflow = 'hidden';
}
function closeQuickView() {
  qvOverlay.classList.remove('open');
  document.body.style.overflow = '';
}
document.getElementById('quickViewClose').addEventListener('click', closeQuickView);
qvOverlay.addEventListener('click', e => { if (e.target === qvOverlay) closeQuickView(); });

document.getElementById('qvQtyMinus').addEventListener('click', () => {
  quickViewQty = Math.max(1, quickViewQty - 1);
  document.getElementById('qvQty').textContent = quickViewQty;
});
document.getElementById('qvQtyPlus').addEventListener('click', () => {
  quickViewQty = Math.min(10, quickViewQty + 1);
  document.getElementById('qvQty').textContent = quickViewQty;
});

document.getElementById('qvAddBtn').addEventListener('click', () => {
  const note = document.getElementById('qvNote');
  if (!quickViewSize) {
    note.textContent = 'Selecciona una talla.';
    note.hidden = false;
    return;
  }
  addToCart(quickViewProduct, quickViewSize, quickViewQty);
  closeQuickView();
  openCart();
});

/* ===================================================================
   CARRITO
   =================================================================== */
function addToCart(product, size, qty) {
  const key = `${product.id}__${size}`;
  const existing = cart.find(i => i.key === key);
  if (existing) {
    existing.qty += qty;
  } else {
    cart.push({
      key, id: product.id, name: product.name, price: product.price,
      imageUrl: product.imageUrl || '', size, qty,
    });
  }
  saveCart();
  renderCart();
}

function removeFromCart(key) {
  cart = cart.filter(i => i.key !== key);
  saveCart();
  renderCart();
}

function cartTotal() { return cart.reduce((sum, i) => sum + i.price * i.qty, 0); }
function cartCount() { return cart.reduce((sum, i) => sum + i.qty, 0); }

/* Descuento aplicado en el carrito: { code, percent } o null. */
let appliedDiscount = null;
function discountAmount() {
  if (!appliedDiscount) return 0;
  return Math.round(cartTotal() * appliedDiscount.percent / 100);
}
function payableTotal() { return cartTotal() - discountAmount(); }

function renderDiscountLine() {
  const line = document.getElementById('cartDiscountLine');
  line.hidden = !appliedDiscount;
  if (appliedDiscount) {
    document.getElementById('cartDiscountAmount').textContent =
      `−${fmt(discountAmount())} (${appliedDiscount.code})`;
  }
  document.getElementById('cartTotal').textContent = fmt(payableTotal());
}

function setDiscountStatus(msg, ok) {
  const el = document.getElementById('discountStatus');
  el.textContent = msg;
  el.className = `cart-discount__status cart-discount__status--${ok ? 'ok' : 'error'}`;
  el.hidden = false;
}

async function applyDiscountCode() {
  const input = document.getElementById('discountInput');
  const code = input.value.trim().toUpperCase();
  if (!code) return;
  if (!currentUser) { setDiscountStatus('Inicia sesión para usar tu código.', false); return; }
  const btn = document.getElementById('applyDiscountBtn');
  btn.disabled = true;
  try {
    const { data, error } = await supabase.from('discount_codes')
      .select('*').eq('code', code).eq('userId', currentUser.id).limit(1);
    if (error) throw error;
    const row = data?.[0];
    if (!row) { setDiscountStatus('Código inválido o no pertenece a tu cuenta.', false); return; }
    if (row.used) { setDiscountStatus('Este código ya fue usado.', false); return; }
    // Válido solo desde la segunda compra: debe existir al menos un pedido previo.
    const { count, error: countError } = await supabase.from('orders')
      .select('id', { count: 'exact', head: true })
      .eq('userId', currentUser.id).neq('status', 'rechazado');
    if (countError) throw countError;
    if (!count) { setDiscountStatus('Tu código es válido a partir de tu segunda compra.', false); return; }
    appliedDiscount = { code: row.code, percent: Number(row.percent) || 10 };
    setDiscountStatus(`✓ Código aplicado: −${appliedDiscount.percent}%`, true);
    renderDiscountLine();
  } catch (err) {
    console.error('No se pudo validar el código:', err);
    setDiscountStatus('No se pudo validar el código. Intenta nuevamente.', false);
  } finally {
    btn.disabled = false;
  }
}
document.getElementById('applyDiscountBtn').addEventListener('click', applyDiscountCode);

function renderCart() {
  const badge = document.getElementById('cartBadge');
  badge.textContent = cartCount();

  const itemsEl = document.getElementById('cartItems');
  const footerEl = document.getElementById('cartFooter');

  if (!cart.length) {
    itemsEl.innerHTML = `<p class="cart-drawer__empty">Tu carrito está vacío.</p>`;
    footerEl.style.display = 'none';
    appliedDiscount = null;
    document.getElementById('discountInput').value = '';
    document.getElementById('discountStatus').hidden = true;
    return;
  }

  itemsEl.innerHTML = cart.map(i => `
    <div class="cart-line" data-key="${i.key}">
      <div class="cart-line__media">${i.imageUrl ? `<img src="${i.imageUrl}" alt="${i.name}" />` : ''}</div>
      <div class="cart-line__info">
        <h4>${i.name}</h4>
        <span>Talla ${i.size} · Cant. ${i.qty}</span>
        <div class="cart-line__row">
          <span class="cart-line__price">${fmt(i.price * i.qty)}</span>
          <button class="cart-line__remove" data-remove="${i.key}">Quitar</button>
        </div>
      </div>
    </div>`).join('');

  itemsEl.querySelectorAll('[data-remove]').forEach(btn => {
    btn.addEventListener('click', () => removeFromCart(btn.dataset.remove));
  });

  renderDiscountLine();
  footerEl.style.display = 'block';
}

const cartDrawer = document.getElementById('cartDrawer');
const cartOverlay = document.getElementById('cartOverlay');
function openCart() { cartDrawer.classList.add('open'); cartOverlay.classList.add('open'); }
function closeCart() { cartDrawer.classList.remove('open'); cartOverlay.classList.remove('open'); }
document.getElementById('cartBtn').addEventListener('click', openCart);
document.getElementById('cartClose').addEventListener('click', closeCart);
cartOverlay.addEventListener('click', closeCart);

/* ===================================================================
   CUENTA DE CLIENTE (login con magic link) Y MIS COMPRAS
   =================================================================== */
const accountDrawer = document.getElementById('accountDrawer');
const accountOverlay = document.getElementById('accountOverlay');
function openAccount() { renderAccountBody(); accountDrawer.classList.add('open'); accountOverlay.classList.add('open'); }
function closeAccount() { accountDrawer.classList.remove('open'); accountOverlay.classList.remove('open'); }
document.getElementById('accountBtn').addEventListener('click', openAccount);
document.getElementById('accountClose').addEventListener('click', closeAccount);
accountOverlay.addEventListener('click', closeAccount);

function authBoxHtml(idPrefix) {
  return `
    <div class="auth-box">
      <p class="auth-box__note">Ingresa tu email y te enviamos un link para iniciar sesión, sin contraseña.</p>
      <div class="auth-box__row">
        <input type="email" id="${idPrefix}Email" placeholder="tu@correo.com" />
        <button type="button" class="btn btn--primary" id="${idPrefix}SendBtn">Enviar link</button>
      </div>
      <p class="auth-box__status" id="${idPrefix}Status" hidden></p>
    </div>`;
}

async function requestMagicLink(email, statusEl, sendBtn) {
  if (!email) {
    statusEl.textContent = 'Ingresa tu email.';
    statusEl.className = 'auth-box__status auth-box__status--error';
    statusEl.hidden = false;
    return;
  }
  sendBtn.disabled = true;
  sendBtn.textContent = 'Enviando...';
  try {
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: { emailRedirectTo: location.origin + location.pathname },
    });
    if (error) throw error;
    statusEl.textContent = '✓ Listo, revisa tu correo y toca el link para iniciar sesión.';
    statusEl.className = 'auth-box__status auth-box__status--ok';
    statusEl.hidden = false;
  } catch (err) {
    statusEl.textContent = 'No se pudo enviar el link: ' + err.message;
    statusEl.className = 'auth-box__status auth-box__status--error';
    statusEl.hidden = false;
  } finally {
    sendBtn.disabled = false;
    sendBtn.textContent = 'Enviar link';
  }
}

function wireAuthBox(idPrefix) {
  const emailInput = document.getElementById(`${idPrefix}Email`);
  const sendBtn = document.getElementById(`${idPrefix}SendBtn`);
  const statusEl = document.getElementById(`${idPrefix}Status`);
  sendBtn.addEventListener('click', () => requestMagicLink(emailInput.value.trim(), statusEl, sendBtn));
}

async function loadMyOrders() {
  const { data, error } = await supabase.from('orders')
    .select('*').eq('userId', currentUser.id).order('createdAt', { ascending: false });
  if (error) { console.error('No se pudieron cargar tus compras:', error); return []; }
  return data;
}

async function renderAccountBody() {
  const body = document.getElementById('accountBody');
  const title = document.getElementById('accountTitle');
  if (!currentUser) {
    title.textContent = 'Mi cuenta';
    body.innerHTML = authBoxHtml('account');
    wireAuthBox('account');
    return;
  }
  title.textContent = 'Mis compras';
  body.innerHTML = `
    <div class="account-user">
      <span>Conectado como <strong>${currentUser.email}</strong></span>
      <button type="button" class="account-logout" id="logoutAccountBtn">Cerrar sesión</button>
    </div>
    <p class="account-discount" id="accountDiscount" hidden></p>
    <p class="cart-drawer__empty" id="accountOrdersEmpty" hidden>Aún no tienes compras.</p>
    <div id="accountOrdersList"></div>
  `;
  document.getElementById('logoutAccountBtn').addEventListener('click', () => supabase.auth.signOut());

  // Muestra el código de descuento si el usuario ya lo generó (no lo crea solo).
  supabase.from('discount_codes').select('*').eq('userId', currentUser.id).limit(1)
    .then(({ data }) => {
      const row = data?.[0];
      const el = document.getElementById('accountDiscount');
      if (!row || !el) return;
      el.innerHTML = row.used
        ? `Código <strong>${row.code}</strong> — ya usado ✓`
        : `🎟️ Tu código: <strong>${row.code}</strong> (${row.percent}% en tu segunda compra)`;
      el.hidden = false;
    });

  const orders = await loadMyOrders();
  if (!orders.length) {
    document.getElementById('accountOrdersEmpty').hidden = false;
    return;
  }
  document.getElementById('accountOrdersList').innerHTML = orders.map(o => `
    <div class="account-order">
      <div class="account-order__row">
        <strong>#${o.orderNumber}</strong>
        <span class="status-pill status-pill--${o.status}">${ORDER_STATUS_LABELS[o.status] || o.status}</span>
      </div>
      <span class="account-order__meta">${new Date(o.createdAt).toLocaleDateString('es-CL')} · ${fmt(o.total)}</span>
    </div>`).join('');
}

function renderCartAuthGate() {
  const el = document.getElementById('cartAuth');
  el.innerHTML = authBoxHtml('cart');
  el.hidden = false;
  wireAuthBox('cart');
}

async function initAuth() {
  const { data: { session } } = await supabase.auth.getSession();
  currentUser = session?.user || null;
  supabase.auth.onAuthStateChange((_event, session) => {
    currentUser = session?.user || null;
    if (currentUser) {
      document.getElementById('cartAuth').hidden = true;
      // Si pidió su código antes de iniciar sesión, mostrarlo ahora.
      if (localStorage.getItem('lf_pending_code')) {
        localStorage.removeItem('lf_pending_code');
        showMyDiscountCode();
        document.getElementById('ofertas')?.scrollIntoView({ behavior: 'smooth' });
      }
    }
    if (accountDrawer.classList.contains('open')) renderAccountBody();
  });
  // Un magic link suele abrirse en otra pestaña: al volver a esta, refrescamos
  // la sesión por si se inició en la otra.
  addEventListener('focus', async () => {
    const { data: { session } } = await supabase.auth.getSession();
    currentUser = session?.user || null;
  });
}

/* ===================================================================
   CHECKOUT
   =================================================================== */
const checkoutOverlay = document.getElementById('checkoutOverlay');
function openCheckout() {
  if (!cart.length) return;
  closeCart();
  checkoutOverlay.classList.add('open');
  document.body.style.overflow = 'hidden';
  goToStep(1);
  if (document.getElementById('addressDetails').open) {
    setTimeout(() => addressMap && addressMap.invalidateSize(), 60);
  }
}
function closeCheckout() {
  checkoutOverlay.classList.remove('open');
  document.body.style.overflow = '';
}
document.getElementById('goCheckout').addEventListener('click', () => {
  if (!currentUser) { renderCartAuthGate(); return; }
  openCheckout();
});
document.getElementById('checkoutClose').addEventListener('click', closeCheckout);
checkoutOverlay.addEventListener('click', e => { if (e.target === checkoutOverlay) closeCheckout(); });

function goToStep(n) {
  [1, 2, 3].forEach(i => {
    const dot = document.getElementById(`stepDot${i}`);
    dot.classList.remove('active', 'done');
    if (i < n) dot.classList.add('done');
    else if (i === n) dot.classList.add('active');
  });
  document.getElementById('checkoutForm1').style.display = n === 1 ? 'block' : 'none';
  document.getElementById('checkoutForm2').style.display = n === 2 ? 'block' : 'none';
  document.getElementById('checkoutSuccess').style.display = n === 3 ? 'block' : 'none';
}

document.getElementById('checkoutForm1').addEventListener('submit', e => {
  e.preventDefault();
  goToStep(2);
  renderPaymentMethods();
  renderOrderSummaryMini();
});
document.getElementById('backToStep1').addEventListener('click', () => goToStep(1));

/* Mercado Pago: si el carrito tiene un solo producto distinto se usa su link
   individual (monto fijo); con 2+ productos distintos se usa el link general
   de Configuración (el cliente ingresa el monto a mano). */
let mpAvailability = { available: false, link: '', mpLinkType: null };
function computeMpAvailability() {
  const distinctIds = [...new Set(cart.map(i => i.id))];
  if (distinctIds.length === 1) {
    const p = allProducts.find(x => x.id === distinctIds[0]);
    if (p?.mpLink) return { available: true, link: p.mpLink, mpLinkType: 'individual' };
  } else if (distinctIds.length > 1 && storeSettings.mpLink) {
    return { available: true, link: storeSettings.mpLink, mpLinkType: 'general' };
  }
  return { available: false, link: '', mpLinkType: null };
}

function renderPaymentMethods() {
  const wrap = document.getElementById('payMethods');
  const hasTransfer = storeSettings.bankName || storeSettings.bankAccountNumber;
  mpAvailability = computeMpAvailability();
  wrap.querySelectorAll('.pay-method').forEach(btn => {
    const method = btn.dataset.method;
    btn.disabled = method === 'transfer' ? !hasTransfer : !mpAvailability.available;
    btn.classList.remove('is-active');
  });
  document.getElementById('payDetail').innerHTML = '';
  selectedPayMethod = null;
  receiptFile = null;
  document.getElementById('confirmOrderBtn').disabled = true;
}

document.getElementById('payMethods').addEventListener('click', (e) => {
  const btn = e.target.closest('.pay-method');
  if (!btn || btn.disabled) return;
  document.querySelectorAll('.pay-method').forEach(b => b.classList.remove('is-active'));
  btn.classList.add('is-active');
  selectedPayMethod = btn.dataset.method;
  renderPaymentDetail(selectedPayMethod);
  document.getElementById('confirmOrderBtn').disabled = false;
});

function bankBoxHtml() {
  const s = storeSettings;
  const rows = [];
  if (s.bankHolder) rows.push(`<p><strong>${s.bankHolder}</strong></p>`);
  if (s.bankRut) rows.push(`<p>RUT: ${s.bankRut}</p>`);
  if (s.bankName) rows.push(`<p>Banco: ${s.bankName}</p>`);
  if (s.bankAccountType) rows.push(`<p>Tipo de cuenta: ${s.bankAccountType}</p>`);
  if (s.bankAccountNumber) rows.push(`<p>N° de cuenta: ${s.bankAccountNumber}</p>`);
  return `<div class="info-box">${rows.join('') || '<p>Datos bancarios no configurados aún.</p>'}</div>
    <p class="pay-note">Realiza la transferencia y guarda el comprobante, adjúntalo para poder confirmar tu pedido.</p>
    <div class="receipt-upload">
      <label for="receiptFile">Comprobante de transferencia</label>
      <input type="file" id="receiptFile" accept="image/*,.pdf" />
      <p class="pay-note" id="receiptNote">Sube una foto o PDF del comprobante para confirmar tu pedido.</p>
    </div>`;
}

function renderPaymentDetail(method) {
  const el = document.getElementById('payDetail');
  receiptFile = null;
  if (method === 'transfer') {
    el.innerHTML = bankBoxHtml();
    document.getElementById('receiptFile').addEventListener('change', (e) => {
      receiptFile = e.target.files[0] || null;
      const note = document.getElementById('receiptNote');
      note.classList.remove('pay-note--error');
      note.textContent = receiptFile
        ? `Archivo seleccionado: ${receiptFile.name}`
        : 'Sube una foto o PDF del comprobante para confirmar tu pedido.';
    });
  } else if (method === 'mercadopago') {
    el.innerHTML = mpAvailability.mpLinkType === 'general'
      ? `<a class="pay-link-btn" href="${mpAvailability.link}" target="_blank" rel="noopener">Pagar con Mercado Pago ↗</a>
         <p class="pay-note">Tu pedido tiene más de un producto, así que se paga con el link general de Mercado Pago (ahí ingresas el monto a mano). <strong>Ingresa exactamente ${fmt(payableTotal())}</strong>. Luego confirma tu pedido aquí.</p>`
      : `<a class="pay-link-btn" href="${mpAvailability.link}" target="_blank" rel="noopener">Pagar con Mercado Pago ↗</a>
         <p class="pay-note">Se abrirá Mercado Pago en otra pestaña. Realiza el pago y luego confirma tu pedido aquí.</p>`;
  }
}

function renderOrderSummaryMini() {
  const el = document.getElementById('orderSummaryMini');
  el.innerHTML = `
    ${cart.map(i => `<div class="summary-item"><span>${i.name} × ${i.qty} (${i.size})</span><span>${fmt(i.price * i.qty)}</span></div>`).join('')}
    ${appliedDiscount ? `<div class="summary-item"><span>Descuento (${appliedDiscount.code})</span><span>−${fmt(discountAmount())}</span></div>` : ''}
    <div class="summary-total"><span>Total</span><span>${fmt(payableTotal())}</span></div>
  `;
}

function orderPrefix() { return 'LF'; }

/* ===================================================================
   ENVÍO — Domicilio / Sucursal Starken
   =================================================================== */
let shippingType = 'domicilio';

document.querySelectorAll('.shipping-type-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.shipping-type-btn').forEach(b => b.classList.remove('is-active'));
    btn.classList.add('is-active');
    shippingType = btn.dataset.shippingType;
    const isDomicilio = shippingType === 'domicilio';
    document.getElementById('shippingDomicilioFields').hidden = !isDomicilio;
    document.getElementById('shippingSucursalFields').hidden = isDomicilio;
    document.getElementById('coStreet').required = isDomicilio;
    document.getElementById('coHouseNumber').required = isDomicilio;
    document.getElementById('coStarkenBranch').required = !isDomicilio;
    if (isDomicilio) setTimeout(() => addressMap && addressMap.invalidateSize(), 60);
    else populateStarkenBranches();
  });
});

/* Sucursal de Starken: se llena según la región elegida, ordenadas de
   norte a sur (datos oficiales del CSV entregado por el cliente). */
function populateStarkenBranches() {
  const select = document.getElementById('coStarkenBranch');
  const region = document.getElementById('coRegion').value;
  const branches = STARKEN_BRANCHES[region] || [];
  if (!region) {
    select.innerHTML = '<option value="">Selecciona primero tu región</option>';
    return;
  }
  if (!branches.length) {
    select.innerHTML = '<option value="">No hay sucursales cargadas para esta región</option>';
    return;
  }
  const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  select.innerHTML = '<option value="">Selecciona una sucursal...</option>' +
    branches.map(b => {
      const label = esc(`${b.name} — ${b.address} (${b.comuna})`);
      return `<option value="${label}">${label}</option>`;
    }).join('');
}

document.getElementById('coRegion').addEventListener('change', () => {
  if (shippingType === 'sucursal') populateStarkenBranches();
});

/* ===================================================================
   MAPA DE DIRECCIÓN — Leaflet + OpenStreetMap.
   Se eligió esta combinación (en vez del widget de Google Maps con
   autocompletado) porque es 100% gratis y no requiere API key ni una
   cuenta de Google Cloud con tarjeta de crédito asociada — el mismo
   motivo por el que ya se evitó el plan Blaze de Firebase. Funciona
   igual que un mapa "estilo Mercado Libre": el cliente marca su punto
   y los campos de dirección se completan solos.
   =================================================================== */
let addressMap = null;
let addressMarker = null;
let addressGeocodeTimer = null;

function normalizeText(str) {
  return (str || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').trim();
}

function ensureAddressMap() {
  if (addressMap || typeof L === 'undefined') return;
  addressMap = L.map('addressMap').setView([-35.6751, -71.543], 4); // Chile completo
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 18,
    attribution: '&copy; OpenStreetMap',
  }).addTo(addressMap);
  addressMarker = L.marker([-35.6751, -71.543], { draggable: true }).addTo(addressMap);
  addressMarker.on('dragend', () => {
    const { lat, lng } = addressMarker.getLatLng();
    reverseGeocodeAddress(lat, lng);
  });
  addressMap.on('click', (e) => {
    addressMarker.setLatLng(e.latlng);
    reverseGeocodeAddress(e.latlng.lat, e.latlng.lng);
  });
}

async function reverseGeocodeAddress(lat, lng) {
  const hint = document.getElementById('mapHint');
  clearTimeout(addressGeocodeTimer);
  if (hint) hint.textContent = 'Buscando dirección...';
  addressGeocodeTimer = setTimeout(async () => {
    try {
      const res = await fetch(`https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${lat}&lon=${lng}&addressdetails=1`);
      const data = await res.json();
      const a = data.address || {};
      if (a.road) document.getElementById('coStreet').value = a.road;
      if (a.house_number) document.getElementById('coHouseNumber').value = a.house_number;
      const comuna = a.city_district || a.municipality || a.town || a.city || a.village || '';
      if (comuna) document.getElementById('coComuna').value = comuna;
      const regionSelect = document.getElementById('coRegion');
      const regionText = normalizeText(a.state || '');
      if (regionText) {
        const match = [...regionSelect.options].find(o => {
          const opt = normalizeText(o.textContent);
          return opt && (opt === regionText || regionText.includes(opt) || opt.includes(regionText));
        });
        if (match) regionSelect.value = match.value;
      }
      if (hint) hint.textContent = data.display_name
        ? `📍 ${data.display_name}`
        : 'Ubicación marcada. Revisa y completa los datos si hace falta.';
    } catch {
      if (hint) hint.textContent = 'No se pudo obtener la dirección automáticamente. Completa los campos a mano.';
    }
  }, 500);
}

document.getElementById('addressDetails').addEventListener('toggle', (e) => {
  if (!e.target.open) return;
  ensureAddressMap();
  setTimeout(() => addressMap && addressMap.invalidateSize(), 60);
});

document.getElementById('locateMeBtn').addEventListener('click', () => {
  if (!navigator.geolocation) { alert('Tu navegador no soporta geolocalización.'); return; }
  ensureAddressMap();
  navigator.geolocation.getCurrentPosition((pos) => {
    const { latitude, longitude } = pos.coords;
    addressMap.setView([latitude, longitude], 17);
    addressMarker.setLatLng([latitude, longitude]);
    reverseGeocodeAddress(latitude, longitude);
  }, () => alert('No se pudo obtener tu ubicación. Actívala en el navegador o marca el punto manualmente en el mapa.'));
});

function buildShippingFields() {
  const region = document.getElementById('coRegion').value.trim();
  const comuna = document.getElementById('coComuna').value.trim();
  let shippingDetail;
  if (shippingType === 'domicilio') {
    const street = document.getElementById('coStreet').value.trim();
    const houseNumber = document.getElementById('coHouseNumber').value.trim();
    const desc = document.getElementById('coAddressDesc').value.trim();
    shippingDetail = `${street} ${houseNumber}`.trim() + (desc ? ` - ${desc}` : '');
  } else {
    shippingDetail = document.getElementById('coStarkenBranch').value.trim();
  }
  return {
    customerRut: document.getElementById('coRut').value.trim(),
    region,
    comuna,
    shippingType,
    shippingDetail,
  };
}

document.getElementById('checkoutForm2').addEventListener('submit', async (e) => {
  e.preventDefault();
  if (!selectedPayMethod) return;
  if (!currentUser) {
    alert('Tu sesión expiró. Inicia sesión nuevamente para confirmar tu pedido.');
    closeCheckout();
    openAccount();
    return;
  }
  if (selectedPayMethod === 'transfer' && !receiptFile) {
    const note = document.getElementById('receiptNote');
    note.textContent = 'Debes subir el comprobante de transferencia para continuar.';
    note.classList.add('pay-note--error');
    return;
  }
  const btn = document.getElementById('confirmOrderBtn');
  btn.disabled = true;
  btn.textContent = 'Enviando...';

  try {
    const orderNumber = orderPrefix() + '-' + String(Date.now()).slice(-6);

    let receiptUrl = '';
    if (selectedPayMethod === 'transfer' && receiptFile) {
      const path = `${orderNumber}-${Date.now()}-${receiptFile.name}`;
      const { error: uploadError } = await supabase.storage.from('receipts').upload(path, receiptFile);
      if (uploadError) throw uploadError;
      const { data: pub } = supabase.storage.from('receipts').getPublicUrl(path);
      receiptUrl = pub.publicUrl;
    }

    const order = {
      orderNumber,
      userId: currentUser.id,
      customerName: document.getElementById('coName').value.trim(),
      customerPhone: document.getElementById('coPhone').value.trim(),
      customerEmail: document.getElementById('coEmail').value.trim(),
      ...buildShippingFields(),
      items: cart.map(i => ({ id: i.id, name: i.name, size: i.size, qty: i.qty, price: i.price, imageUrl: i.imageUrl })),
      total: payableTotal(),
      discountCode: appliedDiscount?.code || null,
      discountAmount: appliedDiscount ? discountAmount() : null,
      paymentMethod: selectedPayMethod,
      mpLinkType: selectedPayMethod === 'mercadopago' ? mpAvailability.mpLinkType : null,
      receiptUrl,
      status: 'nuevo',
      createdAt: Date.now(),
    };

    const { error: insertError } = await supabase.from('orders').insert(order);
    if (insertError) throw insertError;
    if (appliedDiscount) {
      const { error: usedError } = await supabase.from('discount_codes')
        .update({ used: true }).eq('code', appliedDiscount.code);
      if (usedError) console.error('No se pudo marcar el código como usado:', usedError);
      appliedDiscount = null;
    }
    await deductStock(cart);

    document.getElementById('orderNum').textContent = '#' + orderNumber;
    document.getElementById('checkoutSuccessNote').textContent = selectedPayMethod === 'transfer'
      ? 'Tu pedido y comprobante fueron registrados. Te avisaremos por WhatsApp en cuanto confirmemos tu pago.'
      : 'Tu pedido fue registrado. Te avisaremos por WhatsApp en cuanto lo confirmemos.';

    cart = [];
    saveCart();
    renderCart();
    goToStep(3);
  } catch (err) {
    console.error(err);
    alert('Hubo un problema al registrar tu pedido. Intenta nuevamente.');
  } finally {
    btn.disabled = false;
    btn.textContent = 'Confirmar pedido';
  }
});

async function deductStock(cartItems) {
  for (const item of cartItems) {
    const p = allProducts.find(x => x.id === item.id);
    if (!p) continue;
    const sizeStock = { ...(p.sizeStock || {}) };
    if (item.size in sizeStock) sizeStock[item.size] = Math.max(0, (sizeStock[item.size] || 0) - item.qty);
    try {
      const { error } = await supabase.from('products').update({
        sizeStock,
        stock: Object.values(sizeStock).reduce((a, b) => a + b, 0),
      }).eq('id', item.id);
      if (error) throw error;
      p.sizeStock = sizeStock;
    } catch (err) { console.warn('No se pudo descontar stock de', item.id, err); }
  }
}

document.getElementById('continueShopping').addEventListener('click', () => {
  closeCheckout();
  goToStep(1);
  document.getElementById('checkoutForm1').reset();
  document.getElementById('checkoutForm2').reset();
  document.querySelector('.shipping-type-btn[data-shipping-type="domicilio"]').click();
});

/* ===================================================================
   INIT
   =================================================================== */
const EDITOR_MODE = location.search.includes('editor');

// Alcance restringido a esta página para poder instalarse como app aparte
// del panel admin (que registra su propio service worker). No se registra
// en modo editor (iframe de vista previa dentro del admin).
if (!EDITOR_MODE && 'serviceWorker' in navigator) {
  navigator.serviceWorker.register('sw-store.js', { scope: 'index.html' })
    .catch(err => console.warn('No se pudo registrar el service worker:', err));
}

(async function init() {
  await initAuth();
  // En modo editor (iframe del panel admin) NO cargamos los textos desde
  // Firestore: el panel es la única autoridad y aplica el contenido en vivo,
  // así no pisa lo que el administrador está escribiendo sin guardar.
  if (!EDITOR_MODE) loadPageContent();
  loadCategories();
  try {
    await Promise.all([loadProducts(), loadSettings(), loadProductTypes(), loadSeasons()]);
    renderCatalog();
    applySocialLinks();
  } catch (err) {
    if (!EDITOR_MODE) {
      grid.innerHTML = `<p class="catalog__empty">No se pudo conectar con la tienda. Si eres el administrador: revisa que <code>supabase-config.js</code> tenga las claves reales de tu proyecto Supabase (hoy tiene valores de ejemplo).</p>`;
    }
  }
  renderCart();
})();

function applySocialLinks() {
  const links = {
    socialInstagram: document.getElementById('socialInstagram'),
    socialTiktok: document.getElementById('socialTiktok'),
    socialWhatsapp: document.getElementById('socialWhatsapp'),
  };
  Object.entries(links).forEach(([key, el]) => {
    if (el && storeSettings[key]) el.href = storeSettings[key];
  });
}
