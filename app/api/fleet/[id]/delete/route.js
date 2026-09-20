import { NextResponse } from "next/server";
import { dbRun, dbOne } from "../../../../../lib/db";
import { getServerSession } from "next-auth/next";
import { authOptions } from "../../../auth/[...nextauth]/route";

export async function DELETE(req, { params }) {
  try {
    const session = await getServerSession(authOptions);

    if (!session || !session.user || (session.user.role !== "BOARD" && session.user.role !== "OWNER" && session.user.role !== "DISPATCHER")) {
      return NextResponse.json({ error: "Brak autoryzacji" }, { status: 403 });
    }

    const { id } = await params;

    await dbRun("DELETE FROM VehicleHistory WHERE truckId = ? OR trailerId = ?", [id, id]);

    await dbRun("UPDATE Job SET truckId = NULL WHERE truckId = ?", [id]);

    const truck = await dbOne("SELECT id FROM Truck WHERE id = ?", [id]);
    
    if (truck) {
      await dbRun("DELETE FROM Truck WHERE id = ?", [id]);
      return NextResponse.json({ success: true, message: "Pojazd usunięty pomyślnie" });
    } else {
      const trailer = await dbOne("SELECT id FROM Trailer WHERE id = ?", [id]);
      if (trailer) {
        await dbRun("UPDATE Truck SET attachedTrailerId = NULL WHERE attachedTrailerId = ?", [id]);
        await dbRun("DELETE FROM Trailer WHERE id = ?", [id]);
        return NextResponse.json({ success: true, message: "Naczepa usunięta pomyślnie" });
      } else {
        return NextResponse.json({ error: "Nie znaleziono pojazdu" }, { status: 404 });
      }
    }

  } catch (error) {
    console.error("Błąd podczas usuwania pojazdu:", error);
    return NextResponse.json({ error: "Wystąpił błąd podczas usuwania pojazdu." }, { status: 500 });
  }
}
