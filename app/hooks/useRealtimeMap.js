"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { realtimeClient } from "../../lib/realtime/client";

/**
 * Custom React Hook for Realtime Fleet Map (BRP v1)
 * 
 * Flow:
 * 1. Initial baseline fetch: GET /api/map
 * 2. Connect WebSocket to RealtimeHub
 * 3. If LIVE: listen to driver.location.updated & driver.presence deltas without full re-fetch
 * 4. If POLLING/DISCONNECTED: fallback to polite background polling (every 35s)
 */
export function useRealtimeMap() {
  const [drivers, setDrivers] = useState([]);
  const [status, setStatus] = useState("CONNECTING"); // "LIVE", "POLLING", "OFFLINE"
  const [lastUpdated, setLastUpdated] = useState(null);
  const isFetchingBaselineRef = useRef(false);
  const pollingTimerRef = useRef(null);

  // 1. Baseline fetch from /api/map
  const fetchBaseline = useCallback(async () => {
    if (isFetchingBaselineRef.current) return;
    isFetchingBaselineRef.current = true;
    try {
      const res = await fetch("/api/map");
      if (res.ok) {
        const data = await res.json();
        if (Array.isArray(data)) {
          setDrivers(data);
          setLastUpdated(new Date());
        }
      }
    } catch (err) {
      console.error("[RealtimeMap] Error fetching map baseline:", err);
    } finally {
      isFetchingBaselineRef.current = false;
    }
  }, []);

  // 2. Fallback polling setup
  const startPolling = useCallback(() => {
    if (pollingTimerRef.current) return;
    pollingTimerRef.current = setInterval(() => {
      if (typeof document !== "undefined" && document.visibilityState === "visible") {
        fetchBaseline();
      }
    }, 35000); // 35 seconds
  }, [fetchBaseline]);

  const stopPolling = useCallback(() => {
    if (pollingTimerRef.current) {
      clearInterval(pollingTimerRef.current);
      pollingTimerRef.current = null;
    }
  }, []);

  useEffect(() => {
    // A. Initial load
    fetchBaseline();

    // B. Realtime connection
    realtimeClient.connect();

    // C. Status observer
    const unsubscribeStatus = realtimeClient.onStatusChange((newStatus) => {
      setStatus(newStatus);
      if (newStatus === "LIVE") {
        stopPolling();
      } else if (newStatus === "POLLING" || newStatus === "DISCONNECTED") {
        startPolling();
      } else if (newStatus === "OFFLINE") {
        stopPolling();
      }
    });

    // D. Realtime Delta: driver.location.updated
    const unsubscribeLocation = realtimeClient.on("driver.location.updated", (delta) => {
      if (!delta?.driverId) return;

      setDrivers((prev) => {
        let found = false;
        const updated = prev.map((d) => {
          if (d.id === delta.driverId) {
            found = true;
            return {
              ...d,
              lastCoords: [delta.lat, delta.lng],
              lastCity: delta.city || d.lastCity,
              speed: delta.speed !== undefined ? delta.speed : d.speed,
              truck: delta.truck || d.truck,
              truckMileage: delta.truckMileage !== undefined ? delta.truckMileage : d.truckMileage,
              lastJobDate: delta.lastJobDate || (delta.ts ? new Date(delta.ts * 1000).toISOString() : d.lastJobDate)
            };
          }
          return d;
        });

        // If driver wasn't in baseline yet, trigger a background refresh
        if (!found) {
          fetchBaseline();
        }

        return updated;
      });

      setLastUpdated(new Date());
    });

    // E. Realtime Delta: driver.presence
    const unsubscribePresence = realtimeClient.on("driver.presence", (delta) => {
      if (!delta?.driverId) return;
      setDrivers((prev) =>
        prev.map((d) => (d.id === delta.driverId ? { ...d, isOnline: delta.isOnline } : d))
      );
    });

    // F. Visibility change handler
    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible" && status === "POLLING") {
        fetchBaseline();
      }
    };
    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      unsubscribeStatus();
      unsubscribeLocation();
      unsubscribePresence();
      stopPolling();
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [fetchBaseline, startPolling, stopPolling]);

  return {
    drivers,
    status,
    lastUpdated,
    isLive: status === "LIVE"
  };
}
