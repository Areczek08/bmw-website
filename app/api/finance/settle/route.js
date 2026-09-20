import { NextResponse } from "next/server";
import { dbOne, dbRun, generateId } from "../../../../lib/db";
import { getServerSession } from "next-auth/next";
import { authOptions } from "../../auth/[...nextauth]/route";

export async function POST(req) {
  try {
    const session = await getServerSession(authOptions);

    if (!session || !session.user || (session.user.role !== "BOARD" && session.user.role !== "OWNER")) {
      return NextResponse.json({ error: "Brak uprawnień do rozliczeń." }, { status: 403 });
    }

    const body = await req.json();
    const { month, year, fuelCost, ticketsCost, maintenanceCost, otherCost } = body;

    const companyId = session.user.companyId || "BMS";

    const startDate = new Date(year, month - 1, 1);
    const endDate = new Date(year, month, 0, 23, 59, 59);

    const agg = await dbOne(
      "SELECT COALESCE(SUM(distance), 0) as totalDistance FROM Job WHERE status = ? AND date >= ? AND date <= ? AND userId IN (SELECT id FROM User WHERE companyId = ?)",
      ["APPROVED", startDate, endDate, companyId]
    );

    const totalDistance = Number(agg.totalDistance) || 0;

    let eurRate = 4.3;
    try {
      const res = await fetch("http://api.nbp.pl/api/exchangerates/rates/a/eur/?format=json");
      const nbpData = await res.json();
      eurRate = nbpData?.rates?.[0]?.mid || 4.3;
    } catch (e) {
      console.warn("NBP API fetch failed");
    }

    let company = await dbOne("SELECT * FROM Company WHERE id = ?", [companyId]);
    if (!company) {
      await dbRun("INSERT INTO Company (id, createdAt, updatedAt) VALUES (?, NOW(), NOW())", [companyId]);
      company = await dbOne("SELECT * FROM Company WHERE id = ?", [companyId]);
    }

    const ratePerKm = company.revenuePerKmEur || (companyId === "BMS" ? 1.60 : 1.20);
    const revenuePLN = totalDistance * ratePerKm * eurRate;
    const netProfit = revenuePLN - (fuelCost + ticketsCost + maintenanceCost + otherCost);

    await dbRun("UPDATE Company SET balance = balance + ?, updatedAt = NOW() WHERE id = ?", [netProfit, companyId]);

    // Refresh company to get latest balance
    company = await dbOne("SELECT * FROM Company WHERE id = ?", [companyId]);

    if (companyId !== "BMS" && !company.isMain) {
       const commissionRate = 0.40;
       const commissionPLN = totalDistance * commissionRate * eurRate;
       
       let bmsCompany = await dbOne("SELECT * FROM Company WHERE id = 'BMS'");
       if (!bmsCompany) {
         await dbRun("INSERT INTO Company (id, createdAt, updatedAt) VALUES ('BMS', NOW(), NOW())");
       }
       
       await dbRun("UPDATE Company SET balance = balance + ?, updatedAt = NOW() WHERE id = 'BMS'", [commissionPLN]);
       
       const txId = generateId();
       await dbRun(
         "INSERT INTO CompanyTransaction (id, companyId, type, amount, category, description, date) VALUES (?, 'BMS', 'INCOME', ?, 'Prowizja Podwykonawca', ?, NOW())",
         [txId, commissionPLN, `Prowizja od firmy ${company.name || 'nieznanej'} za ${totalDistance} km.`]
       );
    }

    const settlementId = generateId();
    await dbRun(
      "INSERT INTO MonthlySettlement (id, companyId, month, year, revenuePLN, fuelCost, ticketsCost, maintenanceCost, salariesCost, otherCost, netProfit, isClosed, createdAt) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?, true, NOW())",
      [settlementId, companyId, month, year, revenuePLN, fuelCost, ticketsCost, maintenanceCost, otherCost, netProfit]
    );

    const settlement = await dbOne("SELECT * FROM MonthlySettlement WHERE id = ?", [settlementId]);

    const txId1 = generateId();
    await dbRun("INSERT INTO CompanyTransaction (id, companyId, type, amount, category, description, date) VALUES (?, ?, 'INCOME', ?, 'Trasy', ?, NOW())", [txId1, companyId, revenuePLN, `Zysk z tras (${totalDistance} km)`]);
    
    if (fuelCost > 0) {
      await dbRun("INSERT INTO CompanyTransaction (id, companyId, type, amount, category, date) VALUES (?, ?, 'EXPENSE', ?, 'Paliwo', NOW())", [generateId(), companyId, fuelCost]);
    }
    if (ticketsCost > 0) {
      await dbRun("INSERT INTO CompanyTransaction (id, companyId, type, amount, category, date) VALUES (?, ?, 'EXPENSE', ?, 'Mandaty', NOW())", [generateId(), companyId, ticketsCost]);
    }
    if (maintenanceCost > 0) {
      await dbRun("INSERT INTO CompanyTransaction (id, companyId, type, amount, category, date) VALUES (?, ?, 'EXPENSE', ?, 'Eksploatacja', NOW())", [generateId(), companyId, maintenanceCost]);
    }
    if (otherCost > 0) {
      await dbRun("INSERT INTO CompanyTransaction (id, companyId, type, amount, category, date) VALUES (?, ?, 'EXPENSE', ?, 'Inne', NOW())", [generateId(), companyId, otherCost]);
    }

    return NextResponse.json({ success: true, settlement, companyBalance: company.balance });
  } catch (error) {
    console.error("Błąd podczas rozliczenia miesiąca:", error);
    return NextResponse.json({ error: "Wystąpił błąd podczas rozliczenia." }, { status: 500 });
  }
}
