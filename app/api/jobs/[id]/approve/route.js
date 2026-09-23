import { NextResponse } from "next/server";
import { dbSession } from "../../../../../lib/db";
import { getServerSession } from "next-auth/next";
import { authOptions } from "../../../auth/[...nextauth]/route";

export async function PUT(req, { params }) {
  try {
    const session = await getServerSession(authOptions);

    if (!session || !session.user || (session.user.role !== "DISPATCHER" && session.user.role !== "BOARD" && session.user.role !== "OWNER")) {
      return NextResponse.json({ error: "Brak uprawnień do zatwierdzania tras" }, { status: 403 });
    }

    const { id } = await params;
    const userCompany = session.user.companyId || "BMS";
    const isOwner = session.user.role === "OWNER";

    return await dbSession(async (db) => {
      const job = await db.one("SELECT id, userId, truckId, trailerId, distance, status FROM Job WHERE id = ?", [id]);

      if (!job) {
        return NextResponse.json({ error: "Nie znaleziono trasy" }, { status: 404 });
      }

      if (job.status === "APPROVED") {
        return NextResponse.json({ error: "Trasa została już zaakceptowana" }, { status: 400 });
      }

      // Check tenant isolation if not OWNER
      if (!isOwner && job.userId) {
        const jobDriver = await db.one("SELECT id, companyId FROM User WHERE id = ?", [job.userId]);
        if (jobDriver?.companyId && jobDriver.companyId !== userCompany) {
          return NextResponse.json({ error: "Brak uprawnień do zatwierdzania tras innej firmy." }, { status: 403 });
        }
      }

      const distance = Number(job.distance) || 0;

      await db.transaction(async (tx) => {
        await tx.run("UPDATE Job SET status = 'APPROVED', updatedAt = NOW() WHERE id = ?", [id]);

        if (job.userId && distance > 0) {
          await tx.run("UPDATE User SET totalDrivenKm = totalDrivenKm + ?, updatedAt = NOW() WHERE id = ?", [distance, job.userId]);
        }

        if (job.truckId && distance > 0) {
          await tx.run("UPDATE Truck SET mileage = mileage + ?, updatedAt = NOW() WHERE id = ?", [distance, job.truckId]);
        }

        if (job.trailerId && distance > 0) {
          await tx.run("UPDATE Trailer SET mileage = mileage + ?, updatedAt = NOW() WHERE id = ?", [distance, job.trailerId]);
        }
      });

      const updatedJob = await db.one("SELECT id, userId, truckId, trailerId, distance, status, updatedAt FROM Job WHERE id = ?", [id]);

      return NextResponse.json({ message: "Trasa zatwierdzona. Kilometry zostały dodane.", job: updatedJob }, { status: 200 });
    });

  } catch (error) {
    console.error("Błąd podczas zatwierdzania trasy:", error);
    return NextResponse.json({ error: "Wystąpił błąd podczas przetwarzania żądania." }, { status: 500 });
  }
}
