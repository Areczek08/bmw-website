import fs from "node:fs";
import openNextHandler from "./.open-next/worker.js";

if (typeof process !== "undefined") {
  try {
    if (!process.version || process.version === "") {
      Object.defineProperty(process, 'version', { value: 'v20.18.0', configurable: true });
    }
    if (process.versions && !process.versions.node) {
      Object.defineProperty(process.versions, 'node', { value: '20.18.0', configurable: true });
    }
  } catch (e) {}
}

try {
  if (fs) {
    fs.readdir = (path, options, callback) => {
      const cb = typeof options === 'function' ? options : callback;
      if (cb) cb(null, []);
      return Promise.resolve([]);
    };
    fs.readdirSync = () => [];
    if (fs.promises) {
      fs.promises.readdir = async () => [];
    }
  }
} catch (e) {}

try {
  if (typeof crypto !== "undefined") {
    delete crypto.hkdf;
    delete crypto.hkdfSync;
  }
} catch (e) {}

// Export Durable Object class for Cloudflare Worker runtime
export { RealtimeHub } from "./lib/realtime/RealtimeHub.js";

// Re-export OpenNext assets & helpers
export * from "./.open-next/worker.js";

// Wrapper fetch handler: intercepts /api/ws and internal broadcast, delegates remainder to OpenNext
export default {
  async fetch(request, env, ctx) {
    if (typeof globalThis !== "undefined") {
      globalThis.__BMS_WORKER_ENV = env;
    }

    const url = new URL(request.url);

    // WebSocket upgrade endpoint for BMS Realtime
    if (url.pathname === "/api/ws") {
      if (env?.REALTIME_HUB) {
        const id = env.REALTIME_HUB.idFromName("bms-global");
        return env.REALTIME_HUB.get(id).fetch(request);
      }
      return new Response("RealtimeHub Durable Object binding is missing", { status: 503 });
    }

    // Internal broadcast route
    if (url.pathname === "/api/internal/realtime-broadcast") {
      if (env?.REALTIME_HUB) {
        const id = env.REALTIME_HUB.idFromName("bms-global");
        return env.REALTIME_HUB.get(id).fetch(request);
      }
      return new Response(JSON.stringify({ success: false, error: "RealtimeHub not bound" }), { status: 503 });
    }

    return openNextHandler.fetch(request, env, ctx);
  }
};
