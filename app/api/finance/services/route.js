import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "../../auth/[...nextauth]/route";
import { dbAll } from "../../../../lib/db";

export async function GET(req) {
  try {
    const session = await getServerSession(authOptions);
    if (!session || !["OWNER", "BOARD"].includes(session.user.role)) {
      return NextResponse.json({ error: "Brak uprawnień" }, { status: 403 });
    }

    const invoicesRaw = await dbAll("SELECT * FROM ServiceInvoice ORDER BY date DESC");
    const truckIds = invoicesRaw.map(i => i.truckId).filter(id => id);

    let trucks = [];
    if (truckIds.length > 0) {
      const placeholders = truckIds.map(() => '?').join(',');
      trucks = await dbAll(`SELECT id, brand, model, plate, fleetNumber FROM Truck WHERE id IN (${placeholders})`, truckIds);
    }

    const invoices = invoicesRaw.map(i => {
      return {
        ...i,
        truck: i.truckId ? trucks.find(t => t.id === i.truckId) || null : null
      };
    });

    return NextResponse.json({ success: true, invoices });
  } catch (error) {
    console.error("Service Invoices Error:", error);
    return NextResponse.json({ error: "Wystąpił błąd podczas pobierania rachunków" }, { status: 500 });
  }
}
