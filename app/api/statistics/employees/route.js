import { NextResponse } from "next/server";
import { dbAll } from "../../../../lib/db";
import { getSafeAvatarUrl } from "../../../../lib/avatar";

export async function GET(req) {
  try {
    const { searchParams } = new URL(req.url);
    const period = searchParams.get("period") || "all";
    const dateParam = searchParams.get("date");

    let conditions = ["status = 'APPROVED'"];
    let params = [];

    if (period === "month" && dateParam) {
      const [year, month] = dateParam.split("-").map(Number);
      const startDate = new Date(year, month - 1, 1);
      const endDate = new Date(year, month, 1);
      conditions.push("date >= ?");
      conditions.push("date < ?");
      params.push(startDate, endDate);
    } else if (period === "year" && dateParam) {
      const year = parseInt(dateParam.split("-")[0]);
      const startDate = new Date(year, 0, 1);
      const endDate = new Date(year + 1, 0, 1);
      conditions.push("date >= ?");
      conditions.push("date < ?");
      params.push(startDate, endDate);
    }

    const whereClause = conditions.join(" AND ");
    const jobs = await dbAll(`SELECT userId, distance, averageFuel FROM Job WHERE ${whereClause}`, params);

    const userIds = [...new Set(jobs.map(j => j.userId))];
    let users = [];
    if (userIds.length > 0) {
      const placeholders = userIds.map(() => '?').join(',');
      users = await dbAll(`SELECT id, name, firstName, discordNick, image FROM User WHERE id IN (${placeholders})`, userIds);
    }

    const userStats = {};

    jobs.forEach((job) => {
      const userId = job.userId;
      const user = users.find(u => u.id === userId);
      if (!user) return;
      
      if (!userStats[userId]) {
        userStats[userId] = {
          user: user,
          totalDistance: 0,
          totalFuel: 0,
        };
      }

      userStats[userId].totalDistance += job.distance;
      if (job.averageFuel) {
        userStats[userId].totalFuel += (job.distance / 100) * job.averageFuel;
      }
    });

    const employees = Object.values(userStats).map((stat) => {
      let avgFuel = 0;
      if (stat.totalDistance > 0 && stat.totalFuel > 0) {
        avgFuel = (stat.totalFuel / stat.totalDistance) * 100;
      }
      return {
        id: stat.user.id,
        name: stat.user.firstName || stat.user.discordNick || stat.user.name || "Kierowca",
        image: getSafeAvatarUrl(stat.user),
        totalDistance: stat.totalDistance,
        averageFuel: avgFuel,
      };
    });

    return NextResponse.json({ employees }, {
      headers: {
        "Cache-Control": "private, max-age=60, s-maxage=300"
      }
    });
  } catch (error) {
    console.error("Error fetching employees stats:", error);
    return NextResponse.json({ error: "Wystąpił błąd podczas pobierania statystyk kierowców." }, { status: 500 });
  }
}
