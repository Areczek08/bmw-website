import { NextResponse } from "next/server";
import { dbOne, dbRun, generateId } from "../../../../../lib/db";
import { getServerSession } from "next-auth/next";
import { authOptions } from "../../../auth/[...nextauth]/route";

export async function POST(req, { params }) {
  try {
    const session = await getServerSession(authOptions);

    if (!session || !session.user) {
      return NextResponse.json({ error: "Brak autoryzacji" }, { status: 401 });
    }

    const { id } = await params;
    const body = await req.json();
    const { action, amount, cost, description } = body;

    if (!action) {
      return NextResponse.json({ error: "Nie podano akcji" }, { status: 400 });
    }

    const truck = await dbOne("SELECT * FROM Truck WHERE id = ?", [id]);

    if (!truck) {
      return NextResponse.json({ error: "Nie znaleziono pojazdu" }, { status: 404 });
    }

    let finalDescription = description || "";
    let finalCost = parseFloat(cost || 0);

    if (action === "WASH") {
      finalCost = 200;
      finalDescription = "Umyto pojazd na myjni firmowej.";
      
      await dbRun("UPDATE Truck SET cleanliness = 100, updatedAt = NOW() WHERE id = ?", [id]);
      const historyId = generateId();
      await dbRun("INSERT INTO VehicleHistory (id, truckId, userId, type, description, cost, date) VALUES (?, ?, ?, ?, ?, ?, NOW())", [historyId, id, session.user.id, "WASH", finalDescription, finalCost]);
      
      const updatedTruck = await dbOne("SELECT * FROM Truck WHERE id = ?", [id]);
      const historyRecord = await dbOne("SELECT * FROM VehicleHistory WHERE id = ?", [historyId]);
      
      return NextResponse.json({ success: true, truck: updatedTruck, history: historyRecord });
      
    } else if (action === "SERVICE") {
      if (!description) {
        return NextResponse.json({ error: "Opis usterki jest wymagany" }, { status: 400 });
      }
      
      const requestId = generateId();
      await dbRun(
        "INSERT INTO Request (id, userId, type, title, content, status, truckId, cost, createdAt, updatedAt) VALUES (?, ?, ?, ?, ?, ?, ?, ?, NOW(), NOW())",
        [requestId, session.user.id, "SERVICE", `Zgłoszenie serwisowe: ${truck.brand} ${truck.model} (${truck.plate})`, description, "PENDING", id, finalCost]
      );
      const request = await dbOne("SELECT * FROM Request WHERE id = ?", [requestId]);
      return NextResponse.json({ success: true, request });
      
    } else {
      return NextResponse.json({ error: "Nieznana akcja" }, { status: 400 });
    }

  } catch (error) {
    console.error("Błąd podczas akcji flotowej:", error);
    return NextResponse.json({ error: "Wystąpił błąd podczas wykonywania akcji." }, { status: 500 });
  }
}
