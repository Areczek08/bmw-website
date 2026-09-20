import { NextResponse } from "next/server";
import { dbRun, generateId } from "../../../../lib/db";
import { getServerSession } from "next-auth/next";
import { authOptions } from "../../auth/[...nextauth]/route";

export async function POST(req) {
  try {
    const session = await getServerSession(authOptions);

    if (!session || !session.user) {
      return NextResponse.json({ error: "Brak autoryzacji" }, { status: 401 });
    }

    const body = await req.json();
    const { type, title, content } = body;

    if (!type || !title || !content) {
      return NextResponse.json({ error: "Brakuje wymaganych pól wniosku." }, { status: 400 });
    }

    const id = generateId();
    await dbRun(`
      INSERT INTO Request (id, userId, type, title, content, status, createdAt, updatedAt)
      VALUES (?, ?, ?, ?, ?, 'PENDING', NOW(), NOW())
    `, [id, session.user.id, type, title, content]);

    const newRequest = {
      id,
      userId: session.user.id,
      type,
      title,
      content,
      status: 'PENDING'
    };

    return NextResponse.json({ success: true, request: newRequest });
  } catch (error) {
    console.error("Błąd podczas tworzenia wniosku:", error);
    return NextResponse.json({ error: "Wystąpił błąd serwera." }, { status: 500 });
  }
}
