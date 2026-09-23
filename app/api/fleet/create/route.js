import { NextResponse } from "next/server";
import { dbRun, generateId } from "../../../../lib/db";
import { getServerSession } from "next-auth/next";
import { authOptions } from "../../auth/[...nextauth]/route";

export async function POST(req) {
  try {
    const session = await getServerSession(authOptions);

    if (!session || !session.user || (session.user.role !== "BOARD" && session.user.role !== "OWNER" && session.user.role !== "DISPATCHER")) {
      return NextResponse.json({ error: "Brak autoryzacji" }, { status: 403 });
    }

    const body = await req.json();
    const { category, brand, model, plate, fleetNumber, productionYear, power, type, imageUrl, ownershipStatus, inCompanySince, vin, location, averageFuel } = body;

    if (!brand || !model || !plate) {
      return NextResponse.json({ error: "Wypełnij wymagane pola (Marka, Model, Rejestracja)" }, { status: 400 });
    }

    const targetCompanyId = (session.user.role === "OWNER" && body.companyId)
      ? body.companyId
      : (session.user.companyId || "BMS");

    const id = generateId();
    const parsedProductionYear = isNaN(parseInt(productionYear)) ? 2020 : parseInt(productionYear);
    const inCompanySinceDate = inCompanySince ? new Date(inCompanySince) : new Date();

    if (category === "Naczepa") {
      await dbRun(
        "INSERT INTO Trailer (id, brand, model, plate, productionYear, type, imageUrl, status, ownershipStatus, inCompanySince, companyId, createdAt, updatedAt) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW(), NOW())",
        [id, brand, model, plate, parsedProductionYear, type || "Plandeka", imageUrl || null, "AVAILABLE", ownershipStatus || "Własność", inCompanySinceDate, targetCompanyId]
      );
      return NextResponse.json({ success: true, vehicle: { id, brand, model, plate, productionYear: parsedProductionYear, type: type || "Plandeka", imageUrl: imageUrl || null, status: "AVAILABLE", ownershipStatus: ownershipStatus || "Własność", inCompanySince: inCompanySinceDate, companyId: targetCompanyId } });
    } else {
      const parsedPower = parseInt(power) || 500;
      await dbRun(
        "INSERT INTO Truck (id, brand, model, plate, fleetNumber, productionYear, power, type, imageUrl, status, `condition`, fuelLevel, cleanliness, mileage, serviceLimitKm, ownershipStatus, inCompanySince, vin, location, averageFuel, companyId, createdAt, updatedAt) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW(), NOW())",
        [id, brand, model, plate, fleetNumber || "", parsedProductionYear, parsedPower, category, imageUrl || null, "AVAILABLE", 100, 100, 100, 0, 80000, ownershipStatus || "Własność", inCompanySinceDate, vin || null, location || null, parseFloat(averageFuel) || 0, targetCompanyId]
      );
      return NextResponse.json({ success: true, vehicle: { id, brand, model, plate, fleetNumber: fleetNumber || "", productionYear: parsedProductionYear, power: parsedPower, type: category, imageUrl: imageUrl || null, status: "AVAILABLE", condition: 100, fuelLevel: 100, cleanliness: 100, mileage: 0, serviceLimitKm: 80000, ownershipStatus: ownershipStatus || "Własność", inCompanySince: inCompanySinceDate, vin: vin || null, location: location || null, averageFuel: parseFloat(averageFuel) || 0, companyId: targetCompanyId } });
    }

  } catch (error) {
    console.error("Błąd podczas dodawania pojazdu:", error);
    return NextResponse.json({ error: "Wystąpił błąd podczas dodawania pojazdu. Upewnij się, że rejestracja lub numer flotowy nie są już zajęte." }, { status: 500 });
  }
}
