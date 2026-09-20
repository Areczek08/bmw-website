import { NextResponse } from "next/server";
import { dbRun, generateId } from "../../../../lib/db";
import { getServerSession } from "next-auth/next";
import { authOptions } from "../../auth/[...nextauth]/route";

export async function POST(req) {
  try {
    const session = await getServerSession(authOptions);
    const { title, description, imageUrl } = await req.json();

    if (!title || !description) {
      return NextResponse.json({ error: "Brakuje danych." }, { status: 400 });
    }

    const id = generateId();
    const userId = session?.user?.id || null; // Zalogowany lub anonimowo

    await dbRun(`
      INSERT INTO BugReport (id, title, description, imageUrl, userId, status, createdAt, updatedAt)
      VALUES (?, ?, ?, ?, ?, 'NEW', NOW(), NOW())
    `, [id, title, description, imageUrl || null, userId]);

    return NextResponse.json({ success: true, bug: { id, title, description, imageUrl, userId, status: 'NEW' } });
  } catch (error) {
    console.error("Błąd zapisu zgłoszenia:", error);
    return NextResponse.json({ error: "Błąd serwera." }, { status: 500 });
  }
}
