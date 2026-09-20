import { NextResponse } from "next/server";
import { db, dbOne } from "../../../../../lib/db";
import { getServerSession } from "next-auth/next";
import { authOptions } from "../../../auth/[...nextauth]/route";

export async function PUT(req, { params }) {
  try {
    const session = await getServerSession(authOptions);

    if (!session || !session.user || (session.user.role !== "DISPATCHER" && session.user.role !== "BOARD" && session.user.role !== "OWNER")) {
      return NextResponse.json({ error: "Brak uprawnień do zatwierdzania tras" }, { status: 403 });
    }

    const { id } = await params;

    const job = await dbOne("SELECT * FROM Job WHERE id = ?", [id]);

    if (!job) {
      return NextResponse.json({ error: "Nie znaleziono trasy" }, { status: 404 });
    }

    if (job.status === "APPROVED") {
      return NextResponse.json({ error: "Trasa została już zaakceptowana" }, { status: 400 });
    }

    const distance = Number(job.distance) || 0;

    await db(async (conn) => {
      await conn.query("START TRANSACTION");
      try {
        await conn.query("UPDATE Job SET status = 'APPROVED', updatedAt = NOW() WHERE id = ?", [id]);

        if (job.userId && distance > 0) {
          await conn.query("UPDATE User SET totalDrivenKm = totalDrivenKm + ?, updatedAt = NOW() WHERE id = ?", [distance, job.userId]);
        }

        if (job.truckId && distance > 0) {
          await conn.query("UPDATE Truck SET mileage = mileage + ?, updatedAt = NOW() WHERE id = ?", [distance, job.truckId]);
        }

        if (job.trailerId && distance > 0) {
          await conn.query("UPDATE Trailer SET mileage = mileage + ?, updatedAt = NOW() WHERE id = ?", [distance, job.trailerId]);
        }

        await conn.query("COMMIT");
      } catch (err) {
        await conn.query("ROLLBACK");
        throw err;
      }
    });

    const updatedJob = await dbOne("SELECT * FROM Job WHERE id = ?", [id]);

    return NextResponse.json({ message: "Trasa zatwierdzona. Kilometry zostały dodane.", job: updatedJob }, { status: 200 });

  } catch (error) {
    console.error("Błąd podczas zatwierdzania trasy:", error);
    return NextResponse.json({ error: "Wystąpił błąd podczas przetwarzania żądania." }, { status: 500 });
  }
}
