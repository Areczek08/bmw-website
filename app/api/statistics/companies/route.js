import { NextResponse } from "next/server";
import { dbAll } from "../../../../lib/db";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const companies = await dbAll("SELECT * FROM Company");
    const users = await dbAll("SELECT id, companyId, totalDrivenKm FROM User");

    const stats = companies.map(c => {
      const companyUsers = users.filter(u => u.companyId === c.id);
      const totalDistance = companyUsers.reduce((sum, u) => sum + (u.totalDrivenKm || 0), 0);
      return {
        id: c.id,
        name: c.name,
        isMain: c.isMain,
        balance: c.balance,
        driverCount: companyUsers.length,
        totalDistance: totalDistance
      };
    });

    stats.sort((a, b) => b.totalDistance - a.totalDistance);

    return NextResponse.json({ stats });
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: "Błąd bazy danych" }, { status: 500 });
  }
}
