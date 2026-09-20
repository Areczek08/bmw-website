import { NextResponse } from "next/server";
import { dbOne, dbRun, generateId } from "../../../../../lib/db";
import { getServerSession } from "next-auth/next";
import { authOptions } from "../../../auth/[...nextauth]/route";

export async function POST(req, { params }) {
  try {
    const session = await getServerSession(authOptions);

    if (!session || !session.user || (session.user.role !== "BOARD" && session.user.role !== "OWNER")) {
      return NextResponse.json({ error: "Tylko Zarząd może zarządzać wnioskami." }, { status: 403 });
    }

    const { id } = await params;
    const { action, comment } = await req.json();

    const request = await dbOne("SELECT * FROM Request WHERE id = ?", [id]);
    if (!request) return NextResponse.json({ error: "Wniosek nie istnieje" }, { status: 404 });

    let newContent = request.content;
    if (comment && comment.trim() !== "") {
      newContent += `\n\n=================================================\nDECYZJA/KOMENTARZ ZARZĄDU:\n${comment}`;
    }

    if (action === "APPROVE") {
      await dbRun("UPDATE Request SET status = 'APPROVED', content = ?, updatedAt = NOW() WHERE id = ?", [newContent, id]);

      if (request.type === "SERVICE" && request.truckId) {
        await dbRun("UPDATE Truck SET condition = 100, updatedAt = NOW() WHERE id = ?", [request.truckId]);
        
        const historyId = generateId();
        await dbRun(`
          INSERT INTO VehicleHistory (id, truckId, userId, type, description, cost, createdAt)
          VALUES (?, ?, ?, 'SERVICE', ?, ?, NOW())
        `, [
          historyId,
          request.truckId,
          request.userId,
          `Zatwierdzono Wniosek Serwisowy: ${request.content}`,
          request.cost || 0
        ]);
      }
      return NextResponse.json({ success: true, message: "Zatwierdzono" });

    } else if (action === "REJECT") {
      await dbRun("UPDATE Request SET status = 'REJECTED', content = ?, updatedAt = NOW() WHERE id = ?", [newContent, id]);
      return NextResponse.json({ success: true, message: "Odrzucono" });
    }

    return NextResponse.json({ error: "Nieznana akcja" }, { status: 400 });
  } catch (error) {
    console.error("Błąd podczas akcji wniosku:", error);
    return NextResponse.json({ error: "Błąd serwera" }, { status: 500 });
  }
}
