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

    const { searchParams } = new URL(req.url);
    const limit = Math.min(Math.max(parseInt(searchParams.get("limit") || "50", 10) || 50, 1), 100);
    const page = Math.max(parseInt(searchParams.get("page") || "1", 10) || 1, 1);
    const offset = (page - 1) * limit;

    let whereClause = "";
    const params = [];

    if (session.user.role === "OWNER") {
      whereClause = "";
    } else if (session.user.role === "BOARD" || session.user.role === "DISPATCHER") {
      const companyId = session.user.companyId || "BMS";
      whereClause = "WHERE (u.companyId = ? OR u.companyId IS NULL)";
      params.push(companyId);
    } else {
      whereClause = "WHERE r.userId = ?";
      params.push(session.user.id);
    }

    params.push(limit, offset);

    const requestsData = await dbAll(`
      SELECT r.id, r.userId, r.type, r.title, r.content, r.status, r.truckId, r.cost, r.createdAt, r.updatedAt,
             u.name as 'u_name', u.image as 'u_image', u.role as 'u_role',
             t.brand as 't_brand', t.model as 't_model', t.plate as 't_plate', t.fleetNumber as 't_fleetNumber'
      FROM Request r
      LEFT JOIN User u ON r.userId = u.id
      LEFT JOIN Truck t ON r.truckId = t.id
      ${whereClause}
      ORDER BY r.createdAt DESC
      LIMIT ? OFFSET ?
    `, params);

    const requests = requestsData.map(r => {
      const { u_name, u_image, u_role, t_brand, t_model, t_plate, t_fleetNumber, ...reqData } = r;
      return {
        ...reqData,
        user: r.userId ? {
          name: u_name,
          image: getSafeAvatarUrl({ id: r.userId, name: u_name, image: u_image }),
          role: u_role
        } : null,
        truck: r.truckId ? { brand: t_brand, model: t_model, plate: t_plate, fleetNumber: t_fleetNumber } : null
      };
    });

    return NextResponse.json({ requests, page, limit });
  } catch (error) {
    console.error("Błąd pobierania wniosków:", error);
    return NextResponse.json({ error: "Wystąpił błąd podczas pobierania wniosków." }, { status: 500 });
  }
}

