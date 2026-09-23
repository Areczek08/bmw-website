/**
 * Server-side helper to broadcast realtime events to RealtimeHub Durable Object.
 * 
 * Rules:
 * 1. MariaDB is always written first (Source of Truth).
 * 2. If the broadcast fails (e.g. during local test or worker failure), 
 *    the error is caught and logged; the MariaDB transaction is NEVER compromised.
 */

export async function broadcastRealtimeEvent(event, channel = "map") {
  try {
    // 1. Try accessing Cloudflare environment via OpenNext context
    try {
      const { getCloudflareContext } = await import("@opennextjs/cloudflare");
      const ctx = getCloudflareContext();
      if (ctx?.env?.REALTIME_HUB) {
        const id = ctx.env.REALTIME_HUB.idFromName("bms-global");
        const stub = ctx.env.REALTIME_HUB.get(id);
        const res = await stub.fetch(new Request("http://internal/broadcast", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ...event, channel })
        }));
        return res.ok;
      }
    } catch (e) {
      // Not in Cloudflare runtime or bindings not present
    }

    // 2. Try global worker env if set
    if (typeof globalThis !== "undefined" && globalThis.__BMS_WORKER_ENV?.REALTIME_HUB) {
      const id = globalThis.__BMS_WORKER_ENV.REALTIME_HUB.idFromName("bms-global");
      const stub = globalThis.__BMS_WORKER_ENV.REALTIME_HUB.get(id);
      const res = await stub.fetch(new Request("http://internal/broadcast", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...event, channel })
      }));
      return res.ok;
    }

    return false;
  } catch (err) {
    console.error("[Realtime] Non-critical error dispatching event:", err);
    return false;
  }
}
