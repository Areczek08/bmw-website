import { NextResponse } from "next/server";
import { dbAll } from "../../../lib/db";
import { getServerSession } from "next-auth/next";
import { authOptions } from "../auth/[...nextauth]/route";
import { getSafeAvatarUrl } from "../../../lib/avatar";

export const dynamic = "force-dynamic";

export async function GET(req) {
  try {
    const session = await getServerSession(authOptions);

    if (!session || !session.user) {
      return NextResponse.json({ error: "Brak autoryzacji" }, { status: 401 });
    }

    const companyFilter = session.user.role === "OWNER" ? null : (session.user.companyId || "BMS");

    let trucksQuery = "SELECT * FROM Truck";
    let trailersQuery = "SELECT * FROM Trailer";
    let params = [];
    
    if (companyFilter) {
      trucksQuery += " WHERE companyId = ?";
      trailersQuery += " WHERE companyId = ?";
      params = [companyFilter];
    }
    
    trucksQuery += " ORDER BY fleetNumber ASC";
    trailersQuery += " ORDER BY plate ASC";

    const trucksRaw = await dbAll(trucksQuery, params);
    const trailersRaw = await dbAll(trailersQuery, params);

    // Get assigned drivers for trucks
    const driverIds = trucksRaw.filter(t => t.assignedDriverId).map(t => t.assignedDriverId);
    let drivers = [];
    if (driverIds.length > 0) {
      const placeholders = driverIds.map(() => '?').join(',');
      drivers = await dbAll(`SELECT id, name, firstName, discordNick, image FROM User WHERE id IN (${placeholders})`, driverIds);
    }

    const safeTrucks = trucksRaw.map(t => {
      const assignedDriver = drivers.find(d => d.id === t.assignedDriverId);
      const attachedTrailer = trailersRaw.find(tr => tr.id === t.attachedTrailerId);
      
      return {
        ...t,
        assignedDriver: assignedDriver ? {
          ...assignedDriver,
          image: getSafeAvatarUrl(assignedDriver)
        } : null,
        attachedTrailer: attachedTrailer || null
      };
    });

    const trailers = trailersRaw.map(tr => {
      const attachedTruck = trucksRaw.find(t => t.attachedTrailerId === tr.id);
      return {
        ...tr,
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
  } catch (error) {
    console.error("Błąd podczas pobierania floty:", error);
    return NextResponse.json({ error: "Wystąpił błąd podczas pobierania floty." }, { status: 500 });
  }
}
