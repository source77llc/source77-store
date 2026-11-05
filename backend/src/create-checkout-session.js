'use strict';

// Source77 Store — create-checkout-session (weight-tier shipping)
// CHANGE 2026-11-03: flat $8.99 shipping replaced by weight tiers, and
// Texas sales tax now applies to subtotal + shipping (it used to apply
// to the subtotal only). Local pickup stays free. Nothing else changed.
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

    if (!['pickup', 'ship'].includes(shipping)) {
      return response(400, { error: "shipping must be 'pickup' or 'ship'" });
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
    const totalWeightOz = cart.reduce(
      (sum, item) =>
        sum + (Number(item.weightOz) || DEFAULT_WEIGHT_OZ) * (item.quantity || 1),
      0
    );

    // Shipping line item: free for pickup, weight tier for ship
    const tier = shippingTier(totalWeightOz);
    const shippingCents = shipping === 'pickup' ? 0 : tier.cents;

    if (shippingCents > 0) {
      line_items.push({
        price_data: {
          currency: 'usd',
          product_data: {
            name: 'Shipping (' + tier.label + ')',
          },
          unit_amount: shippingCents,
        },
        quantity: 1,
      });
    }

    // Tax line item: 8.25% on subtotal + shipping.
    // Texas taxes delivery charges when the sale itself is taxable,
    // so shipping joins the tax base. Pickup orders have $0 shipping,
    // so their tax is unchanged from before.
    const taxCents = Math.round((subtotalCents + shippingCents) * TAX_RATE);

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

    const session = await stripe.checkout.sessions.create({
      mode: 'payment',
      line_items,

      success_url: `${FRONTEND_URL}/order-success.html?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${FRONTEND_URL}/checkout.html`,

      metadata: {
        shipping_method: shipping,
        total_weight_oz: String(Math.round(totalWeightOz * 10) / 10),
        cart_json: JSON.stringify(cart),
      },

      customer_email: customerEmail || undefined,
    });

    return response(200, { url: session.url });
  } catch (err) {
    console.error('create-checkout-session error:', err);
    return response(500, { error: 'Failed to create checkout session', details: err.message });
  }
};
