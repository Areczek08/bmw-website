import { NextResponse } from "next/server";
import { dbSession, generateId } from "../../../../lib/db";
import { getServerSession } from "next-auth/next";
import { authOptions } from "../../auth/[...nextauth]/route";
import { extractIdempotencyKey, checkIdempotency, recordIdempotency } from "../../../../lib/idempotency";

export async function POST(req) {
  try {
    const session = await getServerSession(authOptions);

    if (!session || !session.user || (session.user.role !== "BOARD" && session.user.role !== "OWNER")) {
      return NextResponse.json({ error: "Brak uprawnień do rozliczeń." }, { status: 403 });
    }

    const body = await req.json();
    const { month, year, fuelCost = 0, ticketsCost = 0, maintenanceCost = 0, otherCost = 0 } = body;

    const parsedMonth = parseInt(month, 10);
    const parsedYear = parseInt(year, 10);

    if (isNaN(parsedMonth) || parsedMonth < 1 || parsedMonth > 12 || isNaN(parsedYear) || parsedYear < 2020) {
      return NextResponse.json({ error: "Nieprawidłowy miesiąc lub rok." }, { status: 400 });
    }

    const idempotencyKey = extractIdempotencyKey(req, body);
    const companyId = session.user.companyId || "BMS";

    const startDate = new Date(parsedYear, parsedMonth - 1, 1);
    const endDate = new Date(parsedYear, parsedMonth, 0, 23, 59, 59);

    let eurRate = 4.3;
    try {
      const res = await fetch("http://api.nbp.pl/api/exchangerates/rates/a/eur/?format=json");
      const nbpData = await res.json();
      eurRate = nbpData?.rates?.[0]?.mid || 4.3;
    } catch (e) {
      console.warn("NBP API fetch failed, using default rate 4.3");
    }

    return await dbSession(async (db) => {
      // 1. Check Idempotency Key first
      if (idempotencyKey) {
        const idempCheck = await checkIdempotency(idempotencyKey, db);
        if (idempCheck.isDuplicate) {
          return NextResponse.json(idempCheck.response, { 
            status: idempCheck.statusCode,
            headers: { "Cache-Control": "private, no-cache, no-store, must-revalidate" }
          });
        }
      }

      // 2. Explicit check if this month was already settled
      const existingSettlement = await db.one(
        "SELECT id FROM MonthlySettlement WHERE companyId = ? AND month = ? AND year = ?",
        [companyId, parsedMonth, parsedYear]
      );

      if (existingSettlement) {
        return NextResponse.json(
          { error: `Miesiąc ${parsedMonth}/${parsedYear} został już zamknięty i rozliczony.` },
          { status: 409 }
        );
      }

      const agg = await db.one(
        "SELECT COALESCE(SUM(distance), 0) as totalDistance FROM Job WHERE status = ? AND date >= ? AND date <= ? AND userId IN (SELECT id FROM User WHERE companyId = ?)",
        ["APPROVED", startDate, endDate, companyId]
      );

      const totalDistance = Number(agg?.totalDistance) || 0;

      let company = await db.one("SELECT id, name, balance, isMain, revenuePerKmEur FROM Company WHERE id = ?", [companyId]);
      if (!company) {
        await db.run("INSERT INTO Company (id, createdAt, updatedAt) VALUES (?, NOW(), NOW())", [companyId]);
        company = await db.one("SELECT id, name, balance, isMain, revenuePerKmEur FROM Company WHERE id = ?", [companyId]);
      }

      const ratePerKm = company.revenuePerKmEur || (companyId === "BMS" ? 1.60 : 1.20);
      const revenuePLN = totalDistance * ratePerKm * eurRate;
      const netProfit = revenuePLN - (Number(fuelCost) + Number(ticketsCost) + Number(maintenanceCost) + Number(otherCost));

      const settlementId = generateId();

      // 3. Execute all balance updates and settlement insert inside an atomic SQL transaction
      try {
        const result = await db.transaction(async (tx) => {
          // Double-check inside transaction to prevent race conditions
          const checkInsideTx = await tx.one(
            "SELECT id FROM MonthlySettlement WHERE companyId = ? AND month = ? AND year = ? FOR UPDATE",
            [companyId, parsedMonth, parsedYear]
          );

          if (checkInsideTx) {
            const err = new Error("ALREADY_SETTLED");
            err.code = "ALREADY_SETTLED";
            throw err;
          }

          // Insert into MonthlySettlement first (protected by UNIQUE constraint)
          await tx.run(
            "INSERT INTO MonthlySettlement (id, companyId, month, year, revenuePLN, fuelCost, ticketsCost, maintenanceCost, salariesCost, otherCost, netProfit, isClosed, createdAt) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?, true, NOW())",
            [settlementId, companyId, parsedMonth, parsedYear, revenuePLN, fuelCost, ticketsCost, maintenanceCost, otherCost, netProfit]
          );

          // Update company balance
          await tx.run("UPDATE Company SET balance = balance + ?, updatedAt = NOW() WHERE id = ?", [netProfit, companyId]);

          if (companyId !== "BMS" && !company.isMain) {
            const commissionRate = 0.40;
            const commissionPLN = totalDistance * commissionRate * eurRate;

            let bmsCompany = await tx.one("SELECT id FROM Company WHERE id = 'BMS'");
            if (!bmsCompany) {
              await tx.run("INSERT INTO Company (id, createdAt, updatedAt) VALUES ('BMS', NOW(), NOW())");
            }

            await tx.run("UPDATE Company SET balance = balance + ?, updatedAt = NOW() WHERE id = 'BMS'", [commissionPLN]);

            const subTxId = generateId();
            await tx.run(
              "INSERT INTO CompanyTransaction (id, companyId, type, amount, category, description, date) VALUES (?, 'BMS', 'INCOME', ?, 'Prowizja Podwykonawca', ?, NOW())",
              [subTxId, commissionPLN, `Prowizja od firmy ${company.name || 'nieznanej'} za ${totalDistance} km.`]
            );
          }

          const txId1 = generateId();
          await tx.run("INSERT INTO CompanyTransaction (id, companyId, type, amount, category, description, date) VALUES (?, ?, 'INCOME', ?, 'Trasy', ?, NOW())", [txId1, companyId, revenuePLN, `Zysk z tras (${totalDistance} km)`]);

          if (Number(fuelCost) > 0) {
            await tx.run("INSERT INTO CompanyTransaction (id, companyId, type, amount, category, date) VALUES (?, ?, 'EXPENSE', ?, 'Paliwo', NOW())", [generateId(), companyId, fuelCost]);
          }
          if (Number(ticketsCost) > 0) {
            await tx.run("INSERT INTO CompanyTransaction (id, companyId, type, amount, category, date) VALUES (?, ?, 'EXPENSE', ?, 'Mandaty', NOW())", [generateId(), companyId, ticketsCost]);
          }
          if (Number(maintenanceCost) > 0) {
            await tx.run("INSERT INTO CompanyTransaction (id, companyId, type, amount, category, date) VALUES (?, ?, 'EXPENSE', ?, 'Eksploatacja', NOW())", [generateId(), companyId, maintenanceCost]);
          }
          if (Number(otherCost) > 0) {
            await tx.run("INSERT INTO CompanyTransaction (id, companyId, type, amount, category, date) VALUES (?, ?, 'EXPENSE', ?, 'Inne', NOW())", [generateId(), companyId, otherCost]);
          }

          const settlement = await tx.one("SELECT id, companyId, month, year, revenuePLN, netProfit, isClosed, createdAt FROM MonthlySettlement WHERE id = ?", [settlementId]);
          const updatedCompany = await tx.one("SELECT balance FROM Company WHERE id = ?", [companyId]);

          return {
            settlement,
            companyBalance: updatedCompany?.balance || 0
          };
        });

        const responseData = { success: true, settlement: result.settlement, companyBalance: result.companyBalance };

        if (idempotencyKey) {
          await recordIdempotency(idempotencyKey, "SETTLE_MONTH", 200, responseData, db);
        }

        return NextResponse.json(responseData, {
          status: 200,
          headers: { "Cache-Control": "private, no-cache, no-store, must-revalidate" }
        });
      } catch (txErr) {
        if (txErr.code === "ALREADY_SETTLED" || txErr.code === "ER_DUP_ENTRY" || txErr.message?.includes("uq_monthly_settlement")) {
          return NextResponse.json(
            { error: `Miesiąc ${parsedMonth}/${parsedYear} został już zamknięty i rozliczony.` },
            { status: 409 }
          );
        }
        throw txErr;
      }
    });
  } catch (error) {
    console.error("Błąd podczas rozliczenia miesiąca:", error);
    return NextResponse.json({ error: "Wystąpił błąd podczas rozliczenia." }, { status: 500 });
  }
}
