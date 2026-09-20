import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "../../auth/[...nextauth]/route";
import { dbAll } from "../../../../lib/db";

export async function GET() {
  try {
    const session = await getServerSession(authOptions);
    if (!session || !["OWNER", "BOARD"].includes(session.user.role)) {
      return NextResponse.json({ error: "Brak uprawnień" }, { status: 403 });
    }

    const leasingsRaw = await dbAll("SELECT * FROM Leasing ORDER BY startDate DESC");
    const leasingIds = leasingsRaw.map(l => l.id);
    const truckIds = leasingsRaw.map(l => l.truckId).filter(id => id);

    let trucks = [];
    if (truckIds.length > 0) {
      const placeholders = truckIds.map(() => '?').join(',');
      trucks = await dbAll(`SELECT * FROM Truck WHERE id IN (${placeholders})`, truckIds);
    }
    
    // Trailers attached to these trucks
    let trailers = [];
    const trailerIds = [...new Set(trucks.map(t => t.attachedTrailerId).filter(Boolean))];
    if (trailerIds.length > 0) {
      const placeholders = trailerIds.map(() => '?').join(',');
      trailers = await dbAll(`SELECT * FROM Trailer WHERE id IN (${placeholders})`, trailerIds);
    }
    
    let paymentsMap = {};
    if (leasingIds.length > 0) {
      const placeholders = leasingIds.map(() => '?').join(',');
      const allPayments = await dbAll(`SELECT * FROM LeasingPayment WHERE leasingId IN (${placeholders})`, leasingIds);
      allPayments.forEach(p => {
        if (!paymentsMap[p.leasingId]) paymentsMap[p.leasingId] = [];
        paymentsMap[p.leasingId].push(p);
      });
    }

    const leasings = leasingsRaw.map(l => {
      const t = trucks.find(t => t.id === l.truckId) || null;
      if (t) {
        t.attachedTrailer = trailers.find(tr => tr.id === t.attachedTrailerId) || null;
      }
      return {
        ...l,
        truck: t,
        payments: paymentsMap[l.id] || []
      };
    });

    return NextResponse.json({ leasings });
  } catch (error) {
    console.error("Leasing GET Error:", error);
    return NextResponse.json({ error: "Wystąpił błąd podczas pobierania danych o leasingach" }, { status: 500 });
  }
}
