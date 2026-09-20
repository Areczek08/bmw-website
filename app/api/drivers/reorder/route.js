import { NextResponse } from "next/server";
import { db } from "../../../../lib/db";
import { getServerSession } from "next-auth/next";
import { authOptions } from "../../auth/[...nextauth]/route";

export async function POST(req) {
  try {
    const session = await getServerSession(authOptions);

    if (!session || !session.user || (session.user.role !== "BOARD" && session.user.role !== "OWNER")) {
      return NextResponse.json({ error: "Brak uprawnień" }, { status: 403 });
    }

    const body = await req.json();
    const { orderedIds } = body;

    if (!orderedIds || !Array.isArray(orderedIds)) {
      return NextResponse.json({ error: "Nieprawidłowe dane" }, { status: 400 });
    }

    await db(async (conn) => {
      await conn.query("START TRANSACTION");
      try {
        for (let i = 0; i < orderedIds.length; i++) {
          await conn.query("UPDATE User SET displayOrder = ?, updatedAt = NOW() WHERE id = ?", [i + 1, orderedIds[i]]);
        }
        await conn.query("COMMIT");
      } catch (err) {
        await conn.query("ROLLBACK");
        throw err;
      }
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Błąd zapisywania kolejności:", error);
    return NextResponse.json({ error: "Wystąpił błąd serwera." }, { status: 500 });
  }
}
