import { NextResponse } from "next/server";
import { dbAll, dbRun } from "../../../lib/db";
import { getServerSession } from "next-auth/next";
import { authOptions } from "../auth/[...nextauth]/route";

export async function GET(req) {
  try {
    const session = await getServerSession(authOptions);

    if (!session || !session.user || !["BOARD", "OWNER"].includes(session.user.role)) {
      return NextResponse.json({ error: "Brak uprawnień" }, { status: 403 });
    }

    const bugsData = await dbAll(`
      SELECT b.*, u.name as 'u_name', u.firstName as 'u_firstName'
      FROM BugReport b
      LEFT JOIN User u ON b.userId = u.id
      ORDER BY b.createdAt DESC
    `);
    
    const bugs = bugsData.map(b => {
      const { u_name, u_firstName, ...bugData } = b;
      return {
        ...bugData,
        user: b.userId ? { name: u_name, firstName: u_firstName } : null
      };
    });

    return NextResponse.json({ bugs });
  } catch (error) {
    console.error("Błąd pobierania błędów:", error);
    return NextResponse.json({ error: "Błąd serwera." }, { status: 500 });
  }
}

export async function PUT(req) {
  try {
    const session = await getServerSession(authOptions);
    if (!session || !session.user || !["BOARD", "OWNER"].includes(session.user.role)) {
      return NextResponse.json({ error: "Brak uprawnień" }, { status: 403 });
    }

    const { id, status } = await req.json();

    await dbRun(`
      UPDATE BugReport SET status = ?, updatedAt = NOW() WHERE id = ?
    `, [status, id]);

    return NextResponse.json({ success: true, bug: { id, status } });
  } catch (error) {
    return NextResponse.json({ error: "Błąd serwera." }, { status: 500 });
  }
}
