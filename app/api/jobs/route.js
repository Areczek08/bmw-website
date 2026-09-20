import { NextResponse } from "next/server";
import { dbRun, generateId } from "../../../lib/db";
import { getServerSession } from "next-auth/next";
import { authOptions } from "../auth/[...nextauth]/route";

export async function POST(req) {
  try {
    const session = await getServerSession(authOptions);

    if (!session || !session.user) {
      return NextResponse.json({ error: "Brak autoryzacji" }, { status: 401 });
    }

    const body = await req.json();
    const { 
      startCity, endCity, distance, cargo, income, fuelConsumed,
      driveTimeMinutes, description, summaryScreenshot, truckScreenshot 
    } = body;

    // Podstawowa walidacja
    if (!startCity || !endCity || !distance || !cargo || !income || !summaryScreenshot) {
      return NextResponse.json({ error: "Uzupełnij wszystkie wymagane pola oraz dodaj zrzut ekranu." }, { status: 400 });
    }

    const id = generateId();
    await dbRun(
      `INSERT INTO Job (
        id, userId, startCity, endCity, distance, cargo, 
        description, summaryScreenshot, truckScreenshot, status, date, createdAt, updatedAt
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'PENDING', NOW(), NOW(), NOW())`,
      [
        id, session.user.id, startCity, endCity, parseInt(distance) || 0, cargo,
        description || null, summaryScreenshot, truckScreenshot || null
      ]
    );

    const job = {
      id, userId: session.user.id, startCity, endCity, distance: parseInt(distance), 
      cargo, description, summaryScreenshot, truckScreenshot, status: 'PENDING'
    };

    return NextResponse.json({ success: true, job }, { status: 201 });
  } catch (error) {
    console.error("Błąd zapisu trasy:", error);
    return NextResponse.json({ error: "Wystąpił błąd podczas zapisywania trasy." }, { status: 500 });
  }
}
