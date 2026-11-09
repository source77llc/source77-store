/* checkout.js -- Source77 checkout page driver */
/* Depends on config.js being loaded first (provides window.CONFIG) */

(function () {
  'use strict';

  const TAX_RATE = 0.0825; // Texas 8.25%

  // Shipping tiers by TOTAL cart weight (oz). Must match the Lambda
  // (backend/src/create-checkout-session.js) — the Lambda is the
  // authority at payment time; this is only for display.
  const SHIPPING_TIERS = [
    { maxOz: 15.9999, cents: 599, label: 'under 1 lb' },
    { maxOz: 80, cents: 899, label: '1-5 lb' },
    { maxOz: Infinity, cents: 1299, label: 'over 5 lb' }
  ];
  const DEFAULT_WEIGHT_OZ = 8; // 0.5 lb store default, per unit

  // Iraq shipping — Pirate Ship Simple Export Rate, Rest of World
  // band, by TOTAL cart weight (oz). Must match the Lambda
  // (backend/src/create-checkout-session.js) — the Lambda is the
  // authority at payment time; this is only for display.
  // Rates verified Nov 2026: up to 0.5 lb $14.99, 1 lb $18.99,
  // 2 lb $24.00 (live Pirate Ship SER quotes / rate tables);
  // 3 lb $43.20, 4 lb $52.85 (2026 rate chart, Germany column —
  // highest European Rest-of-World country, used as the
  // conservative proxy so the store never undercharges).
  // SER caps: max 4 lb total, max $400 cart value. Above either,
  // the Iraq option is not offered.
  const IRAQ_TIERS = [
    { maxOz: 8, cents: 1499, label: 'up to 0.5 lb' },
    { maxOz: 16, cents: 1899, label: 'up to 1 lb' },
    { maxOz: 32, cents: 2400, label: 'up to 2 lb' },
    { maxOz: 48, cents: 4320, label: 'up to 3 lb' },
    { maxOz: 64, cents: 5285, label: 'up to 4 lb' }
  ];
  const IRAQ_MAX_OZ = 64; // 4 lb
  const IRAQ_MAX_VALUE = 400; // dollars

  function cartWeightOz(cart) {
    return cart.reduce(function (sum, item) {
      if (item.fulfillment === 'digital') return sum; // downloads weigh 0
      var perUnit = Number(item.weightLb) ? Number(item.weightLb) * 16
        : (Number(item.weightOz) || DEFAULT_WEIGHT_OZ);
      return sum + perUnit * (parseInt(item.qty, 10) || 1);
    }, 0);
  }

  // A digital-only cart has no delivery choice at all: no pickup,
  // no shipping, $0 delivery. Mixed carts (digital + physical)
  // keep the normal pickup/ship radios.
  function isDigitalCart(cart) {
    return cart.length > 0 && cart.every(function (item) {
      return item.fulfillment === 'digital';
    });
  }

  function shippingTier(cart) {
    var oz = cartWeightOz(cart);
    for (var i = 0; i < SHIPPING_TIERS.length; i++) {
      if (oz <= SHIPPING_TIERS[i].maxOz) return SHIPPING_TIERS[i];
    }
    return SHIPPING_TIERS[SHIPPING_TIERS.length - 1];
  }

  function hasPhysicalItems(cart) {
    return cart.some(function (item) {
      return item.fulfillment !== 'digital';
    });
  }

  function iraqTier(cart) {
    var oz = cartWeightOz(cart);
    for (var i = 0; i < IRAQ_TIERS.length; i++) {
      if (oz <= IRAQ_TIERS[i].maxOz) return IRAQ_TIERS[i];
    }
    return null;
  }

  // Iraq is offered only when the cart fits the SER limits:
  // physical goods, total weight 4 lb or under, cart value $400
  // or under. Rates above 4 lb are not verified, so the option
  // is hidden rather than priced from a guess.
  function iraqEligible(cart) {
    return hasPhysicalItems(cart)
      && cartWeightOz(cart) <= IRAQ_MAX_OZ
      && cartSubtotal(cart) <= IRAQ_MAX_VALUE;
  }

  /* ------------------------------------------------------------------ */
  /* Boot                                                              */
  /* ------------------------------------------------------------------ */
  document.addEventListener('DOMContentLoaded', function () {
    const cart = loadCart();

    if (!cart || cart.length === 0) {
      window.location.href = 'shop.html';
      return;
    }

    renderCartSummary(cart);
    renderShippingOptions(cart);
    recalcTotals(cart);
    bindShippingChange(cart);
    bindPayButton(cart);
  });

  /* ------------------------------------------------------------------ */
  /* Cart helpers                                                      */
  /* ------------------------------------------------------------------ */
  function loadCart() {
    try {
      return JSON.parse(localStorage.getItem('source77_cart')) || [];
    } catch (e) {
      return [];
    }
  }

  function cartSubtotal(cart) {
    return cart.reduce(function (sum, item) {
      return sum + (parseFloat(item.price) || 0) * (parseInt(item.qty, 10) || 1);
    }, 0);
  }

  /* ------------------------------------------------------------------ */
  /* Render cart summary table                                         */
  /* ------------------------------------------------------------------ */
  function renderCartSummary(cart) {
    const container = document.getElementById('cart-summary');
    if (!container) return;

    const table = document.createElement('table');
    table.className = 'cart-table';
    table.innerHTML =
      '<thead>' +
        '<tr>' +
          '<th>Item</th>' +
          '<th>Qty</th>' +
          '<th>Line Total</th>' +
        '</tr>' +
      '</thead>';

    const tbody = document.createElement('tbody');

    cart.forEach(function (item) {
      const qty = parseInt(item.qty, 10) || 1;
      const price = parseFloat(item.price) || 0;
      const lineTotal = price * qty;

      const tr = document.createElement('tr');
      tr.innerHTML =
        '<td class="item-title">' + escapeHtml(item.title || 'Item') + '</td>' +
        '<td class="item-qty">' + qty + '</td>' +
        '<td class="item-total">$' + lineTotal.toFixed(2) + '</td>';
      tbody.appendChild(tr);
    });

    table.appendChild(tbody);
    container.appendChild(table);
  }

  /* ------------------------------------------------------------------ */
  /* Render shipping radio cards                                       */
  /* ------------------------------------------------------------------ */
  function renderShippingOptions(cart) {
    const container = document.getElementById('shipping-options');

    if (!container) return;

    // Digital-only cart: no delivery choice — instant download
    // after payment, $0 shipping. A hidden input carries the
    // 'digital' mode so getSelectedShipping() picks it up.
    if (isDigitalCart(cart)) {
      container.innerHTML =
        '<div class="shipping-card digital-note">' +
          '<span class="shipping-card__body">' +
            '<strong>💾 Instant download after payment</strong>' +
            '<span class="shipping-card__detail">No shipping — your download link appears on the order confirmation page right after payment.</span>' +
          '</span>' +
        '</div>' +
        '<input type="hidden" name="shipping" value="digital">';
      return;
    }

    var tier = shippingTier(cart || []);
    var shipDollars = '$' + (tier.cents / 100).toFixed(2);

    // Ship to Iraq (Pirate Ship Simple Export Rate) — only when
    // the cart fits the SER limits. The value 'ship-iq' is what
    // the Lambda expects; US pickup/ship are unchanged.
    var iraqHtml = '';
    if (iraqEligible(cart)) {
      var iqTier = iraqTier(cart);
      var iqDollars = '$' + (iqTier.cents / 100).toFixed(2);
      iraqHtml =
        '<label class="shipping-card">' +
          '<input type="radio" name="shipping" value="ship-iq"> ' +
          '<span class="shipping-card__body">' +
            '<strong>Ship to Iraq &ndash; ' + iqDollars + ' (' + iqTier.label + ')</strong>' +
            '<span class="shipping-card__detail">Buyer pays Iraq customs/duties on delivery. Delivery 1&ndash;4 weeks, tracked.</span>' +
          '</span>' +
        '</label>';
    }

    container.innerHTML =
      '<label class="shipping-card">' +
        '<input type="radio" name="shipping" value="pickup" checked> ' +
        '<span class="shipping-card__body">' +
          '<strong>Local Pickup &ndash; Free</strong>' +
          '<span class="shipping-card__detail">H-E-B, 17439 Classen Rd, San Antonio, TX 78247</span>' +
        '</span>' +
      '</label>' +
      '<label class="shipping-card">' +
        '<input type="radio" name="shipping" value="ship"> ' +
        '<span class="shipping-card__body">' +
          '<strong>Ship to me &ndash; ' + shipDollars + ' (' + tier.label + ')</strong>' +
          '<span class="shipping-card__detail">By total cart weight: under 1 lb $5.99, 1-5 lb $8.99, over 5 lb $12.99</span>' +
        '</span>' +
      '</label>' +
      iraqHtml;
  }

  /* ------------------------------------------------------------------ */
  /* Totals calculation                                                */
  /* ------------------------------------------------------------------ */
  function getSelectedShipping() {
    // Digital-only carts carry a hidden input instead of radios.
    const hidden = document.querySelector('input[name="shipping"][type="hidden"]');
    if (hidden) return hidden.value;
    const checked = document.querySelector('input[name="shipping"]:checked');
    return checked ? checked.value : 'pickup';
  }

  function recalcTotals(cart) {
    const subtotal = cartSubtotal(cart);
    const shippingChoice = getSelectedShipping();
    var shippingCost = 0;
    if (shippingChoice === 'ship') {
      shippingCost = shippingTier(cart).cents / 100;
    } else if (shippingChoice === 'ship-iq') {
      var iqTier = iraqTier(cart);
      shippingCost = iqTier ? iqTier.cents / 100 : 0;
    }

    // Texas taxes delivery, so shipping joins the tax base.
    // Digital orders have $0 shipping, so their tax is on the
    // subtotal only — the same formula with shipping = 0.
    // Iraq orders are not Texas sales — $0 tax.
    const tax = shippingChoice === 'ship-iq' ? 0 : (subtotal + shippingCost) * TAX_RATE;
    const total = subtotal + shippingCost + tax;

    setText('subtotal-value', '$' + subtotal.toFixed(2));
    setText('shipping-value', shippingCost === 0 ? 'Free' : '$' + shippingCost.toFixed(2));
    setText('tax-value', '$' + tax.toFixed(2));
    setText('order-total-value', '$' + total.toFixed(2));
  }

  function bindShippingChange(cart) {
    document.addEventListener('change', function (e) {
      if (e.target && e.target.name === 'shipping') {
        recalcTotals(cart);
      }
    });
  }

  /* ------------------------------------------------------------------ */
  /* Pay with Card button                                              */
  /* ------------------------------------------------------------------ */
  function bindPayButton(cart) {
    const btn = document.getElementById('pay-button');
    if (!btn) return;

    btn.addEventListener('click', function () {
      const shippingChoice = getSelectedShipping();
      submitCheckout(cart, shippingChoice);
    });
  }

  function submitCheckout(cart, shippingChoice) {
    const btn = document.getElementById('pay-button');
    const errorEl = document.getElementById('checkout-error');

    // Clear previous errors
    if (errorEl) {
      errorEl.textContent = '';
      errorEl.style.display = 'none';
    }

    // Disable button while submitting
    if (btn) {
      btn.disabled = true;
      btn.textContent = 'Processing…';
    }

    const apiUrl = (window.CONFIG && window.CONFIG.API_BASE_URL)
      ? window.CONFIG.API_BASE_URL + '/checkout/session'
      : '/checkout/session';

    fetch(apiUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        cart: cart.map(function (item) {
          return {
            id: item.id,
            title: item.title,
            price: item.price,
            quantity: item.qty || item.quantity || 1,
            // Digital items weigh 0 — the old `|| 0.5` default would
            // wrongly give a download 8 oz of shipping weight.
            weightOz: item.fulfillment === 'digital' ? 0
              : (Number(item.weightLb) || 0.5) * 16,
            fulfillment: item.fulfillment || 'local',
            image: item.image
          };
        }),
        shipping: shippingChoice
      })
    })
      .then(function (response) {
        if (!response.ok) {
          return response.json().then(function (data) {
            throw new Error(data.error || ('Server error: ' + response.status));
          });
        }
        return response.json();
      })
      .then(function (data) {
        if (data && data.url) {
          window.location.href = data.url;
        } else {
          throw new Error('No checkout URL returned from server.');
        }
      })
      .catch(function (err) {
        if (btn) {
          btn.disabled = false;
          btn.textContent = 'Pay with Card';
        }
        showError(err.message || 'Something went wrong. Please try again.');
      });
  }

  /* ------------------------------------------------------------------ */
  /* Utilities                                                         */
  /* ------------------------------------------------------------------ */
  function setText(id, text) {
    const el = document.getElementById(id);
    if (el) el.textContent = text;
  }

  function showError(message) {
    const errorEl = document.getElementById('checkout-error');
    if (errorEl) {
      errorEl.textContent = message;
      errorEl.style.display = 'block';
    } else {
      alert(message);
    }
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
