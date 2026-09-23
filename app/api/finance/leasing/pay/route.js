import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "../../../auth/[...nextauth]/route";
import { dbSession, generateId } from "../../../../../lib/db";
import { extractIdempotencyKey, checkIdempotency, recordIdempotency } from "../../../../../lib/idempotency";

export async function POST(req) {
  try {
    const session = await getServerSession(authOptions);
    if (!session || !["OWNER", "BOARD"].includes(session.user.role)) {
      return NextResponse.json({ error: "Brak uprawnień" }, { status: 403 });
    }

    const body = await req.json();
    const { leasingId, month, year } = body;

    const parsedMonth = parseInt(month, 10);
    const parsedYear = parseInt(year, 10);

    if (!leasingId || isNaN(parsedMonth) || isNaN(parsedYear)) {
      return NextResponse.json({ error: "Brakuje danych (leasingId, month, year)" }, { status: 400 });
    }

    const idempotencyKey = extractIdempotencyKey(req, body);
    const companyId = session.user.companyId || "BMS";

    return await dbSession(async (db) => {
      // 1. Check Idempotency Key
      if (idempotencyKey) {
        const idempCheck = await checkIdempotency(idempotencyKey, db);
        if (idempCheck.isDuplicate) {
          return NextResponse.json(idempCheck.response, { 
            status: idempCheck.statusCode,
            headers: { "Cache-Control": "private, no-cache, no-store, must-revalidate" }
          });
        }
      }

      // 2. Atomic Transaction
      await db.transaction(async (tx) => {
        const leasing = await tx.one(
          "SELECT id, truckId, monthlyRate FROM Leasing WHERE id = ?", 
          [leasingId]
        );

        if (!leasing) {
          const err = new Error("LEASING_NOT_FOUND");
          err.code = "LEASING_NOT_FOUND";
          throw err;
        }

        const existingPayment = await tx.one(
          "SELECT id FROM LeasingPayment WHERE leasingId = ? AND month = ? AND year = ? FOR UPDATE",
          [leasingId, parsedMonth, parsedYear]
        );

        if (existingPayment) {
          const err = new Error("ALREADY_PAID");
          err.code = "ALREADY_PAID";
          throw err;
        }

        const company = await tx.one(
          "SELECT id, balance FROM Company WHERE id = ? FOR UPDATE", 
          [companyId]
        );

        if (!company || Number(company.balance) < Number(leasing.monthlyRate)) {
          const err = new Error("INSUFFICIENT_FUNDS");
          err.code = "INSUFFICIENT_FUNDS";
          throw err;
        }

        const truck = await tx.one(
          "SELECT brand, model, plate FROM Truck WHERE id = ?", 
          [leasing.truckId]
        );

        const paymentId = generateId();
        const transactionId = generateId();

        const deductResult = await tx.run(
          "UPDATE Company SET balance = balance - ?, updatedAt = NOW() WHERE id = ? AND balance >= ?",
          [leasing.monthlyRate, companyId, leasing.monthlyRate]
        );

        if (deductResult.affectedRows === 0) {
          const err = new Error("INSUFFICIENT_FUNDS");
          err.code = "INSUFFICIENT_FUNDS";
          throw err;
        }

        await tx.run(
          "INSERT INTO CompanyTransaction (id, companyId, type, amount, category, description, date) VALUES (?, ?, 'EXPENSE', ?, 'Leasing', ?, NOW())",
          [transactionId, companyId, leasing.monthlyRate, `Rata leasingu - ${truck?.brand || 'Pojazd'} ${truck?.model || ''} (${truck?.plate || ''}) za ${parsedMonth}/${parsedYear}`]
        );

        await tx.run(
          "INSERT INTO LeasingPayment (id, leasingId, amount, month, year, paidAt, paidBy) VALUES (?, ?, ?, ?, ?, NOW(), ?)",
          [paymentId, leasingId, leasing.monthlyRate, parsedMonth, parsedYear, session.user.id]
        );
      });

      const responseData = { success: true };

      if (idempotencyKey) {
        await recordIdempotency(idempotencyKey, "PAY_LEASING", 200, responseData, db);
      }

      return NextResponse.json(responseData, {
        status: 200,
        headers: { "Cache-Control": "private, no-cache, no-store, must-revalidate" }
      });
    });

  } catch (error) {
    if (error.code === "ALREADY_PAID") {
      return NextResponse.json({ error: "Ta rata została już opłacona!" }, { status: 400 });
    }
    if (error.code === "INSUFFICIENT_FUNDS") {
      return NextResponse.json({ error: "Brak wystarczających środków na koncie firmowym!" }, { status: 400 });
    }
    if (error.code === "LEASING_NOT_FOUND") {
      return NextResponse.json({ error: "Leasing nie istnieje." }, { status: 404 });
    }
    console.error("Leasing Pay Error:", error);
    return NextResponse.json({ error: "Wystąpił błąd podczas opłacania raty" }, { status: 500 });
  }
}
