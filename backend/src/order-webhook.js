'use strict';

/*
 * order-webhook.js — Source77 Store Stripe Webhook Lambda (bridge-ready)
 *
 * Based on repo master backend/src/order-webhook.js, plus the AppScenic
 * bridge adapter changes (spec §5):
 *   (6) Stock decrement on purchase: on checkout.session.completed, decrement
 *       each ordered line's product quantity (never below 0; skip digital
 *       lines; skip lines whose product no longer exists). Decrement uses an
 *       optimistic-concurrency guard (quantity must still equal the value
 *       read) so a Stripe webhook retry cannot decrement twice — a guard
 *       failure is logged and skipped, never fatal.
 *   (7) bridge_status flag on every new order: 'pending' for shippable
 *       (ship / ship-iq) orders the bridge may forward, 'n/a' for pickup /
 *       digital orders the bridge must never forward. The bridge polls
 *       GET /orders?status=new&bridge_status=pending.
 *
 * The webhook must still return 200 to Stripe even if a decrement has a
 * problem — the order record is the source of truth and the daily
 * sale-watch reconciles. Decrement problems are logged, never swallowed
 * silently.
 *
 * No secret values in this file. Keys come from Lambda env vars only.
 */

const Stripe = require('stripe');
const { DynamoDBClient } = require('@aws-sdk/client-dynamodb');
const {
  DynamoDBDocumentClient,
  PutCommand,
  GetCommand,
  UpdateCommand,
} = require('@aws-sdk/lib-dynamodb');

const client = new DynamoDBClient({});
const ddb = DynamoDBDocumentClient.from(client);

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type,x-admin-key,x-bridge-key',
  'Content-Type': 'application/json',
};

function response(statusCode, body) {
  return {
    statusCode,
    headers: CORS_HEADERS,
    body: JSON.stringify(body),
  };
}

// (6) Decrement stock for one ordered line. Returns nothing; logs everything.
// Never throws — callers must not fail the webhook over stock.
async function decrementLine(productsTable, line) {
  const productId = line && line.id;
  const qty = line && line.quantity;
  if (!productId || !qty || qty <= 0) return;
  // Digital lines carry no stock.
  if (line.fulfillment === 'digital') return;

  try {
    const existing = await ddb.send(new GetCommand({
      TableName: productsTable,
      Key: { id: productId },
    }));
    if (!existing.Item) {
      console.warn(`stock decrement skipped: product ${productId} not found (order line)`);
      return;
    }
    const oldQty = typeof existing.Item.quantity === 'number' ? existing.Item.quantity : 0;
    const newQty = Math.max(0, oldQty - qty);
    if (newQty === oldQty) {
      console.log(`stock unchanged for ${productId}: already at ${oldQty}`);
      return;
    }
    try {
      await ddb.send(new UpdateCommand({
        TableName: productsTable,
        Key: { id: productId },
        UpdateExpression: 'SET quantity = :newQty, updatedAt = :now',
        ExpressionAttributeValues: { ':newQty': newQty, ':now': new Date().toISOString(), ':oldQty': oldQty },
        ConditionExpression: 'quantity = :oldQty',
      }));
      console.log(`stock decremented for ${productId}: ${oldQty} -> ${newQty}`);
    } catch (guardErr) {
      if (guardErr.name === 'ConditionalCheckFailedException') {
        // Quantity changed under us — most likely a Stripe retry of this
        // same webhook already decremented it. Log and move on.
        console.warn(`stock decrement guard tripped for ${productId} (expected ${oldQty}); assuming already decremented`);
        return;
      }
      throw guardErr;
    }
  } catch (err) {
    console.error(`stock decrement failed for ${productId}:`, err);
  }
}

exports.handler = async (event) => {
  try {
    const stripe = Stripe(process.env.STRIPE_SECRET_KEY);
    const ORDERS_TABLE = process.env.ORDERS_TABLE;
    const PRODUCTS_TABLE = process.env.PRODUCTS_TABLE;

    // Raw body as string (API Gateway may base64-encode binary)
    const rawBody = event.isBase64Encoded
      ? Buffer.from(event.body, 'base64').toString('utf8')
      : event.body;

    const sig = event.headers['stripe-signature'] || event.headers['Stripe-Signature'];

    let stripeEvent;
    try {
      stripeEvent = stripe.webhooks.constructEvent(
        rawBody,
        sig,
        process.env.STRIPE_WEBHOOK_SECRET
      );
    } catch (err) {
      console.error('Webhook signature verification failed:', err.message);
      return response(400, { error: `Webhook Error: ${err.message}` });
    }

    if (stripeEvent.type === 'checkout.session.completed') {
      const session = stripeEvent.data.object;

      let items = [];
      try {
        items = JSON.parse(session.metadata.cart_json || '[]');
      } catch (parseErr) {
        console.error('Failed to parse cart_json from metadata:', parseErr.message);
      }

      // Shipping address comes from Stripe's shipping_details, which
      // is only present when the checkout session collected one
      // (US 'ship' and Iraq 'ship-iq' orders, since 2026-11-09).
      // Pickup/digital orders have no shipping address (null).
      // CHANGE 2026-11-09: record destination + shipping address so
      // shipped orders are fulfillable from the order record.
      const shippingMethod = session.metadata.shipping_method || '';
      const order = {
        id: session.id,
        customerEmail: session.customer_email || '',
        amount_total: session.amount_total,
        shipping_method: shippingMethod,
        destination: (session.metadata && session.metadata.destination)
          || (session.metadata && session.metadata.shipping_method) || '',
        shipping_address: session.shipping_details
          ? {
              name: session.shipping_details.name || '',
              address: session.shipping_details.address || {},
            }
          : null,
        items,
        status: 'new',
        // (7) Bridge poll flag: only shippable orders are forwardable.
        bridge_status: (shippingMethod === 'ship' || shippingMethod === 'ship-iq')
          ? 'pending'
          : 'n/a',
        createdAt: new Date().toISOString(),
      };

      await ddb.send(
        new PutCommand({
          TableName: ORDERS_TABLE,
          Item: order,
        })
      );

      console.log(`Order recorded: ${session.id}`);

      // (6) Decrement stock for each ordered line. Runs after the order
      // is safely recorded; failures are logged, never fatal to the webhook.
      if (PRODUCTS_TABLE && Array.isArray(items)) {
        for (const line of items) {
          await decrementLine(PRODUCTS_TABLE, line);
        }
      } else if (!PRODUCTS_TABLE) {
        console.warn('PRODUCTS_TABLE env var not set; stock decrement skipped');
      }
    }

    // Acknowledge all other event types silently
    return response(200, { received: true });
  } catch (err) {
    console.error('order-webhook handler error:', err);
    return response(500, { error: 'Internal server error' });
  }
};
