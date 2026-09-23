// Direct MariaDB client for Cloudflare Workers
// Optimized for connection reuse, single-session batching, and Hyperdrive compatibility
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

// Global connection metrics for observability
const dbStats = {
  connectionsOpened: 0,
  activeConnections: 0,
  queriesExecuted: 0
};

export function getDbStats() {
  return { ...dbStats };
}

/**
 * Get DB configuration.
 * Automatically checks for Cloudflare Hyperdrive connection strings first,
 * falling back to DATABASE_URL / DATABASE_URI / defaultDbUrl.
 */
export function getDbConfig() {
  const url = 
    process.env.HYPERDRIVE_URL || 
    process.env.HYPERDRIVE_CONNECTION_STRING || 
    (typeof globalThis !== "undefined" && globalThis.__env__?.HYPERDRIVE?.connectionString) ||
    process.env.DATABASE_URL || 
    process.env.DATABASE_URI || 
    defaultDbUrl;

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

export function sanitizeValue(val) {
  if (typeof val === 'bigint') return Number(val);
  if (val === null || typeof val !== 'object') return val;
  if (val instanceof Date) return val;
  if (typeof Buffer !== 'undefined' && Buffer.isBuffer(val)) return val;
  if (val instanceof Uint8Array || val instanceof ArrayBuffer) return val;
  if (Array.isArray(val)) return val.map(sanitizeValue);
  const cleaned = {};
  for (const key of Object.keys(val)) {
    cleaned[key] = sanitizeValue(val[key]);
  }
  return cleaned;
}

/**
 * Execute a database operation using a dedicated single connection session.
 * All queries executed within the callback reuse the exact same TCP socket,
 * eliminating N+1 connection handshakes.
 *
 * @param {Function} callback - async (session) => result
 * @returns {Promise<any>}
 */
export async function dbSession(callback) {
  let conn;
  dbStats.connectionsOpened++;
  dbStats.activeConnections++;
  try {
    conn = await mariadb.createConnection(getDbConfig());
    
    const session = {
      rawConn: conn,
      
      /** Query returning raw sanitized result */
      query: async (sql, params = []) => {
        dbStats.queriesExecuted++;
        const res = await conn.query(sql, params);
        return sanitizeValue(res);
      },

      /** Helper to fetch a single row */
      one: async (sql, params = []) => {
        dbStats.queriesExecuted++;
        const rows = await conn.query(sql, params);
        return rows && rows[0] ? sanitizeValue(rows[0]) : null;
      },

      /** Helper to fetch multiple rows */
      all: async (sql, params = []) => {
        dbStats.queriesExecuted++;
        const rows = await conn.query(sql, params);
        return Array.isArray(rows) ? sanitizeValue(Array.from(rows)) : [];
      },

      /** Helper to run an INSERT/UPDATE/DELETE */
      run: async (sql, params = []) => {
        dbStats.queriesExecuted++;
        const res = await conn.query(sql, params);
        return sanitizeValue(res);
      },

      /** Execute a block within an atomic database transaction */
      transaction: async (txCallback) => {
        await conn.beginTransaction();
        try {
          const txRes = await txCallback(session);
          await conn.commit();
          return txRes;
        } catch (txErr) {
          try { await conn.rollback(); } catch (e) {}
          throw txErr;
        }
      }
    };

    return await callback(session);
  } finally {
    dbStats.activeConnections--;
    if (conn) {
      try { await conn.end(); } catch (e) {}
    }
  }
}

/**
 * Legacy db helper: executes a function with a raw connection.
 */
export async function db(fn) {
  return dbSession(async (session) => {
    return await fn(session.rawConn);
  });
}

/**
 * Helper to get a single row
 */
export async function dbOne(sql, params = []) {
  return dbSession(async (session) => {
    return await session.one(sql, params);
  });
}

/**
 * Helper to get multiple rows
 */
export async function dbAll(sql, params = []) {
  return dbSession(async (session) => {
    return await session.all(sql, params);
  });
}

/**
 * Helper to execute an INSERT/UPDATE/DELETE
 */
export async function dbRun(sql, params = []) {
  return dbSession(async (session) => {
    return await session.run(sql, params);
  });
}
