import { NextResponse } from "next/server";
import { dbOne, dbRun } from "../../../../lib/db";
import { getServerSession } from "next-auth/next";
import { authOptions } from "../../auth/[...nextauth]/route";
import { sendApprovalEmail } from "../../../../lib/mailer";

export async function POST(req) {
  try {
    const session = await getServerSession(authOptions);
    if (!session || (session.user.role !== "BOARD" && session.user.role !== "OWNER")) {
      return NextResponse.json({ error: "Brak uprawnień" }, { status: 403 });
    }

    const body = await req.json();
    const { userId, action, rank, monthlyLimitKm, initialDeliveries, initialMileage, truckId, rejectionReason } = body;

    const user = await dbOne("SELECT * FROM User WHERE id = ?", [userId]);
    if (!user) {
      return NextResponse.json({ error: "Nie znaleziono użytkownika" }, { status: 404 });
    }

    if (action === "APPROVE") {
      // 1. Zaktualizuj użytkownika
      await dbRun(
        "UPDATE User SET driverStatus = 'OFFLINE', rank = ?, monthlyLimitKm = ?, initialDeliveries = ?, initialMileage = ?, updatedAt = NOW() WHERE id = ?",
        [
          rank || "Praktykant",
          parseInt(monthlyLimitKm) || 10000,
          parseInt(initialDeliveries) || 0,
          parseInt(initialMileage) || 0,
          userId
        ]
      );

      // 2. Jeśli przypisano ciężarówkę, zaktualizuj ciężarówkę
      if (truckId) {
        // Najpierw usuń ew. przypisanie tej ciężarówki do kogoś innego
        await dbRun("UPDATE Truck SET assignedDriverId = ?, updatedAt = NOW() WHERE id = ?", [userId, truckId]);
      }

      // 3. Wyślij email
      try {
        await sendApprovalEmail(user.email, user.firstName || user.name || "Kierowco", true);
      } catch (e) {
        console.error('Email error:', e);
      }

      return NextResponse.json({ success: true, message: "Konto zaakceptowane." });

    } else if (action === "REJECT") {
      // Przy odrzuceniu zmieniamy status na INACTIVE lub usuwamy konto (tutaj zmieniamy na INACTIVE żeby mieć historię)
      await dbRun("UPDATE User SET driverStatus = 'INACTIVE', updatedAt = NOW() WHERE id = ?", [userId]);

      // Wyślij email z odrzuceniem
      try {
        await sendApprovalEmail(user.email, user.firstName || user.name || "Kandydacie", false, rejectionReason);
      } catch (e) {
        console.error('Email error:', e);
      }

      return NextResponse.json({ success: true, message: "Konto odrzucone." });
    }

    return NextResponse.json({ error: "Nieznana akcja" }, { status: 400 });

  } catch (error) {
    console.error("Błąd podczas akceptacji:", error);
    return NextResponse.json({ error: "Wystąpił błąd serwera" }, { status: 500 });
  }
}
