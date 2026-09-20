import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "../../../auth/[...nextauth]/route";
import { dbOne, dbRun, generateId } from "../../../../../lib/db";

export async function POST(req) {
  try {
    const session = await getServerSession(authOptions);
    if (!session || !["OWNER", "BOARD"].includes(session.user.role)) {
      return NextResponse.json({ error: "Brak uprawnień" }, { status: 403 });
    }

    const body = await req.json();
    const { truckId, totalValue, monthlyRate, buyoutPrice, totalCost, installmentsTotal, startDate } = body;

    if (!truckId || !totalValue || !monthlyRate || !installmentsTotal) {
      return NextResponse.json({ error: "Brakuje wymaganych danych" }, { status: 400 });
    }

    const existing = await dbOne("SELECT * FROM Leasing WHERE truckId = ?", [truckId]);
    if (existing) {
      return NextResponse.json({ error: "Ta ciężarówka posiada już przypisany leasing" }, { status: 400 });
    }

    const id = generateId();
    await dbRun(
      "INSERT INTO Leasing (id, truckId, totalValue, monthlyRate, buyoutPrice, totalCost, installmentsTotal, startDate) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
      [id, truckId, totalValue, monthlyRate, buyoutPrice || null, totalCost || null, installmentsTotal, new Date(startDate)]
    );
    const newLeasing = await dbOne("SELECT * FROM Leasing WHERE id = ?", [id]);

    return NextResponse.json({ success: true, leasing: newLeasing });
  } catch (error) {
    console.error("Leasing Create Error:", error);
    return NextResponse.json({ error: "Wystąpił błąd podczas dodawania leasingu" }, { status: 500 });
  }
}
