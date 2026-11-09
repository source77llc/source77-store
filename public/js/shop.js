/* ============================================================
   Source77 Store — shop.js (redesign 2026-11-09)
   Renders the product grid on shop.html in the approved
   Boston + eBay style: full titles (never truncated),
   result count, sort, header search + category strip.
   Tries GET CONFIG.API_BASE_URL+'/products', falls back to
   window.SEED_PRODUCTS if the fetch fails or API_BASE_URL=''.
   ============================================================ */

(function () {
  'use strict';

  var currentCategory = 'All';
  var currentSearch = '';
  var currentSort = 'featured';
  var allProducts = [];

  /* ── Condition badge helper ────────────────────────────── */
  function conditionClass(condition) {
    if (!condition) return 'new';
    var c = condition.toLowerCase();
    if (c.includes('open box') || c.includes('open-box')) return 'open-box';
    if (c.includes('used') && c.includes('good')) return 'used-good';
    if (c.includes('used') && c.includes('fair')) return 'used-fair';
    if (c.includes('used')) return 'used-good';
    return 'new';
  }

  function escHtml(str) {
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function money(n) { return '$' + Number(n || 0).toFixed(2); }

  /* ── Render a single product card (preview .p-card) ────── */
  function buildCard(product) {
    var imgHtml = (product.images && product.images.length > 0)
      ? '<img src="' + escHtml(product.images[0]) + '" alt="' + escHtml(product.title) + '" loading="lazy">'
      : '<span class="no-image">&#x1F4E6;</span>';

    var badgeCls = conditionClass(product.condition);

    // Out of stock: quantity is a number at or below zero. Products without a
    // quantity field keep the current behavior (treated as in stock).
    var outOfStock = (typeof product.quantity === 'number' && product.quantity <= 0);

    var badgeHtml = outOfStock
      ? '<span class="badge out">Out of stock</span>'
      : '<span class="badge sage">' + escHtml(product.condition || 'New') + '</span>';

    var fulfillmentHtml = product.fulfillment === 'direct'
      ? '<span class="fulfillment-badge direct">🚚 Ships directly to you</span>'
      : '<span class="fulfillment-badge local">📍 Local pickup available</span>';

    var shipNote = outOfStock
      ? 'Restock updates on the page'
      : 'Pickup free · ships by weight';

    return (
      '<article class="product-card p-card" data-id="' + escHtml(product.id) + '" role="article">' +
        '<div class="card-image p-media">' + imgHtml + badgeHtml + '</div>' +
        '<div class="card-body p-body">' +
          '<span class="p-cat">' + escHtml(product.category || 'General Merchandise') + '</span>' +
          '<span class="card-title p-name">' + escHtml(product.title) + '</span>' +
          '<span class="condition-badge ' + badgeCls + '">' + escHtml(product.condition || 'New') + '</span>' +
          (outOfStock ? '<span class="stock-badge out-of-stock">Out of stock</span>' : '') +
          '<div class="card-price p-price"><span class="amt">' + money(product.price) + '</span>' +
          '<span class="ship">' + shipNote + '</span></div>' +
          fulfillmentHtml +
        '</div>' +
        '<div class="card-actions">' +
          (outOfStock
            ? '<button class="btn btn-primary add-to-cart-btn" disabled>Out of Stock</button>'
            : '<button class="btn btn-primary add-to-cart-btn" ' +
              'data-product=\'' + JSON.stringify({
                id: product.id,
                title: product.title,
                condition: product.condition,
                price: product.price,
                weight_lb: product.weight_lb,
                images: product.images || []
              }).replace(/'/g, '&#39;') + '\'' +
              ' aria-label="Add ' + escHtml(product.title) + ' to cart">' +
              'Add to Cart' +
            '</button>') +
        '</div>' +
      '</article>'
    );
  }

  /* ── Filter, sort & render grid ────────────────────────── */
  function visibleProducts() {
    var filtered = allProducts.filter(function (p) {
      var matchCat = (currentCategory === 'All') || (p.category === currentCategory);
      var query = currentSearch.trim().toLowerCase();
      var matchSearch = !query ||
        (p.title && p.title.toLowerCase().includes(query)) ||
        (p.description && p.description.toLowerCase().includes(query));
      return matchCat && matchSearch;
    });
    if (currentSort === 'price-asc') filtered.sort(function (a, b) { return a.price - b.price; });
    if (currentSort === 'price-desc') filtered.sort(function (a, b) { return b.price - a.price; });
    if (currentSort === 'name') filtered.sort(function (a, b) { return String(a.title).localeCompare(String(b.title)); });
    return filtered;
  }

  function renderGrid() {
    var grid = document.getElementById('product-grid');
    if (!grid) return;

    var filtered = visibleProducts();
    var titleEl = document.getElementById('shop-title');
    if (titleEl) {
      titleEl.textContent = currentCategory === 'All' ? 'Shop All Items' : currentCategory;
    }
    var countEl = document.getElementById('result-count');
    if (countEl) {
      countEl.textContent = filtered.length + (filtered.length === 1 ? ' item' : ' items') +
        (currentCategory !== 'All' ? ' in ' + currentCategory : '') +
        (currentSearch ? ' for "' + currentSearch + '"' : '');
    }
    var emptyEl = document.getElementById('empty-state');
    if (filtered.length === 0) {
      grid.innerHTML = '';
      if (emptyEl) emptyEl.hidden = false;
      return;
    }
    if (emptyEl) emptyEl.hidden = true;
    grid.innerHTML = filtered.map(buildCard).join('');
  }

  function setCategory(cat) {
    currentCategory = cat || 'All';
    syncHeaderControls();
    renderGrid();
  }

  function setSearch(query, cat) {
    if (typeof query === 'string') currentSearch = query;
    if (cat) currentCategory = cat;
    syncHeaderControls();
    renderGrid();
  }

  /* Keep the header search + strip in sync with grid state */
  function syncHeaderControls() {
    var input = document.getElementById('global-search-input');
    if (input && input.value !== currentSearch) input.value = currentSearch;
    var sel = document.getElementById('global-search-cat');
    if (sel) sel.value = currentCategory;
    var strip = document.getElementById('cat-strip');
    if (strip) {
      strip.querySelectorAll('button[data-category]').forEach(function (b) {
        b.classList.toggle('active', b.getAttribute('data-category') === currentCategory);
      });
    }
    var filters = document.getElementById('category-filters');
    if (filters) {
      filters.querySelectorAll('button[data-category]').forEach(function (b) {
        b.classList.toggle('active', b.getAttribute('data-category') === currentCategory);
      });
    }
  }

  window.setShopCategory = setCategory;
  window.setShopSearch = setSearch;

  /* ── Sort select ───────────────────────────────────────── */
  function bindSort() {
    var sortSel = document.getElementById('sort-select');
    if (!sortSel) return;
    sortSel.addEventListener('change', function () {
      currentSort = sortSel.value;
      renderGrid();
    });
  }

  /* ── In-page category filter buttons ───────────────────── */
  function bindCategoryFilters() {
    var filters = document.getElementById('category-filters');
    if (!filters) return;
    filters.addEventListener('click', function (e) {
      var btn = e.target.closest('button[data-category]');
      if (!btn) return;
      setCategory(btn.getAttribute('data-category'));
    });
  }

  /* ── Product card click → detail page ─────────────────── */
  function bindCardClicks() {
    var grid = document.getElementById('product-grid');
    if (!grid) return;
    grid.addEventListener('click', function (e) {
      // Add to Cart button — handled below in bindAddToCart
      if (e.target.classList.contains('add-to-cart-btn') ||
        e.target.closest('.add-to-cart-btn')) return;

      var card = e.target.closest('.product-card');
      if (!card) return;
      var id = card.getAttribute('data-id');
      if (id) {
        window.location.href = 'product.html?id=' + encodeURIComponent(id);
      }
    });
  }

  /* ── Add to Cart from grid ─────────────────────────────── */
  function bindAddToCart() {
    var grid = document.getElementById('product-grid');
    if (!grid) return;
    grid.addEventListener('click', function (e) {
      var btn = e.target.closest('.add-to-cart-btn');
      if (!btn) return;
      e.stopPropagation();
      try {
        var product = JSON.parse(btn.getAttribute('data-product'));
        if (typeof window.addToCart === 'function') {
          window.addToCart(product, 1);
        }
      } catch (err) {
        console.error('Source77: failed to parse product data', err);
      }
    });
  }

  /* ── Clear search & filters (empty state) ─────────────── */
  function bindClearSearch() {
    var btn = document.getElementById('clear-search');
    if (!btn) return;
    btn.addEventListener('click', function () {
      currentSearch = '';
      currentCategory = 'All';
      syncHeaderControls();
      renderGrid();
    });
  }

  /* ── Loading UI helpers ────────────────────────────────── */
  function showSpinner() {
    var grid = document.getElementById('product-grid');
    if (grid) {
      grid.innerHTML =
        '<div class="spinner-wrap" style="grid-column:1/-1"><div class="spinner"></div></div>';
    }
  }

  function showError(msg) {
    var grid = document.getElementById('product-grid');
    if (grid) {
      grid.innerHTML =
        '<div class="empty-state" style="grid-column:1/-1">' +
        '<span class="empty-icon">&#9888;</span>' +
        '<h3>Could not load products</h3>' +
        '<p>' + escHtml(msg) + '</p>' +
        '</div>';
    }
  }

  /* ── Load products ─────────────────────────────────────── */
  function loadProducts() {
    showSpinner();

    // Use API if a base URL is configured
    if (typeof CONFIG !== 'undefined' && CONFIG.API_BASE_URL) {
      fetch(CONFIG.API_BASE_URL + '/products')
        .then(function (res) {
          if (!res.ok) throw new Error('HTTP ' + res.status);
          return res.json();
        })
        .then(function (data) {
          allProducts = Array.isArray(data) ? data : (data.products || []);
          renderGrid();
          bindSort();
          bindCategoryFilters();
          bindCardClicks();
          bindAddToCart();
          bindClearSearch();
        })
        .catch(function (err) {
          console.warn('Source77: API fetch failed, falling back to seed data.', err);
          useSeedProducts();
        });
    } else {
      useSeedProducts();
    }
  }

  function useSeedProducts() {
    if (typeof window.SEED_PRODUCTS !== 'undefined' && Array.isArray(window.SEED_PRODUCTS)) {
      allProducts = window.SEED_PRODUCTS;
    } else {
      allProducts = [];
      showError('No products available and no seed data loaded.');
      return;
    }
    renderGrid();
    bindSort();
    bindCategoryFilters();
    bindCardClicks();
    bindAddToCart();
    bindClearSearch();
  }

  /* ── Init ──────────────────────────────────────────────── */
  document.addEventListener('DOMContentLoaded', function () {
    // Only run on pages with a product grid
    if (!document.getElementById('product-grid')) return;

    // Honor ?category= and ?q= from the header search / category links
    var params = new URLSearchParams(window.location.search);
    var cat = params.get('category');
    var q = params.get('q');
    if (cat) currentCategory = cat;
    if (q) currentSearch = q;

    loadProducts();
  });

}());
