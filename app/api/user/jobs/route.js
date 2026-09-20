import { NextResponse } from "next/server";
import { dbAll, dbRun, generateId } from "../../../../lib/db";
import { getServerSession } from "next-auth/next";
import { authOptions } from "../../auth/[...nextauth]/route";

export async function GET(req) {
  try {
    const session = await getServerSession(authOptions);

    if (!session || !session.user) {
      return NextResponse.json({ error: "Brak autoryzacji" }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const limit = Math.min(parseInt(searchParams.get("limit") || "100", 10), 200);

    const jobs = await dbAll(`
      SELECT id, userId, startCity, endCity, sourceCompany, destinationCompany, 
             cargo, weight, distance, plannedDistance, breakdowns, averageFuel, 
             date, status, createdAt, description, dispatcherComment 
      FROM Job 
      WHERE userId = ? 
      ORDER BY createdAt DESC 
      LIMIT ?
    `, [session.user.id, limit]);

    return NextResponse.json({ jobs }, {
      headers: {
        "Cache-Control": "private, max-age=15, s-maxage=30"
      }
    });
  } catch (error) {
    console.error("Błąd podczas pobierania tras:", error);
    return NextResponse.json({ error: "Wystąpił błąd podczas pobierania tras." }, { status: 500 });
  }
}

export async function POST(req) {
  try {
    const session = await getServerSession(authOptions);

    if (!session || !session.user) {
      return NextResponse.json({ error: "Brak autoryzacji" }, { status: 401 });
    }

    const body = await req.json();
    
    const {
      startCity, endCity, sourceCompany, destinationCompany,
      cargo, weight, distance, plannedDistance,
      breakdowns, averageFuel,
      summaryScreenshot, truckScreenshot,
      truckId, trailerId
    } = body;

    const id = generateId();
    await dbRun(`
      INSERT INTO Job (
        id, userId, startCity, endCity, sourceCompany, destinationCompany,
        cargo, weight, distance, plannedDistance, breakdowns, averageFuel,
        summaryScreenshot, truckScreenshot, truckId, trailerId, 
        createdAt, updatedAt
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW(), NOW())
    `, [
      id,
      session.user.id,
      startCity,
      endCity,
      sourceCompany || "",
      destinationCompany || "",
      cargo,
      Number(weight) || 0,
      Number(distance) || 0,
      Number(plannedDistance) || 0,
      breakdowns || "Brak",
      Number(averageFuel) || 0,
      summaryScreenshot || "",
      truckScreenshot || "",
      truckId || null,
      trailerId || null
    ]);

    const newJob = {
      id,
      userId: session.user.id,
      startCity,
      endCity,
      sourceCompany: sourceCompany || "",
      destinationCompany: destinationCompany || "",
      cargo,
      weight: Number(weight) || 0,
      distance: Number(distance) || 0,
      plannedDistance: Number(plannedDistance) || 0,
      breakdowns: breakdowns || "Brak",
      averageFuel: Number(averageFuel) || 0,
      summaryScreenshot: summaryScreenshot || "",
      truckScreenshot: truckScreenshot || "",
      truckId: truckId || null,
      trailerId: trailerId || null,
      createdAt: new Date(),
      updatedAt: new Date()
    };

    return NextResponse.json({ message: "Trasa dodana pomyślnie", job: newJob }, { status: 201 });

  } catch (error) {
    console.error("Błąd podczas dodawania trasy:", error);
    return NextResponse.json({ error: "Wystąpił błąd podczas dodawania trasy." }, { status: 500 });
  }
}
