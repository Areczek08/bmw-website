// Direct MariaDB driver for Cloudflare Workers
// Prisma WASM + adapter-mariadb hangs on CF Workers (TCP socket issues)
// Using raw mariadb driver with per-request connections (same approach as NextAuth route)
import mariadb from "mariadb";

/**
 * Generate a CUID-like unique ID (compatible with Prisma's @default(cuid()))
 */
export function generateId() {
  const timestamp = Date.now().toString(36);
  const randomBytes = new Array(12).fill(0).map(() => Math.floor(Math.random() * 36).toString(36)).join('');
  return 'c' + timestamp + randomBytes;
}

const defaultDbUrl = "mysql://www13461_bojarsystemweb:lgeKyRxxxMF6XWKv8ALd@54.38.50.59:3306/www13461_bojarsystemweb";

function getDbConfig() {
  const url = process.env.DATABASE_URL || process.env.DATABASE_URI || defaultDbUrl;
  const parsed = new URL(url.replace(/^mysql:\/\//, "http://").replace(/^mariadb:\/\//, "http://"));
  return {
    host: parsed.hostname,
    port: parseInt(parsed.port || "3306", 10),
    user: decodeURIComponent(parsed.username),
    password: decodeURIComponent(parsed.password),
    database: parsed.pathname.replace(/^\//, ""),
    connectTimeout: 5000,
    socketTimeout: 10000,
    bigIntAsNumber: true,
    insertIdAsNumber: true,
  };
}

function sanitizeValue(val) {
  if (typeof val === 'bigint') return Number(val);
  if (val !== null && typeof val === 'object' && !(val instanceof Date)) {
    if (Array.isArray(val)) return val.map(sanitizeValue);
    const cleaned = {};
    for (const key of Object.keys(val)) {
      cleaned[key] = sanitizeValue(val[key]);
    }
    return cleaned;
  }
  return val;
}

/**
 * Execute a database operation with automatic connection management.
 * Creates a fresh connection per request and closes it after.
 */
export async function db(fn) {
  let conn;
  try {
    conn = await mariadb.createConnection(getDbConfig());
    const result = await fn(conn);
    return sanitizeValue(result);
  } finally {
    if (conn) {
      try { await conn.end(); } catch (e) {}
    }
  }
}

/**
 * Helper to get a single row
 */
export async function dbOne(sql, params = []) {
  return db(async (conn) => {
    const rows = await conn.query(sql, params);
    return rows && rows[0] ? rows[0] : null;
  });
}

/**
 * Helper to get multiple rows
 */
export async function dbAll(sql, params = []) {
  return db(async (conn) => {
    const rows = await conn.query(sql, params);
    return Array.isArray(rows) ? Array.from(rows) : [];
  });
}

/**
 * Helper to execute an INSERT/UPDATE/DELETE
 */
export async function dbRun(sql, params = []) {
  return db(async (conn) => {
    return await conn.query(sql, params);
  });
}

