import { NextResponse } from "next/server";
import { dbSession, generateId } from "../../../../lib/db";
import { getServerSession } from "next-auth/next";
import { authOptions } from "../../auth/[...nextauth]/route";
import { extractIdempotencyKey, checkIdempotency, recordIdempotency } from "../../../../lib/idempotency";

export async function POST(req) {
  try {
    const session = await getServerSession(authOptions);

    if (!session || !session.user || (session.user.role !== "BOARD" && session.user.role !== "OWNER")) {
      return NextResponse.json({ error: "Brak uprawnień do przelewów." }, { status: 403 });
    }

    const body = await req.json();
    const { userId, amount, title, date } = body;

    const parsedAmount = parseFloat(amount);
    if (!userId || isNaN(parsedAmount) || parsedAmount <= 0 || !title) {
      return NextResponse.json({ error: "Nieprawidłowe dane przelewu." }, { status: 400 });
    }

    const idempotencyKey = extractIdempotencyKey(req, body);
    const companyId = session.user.companyId || "BMS";
    const executionDate = date ? new Date(date) : new Date();

    const bankTransactionId = generateId();
    const txId = generateId();

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

      // 2. Transaction with row-level locks and atomic balance verification
      const result = await db.transaction(async (tx) => {
        const company = await tx.one("SELECT id, balance FROM Company WHERE id = ? FOR UPDATE", [companyId]);
        if (!company) {
          const err = new Error("COMPANY_NOT_FOUND");
          err.code = "COMPANY_NOT_FOUND";
          throw err;
        }

        if (Number(company.balance) < parsedAmount) {
          const err = new Error("INSUFFICIENT_FUNDS");
          err.code = "INSUFFICIENT_FUNDS";
          throw err;
        }

        const recipient = await tx.one("SELECT id, name, firstName FROM User WHERE id = ?", [userId]);
        if (!recipient) {
          const err = new Error("RECIPIENT_NOT_FOUND");
          err.code = "RECIPIENT_NOT_FOUND";
          throw err;
        }

        // Atomic deduction with balance guard
        const deductResult = await tx.run(
          "UPDATE Company SET balance = balance - ?, updatedAt = NOW() WHERE id = ? AND balance >= ?",
          [parsedAmount, companyId, parsedAmount]
        );

        if (deductResult.affectedRows === 0) {
          const err = new Error("INSUFFICIENT_FUNDS");
          err.code = "INSUFFICIENT_FUNDS";
          throw err;
        }

        await tx.run(
          "UPDATE User SET accountBalance = accountBalance + ?, updatedAt = NOW() WHERE id = ?",
          [parsedAmount, userId]
        );

        await tx.run(
          "INSERT INTO BankTransaction (id, userId, amount, title, date) VALUES (?, ?, ?, ?, ?)",
          [bankTransactionId, userId, parsedAmount, title, executionDate]
        );

        await tx.run(
          "INSERT INTO CompanyTransaction (id, companyId, type, amount, category, description, date) VALUES (?, ?, 'EXPENSE', ?, 'Pensje', ?, ?)",
          [txId, companyId, parsedAmount, `Przelew: ${title}`, executionDate]
        );

        const updatedCompany = await tx.one("SELECT balance FROM Company WHERE id = ?", [companyId]);
        const bankTransaction = await tx.one(
          "SELECT id, userId, amount, title, date FROM BankTransaction WHERE id = ?",
          [bankTransactionId]
        );

        return {
          companyBalance: updatedCompany?.balance,
          bankTransaction
        };
      });

      const responseData = { 
        success: true, 
        companyBalance: result.companyBalance, 
        bankTransaction: result.bankTransaction 
      };

      if (idempotencyKey) {
        await recordIdempotency(idempotencyKey, "FINANCE_TRANSFER", 200, responseData, db);
      }

      return NextResponse.json(responseData, {
        status: 200,
        headers: { "Cache-Control": "private, no-cache, no-store, must-revalidate" }
      });
    });
  } catch (error) {
    if (error.code === "INSUFFICIENT_FUNDS") {
      return NextResponse.json({ error: "Brak wystarczających środków na koncie firmy." }, { status: 400 });
    }
    if (error.code === "RECIPIENT_NOT_FOUND") {
      return NextResponse.json({ error: "Odbiorca nie istnieje." }, { status: 404 });
    }
    console.error("Błąd podczas realizacji przelewu:", error);
    return NextResponse.json({ error: "Wystąpił błąd." }, { status: 500 });
  }
}
