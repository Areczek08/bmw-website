import { NextResponse } from "next/server";
import { dbSession } from "../../../lib/db";
import { getSafeAvatarUrl } from "../../../lib/avatar";
import { getCoords } from "../../../lib/coords";

export async function GET(req) {
  try {
    return await dbSession(async (db) => {
      // 1. Fetch only required driver columns; resolve safe image URL directly in SQL without loading huge Base64 strings
      const drivers = await db.all(`
        SELECT id, name, firstName, discordNick,
               IF(image IS NOT NULL AND image != '', 
                  IF(image LIKE 'http%' OR image LIKE '/%', image, CONCAT('/api/user/', id, '/avatar')), 
                  NULL) AS image
        FROM User
        WHERE role IN ('DRIVER', 'DISPATCHER', 'BOARD', 'OWNER')
          AND driverStatus NOT IN ('WAITING_FOR_APPROVAL', 'INACTIVE')
      `);

      if (drivers.length > 0) {
        const driverIds = drivers.map(d => d.id);
        const idsStr = driverIds.map(() => '?').join(',');
        
        // 2. Fetch ONLY the single most recent approved job for each driver using SQL aggregation
        const latestJobs = await db.all(`
          SELECT j.userId, j.endCity, j.date
          FROM Job j
          INNER JOIN (
            SELECT userId, MAX(date) AS maxDate
            FROM Job
            WHERE status = 'APPROVED' AND userId IN (${idsStr})
            GROUP BY userId
          ) latest ON j.userId = latest.userId AND j.date = latest.maxDate
          WHERE j.status = 'APPROVED'
        `, driverIds);
        
        // 3. Fetch assigned trucks
        const trucks = await db.all(`
          SELECT id, assignedDriverId, brand, model, plate, fuelLevel, mileage, location, attachedTrailerId
          FROM Truck
          WHERE assignedDriverId IN (${idsStr})
        `, driverIds);
        
        // 4. Fetch attached trailers
        const trailerIds = [...new Set(trucks.map(t => t.attachedTrailerId).filter(Boolean))];
        let trailers = [];
        if (trailerIds.length > 0) {
          const trIdsStr = trailerIds.map(() => '?').join(',');
          trailers = await db.all(`
            SELECT id, brand, model, plate
            FROM Trailer
            WHERE id IN (${trIdsStr})
          `, trailerIds);
        }
        
        // Correlate results in memory
        for (const driver of drivers) {
          const lastJob = latestJobs.find(j => j.userId === driver.id);
          driver.jobs = lastJob ? [lastJob] : [];
          
          const t = trucks.find(t => t.assignedDriverId === driver.id);
          if (t) {
            const tr = trailers.find(tr => tr.id === t.attachedTrailerId);
            t.attachedTrailer = tr || null;
            driver.assignedTruck = t;
          } else {
            driver.assignedTruck = null;
          }
        }
      }

      const driversMapData = [];

      for (const driver of drivers) {
        let lastCity = driver.jobs && driver.jobs.length > 0 ? driver.jobs[0].endCity : null;
        let lastDate = driver.jobs && driver.jobs.length > 0 ? driver.jobs[0].date : null;

        if (!lastCity && driver.assignedTruck?.location) {
          lastCity = driver.assignedTruck.location;
        }

        if (!lastCity && driver.assignedTruck) {
          lastCity = "Warszawa";
        }

        if (lastCity) {
          let coords = await getCoords(lastCity);

          if (coords) {
            const truckStr = driver.assignedTruck ? `${driver.assignedTruck.brand} ${driver.assignedTruck.model} (${driver.assignedTruck.plate})` : "Brak przypisanego ciągnika";
            const trailerStr = driver.assignedTruck?.attachedTrailer ? `${driver.assignedTruck.attachedTrailer.brand} ${driver.assignedTruck.attachedTrailer.model} (${driver.assignedTruck.attachedTrailer.plate})` : "Brak przypisanej naczepy";
            
            const safeAvatar = getSafeAvatarUrl(driver) || (driver.image && !driver.image.startsWith("data:") ? driver.image : null);
            driversMapData.push({
              id: driver.id,
              name: driver.firstName || driver.name || driver.discordNick || "Kierowca",
              avatarUrl: safeAvatar,
              image: safeAvatar,
              truck: truckStr,
              trailer: trailerStr,
              fuelLevel: driver.assignedTruck ? driver.assignedTruck.fuelLevel : null,
              truckMileage: driver.assignedTruck ? driver.assignedTruck.mileage : null,
              lastCity: lastCity,
              lastCoords: coords,
              lastJobDate: lastDate
            });
          }
        }
      }

      return NextResponse.json(driversMapData, {
        headers: {
          "Cache-Control": "private, max-age=30, s-maxage=60"
        }
      });
    });
  } catch (error) {
    console.error("Błąd mapy:", error);
    return NextResponse.json({ error: "Błąd serwera przy pobieraniu lokalizacji" }, { status: 500 });
  }
}
