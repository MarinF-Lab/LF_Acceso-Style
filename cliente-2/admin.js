import { db, storage } from './firebase-config.js';
import {
  collection, getDocs, getDoc, setDoc, updateDoc, deleteDoc, doc, addDoc, query, orderBy
} from "https://www.gstatic.com/firebasejs/12.15.0/firebase-firestore.js";
import {
  ref, uploadBytesResumable, getDownloadURL
} from "https://www.gstatic.com/firebasejs/12.15.0/firebase-storage.js";
import { CONTENT_SECTIONS, CONTENT_FIELDS, applyContent, renderHeroTitle, getContent } from './content-fields.js';
import { DEFAULT_CATEGORIES, sortCategories } from './categories.js';

/* ===================================================================
   SEGURIDAD — contraseña por defecto: lfacceso2026
   Mismo patrón que cliente-1: hash local en localStorage, sin Firebase
   Auth. Ver nota de seguridad en firestore.rules.
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
  { id: 'listo',      label: 'Listo' },
  { id: 'en_camino',  label: 'En camino' },
  { id: 'entregado',  label: 'Entregado' },
];
const STATUS_MESSAGES = {
  armando:   (o) => `Hola ${o.customerName}! 👋 Tu pedido #${o.orderNumber} de LF Acceso Style ya está *armando* 🧵. Te avisamos apenas esté listo.`,
  listo:     (o) => `Hola ${o.customerName}! ✅ Tu pedido #${o.orderNumber} está *listo*. Coordinamos el envío/retiro a la brevedad.`,
  en_camino: (o) => `Hola ${o.customerName}! 🚚 Tu pedido #${o.orderNumber} va *en camino*. ¡Gracias por tu compra en LF Acceso Style!`,
  entregado: (o) => `Hola ${o.customerName}! 🎉 Tu pedido #${o.orderNumber} fue *entregado*. Gracias por confiar en LF Acceso Style.`,
};

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
    await Promise.all([refreshProducts(), refreshOrders(), loadSettings(), loadPageContent()]);
    renderDashboard();
    renderProductsTable();
    renderOrdersTable();
  } catch (err) {
    console.error(err);
    toast('No se pudo conectar con Firebase. Revisa firebase-config.js (¿tiene tus claves reales?).');
  }
  initContentEditor();
}

if (isLoggedIn()) showAdmin();

/* ===================================================================
   NAVEGACIÓN (sidebar)
   =================================================================== */
const viewTitles = { dashboard: 'Dashboard', products: 'Productos', add: 'Agregar producto', orders: 'Pedidos', settings: 'Configuración' };

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
  const snapshot = await withTimeout(getDocs(collection(db, 'products')), 8000, 'products');
  allProducts = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
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
        <td><img class="thumb" src="${p.imageUrl || ''}" onerror="this.style.visibility='hidden'" /></td>
        <td>${p.name}</td>
        <td style="text-transform:capitalize">${p.category || '—'}</td>
        <td>${fmt(p.price)}</td>
        <td>${stockBadge}</td>
        <td>${p.tag ? `<span class="badge badge--nuevo">${p.tag === 'top' ? 'Top ventas' : 'Nuevo'}</span>` : '—'}</td>
        <td><button class="btn-admin btn-admin--danger" data-del="${p.id}">Eliminar</button></td>
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
  deleteDoc(doc(db, 'products', id)).then(async () => {
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
      const path = `products/${Date.now()}-${file.name}`;
      const storageRef = ref(storage, path);
      const task = uploadBytesResumable(storageRef, file);
      await new Promise((resolve, reject) => task.on('state_changed', null, reject, resolve));
      imageUrl = await getDownloadURL(storageRef);
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
      await updateDoc(doc(db, 'products', editingProductId), product);
      toast('Producto actualizado');
    } else {
      product.createdAt = Date.now();
      await addDoc(collection(db, 'products'), product);
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
   PEDIDOS
   =================================================================== */
async function refreshOrders() {
  const q = query(collection(db, 'orders'), orderBy('createdAt', 'desc'));
  const snapshot = await withTimeout(getDocs(q), 8000, 'orders');
  allOrders = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
}

function paymentLabel(method) {
  return method === 'mercadopago' ? 'Mercado Pago' : method === 'transfer' ? 'Transferencia' : method || '—';
}

function renderOrdersTable() {
  const tbody = document.querySelector('#ordersTable tbody');
  const rows = allOrders.map(o => `
    <tr data-id="${o.id}" class="${o.id === selectedOrderId ? 'active-row' : ''}">
      <td>#${o.orderNumber}</td>
      <td>${new Date(o.createdAt).toLocaleDateString('es-CL')}</td>
      <td>${o.customerName}</td>
      <td>${fmt(o.total)}</td>
      <td>${paymentLabel(o.paymentMethod)}</td>
      <td><span class="badge badge--${o.status}">${ORDER_STATUSES.find(s => s.id === o.status)?.label || o.status}</span></td>
    </tr>`).join('');
  tbody.innerHTML = rows || `<tr><td colspan="6" style="text-align:center;color:var(--dim);padding:2rem">Aún no hay pedidos.</td></tr>`;
  tbody.querySelectorAll('tr[data-id]').forEach(tr => {
    tr.addEventListener('click', () => { selectedOrderId = tr.dataset.id; renderOrdersTable(); renderOrderDetail(); });
  });

  const dashBody = document.querySelector('#dashboardOrdersTable tbody');
  const recent = allOrders.slice(0, 5).map(o => `
    <tr><td>#${o.orderNumber}</td><td>${o.customerName}</td><td>${fmt(o.total)}</td>
      <td>${paymentLabel(o.paymentMethod)}</td>
      <td><span class="badge badge--${o.status}">${ORDER_STATUSES.find(s => s.id === o.status)?.label || o.status}</span></td></tr>`).join('');
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

  const statusButtons = ORDER_STATUSES.map(s => `
    <button class="btn-admin ${o.status === s.id ? 'btn-admin--primary' : ''}" data-status="${s.id}">${s.label}</button>
  `).join('');

  const supplierMsg = `Nuevo pedido #${o.orderNumber} para armar:\n` +
    (o.items || []).map(it => `• ${it.name} — Talla ${it.size} — Cant. ${it.qty}${it.imageUrl ? `\n  Imagen: ${it.imageUrl}` : ''}`).join('\n') +
    `\n\nCliente: ${o.customerName}${o.address ? `\nDirección: ${o.address}` : ''}`;

  el.innerHTML = `
    <h3>Pedido #${o.orderNumber}</h3>
    <p class="order-detail__meta">${o.customerName} · ${o.customerPhone || 'sin teléfono'} · ${new Date(o.createdAt).toLocaleString('es-CL')}</p>
    ${itemsHtml}
    <div class="order-total"><span>Total</span><span>${fmt(o.total)}</span></div>
    <p class="order-detail__meta">Pago: ${paymentLabel(o.paymentMethod)}${o.address ? ` · Envío a: ${o.address}` : ''}</p>
    <div class="order-actions">
      <a class="btn-admin btn-admin--primary btn-full" target="_blank" href="${waLink(storeSettings.whatsappSupplier, supplierMsg)}">📦 Enviar specs al proveedor</a>
    </div>
    <p class="order-detail__meta" style="margin-top:1rem">Actualizar estado (abre WhatsApp al cliente):</p>
    <div class="order-status-row">${statusButtons}</div>
  `;

  el.querySelectorAll('[data-status]').forEach(btn => {
    btn.addEventListener('click', () => updateOrderStatus(o, btn.dataset.status));
  });
}

async function updateOrderStatus(order, newStatus) {
  await updateDoc(doc(db, 'orders', order.id), { status: newStatus, updatedAt: Date.now() });
  order.status = newStatus;
  renderOrdersTable();
  renderOrderDetail();
  renderDashboard();

  const buildMsg = STATUS_MESSAGES[newStatus];
  if (buildMsg && order.customerPhone) {
    window.open(waLink(order.customerPhone, buildMsg(order)), '_blank');
  }
  toast(`Pedido #${order.orderNumber} → ${ORDER_STATUSES.find(s => s.id === newStatus)?.label}`);
}

/* ===================================================================
   DASHBOARD
   =================================================================== */
function renderDashboard() {
  document.getElementById('statProducts').textContent = allProducts.length;
  document.getElementById('statOrdersNew').textContent = allOrders.filter(o => o.status === 'nuevo').length;
  document.getElementById('statOrdersProgress').textContent = allOrders.filter(o => ['armando', 'listo', 'en_camino'].includes(o.status)).length;
  document.getElementById('statLowStock').textContent = allProducts.filter(p => totalStock(p) < 3).length;

  const newCount = allOrders.filter(o => o.status === 'nuevo').length;
  const badge = document.getElementById('ordersBadge');
  if (newCount > 0) { badge.hidden = false; badge.textContent = newCount; } else { badge.hidden = true; }
}

/* ===================================================================
   CONFIGURACIÓN
   =================================================================== */
async function loadSettings() {
  const snap = await withTimeout(getDoc(doc(db, 'settings', 'store')), 8000, 'settings');
  storeSettings = snap.exists() ? snap.data() : {};
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
  await setDoc(doc(db, 'settings', 'store'), data, { merge: true });
  storeSettings = { ...storeSettings, ...data };

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
    const snap = await withTimeout(getDoc(doc(db, 'settings', 'content')), 8000, 'content');
    pageContent = snap.exists() ? snap.data() : {};
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
    await setDoc(doc(db, 'settings', 'content'), pageContent, { merge: true });
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
