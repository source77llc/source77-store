/* admin.js -- Source77 admin panel driver */
/* Depends on config.js being loaded first (provides window.CONFIG) */

(function () {
  'use strict';

  /* ------------------------------------------------------------------ */
  /* Boot                                                                  */
  /* ------------------------------------------------------------------ */
  document.addEventListener('DOMContentLoaded', function () {
    showLoginForm();
  });

  /* ------------------------------------------------------------------ */
  /* Auth gate                                                             */
  /* ------------------------------------------------------------------ */
  function showLoginForm() {
    const app = getApp();
    app.innerHTML =
      '<div class="admin-login">' +
        '<h2>Admin Login</h2>' +
        '<form id="login-form" novalidate>' +
          '<label for="admin-password">Password</label>' +
          '<input type="password" id="admin-password" name="admin-password" ' +
                 'autocomplete="current-password" required>' +
          '<button type="submit">Sign In</button>' +
          '<p id="login-error" class="error-msg" style="display:none"></p>' +
        '</form>' +
      '</div>';

    document.getElementById('login-form').addEventListener('submit', function (e) {
      e.preventDefault();
      const entered = document.getElementById('admin-password').value;
      const expected = window.CONFIG && window.CONFIG.ADMIN_PASSWORD;

      if (entered === expected) {
        showAdminPanel();
      } else {
        const errEl = document.getElementById('login-error');
        errEl.textContent = 'Incorrect password.';
        errEl.style.display = 'block';
      }
    });
  }

  /* ------------------------------------------------------------------ */
  /* Admin panel shell                                                     */
  /* ------------------------------------------------------------------ */
  function showAdminPanel() {
    const app = getApp();
    app.innerHTML =
      '<div class="admin-panel">' +
        '<header class="admin-header">' +
          '<h1>Source77 Admin</h1>' +
        '</header>' +
        '<nav class="admin-tabs">' +
          '<button class="tab-btn active" data-tab="products">Products</button>' +
          '<button class="tab-btn" data-tab="orders">Orders</button>' +
        '</nav>' +
        '<div id="tab-products" class="tab-pane active"></div>' +
        '<div id="tab-orders" class="tab-pane" style="display:none"></div>' +
      '</div>';

    document.querySelectorAll('.tab-btn').forEach(function (btn) {
      btn.addEventListener('click', function () {
        document.querySelectorAll('.tab-btn').forEach(function (b) {
          b.classList.remove('active');
        });
        document.querySelectorAll('.tab-pane').forEach(function (p) {
          p.style.display = 'none';
          p.classList.remove('active');
        });
        btn.classList.add('active');
        const pane = document.getElementById('tab-' + btn.dataset.tab);
        if (pane) {
          pane.style.display = '';
          pane.classList.add('active');
        }
        if (btn.dataset.tab === 'products') loadProducts();
        if (btn.dataset.tab === 'orders') loadOrders();
      });
    });

    loadProducts();
  }

  /* ------------------------------------------------------------------ */
  /* API helpers                                                           */
  /* ------------------------------------------------------------------ */
  function apiBase() {
    return (window.CONFIG && window.CONFIG.API_BASE_URL) || '';
  }

  function adminKey() {
    return (window.CONFIG && window.CONFIG.ADMIN_KEY) || '';
  }

  function adminHeaders() {
    return {
      'Content-Type': 'application/json',
      'x-admin-key': adminKey()
    };
  }

  function apiFetch(path, options) {
    return fetch(apiBase() + path, Object.assign({ headers: adminHeaders() }, options || {}))
      .then(function (res) {
        if (!res.ok) {
          return res.json().catch(function () {
            throw new Error('Server error: ' + res.status);
          }).then(function (data) {
            throw new Error(data.error || ('Server error: ' + res.status));
          });
        }
        return res.json();
      });
  }

  /* ------------------------------------------------------------------ */
  /* Products tab                                                          */
  /* ------------------------------------------------------------------ */
  function loadProducts() {
    const pane = document.getElementById('tab-products');
    pane.innerHTML = '<p class="loading-msg">Loading products…</p>';

    apiFetch('/products')
      .then(function (products) {
        renderProductsPane(pane, products);
      })
      .catch(function (err) {
        pane.innerHTML = '<p class="error-msg">Failed to load products: ' + escapeHtml(err.message) + '</p>';
      });
  }

  function renderProductsPane(pane, products) {
    pane.innerHTML =
      '<div class="pane-header">' +
        '<h2>Products</h2>' +
        '<button id="add-product-btn" class="btn-primary">+ Add Product</button>' +
      '</div>' +
      '<div id="product-form-container"></div>' +
      '<div id="products-table-container"></div>';

    document.getElementById('add-product-btn').addEventListener('click', function () {
      showProductForm(null, function () { loadProducts(); });
    });

    renderProductsTable(products);
  }

  function renderProductsTable(products) {
    const container = document.getElementById('products-table-container');
    if (!container) return;

    if (!products || products.length === 0) {
      container.innerHTML = '<p class="empty-msg">No products yet.</p>';
      return;
    }

    let html =
      '<table class="admin-table">' +
        '<thead><tr>' +
          '<th>Title</th>' +
          '<th>Category</th>' +
          '<th>Condition</th>' +
          '<th>Price</th>' +
          '<th>Qty</th>' +
          '<th>Fulfillment</th>' +
          '<th>Actions</th>' +
        '</tr></thead>' +
        '<tbody>';

    products.forEach(function (p) {
      var fulfillLabel = p.fulfillment === 'direct' ? '🚚 Ships directly' : '📍 Local pickup';
      html +=
        '<tr data-id="' + escapeHtml(String(p.id)) + '">' +
          '<td>' + escapeHtml(p.title || '') + '</td>' +
          '<td>' + escapeHtml(p.category || '') + '</td>' +
          '<td>' + escapeHtml(p.condition || '') + '</td>' +
          '<td>$' + parseFloat(p.price || 0).toFixed(2) + '</td>' +
          '<td>' + (p.quantity !== undefined ? p.quantity : '') + '</td>' +
          '<td>' + fulfillLabel + '</td>' +
          '<td class="actions">' +
            '<button class="btn-edit" data-id="' + escapeHtml(String(p.id)) + '">Edit</button> ' +
            '<button class="btn-delete" data-id="' + escapeHtml(String(p.id)) + '">Delete</button>' +
          '</td>' +
        '</tr>';
    });

    html += '</tbody></table>';
    container.innerHTML = html;

    // Edit buttons
    container.querySelectorAll('.btn-edit').forEach(function (btn) {
      btn.addEventListener('click', function () {
        const id = btn.dataset.id;
        const product = products.find(function (p) { return String(p.id) === id; });
        if (product) showProductForm(product, function () { loadProducts(); });
      });
    });

    // Delete buttons
    container.querySelectorAll('.btn-delete').forEach(function (btn) {
      btn.addEventListener('click', function () {
        const id = btn.dataset.id;
        const product = products.find(function (p) { return String(p.id) === id; });
        const name = product ? product.title : id;
        if (confirm('Delete "' + name + '"? This cannot be undone.')) {
          deleteProduct(id);
        }
      });
    });
  }

  function showProductForm(product, onSave) {
    const container = document.getElementById('product-form-container');
    if (!container) return;

    const isEdit = product !== null;
    const p = product || {};

    const categories = ['Car Parts', 'Home Goods', 'Electronics', 'General Merchandise', 'Other'];
    const categoryOptions = categories.map(function (c) {
      return '<option value="' + escapeHtml(c) + '"' +
        (p.category === c ? ' selected' : '') + '>' + escapeHtml(c) + '</option>';
    }).join('');

    container.innerHTML =
      '<div class="product-form-wrap">' +
        '<h3>' + (isEdit ? 'Edit Product' : 'Add Product') + '</h3>' +
        '<form id="product-form" novalidate>' +
          '<label>Title<input type="text" name="title" value="' + escapeHtml(p.title || '') + '" required></label>' +
          '<label>Category' +
            '<select name="category">' + categoryOptions + '</select>' +
          '</label>' +
          '<label>Condition<input type="text" name="condition" value="' + escapeHtml(p.condition || '') + '" placeholder="e.g. Used – Good"></label>' +
          '<label>Price ($)<input type="number" name="price" value="' + (p.price || '') + '" min="0" step="0.01" required></label>' +
          '<label>Weight (lb)<input type="number" name="weight_lb" value="' + (p.weight_lb || '') + '" min="0" step="0.1"></label>' +
          '<label>Quantity<input type="number" name="quantity" value="' + (p.quantity !== undefined ? p.quantity : '') + '" min="0" step="1" required></label>' +
          '<label>Description<textarea name="description" rows="3">' + escapeHtml(p.description || '') + '</textarea></label>' +
          '<label>Image URL (optional)<input type="url" name="image_url" value="' + escapeHtml(p.image_url || '') + '"></label>' +
          '<label>Fulfillment' +
            '<select name="fulfillment">' +
              '<option value="local"' + ((!p.fulfillment || p.fulfillment === 'local') ? ' selected' : '') + '>📍 Local pickup available (item in hand)</option>' +
              '<option value="direct"' + (p.fulfillment === 'direct' ? ' selected' : '') + '>🚚 Ships directly to customer</option>' +
            '</select>' +
          '</label>' +
          '<label class="checkbox-label">' +
            '<input type="checkbox" name="shipping"' + (p.shipping ? ' checked' : '') + '> Offer shipping' +
          '</label>' +
          '<div class="form-actions">' +
            '<button type="submit" class="btn-primary">' + (isEdit ? 'Save Changes' : 'Add Product') + '</button>' +
            '<button type="button" id="cancel-product-form" class="btn-secondary">Cancel</button>' +
          '</div>' +
          '<p id="product-form-error" class="error-msg" style="display:none"></p>' +
        '</form>' +
      '</div>';

    document.getElementById('cancel-product-form').addEventListener('click', function () {
      container.innerHTML = '';
    });

    document.getElementById('product-form').addEventListener('submit', function (e) {
      e.preventDefault();
      const form = e.target;
      const data = {
        title: form.title.value.trim(),
        category: form.category.value,
        condition: form.condition.value.trim(),
        price: parseFloat(form.price.value),
        weight_lb: parseFloat(form.weight_lb.value) || 0,
        quantity: parseInt(form.quantity.value, 10),
        description: form.description.value.trim(),
        image_url: form.image_url.value.trim() || null,
        shipping: form.shipping.checked
      };

      const errEl = document.getElementById('product-form-error');
      const submitBtn = form.querySelector('[type="submit"]');
      submitBtn.disabled = true;
      errEl.style.display = 'none';

      const req = isEdit
        ? apiFetch('/products/' + encodeURIComponent(product.id), { method: 'PUT', body: JSON.stringify(data) })
        : apiFetch('/products', { method: 'POST', body: JSON.stringify(data) });

      req
        .then(function () {
          container.innerHTML = '';
          if (onSave) onSave();
        })
        .catch(function (err) {
          submitBtn.disabled = false;
          errEl.textContent = err.message;
          errEl.style.display = 'block';
        });
    });
  }

  function deleteProduct(id) {
    apiFetch('/products/' + encodeURIComponent(id), { method: 'DELETE' })
      .then(function () {
        loadProducts();
      })
      .catch(function (err) {
        alert('Delete failed: ' + err.message);
      });
  }

  /* ------------------------------------------------------------------ */
  /* Orders tab                                                            */
  /* ------------------------------------------------------------------ */
  function loadOrders() {
    const pane = document.getElementById('tab-orders');
    pane.innerHTML = '<p class="loading-msg">Loading orders…</p>';

    apiFetch('/orders')
      .then(function (orders) {
        renderOrdersPane(pane, orders);
      })
      .catch(function (err) {
        pane.innerHTML = '<p class="error-msg">Failed to load orders: ' + escapeHtml(err.message) + '</p>';
      });
  }

  function renderOrdersPane(pane, orders) {
    pane.innerHTML =
      '<div class="pane-header">' +
        '<h2>Orders</h2>' +
        '<button id="refresh-orders-btn" class="btn-secondary">↻ Refresh</button>' +
      '</div>' +
      '<div id="orders-table-container"></div>';

    document.getElementById('refresh-orders-btn').addEventListener('click', function () {
      loadOrders();
    });

    renderOrdersTable(orders);
  }

  function renderOrdersTable(orders) {
    const container = document.getElementById('orders-table-container');
    if (!container) return;

    if (!orders || orders.length === 0) {
      container.innerHTML = '<p class="empty-msg">No orders yet.</p>';
      return;
    }

    const statusOptions = ['new', 'shipped', 'picked up'];

    let html =
      '<table class="admin-table">' +
        '<thead><tr>' +
          '<th>Order ID</th>' +
          '<th>Email</th>' +
          '<th>Amount</th>' +
          '<th>Shipping</th>' +
          '<th>Status</th>' +
          '<th>Date</th>' +
          '<th>Actions</th>' +
        '</tr></thead>' +
        '<tbody>';

    orders.forEach(function (o) {
      const shortId = String(o.id || '').substring(0, 12) + (String(o.id || '').length > 12 ? '…' : '');
      const optionsHtml = statusOptions.map(function (s) {
        return '<option value="' + escapeHtml(s) + '"' +
          (o.status === s ? ' selected' : '') + '>' + escapeHtml(s) + '</option>';
      }).join('');

      const dateStr = o.created_at
        ? new Date(o.created_at).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' })
        : '';

      html +=
        '<tr data-order-id="' + escapeHtml(String(o.id)) + '">' +
          '<td title="' + escapeHtml(String(o.id)) + '">' + escapeHtml(shortId) + '</td>' +
          '<td>' + escapeHtml(o.email || '') + '</td>' +
          '<td>$' + parseFloat(o.amount || 0).toFixed(2) + '</td>' +
          '<td>' + escapeHtml(o.shipping || '') + '</td>' +
          '<td>' +
            '<select class="status-select" data-order-id="' + escapeHtml(String(o.id)) + '">' +
              optionsHtml +
            '</select>' +
          '</td>' +
          '<td>' + escapeHtml(dateStr) + '</td>' +
          '<td></td>' +
        '</tr>';
    });

    html += '</tbody></table>';
    container.innerHTML = html;

    // Status change handlers
    container.querySelectorAll('.status-select').forEach(function (sel) {
      sel.addEventListener('change', function () {
        const orderId = sel.dataset.orderId;
        const newStatus = sel.value;
        patchOrderStatus(orderId, newStatus, sel);
      });
    });
  }

  function patchOrderStatus(orderId, status, selectEl) {
    if (selectEl) selectEl.disabled = true;

    apiFetch('/orders/' + encodeURIComponent(orderId), {
      method: 'PATCH',
      body: JSON.stringify({ status: status })
    })
      .then(function () {
        if (selectEl) selectEl.disabled = false;
      })
      .catch(function (err) {
        if (selectEl) selectEl.disabled = false;
        alert('Failed to update status: ' + err.message);
        // Revert the select back to the server's last known value
        loadOrders();
      });
  }

  /* ------------------------------------------------------------------ */
  /* Utilities                                                             */
  /* ------------------------------------------------------------------ */
  function getApp() {
    return document.getElementById('admin-app') || document.body;
  }

  function escapeHtml(str) {
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }
})();
