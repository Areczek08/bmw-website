import { jwtVerify } from "jose";
import { DurableObject } from "cloudflare:workers";

/**
 * RealtimeHub — Cloudflare Durable Object for BMS Realtime Architecture (BRP v1)
 * 
 * Features:
 * - WebSocket Hibernation API (zero-CPU idle)
 * - Zero Trust authentication via NextAuth JWT
 * - Server-enforced identity (driver cannot fake another driverId)
 * - Flood protection: 512B max frame, 1 update / 3s rate limiting
 * - Coordinate sanity checking
 * - MariaDB is Source of Truth (zero SQL queries for ephemeral location reports)
 */
export class RealtimeHub extends DurableObject {
  constructor(ctx, env) {
    super(ctx, env);
    this.ctx = ctx;
    this.env = env;
    // Ephemeral in-memory state: driverId -> latest delta
    this.latestDriverLocations = new Map();
    // In-memory rate limiting: driverId -> timestamp ms
    this.driverRateLimits = new Map();
  }

  /**
   * Extract NextAuth session token from Cookie header or query param
   */
  extractSessionToken(request) {
    const cookieHeader = request.headers.get("Cookie") || request.headers.get("cookie");
    if (cookieHeader) {
      const cookies = Object.fromEntries(
        cookieHeader.split(";").map(c => {
          const parts = c.trim().split("=");
          const key = parts[0];
          const val = parts.slice(1).join("=");
          return [key, decodeURIComponent(val || "")];
        })
      );
      const token = cookies["__Secure-next-auth.session-token"] || cookies["next-auth.session-token"];
      if (token) return token;
    }

    const url = new URL(request.url);
    const queryToken = url.searchParams.get("token");
    if (queryToken) return queryToken;

    return null;
  }

  /**
   * Verify session token using NEXTAUTH_SECRET (HS256)
   */
  async authenticate(request) {
    const token = this.extractSessionToken(request);
    if (!token) {
      return { authenticated: false, status: 401, error: "Brak tokenu sesji (unauthenticated)" };
    }

    const secretStr = this.env?.NEXTAUTH_SECRET || process.env?.NEXTAUTH_SECRET || "VtcBMS2026_9x!2Zq$8pL#1vN@3mK_BojarSystem";
    const secretKey = new TextEncoder().encode(secretStr);

    try {
      const { payload } = await jwtVerify(token, secretKey);
      if (!payload || !payload.id) {
        return { authenticated: false, status: 401, error: "Nieprawidłowy token sesji" };
      }

      const role = payload.role || "DRIVER";
      const driverStatus = payload.driverStatus || "ACTIVE";

      // Block inactive or pending accounts
      if (["WAITING_FOR_APPROVAL", "SUSPENDED", "INACTIVE"].includes(driverStatus)) {
        return {
          authenticated: false,
          status: 403,
          error: `Brak uprawnień: status konta to ${driverStatus}`
        };
      }

      return {
        authenticated: true,
        user: {
          id: payload.id,
          role: role,
          driverStatus: driverStatus,
          companyId: payload.companyId || "BMS",
          name: payload.name || payload.firstName || "Kierowca"
        }
      };
    } catch (err) {
      return { authenticated: false, status: 401, error: "Błąd weryfikacji podpisu JWT" };
    }
  }

  /**
   * HTTP Fetch Handler for Durable Object
   */
  async fetch(request) {
    const url = new URL(request.url);

    // 1. Internal broadcast endpoint (e.g. from TrucksBook webhook)
    if (url.pathname.endsWith("/broadcast") || url.pathname.endsWith("/realtime-broadcast")) {
      try {
        const payload = await request.json();
        const channel = payload.channel || "map";
        delete payload.channel;

        // Cache latest position if applicable
        if (payload.type === "driver.location.updated" && payload.driverId) {
          this.latestDriverLocations.set(payload.driverId, payload);
        }

        this.broadcast(payload, channel);
        return new Response(JSON.stringify({ success: true }), {
          headers: { "Content-Type": "application/json" }
        });
      } catch (err) {
        return new Response(JSON.stringify({ success: false, error: err.message }), { status: 400 });
      }
    }

    // 2. WebSocket upgrade endpoint
    const upgradeHeader = request.headers.get("Upgrade");
    if (!upgradeHeader || upgradeHeader.toLowerCase() !== "websocket") {
      return new Response(JSON.stringify({
        name: "RealtimeHub",
        status: "ONLINE",
        protocol: "BRP v1",
        hibernation: true
      }), {
        status: 200,
        headers: { "Content-Type": "application/json" }
      });
    }

    // Authenticate user
    const authResult = await this.authenticate(request);
    if (!authResult.authenticated) {
      return new Response(JSON.stringify({ error: authResult.error }), {
        status: authResult.status || 401,
        headers: { "Content-Type": "application/json" }
      });
    }

    const { user } = authResult;

    // Create WebSocket pair (Cloudflare Workers global or fallback)
    const PairClass = typeof WebSocketPair !== "undefined" 
      ? WebSocketPair 
      : class { constructor() { this[0] = { send() {}, close() {} }; this[1] = { send() {}, close() {} }; } };
    const webSocketPair = new PairClass();
    const [clientWs, serverWs] = Object.values(webSocketPair);

    // Tags for hibernation routing
    const tags = [
      `user:${user.id}`,
      `role:${user.role}`,
      `company:${user.companyId}`,
      "map"
    ];

    // Store attachment for fast access during message handlers
    const attachment = {
      userId: user.id,
      role: user.role,
      companyId: user.companyId,
      name: user.name
    };

    if (serverWs.serializeAttachment) {
      serverWs.serializeAttachment(attachment);
    } else {
      serverWs._attachment = attachment;
    }

    // Register with WebSocket Hibernation API
    if (this.ctx && typeof this.ctx.acceptWebSocket === "function") {
      this.ctx.acceptWebSocket(serverWs, tags);
    }

    // Send welcome message
    serverWs.send(JSON.stringify({
      type: "system.welcome",
      userId: user.id,
      role: user.role,
      serverTime: Date.now()
    }));

    // Broadcast driver presence if driver role
    if (user.role === "DRIVER") {
      this.broadcast({
        type: "driver.presence",
        driverId: user.id,
        isOnline: true,
        ts: Math.floor(Date.now() / 1000)
      }, "map");
    }

    try {
      return new Response(null, {
        status: 101,
        webSocket: clientWs
      });
    } catch (err) {
      // In standard Node.js undici, status 101 throws RangeError (200-599 only)
      // while Cloudflare Workers runtime explicitly supports status 101
      return {
        status: 101,
        webSocket: clientWs,
        headers: new Headers()
      };
    }
  }

  /**
   * Helper to retrieve attachment
   */
  getAttachment(ws) {
    if (ws.deserializeAttachment) {
      try {
        return ws.deserializeAttachment() || {};
      } catch (e) {
        return {};
      }
    }
    return ws._attachment || {};
  }

  /**
   * WebSocket Hibernation Event: Incoming Message
   */
  async webSocketMessage(ws, message) {
    // 1. FRAME SIZE LIMIT: Max 512 bytes
    const messageLen = typeof message === "string" ? message.length : message.byteLength;
    if (messageLen > 512) {
      try {
        ws.close(1009, "Message Too Big (max 512 bytes)");
      } catch (e) {}
      return;
    }

    // 2. Parse JSON
    let data;
    try {
      data = JSON.parse(typeof message === "string" ? message : new TextDecoder().decode(message));
    } catch (e) {
      // Invalid format, ignore
      return;
    }

    const session = this.getAttachment(ws);
    const action = data.action || data.type;

    // 3. Keepalive / Ping
    if (action === "ping") {
      try {
        ws.send(JSON.stringify({ type: "pong", ts: Date.now() }));
      } catch (e) {}
      return;
    }

    // 4. Channel Subscription
    if (action === "subscribe") {
      try {
        ws.send(JSON.stringify({ type: "system.subscribed", channel: data.channel || "map" }));
      } catch (e) {}
      return;
    }

    // 5. Driver Location Report (BRP v1)
    if (action === "report_location") {
      // SECURITY / ZERO TRUST: Force driverId from authenticated session!
      const driverId = session.userId;
      if (!driverId) return;

      // FLOOD PROTECTION / RATE LIMIT: Max 1 update / 3 seconds / driver
      const now = Date.now();
      const lastUpdate = this.driverRateLimits.get(driverId) || 0;
      if (now - lastUpdate < 3000) {
        // Drop excessive updates silently to protect CPU and bandwidth
        return;
      }
      this.driverRateLimits.set(driverId, now);

      // SANITY CHECKS ON COORDINATES
      const { lat, lng, speed, heading, city, ts } = data;

      if (typeof lat !== "number" || isNaN(lat) || !isFinite(lat) || lat < -90 || lat > 90) {
        return;
      }
      if (typeof lng !== "number" || isNaN(lng) || !isFinite(lng) || lng < -180 || lng > 180) {
        return;
      }

      // Timestamp check: discard if older/future by > 30 seconds
      if (typeof ts === "number") {
        const diff = Math.abs(now - (ts * 1000));
        if (diff > 30000) return;
      }

      const sanitizedSpeed = typeof speed === "number" && speed >= 0 && speed <= 250 ? Math.round(speed) : 0;
      const sanitizedHeading = typeof heading === "number" && heading >= 0 && heading <= 360 ? Math.round(heading) : 0;
      const sanitizedCity = typeof city === "string" ? city.slice(0, 50).trim() : null;

      const delta = {
        type: "driver.location.updated",
        driverId: driverId,
        lat: Number(lat.toFixed(6)),
        lng: Number(lng.toFixed(6)),
        speed: sanitizedSpeed,
        heading: sanitizedHeading,
        city: sanitizedCity,
        ts: Math.floor(now / 1000)
      };

      // Ephemeral storage in RAM (Source of truth remains MariaDB)
      this.latestDriverLocations.set(driverId, delta);

      // Broadcast to map subscribers
      this.broadcast(delta, "map");
      return;
    }
  }

  /**
   * WebSocket Hibernation Event: Connection Closed
   */
  async webSocketClose(ws, code, reason, wasClean) {
    const session = this.getAttachment(ws);
    if (session?.userId && session?.role === "DRIVER") {
      // Check if driver has any other active connections
      let remaining = [];
      if (this.ctx && typeof this.ctx.getWebSockets === "function") {
        remaining = this.ctx.getWebSockets(`user:${session.userId}`) || [];
      }

      if (remaining.length <= 1) {
        this.broadcast({
          type: "driver.presence",
          driverId: session.userId,
          isOnline: false,
          ts: Math.floor(Date.now() / 1000)
        }, "map");
      }
    }
  }

  /**
   * WebSocket Hibernation Event: Error
   */
  async webSocketError(ws, error) {
    try {
      ws.close(1011, "Unexpected server error");
    } catch (e) {}
  }

  /**
   * Broadcast message to connected WebSockets (tagged or all)
   */
  broadcast(data, tag = null) {
    const payload = typeof data === "string" ? data : JSON.stringify(data);
    let sockets = [];

    if (this.ctx && typeof this.ctx.getWebSockets === "function") {
      sockets = tag ? this.ctx.getWebSockets(tag) : this.ctx.getWebSockets();
    }

    for (const ws of sockets) {
      try {
        ws.send(payload);
      } catch (e) {
        // Socket disconnected or failed, hibernation manager handles cleanup
      }
    }
  }
}
