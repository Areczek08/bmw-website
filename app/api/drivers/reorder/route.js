import { NextResponse } from "next/server";
import { dbSession } from "../../../../lib/db";
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

    const userCompany = session.user.companyId || "BMS";
    const isOwner = session.user.role === "OWNER";

    return await dbSession(async (db) => {
      await db.transaction(async (tx) => {
        for (let i = 0; i < orderedIds.length; i++) {
          if (isOwner) {
            await tx.run("UPDATE User SET displayOrder = ?, updatedAt = NOW() WHERE id = ?", [i + 1, orderedIds[i]]);
          } else {
            await tx.run("UPDATE User SET displayOrder = ?, updatedAt = NOW() WHERE id = ? AND companyId = ?", [i + 1, orderedIds[i], userCompany]);
          }
        }
      });

      return NextResponse.json({ success: true });
    });
  } catch (error) {
    console.error("Błąd zapisywania kolejności:", error);
    return NextResponse.json({ error: "Wystąpił błąd serwera." }, { status: 500 });
  }
}
