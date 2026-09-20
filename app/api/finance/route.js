import { NextResponse } from "next/server";
import { dbOne, dbAll, dbRun } from "../../../lib/db";
import { getServerSession } from "next-auth/next";
import { authOptions } from "../auth/[...nextauth]/route";

export const dynamic = "force-dynamic";

export async function GET(req) {
  try {
    const session = await getServerSession(authOptions);

    if (!session || !session.user || (session.user.role !== "BOARD" && session.user.role !== "OWNER")) {
      return NextResponse.json({ error: "Brak autoryzacji" }, { status: 401 });
    }

    const today = new Date();
    today.setHours(23, 59, 59, 999);
    
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(today.getDate() - 6);
    sevenDaysAgo.setHours(0, 0, 0, 0);

    const companyId = session.user.companyId || "BMS";

    const jobsLast7Days = await dbAll(
      "SELECT date, distance FROM Job WHERE status = ? AND date >= ? AND date <= ? AND userId IN (SELECT id FROM User WHERE companyId = ?)",
      ["APPROVED", sevenDaysAgo, today, companyId]
    );

    let eurRate = 4.3;
    try {
      const res = await fetch("http://api.nbp.pl/api/exchangerates/rates/a/eur/?format=json");
      const nbpData = await res.json();
      eurRate = nbpData?.rates?.[0]?.mid || 4.3;
    } catch (e) {
      console.warn("NBP API fetch failed, using default rate 4.3");
    }

    const daysMap = ["Niedziela", "Poniedziałek", "Wtorek", "Środa", "Czwartek", "Piątek", "Sobota"];
    const chartData = [];
    
    let totalIncome = 0;
    let totalDistance = 0;

    for (let i = 0; i < 7; i++) {
      const targetDate = new Date(sevenDaysAgo);
      targetDate.setDate(sevenDaysAgo.getDate() + i);
      const dayName = daysMap[targetDate.getDay()];
      
      chartData.push({
        fullDate: targetDate.toISOString().split('T')[0],
        name: dayName.slice(0, 3), // Short day name for X axis
        fullName: dayName,
        income: 0,
        km: 0
      });
    }

    let company = await dbOne("SELECT * FROM Company WHERE id = ?", [companyId]);
    
    if (!company) {
      await dbRun("INSERT INTO Company (id, createdAt, updatedAt) VALUES (?, NOW(), NOW())", [companyId]);
      company = await dbOne("SELECT * FROM Company WHERE id = ?", [companyId]);
    }

    const ratePerKm = company.revenuePerKmEur || (companyId === "BMS" ? 1.60 : 1.20);
    const companyBalance = company.balance || 0;

    jobsLast7Days.forEach(job => {
      const jobIncomePLN = job.distance * ratePerKm * eurRate;
      
      totalIncome += jobIncomePLN;
      totalDistance += job.distance;
      
      const jobDateStr = new Date(job.date).toISOString().split('T')[0];
      const dayEntry = chartData.find(d => d.fullDate === jobDateStr);
      if (dayEntry) {
        dayEntry.income += jobIncomePLN;
        dayEntry.km += job.distance;
      }
    });

    // Round values to integers for clean display
    chartData.forEach(d => {
      d.income = Math.round(d.income);
      d.km = Math.round(d.km);
    });

    const fourteenDaysAgo = new Date(sevenDaysAgo);
    fourteenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
    
    const previousJobsAgg = await dbOne(
      "SELECT COALESCE(SUM(distance), 0) as totalDistance FROM Job WHERE status = ? AND date >= ? AND date < ? AND userId IN (SELECT id FROM User WHERE companyId = ?)",
      ["APPROVED", fourteenDaysAgo, sevenDaysAgo, companyId]
    );
    
    const previousDistance = Number(previousJobsAgg.totalDistance) || 0;
    const previousIncome = previousDistance * ratePerKm * eurRate;
    let growth = 0;
    
    if (previousIncome > 0) {
      growth = ((totalIncome - previousIncome) / previousIncome) * 100;
    } else if (totalIncome > 0) {
      growth = 100;
    }

    const drivers = await dbAll(
      "SELECT id, name, accountBalance FROM User WHERE companyId = ? AND driverStatus NOT IN (?, ?)",
      [companyId, "WAITING_FOR_APPROVAL", "INACTIVE"]
    );

    return NextResponse.json({ 
      data: chartData,
      summary: {
        income: Math.round(totalIncome),
        distance: Math.round(totalDistance),
        growth: Number(growth.toFixed(1)),
        eurRate: eurRate,
        balance: companyBalance
      },
      drivers: drivers
    });

  } catch (error) {
    console.error("Błąd podczas pobierania finansów:", error);
    return NextResponse.json({ error: "Wystąpił błąd." }, { status: 500 });
  }
}
