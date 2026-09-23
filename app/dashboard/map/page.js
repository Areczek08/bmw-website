"use client";

import dynamic from "next/dynamic";
import { MapPin, Radio, Wifi, WifiOff, RefreshCw } from "lucide-react";
import { useRealtimeMap } from "../../hooks/useRealtimeMap";

// Dynamiczny import mapy, aby wyłączyć Server-Side Rendering (wymóg Leaflet)
const MapComponent = dynamic(() => import("../../components/MapComponent"), {
  ssr: false,
  loading: () => (
    <div className="w-full h-full min-h-[500px] flex flex-col items-center justify-center bg-zinc-50 dark:bg-zinc-900/50 rounded-2xl border border-zinc-200 dark:border-zinc-800 animate-pulse">
      <MapPin className="w-12 h-12 text-zinc-300 dark:text-zinc-700 mb-4 animate-bounce" />
      <p className="text-zinc-500 font-medium">Ładowanie mapy satelitarnej...</p>
    </div>
  )
});

export default function MapPage() {
  const { drivers, status, lastUpdated, isLive } = useRealtimeMap();

  return (
    <div className="space-y-6 h-full flex flex-col">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Mapa Dyspozytorni</h1>
          <p className="text-zinc-500 dark:text-zinc-400 mt-1">
            Lokalizacja floty w czasie rzeczywistym na podstawie telemetrii i tras.
          </p>
        </div>

        {/* Realtime Connection Status Indicator */}
        <div className="flex items-center gap-2.5">
          {status === "LIVE" ? (
            <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-xs font-semibold tracking-wide">
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
              </span>
              <Radio size={13} className="shrink-0" />
              <span>LIVE REALTIME</span>
            </div>
          ) : status === "POLLING" ? (
            <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-amber-500/10 border border-amber-500/20 text-amber-400 text-xs font-semibold tracking-wide">
              <RefreshCw size={13} className="animate-spin shrink-0" />
              <span>POLLING FALLBACK (35s)</span>
            </div>
          ) : (
            <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-red-500/10 border border-red-500/20 text-red-400 text-xs font-semibold tracking-wide">
              <WifiOff size={13} className="shrink-0" />
              <span>OFFLINE</span>
            </div>
          )}

          {lastUpdated && (
            <span className="text-[11px] text-zinc-500 hidden md:inline">
              Aktualizacja: {lastUpdated.toLocaleTimeString('pl-PL')}
            </span>
          )}
        </div>
      </div>

      <div className="flex-1 w-full min-h-[600px] rounded-2xl shadow-sm relative">
        <MapComponent drivers={drivers} />
      </div>
    </div>
  );
}
