import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "../../../auth/[...nextauth]/route";
import { dbOne, dbRun } from "../../../../../lib/db";

export async function DELETE(req, { params }) {
  try {
    const session = await getServerSession(authOptions);
    if (!session || !["OWNER", "BOARD"].includes(session.user.role)) {
      return NextResponse.json({ error: "Brak uprawnień" }, { status: 403 });
    }

    const { id } = await params;
    if (!id) {
      return NextResponse.json({ error: "Brak ID leasingu" }, { status: 400 });
    }

    const existing = await dbOne("SELECT * FROM Leasing WHERE id = ?", [id]);
    if (!existing) {
      return NextResponse.json({ error: "Leasing nie istnieje" }, { status: 404 });
    }

    await dbRun("DELETE FROM LeasingPayment WHERE leasingId = ?", [id]);
    await dbRun("DELETE FROM Leasing WHERE id = ?", [id]);

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Leasing Delete Error:", error);
    return NextResponse.json({ error: "Wystąpił błąd podczas usuwania leasingu" }, { status: 500 });
  }
}
