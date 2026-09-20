import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "../../auth/[...nextauth]/route";
import { dbAll, dbOne, dbRun, generateId } from "../../../../lib/db";
import { getBaseDetails, saveBaseDetails } from "../../../../lib/bases";

export async function GET(req) {
  try {
    const session = await getServerSession(authOptions);
    if (!session || !session.user) {
      return NextResponse.json({ error: "Brak uprawnień" }, { status: 403 });
    }

    const basesFromDb = await dbAll("SELECT * FROM CompanyBase");
    const basesIds = basesFromDb.map(b => b.id);
    
    let trucksMap = {};
    let paymentsMap = {};
    if (basesIds.length > 0) {
      const placeholders = basesIds.map(() => '?').join(',');
      const allTrucks = await dbAll(`SELECT id, brand, model, plate, fleetNumber, status, baseId FROM Truck WHERE baseId IN (${placeholders})`, basesIds);
      allTrucks.forEach(t => {
        if (!trucksMap[t.baseId]) trucksMap[t.baseId] = [];
        trucksMap[t.baseId].push(t);
      });

      const allPayments = await dbAll(`SELECT * FROM BasePayment WHERE baseId IN (${placeholders})`, basesIds);
      allPayments.forEach(p => {
        if (!paymentsMap[p.baseId]) paymentsMap[p.baseId] = [];
        paymentsMap[p.baseId].push(p);
      });
    }

    // Attach extended details (description, imageUrl, amenities)
    const bases = basesFromDb.map(b => {
      const details = getBaseDetails(b.id);
      return {
        ...b,
        trucks: trucksMap[b.id] || [],
        payments: paymentsMap[b.id] || [],
        imageUrl: details.imageUrl,
        description: details.description,
        amenities: details.amenities
      };
    });

    const trucks = await dbAll("SELECT id, brand, model, plate, fleetNumber, baseId FROM Truck");

    return NextResponse.json({ success: true, bases, trucks });
  } catch (error) {
    console.error("Bases GET Error:", error);
    return NextResponse.json({ error: "Wystąpił błąd" }, { status: 500 });
  }
}

export async function POST(req) {
  try {
    const session = await getServerSession(authOptions);
    if (!session || !["OWNER", "BOARD"].includes(session.user.role)) {
      return NextResponse.json({ error: "Brak uprawnień" }, { status: 403 });
    }

    const { name, city, monthlyCost, capacity, imageUrl, description, amenities } = await req.json();

    if (!name || !city || !monthlyCost) {
      return NextResponse.json({ error: "Brak wymaganych danych" }, { status: 400 });
    }

    const baseId = generateId();
    await dbRun(
      "INSERT INTO CompanyBase (id, name, city, monthlyCost, capacity) VALUES (?, ?, ?, ?, ?)",
      [baseId, name, city, parseFloat(monthlyCost), capacity ? parseInt(capacity) : null]
    );

    const base = await dbOne("SELECT * FROM CompanyBase WHERE id = ?", [baseId]);

    // Save extended details if provided
    saveBaseDetails(base.id, {
      imageUrl,
      description,
      amenities
    });

    const details = getBaseDetails(base.id);

    return NextResponse.json({ 
      success: true, 
      base: {
        ...base,
        imageUrl: details.imageUrl,
        description: details.description,
        amenities: details.amenities
      } 
    });
  } catch (error) {
    console.error("Bases POST Error:", error);
    return NextResponse.json({ error: "Wystąpił błąd" }, { status: 500 });
  }
}

export async function PUT(req) {
  try {
    const session = await getServerSession(authOptions);
    if (!session || !["OWNER", "BOARD"].includes(session.user.role)) {
      return NextResponse.json({ error: "Brak uprawnień" }, { status: 403 });
    }

    const body = await req.json();

    // Mode A: Update Base Details
    if (body.action === "UPDATE_BASE") {
      const { baseId, name, city, monthlyCost, capacity, imageUrl, description, amenities } = body;
      if (!baseId) return NextResponse.json({ error: "Brak ID bazy" }, { status: 400 });

      await dbRun(
        "UPDATE CompanyBase SET name = ?, city = ?, monthlyCost = ?, capacity = ? WHERE id = ?",
        [name, city, parseFloat(monthlyCost), capacity ? parseInt(capacity) : null, baseId]
      );
      const updatedBase = await dbOne("SELECT * FROM CompanyBase WHERE id = ?", [baseId]);

      saveBaseDetails(baseId, {
        imageUrl,
        description,
        amenities
      });

      return NextResponse.json({ success: true, base: updatedBase });
    }

    // Mode B: Assign Trucks (Multi or Single)
    const { baseId, truckId, truckIds } = body;
    const idsToAssign = truckIds && Array.isArray(truckIds) ? truckIds : (truckId ? [truckId] : []);

    if (idsToAssign.length === 0) {
      return NextResponse.json({ error: "Brak wybranych ciągników" }, { status: 400 });
    }

    if (baseId) {
      const base = await dbOne("SELECT * FROM CompanyBase WHERE id = ?", [baseId]);
      if (base && base.capacity) {
        const result = await dbOne("SELECT COUNT(*) as count FROM Truck WHERE baseId = ?", [baseId]);
        const currentCount = Number(result.count);
        const availableSlots = base.capacity - currentCount;
        if (idsToAssign.length > availableSlots) {
          return NextResponse.json({ error: `Baza pomieści jeszcze tylko ${availableSlots} pojazdów.` }, { status: 400 });
        }
      }
    }

    const placeholders = idsToAssign.map(() => '?').join(',');
    await dbRun(`UPDATE Truck SET baseId = ?, updatedAt = NOW() WHERE id IN (${placeholders})`, [baseId || null, ...idsToAssign]);

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Base Assign/Update Error:", error);
    return NextResponse.json({ error: "Wystąpił błąd podczas zapisywania" }, { status: 500 });
  }
}
