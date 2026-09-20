import { NextResponse } from "next/server";
import { dbOne, dbRun, generateId } from "../../../../lib/db";
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

    if (!betAmount || betAmount <= 0) {
      return NextResponse.json({ error: "Kwota zakładu musi być większa niż 0." }, { status: 400 });
    }

    const user = await dbOne("SELECT id, accountBalance FROM User WHERE id = ?", [session.user.id]);
    if (!user || user.accountBalance < betAmount) {
      return NextResponse.json({ error: "Niewystarczające środki na koncie." }, { status: 400 });
    }

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
        winAmount = color === "GREEN" ? betAmount * 36 : betAmount * 2;
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
        if (r1 === "7️⃣") winAmount = betAmount * 10;
        else if (r1 === "💎") winAmount = betAmount * 5;
        else winAmount = betAmount * 3;
      }
    } else {
      return NextResponse.json({ error: "Nieznana gra." }, { status: 400 });
    }

    // Deduct bet
    await dbRun("UPDATE User SET accountBalance = accountBalance - ?, updatedAt = NOW() WHERE id = ?", [betAmount, user.id]);
    let finalBalance = user.accountBalance - betAmount;
    
    // Add win
    if (winAmount > 0) {
      await dbRun("UPDATE User SET accountBalance = accountBalance + ?, updatedAt = NOW() WHERE id = ?", [winAmount, user.id]);
      finalBalance += winAmount;
    }

    const balanceChange = winAmount - betAmount;
    await dbRun("UPDATE Company SET balance = balance - ?, updatedAt = NOW() WHERE id = ?", [balanceChange, "BMS"]);

    const logId = generateId();
    await dbRun(`
      INSERT INTO CasinoLog (id, userId, game, betAmount, winAmount, result, createdAt)
      VALUES (?, ?, ?, ?, ?, ?, NOW())
    `, [logId, user.id, game, betAmount, winAmount, gameResult]);

    return NextResponse.json({ success: true, winAmount, result: gameResult, newBalance: finalBalance });
  } catch (error) {
    console.error("Błąd kasyna:", error);
    return NextResponse.json({ error: "Wystąpił błąd podczas gry." }, { status: 500 });
  }
}
