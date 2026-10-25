'use strict';

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

const VALID_STATUSES = ['new', 'shipped', 'picked up'];

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

function checkAdminKey(event) {
  const key = event.headers && (event.headers['x-admin-key'] || event.headers['X-Admin-Key']);
  return key === ADMIN_KEY;
}

exports.handler = async (event) => {
  const method = event.httpMethod;
  const resource = event.resource;

  // OPTIONS preflight
  if (method === 'OPTIONS') {
    return response(200, {});
  }

  // All routes require admin key
  if (!checkAdminKey(event)) {
    return response(401, { error: 'Unauthorized: invalid or missing admin key' });
  }

  try {
    // GET /orders
    if (method === 'GET' && resource === '/orders') {
      const result = await ddb.send(new ScanCommand({ TableName: TABLE }));
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

    // PATCH /orders/{id}
    if (method === 'PATCH' && resource === '/orders/{id}') {
      const id = event.pathParameters && event.pathParameters.id;
      if (!id) {
        return response(400, { error: 'Missing order id' });
      }

      const body = JSON.parse(event.body || '{}');
      const { status } = body;

      if (!status) {
        return response(400, { error: 'Missing required field: status' });
      }
      if (!VALID_STATUSES.includes(status)) {
        return response(400, {
          error: `Invalid status. Must be one of: ${VALID_STATUSES.join(', ')}`,
        });
      }

      try {
        const result = await ddb.send(
          new UpdateCommand({
            TableName: TABLE,
            Key: { id },
            UpdateExpression: 'SET #s = :status',
            ExpressionAttributeNames: { '#s': 'status' },
            ExpressionAttributeValues: { ':status': status },
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
