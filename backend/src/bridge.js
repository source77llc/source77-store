'use strict';

/*
 * bridge.js — Source77 Store Bridge Health Lambda (new, spec §5.8)
 *
 * GET /bridge/health — lets the AppScenic bridge prove the website side is
 * up before syncing. Returns catalog/order counts, the last AppScenic sync
 * timestamp, and the deployed backend version.
 *
 * Auth: bridge key (x-bridge-key) OR admin key (x-admin-key). A missing or
 * empty BRIDGE_KEY env var means bridge auth is disabled (never matches).
 *
 * No secret values in this file. Keys come from Lambda env vars only.
 */

const { DynamoDBClient } = require('@aws-sdk/client-dynamodb');
const {
  DynamoDBDocumentClient,
  ScanCommand,
} = require('@aws-sdk/lib-dynamodb');

const client = new DynamoDBClient({});
const ddb = DynamoDBDocumentClient.from(client);

const PRODUCTS_TABLE = process.env.PRODUCTS_TABLE;
const ORDERS_TABLE = process.env.ORDERS_TABLE;
const ADMIN_KEY = process.env.ADMIN_KEY;
const BRIDGE_KEY = process.env.BRIDGE_KEY;
const BACKEND_VERSION = process.env.BACKEND_VERSION || '1.1.0-bridge';

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

function getHeader(event, name) {
  if (!event.headers) return undefined;
  const lower = name.toLowerCase();
  for (const k of Object.keys(event.headers)) {
    if (k.toLowerCase() === lower) return event.headers[k];
  }
  return undefined;
}

function checkAuth(event) {
  const adminKey = getHeader(event, 'x-admin-key');
  if (!!ADMIN_KEY && !!adminKey && adminKey === ADMIN_KEY) return true;
  const bridgeKey = getHeader(event, 'x-bridge-key');
  if (!!BRIDGE_KEY && !!bridgeKey && bridgeKey === BRIDGE_KEY) return true;
  return false;
}

exports.handler = async (event) => {
  const method = event.httpMethod;
  const resource = event.resource;

  // OPTIONS preflight
  if (method === 'OPTIONS') {
    return response(200, {});
  }

  if (method !== 'GET' || resource !== '/bridge/health') {
    return response(404, { error: 'Route not found' });
  }

  if (!checkAuth(event)) {
    return response(401, { error: 'Unauthorized: invalid or missing key' });
  }

  try {
    const [productsRes, ordersRes] = await Promise.all([
      ddb.send(new ScanCommand({
        TableName: PRODUCTS_TABLE,
        ProjectionExpression: 'id, #src, appscenic_updated_at',
        ExpressionAttributeNames: { '#src': 'source' },
      })),
      ddb.send(new ScanCommand({
        TableName: ORDERS_TABLE,
        ProjectionExpression: 'id, #st, createdAt',
        ExpressionAttributeNames: { '#st': 'status' },
      })),
    ]);

    const products = productsRes.Items || [];
    const orders = ordersRes.Items || [];

    const appscenicProducts = products.filter((p) => p.source === 'appscenic');
    const lastSync = appscenicProducts.reduce((max, p) => {
      const t = p.appscenic_updated_at;
      return t && (!max || t > max) ? t : max;
    }, null);
    const newOrders = orders.filter((o) => o.status === 'new');
    const lastOrder = orders.reduce((max, o) => {
      const t = o.createdAt;
      return t && (!max || t > max) ? t : max;
    }, null);

    return response(200, {
      status: 'ok',
      backend_version: BACKEND_VERSION,
      products_count: products.length,
      appscenic_products_count: appscenicProducts.length,
      orders_count: orders.length,
      new_orders_count: newOrders.length,
      last_appscenic_sync_at: lastSync,
      last_order_created_at: lastOrder,
      timestamp: new Date().toISOString(),
    });
  } catch (err) {
    console.error('bridge health handler error:', err);
    return response(500, { error: 'Internal server error' });
  }
};
