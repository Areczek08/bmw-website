import { dbSession } from "../../lib/db";
import { getSafeAvatarUrl } from "../../lib/avatar";
import { getVehicleImageVariants } from "../../lib/fleetImage";
import VehicleCard from "../components/VehicleCard";
import { Info } from "lucide-react";

// Edge CDN caching: revalidate every 60 seconds to avoid hitting MariaDB on every public visit
export const revalidate = 60;

export default async function FlotaPage() {
  let trucks = [];
  try {
    await dbSession(async (db) => {
      const rawTrucks = await db.all(
        "SELECT id, brand, model, plate, fleetNumber, imageUrl, assignedDriverId, attachedTrailerId FROM Truck ORDER BY fleetNumber ASC"
      );
      
      // Fetch assigned drivers with safe avatar resolution (no Base64 blobs)
      const driverIds = rawTrucks.filter(t => t.assignedDriverId).map(t => t.assignedDriverId);
      let drivers = [];
      if (driverIds.length > 0) {
        const placeholders = driverIds.map(() => '?').join(',');
        drivers = await db.all(
          `SELECT id, name, firstName, discordNick, image FROM User WHERE id IN (${placeholders})`,
          driverIds
        );
      }
      
      // Fetch attached trailers
      const trailerIds = rawTrucks.filter(t => t.attachedTrailerId).map(t => t.attachedTrailerId);
      let trailers = [];
      if (trailerIds.length > 0) {
        const placeholders = trailerIds.map(() => '?').join(',');
        trailers = await db.all(
          `SELECT id, brand, plate, imageUrl FROM Trailer WHERE id IN (${placeholders})`,
          trailerIds
        );
      }
      
      trucks = rawTrucks.map(t => {
        const driver = drivers.find(d => d.id === t.assignedDriverId);
        const trailer = trailers.find(tr => tr.id === t.attachedTrailerId);

        return {
          ...t,
          imageVariants: getVehicleImageVariants(t.imageUrl),
          assignedDriver: driver ? {
            id: driver.id,
            name: driver.discordNick || driver.name || driver.firstName || "Kierowca",
            image: getSafeAvatarUrl(driver)
          } : null,
          attachedTrailer: trailer ? {
            id: trailer.id,
            brand: trailer.brand,
            plate: trailer.plate,
            imageUrl: trailer.imageUrl
          } : null,
        };
      });
    });
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
          <p className="text-xl text-zinc-400 mb-8 max-w-3xl mx-auto">
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
            {trucks.map((truck, idx) => (
              <VehicleCard 
                key={truck.id} 
                truck={truck} 
                priority={idx < 6} 
              />
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
