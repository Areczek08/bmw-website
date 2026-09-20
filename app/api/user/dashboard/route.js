import { NextResponse } from "next/server";
import { dbOne, dbAll, dbRun } from "../../../../lib/db";
import { getServerSession } from "next-auth/next";
import { authOptions } from "../../auth/[...nextauth]/route";
import { getSafeAvatarUrl } from "../../../../lib/avatar";

export const dynamic = "force-dynamic";

export async function GET(req) {
  try {
    const session = await getServerSession(authOptions);

    if (!session || !session.user) {
      return NextResponse.json({ error: "Brak autoryzacji" }, { status: 401 });
    }

    // Pobranie danych gracza
    const user = await dbOne("SELECT * FROM User WHERE id = ?", [session.user.id]);

    if (!user) {
      return NextResponse.json({ error: "Nie znaleziono profilu." }, { status: 404 });
    }

    // Pobranie przypisanego pojazdu i naczepy (Truck points to User via assignedDriverId)
    const assignedTruck = await dbOne("SELECT * FROM Truck WHERE assignedDriverId = ?", [user.id]);
    if (assignedTruck) {
      user.assignedTruck = assignedTruck;
      if (assignedTruck.attachedTrailerId) {
        user.assignedTruck.attachedTrailer = await dbOne("SELECT * FROM Trailer WHERE id = ?", [assignedTruck.attachedTrailerId]);
      }
    }

    // Obliczenia statystyk miesięcznych (dla tego konkretnego użytkownika)
    const startOfMonth = new Date();
    startOfMonth.setDate(1);
    startOfMonth.setHours(0, 0, 0, 0);

    const userJobsThisMonth = await dbAll(
      "SELECT distance, averageFuel FROM Job WHERE userId = ? AND status = ? AND date >= ?",
      [user.id, 'APPROVED', startOfMonth]
    );

    const countResult = await dbOne(
      "SELECT COUNT(*) as count FROM Job WHERE userId = ? AND status = ?",
      [user.id, 'APPROVED']
    );
    const totalJobsCount = Number(countResult?.count || 0);

    let monthlyDistance = 0;
    let totalAverageFuel = 0;
    let jobsWithFuelData = 0;

    userJobsThisMonth.forEach(job => {
      monthlyDistance += Number(job.distance || 0);
      if (job.averageFuel && job.averageFuel > 0) {
        totalAverageFuel += Number(job.averageFuel);
        jobsWithFuelData++;
      }
    });

    const averageFuel = jobsWithFuelData > 0 ? (totalAverageFuel / jobsWithFuelData).toFixed(2) : 0;

    // Pobranie dystansu całej firmy w tym miesiącu (wszyscy kierowcy)
    const companyJobsAgg = await dbOne(
      "SELECT COALESCE(SUM(distance), 0) as totalDistance FROM Job WHERE status = ? AND date >= ?",
      ['APPROVED', startOfMonth]
    );
    const companyDistance = Number(companyJobsAgg?.totalDistance || 0);

    // Pobranie ostatnich tras użytkownika
    const recentJobs = await dbAll(
      "SELECT id, startCity, endCity, cargo, distance, status, date, createdAt FROM Job WHERE userId = ? ORDER BY createdAt DESC LIMIT 4",
      [user.id]
    );

    // Wyznaczenie automatycznego statusu kierowcy
    let calculatedStatus = "OFFLINE";
    const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000);

    // Sprawdzenie czy jest aktywny urlop
    const activeVacationRequest = await dbOne(
      "SELECT id FROM Request WHERE userId = ? AND type IN ('VACATION', 'URLOP', 'Urlop') AND status = 'APPROVED' LIMIT 1",
      [user.id]
    );

    if (user.driverStatus === "ON_LEAVE" || activeVacationRequest) {
      calculatedStatus = "ON_LEAVE";
    } else if (user.lastOnline && new Date(user.lastOnline) >= fiveMinutesAgo) {
      calculatedStatus = "ACTIVE";
    } else {
      calculatedStatus = "ACTIVE"; // Gdy zalogowany w aplikacji
    }

    // Ranking Top 3 Kierowców miesiąca
    let topDrivers = [];
    try {
      const topDriversRaw = await dbAll(
        `SELECT userId, SUM(distance) as totalDistance, COUNT(id) as jobsCount 
         FROM Job 
         WHERE status = ? AND date >= ? 
         GROUP BY userId 
         ORDER BY totalDistance DESC LIMIT 3`,
        ['APPROVED', startOfMonth]
      );

      const topDriverUserIds = topDriversRaw.map(t => t.userId);
      let topDriverUsers = [];
      if (topDriverUserIds.length > 0) {
        const placeholders = topDriverUserIds.map(() => '?').join(',');
        topDriverUsers = await dbAll(
          `SELECT id, name, firstName, discordNick, image, rank FROM User WHERE id IN (${placeholders})`,
          topDriverUserIds
        );
      }

      topDrivers = topDriversRaw.map((t, idx) => {
        const u = topDriverUsers.find(usr => usr.id === t.userId);
        return {
          rankPosition: idx + 1,
          id: t.userId,
          name: u?.firstName || u?.discordNick || u?.name || "Kierowca",
          rank: u?.rank || "Kierowca",
          image: getSafeAvatarUrl(u || {}),
          distance: Number(t.totalDistance || 0),
          jobsCount: Number(t.jobsCount || 0)
        };
      });

      // Jeśli w tym miesiącu jest mniej niż 3 kierowców z ładunkami, uzupełnij z listy User
      if (topDrivers.length < 3) {
        const existingIds = topDrivers.map(t => t.id);
        let additionalUsersQuery = `SELECT id, name, firstName, discordNick, image, rank, totalDrivenKm FROM User WHERE driverStatus != 'WAITING_FOR_APPROVAL'`;
        let queryParams = [];
        
        if (existingIds.length > 0) {
            const placeholders = existingIds.map(() => '?').join(',');
            additionalUsersQuery += ` AND id NOT IN (${placeholders})`;
            queryParams.push(...existingIds);
        }
        
        additionalUsersQuery += ` ORDER BY totalDrivenKm DESC LIMIT ?`;
        queryParams.push(3 - topDrivers.length);
        
        const additionalUsers = await dbAll(additionalUsersQuery, queryParams);

        additionalUsers.forEach((u, idx) => {
          topDrivers.push({
            rankPosition: topDrivers.length + 1,
            id: u.id,
            name: u.firstName || u.discordNick || u.name || "Kierowca",
            rank: u.rank || "Kierowca",
            image: getSafeAvatarUrl(u),
            distance: Number(u.totalDrivenKm || 0),
            jobsCount: 0
          });
        });
      }
    } catch (e) {
      console.error("Błąd pobierania rankingu top drivers:", e);
    }

    // Strukturyzacja danych dla frontendu
    const dashboardData = {
      user: {
        id: user.id,
        name: user.firstName || user.discordNick || user.name || user.email,
        rawName: user.name,
        discordNick: user.discordNick,
        image: getSafeAvatarUrl(user),
        rank: user.rank,
        role: user.role,
        driverStatus: calculatedStatus,
        balance: Number(user.accountBalance || 0),
        vacationDays: Number(user.vacationDays || 0),
        praises: Number(user.praises || 0),
        reprimands: Number(user.reprimands || 0),
        totalDrivenKm: Number(user.totalDrivenKm || 0),
        totalJobsCount: totalJobsCount,
        monthlyDistance: monthlyDistance,
        monthlyLimit: user.monthlyLimitKm || 10000,
        averageFuel: parseFloat(averageFuel),
        medicalExamExpiry: user.medicalExamExpiry,
        drivingLicenseExpiry: user.drivingLicenseExpiry,
        adrPermissions: user.adrPermissions,
        ecoScore: user.ecoScore,
        penaltyPoints: user.penaltyPoints,
        driverRating: user.driverRating,
        dispatcherRating: user.dispatcherRating,
        reputationPoints: user.reputationPoints,
        probationPeriod: user.probationPeriod,
        premium: user.premium,
        premiumColor: user.premiumColor,
        birthDate: user.birthDate,
      },
      truck: user.assignedTruck ? {
        id: user.assignedTruck.id,
        fullName: `${user.assignedTruck.brand} ${user.assignedTruck.model} (${user.assignedTruck.plate})`,
        brand: user.assignedTruck.brand,
        model: user.assignedTruck.model,
        plate: user.assignedTruck.plate,
        fleetNumber: user.assignedTruck.fleetNumber,
        fuelLevel: user.assignedTruck.fuelLevel,
        cleanliness: user.assignedTruck.cleanliness,
        mileage: user.assignedTruck.mileage,
        condition: user.assignedTruck.condition,
        insuranceOCExpiry: user.assignedTruck.insuranceOCExpiry,
        insuranceACExpiry: user.assignedTruck.insuranceACExpiry,
        imageUrl: user.assignedTruck.imageUrl,
        pendingBreakdown: user.assignedTruck.pendingBreakdown,
        attachedTrailer: user.assignedTruck.attachedTrailer ? {
          brand: user.assignedTruck.attachedTrailer.brand,
          model: user.assignedTruck.attachedTrailer.model,
          plate: user.assignedTruck.attachedTrailer.plate,
          type: user.assignedTruck.attachedTrailer.type
        } : null
      } : null,
      company: {
        monthlyDistance: companyDistance
      },
      recentJobs: recentJobs,
      topDrivers: topDrivers
    };

    return NextResponse.json(dashboardData);
  } catch (error) {
    console.error("Błąd podczas pobierania danych pulpitu:", error);
    return NextResponse.json({ error: "Wystąpił błąd serwera." }, { status: 500 });
  }
}

export async function POST(req) {
  try {
    const session = await getServerSession(authOptions);

    if (!session || !session.user) {
      return NextResponse.json({ error: "Brak autoryzacji" }, { status: 401 });
    }

    const { action, status } = await req.json();

    const user = await dbOne("SELECT id, driverStatus FROM User WHERE id = ?", [session.user.id]);
    if (!user) return NextResponse.json({ error: "Brak użytkownika" }, { status: 404 });

    const assignedTruck = await dbOne("SELECT id FROM Truck WHERE assignedDriverId = ?", [user.id]);

    const ONE_YEAR = new Date();
    ONE_YEAR.setFullYear(ONE_YEAR.getFullYear() + 1);

    if (action === "TOGGLE_STATUS") {
      const allowedStatuses = ["ACTIVE", "ON_ROUTE", "ON_LEAVE"];
      const newStatus = allowedStatuses.includes(status) ? status : "ACTIVE";
      await dbRun("UPDATE User SET driverStatus = ?, updatedAt = NOW() WHERE id = ?", [newStatus, user.id]);
      return NextResponse.json({ success: true, driverStatus: newStatus });
    }

    if (action === "REFUEL" || action === "WASH" || action === "OC" || action === "AC") {
      if (!assignedTruck) return NextResponse.json({ error: "Brak przypisanego pojazdu." }, { status: 400 });
      
      let updateQuery = "";
      let params = [];
      if (action === "REFUEL") {
          updateQuery = "UPDATE Truck SET fuelLevel = 100, updatedAt = NOW() WHERE id = ?";
          params = [assignedTruck.id];
      }
      if (action === "WASH") {
          updateQuery = "UPDATE Truck SET cleanliness = 100, updatedAt = NOW() WHERE id = ?";
          params = [assignedTruck.id];
      }
      if (action === "OC") {
          updateQuery = "UPDATE Truck SET insuranceOCExpiry = ?, updatedAt = NOW() WHERE id = ?";
          params = [ONE_YEAR, assignedTruck.id];
      }
      if (action === "AC") {
          updateQuery = "UPDATE Truck SET insuranceACExpiry = ?, updatedAt = NOW() WHERE id = ?";
          params = [ONE_YEAR, assignedTruck.id];
      }

      await dbRun(updateQuery, params);
    } else if (action === "ACK_BREAKDOWN") {
      if (!assignedTruck) return NextResponse.json({ error: "Brak przypisanego pojazdu." }, { status: 400 });
      await dbRun("UPDATE Truck SET pendingBreakdown = NULL, updatedAt = NOW() WHERE id = ?", [assignedTruck.id]);
    } else if (action === "MEDICAL" || action === "LICENSE") {
      return NextResponse.json({ error: "Odnawianie dokumentów odbywa się teraz poprzez zdanie egzaminu / testu psychologicznego." }, { status: 400 });
    } else {
      return NextResponse.json({ error: "Nieznana akcja." }, { status: 400 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Błąd akcji RPG:", error);
    return NextResponse.json({ error: "Błąd serwera podczas akcji." }, { status: 500 });
  }
}
