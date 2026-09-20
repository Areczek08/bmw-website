import { NextResponse } from "next/server";
import { dbOne } from "../../../../lib/db";
import { getServerSession } from "next-auth/next";
import { authOptions } from "../../auth/[...nextauth]/route";

export async function GET(req) {
  try {
    const session = await getServerSession(authOptions);

    if (!session || !session.user) {
      return NextResponse.json({ error: "Brak autoryzacji" }, { status: 401 });
    }

    const user = await dbOne("SELECT accountBalance FROM User WHERE id = ?", [session.user.id]);

    if (!user) {
      return NextResponse.json({ error: "Nie znaleziono profilu." }, { status: 404 });
    }

    return NextResponse.json({ balance: user.accountBalance });
  } catch (error) {
    return NextResponse.json({ error: "Wystąpił błąd serwera." }, { status: 500 });
  }
}
