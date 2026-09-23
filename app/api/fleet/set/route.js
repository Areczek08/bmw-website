import { NextResponse } from "next/server";
import { dbSession, generateId } from "../../../../lib/db";
import { getServerSession } from "next-auth/next";
import { authOptions } from "../../auth/[...nextauth]/route";

export async function PUT(req) {
  try {
    const session = await getServerSession(authOptions);
    if (!session || !["BOARD", "OWNER", "DISPATCHER"].includes(session.user.role)) {
      return NextResponse.json({ error: "Brak autoryzacji" }, { status: 401 });
    }

    const { truckId, driverId, trailerId, imageUrl, assignedAt } = await req.json();

    if (!truckId) {
      return NextResponse.json({ error: "Brak ID ciągnika" }, { status: 400 });
    }

    const userCompany = session.user.companyId || "BMS";
    const isOwner = session.user.role === "OWNER";

    return await dbSession(async (db) => {
      const currentTruck = await db.one("SELECT * FROM Truck WHERE id = ?", [truckId]);

      if (!currentTruck) {
        return NextResponse.json({ error: "Nie znaleziono ciągnika" }, { status: 404 });
      }

      // Check truck ownership
      if (!isOwner && currentTruck.companyId && currentTruck.companyId !== userCompany) {
        return NextResponse.json({ error: "Brak uprawnień do modyfikacji ciągnika innej firmy." }, { status: 403 });
      }

      // Check trailer ownership if provided
      if (trailerId) {
        const targetTrailer = await db.one("SELECT id, companyId FROM Trailer WHERE id = ?", [trailerId]);
        if (!targetTrailer) {
          return NextResponse.json({ error: "Nie znaleziono naczepy" }, { status: 404 });
        }
        if (!isOwner && targetTrailer.companyId && targetTrailer.companyId !== userCompany) {
          return NextResponse.json({ error: "Brak uprawnień do przypięcia naczepy innej firmy." }, { status: 403 });
        }
      }

      // Check driver ownership if provided
      if (driverId) {
        const targetDriver = await db.one("SELECT id, companyId FROM User WHERE id = ?", [driverId]);
        if (!targetDriver) {
          return NextResponse.json({ error: "Nie znaleziono kierowcy" }, { status: 404 });
        }
        if (!isOwner && targetDriver.companyId && targetDriver.companyId !== userCompany) {
          return NextResponse.json({ error: "Brak uprawnień do przypisania kierowcy innej firmy." }, { status: 403 });
        }
      }

      // 1. Odepnij poprzedniego kierowcę od innych ciężarówek
      if (driverId) {
        await db.run("UPDATE Truck SET assignedDriverId = NULL, status = 'AVAILABLE', updatedAt = NOW() WHERE assignedDriverId = ?", [driverId]);
      }

      // 2. Odepnij naczepę od innych ciężarówek
      if (trailerId) {
        await db.run("UPDATE Truck SET attachedTrailerId = NULL, updatedAt = NOW() WHERE attachedTrailerId = ?", [trailerId]);
        await db.run("UPDATE Trailer SET status = 'IN_USE', updatedAt = NOW() WHERE id = ?", [trailerId]);
      }

      // 3. Jeśli poprzednio do Tego ciągnika przypięta była inna naczepa, to zmień jej status
      if (currentTruck.attachedTrailerId && currentTruck.attachedTrailerId !== trailerId) {
        await db.run("UPDATE Trailer SET status = 'AVAILABLE', updatedAt = NOW() WHERE id = ?", [currentTruck.attachedTrailerId]);
      }

      const updateData = {
        assignedDriverId: driverId || null,
        attachedTrailerId: trailerId || null,
        status: driverId ? "IN_USE" : "AVAILABLE",
        assignedAt: driverId ? (assignedAt ? new Date(assignedAt) : new Date()) : null
      };

      let updateQuery = "UPDATE Truck SET assignedDriverId = ?, attachedTrailerId = ?, status = ?, assignedAt = ?, updatedAt = NOW()";
      const updateParams = [updateData.assignedDriverId, updateData.attachedTrailerId, updateData.status, updateData.assignedAt];

      if (imageUrl !== undefined) {
        updateQuery += ", imageUrl = ?";
        updateParams.push(imageUrl);
      }
      
      updateQuery += " WHERE id = ?";
      updateParams.push(truckId);

      await db.run(updateQuery, updateParams);
      const updatedTruck = await db.one("SELECT id, brand, model, plate, status, assignedDriverId, attachedTrailerId FROM Truck WHERE id = ?", [truckId]);

      // 5. Zapisz historię zmian (Logi)
      if (currentTruck.assignedDriverId !== (driverId || null)) {
        let driverDesc = "Zmiana kierowcy: odpięto kierowcę od pojazdu.";
        if (driverId) {
          const newDriver = await db.one("SELECT name, discordNick, firstName FROM User WHERE id = ?", [driverId]);
          const newDriverName = newDriver ? (newDriver.discordNick || newDriver.firstName || newDriver.name || "Nieznany") : "Nieznany";
          driverDesc = `Zmiana kierowcy: przypisano kierowcę ${newDriverName} do pojazdu.`;
        }
        const historyId = generateId();
        await db.run("INSERT INTO VehicleHistory (id, truckId, userId, type, description, cost, date) VALUES (?, ?, ?, ?, ?, 0, NOW())", [historyId, truckId, session.user.id, "DRIVER_CHANGE", driverDesc]);
      }

      if (currentTruck.attachedTrailerId !== (trailerId || null)) {
        let trailerDesc = "Zmiana naczepy: odpięto naczepę od pojazdu.";
        if (trailerId) {
          const newTrailer = await db.one("SELECT brand, model, plate FROM Trailer WHERE id = ?", [trailerId]);
          const newTrailerInfo = newTrailer ? `${newTrailer.brand} ${newTrailer.model} (${newTrailer.plate})` : "Nieznana naczepa";
          trailerDesc = `Zmiana naczepy: podpięto naczepę ${newTrailerInfo}.`;

          const hId1 = generateId();
          await db.run("INSERT INTO VehicleHistory (id, trailerId, userId, type, description, cost, date) VALUES (?, ?, ?, ?, ?, 0, NOW())", [hId1, trailerId, session.user.id, "DRIVER_CHANGE", `Zestaw: podpięto naczepę do ciągnika ${currentTruck.brand} ${currentTruck.model} (${currentTruck.plate}).`]);
        }

        const hId2 = generateId();
        await db.run("INSERT INTO VehicleHistory (id, truckId, userId, type, description, cost, date) VALUES (?, ?, ?, ?, ?, 0, NOW())", [hId2, truckId, session.user.id, "DRIVER_CHANGE", trailerDesc]);

        if (currentTruck.attachedTrailerId) {
          const hId3 = generateId();
          await db.run("INSERT INTO VehicleHistory (id, trailerId, userId, type, description, cost, date) VALUES (?, ?, ?, ?, ?, 0, NOW())", [hId3, currentTruck.attachedTrailerId, session.user.id, "DRIVER_CHANGE", `Zestaw: odpięto naczepę od ciągnika ${currentTruck.brand} ${currentTruck.model} (${currentTruck.plate}).`]);
        }
      }

      return NextResponse.json({ success: true, truck: updatedTruck });
    });

  } catch (error) {
    console.error("Błąd zapisu zestawu:", error);
    return NextResponse.json({ error: "Wystąpił błąd podczas zapisywania zestawu." }, { status: 500 });
  }
}
