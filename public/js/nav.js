/* ============================================================
   Source77 Store — nav.js
   Injects shared <nav> and <footer> into every page.
   Highlights the active link. Shows cart item count badge.
   ============================================================ */

(function () {
  'use strict';

  /* ── Cart count helper ─────────────────────────────────── */
  function getCartCount() {
    try {
      const raw = localStorage.getItem('source77_cart');
      if (!raw) return 0;
      const items = JSON.parse(raw);
      if (!Array.isArray(items)) return 0;
      return items.reduce(function (sum, item) {
        return sum + (parseInt(item.qty, 10) || 0);
      }, 0);
    } catch (e) {
      return 0;
    }
  }

  /* ── Active-link detection ─────────────────────────────── */
  function isActive(href) {
    var currentPath = window.location.pathname;
    // Normalise trailing slash / index
    var normalise = function (p) {
      p = p.replace(/\\/g, '/');
      if (p.endsWith('/')) p += 'index.html';
      return p;
    };
    var current = normalise(currentPath);
    var target  = normalise(href);
    // Match on filename portion so /store/shop.html matches shop.html
    var currentFile = current.split('/').pop();
    var targetFile  = target.split('/').pop();
    return currentFile === targetFile;
  }

  /* ── Nav links definition ──────────────────────────────── */
  var NAV_LINKS = [
    { href: 'index.html',     label: 'Home' },
    { href: 'shop.html',      label: 'Shop' },
    { href: 'herbalife.html', label: 'Herbalife' },
    { href: 'books.html',     label: 'Books' },
    { href: 'about.html',     label: 'About' },
    { href: 'contact.html',   label: 'Contact' }
  ];

  /* ── Build nav HTML ────────────────────────────────────── */
  function buildNav() {
    var count = getCartCount();
    var badgeClass = count > 0 ? 'cart-badge visible' : 'cart-badge';
    var badgeText  = count > 0 ? String(count) : '';

    var linksHtml = NAV_LINKS.map(function (link) {
      var activeClass = isActive(link.href) ? ' active' : '';
      return '<a href="' + link.href + '" class="' + activeClass + '">' + link.label + '</a>';
    }).join('\n        ');

    var mobileLinksHtml = NAV_LINKS.map(function (link) {
      var activeClass = isActive(link.href) ? ' active' : '';
      return '<a href="' + link.href + '" class="' + activeClass + '">' + link.label + '</a>';
    }).join('\n      ');

    return (
      '<nav id="site-nav" role="navigation" aria-label="Main navigation">' +
        '<div class="nav-inner">' +
          '<a href="index.html" class="nav-logo">Source<span>77</span></a>' +
          '<div class="nav-links" id="desktop-nav">' +
            linksHtml +
            '<a href="cart.html" class="cart-link" aria-label="Shopping cart">' +
              '&#x1F6D2; Cart' +
              '<span class="' + badgeClass + '" id="cart-badge" aria-live="polite">' + badgeText + '</span>' +
            '</a>' +
          '</div>' +
          '<button class="nav-toggle" id="nav-toggle" aria-label="Toggle menu" aria-expanded="false">' +
            '<span></span><span></span><span></span>' +
          '</button>' +
        '</div>' +
      '</nav>' +
      '<div id="mobile-menu" role="navigation" aria-label="Mobile navigation">' +
        mobileLinksHtml +
        '<a href="cart.html">&#x1F6D2; Cart' +
          '<span class="' + badgeClass + '">' + badgeText + '</span>' +
        '</a>' +
      '</div>'
    );
  }

  /* ── Build footer HTML ─────────────────────────────────── */
  function buildFooter() {
    var year = new Date().getFullYear();
    return (
      '<footer id="site-footer" role="contentinfo">' +
        '<div class="footer-inner">' +
          '<span>Source77 LLC &nbsp;&bull;&nbsp; San Antonio, TX</span>' +
          '<span>' +
            '<a href="mailto:info@source77llc.com">info@source77llc.com</a>' +
          '</span>' +
          '<span>' +
            '<a href="tel:+19152233255">(915) 223-3255</a>' +
          '</span>' +
          '<span>&copy; ' + year + ' Source77 LLC. All rights reserved.</span>' +
        '</div>' +
      '</footer>'
    );
  }

  /* ── Hamburger toggle ──────────────────────────────────── */
  function bindHamburger() {
    var toggle = document.getElementById('nav-toggle');
    var menu   = document.getElementById('mobile-menu');
    if (!toggle || !menu) return;

    toggle.addEventListener('click', function () {
      var isOpen = menu.classList.contains('open');
      menu.classList.toggle('open', !isOpen);
      toggle.classList.toggle('open', !isOpen);
      toggle.setAttribute('aria-expanded', String(!isOpen));
    });

    // Close on outside click
    document.addEventListener('click', function (e) {
      if (!toggle.contains(e.target) && !menu.contains(e.target)) {
        menu.classList.remove('open');
        toggle.classList.remove('open');
        toggle.setAttribute('aria-expanded', 'false');
      }
    });
  }

  /* ── Update cart badge (called by cart.js after adds) ── */
  window.updateNavCartBadge = function () {
    var count = getCartCount();
    var badges = document.querySelectorAll('#cart-badge, .cart-badge');
    badges.forEach(function (badge) {
      badge.textContent = count > 0 ? String(count) : '';
      badge.classList.toggle('visible', count > 0);
    });
  };

  /* ── Inject on DOMContentLoaded ────────────────────────── */
  document.addEventListener('DOMContentLoaded', function () {
    // Inject nav before <main> or at the top of <body>
    var navHtml = buildNav();
    var mainEl  = document.querySelector('main') || document.querySelector('.page-wrapper');
    if (mainEl) {
      mainEl.insertAdjacentHTML('beforebegin', navHtml);
    } else {
      document.body.insertAdjacentHTML('afterbegin', navHtml);
    }

    // Inject footer at the end of <body>
    document.body.insertAdjacentHTML('beforeend', buildFooter());

    bindHamburger();
  });

}());
