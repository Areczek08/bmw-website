import { NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "../../auth/[...nextauth]/route";
import { dbOne, dbAll } from "../../../../lib/db";

export async function GET(request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session || !session.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const user = await dbOne("SELECT name FROM User WHERE id = ?", [session.user.id]);

    if (!user) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    const fuelCards = await dbAll("SELECT * FROM FuelCard WHERE userId = ?", [session.user.id]);
    const assignedTruck = await dbOne("SELECT id, brand, model, plate FROM Truck WHERE assignedDriverId = ?", [session.user.id]);

    return NextResponse.json({
      fuelCards: fuelCards,
      name: user.name,
      assignedTruck: assignedTruck || null
    });

  } catch (error) {
    console.error("Error with fuel cards:", error);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
