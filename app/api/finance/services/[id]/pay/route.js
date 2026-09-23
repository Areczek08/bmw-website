import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "../../../../auth/[...nextauth]/route";
import { dbSession, generateId } from "../../../../../../lib/db";
import { extractIdempotencyKey, checkIdempotency, recordIdempotency } from "../../../../../../lib/idempotency";

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

    const body = await req.json().catch(() => ({}));
    const idempotencyKey = extractIdempotencyKey(req, body);
    const companyId = session.user.companyId || "BMS";

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

      // 2. Atomic Transaction
      await db.transaction(async (tx) => {
        const invoice = await tx.one(
          "SELECT id, amount, status, type, title FROM ServiceInvoice WHERE id = ? FOR UPDATE", 
          [invoiceId]
        );

        if (!invoice) {
          const err = new Error("INVOICE_NOT_FOUND");
          err.code = "INVOICE_NOT_FOUND";
          throw err;
        }

        if (invoice.status === "PAID") {
          const err = new Error("ALREADY_PAID");
          err.code = "ALREADY_PAID";
          throw err;
        }

        const company = await tx.one(
          "SELECT id, balance FROM Company WHERE id = ? FOR UPDATE", 
          [companyId]
        );

        if (!company || Number(company.balance) < Number(invoice.amount)) {
          const err = new Error("INSUFFICIENT_FUNDS");
          err.code = "INSUFFICIENT_FUNDS";
          throw err;
        }

        const transactionId = generateId();

        const deductResult = await tx.run(
          "UPDATE Company SET balance = balance - ?, updatedAt = NOW() WHERE id = ? AND balance >= ?",
          [invoice.amount, companyId, invoice.amount]
        );

        if (deductResult.affectedRows === 0) {
          const err = new Error("INSUFFICIENT_FUNDS");
          err.code = "INSUFFICIENT_FUNDS";
          throw err;
        }

        await tx.run("UPDATE ServiceInvoice SET status = 'PAID', paidAt = NOW() WHERE id = ?", [invoiceId]);

        await tx.run(
          "INSERT INTO CompanyTransaction (id, companyId, type, amount, category, description, date) VALUES (?, ?, 'EXPENSE', ?, ?, ?, NOW())",
          [transactionId, companyId, invoice.amount, invoice.type === "TIRES" ? "Opony" : "Serwis / Naprawa", `Zarząd: Opłacono fakturę za ${invoice.title}`]
        );
      });

      const responseData = { success: true };

      if (idempotencyKey) {
        await recordIdempotency(idempotencyKey, "PAY_SERVICE_INVOICE", 200, responseData, db);
      }

      return NextResponse.json(responseData, {
        status: 200,
        headers: { "Cache-Control": "private, no-cache, no-store, must-revalidate" }
      });
    });

  } catch (error) {
    if (error.code === "ALREADY_PAID") {
      return NextResponse.json({ error: "Faktura jest już opłacona." }, { status: 400 });
    }
    if (error.code === "INSUFFICIENT_FUNDS") {
      return NextResponse.json({ error: "Niewystarczające środki na koncie firmy." }, { status: 400 });
    }
    if (error.code === "INVOICE_NOT_FOUND") {
      return NextResponse.json({ error: "Faktura nie istnieje." }, { status: 404 });
    }
    console.error("Pay Service Invoice Error:", error);
    return NextResponse.json({ error: "Wystąpił błąd podczas opłacania faktury" }, { status: 500 });
  }
}
