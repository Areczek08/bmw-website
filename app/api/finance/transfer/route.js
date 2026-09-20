import { NextResponse } from "next/server";
import { db, generateId } from "../../../../lib/db";
import { getServerSession } from "next-auth/next";
import { authOptions } from "../../auth/[...nextauth]/route";

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

    const companyId = session.user.companyId || "BMS";
    const executionDate = date ? new Date(date) : new Date();

    const bankTransactionId = generateId();
    const txId = generateId();

    const result = await db(async (conn) => {
      await conn.query("START TRANSACTION");
      try {
        await conn.query("UPDATE Company SET balance = balance - ?, updatedAt = NOW() WHERE id = ?", [parsedAmount, companyId]);
        await conn.query("UPDATE User SET accountBalance = accountBalance + ?, updatedAt = NOW() WHERE id = ?", [parsedAmount, userId]);

        await conn.query(
          "INSERT INTO BankTransaction (id, userId, amount, title, date) VALUES (?, ?, ?, ?, ?)",
          [bankTransactionId, userId, parsedAmount, title, executionDate]
        );

        await conn.query(
          "INSERT INTO CompanyTransaction (id, companyId, type, amount, category, description, date) VALUES (?, ?, 'EXPENSE', ?, 'Pensje', ?, ?)",
          [txId, companyId, parsedAmount, `Przelew: ${title}`, executionDate]
        );

        await conn.query("COMMIT");

        const company = (await conn.query("SELECT balance FROM Company WHERE id = ?", [companyId]))[0];
        const bankTransaction = (await conn.query("SELECT * FROM BankTransaction WHERE id = ?", [bankTransactionId]))[0];

        return { companyBalance: company?.balance, bankTransaction };
      } catch (txErr) {
        await conn.query("ROLLBACK");
        throw txErr;
      }
    });

    return NextResponse.json({ success: true, companyBalance: result.companyBalance, bankTransaction: result.bankTransaction });
  } catch (error) {
    console.error("Błąd podczas realizacji przelewu:", error);
    return NextResponse.json({ error: "Wystąpił błąd." }, { status: 500 });
  }
}
