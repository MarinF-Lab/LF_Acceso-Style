import { supabase } from './supabase-config.js';
import { CONTENT_SECTIONS, CONTENT_FIELDS, applyContent, renderHeroTitle, getContent } from './content-fields.js';
import { DEFAULT_CATEGORIES, sortCategories } from './categories.js';

/* ===================================================================
   SEGURIDAD — contraseña por defecto: lfacceso2026
   Mismo patrón que cliente-1: hash local en localStorage, sin Supabase
   Auth. Ver nota de seguridad en supabase/schema.sql.
   =================================================================== */
const STORAGE_KEYS = { PWD_HASH: 'lf_admin_pwd', SESSION: 'lf_admin_session' };
const DEFAULT_PWD_HASH = 'a067d8e674a155a1595ba01d98796dc6cc919936c08fe942990d0bfa5a84de33';

async function sha256(str) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(str));
  return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('');
}
function getStoredHash() { return localStorage.getItem(STORAGE_KEYS.PWD_HASH) || DEFAULT_PWD_HASH; }

const SESSION_TTL = 8 * 60 * 60 * 1000;
function isLoggedIn() {
  try {
    const s = JSON.parse(localStorage.getItem(STORAGE_KEYS.SESSION) || 'null');
    return s && (Date.now() - s.ts) < SESSION_TTL;
  } catch { return false; }
}
function createSession() { localStorage.setItem(STORAGE_KEYS.SESSION, JSON.stringify({ ts: Date.now() })); }
function destroySession() { localStorage.removeItem(STORAGE_KEYS.SESSION); }

/* ===================================================================
   ESTADO
   =================================================================== */
let allProducts = [];
let allOrders = [];
let storeSettings = {};
let pageContent = {};
let editingProductId = null;
let selectedOrderId = null;

const SIZES = ['S', 'M', 'L', 'XL'];
const ORDER_STATUSES = [
  { id: 'nuevo',      label: 'Nuevo' },
  { id: 'armando',    label: 'Armando' },
  { id: 'en_camino',  label: 'En camino' },
  { id: 'entregado',  label: 'Entregado' },
];
const STATUS_MESSAGES = {
  armando:   (o) => `Hola ${o.customerName}! 👋 Tu pedido #${o.orderNumber} de LF Acceso Style fue *aceptado* y está *en preparación*. Te avisamos apenas salga en camino.`,
  en_camino: (o) => `Hola ${o.customerName}! 🚚 Tu pedido #${o.orderNumber} va *en camino*. ¡Gracias por tu compra en LF Acceso Style!`,
  entregado: (o) => `Hola ${o.customerName}! 🎉 Tu pedido #${o.orderNumber} fue *entregado*. Gracias por confiar en LF Acceso Style.`,
  rechazado: (o) => `Hola ${o.customerName}, no pudimos confirmar el pago de tu pedido #${o.orderNumber} — revisa que el comprobante de transferencia esté correcto y respóndenos por este medio para resolverlo.`,
};
const EXTRA_STATUS_LABELS = { rechazado: 'Rechazado' };
function statusLabel(id) { return ORDER_STATUSES.find(s => s.id === id)?.label || EXTRA_STATUS_LABELS[id] || id; }

function withTimeout(promise, ms, label) {
  return Promise.race([
    promise,
    new Promise((_, reject) => setTimeout(() => reject(new Error(`Timeout: ${label}`)), ms)),
  ]);
}

function fmt(n) { return '$' + Number(n || 0).toLocaleString('es-CL'); }
function toast(msg) {
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(toast._t);
  toast._t = setTimeout(() => t.classList.remove('show'), 2600);
}
function waLink(phone, message) {
  const digits = (phone || '').replace(/\D/g, '');
  return `https://wa.me/${digits}?text=${encodeURIComponent(message)}`;
}

/* ===================================================================
   LOGIN
   =================================================================== */
const loginScreen = document.getElementById('loginScreen');
const adminApp = document.getElementById('adminApp');
const loginForm = document.getElementById('loginForm');
const loginError = document.getElementById('loginError');
const loginPassword = document.getElementById('loginPassword');

document.getElementById('togglePwd').addEventListener('click', () => {
  loginPassword.type = loginPassword.type === 'password' ? 'text' : 'password';
});

loginForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  const hash = await sha256(loginPassword.value);
  if (hash === getStoredHash()) {
    createSession();
    loginError.style.display = 'none';
    showAdmin();
  } else {
    loginError.style.display = 'block';
  }
});

document.getElementById('logoutBtn').addEventListener('click', () => {
  destroySession();
  location.reload();
});

async function showAdmin() {
  loginScreen.style.display = 'none';
  adminApp.style.display = 'flex';
  try {
    await Promise.all([refreshProducts(), refreshOrders(), refreshCategories(), loadSettings(), loadPageContent()]);
    renderDashboard();
    renderProductsTable();
    renderOrdersTable();
    renderCategoriesTable();
  } catch (err) {
    console.error(err);
    toast('No se pudo conectar con Supabase. Revisa supabase-config.js (¿tiene tus claves reales?).');
  }
  initContentEditor();
}

if (isLoggedIn()) showAdmin();

/* ===================================================================
   NAVEGACIÓN (sidebar)
   =================================================================== */
const viewTitles = { dashboard: 'Dashboard', products: 'Productos', add: 'Agregar producto', categories: 'Categorías', orders: 'Pedidos', settings: 'Configuración' };

document.querySelectorAll('.nav-item').forEach(btn => {
  btn.addEventListener('click', () => showView(btn.dataset.view));
});
document.getElementById('goAddProduct').addEventListener('click', () => showView('add'));
document.getElementById('cancelProductForm').addEventListener('click', () => { resetProductForm(); showView('products'); });

function showView(name) {
  document.querySelectorAll('.nav-item').forEach(b => b.classList.toggle('active', b.dataset.view === name));
  document.querySelectorAll('.view').forEach(v => v.classList.toggle('active', v.id === `view-${name}`));
  document.getElementById('viewTitle').textContent = viewTitles[name] || '';
  document.querySelector('.sidebar').classList.remove('open');
  document.getElementById('sidebarOverlay').classList.remove('open');
  if (name === 'add' && !editingProductId) resetProductForm();
}

document.getElementById('burgerAdmin').addEventListener('click', () => {
  document.querySelector('.sidebar').classList.add('open');
  document.getElementById('sidebarOverlay').classList.add('open');
});
document.getElementById('sidebarClose').addEventListener('click', () => {
  document.querySelector('.sidebar').classList.remove('open');
  document.getElementById('sidebarOverlay').classList.remove('open');
});
document.getElementById('sidebarOverlay').addEventListener('click', () => {
  document.querySelector('.sidebar').classList.remove('open');
  document.getElementById('sidebarOverlay').classList.remove('open');
});

/* ===================================================================
   PRODUCTOS
   =================================================================== */
async function refreshProducts() {
  const { data, error } = await withTimeout(supabase.from('products').select('*'), 8000, 'products');
  if (error) throw error;
  allProducts = data;
}

function totalStock(p) {
  if (!p.sizeStock) return p.stock || 0;
  return Object.values(p.sizeStock).reduce((a, b) => a + (Number(b) || 0), 0);
}

function renderProductsTable() {
  const tbody = document.querySelector('#productsTable tbody');
  const search = (document.getElementById('productSearch').value || '').toLowerCase();
  const rows = allProducts
    .filter(p => p.name.toLowerCase().includes(search))
    .map(p => {
      const stock = totalStock(p);
      const stockBadge = stock === 0 ? `<span class="badge badge--low">Sin stock</span>`
        : stock < 3 ? `<span class="badge badge--low">${stock} bajo</span>`
        : `<span class="badge badge--ok">${stock}</span>`;
      return `<tr data-id="${p.id}">
        <td data-label="Imagen"><img class="thumb" src="${p.imageUrl || ''}" onerror="this.style.visibility='hidden'" /></td>
        <td data-label="Nombre">${p.name}</td>
        <td data-label="Categoría" style="text-transform:capitalize">${p.category || '—'}</td>
        <td data-label="Precio">${fmt(p.price)}</td>
        <td data-label="Stock">${stockBadge}</td>
        <td data-label="Etiqueta">${p.tag ? `<span class="badge badge--nuevo">${p.tag === 'top' ? 'Top ventas' : 'Nuevo'}</span>` : '—'}</td>
        <td data-label=""><button class="btn-admin btn-admin--danger" data-del="${p.id}">Eliminar</button></td>
      </tr>`;
    }).join('');
  tbody.innerHTML = rows || `<tr><td colspan="7" style="text-align:center;color:var(--dim);padding:2rem">Sin productos aún. Agrega el primero.</td></tr>`;

  tbody.querySelectorAll('tr[data-id]').forEach(tr => {
    tr.addEventListener('click', (e) => {
      if (e.target.closest('[data-del]')) return;
      editProduct(tr.dataset.id);
    });
  });
  tbody.querySelectorAll('[data-del]').forEach(btn => {
    btn.addEventListener('click', (e) => { e.stopPropagation(); confirmDeleteProduct(btn.dataset.del); });
  });
}
document.getElementById('productSearch').addEventListener('input', renderProductsTable);

function confirmDeleteProduct(id) {
  if (!confirm('¿Eliminar este producto? Esta acción no se puede deshacer.')) return;
  supabase.from('products').delete().eq('id', id).then(async ({ error }) => {
    if (error) { toast('Error al eliminar: ' + error.message); return; }
    await refreshProducts();
    renderProductsTable();
    renderDashboard();
    toast('Producto eliminado');
  });
}

function editProduct(id) {
  const p = allProducts.find(x => x.id === id);
  if (!p) return;
  editingProductId = id;
  document.getElementById('productId').value = id;
  document.getElementById('pName').value = p.name || '';
  document.getElementById('pCategory').value = p.category || 'hombre';
  document.getElementById('pType').value = p.type || 'polera';
  document.getElementById('pPrice').value = p.price || 0;
  document.getElementById('pTag').value = p.tag || '';
  document.getElementById('pDesc').value = p.description || '';
  document.getElementById('pImageUrl').value = p.imageUrl || '';
  document.getElementById('pColors').value = (p.colors || []).join(', ');
  const preview = document.getElementById('pImagePreview');
  if (p.imageUrl) { preview.src = p.imageUrl; preview.hidden = false; } else { preview.hidden = true; }
  document.querySelectorAll('#sizeStockGrid input').forEach(inp => {
    inp.value = (p.sizeStock && p.sizeStock[inp.dataset.size]) || 0;
  });
  document.getElementById('saveProductBtn').textContent = 'Guardar cambios';
  showView('add');
}

function resetProductForm() {
  editingProductId = null;
  document.getElementById('productForm').reset();
  document.getElementById('productId').value = '';
  document.getElementById('pImagePreview').hidden = true;
  document.querySelectorAll('#sizeStockGrid input').forEach(inp => inp.value = 0);
  document.getElementById('saveProductBtn').textContent = 'Guardar producto';
}

document.getElementById('pImageFile').addEventListener('change', (e) => {
  const file = e.target.files[0];
  if (!file) return;
  const preview = document.getElementById('pImagePreview');
  preview.src = URL.createObjectURL(file);
  preview.hidden = false;
});
document.getElementById('pImageUrl').addEventListener('input', (e) => {
  const preview = document.getElementById('pImagePreview');
  if (e.target.value) { preview.src = e.target.value; preview.hidden = false; }
});

document.getElementById('productForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const btn = document.getElementById('saveProductBtn');
  btn.disabled = true;
  btn.textContent = 'Guardando...';

  try {
    let imageUrl = document.getElementById('pImageUrl').value.trim();
    const file = document.getElementById('pImageFile').files[0];
    if (file) {
      const path = `${Date.now()}-${file.name}`;
      const { error: uploadError } = await supabase.storage.from('products').upload(path, file, { upsert: true });
      if (uploadError) throw uploadError;
      const { data: pub } = supabase.storage.from('products').getPublicUrl(path);
      imageUrl = pub.publicUrl;
    }

    const sizeStock = {};
    document.querySelectorAll('#sizeStockGrid input').forEach(inp => {
      sizeStock[inp.dataset.size] = Number(inp.value) || 0;
    });

    const colors = document.getElementById('pColors').value
      .split(',').map(c => c.trim()).filter(Boolean);

    const product = {
      name: document.getElementById('pName').value.trim(),
      category: document.getElementById('pCategory').value,
      type: document.getElementById('pType').value,
      price: Number(document.getElementById('pPrice').value) || 0,
      tag: document.getElementById('pTag').value || null,
      description: document.getElementById('pDesc').value.trim(),
      imageUrl: imageUrl || '',
      colors,
      sizeStock,
      stock: Object.values(sizeStock).reduce((a, b) => a + b, 0),
      updatedAt: Date.now(),
    };

    if (editingProductId) {
      const { error } = await supabase.from('products').update(product).eq('id', editingProductId);
      if (error) throw error;
      toast('Producto actualizado');
    } else {
      product.createdAt = Date.now();
      const { error } = await supabase.from('products').insert(product);
      if (error) throw error;
      toast('Producto creado');
    }

    await refreshProducts();
    renderProductsTable();
    renderDashboard();
    resetProductForm();
    showView('products');
  } catch (err) {
    console.error(err);
    toast('Error al guardar: ' + err.message);
  } finally {
    btn.disabled = false;
  }
});

/* ===================================================================
   CATEGORÍAS
   =================================================================== */
let allCategories = [];
let editingCategoryId = null;

async function refreshCategories() {
  const { data, error } = await withTimeout(supabase.from('categories').select('*'), 8000, 'categories');
  if (error) throw error;
  allCategories = sortCategories(data.length ? data : DEFAULT_CATEGORIES);
}

function renderCategoriesTable() {
  const tbody = document.querySelector('#categoriesTable tbody');
  tbody.innerHTML = allCategories.map((c, idx) => `
    <tr data-id="${c.id}">
      <td data-label="Orden">
        <div class="cat-order-controls">
          <button type="button" class="cat-order-btn" data-move="up" data-id="${c.id}" ${idx === 0 ? 'disabled' : ''}>↑</button>
          <button type="button" class="cat-order-btn" data-move="down" data-id="${c.id}" ${idx === allCategories.length - 1 ? 'disabled' : ''}>↓</button>
        </div>
      </td>
      <td data-label="Nombre">${c.name}</td>
      <td data-label="Descripción">${c.description || '—'}</td>
      <td data-label="Visible"><button type="button" class="btn-admin ${c.hidden ? '' : 'btn-admin--primary'}" data-toggle="${c.id}">${c.hidden ? 'Oculta' : 'Visible'}</button></td>
      <td data-label="">
        <button type="button" class="btn-admin" data-edit="${c.id}">Editar</button>
        <button type="button" class="btn-admin btn-admin--danger" data-del="${c.id}">Eliminar</button>
      </td>
    </tr>`).join('') || `<tr><td colspan="5" style="text-align:center;color:var(--dim);padding:2rem">Sin categorías aún. Agrega la primera.</td></tr>`;

  tbody.querySelectorAll('tr[data-id]').forEach(tr => {
    tr.addEventListener('click', (e) => {
      if (e.target.closest('button')) return;
      editCategory(tr.dataset.id);
    });
  });
  tbody.querySelectorAll('[data-move]').forEach(btn => {
    btn.addEventListener('click', (e) => { e.stopPropagation(); moveCategory(btn.dataset.id, btn.dataset.move); });
  });
  tbody.querySelectorAll('[data-toggle]').forEach(btn => {
    btn.addEventListener('click', (e) => { e.stopPropagation(); toggleCategoryHidden(btn.dataset.toggle); });
  });
  tbody.querySelectorAll('[data-edit]').forEach(btn => {
    btn.addEventListener('click', (e) => { e.stopPropagation(); editCategory(btn.dataset.edit); });
  });
  tbody.querySelectorAll('[data-del]').forEach(btn => {
    btn.addEventListener('click', (e) => { e.stopPropagation(); confirmDeleteCategory(btn.dataset.del); });
  });
}

async function moveCategory(id, direction) {
  const idx = allCategories.findIndex(c => c.id === id);
  const swapIdx = direction === 'up' ? idx - 1 : idx + 1;
  if (idx === -1 || swapIdx < 0 || swapIdx >= allCategories.length) return;
  const a = allCategories[idx];
  const b = allCategories[swapIdx];
  const { error } = await supabase.from('categories').upsert([
    { ...a, order: b.order },
    { ...b, order: a.order },
  ]);
  if (error) { toast('Error al reordenar: ' + error.message); return; }
  await refreshCategories();
  renderCategoriesTable();
}

async function toggleCategoryHidden(id) {
  const c = allCategories.find(x => x.id === id);
  if (!c) return;
  const { error } = await supabase.from('categories').update({ hidden: !c.hidden }).eq('id', id);
  if (error) { toast('Error: ' + error.message); return; }
  await refreshCategories();
  renderCategoriesTable();
}

function editCategory(id) {
  const c = allCategories.find(x => x.id === id);
  if (!c) return;
  editingCategoryId = id;
  document.getElementById('categoryId').value = c.id;
  document.getElementById('catName').value = c.name || '';
  document.getElementById('catDesc').value = c.description || '';
  document.getElementById('categoryFormTitle').textContent = 'Editar categoría';
  document.getElementById('categoryForm').hidden = false;
}

function confirmDeleteCategory(id) {
  if (!confirm('¿Eliminar esta categoría? Esta acción no se puede deshacer.')) return;
  supabase.from('categories').delete().eq('id', id).then(async ({ error }) => {
    if (error) { toast('Error al eliminar: ' + error.message); return; }
    await refreshCategories();
    renderCategoriesTable();
    toast('Categoría eliminada');
  });
}

function slugifyCategoryName(str) {
  return str.toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '');
}

document.getElementById('addCategoryBtn').addEventListener('click', () => {
  editingCategoryId = null;
  document.getElementById('categoryId').value = '';
  document.getElementById('catName').value = '';
  document.getElementById('catDesc').value = '';
  document.getElementById('categoryFormTitle').textContent = 'Nueva categoría';
  document.getElementById('categoryForm').hidden = false;
});

document.getElementById('cancelCategoryForm').addEventListener('click', () => {
  document.getElementById('categoryForm').hidden = true;
});

document.getElementById('saveCategoryBtn').addEventListener('click', async () => {
  const name = document.getElementById('catName').value.trim();
  const description = document.getElementById('catDesc').value.trim();
  if (!name) { toast('El nombre de la categoría es obligatorio'); return; }

  try {
    if (editingCategoryId) {
      const { error } = await supabase.from('categories').update({ name, description }).eq('id', editingCategoryId);
      if (error) throw error;
      toast('Categoría actualizada');
    } else {
      let id = slugifyCategoryName(name) || `cat-${Date.now()}`;
      if (allCategories.some(c => c.id === id)) id = `${id}-${Date.now()}`;
      const order = allCategories.length ? Math.max(...allCategories.map(c => c.order ?? 0)) + 1 : 0;
      const { error } = await supabase.from('categories').insert({ id, name, description, order, hidden: false });
      if (error) throw error;
      toast('Categoría creada');
    }
    document.getElementById('categoryForm').hidden = true;
    await refreshCategories();
    renderCategoriesTable();
  } catch (err) {
    console.error(err);
    toast('Error al guardar: ' + err.message);
  }
});

/* ===================================================================
   PEDIDOS
   =================================================================== */
async function refreshOrders() {
  const { data, error } = await withTimeout(
    supabase.from('orders').select('*').order('createdAt', { ascending: false }), 8000, 'orders'
  );
  if (error) throw error;
  allOrders = data;
}

function paymentLabel(method) {
  return method === 'mercadopago' ? 'Mercado Pago' : method === 'transfer' ? 'Transferencia' : method || '—';
}

function orderRowHtml(o) {
  return `
    <tr data-id="${o.id}" class="${o.id === selectedOrderId ? 'active-row' : ''}">
      <td data-label="N°">#${o.orderNumber}</td>
      <td data-label="Fecha">${new Date(o.createdAt).toLocaleDateString('es-CL')}</td>
      <td data-label="Cliente">${o.customerName}</td>
      <td data-label="Total">${fmt(o.total)}</td>
      <td data-label="Pago">${paymentLabel(o.paymentMethod)}</td>
      <td data-label="Estado"><span class="badge badge--${o.status}">${statusLabel(o.status)}</span></td>
    </tr>`;
}

function renderOrdersTable() {
  // #orderDetail puede estar montado dentro de una fila de una tabla (en
  // mobile) que estamos a punto de destruir con innerHTML — lo rescatamos
  // a su lugar de siempre antes de reconstruir las filas.
  document.querySelector('.orders-layout')?.appendChild(document.getElementById('orderDetail'));

  // Pedidos más nuevos arriba (allOrders ya viene ordenado así desde la
  // consulta); se separan en "activos" (por confirmar/en proceso) e
  // "historial" (entregados o rechazados).
  const activeOrders = allOrders.filter(o => !['entregado', 'rechazado'].includes(o.status));
  const historyOrders = allOrders.filter(o => ['entregado', 'rechazado'].includes(o.status));

  const activeBody = document.querySelector('#ordersTableActive tbody');
  activeBody.innerHTML = activeOrders.map(orderRowHtml).join('')
    || `<tr><td colspan="6" style="text-align:center;color:var(--dim);padding:2rem">Sin pedidos por confirmar o en proceso.</td></tr>`;

  const historyBody = document.querySelector('#ordersTableHistory tbody');
  historyBody.innerHTML = historyOrders.map(orderRowHtml).join('')
    || `<tr><td colspan="6" style="text-align:center;color:var(--dim);padding:2rem">Aún no hay pedidos en el historial.</td></tr>`;

  document.querySelectorAll('#ordersTableActive tr[data-id], #ordersTableHistory tr[data-id]').forEach(tr => {
    tr.addEventListener('click', () => { selectedOrderId = tr.dataset.id; renderOrdersTable(); renderOrderDetail(); });
  });

  const dashBody = document.querySelector('#dashboardOrdersTable tbody');
  const recent = allOrders.slice(0, 5).map(o => `
    <tr><td data-label="N°">#${o.orderNumber}</td><td data-label="Cliente">${o.customerName}</td><td data-label="Total">${fmt(o.total)}</td>
      <td data-label="Pago">${paymentLabel(o.paymentMethod)}</td>
      <td data-label="Estado"><span class="badge badge--${o.status}">${statusLabel(o.status)}</span></td></tr>`).join('');
  dashBody.innerHTML = recent || `<tr><td colspan="5" style="text-align:center;color:var(--dim);padding:1.5rem">Sin pedidos aún.</td></tr>`;
}

function renderOrderDetail() {
  const el = document.getElementById('orderDetail');
  const o = allOrders.find(x => x.id === selectedOrderId);
  if (!o) { el.innerHTML = `<p class="order-detail__empty">Selecciona un pedido para ver el detalle.</p>`; return; }

  const itemsHtml = (o.items || []).map(it => `
    <div class="order-item">
      <img src="${it.imageUrl || ''}" onerror="this.style.visibility='hidden'" />
      <div class="order-item__info">
        <strong>${it.name}</strong>
        <span>Talla ${it.size} · Cant. ${it.qty} · ${fmt(it.price)} c/u</span>
      </div>
    </div>`).join('');

  const supplierMsg = `Nuevo pedido #${o.orderNumber} para armar:\n` +
    (o.items || []).map(it => `• ${it.name} — Talla ${it.size} — Cant. ${it.qty}${it.imageUrl ? `\n  Imagen: ${it.imageUrl}` : ''}`).join('\n') +
    `\n\nCliente: ${o.customerName}${o.address ? `\nDirección: ${o.address}` : ''}`;

  const receiptHtml = o.receiptUrl
    ? `<a class="receipt-link" href="${o.receiptUrl}" target="_blank" rel="noopener">📎 Ver comprobante de transferencia</a>`
    : (o.paymentMethod === 'transfer' ? `<p class="order-detail__meta">⚠️ Sin comprobante adjunto.</p>` : '');

  // Flujo: nuevo (revisar pago → aceptar/rechazar) → armando (en preparación)
  // → en_camino → entregado. Un solo botón por paso, sin saltos ni pasos extra.
  let actionsHtml;
  if (o.status === 'nuevo') {
    const reviewNote = o.paymentMethod === 'transfer'
      ? 'Revisa el comprobante antes de aceptar el pedido.'
      : `Verifica en tu cuenta de Mercado Pago que el pago de este pedido esté aprobado antes de aceptar.`;
    actionsHtml = `
      <p class="order-detail__meta">${reviewNote}</p>
      <div class="order-actions">
        <button type="button" class="btn-admin btn-admin--primary btn-full" data-accept>✓ Aceptar pedido</button>
        <button type="button" class="btn-admin btn-admin--danger btn-full" data-reject>✕ Rechazar pedido</button>
      </div>`;
  } else if (o.status === 'armando') {
    actionsHtml = `
      <div class="order-actions">
        <button type="button" class="btn-admin btn-admin--primary btn-full" data-next="en_camino">🚚 Pedido en camino</button>
      </div>`;
  } else if (o.status === 'en_camino') {
    actionsHtml = `
      <div class="order-actions">
        <button type="button" class="btn-admin btn-admin--primary btn-full" data-next="entregado">✅ Pedido entregado</button>
      </div>`;
  } else if (o.status === 'rechazado') {
    actionsHtml = `<p class="order-detail__meta">Este pedido fue rechazado.</p>`;
  } else {
    actionsHtml = `<p class="order-detail__meta">Pedido entregado — ciclo cerrado.</p>`;
  }

  el.innerHTML = `
    <h3>Pedido #${o.orderNumber}</h3>
    <p class="order-detail__meta">${o.customerName} · ${o.customerPhone || 'sin teléfono'} · ${new Date(o.createdAt).toLocaleString('es-CL')}</p>
    ${itemsHtml}
    <div class="order-total"><span>Total</span><span>${fmt(o.total)}</span></div>
    <p class="order-detail__meta">Pago: ${paymentLabel(o.paymentMethod)}${o.address ? ` · Envío a: ${o.address}` : ''}</p>
    ${receiptHtml}
    ${actionsHtml}
    <button type="button" class="btn-admin btn-admin--danger btn-full" data-delete-order style="margin-top:1.2rem">🗑 Eliminar pedido</button>
  `;

  el.querySelector('[data-accept]')?.addEventListener('click', () => {
    // Al aceptar: avisa al cliente (pedido aceptado y en preparación) y
    // manda las specs al proveedor, en un solo paso.
    updateOrderStatus(o, 'armando');
    window.open(waLink(storeSettings.whatsappSupplier, supplierMsg), '_blank');
  });
  el.querySelector('[data-reject]')?.addEventListener('click', () => {
    if (!confirm('¿Rechazar este pedido? Se avisará al cliente por WhatsApp.')) return;
    updateOrderStatus(o, 'rechazado');
  });
  el.querySelector('[data-next]')?.addEventListener('click', (e) => updateOrderStatus(o, e.target.dataset.next));
  el.querySelector('[data-delete-order]')?.addEventListener('click', () => confirmDeleteOrder(o.id));

  positionOrderDetail();
}

function confirmDeleteOrder(id) {
  if (!confirm('¿Eliminar este pedido? Esta acción no se puede deshacer.')) return;
  supabase.from('orders').delete().eq('id', id).then(async ({ error }) => {
    if (error) { toast('Error al eliminar: ' + error.message); return; }
    if (selectedOrderId === id) selectedOrderId = null;
    await refreshOrders();
    renderOrdersTable();
    renderOrderDetail();
    renderDashboard();
    toast('Pedido eliminado');
  });
}

/* En mobile, el detalle del pedido se muestra justo debajo de la fila
   seleccionada (dentro de la misma tabla) en vez de al final de toda la
   lista. En escritorio vuelve a su lugar habitual, como panel lateral. */
function positionOrderDetail() {
  const detailEl = document.getElementById('orderDetail');
  document.querySelectorAll('.order-detail-row').forEach(tr => tr.remove());

  const isMobile = window.matchMedia('(max-width: 900px)').matches;
  if (isMobile && selectedOrderId) {
    const row = document.querySelector(`#ordersTableActive tr[data-id="${selectedOrderId}"], #ordersTableHistory tr[data-id="${selectedOrderId}"]`);
    if (row) {
      const wrapperRow = document.createElement('tr');
      wrapperRow.className = 'order-detail-row';
      const td = document.createElement('td');
      td.colSpan = 6;
      td.appendChild(detailEl);
      wrapperRow.appendChild(td);
      row.after(wrapperRow);
      return;
    }
  }
  document.querySelector('.orders-layout').appendChild(detailEl);
}
window.addEventListener('resize', () => { if (document.getElementById('view-orders')?.classList.contains('active')) positionOrderDetail(); });

async function updateOrderStatus(order, newStatus) {
  const { error } = await supabase.from('orders').update({ status: newStatus, updatedAt: Date.now() }).eq('id', order.id);
  if (error) { toast('Error al actualizar: ' + error.message); return; }
  order.status = newStatus;
  renderOrdersTable();
  renderOrderDetail();
  renderDashboard();

  const buildMsg = STATUS_MESSAGES[newStatus];
  if (buildMsg && order.customerPhone) {
    window.open(waLink(order.customerPhone, buildMsg(order)), '_blank');
  }
  toast(`Pedido #${order.orderNumber} → ${statusLabel(newStatus)}`);
}

/* ===================================================================
   DASHBOARD
   =================================================================== */
function renderDashboard() {
  document.getElementById('statProducts').textContent = allProducts.length;
  document.getElementById('statOrdersNew').textContent = allOrders.filter(o => o.status === 'nuevo').length;
  document.getElementById('statOrdersProgress').textContent = allOrders.filter(o => ['armando', 'en_camino'].includes(o.status)).length;
  document.getElementById('statLowStock').textContent = allProducts.filter(p => totalStock(p) < 3).length;

  const newCount = allOrders.filter(o => o.status === 'nuevo').length;
  const badge = document.getElementById('ordersBadge');
  if (newCount > 0) { badge.hidden = false; badge.textContent = newCount; } else { badge.hidden = true; }
}

/* ===================================================================
   CONFIGURACIÓN
   =================================================================== */
async function loadSettings() {
  const { data, error } = await withTimeout(
    supabase.from('settings').select('data').eq('id', 'store').maybeSingle(), 8000, 'settings'
  );
  if (error) throw error;
  storeSettings = data?.data || {};
  document.getElementById('sWhatsappStore').value = storeSettings.whatsappStore || '';
  document.getElementById('sWhatsappSupplier').value = storeSettings.whatsappSupplier || '';
  document.getElementById('sBankName').value = storeSettings.bankName || '';
  document.getElementById('sBankAccountType').value = storeSettings.bankAccountType || '';
  document.getElementById('sBankAccountNumber').value = storeSettings.bankAccountNumber || '';
  document.getElementById('sBankRut').value = storeSettings.bankRut || '';
  document.getElementById('sBankHolder').value = storeSettings.bankHolder || '';
  document.getElementById('sBankEmail').value = storeSettings.bankEmail || '';
  document.getElementById('sMpLink').value = storeSettings.mpLink || '';
}

document.getElementById('settingsForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const data = {
    whatsappStore: document.getElementById('sWhatsappStore').value.trim(),
    whatsappSupplier: document.getElementById('sWhatsappSupplier').value.trim(),
    bankName: document.getElementById('sBankName').value.trim(),
    bankAccountType: document.getElementById('sBankAccountType').value.trim(),
    bankAccountNumber: document.getElementById('sBankAccountNumber').value.trim(),
    bankRut: document.getElementById('sBankRut').value.trim(),
    bankHolder: document.getElementById('sBankHolder').value.trim(),
    bankEmail: document.getElementById('sBankEmail').value.trim(),
    mpLink: document.getElementById('sMpLink').value.trim(),
  };
  storeSettings = { ...storeSettings, ...data };
  const { error } = await supabase.from('settings').upsert({ id: 'store', data: storeSettings });
  if (error) { toast('No se pudo guardar: ' + error.message); return; }

  const newPwd = document.getElementById('sNewPassword').value;
  if (newPwd) {
    const hash = await sha256(newPwd);
    localStorage.setItem(STORAGE_KEYS.PWD_HASH, hash);
    document.getElementById('sNewPassword').value = '';
    toast('Configuración y contraseña actualizadas');
  } else {
    toast('Configuración guardada');
  }
});

/* ===================================================================
   TEXTOS DE LA PÁGINA (editor con vista previa en vivo)
   =================================================================== */
async function loadPageContent() {
  try {
    const { data, error } = await withTimeout(
      supabase.from('settings').select('data').eq('id', 'content').maybeSingle(), 8000, 'content'
    );
    if (error) throw error;
    pageContent = data?.data || {};
  } catch (err) {
    console.error('No se pudieron cargar los textos de la página:', err);
    pageContent = {};
  }
}

const TOGGLE_FIELDS = CONTENT_FIELDS.filter(f => f.toggle);
const TOGGLE_LABEL = Object.fromEntries(TOGGLE_FIELDS.map(f => [f.key, f.label.replace(/^Ocultar\s*/i, '')]));
let savedContent = {};       // última versión guardada (para "Descartar")
let contentDirty = false;
let editorFrameReady = false;

const frameEl = () => document.getElementById('contentPreviewFrame');

function markDirty(dirty = true) {
  contentDirty = dirty;
  const badge = document.getElementById('contentDirty');
  if (badge) badge.hidden = !dirty;
}

function initContentEditor() {
  savedContent = structuredClone(pageContent);
  const frame = frameEl();
  frame.addEventListener('load', onEditorFrameLoad);
  // Si el iframe ya cargó antes de registrar el listener, lo montamos igual.
  if (frame.contentDocument && frame.contentDocument.readyState === 'complete') onEditorFrameLoad();

  document.getElementById('heroHlInput').addEventListener('input', e => {
    pageContent.heroHighlight = e.target.value;
    refreshHeroTitle(); markDirty();
  });
  document.getElementById('heroHlColor').addEventListener('input', e => {
    pageContent.heroHighlightColor = e.target.value;
    refreshHeroTitle(); markDirty();
  });
  document.getElementById('resetContentBtn').addEventListener('click', discardContentChanges);
  document.getElementById('saveContentBtn').addEventListener('click', saveContent);
}

function onEditorFrameLoad() {
  const cdoc = frameEl().contentDocument;
  if (!cdoc) return;
  editorFrameReady = true;
  injectEditorStyles(cdoc);
  applyContent(cdoc, pageContent);      // refleja los cambios sin guardar
  makeTextEditable(cdoc);
  setupHideControls(cdoc);
  refreshEditorVisibility();
  syncToolbar();
  // Bloquear navegación por enlaces dentro del editor.
  cdoc.addEventListener('click', e => {
    const a = e.target.closest && e.target.closest('a');
    if (a) e.preventDefault();
  }, true);
}

function injectEditorStyles(cdoc) {
  if (cdoc.getElementById('editor-style')) return;
  const style = cdoc.createElement('style');
  style.id = 'editor-style';
  style.textContent = `
    [data-content], [data-content-title] { outline: 1px dashed transparent; border-radius: 4px; transition: outline-color .15s, background .15s; cursor: text; }
    [data-content]:hover, [data-content-title]:hover { outline-color: rgba(46,105,255,.5); background: rgba(46,105,255,.06); }
    [data-content]:focus, [data-content-title]:focus { outline: 2px solid #2e69ff; background: rgba(46,105,255,.08); }
    [data-content-visible] { position: relative; }
    .editor-hidden { opacity: .3; outline: 2px dashed #e5484d; }
    .editor-hidebtn {
      position: absolute; top: 6px; right: 6px; z-index: 20;
      width: 26px; height: 26px; border-radius: 50%;
      border: none; background: #e5484d; color: #fff; font-size: 14px; line-height: 1;
      cursor: pointer; display: none; align-items: center; justify-content: center;
      box-shadow: 0 2px 8px rgba(0,0,0,.4);
    }
    [data-content-visible]:hover .editor-hidebtn { display: flex; }
    .editor-hidden .editor-hidebtn { display: flex; background: #34c78e; }
  `;
  cdoc.head.appendChild(style);
}

function makeTextEditable(cdoc) {
  cdoc.querySelectorAll('[data-content]').forEach(el => {
    el.setAttribute('contenteditable', 'plaintext-only');
    el.addEventListener('input', () => {
      pageContent[el.dataset.content] = el.textContent;
      markDirty();
    });
  });

  const title = cdoc.querySelector('[data-content-title]');
  if (title) {
    title.setAttribute('contenteditable', 'plaintext-only');
    // Al enfocar mostramos el texto plano (sin el <span> de color) para editar cómodo.
    title.addEventListener('focus', () => { title.textContent = getContent(pageContent, 'heroTitle'); });
    title.addEventListener('input', () => { pageContent.heroTitle = title.textContent; markDirty(); });
    // Al salir, re-aplicamos la palabra destacada con su color.
    title.addEventListener('blur', () => renderHeroTitle(cdoc, pageContent));
  }
}

function setupHideControls(cdoc) {
  TOGGLE_FIELDS.forEach(f => {
    cdoc.querySelectorAll(`[data-content-visible="${f.key}"]`).forEach(el => {
      if (el.querySelector(':scope > .editor-hidebtn')) return;
      const btn = cdoc.createElement('button');
      btn.type = 'button';
      btn.className = 'editor-hidebtn';
      btn.title = 'Ocultar / mostrar esta sección';
      btn.addEventListener('click', e => {
        e.preventDefault(); e.stopPropagation();
        pageContent[f.key] = !(pageContent[f.key] === true);
        refreshEditorVisibility();
        markDirty();
      });
      el.appendChild(btn);
    });
  });
}

/** En el editor los ocultos NO se esconden: se atenúan (para poder re-mostrarlos). */
function refreshEditorVisibility() {
  const cdoc = frameEl().contentDocument;
  if (!cdoc) return;
  TOGGLE_FIELDS.forEach(f => {
    const hidden = pageContent[f.key] === true;
    cdoc.querySelectorAll(`[data-content-visible="${f.key}"]`).forEach(el => {
      el.style.display = '';
      el.classList.toggle('editor-hidden', hidden);
      const btn = el.querySelector(':scope > .editor-hidebtn');
      if (btn) btn.textContent = hidden ? '↺' : '✕';
    });
  });
  renderRestoreChips();
}

function renderRestoreChips() {
  const wrap = document.getElementById('restoreWrap');
  const chips = document.getElementById('restoreChips');
  const hidden = TOGGLE_FIELDS.filter(f => pageContent[f.key] === true);
  wrap.hidden = hidden.length === 0;
  chips.innerHTML = hidden.map(f => `<button type="button" class="content-editor__chip" data-restore="${f.key}">${TOGGLE_LABEL[f.key]} ↺</button>`).join('');
  chips.querySelectorAll('[data-restore]').forEach(btn => {
    btn.addEventListener('click', () => {
      pageContent[btn.dataset.restore] = false;
      refreshEditorVisibility();
      markDirty();
    });
  });
}

function refreshHeroTitle() {
  const cdoc = frameEl().contentDocument;
  if (cdoc) renderHeroTitle(cdoc, pageContent);
}

function syncToolbar() {
  document.getElementById('heroHlInput').value = getContent(pageContent, 'heroHighlight');
  document.getElementById('heroHlColor').value = getContent(pageContent, 'heroHighlightColor');
}

function discardContentChanges() {
  if (contentDirty && !confirm('¿Descartar los cambios sin guardar y volver a la última versión publicada?')) return;
  pageContent = structuredClone(savedContent);
  markDirty(false);
  frameEl().contentWindow.location.reload(); // onEditorFrameLoad se re-dispara
}

async function saveContent() {
  const btn = document.getElementById('saveContentBtn');
  btn.disabled = true;
  btn.textContent = 'Guardando...';
  try {
    const { error } = await supabase.from('settings').upsert({ id: 'content', data: pageContent });
    if (error) throw error;
    savedContent = structuredClone(pageContent);
    markDirty(false);
    toast('Cambios publicados en la tienda');
  } catch (err) {
    console.error(err);
    toast('No se pudo guardar: ' + err.message);
  } finally {
    btn.disabled = false;
    btn.textContent = 'Guardar y publicar';
  }
}
