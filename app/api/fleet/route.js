import { NextResponse } from "next/server";
import { dbSession } from "../../../lib/db";
import { getServerSession } from "next-auth/next";
import { authOptions } from "../auth/[...nextauth]/route";
import { getSafeAvatarUrl } from "../../../lib/avatar";
import { getVehicleImageVariants } from "../../../lib/fleetImage";

export const dynamic = "force-dynamic";

export async function GET(req) {
  try {
    const session = await getServerSession(authOptions);

    if (!session || !session.user) {
      return NextResponse.json({ error: "Brak autoryzacji" }, { status: 401 });
    }

    const companyFilter = session.user.role === "OWNER" ? null : (session.user.companyId || "BMS");

    return await dbSession(async (db) => {
      let trucksQuery = `
        SELECT id, brand, model, plate, fleetNumber, power, mileage, serviceLimitKm,
               status, ownershipStatus, inCompanySince, vin, location, averageFuel,
               type, imageUrl, assignedDriverId, attachedTrailerId, companyId,
               productionYear, fuelLevel, cleanliness, \`condition\`, tuningAllowed,
               createdAt, updatedAt
        FROM Truck
      `;
      let trailersQuery = `
        SELECT id, brand, model, plate, type, productionYear, status, ownershipStatus,
               inCompanySince, imageUrl, companyId, createdAt, updatedAt
        FROM Trailer
      `;
      let params = [];
      
      if (companyFilter) {
        trucksQuery += " WHERE companyId = ?";
        trailersQuery += " WHERE companyId = ?";
        params = [companyFilter];
      }
      
      trucksQuery += " ORDER BY fleetNumber ASC";
      trailersQuery += " ORDER BY plate ASC";

      const trucksRaw = await db.all(trucksQuery, params);
      const trailersRaw = await db.all(trailersQuery, params);

      // Get assigned drivers for trucks without raw Base64 blobs
      const driverIds = trucksRaw.filter(t => t.assignedDriverId).map(t => t.assignedDriverId);
      let drivers = [];
      if (driverIds.length > 0) {
        const placeholders = driverIds.map(() => '?').join(',');
        drivers = await db.all(
          `SELECT id, name, firstName, discordNick, image FROM User WHERE id IN (${placeholders})`,
          driverIds
        );
      }

      const safeTrucks = trucksRaw.map(t => {
        const assignedDriver = drivers.find(d => d.id === t.assignedDriverId);
        const attachedTrailer = trailersRaw.find(tr => tr.id === t.attachedTrailerId);
        const imageVariants = getVehicleImageVariants(t.imageUrl);

        return {
          ...t,
          imageVariants: imageVariants ? {
            thumbnail: imageVariants.thumbnail,
            medium: imageVariants.medium,
            large: imageVariants.large,
            srcSet: imageVariants.srcSet
          } : null,
          assignedDriver: assignedDriver ? {
            ...assignedDriver,
            image: getSafeAvatarUrl(assignedDriver)
          } : null,
          attachedTrailer: attachedTrailer || null
        };
      });

      const trailers = trailersRaw.map(tr => {
        const attachedTruck = trucksRaw.find(t => t.attachedTrailerId === tr.id);
        const trailerImageVariants = getVehicleImageVariants(tr.imageUrl);

        return {
          ...tr,
          imageVariants: trailerImageVariants ? {
            thumbnail: trailerImageVariants.thumbnail,
            medium: trailerImageVariants.medium,
            large: trailerImageVariants.large,
            srcSet: trailerImageVariants.srcSet
          } : null,
          attachedTruck: attachedTruck ? {
            fleetNumber: attachedTruck.fleetNumber,
            plate: attachedTruck.plate
          } : null
        };
      });

      return NextResponse.json({ trucks: safeTrucks, trailers }, {
        headers: {
          "Cache-Control": "private, max-age=30, s-maxage=60"
        }
      });
    });
  } catch (error) {
    console.error("Błąd podczas pobierania floty:", error);
    return NextResponse.json({ error: "Wystąpił błąd podczas pobierania floty." }, { status: 500 });
  }
}
