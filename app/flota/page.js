import { dbAll } from "../../lib/db";
import { Truck as TruckIcon, User, Settings, Info, MapPin } from "lucide-react";

export const dynamic = "force-dynamic";

export default async function FlotaPage() {
  let trucks = [];
  try {
    const rawTrucks = await dbAll("SELECT id, brand, model, plate, fleetNumber, imageUrl, assignedDriverId, attachedTrailerId FROM Truck ORDER BY fleetNumber ASC");
    
    // Fetch assigned drivers
    const driverIds = rawTrucks.filter(t => t.assignedDriverId).map(t => t.assignedDriverId);
    let drivers = [];
    if (driverIds.length > 0) {
      drivers = await dbAll(`SELECT id, name, image FROM User WHERE id IN (${driverIds.map(() => '?').join(',')})`, driverIds);
    }
    
    // Fetch attached trailers
    const trailerIds = rawTrucks.filter(t => t.attachedTrailerId).map(t => t.attachedTrailerId);
    let trailers = [];
    if (trailerIds.length > 0) {
      trailers = await dbAll(`SELECT id, brand, plate, imageUrl FROM Trailer WHERE id IN (${trailerIds.map(() => '?').join(',')})`, trailerIds);
    }
    
    trucks = rawTrucks.map(t => ({
      ...t,
      assignedDriver: drivers.find(d => d.id === t.assignedDriverId) || null,
      attachedTrailer: trailers.find(tr => tr.id === t.attachedTrailerId) || null,
    }));
  } catch (error) {
    console.error("Błąd pobierania floty:", error);
  }

  return (
    <div className="flex flex-col w-full min-h-screen bg-zinc-950 pb-20">
      <section className="pt-32 pb-16 px-4">
        <div className="max-w-7xl mx-auto text-center">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-zinc-900 border border-zinc-800 text-zinc-300 text-sm font-medium mb-6">
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-blue-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2 w-2 bg-blue-500"></span>
            </span>
            Na żywo z Bojar Manager System
          </div>
          <h1 className="text-4xl md:text-6xl font-bold text-white mb-6">Nasza Flota</h1>
          <p className="text-xl text-zinc-400 mb-8">
            Poniżej znajduje się lista wszystkich naszych pojazdów, zintegrowana w czasie rzeczywistym z systemem Bojar Manager.
          </p>
          <div className="inline-flex items-center gap-2 px-4 py-2 bg-zinc-900 border border-zinc-800 rounded-full text-sm font-medium text-zinc-300">
            <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse"></span>
            Powered by BMS 3.06.01
          </div>
        </div>
      </section>

      <section className="px-4">
        <div className="max-w-7xl mx-auto">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {trucks.map((truck) => (
              <div key={truck.id} className="bg-zinc-900 border border-zinc-800 rounded-2xl overflow-hidden hover:border-zinc-700 transition-colors group">
                <div className="h-48 bg-zinc-800 relative flex items-center justify-center overflow-hidden">
                  {truck.imageUrl ? (
                    <>
                      <img
                        src={truck.imageUrl}
                        alt={`${truck.brand} ${truck.model}`}
                        className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                      />
                      <div className="absolute inset-0 bg-gradient-to-t from-zinc-950/80 via-transparent to-black/30 pointer-events-none" />
                    </>
                  ) : (
                    <>
                      <div className="absolute inset-0 opacity-10" style={{ backgroundImage: 'radial-gradient(#fff 1px, transparent 1px)', backgroundSize: '10px 10px' }}></div>
                      <TruckIcon size={64} className="text-zinc-700 group-hover:scale-110 transition-transform duration-500" />
                    </>
                  )}
                  
                  <div className="absolute top-4 left-4 z-10 bg-zinc-950/80 backdrop-blur-md px-3 py-1 rounded-lg border border-zinc-700 text-white font-bold tracking-wider">
                    {truck.fleetNumber}
                  </div>
                  
                  <div className="absolute top-4 right-4 z-10 bg-blue-600/20 backdrop-blur-md text-blue-400 px-3 py-1 rounded-lg border border-blue-500/30 text-sm font-medium">
                    {truck.plate}
                  </div>
                </div>
                
                <div className="p-6">
                  <h3 className="text-2xl font-bold text-white mb-1">{truck.brand} {truck.model}</h3>
                  <p className="text-zinc-500 text-sm mb-6 flex items-center gap-1">
                    <Settings size={14} /> Pojazd spełnia normy E6
                  </p>
                  
                  <div className="space-y-4">
                    <div className="flex items-center gap-3 p-3 rounded-xl bg-zinc-950 border border-zinc-800/50">
                      <div className="w-10 h-10 rounded-full bg-zinc-800 flex items-center justify-center overflow-hidden">
                        {truck.assignedDriver?.image ? (
                          <img src={truck.assignedDriver.image} alt="Kierowca" className="w-full h-full object-cover" />
                        ) : (
                          <User size={20} className="text-zinc-400" />
                        )}
                      </div>
                      <div>
                        <div className="text-xs text-zinc-500 mb-0.5">Przypisany Kierowca</div>
                        <div className="text-sm font-medium text-white">{truck.assignedDriver ? truck.assignedDriver.name : "Brak przypisanego kierowcy"}</div>
                      </div>
                    </div>
                    
                    <div className="flex items-center gap-3 p-3 rounded-xl bg-zinc-950 border border-zinc-800/50">
                      <div className="w-10 h-10 rounded-full bg-zinc-800 flex items-center justify-center overflow-hidden">
                        {truck.attachedTrailer?.imageUrl ? (
                          <img src={truck.attachedTrailer.imageUrl} alt="Naczepa" className="w-full h-full object-cover" />
                        ) : (
                          <TruckIcon size={20} className="text-zinc-400" />
                        )}
                      </div>
                      <div>
                        <div className="text-xs text-zinc-500 mb-0.5">Naczepa</div>
                        <div className="text-sm font-medium text-white">
                          {truck.attachedTrailer ? `${truck.attachedTrailer.brand} (${truck.attachedTrailer.plate})` : "Brak podpiętej naczepy"}
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            ))}
            
            {trucks.length === 0 && (
              <div className="col-span-full py-20 text-center text-zinc-500">
                <Info size={48} className="mx-auto mb-4 opacity-50" />
                <p className="text-lg">Brak przypisanych pojazdów w systemie BMS.</p>
              </div>
            )}
          </div>
        </div>
      </section>
    </div>
  );
}
