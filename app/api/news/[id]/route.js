import { NextResponse } from "next/server";
import { dbRun, dbOne } from "../../../../lib/db";
import { getServerSession } from "next-auth/next";
import { authOptions } from "../../auth/[...nextauth]/route";

export async function PUT(req, { params }) {
  try {
    const session = await getServerSession(authOptions);

    if (!session || !session.user || (session.user.role !== "BOARD" && session.user.role !== "OWNER")) {
      return NextResponse.json({ error: "Brak uprawnień." }, { status: 403 });
    }

    const { id } = await params;
    const body = await req.json();
    const { title, content, isPinned } = body;

    if (!title || !content) {
      return NextResponse.json({ error: "Brakuje tytułu lub treści." }, { status: 400 });
    }

    await dbRun("UPDATE Announcement SET title = ?, content = ?, isPinned = ?, updatedAt = NOW() WHERE id = ?", [
      title, content, isPinned ? 1 : 0, id
    ]);

    const announcement = await dbOne("SELECT * FROM Announcement WHERE id = ?", [id]);

    if (announcement) announcement.isPinned = Boolean(announcement.isPinned);

    return NextResponse.json(announcement);
  } catch (error) {
    console.error("Błąd podczas edycji ogłoszenia:", error);
    return NextResponse.json({ error: "Wystąpił błąd podczas edycji." }, { status: 500 });
  }
}

export async function DELETE(req, { params }) {
  try {
    const session = await getServerSession(authOptions);

    if (!session || !session.user || (session.user.role !== "BOARD" && session.user.role !== "OWNER")) {
      return NextResponse.json({ error: "Brak uprawnień." }, { status: 403 });
    }

    const { id } = await params;

    await dbRun("DELETE FROM Announcement WHERE id = ?", [id]);

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Błąd podczas usuwania ogłoszenia:", error);
    return NextResponse.json({ error: "Wystąpił błąd podczas usuwania." }, { status: 500 });
  }
}
