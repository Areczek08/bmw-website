import { NextResponse } from "next/server";
import { dbOne, dbAll } from "../../../../lib/db";
import { getServerSession } from "next-auth/next";
import { authOptions } from "../../auth/[...nextauth]/route";

export async function GET(req) {
  try {
    const session = await getServerSession(authOptions);

    if (!session || !session.user) {
      return NextResponse.json({ error: "Brak autoryzacji" }, { status: 401 });
    }

    const currentTruck = await dbOne(`
      SELECT id, brand, model, plate, assignedAt 
      FROM Truck 
      WHERE assignedDriverId = ?
    `, [session.user.id]);

    const availableTrucks = await dbAll(`
      SELECT id, brand, model, plate, power 
      FROM Truck 
      WHERE status = 'AVAILABLE' 
      ORDER BY brand ASC
    `);

    return NextResponse.json({ currentTruck, availableTrucks });
  } catch (error) {
    console.error("Błąd pobierania informacji o flocie:", error);
    return NextResponse.json({ error: "Wystąpił błąd serwera." }, { status: 500 });
  }
}
