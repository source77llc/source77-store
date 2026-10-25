/* ============================================================
   Source77 Store — shop.js
   Renders the product grid on shop.html.
   Tries GET CONFIG.API_BASE_URL+'/products', falls back to
   window.SEED_PRODUCTS if the fetch fails or API_BASE_URL=''.
   ============================================================ */

(function () {
  'use strict';

  var currentCategory = 'All';
  var currentSearch   = '';
  var allProducts     = [];

  /* ── Condition badge helper ────────────────────────────── */
  function conditionClass(condition) {
    if (!condition) return 'new';
    var c = condition.toLowerCase();
    if (c.includes('open box') || c.includes('open-box')) return 'open-box';
    if (c.includes('used') && c.includes('good'))  return 'used-good';
    if (c.includes('used') && c.includes('fair'))  return 'used-fair';
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

  /* ── Render a single product card ─────────────────────── */
  function buildCard(product) {
    var imgHtml = (product.images && product.images.length > 0)
      ? '<img src="' + escHtml(product.images[0]) + '" alt="' + escHtml(product.title) + '">'
      : '<span class="no-image">&#x1F4E6;</span>';

    var badgeCls = conditionClass(product.condition);

    return (
      '<div class="product-card" data-id="' + escHtml(product.id) + '" role="article">' +
        '<div class="card-image">' + imgHtml + '</div>' +
        '<div class="card-body">' +
          '<div class="card-title">' + escHtml(product.title) + '</div>' +
          '<span class="condition-badge ' + badgeCls + '">' + escHtml(product.condition || 'New') + '</span>' +
          '<div class="card-price">$' + Number(product.price).toFixed(2) + '</div>' +
        '</div>' +
        '<div class="card-actions">' +
          '<button class="btn btn-primary add-to-cart-btn" ' +
            'data-product=\'' + JSON.stringify({
              id:        product.id,
              title:     product.title,
              condition: product.condition,
              price:     product.price,
              images:    product.images || []
            }).replace(/'/g, '&#39;') + '\'' +
            ' aria-label="Add ' + escHtml(product.title) + ' to cart">' +
            'Add to Cart' +
          '</button>' +
        '</div>' +
      '</div>'
    );
  }

  /* ── Filter & render grid ──────────────────────────────── */
  function renderGrid() {
    var grid = document.getElementById('product-grid');
    if (!grid) return;

    var filtered = allProducts.filter(function (p) {
      var matchCat = (currentCategory === 'All') || (p.category === currentCategory);
      var query    = currentSearch.trim().toLowerCase();
      var matchSearch = !query ||
        (p.title       && p.title.toLowerCase().includes(query)) ||
        (p.description && p.description.toLowerCase().includes(query));
      return matchCat && matchSearch;
    });

    if (filtered.length === 0) {
      grid.innerHTML =
        '<div class="empty-state" style="grid-column:1/-1">' +
          '<span class="empty-icon">&#x1F50D;</span>' +
          '<h3>No products found</h3>' +
          '<p>Try a different search or category.</p>' +
        '</div>';
      return;
    }

    grid.innerHTML = filtered.map(buildCard).join('');
  }

  /* ── Category filter buttons ───────────────────────────── */
  var CATEGORIES = ['All', 'Car Parts', 'Home Goods', 'Electronics', 'General Merchandise', 'Warehouse Deals', 'Dropship', 'Other'];

  function renderFilters() {
    var filterWrap = document.getElementById('category-filters');
    if (!filterWrap) return;

    filterWrap.innerHTML = CATEGORIES.map(function (cat) {
      var active = cat === currentCategory ? ' active' : '';
      return '<button class="filter-btn' + active + '" data-category="' + escHtml(cat) + '">' + escHtml(cat) + '</button>';
    }).join('');
  }

  function bindFilters() {
    var filterWrap = document.getElementById('category-filters');
    if (!filterWrap) return;
    filterWrap.addEventListener('click', function (e) {
      var btn = e.target.closest('.filter-btn');
      if (!btn) return;
      currentCategory = btn.getAttribute('data-category') || 'All';
      // Update active state
      filterWrap.querySelectorAll('.filter-btn').forEach(function (b) {
        b.classList.toggle('active', b.getAttribute('data-category') === currentCategory);
      });
      renderGrid();
    });
  }

  /* ── Search input ──────────────────────────────────────── */
  function bindSearch() {
    var searchInput = document.getElementById('product-search');
    if (!searchInput) return;
    var debounceTimer;
    searchInput.addEventListener('input', function () {
      clearTimeout(debounceTimer);
      debounceTimer = setTimeout(function () {
        currentSearch = searchInput.value;
        renderGrid();
      }, 220);
    });
    var searchForm = document.getElementById('search-form');
    if (searchForm) {
      searchForm.addEventListener('submit', function (e) {
        e.preventDefault();
        currentSearch = searchInput.value;
        renderGrid();
      });
    }
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
          renderFilters();
          renderGrid();
          bindFilters();
          bindSearch();
          bindCardClicks();
          bindAddToCart();
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
    renderFilters();
    renderGrid();
    bindFilters();
    bindSearch();
    bindCardClicks();
    bindAddToCart();
  }

  /* ── Init ──────────────────────────────────────────────── */
  document.addEventListener('DOMContentLoaded', function () {
    // Only run on pages with a product grid
    if (!document.getElementById('product-grid')) return;
    loadProducts();
  });

}());
