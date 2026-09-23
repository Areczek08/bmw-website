"use client";

import { useState } from "react";
import { Truck as TruckIcon, User, Settings } from "lucide-react";

export default function VehicleCard({ truck, priority = false }) {
  const [imgLoaded, setImgLoaded] = useState(false);
  const [imgError, setImgError] = useState(false);
  const [driverImgError, setDriverImgError] = useState(false);
  const [trailerImgError, setTrailerImgError] = useState(false);

  const imageVariants = truck.imageVariants;
  const hasImage = Boolean(imageVariants?.medium || truck.imageUrl);

  return (
    <div className="bg-zinc-900 border border-zinc-800 rounded-2xl overflow-hidden hover:border-zinc-700 transition-colors group flex flex-col h-full">
      {/* Image Container with stable height to prevent CLS */}
      <div className="h-48 bg-zinc-800/80 relative flex items-center justify-center overflow-hidden shrink-0">
        {/* Skeleton while loading */}
        {hasImage && !imgLoaded && !imgError && (
          <div className="absolute inset-0 bg-zinc-800 animate-pulse flex items-center justify-center">
            <TruckIcon size={40} className="text-zinc-700 opacity-40 animate-pulse" />
          </div>
        )}

        {hasImage && !imgError ? (
          <>
            <img
              src={imageVariants?.medium || truck.imageUrl}
              srcSet={imageVariants?.srcSet}
              sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 380px"
              alt={`${truck.brand} ${truck.model}`}
              loading={priority ? "eager" : "lazy"}
              decoding="async"
              fetchPriority={priority ? "high" : "auto"}
              onLoad={() => setImgLoaded(true)}
              onError={() => setImgError(true)}
              className={`w-full h-full object-cover group-hover:scale-105 transition-all duration-500 ${
                imgLoaded ? "opacity-100" : "opacity-0"
              }`}
            />
            <div className="absolute inset-0 bg-gradient-to-t from-zinc-950/80 via-transparent to-black/30 pointer-events-none" />
          </>
        ) : (
          /* Resilient Fallback SVG */
          <div className="w-full h-full flex flex-col items-center justify-center bg-zinc-900/60 relative">
            <div 
              className="absolute inset-0 opacity-10" 
              style={{ backgroundImage: 'radial-gradient(#fff 1px, transparent 1px)', backgroundSize: '10px 10px' }}
            />
            <TruckIcon size={56} className="text-zinc-700 group-hover:scale-110 transition-transform duration-500" />
            <span className="text-[11px] text-zinc-500 mt-2 font-mono uppercase tracking-wider">Brak podglądu</span>
          </div>
        )}

        {/* Fleet Badges */}
        <div className="absolute top-4 left-4 z-10 bg-zinc-950/80 backdrop-blur-md px-3 py-1 rounded-lg border border-zinc-700 text-white font-bold tracking-wider text-xs md:text-sm shadow-sm">
          {truck.fleetNumber}
        </div>

        <div className="absolute top-4 right-4 z-10 bg-blue-600/20 backdrop-blur-md text-blue-400 px-3 py-1 rounded-lg border border-blue-500/30 text-xs md:text-sm font-medium shadow-sm">
          {truck.plate}
        </div>
      </div>

      {/* Card Details */}
      <div className="p-5 md:p-6 flex flex-col flex-1 justify-between">
        <div>
          <h3 className="text-xl md:text-2xl font-bold text-white mb-1 tracking-tight">
            {truck.brand} {truck.model}
          </h3>
          <p className="text-zinc-500 text-xs md:text-sm mb-5 flex items-center gap-1.5">
            <Settings size={14} className="text-zinc-400 shrink-0" /> 
            <span>Pojazd spełnia normy E6</span>
          </p>
        </div>

        <div className="space-y-3 pt-2 border-t border-zinc-800/60">
          {/* Assigned Driver Row */}
          <div className="flex items-center gap-3 p-2.5 px-3 rounded-xl bg-zinc-950/70 border border-zinc-800/60">
            <div className="w-9 h-9 rounded-full bg-zinc-800 border border-zinc-700/60 flex items-center justify-center overflow-hidden shrink-0">
              {truck.assignedDriver?.image && !driverImgError ? (
                <img 
                  src={truck.assignedDriver.image} 
                  alt={truck.assignedDriver.name || "Kierowca"} 
                  loading="lazy" 
                  decoding="async"
                  onError={() => setDriverImgError(true)}
                  className="w-full h-full object-cover" 
                />
              ) : (
                <div className="w-full h-full flex items-center justify-center text-zinc-300 font-bold text-xs uppercase bg-zinc-800">
                  {(truck.assignedDriver?.name || "?").charAt(0)}
                </div>
              )}
            </div>
            <div className="min-w-0 flex-1">
              <div className="text-[11px] text-zinc-500 font-medium">Przypisany Kierowca</div>
              <div className="text-xs md:text-sm font-medium text-white truncate">
                {truck.assignedDriver ? truck.assignedDriver.name : "Brak przypisanego kierowcy"}
              </div>
            </div>
          </div>

          {/* Attached Trailer Row */}
          <div className="flex items-center gap-3 p-2.5 px-3 rounded-xl bg-zinc-950/70 border border-zinc-800/60">
            <div className="w-9 h-9 rounded-full bg-zinc-800 border border-zinc-700/60 flex items-center justify-center overflow-hidden shrink-0">
              {truck.attachedTrailer?.imageUrl && !trailerImgError ? (
                <img 
                  src={truck.attachedTrailer.imageUrl} 
                  alt="Naczepa" 
                  loading="lazy" 
                  decoding="async"
                  onError={() => setTrailerImgError(true)}
                  className="w-full h-full object-cover" 
                />
              ) : (
                <TruckIcon size={18} className="text-zinc-400" />
              )}
            </div>
            <div className="min-w-0 flex-1">
              <div className="text-[11px] text-zinc-500 font-medium">Naczepa</div>
              <div className="text-xs md:text-sm font-medium text-white truncate">
                {truck.attachedTrailer ? `${truck.attachedTrailer.brand} (${truck.attachedTrailer.plate})` : "Brak podpiętej naczepy"}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
