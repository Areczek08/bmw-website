import { NextResponse } from "next/server";
import { dbSession } from "../../../../lib/db";
import { getServerSession } from "next-auth/next";
import { authOptions } from "../../auth/[...nextauth]/route";

export const dynamic = "force-dynamic";

export async function GET(req) {
  try {
    const session = await getServerSession(authOptions);

    if (!session || !session.user) {
      return NextResponse.json({ error: "Brak autoryzacji" }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const limitParam = parseInt(searchParams.get("limit") || "50", 10);
    const limit = Math.min(Math.max(isNaN(limitParam) ? 50 : limitParam, 1), 100);
    const beforeDate = searchParams.get("before");

    return await dbSession(async (db) => {
      let query = "SELECT id, amount, title, date FROM BankTransaction WHERE userId = ?";
      const params = [session.user.id];

      if (beforeDate) {
        query += " AND date < ?";
        params.push(new Date(beforeDate));
      }

      query += ` ORDER BY date DESC LIMIT ${limit}`;

      const transactions = await db.all(query, params);

      return NextResponse.json({ 
        transactions,
        count: transactions.length,
        hasMore: transactions.length === limit
      }, {
        headers: { "Cache-Control": "private, no-cache, no-store, must-revalidate" }
      });
    });
  } catch (error) {
    console.error("Błąd podczas pobierania transakcji bankowych:", error);
    return NextResponse.json({ error: "Wystąpił błąd serwera." }, { status: 500 });
  }
}
