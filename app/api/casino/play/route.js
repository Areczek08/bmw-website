import { NextResponse } from "next/server";
import { dbSession, generateId } from "../../../../lib/db";
import { getServerSession } from "next-auth/next";
import { authOptions } from "../../auth/[...nextauth]/route";

export async function POST(req) {
  try {
    const session = await getServerSession(authOptions);
    if (!session || !session.user) {
      return NextResponse.json({ error: "Brak dostępu." }, { status: 401 });
    }

    const body = await req.json();
    const { game, betAmount, betType } = body; // game: ROULETTE | SLOTS

    const parsedBet = parseFloat(betAmount);
    if (isNaN(parsedBet) || parsedBet <= 0 || !Number.isFinite(parsedBet)) {
      return NextResponse.json({ error: "Kwota zakładu musi być większa niż 0." }, { status: 400 });
    }

    return await dbSession(async (db) => {
      const result = await db.transaction(async (tx) => {
        // 1. SELECT konta gracza FOR UPDATE
        const user = await tx.one(
          "SELECT id, companyId, accountBalance FROM User WHERE id = ? FOR UPDATE",
          [session.user.id]
        );

        if (!user) {
          const err = new Error("USER_NOT_FOUND");
          err.code = "USER_NOT_FOUND";
          throw err;
        }

        // 2. sprawdzenie salda
        if (Number(user.accountBalance) < parsedBet) {
          const err = new Error("INSUFFICIENT_FUNDS");
          err.code = "INSUFFICIENT_FUNDS";
          throw err;
        }

        // 3. obliczenie wyniku
        let winAmount = 0;
        let gameResult = "";

        if (game === "ROULETTE") {
          const roll = Math.floor(Math.random() * 37);
          let color = "";
          if (roll === 0) color = "GREEN";
          else if (roll <= 18) color = "RED";
          else color = "BLACK";

          gameResult = color;

          if (betType === color) {
            winAmount = color === "GREEN" ? parsedBet * 36 : parsedBet * 2;
          }
        } else if (game === "SLOTS") {
          const symbols = ["🍒", "🍋", "🍊", "🍇", "💎", "7️⃣"];
          const isWin = Math.random() < 0.25;
          
          let r1, r2, r3;
          
          if (isWin) {
            const winSymbol = symbols[Math.floor(Math.random() * symbols.length)];
            r1 = winSymbol; r2 = winSymbol; r3 = winSymbol;
          } else {
            r1 = symbols[Math.floor(Math.random() * symbols.length)];
            r2 = symbols[Math.floor(Math.random() * symbols.length)];
            r3 = symbols[Math.floor(Math.random() * symbols.length)];
            if (r1 === r2 && r2 === r3) {
              r3 = symbols[(symbols.indexOf(r1) + 1) % symbols.length];
            }
          }

          gameResult = `${r1}|${r2}|${r3}`;

          if (isWin) {
            if (r1 === "7️⃣") winAmount = parsedBet * 10;
            else if (r1 === "💎") winAmount = parsedBet * 5;
            else winAmount = parsedBet * 3;
          }
        } else {
          const err = new Error("INVALID_GAME");
          err.code = "INVALID_GAME";
          throw err;
        }

        // 4. aktualizacja salda użytkownika
        const netChange = winAmount - parsedBet;
        const deductResult = await tx.run(
          "UPDATE User SET accountBalance = accountBalance + ?, updatedAt = NOW() WHERE id = ? AND (accountBalance - ?) >= 0",
          [netChange, user.id, parsedBet]
        );

        if (deductResult.affectedRows === 0) {
          const err = new Error("INSUFFICIENT_FUNDS");
          err.code = "INSUFFICIENT_FUNDS";
          throw err;
        }

        const companyId = user.companyId || session.user.companyId || "BMS";

        // 5. aktualizacja salda firmy
        await tx.run(`
          INSERT INTO Company (id, name, balance, createdAt, updatedAt)
          VALUES (?, ?, ?, NOW(), NOW())
          ON DUPLICATE KEY UPDATE balance = balance - ?, updatedAt = NOW()
        `, [companyId, companyId, -netChange, netChange]);

        // 6. zapis BankTransaction
        const bTxId = generateId();
        const txTitle = winAmount > 0 
          ? `Kasyno [${game}]: Wygrana +${winAmount.toFixed(2)} PLN (stawka ${parsedBet.toFixed(2)} PLN)` 
          : `Kasyno [${game}]: Przegrana -${parsedBet.toFixed(2)} PLN`;

        await tx.run(
          "INSERT INTO BankTransaction (id, userId, amount, title, date) VALUES (?, ?, ?, ?, NOW())",
          [bTxId, user.id, netChange, txTitle]
        );

        // Zapis CasinoLog
        const logId = generateId();
        await tx.run(`
          INSERT INTO CasinoLog (id, userId, game, betAmount, winAmount, result, createdAt)
          VALUES (?, ?, ?, ?, ?, ?, NOW())
        `, [logId, user.id, game, parsedBet, winAmount, gameResult]);

        // Pobranie nowego salda
        const updatedUser = await tx.one("SELECT accountBalance FROM User WHERE id = ?", [user.id]);

        return {
          winAmount,
          result: gameResult,
          newBalance: Number(updatedUser?.accountBalance || 0)
        };
      });

      return NextResponse.json({
        success: true,
        winAmount: result.winAmount,
        result: result.result,
        newBalance: result.newBalance
      });
    });

  } catch (error) {
    if (error.code === "INSUFFICIENT_FUNDS") {
      return NextResponse.json({ error: "Niewystarczające środki na koncie." }, { status: 400 });
    }
    if (error.code === "INVALID_GAME") {
      return NextResponse.json({ error: "Nieznana gra." }, { status: 400 });
    }
    console.error("Błąd kasyna:", error);
    return NextResponse.json({ error: "Wystąpił błąd podczas gry." }, { status: 500 });
  }
}
