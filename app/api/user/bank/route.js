import { NextResponse } from "next/server";
import { dbAll } from "../../../../lib/db";
import { getServerSession } from "next-auth/next";
import { authOptions } from "../../auth/[...nextauth]/route";

export const dynamic = "force-dynamic";

export async function GET(req) {
  try {
    const session = await getServerSession(authOptions);

    if (!session || !session.user) {
      return NextResponse.json({ error: "Brak autoryzacji" }, { status: 401 });
    }

    const transactions = await dbAll(
      "SELECT * FROM BankTransaction WHERE userId = ? ORDER BY date DESC",
      [session.user.id]
    );

    return NextResponse.json({ transactions });
  } catch (error) {
    console.error("Błąd podczas pobierania transakcji bankowych:", error);
    return NextResponse.json({ error: "Wystąpił błąd serwera." }, { status: 500 });
  }
}
