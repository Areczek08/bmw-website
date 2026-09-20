import { NextResponse } from "next/server";
import { dbAll } from "../../../../lib/db";
import { getServerSession } from "next-auth/next";
import { authOptions } from "../../auth/[...nextauth]/route";
import { getSafeAvatarUrl } from "../../../../lib/avatar";

export async function GET(req) {
  try {
    const session = await getServerSession(authOptions);

    if (!session || !session.user || (session.user.role !== "DISPATCHER" && session.user.role !== "BOARD" && session.user.role !== "OWNER")) {
      return NextResponse.json({ error: "Brak autoryzacji" }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const limit = Math.min(parseInt(searchParams.get("limit") || "150", 10), 300);

    const jobsData = await dbAll(`
      SELECT j.id, j.userId, j.startCity, j.endCity, j.sourceCompany, j.destinationCompany, 
             j.cargo, j.weight, j.distance, j.plannedDistance, j.breakdowns, j.averageFuel, 
             j.date, j.status, j.createdAt, j.description, j.dispatcherComment, j.truckId, j.trailerId,
             u.id as u_id, u.name as u_name, u.firstName as u_firstName, u.discordNick as u_discordNick, u.image as u_image,
             t.id as t_id, t.brand as t_brand, t.model as t_model, t.plate as t_plate, t.fleetNumber as t_fleetNumber,
             tr.id as tr_id, tr.brand as tr_brand, tr.type as tr_type, tr.plate as tr_plate
      FROM Job j
      LEFT JOIN User u ON j.userId = u.id
      LEFT JOIN Truck t ON j.truckId = t.id
      LEFT JOIN Trailer tr ON j.trailerId = tr.id
      ORDER BY j.createdAt DESC
      LIMIT ${limit}
    `);

    const safeJobs = jobsData.map(j => {
      const { u_id, u_name, u_firstName, u_discordNick, u_image,
              t_id, t_brand, t_model, t_plate, t_fleetNumber,
              tr_id, tr_brand, tr_type, tr_plate, ...job } = j;
      
      const user = u_id ? { id: u_id, name: u_name, firstName: u_firstName, discordNick: u_discordNick, image: u_image } : null;
      if (user) {
         user.image = getSafeAvatarUrl(user);
      }

      return {
        ...job,
        user,
        truck: t_id ? { id: t_id, brand: t_brand, model: t_model, plate: t_plate, fleetNumber: t_fleetNumber } : null,
        trailer: tr_id ? { id: tr_id, brand: tr_brand, type: tr_type, plate: tr_plate } : null
      };
    });

    return NextResponse.json({ jobs: safeJobs }, {
      headers: {
        "Cache-Control": "private, max-age=10, s-maxage=30, stale-while-revalidate=60"
      }
    });
  } catch (error) {
    console.error("Błąd podczas pobierania tras dla dyspozytora:", error);
    return NextResponse.json({ error: "Wystąpił błąd podczas pobierania tras." }, { status: 500 });
  }
}
