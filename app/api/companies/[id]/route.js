import { NextResponse } from "next/server";
import { dbOne, dbAll } from "../../../../lib/db";

export async function GET(req, { params }) {
  try {
    const { id: companyId } = await params;

    const company = await dbOne("SELECT * FROM Company WHERE id = ?", [companyId]);

    if (!company) {
      return NextResponse.json({ error: "Nie znaleziono" }, { status: 404 });
    }

    const users = await dbAll("SELECT id, name, role FROM User WHERE companyId = ?", [companyId]);
    const trucks = await dbAll("SELECT id FROM Truck WHERE companyId = ?", [companyId]);

    company.users = users;
    company.trucks = trucks;

    return NextResponse.json({ company });
  } catch (error) {
    return NextResponse.json({ error: "Błąd bazy danych" }, { status: 500 });
  }
}
