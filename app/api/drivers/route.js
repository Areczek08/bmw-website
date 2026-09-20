import { NextResponse } from "next/server";
import { dbAll } from "../../../lib/db";
import { getServerSession } from "next-auth/next";
import { authOptions } from "../auth/[...nextauth]/route";
import { getSafeAvatarUrl } from "../../../lib/avatar";

export async function GET(req) {
  try {
    const session = await getServerSession(authOptions);

    if (!session || !session.user) {
      return NextResponse.json({ error: "Brak autoryzacji" }, { status: 401 });
    }

    let driversQuery = `
      SELECT 
        u.id, u.name, u.firstName, u.discordNick, u.image, u.role, u.driverStatus, 
        u.rank, u.monthlyLimitKm, u.totalDrivenKm, u.createdAt, u.lastOnline, 
        u.ecoScore, u.displayOrder,
        t.id as truck_id, t.fleetNumber as truck_fleetNumber, t.brand as truck_brand, 
        t.model as truck_model, t.plate as truck_plate, t.attachedTrailerId as truck_attachedTrailerId
      FROM User u
      LEFT JOIN Truck t ON t.assignedDriverId = u.id
      WHERE u.driverStatus NOT IN ('WAITING_FOR_APPROVAL', 'INACTIVE')
    `;
    
    let params = [];
    if (session.user.role !== "OWNER") {
      driversQuery += ` AND u.companyId = ?`;
      params.push(session.user.companyId || "BMS");
    }

    driversQuery += ` ORDER BY u.createdAt ASC`;

    const driversRaw = await dbAll(driversQuery, params);

    // Get trailer info for those with attached trailers
    const trailerIds = driversRaw.filter(d => d.truck_attachedTrailerId).map(d => d.truck_attachedTrailerId);
    let trailers = [];
    if (trailerIds.length > 0) {
      const placeholders = trailerIds.map(() => '?').join(',');
      trailers = await dbAll(`SELECT id, type, plate FROM Trailer WHERE id IN (${placeholders})`, trailerIds);
    }

    // Map to objects
    const drivers = driversRaw.map(row => {
      const driver = {
        id: row.id,
        name: row.name,
        firstName: row.firstName,
        discordNick: row.discordNick,
        image: row.image,
        role: row.role,
        driverStatus: row.driverStatus,
        rank: row.rank,
        monthlyLimitKm: row.monthlyLimitKm,
        totalDrivenKm: row.totalDrivenKm,
        createdAt: row.createdAt,
        lastOnline: row.lastOnline,
        ecoScore: row.ecoScore,
        displayOrder: row.displayOrder,
      };

      if (row.truck_id) {
        const trailer = trailers.find(tr => tr.id === row.truck_attachedTrailerId);
        driver.assignedTruck = {
          fleetNumber: row.truck_fleetNumber,
          brand: row.truck_brand,
          model: row.truck_model,
          plate: row.truck_plate,
          attachedTrailer: trailer ? {
            type: trailer.type,
            plate: trailer.plate,
          } : null
        };
      } else {
        driver.assignedTruck = null;
      }
      return driver;
    });

    const startOfMonth = new Date();
    startOfMonth.setDate(1);
    startOfMonth.setHours(0, 0, 0, 0);

    const jobsThisMonth = await dbAll(`
      SELECT userId, SUM(distance) as totalDistance
      FROM Job
      WHERE status = 'APPROVED' AND date >= ?
      GROUP BY userId
    `, [startOfMonth]);

    const driversWithStats = drivers.map(driver => {
      const userJobs = jobsThisMonth.find(j => j.userId === driver.id);
      
      const isOnline = driver.lastOnline && (new Date() - new Date(driver.lastOnline) < 5 * 60 * 1000);
      let computedStatus = driver.driverStatus;
      
      if (isOnline) {
        if (computedStatus === "OFFLINE" || computedStatus === "ACTIVE") {
           computedStatus = "ACTIVE";
        }
      } else {
        if (computedStatus === "ACTIVE") {
           computedStatus = "OFFLINE";
        }
      }

      return {
        ...driver,
        image: getSafeAvatarUrl(driver),
        status: computedStatus,
        currentMonthKm: userJobs ? Number(userJobs.totalDistance || 0) : 0,
        truck: driver.assignedTruck ? `${driver.assignedTruck.brand} ${driver.assignedTruck.model}` : null,
        truckPlate: driver.assignedTruck?.plate || null,
        trailer: driver.assignedTruck?.attachedTrailer ? driver.assignedTruck.attachedTrailer.type : null,
        trailerPlate: driver.assignedTruck?.attachedTrailer?.plate || null,
        limitKm: driver.monthlyLimitKm || 10000,
      };
    });

    driversWithStats.sort((a, b) => {
      const orderA = a.displayOrder || 0;
      const orderB = b.displayOrder || 0;

      if (orderA > 0 && orderB > 0) {
        return orderA - orderB;
      }
      if (orderA > 0) return -1;
      if (orderB > 0) return 1;

      const dateA = a.createdAt ? new Date(a.createdAt).getTime() : 0;
      const dateB = b.createdAt ? new Date(b.createdAt).getTime() : 0;
      return dateA - dateB;
    });

    return NextResponse.json({ drivers: driversWithStats }, {
      headers: {
        "Cache-Control": "private, max-age=15, s-maxage=30"
      }
    });
  } catch (error) {
    console.error("Błąd podczas pobierania kierowców:", error);
    return NextResponse.json({ error: "Wystąpił błąd podczas pobierania kierowców." }, { status: 500 });
  }
}
