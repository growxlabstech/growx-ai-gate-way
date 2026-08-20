import crypto from 'crypto';

export function normalizeSchema(schema: any): any {
  if (Array.isArray(schema)) {
    return schema.map(normalizeSchema);
  }
  if (schema !== null && typeof schema === 'object') {
    const keys = Object.keys(schema).sort();
    const result: any = {};
    for (const key of keys) {
      result[key] = normalizeSchema(schema[key]);
    }
    return result;
  }
  return schema;
}

export function computeSchemaHash(schema: any): string {
  const normalized = normalizeSchema(schema);
  const jsonStr = JSON.stringify(normalized);
  return crypto.createHash('sha256').update(jsonStr).digest('hex');
}

export function computeResponseFormatHash(responseFormat: any): string {
  const normalized = normalizeSchema(responseFormat);
  const jsonStr = JSON.stringify(normalized);
  return crypto.createHash('sha256').update(jsonStr).digest('hex');
}
