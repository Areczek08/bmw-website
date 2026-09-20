import { NextResponse } from "next/server";
import { db, dbOne, generateId } from "../../../../lib/db";
import { getServerSession } from "next-auth/next";
import { authOptions } from "../../auth/[...nextauth]/route";

export async function POST(req) {
  try {
    const session = await getServerSession(authOptions);

    if (!session || !session.user) {
      return NextResponse.json({ error: "Brak autoryzacji" }, { status: 401 });
    }

    const { type, passed, score } = await req.json();

    const user = await dbOne("SELECT * FROM User WHERE id = ?", [session.user.id]);

    if (!user) return NextResponse.json({ error: "Brak użytkownika" }, { status: 404 });

    let updateQuery = "UPDATE User SET accountBalance = accountBalance - ?, updatedAt = NOW()";
    const updateParams = [];
    let cost = 0;
    let title = "";

    if (type === "license") {
      cost = 250;
      title = passed ? "Opłata za egzamin na Prawo Jazdy C+E" : "Opłata za oblaną próbę egzaminu na Prawo Jazdy C+E";
    } else if (type === "medical") {
      cost = 150;
      title = passed ? "Opłata za badania lekarskie i psychologiczne" : "Opłata za oblaną próbę badań psychologicznych";
    } else {
      return NextResponse.json({ error: "Nieprawidłowy typ egzaminu." }, { status: 400 });
    }

    if (user.accountBalance < cost) {
      return NextResponse.json({ error: "Masz niewystarczające środki na koncie, aby opłacić tę próbę!" }, { status: 400 });
    }

    updateParams.push(cost);

    if (passed) {
      if (type === "license") {
        const THREE_MONTHS = new Date();
        THREE_MONTHS.setMonth(THREE_MONTHS.getMonth() + 3);
        updateQuery += ", drivingLicenseExpiry = ?";
        updateParams.push(THREE_MONTHS);
      } else if (type === "medical") {
        const ONE_YEAR = new Date();
        ONE_YEAR.setFullYear(ONE_YEAR.getFullYear() + 1);
        updateQuery += ", medicalExamExpiry = ?";
        updateParams.push(ONE_YEAR);
      }
    }

    updateQuery += " WHERE id = ?";
    updateParams.push(user.id);

    await db(async (conn) => {
      await conn.query("START TRANSACTION");
      try {
        await conn.query(updateQuery, updateParams);
        
        const txId = generateId();
        await conn.query("INSERT INTO BankTransaction (id, userId, amount, title, date) VALUES (?, ?, ?, ?, NOW())", [
          txId, user.id, -cost, title
        ]);

        await conn.query("COMMIT");
      } catch (err) {
        await conn.query("ROLLBACK");
        throw err;
      }
    });

    if (!passed) {
      return NextResponse.json({ success: true, message: "Nie zdałeś egzaminu. Opłata za próbę została pobrana z konta." });
    }

    return NextResponse.json({ success: true, message: "Egzamin zdany pomyślnie!" });
  } catch (error) {
    console.error("Błąd podczas zapisywania wyniku egzaminu:", error);
    return NextResponse.json({ error: "Błąd serwera." }, { status: 500 });
  }
}
