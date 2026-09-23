import { NextResponse } from "next/server";
import { dbOne } from "../../../../lib/db";
import { getServerSession } from "next-auth/next";
import { authOptions } from "../../auth/[...nextauth]/route";

export const dynamic = "force-dynamic";

export async function GET(req) {
  try {
    const session = await getServerSession(authOptions);

    if (!session || !session.user) {
      return NextResponse.json({ error: "Brak autoryzacji" }, { status: 401 });
    }

    if (session.user.role !== "BOARD" && session.user.role !== "OWNER") {
      return NextResponse.json({ error: "Brak uprawnień do przeglądania statystyk firmy." }, { status: 403 });
    }

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
    const jobStatsSql = `
      SELECT 
        COALESCE(SUM(distance), 0) AS totalDistance,
        COALESCE(SUM((distance / 100.0) * IFNULL(averageFuel, 0)), 0) AS totalFuel,
        COALESCE(SUM(weight), 0) AS totalWeight,
        COUNT(id) AS totalJobs,
        COUNT(DISTINCT userId) AS activeDrivers
      FROM Job 
      WHERE ${whereClause}
    `;

    const jobStats = await dbOne(jobStatsSql, params) || {};

    const totalDistance = Number(jobStats.totalDistance) || 0;
    const totalFuel = Number(jobStats.totalFuel) || 0;
    const totalWeight = Number(jobStats.totalWeight) || 0;
    const totalJobs = Number(jobStats.totalJobs) || 0;
    const activeDrivers = Number(jobStats.activeDrivers) || 0;

    const fleetAverageFuel = totalDistance > 0 && totalFuel > 0 
      ? (totalFuel / totalDistance) * 100 
      : 0;

    let settlementsSql = "SELECT COALESCE(SUM(netProfit), 0) AS totalRevenue FROM MonthlySettlement";
    if (setConditions.length > 0) {
      settlementsSql += " WHERE " + setConditions.join(" AND ");
    }
    const settlementStats = await dbOne(settlementsSql, setParams) || {};
    const totalRevenue = Number(settlementStats.totalRevenue) || 0;

    return NextResponse.json({
      totalDistance,
      totalFuel,
      totalRevenue,
      totalJobs,
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
