import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "../../../../auth/[...nextauth]/route";
import { dbSession, generateId } from "../../../../../../lib/db";
import { extractIdempotencyKey, checkIdempotency, recordIdempotency } from "../../../../../../lib/idempotency";

export async function POST(req, { params }) {
  try {
    const session = await getServerSession(authOptions);
    if (!session || !["OWNER", "BOARD"].includes(session.user.role)) {
      return NextResponse.json({ error: "Brak uprawnień" }, { status: 403 });
    }

    const { id: insuranceId } = await params;
    const body = await req.json();
    const { month, year } = body;

    const parsedMonth = parseInt(month, 10);
    const parsedYear = parseInt(year, 10);

    if (!insuranceId || isNaN(parsedMonth) || isNaN(parsedYear)) {
      return NextResponse.json({ error: "Nieprawidłowe dane ubezpieczenia, miesiąca lub roku." }, { status: 400 });
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
        const insurance = await tx.one(
          "SELECT id, type, monthlyRate FROM Insurance WHERE id = ?", 
          [insuranceId]
        );

        if (!insurance) {
          const err = new Error("INSURANCE_NOT_FOUND");
          err.code = "INSURANCE_NOT_FOUND";
          throw err;
        }

        const alreadyPaid = await tx.one(
          "SELECT id FROM InsurancePayment WHERE insuranceId = ? AND month = ? AND year = ? FOR UPDATE",
          [insuranceId, parsedMonth, parsedYear]
        );

        if (alreadyPaid) {
          const err = new Error("ALREADY_PAID");
          err.code = "ALREADY_PAID";
          throw err;
        }

        const company = await tx.one(
          "SELECT id, balance FROM Company WHERE id = ? FOR UPDATE", 
          [companyId]
        );

        if (!company || Number(company.balance) < Number(insurance.monthlyRate)) {
          const err = new Error("INSUFFICIENT_FUNDS");
          err.code = "INSUFFICIENT_FUNDS";
          throw err;
        }

        const paymentId = generateId();
        const transactionId = generateId();

        const deductResult = await tx.run(
          "UPDATE Company SET balance = balance - ?, updatedAt = NOW() WHERE id = ? AND balance >= ?",
          [insurance.monthlyRate, companyId, insurance.monthlyRate]
        );

        if (deductResult.affectedRows === 0) {
          const err = new Error("INSUFFICIENT_FUNDS");
          err.code = "INSUFFICIENT_FUNDS";
          throw err;
        }

        await tx.run(
          "INSERT INTO InsurancePayment (id, insuranceId, amount, month, year, paidAt, paidBy) VALUES (?, ?, ?, ?, ?, NOW(), ?)",
          [paymentId, insuranceId, insurance.monthlyRate, parsedMonth, parsedYear, session.user.name]
        );

        await tx.run(
          "INSERT INTO CompanyTransaction (id, companyId, type, amount, category, description, date) VALUES (?, ?, 'EXPENSE', ?, 'Ubezpieczenia', ?, NOW())",
          [transactionId, companyId, insurance.monthlyRate, `Zarząd: Opłacono składkę ubezpieczeniową ${insurance.type} za ${parsedMonth}/${parsedYear}`]
        );
      });

      const responseData = { success: true };

      if (idempotencyKey) {
        await recordIdempotency(idempotencyKey, "PAY_INSURANCE", 200, responseData, db);
      }

      return NextResponse.json(responseData, {
        status: 200,
        headers: { "Cache-Control": "private, no-cache, no-store, must-revalidate" }
      });
    });

  } catch (error) {
    if (error.code === "ALREADY_PAID") {
      return NextResponse.json({ error: "Ta składka została już opłacona." }, { status: 400 });
    }
    if (error.code === "INSUFFICIENT_FUNDS") {
      return NextResponse.json({ error: "Niewystarczające środki firmy na opłacenie składki." }, { status: 400 });
    }
    if (error.code === "INSURANCE_NOT_FOUND") {
      return NextResponse.json({ error: "Nie znaleziono ubezpieczenia." }, { status: 404 });
    }
    console.error("Insurance Pay Error:", error);
    return NextResponse.json({ error: "Wystąpił błąd podczas opłacania składki" }, { status: 500 });
  }
}
