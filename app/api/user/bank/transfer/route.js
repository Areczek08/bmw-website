import { NextResponse } from "next/server";
import { db, dbOne, generateId } from "../../../../../lib/db";
import { getServerSession } from "next-auth/next";
import { authOptions } from "../../../auth/[...nextauth]/route";

export async function POST(req) {
  try {
    const session = await getServerSession(authOptions);

    if (!session || !session.user) {
      return NextResponse.json({ error: "Brak autoryzacji" }, { status: 401 });
    }

    const companyId = session.user.companyId || "BMS";

    const { receiverId, amount, title } = await req.json();

    const parsedAmount = parseFloat(amount);
    if (!receiverId || isNaN(parsedAmount) || parsedAmount <= 0 || !title) {
      return NextResponse.json({ error: "Nieprawidłowe dane przelewu." }, { status: 400 });
    }

    if (receiverId === session.user.id) {
      return NextResponse.json({ error: "Nie możesz przelać środków do siebie." }, { status: 400 });
    }

    // Prowizja (1%, min 1 zł)
    const commission = Math.max(1, parsedAmount * 0.01);
    const totalCost = parsedAmount + commission;

    // Sprawdź limit 10000 dziennie
    const startOfDay = new Date();
    startOfDay.setHours(0, 0, 0, 0);

    const sumResult = await dbOne(`
      SELECT COALESCE(SUM(amount), 0) as totalAmount 
      FROM BankTransaction 
      WHERE userId = ? AND amount < 0 AND date >= ? AND title LIKE 'Przelew wychodzący do:%'
    `, [session.user.id, startOfDay]);

    const spentToday = Math.abs(Number(sumResult?.totalAmount || 0));

    if (spentToday + parsedAmount > 10000) {
      return NextResponse.json({ error: `Przekroczono dzienny limit przelewów (10 000 PLN). Dzisiaj wydałeś już ${spentToday.toFixed(2)} PLN na przelewy.` }, { status: 400 });
    }

    const sender = await dbOne("SELECT * FROM User WHERE id = ?", [session.user.id]);
    const receiver = await dbOne("SELECT * FROM User WHERE id = ?", [receiverId]);

    if (!sender) return NextResponse.json({ error: "Brak nadawcy" }, { status: 404 });
    if (!receiver || receiver.driverStatus === "WAITING_FOR_APPROVAL" || receiver.driverStatus === "INACTIVE") {
      return NextResponse.json({ error: "Odbiorca nie istnieje lub nie jest aktywny" }, { status: 404 });
    }

    if (sender.accountBalance < totalCost) {
      return NextResponse.json({ error: `Niewystarczające środki. Wymagane: ${totalCost.toFixed(2)} PLN (w tym bankowa prowizja ${commission.toFixed(2)} PLN).` }, { status: 400 });
    }

    await db(async (conn) => {
      await conn.query("START TRANSACTION");
      try {
        await conn.query("UPDATE User SET accountBalance = accountBalance - ?, updatedAt = NOW() WHERE id = ?", [totalCost, sender.id]);
        await conn.query("UPDATE User SET accountBalance = accountBalance + ?, updatedAt = NOW() WHERE id = ?", [parsedAmount, receiver.id]);
        
        const txId1 = generateId();
        await conn.query("INSERT INTO BankTransaction (id, userId, amount, title, date) VALUES (?, ?, ?, ?, NOW())", [
          txId1, sender.id, -totalCost, `Przelew wychodzący do: ${receiver.name || receiver.firstName} - ${title} (prowizja: ${commission.toFixed(2)} zł)`
        ]);

        const txId2 = generateId();
        await conn.query("INSERT INTO BankTransaction (id, userId, amount, title, date) VALUES (?, ?, ?, ?, NOW())", [
          txId2, receiver.id, parsedAmount, `Przelew przychodzący od: ${sender.name || sender.firstName} - ${title}`
        ]);

        await conn.query(`
          INSERT INTO Company (id, name, balance) 
          VALUES (?, ?, ?) 
          ON DUPLICATE KEY UPDATE balance = balance + ?
        `, [companyId, companyId, commission, commission]);

        const cTxId = generateId();
        await conn.query(`
          INSERT INTO CompanyTransaction (id, companyId, type, amount, category, description, date) 
          VALUES (?, ?, 'INCOME', ?, 'Inne', ?, NOW())
        `, [cTxId, companyId, commission, `Prowizja bankowa od przelewu od ${sender.name || sender.firstName} do ${receiver.name || receiver.firstName}`]);
        
        await conn.query("COMMIT");
      } catch (err) {
        await conn.query("ROLLBACK");
        throw err;
      }
    });

    return NextResponse.json({ success: true, message: "Przelew został zrealizowany pomyślnie." });

  } catch (error) {
    console.error("Błąd P2P transfer:", error);
    return NextResponse.json({ error: "Wystąpił błąd serwera podczas przelewu." }, { status: 500 });
  }
}
