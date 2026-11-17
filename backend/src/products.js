'use strict';

/*
 * products.js — Source77 Store Products Lambda (bridge-ready)
 *
 * Based on repo master backend/src/products.js, plus the AppScenic bridge
 * adapter changes (spec §5):
 *   (1) Separate bridge credential: BRIDGE_KEY env var, x-bridge-key header.
 *       Write routes accept the admin key OR the bridge key. The bridge key
 *       is never shipped in public/js/config.js.
 *   (2) GET /products?source=<value>&since=<ISO> filters.
 *   (3) POST /products/bulk — bulk import (max 25 items/call, per-item results).
 *   (4) POST /products/upsert — upsert by appscenic_product_id (idempotent).
 *   Plus: updatedAt set on every write, version counter (if_not_exists + 1),
 *   and `qty` accepted as an alias for `quantity` on writes.
 *
 * No secret values in this file. Keys come from Lambda env vars only.
 */

const { DynamoDBClient } = require('@aws-sdk/client-dynamodb');
const {
  DynamoDBDocumentClient,
  ScanCommand,
  GetCommand,
  PutCommand,
  UpdateCommand,
  DeleteCommand,
} = require('@aws-sdk/lib-dynamodb');

const client = new DynamoDBClient({});
const ddb = DynamoDBDocumentClient.from(client);

const TABLE = process.env.PRODUCTS_TABLE;
const ADMIN_KEY = process.env.ADMIN_KEY;
const BRIDGE_KEY = process.env.BRIDGE_KEY;

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type,x-admin-key,x-bridge-key',
  'Content-Type': 'application/json',
};

const BULK_MAX_ITEMS = 25;

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

// (1) Bridge credential: accepted alongside the admin key on write routes
// and on the bridge's read routes. A missing/empty BRIDGE_KEY env var means
// bridge auth is disabled (never matches).
function checkBridgeKey(event) {
  const key = getHeader(event, 'x-bridge-key');
  return !!BRIDGE_KEY && !!key && key === BRIDGE_KEY;
}

function checkWriteAuth(event) {
  return checkAdminKey(event) || checkBridgeKey(event);
}

function nowIso() {
  return new Date().toISOString();
}

// Accept `qty` as an alias for `quantity` (standing store rule).
function normalizeItem(item) {
  const out = Object.assign({}, item);
  if (out.quantity === undefined && out.qty !== undefined) {
    out.quantity = out.qty;
  }
  delete out.qty;
  return out;
}

function stampNew(item) {
  const out = normalizeItem(item);
  if (!out.updatedAt) out.updatedAt = nowIso();
  if (out.version === undefined) out.version = 1;
  return out;
}

// Build a dynamic SET update from a fields object (excluding 'id'),
// always stamping updatedAt and bumping version by 1. updatedAt/version
// are system-managed: caller-provided values are dropped so the SET list
// never assigns the same attribute twice (DynamoDB rejects that).
function buildUpdateParams(id, fields) {
  const clean = Object.assign({}, fields);
  delete clean.id;
  delete clean.updatedAt;
  delete clean.version;
  const names = Object.keys(clean);
  // Note: names may be empty (caller sent only system-managed fields).
  // The SET list below always stamps updatedAt + version, so the update
  // is still valid.

  const sets = names.map((f, i) => `#f${i} = :v${i}`);
  const ExpressionAttributeNames = {};
  const ExpressionAttributeValues = {};
  names.forEach((f, i) => {
    ExpressionAttributeNames[`#f${i}`] = f;
    ExpressionAttributeValues[`:v${i}`] = clean[f];
  });

  // updatedAt + version bump ride on every update.
  sets.push('#upd = :now');
  sets.push('#ver = if_not_exists(#ver, :zero) + :one');
  ExpressionAttributeNames['#upd'] = 'updatedAt';
  ExpressionAttributeNames['#ver'] = 'version';
  ExpressionAttributeValues[':now'] = nowIso();
  ExpressionAttributeValues[':zero'] = 0;
  ExpressionAttributeValues[':one'] = 1;

  return {
    TableName: TABLE,
    Key: { id },
    UpdateExpression: 'SET ' + sets.join(', '),
    ExpressionAttributeNames,
    ExpressionAttributeValues,
    ReturnValues: 'ALL_NEW',
    ConditionExpression: 'attribute_exists(id)',
  };
}

// POST /products/bulk handler: create-or-update each item by id.
// Returns per-item results so a retry resumes instead of restarting.
async function handleBulkImport(body) {
  const items = body && body.items;
  if (!Array.isArray(items) || items.length === 0) {
    return response(400, { error: 'Body must contain a non-empty "items" array' });
  }
  if (items.length > BULK_MAX_ITEMS) {
    return response(400, { error: `Max ${BULK_MAX_ITEMS} items per bulk call` });
  }

  const results = [];
  let created = 0;
  let updated = 0;
  let failed = 0;

  for (const raw of items) {
    const item = normalizeItem(raw || {});
    if (!item.id || typeof item.id !== 'string') {
      failed += 1;
      results.push({ id: (raw && raw.id) || null, action: null, status: 'error', error: 'Missing required field: id' });
      continue;
    }
    try {
      const existing = await ddb.send(new GetCommand({ TableName: TABLE, Key: { id: item.id } }));
      if (existing.Item) {
        const params = buildUpdateParams(item.id, stampNew(item));
        const res = await ddb.send(new UpdateCommand(params));
        updated += 1;
        results.push({ id: item.id, action: 'updated', status: 'ok', product: res.Attributes });
      } else {
        const fresh = stampNew(item);
        await ddb.send(new PutCommand({ TableName: TABLE, Item: fresh }));
        created += 1;
        results.push({ id: item.id, action: 'created', status: 'ok', product: fresh });
      }
    } catch (err) {
      console.error(`bulk import failed for ${item.id}:`, err);
      failed += 1;
      results.push({ id: item.id, action: null, status: 'error', error: err.message || 'Internal error' });
    }
  }

  return response(200, { created, updated, failed, results });
}

// POST /products/upsert handler: find by appscenic_product_id, create
// (id = asc-<appscenic_product_id>) or update. Idempotent by external id.
async function handleUpsert(body) {
  const externalId = body && body.appscenic_product_id;
  if (!externalId || typeof externalId !== 'string') {
    return response(400, { error: 'Missing required field: appscenic_product_id' });
  }

  const found = await ddb.send(new ScanCommand({
    TableName: TABLE,
    FilterExpression: 'appscenic_product_id = :apid',
    ExpressionAttributeValues: { ':apid': externalId },
  }));
  const matches = found.Items || [];

  if (matches.length > 0) {
    const existing = matches[0];
    const fields = normalizeItem(body);
    delete fields.appscenic_product_id; // already the join key; keep stored value
    const params = buildUpdateParams(existing.id, Object.assign(
      { appscenic_updated_at: nowIso() },
      fields
    ));
    const res = await ddb.send(new UpdateCommand(params));
    const out = { action: 'updated', id: existing.id, product: res.Attributes };
    if (matches.length > 1) {
      out.note = `${matches.length} products share this appscenic_product_id; first was updated`;
    }
    return response(200, out);
  }

  const id = (body.id && typeof body.id === 'string') ? body.id : `asc-${externalId}`;
  const fresh = stampNew(Object.assign(
    { source: 'appscenic', appscenic_product_id: externalId },
    normalizeItem(body),
    { id }
  ));
  await ddb.send(new PutCommand({ TableName: TABLE, Item: fresh }));
  return response(201, { action: 'created', id, product: fresh });
}

exports.handler = async (event) => {
  const method = event.httpMethod;
  const resource = event.resource;

  // OPTIONS preflight
  if (method === 'OPTIONS') {
    return response(200, {});
  }

  try {
    // GET /products — (2) ?source= & ?since= filters (since compares
    // appscenic_updated_at; items without that field are excluded when
    // since is used).
    if (method === 'GET' && resource === '/products') {
      const qs = event.queryStringParameters || {};
      const names = {};
      const values = {};
      const filters = [];
      if (qs.source) {
        names['#src'] = 'source';
        values[':src'] = qs.source;
        filters.push('#src = :src');
      }
      if (qs.since) {
        names['#updAt'] = 'appscenic_updated_at';
        values[':since'] = qs.since;
        filters.push('#updAt >= :since');
      }
      const scanParams = { TableName: TABLE };
      if (filters.length > 0) {
        scanParams.FilterExpression = filters.join(' AND ');
        scanParams.ExpressionAttributeNames = names;
        scanParams.ExpressionAttributeValues = values;
      }
      const result = await ddb.send(new ScanCommand(scanParams));
      return response(200, result.Items || []);
    }

    // GET /products/{id}
    if (method === 'GET' && resource === '/products/{id}') {
      const id = event.pathParameters && event.pathParameters.id;
      if (!id) {
        return response(400, { error: 'Missing product id' });
      }
      const result = await ddb.send(new GetCommand({ TableName: TABLE, Key: { id } }));
      if (!result.Item) {
        return response(404, { error: 'Product not found' });
      }
      return response(200, result.Item);
    }

    // POST /products/bulk — (3)
    if (method === 'POST' && resource === '/products/bulk') {
      if (!checkWriteAuth(event)) {
        return response(401, { error: 'Unauthorized: invalid or missing key' });
      }
      const body = JSON.parse(event.body || '{}');
      return handleBulkImport(body);
    }

    // POST /products/upsert — (4)
    if (method === 'POST' && resource === '/products/upsert') {
      if (!checkWriteAuth(event)) {
        return response(401, { error: 'Unauthorized: invalid or missing key' });
      }
      const body = JSON.parse(event.body || '{}');
      return handleUpsert(body);
    }

    // POST /products
    if (method === 'POST' && resource === '/products') {
      if (!checkWriteAuth(event)) {
        return response(401, { error: 'Unauthorized: invalid or missing key' });
      }
      const body = JSON.parse(event.body || '{}');
      if (!body.id) {
        return response(400, { error: 'Missing required field: id' });
      }
      const item = stampNew(body);
      await ddb.send(new PutCommand({ TableName: TABLE, Item: item }));
      return response(201, item);
    }

    // PUT /products/{id}
    if (method === 'PUT' && resource === '/products/{id}') {
      if (!checkWriteAuth(event)) {
        return response(401, { error: 'Unauthorized: invalid or missing key' });
      }
      const id = event.pathParameters && event.pathParameters.id;
      if (!id) {
        return response(400, { error: 'Missing product id' });
      }
      const body = JSON.parse(event.body || '{}');
      const normalized = normalizeItem(body);
      const updatable = Object.keys(normalized).filter(
        (k) => k !== 'id' && k !== 'updatedAt' && k !== 'version'
      );
      if (updatable.length === 0) {
        return response(400, { error: 'No fields to update' });
      }
      const params = buildUpdateParams(id, normalized);
      const result = await ddb.send(new UpdateCommand(params));
      return response(200, result.Attributes);
    }

    // DELETE /products/{id}
    if (method === 'DELETE' && resource === '/products/{id}') {
      if (!checkWriteAuth(event)) {
        return response(401, { error: 'Unauthorized: invalid or missing key' });
      }
      const id = event.pathParameters && event.pathParameters.id;
      if (!id) {
        return response(400, { error: 'Missing product id' });
      }

      // Check existence first
      const existing = await ddb.send(new GetCommand({ TableName: TABLE, Key: { id } }));
      if (!existing.Item) {
        return response(404, { error: 'Product not found' });
      }

      await ddb.send(new DeleteCommand({ TableName: TABLE, Key: { id } }));
      return response(200, { message: 'Product deleted', id });
    }

    return response(404, { error: 'Route not found' });
  } catch (err) {
    console.error('products handler error:', err);
    if (err.name === 'ConditionalCheckFailedException') {
      return response(404, { error: 'Product not found' });
    }
    return response(500, { error: 'Internal server error' });
  }
};
