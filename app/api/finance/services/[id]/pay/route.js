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

    const { id: invoiceId } = await params;
    if (!invoiceId) {
      return NextResponse.json({ error: "Brak ID faktury" }, { status: 400 });
    }

    const invoice = await dbOne("SELECT * FROM ServiceInvoice WHERE id = ?", [invoiceId]);

    if (!invoice) return NextResponse.json({ error: "Faktura nie istnieje" }, { status: 404 });
    if (invoice.status === "PAID") return NextResponse.json({ error: "Faktura jest już opłacona" }, { status: 400 });

    const companyId = session.user.companyId || "BMS";
    const company = await dbOne("SELECT * FROM Company WHERE id = ?", [companyId]);
    if (!company) return NextResponse.json({ error: "Brak profilu firmy" }, { status: 404 });

    if (company.balance < invoice.amount) {
      return NextResponse.json({ error: "Niewystarczające środki na koncie firmy" }, { status: 400 });
    }

    const transactionId = generateId();

    await dbRun("UPDATE Company SET balance = balance - ?, updatedAt = NOW() WHERE id = ?", [invoice.amount, companyId]);
    await dbRun("UPDATE ServiceInvoice SET status = 'PAID', paidAt = NOW() WHERE id = ?", [invoiceId]);
    await dbRun(
      "INSERT INTO CompanyTransaction (id, companyId, type, amount, category, description, date) VALUES (?, ?, 'EXPENSE', ?, ?, ?, NOW())",
      [transactionId, companyId, invoice.amount, invoice.type === "TIRES" ? "Opony" : "Serwis / Naprawa", `Zarząd: Opłacono fakturę za ${invoice.title}`]
    );

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Pay Service Invoice Error:", error);
    return NextResponse.json({ error: "Wystąpił błąd podczas opłacania faktury" }, { status: 500 });
  }
}
