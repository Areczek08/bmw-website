import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "../../../auth/[...nextauth]/route";
import { dbOne, dbRun, generateId } from "../../../../../lib/db";

export async function POST(req) {
  try {
    const session = await getServerSession(authOptions);
    if (!session || !["OWNER", "BOARD"].includes(session.user.role)) {
      return NextResponse.json({ error: "Brak uprawnień" }, { status: 403 });
    }

    const { leasingId, month, year } = await req.json();

    if (!leasingId || !month || !year) {
      return NextResponse.json({ error: "Brakuje danych (leasingId, month, year)" }, { status: 400 });
    }

    const leasing = await dbOne("SELECT * FROM Leasing WHERE id = ?", [leasingId]);

    if (!leasing) {
      return NextResponse.json({ error: "Leasing nie istnieje" }, { status: 404 });
    }

    const truck = await dbOne("SELECT * FROM Truck WHERE id = ?", [leasing.truckId]);
    leasing.truck = truck || null;

    const existingPayment = await dbOne(
      "SELECT * FROM LeasingPayment WHERE leasingId = ? AND month = ? AND year = ?",
      [leasingId, month, year]
    );

    if (existingPayment) {
      return NextResponse.json({ error: "Ta rata została już opłacona!" }, { status: 400 });
    }

    const companyId = session.user.companyId || "BMS";
    const company = await dbOne("SELECT * FROM Company WHERE id = ?", [companyId]);
    if (!company) {
      return NextResponse.json({ error: "Nie znaleziono ustawień firmy" }, { status: 404 });
    }

    if (company.balance < leasing.monthlyRate) {
      return NextResponse.json({ error: "Brak wystarczających środków na koncie firmowym!" }, { status: 400 });
    }

    const paymentId = generateId();
    const transactionId = generateId();

    await dbRun("UPDATE Company SET balance = balance - ?, updatedAt = NOW() WHERE id = ?", [leasing.monthlyRate, companyId]);
    await dbRun(
      "INSERT INTO CompanyTransaction (id, companyId, type, amount, category, description, date) VALUES (?, ?, 'EXPENSE', ?, 'Leasing', ?, NOW())",
      [transactionId, companyId, leasing.monthlyRate, `Rata leasingu - ${truck?.brand || 'Pojazd'} ${truck?.model || ''} (${truck?.plate || ''}) za ${month}/${year}`]
    );
    await dbRun(
      "INSERT INTO LeasingPayment (id, leasingId, amount, month, year, paidAt, paidBy) VALUES (?, ?, ?, ?, ?, NOW(), ?)",
      [paymentId, leasingId, leasing.monthlyRate, month, year, session.user.id]
    );

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Leasing Pay Error:", error);
    return NextResponse.json({ error: "Wystąpił błąd podczas opłacania raty" }, { status: 500 });
  }
}
