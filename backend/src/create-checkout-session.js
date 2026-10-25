'use strict';

const Stripe = require('stripe');

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type,x-admin-key',
  'Content-Type': 'application/json',
};

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

    // Tax line item
    const taxCents = Math.round(subtotalCents * TAX_RATE);
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

    // Shipping line item: free for pickup, $8.99 for ship
    const shippingCents = shipping === 'pickup' ? 0 : 899;
    if (shippingCents > 0) {
      line_items.push({
        price_data: {
          currency: 'usd',
          product_data: {
            name: 'Shipping',
          },
          unit_amount: shippingCents,
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
