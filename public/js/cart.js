/* ============================================================
   Source77 Store — cart.js (redesign 2026-11-09)
   Cart logic (localStorage) + cart-page renderer.
   localStorage key: 'source77_cart'  (JSON array of items)
   Item shape: { id, title, condition, price, qty, image, weightLb }

   Redesign changes vs the previous version:
   - Cart page renders stacked cards (.cart-item), never a
     squeezed desktop table, on any screen width.
   - getCartTotals(shipping) exposes the same shipping-tier +
     8.25% tax math checkout.js uses, so the slide-over cart
     drawer (nav.js) can show exact totals.
   ============================================================ */

(function () {
  'use strict';

  var CART_KEY = 'source77_cart';

  /* Shipping tiers by TOTAL cart weight (oz) — must match
     checkout.js and the Lambda (the Lambda is the authority
     at payment time; this is only for display). */
  var TAX_RATE = 0.0825;
  var SHIPPING_TIERS = [
    { maxOz: 15.9999, cents: 599, label: 'under 1 lb' },
    { maxOz: 80, cents: 899, label: '1-5 lb' },
    { maxOz: Infinity, cents: 1299, label: 'over 5 lb' }
  ];
  var DEFAULT_WEIGHT_OZ = 8;

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
    // Notify nav badge + drawer + bottom bar
    if (typeof window.updateNavCartBadge === 'function') {
      window.updateNavCartBadge();
    }
    if (typeof window.renderCartDrawer === 'function') {
      window.renderCartDrawer();
    }
  }

  function formatPrice(num) {
    return '$' + Number(num).toFixed(2);
  }

  function escHtml(str) {
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
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
      if (!existing.weightLb) existing.weightLb = Number(product.weight_lb) || 0.5;
    } else {
      items.push({
        id:        product.id,
        title:     product.title     || 'Product',
        condition: product.condition || '',
        price:     Number(product.price) || 0,
        image:     (product.images && product.images[0]) || product.image || '',
        weightLb:  Number(product.weight_lb) || 0.5,
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

  /** getCartWeightOz() — total packaged weight of the cart, in ounces */
  function getCartWeightOz() {
    return readCart().reduce(function (sum, item) {
      var perUnit = Number(item.weightLb) ? Number(item.weightLb) * 16 : 8;
      return sum + perUnit * (parseInt(item.qty, 10) || 0);
    }, 0);
  }

  function clearCart() {
    writeCart([]);
  }

  /* ── Totals (shared by cart page + cart drawer) ────────── */
  function shippingTierForOz(oz) {
    for (var i = 0; i < SHIPPING_TIERS.length; i++) {
      if (oz <= SHIPPING_TIERS[i].maxOz) return SHIPPING_TIERS[i];
    }
    return SHIPPING_TIERS[SHIPPING_TIERS.length - 1];
  }

  /**
   * getCartTotals(shippingChoice) — 'pickup' (default) or 'ship'.
   * Returns { subtotal, shipping, tax, total, tierLabel, weightOz }.
   * Same math as checkout.js: tax 8.25% on subtotal + shipping.
   */
  function getCartTotals(shippingChoice) {
    var items = readCart();
    var subtotal = getCartTotal();
    var oz = getCartWeightOz();
    var tier = shippingTierForOz(oz);
    // Empty cart: no shipping, no tax, no total — never charge for 0 items.
    if (items.length === 0) {
      return {
        subtotal: 0,
        shipping: 0,
        tax: 0,
        total: 0,
        tierLabel: tier.label,
        tierCents: tier.cents,
        weightOz: 0,
        count: 0
      };
    }
    var shipping = shippingChoice === 'ship' ? tier.cents / 100 : 0;
    var tax = (subtotal + shipping) * TAX_RATE;
    var total = subtotal + shipping + tax;
    return {
      subtotal: subtotal,
      shipping: shipping,
      tax: tax,
      total: total,
      tierLabel: tier.label,
      tierCents: tier.cents,
      weightOz: oz,
      count: getCartCount()
    };
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

  /* ── Cart Page Renderer (stacked cards, all widths) ────── */

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

    var cardsHtml = items.map(function (item) {
      var lineTotal = (Number(item.price) * item.qty).toFixed(2);
      var imgHtml = item.image
        ? '<img src="' + escHtml(item.image) + '" alt="' + escHtml(item.title) + '" class="cart-item-img">'
        : '<span class="cart-item-img-fallback">&#x1F4E6;</span>';

      return (
        '<div class="cart-item" data-id="' + escHtml(item.id) + '">' +
          '<div class="cart-item-media">' + imgHtml + '</div>' +
          '<div class="cart-item-info">' +
            '<div class="cart-item-title">' + escHtml(item.title) + '</div>' +
            (item.condition ? '<div class="cart-item-condition">' + escHtml(item.condition) + '</div>' : '') +
            '<div class="cart-item-price">' + formatPrice(item.price) + ' each</div>' +
            '<div class="cart-item-actions">' +
              '<div class="qty-stepper">' +
                '<button class="qty-minus" aria-label="Decrease quantity">&#8722;</button>' +
                '<span class="qty-value">' + item.qty + '</span>' +
                '<button class="qty-plus" aria-label="Increase quantity">+</button>' +
              '</div>' +
              '<button class="remove-btn" aria-label="Remove item" title="Remove">&times; Remove</button>' +
            '</div>' +
          '</div>' +
          '<div class="cart-item-total">' + formatPrice(lineTotal) + '</div>' +
        '</div>'
      );
    }).join('');

    var totals = getCartTotals('pickup');

    wrap.innerHTML =
      '<div class="cart-list">' + cardsHtml + '</div>' +
      '<div class="cart-summary">' +
        '<div class="summary-row"><span>Subtotal</span><span id="cart-subtotal">' + formatPrice(totals.subtotal) + '</span></div>' +
        '<div class="summary-row"><span>Shipping</span><span>Calculated at checkout</span></div>' +
        '<div class="summary-row total"><span>Estimated Total</span><span id="cart-total">' + formatPrice(totals.subtotal) + '</span></div>' +
        '<a href="checkout.html" class="btn btn-primary checkout-btn btn-lg">Proceed to Checkout</a>' +
      '</div>';

    // Bind events
    bindCartEvents(wrap);
  }

  function bindCartEvents(wrap) {
    wrap.addEventListener('click', function (e) {
      var card = e.target.closest('.cart-item[data-id]');
      if (!card) return;
      var id = card.getAttribute('data-id');

      // Remove button
      if (e.target.classList.contains('remove-btn') ||
          e.target.closest('.remove-btn')) {
        removeFromCart(id);
        renderCartPage();
        return;
      }

      // Qty minus
      if (e.target.classList.contains('qty-minus')) {
        var qtySpan = card.querySelector('.qty-value');
        var current = parseInt(qtySpan.textContent, 10) || 1;
        updateQty(id, current - 1);
        renderCartPage();
        return;
      }

      // Qty plus
      if (e.target.classList.contains('qty-plus')) {
        var qtySpanPlus = card.querySelector('.qty-value');
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
    getCartWeightOz: getCartWeightOz,
    getCartTotals:  getCartTotals,
    clearCart:      clearCart,
    renderCartPage: renderCartPage,
    showToast:      showToast
  };

  // Convenience shorthand used by shop.js and product pages
  window.addToCart = addToCart;

}());
