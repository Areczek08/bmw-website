import { NextResponse } from "next/server";
import crypto from "crypto";
import { dbAll, dbOne, dbRun, generateId } from "../../../../lib/db";
import { getServerSession } from "next-auth/next";
import { authOptions } from "../../auth/[...nextauth]/route";

export const dynamic = "force-dynamic";

export async function GET(req) {
  try {
    const session = await getServerSession(authOptions);
    if (!session || session.user.role !== "OWNER") {
      return NextResponse.json({ error: "Brak autoryzacji" }, { status: 401 });
    }

    const companies = await dbAll("SELECT * FROM Company ORDER BY isMain DESC");

    return NextResponse.json({ companies });
  } catch (error) {
    return NextResponse.json({ error: "Błąd bazy danych" }, { status: 500 });
  }
}

export async function POST(req) {
  try {
    const session = await getServerSession(authOptions);
    if (!session || session.user.role !== "OWNER") {
      return NextResponse.json({ error: "Brak autoryzacji" }, { status: 401 });
    }

    const body = await req.json();
    const { name, revenuePerKmEur, logoUrl, description, balance } = body;

    const newId = crypto.randomUUID();
    await dbRun(
      "INSERT INTO Company (id, name, logoUrl, description, revenuePerKmEur, isMain, balance, status, createdAt, updatedAt) VALUES (?, ?, ?, ?, ?, ?, ?, ?, NOW(), NOW())",
      [
        newId,
        name,
        logoUrl || null,
        description || null,
        revenuePerKmEur || 1.20,
        false,
        balance ? parseFloat(balance) : 0,
        "ACTIVE"
      ]
    );

    const newCompany = await dbOne("SELECT * FROM Company WHERE id = ?", [newId]);

    return NextResponse.json({ success: true, company: newCompany });
  } catch (error) {
    return NextResponse.json({ error: "Błąd tworzenia firmy" }, { status: 500 });
  }
}
