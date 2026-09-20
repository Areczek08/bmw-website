import { NextResponse } from "next/server";
import { dbAll } from "../../../lib/db";
import { getServerSession } from "next-auth/next";
import { authOptions } from "../auth/[...nextauth]/route";

export async function GET(req) {
  try {
    const session = await getServerSession(authOptions);

    if (!session || !session.user) {
      return NextResponse.json({ error: "Brak autoryzacji" }, { status: 401 });
    }

    const isAdmin = session.user.role === "BOARD" || session.user.role === "OWNER";
    
    const whereClause = isAdmin ? "" : "WHERE r.userId = ?";
    const params = isAdmin ? [] : [session.user.id];

    const requestsData = await dbAll(`
      SELECT r.*, 
             u.name as 'u_name', u.image as 'u_image', u.role as 'u_role',
             t.brand as 't_brand', t.model as 't_model', t.plate as 't_plate', t.fleetNumber as 't_fleetNumber'
      FROM Request r
      LEFT JOIN User u ON r.userId = u.id
      LEFT JOIN Truck t ON r.truckId = t.id
      ${whereClause}
      ORDER BY r.createdAt DESC
    `, params);

    const requests = requestsData.map(r => {
      const { u_name, u_image, u_role, t_brand, t_model, t_plate, t_fleetNumber, ...reqData } = r;
      return {
        ...reqData,
        user: r.userId ? { name: u_name, image: u_image, role: u_role } : null,
        truck: r.truckId ? { brand: t_brand, model: t_model, plate: t_plate, fleetNumber: t_fleetNumber } : null
      };
    });

    return NextResponse.json({ requests });
  } catch (error) {
    console.error("Błąd pobierania wniosków:", error);
    return NextResponse.json({ error: "Wystąpił błąd podczas pobierania wniosków." }, { status: 500 });
  }
}
