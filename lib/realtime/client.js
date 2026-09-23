/**
 * BMS Realtime WebSocket Client (BRP v1)
 * 
 * Features:
 * - Singleton connection manager (prevents duplicate sockets)
 * - Exponential backoff reconnect with random jitter (1s .. 30s)
 * - Heartbeat keepalive (ping every 30s, timeout after 60s)
 * - Typed event emitter for BRP v1 deltas
 * - Fallback status observer (CONNECTING, LIVE, POLLING, OFFLINE)
 */

class BmsRealtimeClient {
  constructor() {
    this.ws = null;
    this.status = "DISCONNECTED"; // DISCONNECTED, CONNECTING, LIVE, POLLING, OFFLINE
    this.listeners = new Map(); // eventType -> Set<callback>
    this.statusListeners = new Set();
    
    // Reconnect state
    this.reconnectAttempt = 0;
    this.reconnectTimer = null;
    this.pingTimer = null;
    this.pongTimeoutTimer = null;
    this.isExplicitlyClosed = false;

    // Visibility observer to avoid unnecessary reconnects when tab is hidden
    if (typeof window !== "undefined") {
      window.addEventListener("online", () => this.handleNetworkOnline());
      window.addEventListener("offline", () => this.handleNetworkOffline());
    }
  }

  setStatus(newStatus) {
    if (this.status === newStatus) return;
    this.status = newStatus;
    this.statusListeners.forEach(cb => {
      try { cb(newStatus); } catch (e) { console.error(e); }
    });
  }

  onStatusChange(cb) {
    this.statusListeners.add(cb);
    cb(this.status);
    return () => this.statusListeners.delete(cb);
  }

  on(eventType, callback) {
    if (!this.listeners.has(eventType)) {
      this.listeners.set(eventType, new Set());
    }
    this.listeners.get(eventType).add(callback);
    return () => this.off(eventType, callback);
  }

  off(eventType, callback) {
    if (this.listeners.has(eventType)) {
      this.listeners.get(eventType).delete(callback);
    }
  }

  emit(eventType, data) {
    const handlers = this.listeners.get(eventType);
    if (handlers) {
      handlers.forEach(cb => {
        try { cb(data); } catch (e) { console.error(`Error in event handler for ${eventType}:`, e); }
      });
    }
  }

  connect() {
    if (typeof window === "undefined") return;
    if (this.ws && (this.ws.readyState === WebSocket.OPEN || this.ws.readyState === WebSocket.CONNECTING)) {
      return; // Already active
    }

    if (!navigator.onLine) {
      this.setStatus("OFFLINE");
      return;
    }

    this.isExplicitlyClosed = false;
    this.clearTimers();
    this.setStatus("CONNECTING");

    const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
    const wsUrl = `${protocol}//${window.location.host}/api/ws`;

    try {
      this.ws = new WebSocket(wsUrl);

      this.ws.onopen = () => {
        this.reconnectAttempt = 0;
        this.setStatus("LIVE");
        this.startHeartbeat();

        // Subscribe to map channel by default
        this.send({ action: "subscribe", channel: "map" });
      };

      this.ws.onmessage = (event) => {
        this.resetPongTimeout();
        try {
          const data = JSON.parse(event.data);
          const type = data.type || data.action;
          if (type) {
            this.emit(type, data);
            this.emit("*", data);
          }
        } catch (e) {
          // Ignore unparsable non-JSON frame
        }
      };

      this.ws.onclose = (event) => {
        this.stopHeartbeat();
        this.ws = null;

        if (this.isExplicitlyClosed) {
          this.setStatus("DISCONNECTED");
        } else {
          this.setStatus("POLLING");
          this.scheduleReconnect();
        }
      };

      this.ws.onerror = () => {
        // Will trigger onclose automatically
      };
    } catch (err) {
      this.setStatus("POLLING");
      this.scheduleReconnect();
    }
  }

  send(data) {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      const payload = typeof data === "string" ? data : JSON.stringify(data);
      if (payload.length <= 512) {
        this.ws.send(payload);
        return true;
      } else {
        console.warn("[Realtime] Dropped outgoing frame: exceeds 512 bytes limit");
        return false;
      }
    }
    return false;
  }

  scheduleReconnect() {
    if (this.reconnectTimer || this.isExplicitlyClosed) return;

    this.reconnectAttempt++;
    // Exponential backoff: 1s, 2s, 4s, 8s, 16s, up to max 30s
    const baseDelay = Math.min(30000, 1000 * Math.pow(2, this.reconnectAttempt - 1));
    // Jitter +/- 20%
    const jitter = (0.8 + Math.random() * 0.4);
    const delay = Math.round(baseDelay * jitter);

    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      if (!this.isExplicitlyClosed) {
        this.connect();
      }
    }, delay);
  }

  startHeartbeat() {
    this.stopHeartbeat();
    this.pingTimer = setInterval(() => {
      if (this.ws && this.ws.readyState === WebSocket.OPEN) {
        this.send({ action: "ping" });
        this.pongTimeoutTimer = setTimeout(() => {
          // Missed pong for 30s after ping -> connection stale, force reconnect
          if (this.ws) {
            try { this.ws.close(4000, "Heartbeat timeout"); } catch (e) {}
          }
        }, 30000);
      }
    }, 30000);
  }

  resetPongTimeout() {
    if (this.pongTimeoutTimer) {
      clearTimeout(this.pongTimeoutTimer);
      this.pongTimeoutTimer = null;
    }
  }

  stopHeartbeat() {
    if (this.pingTimer) {
      clearInterval(this.pingTimer);
      this.pingTimer = null;
    }
    this.resetPongTimeout();
  }

  clearTimers() {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    this.stopHeartbeat();
  }

  handleNetworkOnline() {
    this.reconnectAttempt = 0;
    this.connect();
  }

  handleNetworkOffline() {
    this.setStatus("OFFLINE");
    this.disconnect();
  }

  disconnect() {
    this.isExplicitlyClosed = true;
    this.clearTimers();
    if (this.ws) {
      try { this.ws.close(1000, "User disconnected"); } catch (e) {}
      this.ws = null;
    }
    this.setStatus("DISCONNECTED");
  }
}

// Global browser singleton
export const realtimeClient = typeof window !== "undefined" 
  ? (window.__bmsRealtimeClient = window.__bmsRealtimeClient || new BmsRealtimeClient())
  : new BmsRealtimeClient();
