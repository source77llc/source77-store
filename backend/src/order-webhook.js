'use strict';

const Stripe = require('stripe');
const { DynamoDBClient } = require('@aws-sdk/client-dynamodb');
const { DynamoDBDocumentClient, PutCommand } = require('@aws-sdk/lib-dynamodb');

const client = new DynamoDBClient({});
const ddb = DynamoDBDocumentClient.from(client);

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
  try {
    const stripe = Stripe(process.env.STRIPE_SECRET_KEY);
    const ORDERS_TABLE = process.env.ORDERS_TABLE;

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

      const order = {
        id: session.id,
        customerEmail: session.customer_email || '',
        amount_total: session.amount_total,
        shipping_method: session.metadata.shipping_method || '',
        items,
        status: 'new',
        createdAt: new Date().toISOString(),
      };

      await ddb.send(
        new PutCommand({
          TableName: ORDERS_TABLE,
          Item: order,
        })
      );

      console.log(`Order recorded: ${session.id}`);
    }

    // Acknowledge all other event types silently
    return response(200, { received: true });
  } catch (err) {
    console.error('order-webhook handler error:', err);
    return response(500, { error: 'Internal server error' });
  }
};
