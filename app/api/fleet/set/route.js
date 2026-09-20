import { NextResponse } from "next/server";
import { dbOne, dbRun, generateId } from "../../../../lib/db";
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

    const currentTruck = await dbOne("SELECT * FROM Truck WHERE id = ?", [truckId]);

    if (!currentTruck) {
      return NextResponse.json({ error: "Nie znaleziono ciągnika" }, { status: 404 });
    }

    // 1. Odepnij poprzedniego kierowcę od innych ciężarówek
    if (driverId) {
      await dbRun("UPDATE Truck SET assignedDriverId = NULL, status = 'AVAILABLE', updatedAt = NOW() WHERE assignedDriverId = ?", [driverId]);
    }

    // 2. Odepnij naczepę od innych ciężarówek
    if (trailerId) {
      await dbRun("UPDATE Truck SET attachedTrailerId = NULL, updatedAt = NOW() WHERE attachedTrailerId = ?", [trailerId]);
      await dbRun("UPDATE Trailer SET status = 'IN_USE', updatedAt = NOW() WHERE id = ?", [trailerId]);
    }

    // 3. Jeśli poprzednio do Tego ciągnika przypięta była inna naczepa, to zmień jej status
    if (currentTruck.attachedTrailerId && currentTruck.attachedTrailerId !== trailerId) {
      await dbRun("UPDATE Trailer SET status = 'AVAILABLE', updatedAt = NOW() WHERE id = ?", [currentTruck.attachedTrailerId]);
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

    await dbRun(updateQuery, updateParams);
    const updatedTruck = await dbOne("SELECT * FROM Truck WHERE id = ?", [truckId]);

    // 5. Zapisz historię zmian (Logi)
    if (currentTruck.assignedDriverId !== (driverId || null)) {
      let driverDesc = "Zmiana kierowcy: odpięto kierowcę od pojazdu.";
      if (driverId) {
        const newDriver = await dbOne("SELECT name, discordNick, firstName FROM User WHERE id = ?", [driverId]);
        const newDriverName = newDriver ? (newDriver.discordNick || newDriver.firstName || newDriver.name || "Nieznany") : "Nieznany";
        driverDesc = `Zmiana kierowcy: przypisano kierowcę ${newDriverName} do pojazdu.`;
      }
      const historyId = generateId();
      await dbRun("INSERT INTO VehicleHistory (id, truckId, userId, type, description, cost, date) VALUES (?, ?, ?, ?, ?, 0, NOW())", [historyId, truckId, session.user.id, "DRIVER_CHANGE", driverDesc]);
    }

    if (currentTruck.attachedTrailerId !== (trailerId || null)) {
      let trailerDesc = "Zmiana naczepy: odpięto naczepę od pojazdu.";
      if (trailerId) {
        const newTrailer = await dbOne("SELECT brand, model, plate FROM Trailer WHERE id = ?", [trailerId]);
        const newTrailerInfo = newTrailer ? `${newTrailer.brand} ${newTrailer.model} (${newTrailer.plate})` : "Nieznana naczepa";
        trailerDesc = `Zmiana naczepy: podpięto naczepę ${newTrailerInfo}.`;

        const hId1 = generateId();
        await dbRun("INSERT INTO VehicleHistory (id, trailerId, userId, type, description, cost, date) VALUES (?, ?, ?, ?, ?, 0, NOW())", [hId1, trailerId, session.user.id, "DRIVER_CHANGE", `Zestaw: podpięto naczepę do ciągnika ${currentTruck.brand} ${currentTruck.model} (${currentTruck.plate}).`]);
      }

      const hId2 = generateId();
      await dbRun("INSERT INTO VehicleHistory (id, truckId, userId, type, description, cost, date) VALUES (?, ?, ?, ?, ?, 0, NOW())", [hId2, truckId, session.user.id, "DRIVER_CHANGE", trailerDesc]);

      if (currentTruck.attachedTrailerId) {
        const hId3 = generateId();
        await dbRun("INSERT INTO VehicleHistory (id, trailerId, userId, type, description, cost, date) VALUES (?, ?, ?, ?, ?, 0, NOW())", [hId3, currentTruck.attachedTrailerId, session.user.id, "DRIVER_CHANGE", `Zestaw: odpięto naczepę od ciągnika ${currentTruck.brand} ${currentTruck.model} (${currentTruck.plate}).`]);
      }
    }

    return NextResponse.json({ success: true, truck: updatedTruck });

  } catch (error) {
    console.error("Błąd zapisu zestawu:", error);
    return NextResponse.json({ error: "Wystąpił błąd podczas zapisywania zestawu." }, { status: 500 });
  }
}
