import { NextResponse } from "next/server";
import { dbOne, dbRun, dbAll } from "../../../../../lib/db";
import { getServerSession } from "next-auth/next";
import { authOptions } from "../../../auth/[...nextauth]/route";
import { getSafeAvatarUrl } from "../../../../../lib/avatar";

export async function GET(req, { params }) {
  try {
    const session = await getServerSession(authOptions);

    if (!session || !session.user) {
      return NextResponse.json({ error: "Brak autoryzacji" }, { status: 401 });
    }

    const { id } = await params;

    const j = await dbOne(`
      SELECT j.*,
             u.id as u_id, u.name as u_name, u.discordNick as u_discordNick, u.firstName as u_firstName, u.image as u_image,
             t.id as t_id, t.brand as t_brand, t.model as t_model, t.plate as t_plate, t.fleetNumber as t_fleetNumber,
             tr.id as tr_id, tr.brand as tr_brand, tr.type as tr_type, tr.plate as tr_plate
      FROM Job j
      LEFT JOIN User u ON j.userId = u.id
      LEFT JOIN Truck t ON j.truckId = t.id
      LEFT JOIN Trailer tr ON j.trailerId = tr.id
      WHERE j.id = ?
    `, [id]);

    if (!j) {
      return NextResponse.json({ error: "Nie znaleziono zlecenia" }, { status: 404 });
    }

    let userJobs = [];
    if (j.u_id) {
        userJobs = await dbAll(`
            SELECT id, startCity, endCity, distance, date 
            FROM Job 
            WHERE userId = ? 
            ORDER BY createdAt DESC LIMIT 1
        `, [j.u_id]);
    }

    const user = j.u_id ? {
        id: j.u_id, name: j.u_name, discordNick: j.u_discordNick, firstName: j.u_firstName, image: j.u_image,
        jobs: userJobs
    } : null;

    if (user) {
        user.image = getSafeAvatarUrl(user);
    }

    const { u_id, u_name, u_discordNick, u_firstName, u_image, t_id, t_brand, t_model, t_plate, t_fleetNumber, tr_id, tr_brand, tr_type, tr_plate, ...jobData } = j;

    const safeJob = {
      ...jobData,
      user,
      truck: t_id ? { id: t_id, brand: t_brand, model: t_model, plate: t_plate, fleetNumber: t_fleetNumber } : null,
      trailer: tr_id ? { id: tr_id, brand: tr_brand, type: tr_type, plate: tr_plate } : null
    };

    return NextResponse.json({ success: true, job: safeJob });
  } catch (error) {
    console.error("Błąd pobierania szczegółów zlecenia:", error);
    return NextResponse.json({ error: "Wystąpił błąd podczas pobierania szczegółów." }, { status: 500 });
  }
}

export async function PUT(req, { params }) {
  try {
    const session = await getServerSession(authOptions);

    if (!session || !session.user || !["DISPATCHER", "BOARD", "OWNER"].includes(session.user.role)) {
      return NextResponse.json({ error: "Brak uprawnień dyspozytorskich." }, { status: 403 });
    }

    const { id } = await params;
    const { status, comment } = await req.json();

    if (!["APPROVED", "REJECTED"].includes(status)) {
      return NextResponse.json({ error: "Nieprawidłowy status." }, { status: 400 });
    }

    const job = await dbOne("SELECT * FROM Job WHERE id = ?", [id]);

    if (!job) {
      return NextResponse.json({ error: "Nie znaleziono zlecenia." }, { status: 404 });
    }

    if (job.status !== "PENDING") {
      return NextResponse.json({ error: "Zlecenie było już rozpatrzone." }, { status: 400 });
    }

    await dbRun(`
        UPDATE Job 
        SET status = ?, dispatcherComment = ?, updatedAt = NOW() 
        WHERE id = ?
    `, [status, comment || null, id]);

    if (status === "APPROVED") {
      await dbRun("UPDATE User SET totalDrivenKm = totalDrivenKm + ?, updatedAt = NOW() WHERE id = ?", [job.distance, job.userId]);
      
      if (job.truckId) {
        const dirtDrop = Math.max(0, job.distance / 100);
        const fuelDrop = job.averageFuel ? ((job.distance / 100) * job.averageFuel) / 10 : 0;

        const truck = await dbOne("SELECT cleanliness, fuelLevel FROM Truck WHERE id = ?", [job.truckId]);
        if (truck) {
          const newClean = Math.max(0, truck.cleanliness - Math.round(dirtDrop));
          const newFuel = Math.max(0, truck.fuelLevel - fuelDrop);

          await dbRun(`
            UPDATE Truck 
            SET mileage = mileage + ?, cleanliness = ?, fuelLevel = ?, updatedAt = NOW() 
            WHERE id = ?
          `, [job.distance, newClean, newFuel, job.truckId]);
        }
      }

      if (job.trailerId) {
        await dbRun("UPDATE Trailer SET mileage = mileage + ? WHERE id = ?", [job.distance, job.trailerId]);
      }
    }

    const updatedJob = await dbOne("SELECT * FROM Job WHERE id = ?", [id]);
    return NextResponse.json({ success: true, job: updatedJob }, { status: 200 });
  } catch (error) {
    console.error("Błąd aktualizacji statusu trasy:", error);
    return NextResponse.json({ error: "Wystąpił błąd po stronie serwera." }, { status: 500 });
  }
}
