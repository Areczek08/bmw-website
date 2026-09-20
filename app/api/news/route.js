import { NextResponse } from "next/server";
import { dbAll, dbRun, generateId } from "../../../lib/db";
import { getServerSession } from "next-auth/next";
import { authOptions } from "../auth/[...nextauth]/route";
import { getSafeAvatarUrl } from "../../../lib/avatar";

export async function GET(req) {
  try {
    const session = await getServerSession(authOptions);
    if (!session || !session.user) {
      return NextResponse.json({ error: "Brak dostępu." }, { status: 401 });
    }

    const newsRaw = await dbAll("SELECT * FROM Announcement ORDER BY isPinned DESC, createdAt DESC");

    const authorIds = [...new Set(newsRaw.filter(n => n.authorId).map(n => n.authorId))];
    let authors = [];
    if (authorIds.length > 0) {
      const placeholders = authorIds.map(() => '?').join(',');
      authors = await dbAll(`SELECT id, name, firstName, image, role FROM User WHERE id IN (${placeholders})`, authorIds);
    }

    const safeNews = newsRaw.map(item => {
      const author = authors.find(a => a.id === item.authorId);
      return {
        ...item,
        author: author ? {
          ...author,
          image: getSafeAvatarUrl(author)
        } : null
      };
    });

    return NextResponse.json(safeNews, {
      headers: {
        "Cache-Control": "private, max-age=60, s-maxage=300, stale-while-revalidate=600"
      }
    });
  } catch (error) {
    console.error("Błąd podczas pobierania ogłoszeń:", error);
    return NextResponse.json({ error: "Wystąpił błąd podczas pobierania." }, { status: 500 });
  }
}

export async function POST(req) {
  try {
    const session = await getServerSession(authOptions);

    if (!session || !session.user || (session.user.role !== "BOARD" && session.user.role !== "OWNER")) {
      return NextResponse.json({ error: "Brak uprawnień do dodawania ogłoszeń." }, { status: 403 });
    }

    const body = await req.json();
    const { title, content, isPinned } = body;

    if (!title || !content) {
      return NextResponse.json({ error: "Brakuje tytułu lub treści." }, { status: 400 });
    }

    const id = generateId();
    await dbRun(
      "INSERT INTO Announcement (id, title, content, isPinned, authorId, createdAt, updatedAt) VALUES (?, ?, ?, ?, ?, NOW(), NOW())",
      [id, title, content, isPinned ? 1 : 0, session.user.id]
    );

    return NextResponse.json({ id, title, content, isPinned, authorId: session.user.id });
  } catch (error) {
    console.error("Błąd podczas dodawania ogłoszenia:", error);
    return NextResponse.json({ error: "Wystąpił błąd." }, { status: 500 });
  }
}
