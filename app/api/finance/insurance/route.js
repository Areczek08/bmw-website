import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "../../auth/[...nextauth]/route";
import { dbAll, dbOne, dbRun, generateId } from "../../../../lib/db";

export async function GET(req) {
  try {
    const session = await getServerSession(authOptions);
    if (!session || !["OWNER", "BOARD"].includes(session.user.role)) {
      return NextResponse.json({ error: "Brak uprawnień" }, { status: 403 });
    }

    const insurancesRaw = await dbAll("SELECT * FROM Insurance");
    const insuranceIds = insurancesRaw.map(i => i.id);

    let paymentsMap = {};
    if (insuranceIds.length > 0) {
      const placeholders = insuranceIds.map(() => '?').join(',');
      const allPayments = await dbAll(`SELECT * FROM InsurancePayment WHERE insuranceId IN (${placeholders})`, insuranceIds);
      allPayments.forEach(p => {
        if (!paymentsMap[p.insuranceId]) paymentsMap[p.insuranceId] = [];
        paymentsMap[p.insuranceId].push(p);
      });
    }

    const trucks = await dbAll("SELECT id, plate, brand, model FROM Truck");
    const trailers = await dbAll("SELECT id, plate, brand, type FROM Trailer");

    const insurances = insurancesRaw.map(i => {
      return {
        ...i,
        truck: i.truckId ? trucks.find(t => t.id === i.truckId) || null : null,
        trailer: i.trailerId ? trailers.find(t => t.id === i.trailerId) || null : null,
        payments: paymentsMap[i.id] || []
      };
    });

    return NextResponse.json({ success: true, insurances, trucks, trailers });
  } catch (error) {
    console.error("Insurance GET Error:", error);
    return NextResponse.json({ error: "Wystąpił błąd" }, { status: 500 });
  }
}

export async function POST(req) {
  try {
    const session = await getServerSession(authOptions);
    if (!session || !["OWNER", "BOARD"].includes(session.user.role)) {
      return NextResponse.json({ error: "Brak uprawnień" }, { status: 403 });
    }

    const { type, yearlyCost, validUntil, truckId, trailerId } = await req.json();

    if (!type || !yearlyCost || !validUntil || (!truckId && !trailerId)) {
      return NextResponse.json({ error: "Brak wymaganych danych" }, { status: 400 });
    }

    let existing = null;
    if (truckId) {
      existing = await dbOne("SELECT * FROM Insurance WHERE truckId = ?", [truckId]);
    } else if (trailerId) {
      existing = await dbOne("SELECT * FROM Insurance WHERE trailerId = ?", [trailerId]);
    }

    if (existing) {
      return NextResponse.json({ error: "Ten pojazd ma już przypisane ubezpieczenie w systemie" }, { status: 400 });
    }

    const id = generateId();
    const monthlyRate = parseFloat(yearlyCost) / 12;
    await dbRun(
      "INSERT INTO Insurance (id, type, yearlyCost, monthlyRate, validUntil, truckId, trailerId) VALUES (?, ?, ?, ?, ?, ?, ?)",
      [id, type, parseFloat(yearlyCost), monthlyRate, new Date(validUntil), truckId || null, trailerId || null]
    );

    const insurance = await dbOne("SELECT * FROM Insurance WHERE id = ?", [id]);

    return NextResponse.json({ success: true, insurance });
  } catch (error) {
    console.error("Insurance POST Error:", error);
    return NextResponse.json({ error: "Wystąpił błąd" }, { status: 500 });
  }
}
