/* ============================================================
   Source77 Store — cart.js
   Cart logic (localStorage) + cart-page renderer.
   localStorage key: 'source77_cart'  (JSON array of items)
   Item shape: { id, title, condition, price, qty, image }
   ============================================================ */

(function () {
  'use strict';

  var CART_KEY = 'source77_cart';

  /* ── Helpers ───────────────────────────────────────────── */
  function readCart() {
    try {
      var raw = localStorage.getItem(CART_KEY);
      if (!raw) return [];
      var parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed : [];
    } catch (e) {
      return [];
    }
  }

  function writeCart(items) {
    try {
      localStorage.setItem(CART_KEY, JSON.stringify(items));
    } catch (e) {
      console.warn('Source77: could not write cart to localStorage', e);
    }
    // Notify nav badge
    if (typeof window.updateNavCartBadge === 'function') {
      window.updateNavCartBadge();
    }
  }

  function formatPrice(num) {
    return '$' + Number(num).toFixed(2);
  }

  /* ── Public API ────────────────────────────────────────── */

  /**
   * addToCart(product, qty)
   * product must have at minimum: { id, title, price }
   * Optional: condition, image (first image url string)
   */
  function addToCart(product, qty) {
    qty = parseInt(qty, 10) || 1;
    var items = readCart();
    var existing = null;
    for (var i = 0; i < items.length; i++) {
      if (items[i].id === product.id) { existing = items[i]; break; }
    }
    if (existing) {
      existing.qty += qty;
    } else {
      items.push({
        id:        product.id,
        title:     product.title     || 'Product',
        condition: product.condition || '',
        price:     Number(product.price) || 0,
        image:     (product.images && product.images[0]) || product.image || '',
        qty:       qty
      });
    }
    writeCart(items);
    showToast((product.title || 'Item') + ' added to cart!', 'success');
  }

  /**
   * removeFromCart(id)
   */
  function removeFromCart(id) {
    var items = readCart().filter(function (item) { return item.id !== id; });
    writeCart(items);
  }

  /**
   * updateQty(id, qty)
   * qty <= 0 removes the item.
   */
  function updateQty(id, qty) {
    qty = parseInt(qty, 10) || 0;
    if (qty <= 0) {
      removeFromCart(id);
      return;
    }
    var items = readCart();
    for (var i = 0; i < items.length; i++) {
      if (items[i].id === id) { items[i].qty = qty; break; }
    }
    writeCart(items);
  }

  /** getCart() — returns array of cart items */
  function getCart() { return readCart(); }

  /** getCartCount() — total quantity across all items */
  function getCartCount() {
    return readCart().reduce(function (sum, item) {
      return sum + (parseInt(item.qty, 10) || 0);
    }, 0);
  }

  /** getCartTotal() — numeric subtotal */
  function getCartTotal() {
    return readCart().reduce(function (sum, item) {
      return sum + (Number(item.price) * (parseInt(item.qty, 10) || 0));
    }, 0);
  }

  /** clearCart() */
  function clearCart() {
    writeCart([]);
  }

  /* ── Toast helper ──────────────────────────────────────── */
  function showToast(message, type) {
    var container = document.querySelector('.toast-container');
    if (!container) {
      container = document.createElement('div');
      container.className = 'toast-container';
      document.body.appendChild(container);
    }
    var toast = document.createElement('div');
    toast.className = 'toast' + (type ? ' ' + type : '');
    toast.textContent = message;
    container.appendChild(toast);
    setTimeout(function () {
      toast.style.opacity = '0';
      toast.style.transition = 'opacity 0.3s';
      setTimeout(function () {
        if (toast.parentNode) toast.parentNode.removeChild(toast);
      }, 350);
    }, 2800);
  }

  /* ── Cart Page Renderer ────────────────────────────────── */

  function renderCartPage() {
    var wrap = document.getElementById('cart-page');
    if (!wrap) return; // Not on the cart page

    var items = readCart();

    if (items.length === 0) {
      wrap.innerHTML =
        '<div class="empty-state">' +
          '<span class="empty-icon">&#x1F6D2;</span>' +
          '<h3>Your cart is empty</h3>' +
          '<p>Looks like you haven\'t added anything yet.</p>' +
          '<a href="shop.html" class="btn btn-primary">Browse the Shop</a>' +
        '</div>';
      return;
    }

    var rowsHtml = items.map(function (item) {
      var lineTotal = (Number(item.price) * item.qty).toFixed(2);
      var imgHtml = item.image
        ? '<img src="' + escHtml(item.image) + '" alt="' + escHtml(item.title) + '" style="width:56px;height:56px;object-fit:cover;border-radius:4px;">'
        : '<span style="font-size:1.75rem;">&#x1F4E6;</span>';

      return (
        '<tr data-id="' + escHtml(item.id) + '">' +
          '<td style="min-width:200px">' +
            '<div style="display:flex;align-items:center;gap:.75rem;">' +
              imgHtml +
              '<div>' +
                '<div class="cart-item-title">' + escHtml(item.title) + '</div>' +
                (item.condition ? '<div class="cart-item-condition">' + escHtml(item.condition) + '</div>' : '') +
              '</div>' +
            '</div>' +
          '</td>' +
          '<td>' + formatPrice(item.price) + '</td>' +
          '<td>' +
            '<div class="qty-stepper">' +
              '<button class="qty-minus" aria-label="Decrease quantity">&#8722;</button>' +
              '<span class="qty-value">' + item.qty + '</span>' +
              '<button class="qty-plus" aria-label="Increase quantity">+</button>' +
            '</div>' +
          '</td>' +
          '<td>' + formatPrice(lineTotal) + '</td>' +
          '<td>' +
            '<button class="remove-btn" aria-label="Remove item" title="Remove">&times;</button>' +
          '</td>' +
        '</tr>'
      );
    }).join('');

    var subtotal = getCartTotal();

    wrap.innerHTML =
      '<div class="cart-table-wrap">' +
        '<table class="cart-table">' +
          '<thead><tr>' +
            '<th>Item</th>' +
            '<th>Price</th>' +
            '<th>Qty</th>' +
            '<th>Total</th>' +
            '<th></th>' +
          '</tr></thead>' +
          '<tbody id="cart-tbody">' + rowsHtml + '</tbody>' +
        '</table>' +
      '</div>' +
      '<div class="cart-summary">' +
        '<div class="summary-row"><span>Subtotal</span><span id="cart-subtotal">' + formatPrice(subtotal) + '</span></div>' +
        '<div class="summary-row"><span>Shipping</span><span>Calculated at checkout</span></div>' +
        '<div class="summary-row total"><span>Estimated Total</span><span id="cart-total">' + formatPrice(subtotal) + '</span></div>' +
        '<a href="checkout.html" class="btn btn-primary checkout-btn btn-lg">Proceed to Checkout</a>' +
      '</div>';

    // Bind events
    bindCartEvents(wrap);
  }

  function escHtml(str) {
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function bindCartEvents(wrap) {
    wrap.addEventListener('click', function (e) {
      var row = e.target.closest('tr[data-id]');
      if (!row) return;
      var id = row.getAttribute('data-id');

      // Remove button
      if (e.target.classList.contains('remove-btn')) {
        removeFromCart(id);
        renderCartPage();
        return;
      }

      // Qty minus
      if (e.target.classList.contains('qty-minus')) {
        var qtySpan = row.querySelector('.qty-value');
        var current = parseInt(qtySpan.textContent, 10) || 1;
        updateQty(id, current - 1);
        renderCartPage();
        return;
      }

      // Qty plus
      if (e.target.classList.contains('qty-plus')) {
        var qtySpanPlus = row.querySelector('.qty-value');
        var currentPlus = parseInt(qtySpanPlus.textContent, 10) || 1;
        updateQty(id, currentPlus + 1);
        renderCartPage();
        return;
      }
    });
  }

  /* ── DOMContentLoaded ──────────────────────────────────── */
  document.addEventListener('DOMContentLoaded', function () {
    renderCartPage();
  });

  /* ── Expose globals ────────────────────────────────────── */
  window.Source77Cart = {
    addToCart:      addToCart,
    removeFromCart: removeFromCart,
    updateQty:      updateQty,
    getCart:        getCart,
    getCartCount:   getCartCount,
    getCartTotal:   getCartTotal,
    clearCart:      clearCart,
    renderCartPage: renderCartPage,
    showToast:      showToast
  };

  // Convenience shorthand used by shop.js and product pages
  window.addToCart = addToCart;

}());
