import { NextResponse } from "next/server";
import { dbAll } from "../../../../lib/db";
import { getSafeAvatarUrl } from "../../../../lib/avatar";

export const dynamic = "force-dynamic";

function normalizeUrl(url) {
  if (!url) return null;
  if (url.startsWith("data:") || url.length > 500) {
    // If someone put a huge base64 into imageUrl, ignore to avoid multi-megabyte payloads
    return null;
  }
  if (url.startsWith("/")) {
    return "https://system.vsbojarlogistic.pl" + url;
  }
  return url;
}

export async function GET(req) {
  try {
    const rawTrucks = await dbAll(
      `SELECT id, brand, model, plate, fleetNumber, power, mileage, status, fuelLevel, type, imageUrl, assignedDriverId, attachedTrailerId, location, productionYear 
       FROM Truck 
       ORDER BY fleetNumber ASC, plate ASC`
    );

    const driverIds = rawTrucks.filter(t => t.assignedDriverId).map(t => t.assignedDriverId);
    let drivers = [];
    if (driverIds.length > 0) {
      const placeholders = driverIds.map(() => '?').join(',');
      drivers = await dbAll(
        `SELECT id, name, firstName, discordNick, image FROM User WHERE id IN (${placeholders})`,
        driverIds
      );
    }

    const trailerIds = rawTrucks.filter(t => t.attachedTrailerId).map(t => t.attachedTrailerId);
    let trailers = [];
    if (trailerIds.length > 0) {
      const placeholders = trailerIds.map(() => '?').join(',');
      trailers = await dbAll(
        `SELECT id, brand, model, plate, type, imageUrl FROM Trailer WHERE id IN (${placeholders})`,
        trailerIds
      );
    }

    const trucks = rawTrucks.map(t => {
      const driver = drivers.find(d => d.id === t.assignedDriverId);
      const trailer = trailers.find(tr => tr.id === t.attachedTrailerId);

      let driverImg = driver ? getSafeAvatarUrl(driver) : null;
      if (driverImg && driverImg.startsWith("/")) {
        driverImg = "https://system.vsbojarlogistic.pl" + driverImg;
      }

      return {
        id: t.id,
        brand: t.brand,
        model: t.model,
        plate: t.plate,
        fleetNumber: t.fleetNumber,
        power: t.power || 0,
        mileage: t.mileage || 0,
        status: t.status || "AVAILABLE",
        fuelLevel: t.fuelLevel ?? null,
        type: t.type || "Ciągnik",
        location: t.location || null,
        productionYear: t.productionYear || null,
        imageUrl: normalizeUrl(t.imageUrl),
        assignedDriver: driver ? {
          id: driver.id,
          name: driver.discordNick || driver.name || driver.firstName || "Kierowca",
          image: driverImg,
        } : null,
        attachedTrailer: trailer ? {
          id: trailer.id,
          brand: trailer.brand,
          model: trailer.model,
          plate: trailer.plate,
          type: trailer.type,
          imageUrl: normalizeUrl(trailer.imageUrl),
        } : null,
      };
    });

    return NextResponse.json(trucks, {
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "GET, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type",
        "Cache-Control": "no-store, no-cache, must-revalidate, proxy-revalidate, max-age=0",
      },
    });
  } catch (err) {
    console.error("Public flota error:", err);
    return NextResponse.json({ error: "Błąd pobierania floty" }, { status: 500 });
  }
}

export async function OPTIONS() {
  return new NextResponse(null, {
    status: 204,
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
    },
  });
}
