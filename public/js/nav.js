/* ============================================================
   Source77 Store — nav.js (redesign 2026-11-09)
   Builds the shared header (announcement bar + sticky header
   with eBay-style search pill + category strip), footer,
   mobile bottom bar and slide-over cart drawer.
   Cart data still lives in localStorage ('source77_cart')
   via cart.js — this file only renders it.
   NO popups, NO overlays except the cart drawer itself.
   ============================================================ */

(function () {
  'use strict';

  var CATEGORIES = ['All', 'Car Parts', 'Home Goods', 'Electronics', 'General Merchandise', 'Digital Downloads'];
  var fulfil = 'ship'; /* drawer preview default: shipping (matches preview) */

  /* ── Cart helpers (cart.js owns the data) ─────────────── */
  function getCartCount() {
    try {
      if (window.Source77Cart && window.Source77Cart.getCartCount) {
        return window.Source77Cart.getCartCount();
      }
      var raw = localStorage.getItem('source77_cart');
      if (!raw) return 0;
      var items = JSON.parse(raw);
      if (!Array.isArray(items)) return 0;
      return items.reduce(function (sum, item) {
        return sum + (parseInt(item.qty, 10) || 0);
      }, 0);
    } catch (e) {
      return 0;
    }
  }

  function getCartEntries() {
    try {
      if (window.Source77Cart && window.Source77Cart.getCart) return window.Source77Cart.getCart();
      var raw = localStorage.getItem('source77_cart');
      var items = raw ? JSON.parse(raw) : [];
      return Array.isArray(items) ? items : [];
    } catch (e) {
      return [];
    }
  }

  function getSummary() {
    /* Single source of truth: cart.js getCartTotals (same tiers +
       8.25% tax math as checkout.js). Fall back to local math only
       if cart.js is not loaded yet. */
    if (window.Source77Cart && window.Source77Cart.getCartTotals) {
      var t = window.Source77Cart.getCartTotals(fulfil);
      var shipLabel = 'Pickup — San Antonio';
      if (fulfil === 'ship') {
        shipLabel = t.count === 0 ? 'Shipping'
          : 'Shipping (' + t.tierLabel + ')';
      }
      return { subtotal: t.subtotal, shipping: t.shipping, shipLabel: shipLabel, tax: t.tax, total: t.total, count: t.count };
    }
    var entries = getCartEntries();
    var subtotal = 0, weight = 0, count = 0;
    entries.forEach(function (e) {
      subtotal += (Number(e.price) || 0) * (parseInt(e.qty, 10) || 0);
      // Digital items weigh nothing — a 0 weightLb must stay 0 here
      // (Number(0) is falsy, so the || 0.5 default would wrongly add 8 oz).
      var perUnitOz = (e.fulfillment === 'digital') ? 0
        : ((Number(e.weightLb) || 0.5) * 16);
      weight += perUnitOz * (parseInt(e.qty, 10) || 0);
      count += parseInt(e.qty, 10) || 0;
    });
    var shipping = 0, shipLabel = 'Pickup — San Antonio';
    if (fulfil === 'ship') {
      if (entries.length === 0) { shipLabel = 'Shipping'; shipping = 0; }
      else if (weight === 0) { shipLabel = 'Digital delivery'; shipping = 0; }
      else if (weight < 16) { shipLabel = 'Shipping (under 1 lb)'; shipping = 5.99; }
      else if (weight <= 80) { shipLabel = 'Shipping (1 – 5 lb)'; shipping = 8.99; }
      else { shipLabel = 'Shipping (over 5 lb)'; shipping = 12.99; }
    }
    var tax = (subtotal + shipping) * 0.0825;
    return { subtotal: subtotal, shipping: shipping, shipLabel: shipLabel, tax: tax, total: subtotal + shipping + tax, count: count };
  }

  function money(n) { return '$' + Number(n || 0).toFixed(2); }

  function escHtml(str) {
    return String(str == null ? '' : str)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  /* ── Active-link detection ─────────────────────────────── */
  function isActive(href) {
    var currentPath = window.location.pathname;
    var normalise = function (p) {
      p = p.replace(/\\/g, '/');
      if (p.endsWith('/')) p += 'index.html';
      return p;
    };
    return normalise(currentPath).split('/').pop() === normalise(href).split('/').pop();
  }

  function onShopPage() {
    return !!document.getElementById('product-grid');
  }

  function goToCategory(cat) {
    if (onShopPage() && typeof window.setShopCategory === 'function') {
      window.setShopCategory(cat);
      var grid = document.getElementById('product-grid');
      if (grid) grid.scrollIntoView({ behavior: 'smooth', block: 'start' });
    } else {
      window.location.href = cat === 'All'
        ? 'shop.html'
        : 'shop.html?category=' + encodeURIComponent(cat);
    }
  }

  function doSearch(query, cat) {
    if (onShopPage() && typeof window.setShopSearch === 'function') {
      window.setShopSearch(query, cat);
      var grid = document.getElementById('product-grid');
      if (grid) grid.scrollIntoView({ behavior: 'smooth', block: 'start' });
    } else {
      var url = 'shop.html';
      var params = [];
      if (query) params.push('q=' + encodeURIComponent(query));
      if (cat && cat !== 'All') params.push('category=' + encodeURIComponent(cat));
      if (params.length) url += '?' + params.join('&');
      window.location.href = url;
    }
  }

  /* ── Header HTML ───────────────────────────────────────── */
  var NAV_LINKS = [
    { href: 'index.html', label: 'Home' },
    { href: 'shop.html', label: 'Shop' },
    { href: 'herbalife.html', label: 'Herbalife' },
    { href: 'books.html', label: 'Books' },
    { href: 'about.html', label: 'About' },
    { href: 'contact.html', label: 'Contact' }
  ];

  function buildHeader() {
    var count = getCartCount();
    var linksHtml = NAV_LINKS.map(function (link) {
      var activeClass = isActive(link.href) ? ' active' : '';
      return '<a href="' + link.href + '" class="' + activeClass + '">' + link.label + '</a>';
    }).join('\n        ');
    var mobileLinksHtml = NAV_LINKS.map(function (link) {
      var activeClass = isActive(link.href) ? ' active' : '';
      return '<a href="' + link.href + '" class="' + activeClass + '">' + link.label + '</a>';
    }).join('\n      ');
    var catOptions = CATEGORIES.map(function (c) {
      return '<option value="' + escHtml(c) + '"' + (c === 'All' ? ' selected' : '') + '>' +
        (c === 'All' ? 'All categories' : escHtml(c)) + '</option>';
    }).join('');

    return (
      '<div class="topbar"><strong>FREE local pickup</strong> in San Antonio, TX &nbsp;·&nbsp; Shipping from $5.99 &nbsp;·&nbsp; New finds added every week</div>' +
      '<header class="site" id="site-nav" role="banner">' +
        '<div class="wrap">' +
          '<div class="head-row">' +
            '<button class="nav-toggle" id="nav-toggle" aria-label="Toggle menu" aria-expanded="false">' +
              '<span></span><span></span><span></span>' +
            '</button>' +
            '<a class="wordmark" href="index.html" aria-label="Source77 home">' +
              '<div class="name">Source<span>77</span></div>' +
              '<div class="sub">General Store · San Antonio</div>' +
            '</a>' +
            '<div class="nav-links" id="desktop-nav">' + linksHtml + '</div>' +
            '<div class="head-actions">' +
              '<button class="cart-btn" id="cart-btn-top" type="button" aria-label="Open cart">' +
                '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="9" cy="21" r="1"/><circle cx="20" cy="21" r="1"/><path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6"/></svg>' +
                'Cart' +
                '<span class="cart-count" id="cart-badge" aria-live="polite">' + count + '</span>' +
              '</button>' +
            '</div>' +
          '</div>' +
          '<div class="search-row">' +
            '<form class="searchbar" id="global-search-form" role="search">' +
              '<select id="global-search-cat" aria-label="Search category">' + catOptions + '</select>' +
              '<input id="global-search-input" type="search" placeholder="Search the store…" autocomplete="off" aria-label="Search products" />' +
              '<button type="submit" aria-label="Search">' +
                '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" aria-hidden="true"><circle cx="11" cy="11" r="7"/><path d="m21 21-4.3-4.3"/></svg>' +
                '<span class="lbl">Search</span>' +
              '</button>' +
            '</form>' +
          '</div>' +
        '</div>' +
        '<nav class="cats" aria-label="Categories"><div class="wrap" id="cat-strip">' +
          CATEGORIES.map(function (c) {
            return '<button type="button" data-category="' + escHtml(c) + '"' +
              (c === 'All' ? ' class="active"' : '') + '>' +
              (c === 'All' ? 'Shop All' : escHtml(c)) + '</button>';
          }).join('') +
        '</div></nav>' +
      '</header>' +
      '<div id="mobile-menu" role="navigation" aria-label="Mobile navigation">' +
        mobileLinksHtml +
        '<a href="cart.html">Cart</a>' +
      '</div>'
    );
  }

  /* ── Footer HTML (contact listed ONCE) ─────────────────── */
  function buildFooter() {
    var year = new Date().getFullYear();
    var catLinks = CATEGORIES.slice(1).map(function (c) {
      return '<li><a href="shop.html?category=' + encodeURIComponent(c) + '">' + escHtml(c) + '</a></li>';
    }).join('');
    return (
      '<footer class="site" id="site-footer" role="contentinfo">' +
        '<div class="wrap"><div class="cols">' +
          '<div>' +
            '<h4 class="serif" style="font-size:19px;letter-spacing:.1em;">SOURCE77</h4>' +
            '<p>A small general store run by Source77 LLC in San Antonio, Texas. Surplus and liquidation finds, our own books, and digital downloads — listed honestly, photographed as they are.</p>' +
          '</div>' +
          '<div><h4>Shop</h4><ul>' +
            '<li><a href="shop.html">All items</a></li>' + catLinks +
            '<li><a href="books.html">Books</a></li>' +
          '</ul></div>' +
          '<div><h4>Help</h4><ul>' +
            '<li><a href="mailto:info@source77llc.com">info@source77llc.com</a></li>' +
            '<li><a href="tel:+19152233255">(915) 223-3255</a></li>' +
            '<li>Pickup: H-E-B, 17439 Classen Rd, San Antonio, TX 78247</li>' +
            '<li><a href="https://www.youtube.com/@iraqintexas" target="_blank" rel="noopener">YouTube — @iraqintexas</a></li>' +
          '</ul></div>' +
        '</div>' +
        '<p class="fine">Source77 LLC &nbsp;·&nbsp; San Antonio, TX &nbsp;·&nbsp; &copy; ' + year + ' Source77 LLC. All rights reserved.</p>' +
        '</div>' +
      '</footer>'
    );
  }

  /* ── Bottom bar + drawer ───────────────────────────────── */
  function buildChrome() {
    return (
      '<div class="bottombar" role="navigation" aria-label="Quick actions">' +
        '<button type="button" id="bb-shop">' +
          '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m2 7 4.4-4.4A1 1 0 0 1 7.1 2h9.8a1 1 0 0 1 .7.3L22 7"/><path d="M2 7h20v13a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1Z"/><path d="M9 21v-6a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v6"/></svg>' +
          'Shop' +
        '</button>' +
        '<button type="button" id="bb-search">' +
          '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><circle cx="11" cy="11" r="7"/><path d="m21 21-4.3-4.3"/></svg>' +
          'Search' +
        '</button>' +
        '<button type="button" id="bb-cart">' +
          '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="9" cy="21" r="1"/><circle cx="20" cy="21" r="1"/><path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6"/></svg>' +
          'Cart · <span class="bb-total" id="bb-total">$0.00</span>' +
          '<span class="bb-badge" id="bb-badge">0</span>' +
        '</button>' +
      '</div>' +
      '<div class="scrim" id="cart-scrim"></div>' +
      '<aside class="drawer" id="cart-drawer" aria-label="Shopping cart" aria-hidden="true">' +
        '<header><h3>Your cart</h3>' +
        '<button class="close" id="drawer-close" type="button" aria-label="Close cart">✕</button></header>' +
        '<div class="items" id="drawer-items"></div>' +
        '<footer id="drawer-footer">' +
          '<div class="fulfil" role="group" aria-label="Pickup or shipping">' +
            '<button type="button" id="fulfil-pickup">Pickup — Free</button>' +
            '<button type="button" id="fulfil-ship" class="active">Shipping</button>' +
          '</div>' +
          '<div class="sum-row"><span>Subtotal</span><span id="drawer-subtotal">$0.00</span></div>' +
          '<div class="sum-row"><span id="drawer-ship-label">Shipping</span><span id="drawer-shipping">$0.00</span></div>' +
          '<div class="sum-row"><span>Tax (8.25% TX)</span><span id="drawer-tax">$0.00</span></div>' +
          '<div class="sum-row total"><span>Total</span><span id="drawer-total">$0.00</span></div>' +
          '<button class="checkout-btn" id="drawer-checkout" type="button">Checkout</button>' +
          '<a class="view-cart-link" href="cart.html">View full cart</a>' +
          '<p class="secure">Your cart summary is always visible here — items, shipping and tax, no surprises.</p>' +
        '</footer>' +
      '</aside>'
    );
  }

  /* ── Drawer render ─────────────────────────────────────── */
  function renderDrawer() {
    var box = document.getElementById('drawer-items');
    if (!box) return;
    var entries = getCartEntries();
    box.innerHTML = '';
    if (entries.length === 0) {
      box.innerHTML = '<p class="empty-cart">Your cart is empty.<br />Add something from the shelf and it will show up here — total, shipping and tax included.</p>';
    }
    entries.forEach(function (e) {
      var row = document.createElement('div');
      row.className = 'c-item';
      row.setAttribute('data-id', e.id);
      var thumb = e.image
        ? '<img src="' + escHtml(e.image) + '" alt="' + escHtml(e.title) + '" />'
        : '<div class="thumb-graphic">📦</div>';
      var qty = parseInt(e.qty, 10) || 0;
      var price = Number(e.price) || 0;
      row.innerHTML = thumb +
        '<div class="c-main">' +
          '<div class="c-name">' + escHtml(e.title) + '</div>' +
          '<div class="c-unit">' + money(price) + ' each</div>' +
          '<div class="c-row">' +
            '<span class="qty"><button type="button" data-a="dec" aria-label="Decrease quantity">−</button><span>' + qty + '</span><button type="button" data-a="inc" aria-label="Increase quantity">+</button></span>' +
            '<button class="remove" type="button" data-a="rm">Remove</button>' +
            '<span class="c-line">' + money(price * qty) + '</span>' +
          '</div>' +
        '</div>';
      row.querySelector('[data-a="dec"]').addEventListener('click', function () {
        if (window.Source77Cart) window.Source77Cart.updateQty(e.id, qty - 1);
        renderDrawer(); updateBadges();
      });
      row.querySelector('[data-a="inc"]').addEventListener('click', function () {
        if (window.Source77Cart) window.Source77Cart.updateQty(e.id, qty + 1);
        renderDrawer(); updateBadges();
      });
      row.querySelector('[data-a="rm"]').addEventListener('click', function () {
        if (window.Source77Cart) window.Source77Cart.removeFromCart(e.id);
        renderDrawer(); updateBadges();
      });
      box.appendChild(row);
    });
    var t = getSummary();
    setText('drawer-subtotal', money(t.subtotal));
    setText('drawer-shipping', money(t.shipping));
    setText('drawer-ship-label', t.shipLabel);
    setText('drawer-tax', money(t.tax));
    setText('drawer-total', money(t.total));
    var btn = document.getElementById('drawer-checkout');
    if (btn) {
      btn.textContent = entries.length ? 'Checkout — ' + money(t.total) : 'Checkout';
      btn.disabled = entries.length === 0;
    }
    var fp = document.getElementById('fulfil-pickup');
    var fs = document.getElementById('fulfil-ship');
    if (fp) fp.className = fulfil === 'pickup' ? 'active' : '';
    if (fs) fs.className = fulfil === 'ship' ? 'active' : '';
  }

  function setText(id, text) {
    var el = document.getElementById(id);
    if (el) el.textContent = text;
  }

  function openDrawer() {
    renderDrawer();
    var drawer = document.getElementById('cart-drawer');
    var scrim = document.getElementById('cart-scrim');
    if (drawer) { drawer.classList.add('on'); drawer.setAttribute('aria-hidden', 'false'); }
    if (scrim) scrim.classList.add('on');
  }

  function closeDrawer() {
    var drawer = document.getElementById('cart-drawer');
    var scrim = document.getElementById('cart-scrim');
    if (drawer) { drawer.classList.remove('on'); drawer.setAttribute('aria-hidden', 'true'); }
    if (scrim) scrim.classList.remove('on');
  }

  /* ── Badges (header count + bottom bar total) ──────────── */
  function updateBadges() {
    var t = getSummary();
    var count = t.count;
    document.querySelectorAll('#cart-badge, .cart-count, .cart-badge').forEach(function (badge) {
      badge.textContent = String(count);
      badge.classList.toggle('visible', count > 0);
    });
    var bbBadge = document.getElementById('bb-badge');
    if (bbBadge) {
      bbBadge.textContent = String(count);
      bbBadge.className = 'bb-badge' + (count > 0 ? ' on' : '');
    }
    setText('bb-total', money(t.total));
    var drawer = document.getElementById('cart-drawer');
    if (drawer && drawer.classList.contains('on')) renderDrawer();
  }

  window.updateNavCartBadge = updateBadges;
  window.openCartDrawer = openDrawer;
  window.closeCartDrawer = closeDrawer;

  /* ── Events ────────────────────────────────────────────── */
  function bindAll() {
    var toggle = document.getElementById('nav-toggle');
    var menu = document.getElementById('mobile-menu');
    if (toggle && menu) {
      toggle.addEventListener('click', function () {
        var isOpen = menu.classList.contains('open');
        menu.classList.toggle('open', !isOpen);
        toggle.classList.toggle('open', !isOpen);
        toggle.setAttribute('aria-expanded', String(!isOpen));
      });
      document.addEventListener('click', function (e) {
        if (!toggle.contains(e.target) && !menu.contains(e.target)) {
          menu.classList.remove('open');
          toggle.classList.remove('open');
          toggle.setAttribute('aria-expanded', 'false');
        }
      });
    }

    var strip = document.getElementById('cat-strip');
    if (strip) {
      strip.addEventListener('click', function (e) {
        var btn = e.target.closest('button[data-category]');
        if (!btn) return;
        strip.querySelectorAll('button').forEach(function (b) {
          b.classList.toggle('active', b === btn);
        });
        goToCategory(btn.getAttribute('data-category') || 'All');
      });
    }

    var form = document.getElementById('global-search-form');
    var input = document.getElementById('global-search-input');
    var catSel = document.getElementById('global-search-cat');
    if (form && input) {
      form.addEventListener('submit', function (e) {
        e.preventDefault();
        doSearch(input.value, catSel ? catSel.value : 'All');
      });
      var debounce;
      input.addEventListener('input', function () {
        clearTimeout(debounce);
        debounce = setTimeout(function () {
          if (onShopPage() && typeof window.setShopSearch === 'function') {
            window.setShopSearch(input.value, catSel ? catSel.value : 'All');
          }
        }, 220);
      });
    }
    if (catSel) {
      catSel.addEventListener('change', function () {
        if (onShopPage() && typeof window.setShopSearch === 'function') {
          window.setShopSearch(input ? input.value : '', catSel.value);
        }
      });
    }

    var cartBtn = document.getElementById('cart-btn-top');
    if (cartBtn) cartBtn.addEventListener('click', openDrawer);
    var bbCart = document.getElementById('bb-cart');
    if (bbCart) bbCart.addEventListener('click', openDrawer);
    var closeBtn = document.getElementById('drawer-close');
    if (closeBtn) closeBtn.addEventListener('click', closeDrawer);
    var scrim = document.getElementById('cart-scrim');
    if (scrim) scrim.addEventListener('click', closeDrawer);
    document.addEventListener('keydown', function (e) { if (e.key === 'Escape') closeDrawer(); });

    var bbShop = document.getElementById('bb-shop');
    if (bbShop) bbShop.addEventListener('click', function () {
      if (onShopPage()) {
        var grid = document.getElementById('product-grid');
        if (grid) grid.scrollIntoView({ behavior: 'smooth', block: 'start' });
      } else {
        window.location.href = 'shop.html';
      }
    });
    var bbSearch = document.getElementById('bb-search');
    if (bbSearch) bbSearch.addEventListener('click', function () {
      window.scrollTo({ top: 0, behavior: 'smooth' });
      setTimeout(function () {
        var si = document.getElementById('global-search-input');
        if (si) si.focus({ preventScroll: true });
      }, 350);
    });

    var fp = document.getElementById('fulfil-pickup');
    var fs = document.getElementById('fulfil-ship');
    if (fp) fp.addEventListener('click', function () { fulfil = 'pickup'; renderDrawer(); });
    if (fs) fs.addEventListener('click', function () { fulfil = 'ship'; renderDrawer(); });
    var coBtn = document.getElementById('drawer-checkout');
    if (coBtn) coBtn.addEventListener('click', function () {
      if (getCartEntries().length === 0) { closeDrawer(); return; }
      window.location.href = 'checkout.html';
    });
  }

  /* ── Inject on DOMContentLoaded ────────────────────────── */
  document.addEventListener('DOMContentLoaded', function () {
    var navPlaceholder = document.getElementById('nav-placeholder');
    if (navPlaceholder) {
      navPlaceholder.innerHTML = buildHeader();
    } else {
      var mainEl = document.querySelector('main') || document.querySelector('.page-wrapper');
      if (mainEl) mainEl.insertAdjacentHTML('beforebegin', buildHeader());
      else document.body.insertAdjacentHTML('afterbegin', buildHeader());
    }

    var footerPlaceholder = document.getElementById('footer-placeholder');
    if (footerPlaceholder) {
      footerPlaceholder.innerHTML = buildFooter();
    } else {
      document.body.insertAdjacentHTML('beforeend', buildFooter());
    }

    document.body.insertAdjacentHTML('beforeend', buildChrome());
    bindAll();
    updateBadges();
  });

}());
