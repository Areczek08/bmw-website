import { dbOne, dbRun } from "./db.js";

/**
 * Helper to enforce backend idempotency across financial operations.
 * Prevents double executions on retry, timeout, double-click, or network replay.
 */

export function extractIdempotencyKey(req, body = {}) {
  return req.headers.get("x-idempotency-key") || 
         req.headers.get("idempotency-key") || 
         body?.idempotencyKey || 
         null;
}

export async function checkIdempotency(key, dbInstance = null) {
  if (!key) return { isDuplicate: false };
  
  const runner = dbInstance || { one: dbOne };
  const record = await runner.one(
    "SELECT statusCode, responseBody FROM IdempotencyKey WHERE id = ?", 
    [key]
  );

  if (record) {
    try {
      const parsed = JSON.parse(record.responseBody);
      return { isDuplicate: true, statusCode: record.statusCode, response: parsed };
    } catch {
      return { isDuplicate: true, statusCode: record.statusCode, response: record.responseBody };
    }
  }

  return { isDuplicate: false };
}

export async function recordIdempotency(key, action, statusCode, responseBody, dbInstance = null) {
  if (!key) return;

  const runner = dbInstance || { run: dbRun };
  const stringified = typeof responseBody === "string" ? responseBody : JSON.stringify(responseBody);

  await runner.run(`
    INSERT INTO IdempotencyKey (id, action, statusCode, responseBody, createdAt)
    VALUES (?, ?, ?, ?, NOW())
    ON DUPLICATE KEY UPDATE 
      statusCode = VALUES(statusCode), 
      responseBody = VALUES(responseBody)
  `, [key, action, statusCode, stringified]);
}
