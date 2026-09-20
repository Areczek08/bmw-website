import { NextResponse } from "next/server";
import { dbAll } from "../../../../lib/db";
import { getServerSession } from "next-auth/next";
import { authOptions } from "../../auth/[...nextauth]/route";

export async function GET(req) {
  try {
    const session = await getServerSession(authOptions);

    if (!session || !session.user) {
      return NextResponse.json({ error: "Brak autoryzacji" }, { status: 401 });
    }

    const date = new Date();
    const firstDay = new Date(date.getFullYear(), date.getMonth(), 1);
    const lastDay = new Date(date.getFullYear(), date.getMonth() + 1, 0, 23, 59, 59);

    const history = await dbAll("SELECT * FROM VehicleHistory WHERE type = 'REFUEL' AND date >= ? AND date <= ?", [firstDay, lastDay]);
    
    let users = [];
    if (history.length > 0) {
      const userIds = [...new Set(history.map(h => h.userId).filter(Boolean))];
      if (userIds.length > 0) {
        users = await dbAll(`SELECT id, name, image FROM User WHERE id IN (${userIds.map(() => '?').join(',')})`, userIds);
      }
    }

    const userSummary = {};

    history.forEach(entry => {
      const userId = entry.userId;
      if (!userId) return;
      const user = users.find(u => u.id === userId);
      if (!user) return;
      
      if (!userSummary[userId]) {
        userSummary[userId] = {
          user: user,
          totalCost: 0,
          refuelCount: 0
        };
      }
      userSummary[userId].totalCost += (entry.cost || 0);
      userSummary[userId].refuelCount += 1;
    });

    return NextResponse.json({ 
      summary: Object.values(userSummary).sort((a, b) => b.totalCost - a.totalCost) 
    });
  } catch (error) {
    console.error("Błąd podczas pobierania podsumowania paliwowego:", error);
    return NextResponse.json({ error: "Wystąpił błąd podczas pobierania podsumowania." }, { status: 500 });
  }
}
