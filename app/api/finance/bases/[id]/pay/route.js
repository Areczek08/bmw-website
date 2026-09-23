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

    const { id: baseId } = await params;
    const body = await req.json();
    const { month, year } = body;

    const parsedMonth = parseInt(month, 10);
    const parsedYear = parseInt(year, 10);

    if (!baseId || isNaN(parsedMonth) || isNaN(parsedYear)) {
      return NextResponse.json({ error: "Nieprawidłowe dane bazy, miesiąca lub roku." }, { status: 400 });
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
        const base = await tx.one("SELECT id, name, city, monthlyCost FROM CompanyBase WHERE id = ?", [baseId]);
        if (!base) {
          const err = new Error("BASE_NOT_FOUND");
          err.code = "BASE_NOT_FOUND";
          throw err;
        }

        const alreadyPaid = await tx.one(
          "SELECT id FROM BasePayment WHERE baseId = ? AND month = ? AND year = ? FOR UPDATE",
          [baseId, parsedMonth, parsedYear]
        );

        if (alreadyPaid) {
          const err = new Error("ALREADY_PAID");
          err.code = "ALREADY_PAID";
          throw err;
        }

        const company = await tx.one("SELECT id, balance FROM Company WHERE id = ? FOR UPDATE", [companyId]);
        if (!company || Number(company.balance) < Number(base.monthlyCost)) {
          const err = new Error("INSUFFICIENT_FUNDS");
          err.code = "INSUFFICIENT_FUNDS";
          throw err;
        }

        const paymentId = generateId();
        const transactionId = generateId();

        const deductResult = await tx.run(
          "UPDATE Company SET balance = balance - ?, updatedAt = NOW() WHERE id = ? AND balance >= ?",
          [base.monthlyCost, companyId, base.monthlyCost]
        );

        if (deductResult.affectedRows === 0) {
          const err = new Error("INSUFFICIENT_FUNDS");
          err.code = "INSUFFICIENT_FUNDS";
          throw err;
        }

        await tx.run(
          "INSERT INTO BasePayment (id, baseId, amount, month, year, paidAt, paidBy) VALUES (?, ?, ?, ?, ?, NOW(), ?)",
          [paymentId, baseId, base.monthlyCost, parsedMonth, parsedYear, session.user.name]
        );

        await tx.run(
          "INSERT INTO CompanyTransaction (id, companyId, type, amount, category, description, date) VALUES (?, ?, 'EXPENSE', ?, 'Bazy Firmowe', ?, NOW())",
          [transactionId, companyId, base.monthlyCost, `Zarząd: Opłacono czynsz bazy ${base.name} (${base.city}) za ${parsedMonth}/${parsedYear}`]
        );
      });

      const responseData = { success: true };

      if (idempotencyKey) {
        await recordIdempotency(idempotencyKey, "PAY_BASE", 200, responseData, db);
      }

      return NextResponse.json(responseData, {
        status: 200,
        headers: { "Cache-Control": "private, no-cache, no-store, must-revalidate" }
      });
    });

  } catch (error) {
    if (error.code === "ALREADY_PAID") {
      return NextResponse.json({ error: "Czynsz za ten miesiąc został już opłacony." }, { status: 400 });
    }
    if (error.code === "INSUFFICIENT_FUNDS") {
      return NextResponse.json({ error: "Niewystarczające środki firmy na opłacenie czynszu za bazę." }, { status: 400 });
    }
    if (error.code === "BASE_NOT_FOUND") {
      return NextResponse.json({ error: "Nie znaleziono bazy." }, { status: 404 });
    }
    console.error("Base Pay Error:", error);
    return NextResponse.json({ error: "Wystąpił błąd podczas opłacania czynszu" }, { status: 500 });
  }
}
