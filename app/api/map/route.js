import { NextResponse } from "next/server";
import { dbAll } from "../../../lib/db";
import { getSafeAvatarUrl } from "../../../lib/avatar";

const CITY_COORDS = {
  "warszawa": [52.2297, 21.0122],
  "warsaw": [52.2297, 21.0122],
  "poznan": [52.4064, 16.9252],
  "poznań": [52.4064, 16.9252],
  "wroclaw": [51.1100, 17.0333],
  "wrocław": [51.1100, 17.0333],
  "krakow": [50.0647, 19.9450],
  "kraków": [50.0647, 19.9450],
  "gdansk": [54.3520, 18.6466],
  "gdańsk": [54.3520, 18.6466],
  "katowice": [50.2649, 19.0238],
  "szczecin": [53.4285, 14.5528],
  "lodz": [51.7592, 19.4560],
  "łódź": [51.7592, 19.4560],
  "lublin": [51.2465, 22.5684],
  "bialystok": [53.1325, 23.1688],
  "białystok": [53.1325, 23.1688],
  "berlin": [52.5200, 13.4050],
  "hamburg": [53.5511, 9.9937],
  "munchen": [48.1351, 11.5820],
  "münchen": [48.1351, 11.5820],
  "frankfurt": [50.1109, 8.6821],
  "dortmund": [51.5136, 7.4653],
  "koln": [50.9375, 6.9603],
  "köln": [50.9375, 6.9603],
  "paris": [48.8566, 2.3522],
  "lyon": [45.7640, 4.8357],
  "amsterdam": [52.3676, 4.9041],
  "rotterdam": [51.9244, 4.4777],
  "praha": [50.0755, 14.4378],
  "prague": [50.0755, 14.4378],
  "brno": [49.1951, 16.6068],
  "vienna": [48.2082, 16.3738],
  "wien": [48.2082, 16.3738],
  "bratislava": [48.1486, 17.1077],
  "budapest": [47.4979, 19.0402],
  "milano": [45.4642, 9.1900],
  "roma": [41.9028, 12.4964],
  "madrid": [40.4168, -3.7038],
  "barcelona": [41.3851, 2.1734],
  "london": [51.5074, -0.1278]
};

const coordsCache = {};

async function getCoords(city) {
  if (!city) return null;
  const lowerCity = city.toLowerCase().trim();
  if (CITY_COORDS[lowerCity]) {
    return CITY_COORDS[lowerCity];
  }
  if (coordsCache[lowerCity]) {
    return coordsCache[lowerCity];
  }

  // Generate deterministic fallback coordinates in Central Europe based on city hash to avoid blocking network requests
  let hash = 0;
  for (let i = 0; i < lowerCity.length; i++) {
    hash = lowerCity.charCodeAt(i) + ((hash << 5) - hash);
  }
  const lat = 50.0 + ((Math.abs(hash) % 400) / 100);
  const lon = 10.0 + ((Math.abs(hash >> 3) % 1200) / 100);
  const fallback = [lat, lon];
  coordsCache[lowerCity] = fallback;
  return fallback;
}

export async function GET(req) {
  try {
    const drivers = await dbAll(`
      SELECT id, name, firstName, discordNick, image
      FROM User
      WHERE role IN ('DRIVER', 'DISPATCHER', 'BOARD', 'OWNER')
        AND driverStatus NOT IN ('WAITING_FOR_APPROVAL', 'INACTIVE')
    `);

    if (drivers.length > 0) {
      const driverIds = drivers.map(d => d.id);
      const idsStr = driverIds.map(() => '?').join(',');
      
      const jobs = await dbAll(`
        SELECT userId, endCity, date
        FROM Job
        WHERE status = 'APPROVED' AND userId IN (${idsStr})
        ORDER BY date DESC
      `, driverIds);
      
      const trucks = await dbAll(`
        SELECT id, assignedDriverId, brand, model, plate, fuelLevel, mileage, location, attachedTrailerId
        FROM Truck
        WHERE assignedDriverId IN (${idsStr})
      `, driverIds);
      
      const trailerIds = [...new Set(trucks.map(t => t.attachedTrailerId).filter(Boolean))];
      let trailers = [];
      if (trailerIds.length > 0) {
        const trIdsStr = trailerIds.map(() => '?').join(',');
        trailers = await dbAll(`
          SELECT id, brand, model, plate
          FROM Trailer
          WHERE id IN (${trIdsStr})
        `, trailerIds);
      }
      
      for (const driver of drivers) {
        const dJobs = jobs.filter(j => j.userId === driver.id);
        driver.jobs = dJobs.length > 0 ? [dJobs[0]] : [];
        
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
          
          driversMapData.push({
            id: driver.id,
            name: driver.firstName || driver.name || driver.discordNick || "Kierowca",
            image: getSafeAvatarUrl(driver),
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
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: "Błąd serwera przy pobieraniu lokalizacji" }, { status: 500 });
  }
}
