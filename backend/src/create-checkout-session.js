'use strict';

// Source77 Store — create-checkout-session (weight-tier shipping)
// CHANGE 2026-11-03: flat $8.99 shipping replaced by weight tiers, and
// Texas sales tax now applies to subtotal + shipping (it used to apply
// to the subtotal only). Local pickup stays free. Nothing else changed.
// CHANGE 2026-11-09: digital delivery mode. A digital-only cart sends
// shipping 'digital': $0 shipping, tax on the subtotal only (the tax
// formula is unchanged — shipping is 0, so the base is the subtotal).
// The Lambda rejects 'digital' unless every cart item is digital
// (fulfillment 'digital'). Mixed carts check out as pickup/ship.
// CHANGE 2026-11-09: ship-to-Iraq mode ('ship-iq'). Pirate Ship
// Simple Export Rate, Rest of World band, by total cart weight;
// $0 Texas tax on Iraq orders; Stripe collects the Iraq shipping
// address (allowed_countries ['IQ']). US 'ship' orders now also
// collect the US shipping address (allowed_countries ['US']) so
// shipped orders finally record a destination address.
// Runtime stays Node.js 18 (the Node 20/22 bump rides with the next
// backend change, hard date 2027-02-01).

const Stripe = require('stripe');

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type,x-admin-key',
  'Content-Type': 'application/json',
};

// Shipping tiers (total packaged weight of the whole cart, in ounces).
// Under 1 lb (< 16 oz) -> $5.99; 1-5 lb (16-80 oz) -> $8.99;
// over 5 lb (> 80 oz) -> $12.99. Boundary values belong to the HIGHER
// tier: exactly 16 oz ships at $8.99, exactly 80 oz ships at $8.99,
// 81 oz ships at $12.99.
const SHIPPING_TIERS = [
  { maxOz: 15.9999, cents: 599, label: 'under 1 lb' },
  { maxOz: 80, cents: 899, label: '1-5 lb' },
  { maxOz: Infinity, cents: 1299, label: 'over 5 lb' },
];

// Fallback per-unit weight when a cart item carries no weightOz
// (e.g. a cart saved before this change). Matches the store's
// bulk-load default of 0.5 lb.
const DEFAULT_WEIGHT_OZ = 8;

function shippingTier(totalWeightOz) {
  for (var i = 0; i < SHIPPING_TIERS.length; i++) {
    if (totalWeightOz <= SHIPPING_TIERS[i].maxOz) return SHIPPING_TIERS[i];
  }
  return SHIPPING_TIERS[SHIPPING_TIERS.length - 1];
}

// Iraq shipping — Pirate Ship Simple Export Rate, Rest of World
// band, by TOTAL cart weight (oz). Must match the frontend table
// (public/js/checkout.js). Rates verified Nov 2026: up to 0.5 lb
// $14.99, 1 lb $18.99, 2 lb $24.00 (live Pirate Ship SER quotes /
// rate tables); 3 lb $43.20, 4 lb $52.85 (2026 rate chart, Germany
// column — highest European Rest-of-World country, used as the
// conservative proxy so the store never undercharges).
// SER caps: max 4 lb total, max $400 cart value.
const IRAQ_TIERS = [
  { maxOz: 8, cents: 1499, label: 'up to 0.5 lb' },
  { maxOz: 16, cents: 1899, label: 'up to 1 lb' },
  { maxOz: 32, cents: 2400, label: 'up to 2 lb' },
  { maxOz: 48, cents: 4320, label: 'up to 3 lb' },
  { maxOz: 64, cents: 5285, label: 'up to 4 lb' },
];
const IRAQ_MAX_OZ = 64;
const IRAQ_MAX_VALUE_CENTS = 40000;

function iraqTier(totalWeightOz) {
  for (var i = 0; i < IRAQ_TIERS.length; i++) {
    if (totalWeightOz <= IRAQ_TIERS[i].maxOz) return IRAQ_TIERS[i];
  }
  return null;
}

function response(statusCode, body) {
  return {
    statusCode,
    headers: CORS_HEADERS,
    body: JSON.stringify(body),
  };
}

exports.handler = async (event) => {
  // OPTIONS preflight
  if (event.httpMethod === 'OPTIONS') {
    return response(200, {});
  }

  try {
    const stripe = Stripe(process.env.STRIPE_SECRET_KEY);

    const FRONTEND_URL = process.env.FRONTEND_URL || 'http://localhost:3000';

    const TAX_RATE = parseFloat(process.env.TAX_RATE || '0.0825');

    const body = JSON.parse(event.body || '{}');

    const { cart, shipping, customerEmail } = body;

    if (!cart || !Array.isArray(cart) || cart.length === 0) {
      return response(400, { error: 'cart is required and must be a non-empty array' });
    }

    if (!['pickup', 'ship', 'digital', 'ship-iq'].includes(shipping)) {
      return response(400, { error: "shipping must be 'pickup', 'ship', 'digital' or 'ship-iq'" });
    }

    // Digital mode is digital-only: every item must be a download.
    // (The frontend only offers it for all-digital carts; this is
    // the server-side backstop so a crafted request cannot get
    // $0 shipping on physical goods.)
    if (shipping === 'digital') {
      var nonDigital = cart.filter(function (item) {
        return item.fulfillment !== 'digital';
      });
      if (nonDigital.length > 0) {
        return response(400, { error: "shipping 'digital' requires an all-digital cart" });
      }
    }

    // Ship-to-Iraq is physical goods only. (The frontend hides the
    // Iraq option for digital-only carts; this is the backstop.)
    if (shipping === 'ship-iq') {
      var hasPhysical = cart.some(function (item) {
        return item.fulfillment !== 'digital';
      });
      if (!hasPhysical) {
        return response(400, { error: "shipping 'ship-iq' requires a physical item" });
      }
    }

    // Build line_items from cart
    const line_items = cart.map((item) => ({
      price_data: {
        currency: 'usd',
        product_data: {
          name: item.title,
        },
        unit_amount: Math.round(item.price * 100), // convert dollars to cents
      },
      quantity: item.quantity,
    }));

    // Calculate subtotal in cents
    const subtotalCents = cart.reduce(
      (sum, item) => sum + Math.round(item.price * 100) * item.quantity,
      0
    );

    // Total packaged weight of the cart, in ounces.
    // The frontend sends weightOz per cart item (from the product's
    // weight_lb field: weightOz = weight_lb * 16). Items without a
    // weight fall back to the 0.5 lb store default (8 oz).
    // NOTE: like item prices, weights here are client-supplied. A
    // future hardening step is to look weights up server-side from
    // the Products table instead of trusting the request.
    // NOTE 2026-11-09: weightOz 0 is a real value (digital items) —
    // the old `|| DEFAULT_WEIGHT_OZ` fallback would have turned a
    // download into 8 oz. Use an explicit NaN check instead.
    const totalWeightOz = cart.reduce(
      (sum, item) => {
        var w = Number(item.weightOz);
        return sum + (isNaN(w) ? DEFAULT_WEIGHT_OZ : w) * (item.quantity || 1);
      },
      0
    );

    // SER caps for Iraq (server-side backstop — the frontend hides
    // the option outside these limits, but a crafted request must
    // not be able to buy under-priced Iraq shipping).
    if (shipping === 'ship-iq') {
      if (!iraqTier(totalWeightOz)) {
        return response(400, { error: 'Iraq shipping is limited to 4 lb total cart weight' });
      }
      if (subtotalCents > IRAQ_MAX_VALUE_CENTS) {
        return response(400, { error: 'Iraq shipping is limited to $400 cart value' });
      }
    }

    // Shipping line item: free for pickup, US weight tier for ship,
    // Iraq SER rate for ship-iq, $0 for digital (instant download —
    // nothing to deliver).
    var shipTier = shipping === 'ship-iq'
      ? iraqTier(totalWeightOz)
      : shippingTier(totalWeightOz);
    const shippingCents = shipping === 'digital' ? 0
      : shipping === 'pickup' ? 0 : shipTier.cents;
    const shippingName = shipping === 'ship-iq'
      ? 'Shipping to Iraq (' + shipTier.label + ')'
      : 'Shipping (' + shipTier.label + ')';

    if (shippingCents > 0) {
      line_items.push({
        price_data: {
          currency: 'usd',
          product_data: {
            name: shippingName,
          },
          unit_amount: shippingCents,
        },
        quantity: 1,
      });
    }

    // Tax line item: 8.25% on subtotal + shipping for US orders.
    // Texas taxes delivery charges when the sale itself is taxable,
    // so shipping joins the tax base. Pickup orders have $0 shipping,
    // so their tax is unchanged from before. Digital orders also
    // have $0 shipping, so their tax is on the subtotal only.
    // Iraq orders are not Texas sales — $0 tax.
    const taxCents = shipping === 'ship-iq' ? 0
      : Math.round((subtotalCents + shippingCents) * TAX_RATE);

    if (taxCents > 0) {
      line_items.push({
        price_data: {
          currency: 'usd',
          product_data: {
            name: `Sales Tax (${(TAX_RATE * 100).toFixed(2)}%)`,
          },
          unit_amount: taxCents,
        },
        quantity: 1,
      });
    }

    // Collect the destination address on Stripe's page: US for
    // domestic shipping, Iraq for ship-to-Iraq. (Pickup and digital
    // orders need no address.) The address lands on the session as
    // shipping_details and the webhook saves it on the order record
    // — before this, shipped orders recorded no destination
    // address at all.
    const sessionParams = {
      mode: 'payment',
      line_items,

      success_url: `${FRONTEND_URL}/order-success.html?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${FRONTEND_URL}/checkout.html`,

      metadata: {
        shipping_method: shipping,
        destination: shipping === 'ship-iq' ? 'IQ' : 'US',
        total_weight_oz: String(Math.round(totalWeightOz * 10) / 10),
        cart_json: JSON.stringify(cart),
      },

      customer_email: customerEmail || undefined,
    };
    if (shipping === 'ship-iq') {
      sessionParams.shipping_address_collection = { allowed_countries: ['IQ'] };
    } else if (shipping === 'ship') {
      sessionParams.shipping_address_collection = { allowed_countries: ['US'] };
    }

    const session = await stripe.checkout.sessions.create(sessionParams);

    return response(200, { url: session.url });
  } catch (err) {
    console.error('create-checkout-session error:', err);
    return response(500, { error: 'Failed to create checkout session', details: err.message });
  }
};
