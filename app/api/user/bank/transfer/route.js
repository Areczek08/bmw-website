import { NextResponse } from "next/server";
import { dbSession, generateId } from "../../../../../lib/db";
import { getServerSession } from "next-auth/next";
import { authOptions } from "../../../auth/[...nextauth]/route";
import { extractIdempotencyKey, checkIdempotency, recordIdempotency } from "../../../../../lib/idempotency";

export async function POST(req) {
  try {
    const session = await getServerSession(authOptions);

    if (!session || !session.user) {
      return NextResponse.json({ error: "Brak autoryzacji" }, { status: 401 });
    }

    const companyId = session.user.companyId || "BMS";
    const body = await req.json();
    const { receiverId, amount, title } = body;

    const parsedAmount = parseFloat(amount);
    if (!receiverId || isNaN(parsedAmount) || parsedAmount <= 0 || !title) {
      return NextResponse.json({ error: "Nieprawidłowe dane przelewu." }, { status: 400 });
    }

    if (receiverId === session.user.id) {
      return NextResponse.json({ error: "Nie możesz przelać środków do siebie." }, { status: 400 });
    }

    const idempotencyKey = extractIdempotencyKey(req, body);

    // Prowizja (1%, min 1 zł)
    const commission = Math.max(1, parsedAmount * 0.01);
    const totalCost = parsedAmount + commission;

    // Sprawdź limit 10000 dziennie
    const startOfDay = new Date();
    startOfDay.setHours(0, 0, 0, 0);

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

      // 2. Atomic Transaction with row-level lock and zero Base64 loading
      await db.transaction(async (tx) => {
        // Query sender with FOR UPDATE to prevent concurrent overdrafts and serialize transfers
        const sender = await tx.one(
          "SELECT id, name, firstName, accountBalance FROM User WHERE id = ? FOR UPDATE",
          [session.user.id]
        );

        if (!sender) {
          const err = new Error("SENDER_NOT_FOUND");
          err.code = "SENDER_NOT_FOUND";
          throw err;
        }

        // Daily limit checked inside the transaction under the sender FOR UPDATE lock
        const sumResult = await tx.one(`
          SELECT COALESCE(SUM(amount), 0) as totalAmount 
          FROM BankTransaction 
          WHERE userId = ? AND amount < 0 AND date >= ? AND title LIKE 'Przelew wychodzący do:%'
        `, [session.user.id, startOfDay]);

        const spentToday = Math.abs(Number(sumResult?.totalAmount || 0));

        if (spentToday + parsedAmount > 10000) {
          const err = new Error("DAILY_LIMIT_EXCEEDED");
          err.code = "DAILY_LIMIT_EXCEEDED";
          err.spentToday = spentToday;
          throw err;
        }

        const receiver = await tx.one(
          "SELECT id, name, firstName, driverStatus, accountBalance FROM User WHERE id = ?",
          [receiverId]
        );

        if (!receiver || receiver.driverStatus === "WAITING_FOR_APPROVAL" || receiver.driverStatus === "INACTIVE") {
          const err = new Error("RECEIVER_INVALID");
          err.code = "RECEIVER_INVALID";
          throw err;
        }

        if (Number(sender.accountBalance) < totalCost) {
          const err = new Error("INSUFFICIENT_FUNDS");
          err.code = "INSUFFICIENT_FUNDS";
          throw err;
        }

        // Atomic deduction with balance guard in WHERE clause
        const deductResult = await tx.run(
          "UPDATE User SET accountBalance = accountBalance - ?, updatedAt = NOW() WHERE id = ? AND accountBalance >= ?",
          [totalCost, sender.id, totalCost]
        );

        if (deductResult.affectedRows === 0) {
          const err = new Error("INSUFFICIENT_FUNDS");
          err.code = "INSUFFICIENT_FUNDS";
          throw err;
        }

        // Credit receiver
        await tx.run(
          "UPDATE User SET accountBalance = accountBalance + ?, updatedAt = NOW() WHERE id = ?",
          [parsedAmount, receiver.id]
        );
        
        const txId1 = generateId();
        await tx.run("INSERT INTO BankTransaction (id, userId, amount, title, date) VALUES (?, ?, ?, ?, NOW())", [
          txId1, sender.id, -totalCost, `Przelew wychodzący do: ${receiver.name || receiver.firstName} - ${title} (prowizja: ${commission.toFixed(2)} zł)`
        ]);

        const txId2 = generateId();
        await tx.run("INSERT INTO BankTransaction (id, userId, amount, title, date) VALUES (?, ?, ?, ?, NOW())", [
          txId2, receiver.id, parsedAmount, `Przelew przychodzący od: ${sender.name || sender.firstName} - ${title}`
        ]);

        await tx.run(`
          INSERT INTO Company (id, name, balance, createdAt, updatedAt) 
          VALUES (?, ?, ?, NOW(), NOW()) 
          ON DUPLICATE KEY UPDATE balance = balance + ?, updatedAt = NOW()
        `, [companyId, companyId, commission, commission]);

        const cTxId = generateId();
        await tx.run(`
          INSERT INTO CompanyTransaction (id, companyId, type, amount, category, description, date) 
          VALUES (?, ?, 'INCOME', ?, 'Inne', ?, NOW())
        `, [cTxId, companyId, commission, `Prowizja bankowa od przelewu od ${sender.name || sender.firstName} do ${receiver.name || receiver.firstName}`]);
      });

      const responseData = { success: true, message: "Przelew został zrealizowany pomyślnie." };

      if (idempotencyKey) {
        await recordIdempotency(idempotencyKey, "USER_BANK_TRANSFER", 200, responseData, db);
      }

      return NextResponse.json(responseData, {
        status: 200,
        headers: { "Cache-Control": "private, no-cache, no-store, must-revalidate" }
      });
    });

  } catch (error) {
    if (error.code === "DAILY_LIMIT_EXCEEDED") {
      return NextResponse.json({ 
        error: `Przekroczono dzienny limit przelewów (10 000 PLN). Dzisiaj wydałeś już ${error.spentToday.toFixed(2)} PLN na przelewy.` 
      }, { status: 400 });
    }
    if (error.code === "INSUFFICIENT_FUNDS") {
      return NextResponse.json({ 
        error: "Niewystarczające środki na koncie na realizację tego przelewu." 
      }, { status: 400 });
    }
    if (error.code === "RECEIVER_INVALID") {
      return NextResponse.json({ error: "Odbiorca nie istnieje lub nie jest aktywny." }, { status: 404 });
    }
    console.error("Błąd P2P transfer:", error);
    return NextResponse.json({ error: "Wystąpił błąd serwera podczas przelewu." }, { status: 500 });
  }
}
