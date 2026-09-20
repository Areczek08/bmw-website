import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "../../../../auth/[...nextauth]/route";
import { dbOne, dbRun, generateId } from "../../../../../../lib/db";

export async function POST(req, { params }) {
  try {
    const session = await getServerSession(authOptions);
    if (!session || !["OWNER", "BOARD"].includes(session.user.role)) {
      return NextResponse.json({ error: "Brak uprawnień" }, { status: 403 });
    }

    const { id: baseId } = await params;
    const { month, year } = await req.json();

    const base = await dbOne("SELECT * FROM CompanyBase WHERE id = ?", [baseId]);

    if (!base) return NextResponse.json({ error: "Nie znaleziono bazy" }, { status: 404 });

    const companyId = session.user.companyId || "BMS";
    const company = await dbOne("SELECT * FROM Company WHERE id = ?", [companyId]);
    
    if (!company || company.balance < base.monthlyCost) {
      return NextResponse.json({ error: "Niewystarczające środki firmy na opłacenie czynszu za bazę" }, { status: 400 });
    }

    const alreadyPaid = await dbOne(
      "SELECT * FROM BasePayment WHERE baseId = ? AND month = ? AND year = ?",
      [baseId, parseInt(month), parseInt(year)]
    );

    if (alreadyPaid) {
      return NextResponse.json({ error: "Czynsz za ten miesiąc został już opłacony" }, { status: 400 });
    }

    const paymentId = generateId();
    const transactionId = generateId();

    await dbRun("UPDATE Company SET balance = balance - ?, updatedAt = NOW() WHERE id = ?", [base.monthlyCost, companyId]);
    await dbRun(
      "INSERT INTO BasePayment (id, baseId, amount, month, year, paidAt, paidBy) VALUES (?, ?, ?, ?, ?, NOW(), ?)",
      [paymentId, baseId, base.monthlyCost, parseInt(month), parseInt(year), session.user.name]
    );
    await dbRun(
      "INSERT INTO CompanyTransaction (id, companyId, type, amount, category, description, date) VALUES (?, ?, 'EXPENSE', ?, 'Bazy Firmowe', ?, NOW())",
      [transactionId, companyId, base.monthlyCost, `Zarząd: Opłacono czynsz bazy ${base.name} (${base.city}) za ${month}/${year}`]
    );

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Base Pay Error:", error);
    return NextResponse.json({ error: "Wystąpił błąd podczas opłacania czynszu" }, { status: 500 });
  }
}
