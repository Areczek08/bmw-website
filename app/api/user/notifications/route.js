import { NextResponse } from "next/server";
import { dbOne, dbAll } from "../../../../lib/db";
import { getServerSession } from "next-auth/next";
import { authOptions } from "../../auth/[...nextauth]/route";

export async function GET(req) {
  try {
    const session = await getServerSession(authOptions);
    if (!session || !session.user) {
      return NextResponse.json({ error: "Brak autoryzacji" }, { status: 401 });
    }

    const user = await dbOne("SELECT id, probationPeriod FROM User WHERE id = ?", [session.user.id]);

    if (!user) return NextResponse.json({ notifications: [] });

    const bankTransactions = await dbAll(
      "SELECT id, amount, title, date FROM BankTransaction WHERE userId = ? ORDER BY date DESC LIMIT 5",
      [user.id]
    );

    const notifications = [];

    if (user.probationPeriod) {
      const probationDate = new Date(user.probationPeriod);
      if (!isNaN(probationDate.getTime())) {
        const diffDays = Math.ceil((probationDate - new Date()) / (1000 * 60 * 60 * 24));
        if (diffDays >= 0 && diffDays <= 7) {
          notifications.push({
            id: `probation-${Date.now()}`,
            title: "Okres próbny",
            message: `Zostało ${diffDays} dni do końca okresu próbnego.`,
            type: "warning",
            link: "/dashboard/documents"
          });
        }
      }
    }

    const recentAnnouncements = await dbAll(
      "SELECT id, title FROM Announcement WHERE createdAt >= DATE_SUB(NOW(), INTERVAL 7 DAY) ORDER BY createdAt DESC LIMIT 2"
    );

    recentAnnouncements.forEach(ann => {
      notifications.push({
        id: `ann-${ann.id}`,
        title: "Nowe ogłoszenie",
        message: ann.title,
        type: "info",
        link: "/dashboard/news"
      });
    });

    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

    bankTransactions.forEach(tx => {
      const txDate = new Date(tx.date);
      if (tx.amount > 0 && txDate >= sevenDaysAgo && (tx.title.toLowerCase().includes("wypłata") || tx.title.toLowerCase().includes("wynagrodzenie") || tx.title.toLowerCase().includes("premia"))) {
        notifications.push({
          id: `bank-${tx.id}`,
          title: "Nowy przelew",
          message: `Wpływ na konto: +${tx.amount} zł (${tx.title})`,
          type: "success",
          link: "/dashboard/bank"
        });
      }
    });

    return NextResponse.json({ notifications }, {
      headers: {
        "Cache-Control": "private, max-age=60, s-maxage=120"
      }
    });
  } catch (error) {
    console.error("Error fetching notifications:", error);
    return NextResponse.json({ error: "Wystąpił błąd serwera." }, { status: 500 });
  }
}
