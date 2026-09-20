import { NextResponse } from "next/server";
import { dbRun, dbOne } from "../../../../../lib/db";
import { getServerSession } from "next-auth/next";
import { authOptions } from "../../../auth/[...nextauth]/route";

export async function PUT(req, { params }) {
  try {
    const session = await getServerSession(authOptions);

    if (!session || !session.user || (session.user.role !== "BOARD" && session.user.role !== "OWNER" && session.user.role !== "DISPATCHER")) {
      return NextResponse.json({ error: "Brak autoryzacji" }, { status: 403 });
    }

    const { id } = await params;
    const body = await req.json();
    const { category, brand, model, plate, fleetNumber, productionYear, power, type, imageUrl, mileage, status, ownershipStatus, inCompanySince, vin, location, averageFuel } = body;

    const inCompanySinceVal = inCompanySince ? new Date(inCompanySince) : null;

    if (category === "Naczepa") {
      let query = "UPDATE Trailer SET brand = ?, model = ?, plate = ?, productionYear = ?, type = ?, imageUrl = ?, status = ?, ownershipStatus = ?, updatedAt = NOW()";
      const queryParams = [brand, model, plate, parseInt(productionYear) || 2020, type, imageUrl, status, ownershipStatus];
      
      if (inCompanySinceVal) {
        query += ", inCompanySince = ?";
        queryParams.push(inCompanySinceVal);
      }
      query += " WHERE id = ?";
      queryParams.push(id);
      
      await dbRun(query, queryParams);
      const updatedTrailer = await dbOne("SELECT * FROM Trailer WHERE id = ?", [id]);
      return NextResponse.json({ success: true, vehicle: updatedTrailer });
    } else {
      let query = "UPDATE Truck SET brand = ?, model = ?, plate = ?, fleetNumber = ?, productionYear = ?, power = ?, type = ?, imageUrl = ?, mileage = ?, status = ?, ownershipStatus = ?, vin = ?, location = ?, averageFuel = ?, updatedAt = NOW()";
      const queryParams = [brand, model, plate, fleetNumber, parseInt(productionYear) || 2020, parseInt(power) || 500, type, imageUrl, parseInt(mileage) || 0, status, ownershipStatus, vin, location, parseFloat(averageFuel) || 0];

      if (inCompanySinceVal) {
        query += ", inCompanySince = ?";
        queryParams.push(inCompanySinceVal);
      }
      query += " WHERE id = ?";
      queryParams.push(id);

      await dbRun(query, queryParams);
      const updatedTruck = await dbOne("SELECT * FROM Truck WHERE id = ?", [id]);
      return NextResponse.json({ success: true, vehicle: updatedTruck });
    }
  } catch (error) {
    console.error("Błąd podczas edycji pojazdu:", error);
    return NextResponse.json({ error: "Wystąpił błąd podczas edycji pojazdu." }, { status: 500 });
  }
}
