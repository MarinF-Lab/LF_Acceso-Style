import { supabase } from './supabase-config.js';
import { applyContent } from './content-fields.js';
import { DEFAULT_CATEGORIES, DEFAULT_PRODUCT_TYPES, SIZES, renderCategoryCards } from './categories.js';
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

document.getElementById('newsletter')?.addEventListener('submit', e => {
  e.preventDefault();
  const note = document.getElementById('promoNote');
  if (note) { note.hidden = false; e.target.reset(); }
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
let selectedPayMethod = null;
let receiptFile = null;
let currentUser = null;
const ORDER_STATUS_LABELS = {
  nuevo: 'Nuevo', armando: 'Armando', en_camino: 'En camino', entregado: 'Entregado', rechazado: 'Rechazado',
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
  }
}

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
}

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
      <article class="card" data-cat="${p.type || ''}" data-id="${p.id}" ${p.imageUrl ? '' : `style="--c1:${GRADIENTS[idx % GRADIENTS.length][0]};--c2:${GRADIENTS[idx % GRADIENTS.length][1]}"`}>
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
}

function totalStock(p) {
  if (!p.sizeStock) return p.stock || 0;
  return Object.values(p.sizeStock).reduce((a, b) => a + (Number(b) || 0), 0);
}

function wireFilters() {
  const filters = document.getElementById('filters');
  const cards = [...document.querySelectorAll('#grid .card')];
  filters?.querySelectorAll('.chip').forEach(chip => {
    chip.onclick = () => {
      filters.querySelectorAll('.chip').forEach(c => c.classList.remove('is-active'));
      chip.classList.add('is-active');
      const f = chip.dataset.filter;
      cards.forEach(c => { c.style.display = (f === 'all' || c.dataset.cat === f) ? '' : 'none'; });
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

  document.getElementById('qvMedia').innerHTML = p.imageUrl
    ? `<img src="${p.imageUrl}" alt="${p.name}" />`
    : `<span class="card__ph">${(p.type || 'Producto').toUpperCase()}</span>`;
  document.getElementById('qvName').textContent = p.name;
  document.getElementById('qvPrice').textContent = fmt(p.price);
  document.getElementById('qvDesc').textContent = p.description || '';
  document.getElementById('qvQty').textContent = quickViewQty;
  document.getElementById('qvNote').hidden = true;

  const sizeStock = p.sizeStock || {};
  const sizesRow = document.getElementById('qvSizes');
  const sizes = Object.keys(sizeStock).length ? Object.keys(sizeStock) : SIZES;
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

function renderCart() {
  const badge = document.getElementById('cartBadge');
  badge.textContent = cartCount();

  const itemsEl = document.getElementById('cartItems');
  const footerEl = document.getElementById('cartFooter');

  if (!cart.length) {
    itemsEl.innerHTML = `<p class="cart-drawer__empty">Tu carrito está vacío.</p>`;
    footerEl.style.display = 'none';
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

  document.getElementById('cartTotal').textContent = fmt(cartTotal());
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
    <p class="cart-drawer__empty" id="accountOrdersEmpty" hidden>Aún no tienes compras.</p>
    <div id="accountOrdersList"></div>
  `;
  document.getElementById('logoutAccountBtn').addEventListener('click', () => supabase.auth.signOut());

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
    if (currentUser) document.getElementById('cartAuth').hidden = true;
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

function renderPaymentMethods() {
  const wrap = document.getElementById('payMethods');
  const hasTransfer = storeSettings.bankName || storeSettings.bankAccountNumber;
  wrap.querySelectorAll('.pay-method').forEach(btn => {
    const method = btn.dataset.method;
    btn.disabled = method === 'transfer' && !hasTransfer;
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
  document.getElementById('confirmOrderBtn').disabled = selectedPayMethod === 'mercadopago';
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
    el.innerHTML = `<p class="pay-note">Mercado Pago se implementará más adelante. Por ahora, paga con transferencia bancaria.</p>`;
  }
}

function renderOrderSummaryMini() {
  const el = document.getElementById('orderSummaryMini');
  el.innerHTML = `
    ${cart.map(i => `<div class="summary-item"><span>${i.name} × ${i.qty} (${i.size})</span><span>${fmt(i.price * i.qty)}</span></div>`).join('')}
    <div class="summary-total"><span>Total</span><span>${fmt(cartTotal())}</span></div>
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

document.getElementById('mapsLinkSucursal').addEventListener('click', () => {
  const comuna = document.getElementById('coComuna').value.trim();
  window.open(`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`Starken ${comuna}, Chile`.trim())}`, '_blank');
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
      total: cartTotal(),
      paymentMethod: selectedPayMethod,
      receiptUrl,
      status: 'nuevo',
      createdAt: Date.now(),
    };

    const { error: insertError } = await supabase.from('orders').insert(order);
    if (insertError) throw insertError;
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
    await Promise.all([loadProducts(), loadSettings(), loadProductTypes()]);
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
