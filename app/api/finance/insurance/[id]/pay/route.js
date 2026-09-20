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

    const { id: insuranceId } = await params;
    const { month, year } = await req.json();

    const insurance = await dbOne("SELECT * FROM Insurance WHERE id = ?", [insuranceId]);

    if (!insurance) return NextResponse.json({ error: "Nie znaleziono ubezpieczenia" }, { status: 404 });

    const companyId = session.user.companyId || "BMS";
    const company = await dbOne("SELECT * FROM Company WHERE id = ?", [companyId]);
    if (!company || company.balance < insurance.monthlyRate) {
      return NextResponse.json({ error: "Niewystarczające środki firmy na opłacenie składki" }, { status: 400 });
    }

    const alreadyPaid = await dbOne(
      "SELECT * FROM InsurancePayment WHERE insuranceId = ? AND month = ? AND year = ?",
      [insuranceId, parseInt(month), parseInt(year)]
    );

    if (alreadyPaid) {
      return NextResponse.json({ error: "Ta składka została już opłacona" }, { status: 400 });
    }

    const paymentId = generateId();
    const transactionId = generateId();

    await dbRun("UPDATE Company SET balance = balance - ?, updatedAt = NOW() WHERE id = ?", [insurance.monthlyRate, companyId]);
    await dbRun(
      "INSERT INTO InsurancePayment (id, insuranceId, amount, month, year, paidAt, paidBy) VALUES (?, ?, ?, ?, ?, NOW(), ?)",
      [paymentId, insuranceId, insurance.monthlyRate, parseInt(month), parseInt(year), session.user.name]
    );
    await dbRun(
      "INSERT INTO CompanyTransaction (id, companyId, type, amount, category, description, date) VALUES (?, ?, 'EXPENSE', ?, 'Ubezpieczenia', ?, NOW())",
      [transactionId, companyId, insurance.monthlyRate, `Zarząd: Opłacono składkę ubezpieczeniową ${insurance.type} za ${month}/${year}`]
    );

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Insurance Pay Error:", error);
    return NextResponse.json({ error: "Wystąpił błąd podczas opłacania składki" }, { status: 500 });
  }
}
