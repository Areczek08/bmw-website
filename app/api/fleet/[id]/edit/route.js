import { NextResponse } from "next/server";
import { dbSession } from "../../../../../lib/db";
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
    const userCompany = session.user.companyId || "BMS";
    const isOwner = session.user.role === "OWNER";

    return await dbSession(async (db) => {
      if (category === "Naczepa") {
        const trailer = await db.one("SELECT id, companyId FROM Trailer WHERE id = ?", [id]);
        if (!trailer) {
          return NextResponse.json({ error: "Nie znaleziono naczepy" }, { status: 404 });
        }

        if (!isOwner && trailer.companyId && trailer.companyId !== userCompany) {
          return NextResponse.json({ error: "Brak uprawnień do edycji naczepy innej firmy." }, { status: 403 });
        }

        let query = "UPDATE Trailer SET brand = ?, model = ?, plate = ?, productionYear = ?, type = ?, imageUrl = ?, status = ?, ownershipStatus = ?, updatedAt = NOW()";
        const queryParams = [brand, model, plate, parseInt(productionYear) || 2020, type, imageUrl, status, ownershipStatus];
        
        if (inCompanySinceVal) {
          query += ", inCompanySince = ?";
          queryParams.push(inCompanySinceVal);
        }
        query += " WHERE id = ?";
        queryParams.push(id);
        
        await db.run(query, queryParams);
        const updatedTrailer = await db.one("SELECT id, brand, model, plate, status, companyId FROM Trailer WHERE id = ?", [id]);
        return NextResponse.json({ success: true, vehicle: updatedTrailer });
      } else {
        const truck = await db.one("SELECT id, companyId FROM Truck WHERE id = ?", [id]);
        if (!truck) {
          return NextResponse.json({ error: "Nie znaleziono ciągnika" }, { status: 404 });
        }

        if (!isOwner && truck.companyId && truck.companyId !== userCompany) {
          return NextResponse.json({ error: "Brak uprawnień do edycji pojazdu innej firmy." }, { status: 403 });
        }

        let query = "UPDATE Truck SET brand = ?, model = ?, plate = ?, fleetNumber = ?, productionYear = ?, power = ?, type = ?, imageUrl = ?, mileage = ?, status = ?, ownershipStatus = ?, vin = ?, location = ?, averageFuel = ?, updatedAt = NOW()";
        const queryParams = [brand, model, plate, fleetNumber, parseInt(productionYear) || 2020, parseInt(power) || 500, type, imageUrl, parseInt(mileage) || 0, status, ownershipStatus, vin, location, parseFloat(averageFuel) || 0];

        if (inCompanySinceVal) {
          query += ", inCompanySince = ?";
          queryParams.push(inCompanySinceVal);
        }
        query += " WHERE id = ?";
        queryParams.push(id);

        await db.run(query, queryParams);
        const updatedTruck = await db.one("SELECT id, brand, model, plate, status, companyId FROM Truck WHERE id = ?", [id]);
        return NextResponse.json({ success: true, vehicle: updatedTruck });
      }
    });
  } catch (error) {
    console.error("Błąd podczas edycji pojazdu:", error);
    return NextResponse.json({ error: "Wystąpił błąd podczas edycji pojazdu." }, { status: 500 });
  }
}
