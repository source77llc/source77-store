'use strict';

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

  try {
    // GET /products
    if (method === 'GET' && resource === '/products') {
      const result = await ddb.send(new ScanCommand({ TableName: TABLE }));
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

    // POST /products
    if (method === 'POST' && resource === '/products') {
      if (!checkAdminKey(event)) {
        return response(401, { error: 'Unauthorized: invalid or missing admin key' });
      }
      const body = JSON.parse(event.body || '{}');
      if (!body.id) {
        return response(400, { error: 'Missing required field: id' });
      }
      await ddb.send(new PutCommand({ TableName: TABLE, Item: body }));
      return response(201, body);
    }

    // PUT /products/{id}
    if (method === 'PUT' && resource === '/products/{id}') {
      if (!checkAdminKey(event)) {
        return response(401, { error: 'Unauthorized: invalid or missing admin key' });
      }
      const id = event.pathParameters && event.pathParameters.id;
      if (!id) {
        return response(400, { error: 'Missing product id' });
      }
      const body = JSON.parse(event.body || '{}');

      // Build UpdateExpression dynamically from body fields (excluding 'id')
      const fields = Object.keys(body).filter((k) => k !== 'id');
      if (fields.length === 0) {
        return response(400, { error: 'No fields to update' });
      }

      const UpdateExpression =
        'SET ' + fields.map((f, i) => `#f${i} = :v${i}`).join(', ');
      const ExpressionAttributeNames = fields.reduce((acc, f, i) => {
        acc[`#f${i}`] = f;
        return acc;
      }, {});
      const ExpressionAttributeValues = fields.reduce((acc, f, i) => {
        acc[`:v${i}`] = body[f];
        return acc;
      }, {});

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
    }

    // DELETE /products/{id}
    if (method === 'DELETE' && resource === '/products/{id}') {
      if (!checkAdminKey(event)) {
        return response(401, { error: 'Unauthorized: invalid or missing admin key' });
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
