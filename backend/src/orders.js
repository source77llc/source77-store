'use strict';

/*
 * orders.js — Source77 Store Orders Lambda (bridge-ready)
 *
 * Based on repo master backend/src/orders.js, plus the AppScenic bridge
 * adapter changes (spec §5):
 *   (1) Separate bridge credential: BRIDGE_KEY env var, x-bridge-key header.
 *       Accepted alongside the admin key on every route.
 *   (2/7) GET /orders?status=<value>&since=<ISO>&bridge_status=<value>
 *       filters — the bridge's poll loop (status=new, since=last poll).
 *   (5) Extended PATCH /orders/{id}: status (now also 'fulfilled'),
 *       supplier_order_id, tracking_number, fulfilled_at, plus bridge
 *       bookkeeping fields bridge_status / bridge_forwarded_at.
 *       The 'fulfilled' status value is implemented as proposed in the spec;
 *       'shipped' still works — which one the bridge uses is open decision #6.
 *
 * No secret values in this file. Keys come from Lambda env vars only.
 */

const { DynamoDBClient } = require('@aws-sdk/client-dynamodb');
const {
  DynamoDBDocumentClient,
  ScanCommand,
  GetCommand,
  UpdateCommand,
} = require('@aws-sdk/lib-dynamodb');

const client = new DynamoDBClient({});
const ddb = DynamoDBDocumentClient.from(client);

const TABLE = process.env.ORDERS_TABLE;
const ADMIN_KEY = process.env.ADMIN_KEY;
const BRIDGE_KEY = process.env.BRIDGE_KEY;

// 'fulfilled' added (spec §5.5, proposed). 'shipped' still accepted.
const VALID_STATUSES = ['new', 'shipped', 'picked up', 'fulfilled'];

// Fields the extended PATCH may set (besides status).
const PATCHABLE_FIELDS = [
  'supplier_order_id',
  'tracking_number',
  'fulfilled_at',
  'bridge_status',
  'bridge_forwarded_at',
  'bridge_error',
];

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

function checkAdminKey(event) {
  const key = getHeader(event, 'x-admin-key');
  return !!ADMIN_KEY && !!key && key === ADMIN_KEY;
}

// (1) Bridge credential: accepted alongside the admin key. A missing/empty
// BRIDGE_KEY env var means bridge auth is disabled (never matches).
function checkBridgeKey(event) {
  const key = getHeader(event, 'x-bridge-key');
  return !!BRIDGE_KEY && !!key && key === BRIDGE_KEY;
}

function checkAuth(event) {
  return checkAdminKey(event) || checkBridgeKey(event);
}

exports.handler = async (event) => {
  const method = event.httpMethod;
  const resource = event.resource;

  // OPTIONS preflight
  if (method === 'OPTIONS') {
    return response(200, {});
  }

  // All routes require a key (admin or bridge)
  if (!checkAuth(event)) {
    return response(401, { error: 'Unauthorized: invalid or missing key' });
  }

  try {
    // GET /orders — (2/7) ?status= & ?since= (createdAt) & ?bridge_status=
    if (method === 'GET' && resource === '/orders') {
      const qs = event.queryStringParameters || {};
      const names = {};
      const values = {};
      const filters = [];
      if (qs.status) {
        names['#st'] = 'status';
        values[':st'] = qs.status;
        filters.push('#st = :st');
      }
      if (qs.since) {
        names['#ca'] = 'createdAt';
        values[':since'] = qs.since;
        filters.push('#ca >= :since');
      }
      if (qs.bridge_status) {
        names['#bs'] = 'bridge_status';
        values[':bs'] = qs.bridge_status;
        filters.push('#bs = :bs');
      }
      const scanParams = { TableName: TABLE };
      if (filters.length > 0) {
        scanParams.FilterExpression = filters.join(' AND ');
        scanParams.ExpressionAttributeNames = names;
        scanParams.ExpressionAttributeValues = values;
      }
      const result = await ddb.send(new ScanCommand(scanParams));
      const items = (result.Items || []).sort((a, b) => {
        // Sort descending by createdAt
        if (a.createdAt > b.createdAt) return -1;
        if (a.createdAt < b.createdAt) return 1;
        return 0;
      });
      return response(200, items);
    }

    // GET /orders/{id}
    if (method === 'GET' && resource === '/orders/{id}') {
      const id = event.pathParameters && event.pathParameters.id;
      if (!id) {
        return response(400, { error: 'Missing order id' });
      }
      const result = await ddb.send(new GetCommand({ TableName: TABLE, Key: { id } }));
      if (!result.Item) {
        return response(404, { error: 'Order not found' });
      }
      return response(200, result.Item);
    }

    // PATCH /orders/{id} — (5) extended: status + fulfillment/bridge fields.
    if (method === 'PATCH' && resource === '/orders/{id}') {
      const id = event.pathParameters && event.pathParameters.id;
      if (!id) {
        return response(400, { error: 'Missing order id' });
      }

      const body = JSON.parse(event.body || '{}');
      const sets = {};
      if (body.status !== undefined) {
        if (!VALID_STATUSES.includes(body.status)) {
          return response(400, {
            error: `Invalid status. Must be one of: ${VALID_STATUSES.join(', ')}`,
          });
        }
        sets.status = body.status;
      }
      for (const f of PATCHABLE_FIELDS) {
        if (body[f] !== undefined) sets[f] = body[f];
      }
      const fields = Object.keys(sets);
      if (fields.length === 0) {
        return response(400, {
          error: 'Nothing to update. Send status and/or: ' + PATCHABLE_FIELDS.join(', '),
        });
      }

      const UpdateExpression =
        'SET ' + fields.map((f, i) => `#f${i} = :v${i}`).join(', ');
      const ExpressionAttributeNames = fields.reduce((acc, f, i) => {
        acc[`#f${i}`] = f;
        return acc;
      }, {});
      const ExpressionAttributeValues = fields.reduce((acc, f, i) => {
        acc[`:v${i}`] = sets[f];
        return acc;
      }, {});

      try {
        const result = await ddb.send(
          new UpdateCommand({
            TableName: TABLE,
            Key: { id },
            UpdateExpression,
            ExpressionAttributeNames,
            ExpressionAttributeValues,
            ReturnValues: 'ALL_NEW',
            ConditionExpression: 'attribute_exists(id)',
          })
        );
        return response(200, result.Attributes);
      } catch (err) {
        if (err.name === 'ConditionalCheckFailedException') {
          return response(404, { error: 'Order not found' });
        }
        throw err;
      }
    }

    return response(404, { error: 'Route not found' });
  } catch (err) {
    console.error('orders handler error:', err);
    return response(500, { error: 'Internal server error' });
  }
};
