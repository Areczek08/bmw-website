import { NextResponse } from "next/server";
import { dbAll } from "../../../../lib/db";

export async function GET(req) {
  try {
    const { searchParams } = new URL(req.url);
    const period = searchParams.get("period") || "all";
    const dateParam = searchParams.get("date");

    let conditions = ["status = 'APPROVED'"];
    let params = [];
    
    let setConditions = [];
    let setParams = [];

    if (period === "month" && dateParam) {
      const [year, month] = dateParam.split("-").map(Number);
      const startDate = new Date(year, month - 1, 1);
      const endDate = new Date(year, month, 1);
      
      conditions.push("date >= ?");
      conditions.push("date < ?");
      params.push(startDate, endDate);
      
      setConditions.push("month = ?");
      setConditions.push("year = ?");
      setParams.push(month, year);
    } else if (period === "year" && dateParam) {
      const year = parseInt(dateParam.split("-")[0]);
      const startDate = new Date(year, 0, 1);
      const endDate = new Date(year + 1, 0, 1);
      
      conditions.push("date >= ?");
      conditions.push("date < ?");
      params.push(startDate, endDate);
      
      setConditions.push("year = ?");
      setParams.push(year);
    }

    const whereClause = conditions.join(" AND ");
    const sql = `SELECT userId, distance, averageFuel, weight FROM Job WHERE ${whereClause}`;
    const jobs = await dbAll(sql, params);

    let totalDistance = 0;
    let totalFuel = 0;
    let totalWeight = 0;
    const uniqueDrivers = new Set();

    jobs.forEach((job) => {
      totalDistance += job.distance;
      totalWeight += job.weight || 0;
      uniqueDrivers.add(job.userId);
      if (job.averageFuel) {
        totalFuel += (job.distance / 100) * job.averageFuel;
      }
    });

    const activeDrivers = uniqueDrivers.size;
    const fleetAverageFuel = totalDistance > 0 && totalFuel > 0 
      ? (totalFuel / totalDistance) * 100 
      : 0;

    let settlementsSql = "SELECT netProfit FROM MonthlySettlement";
    if (setConditions.length > 0) {
      settlementsSql += " WHERE " + setConditions.join(" AND ");
    }
    const settlements = await dbAll(settlementsSql, setParams);

    const totalRevenue = settlements.reduce((sum, s) => sum + s.netProfit, 0);

    return NextResponse.json({
      totalDistance,
      totalFuel,
      totalRevenue,
      totalJobs: jobs.length,
      totalWeight,
      activeDrivers,
      fleetAverageFuel
    }, {
      headers: {
        "Cache-Control": "private, max-age=60, s-maxage=300"
      }
    });
  } catch (error) {
    console.error("Error fetching company stats:", error);
    return NextResponse.json({ error: "Wystąpił błąd podczas pobierania statystyk." }, { status: 500 });
  }
}
