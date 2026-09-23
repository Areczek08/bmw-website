import { NextResponse } from "next/server";
import { db, dbOne, dbAll } from "../../../../lib/db";
import { getServerSession } from "next-auth/next";
import { authOptions } from "../../auth/[...nextauth]/route";
import { getSafeAvatarUrl } from "../../../../lib/avatar";

export async function GET(req, { params }) {
  try {
    const session = await getServerSession(authOptions);

    if (!session || !session.user) {
      return NextResponse.json({ error: "Brak autoryzacji" }, { status: 401 });
    }

    const { id } = await params;

    const user = await dbOne("SELECT * FROM User WHERE id = ?", [id]);

    if (!user || ((user.driverStatus === "WAITING_FOR_APPROVAL" || user.driverStatus === "INACTIVE") && session.user.role !== "BOARD" && session.user.role !== "OWNER" && session.user.id !== user.id)) {
      return NextResponse.json({ error: "Nie znaleziono użytkownika lub profil jest nieaktywny" }, { status: 404 });
    }

    const assignedTrucks = await dbAll("SELECT * FROM Truck WHERE assignedDriverId = ?", [id]);
    let assignedTruck = assignedTrucks[0] || null;
    
    if (assignedTruck && assignedTruck.attachedTrailerId) {
      assignedTruck.attachedTrailer = await dbOne("SELECT * FROM Trailer WHERE id = ?", [assignedTruck.attachedTrailerId]);
    }

    const jobs = await dbAll(`
      SELECT id, startCity, endCity, cargo, distance, date, status, weight, createdAt 
      FROM Job 
      WHERE userId = ? AND status = 'APPROVED'
      ORDER BY date DESC
    `, [id]);
    user.jobs = jobs;

    const vehicleHistory = await dbAll(`
      SELECT * FROM VehicleHistory WHERE userId = ? ORDER BY date DESC LIMIT 5
    `, [id]);
    
    for (let v of vehicleHistory) {
      if (v.truckId) v.truck = await dbOne("SELECT * FROM Truck WHERE id = ?", [v.truckId]);
      if (v.trailerId) v.trailer = await dbOne("SELECT * FROM Trailer WHERE id = ?", [v.trailerId]);
    }
    user.vehicleHistory = vehicleHistory;

    user.fuelCards = await dbAll("SELECT * FROM FuelCard WHERE userId = ? ORDER BY issuedAt DESC", [id]);

    const now = new Date();
    const currentMonth = now.getMonth();
    const currentYear = now.getFullYear();

    let thisMonthKm = 0;
    let thisYearKm = 0;
    let totalJobsKm = 0;
    let routeLengths = [];
    let cities = {};

    user.jobs.forEach(job => {
      const jobDate = new Date(job.date);
      const isThisMonth = jobDate.getMonth() === currentMonth && jobDate.getFullYear() === currentYear;
      const isThisYear = jobDate.getFullYear() === currentYear;

      if (isThisMonth) thisMonthKm += Number(job.distance || 0);
      if (isThisYear) thisYearKm += Number(job.distance || 0);
      
      totalJobsKm += Number(job.distance || 0);
      routeLengths.push(Number(job.distance || 0));

      if (job.endCity) {
        if (cities[job.endCity]) cities[job.endCity]++;
        else cities[job.endCity] = 1;
      }
    });

    const averageRouteLength = routeLengths.length > 0 ? (totalJobsKm / routeLengths.length) : 0;
    
    const topCities = Object.keys(cities)
      .map(city => ({ city, count: cities[city] }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 3)
      .map(item => item.city);

    const availableTrucks = await dbAll(`
      SELECT id, brand, model, plate, fleetNumber 
      FROM Truck 
      WHERE assignedDriverId IS NULL OR assignedDriverId = ?
    `, [id]);

    const availableTrailers = await dbAll(`
      SELECT t.id, t.brand, t.type, t.plate 
      FROM Trailer t
      LEFT JOIN Truck tr ON t.id = tr.attachedTrailerId
      WHERE tr.id IS NULL OR tr.assignedDriverId = ?
    `, [id]);

    const isOnline = user.lastOnline && (new Date() - new Date(user.lastOnline) < 5 * 60 * 1000);
    let computedStatus = user.driverStatus;
    if (computedStatus === "ACTIVE" || computedStatus === "OFFLINE") {
      computedStatus = isOnline ? "ACTIVE" : "OFFLINE";
    }

    const { password, emailVerified, accounts, sessions, ...restUser } = user;
    const safeUser = {
      ...restUser,
      assignedTruck,
      image: getSafeAvatarUrl(user),
      driverStatus: computedStatus
    };

    return NextResponse.json({
      driver: {
        ...safeUser,
        stats: {
          thisMonthKm,
          thisYearKm,
          totalJobsKm: totalJobsKm + Number(user.initialMileage || 0),
          averageRouteLength,
          topCities,
          jobsCount: user.jobs.length + Number(user.initialDeliveries || 0)
        },
        recentJobs: user.jobs.slice(0, 5),
        availableTrucks,
        availableTrailers
      }
    }, {
      headers: {
        "Cache-Control": "private, max-age=15, s-maxage=30"
      }
    });

  } catch (error) {
    console.error("Błąd API profilu:", error);
    return NextResponse.json({ error: "Wystąpił błąd podczas pobierania danych kierowcy." }, { status: 500 });
  }
}

export async function PUT(req, { params }) {
  try {
    const session = await getServerSession(authOptions);

    if (!session || !session.user) {
      return NextResponse.json({ error: "Brak autoryzacji" }, { status: 401 });
    }

    const { id } = await params;
    const isMyProfile = session.user.id === id || session.user.email?.startsWith(id);
    const canManage = ["DISPATCHER", "BOARD", "OWNER"].includes(session.user.role);

    if (!isMyProfile && !canManage) {
      return NextResponse.json({ error: "Brak uprawnień do edycji tego profilu." }, { status: 403 });
    }
    
    const body = await req.json();

    const updatedData = {};
    if (body.aboutMe !== undefined) updatedData.aboutMe = body.aboutMe;
    if (body.discordNick !== undefined) updatedData.discordNick = body.discordNick;
    if (body.facebookUrl !== undefined) updatedData.facebookUrl = body.facebookUrl;
    if (body.trucksBookUrl !== undefined) updatedData.trucksBookUrl = body.trucksBookUrl;
    if (body.trucksBookName !== undefined) updatedData.trucksBookName = body.trucksBookName;
    if (body.steamUrl !== undefined) updatedData.steamUrl = body.steamUrl;
    if (body.spotifyUrl !== undefined) updatedData.spotifyUrl = body.spotifyUrl;
    if (body.firstName !== undefined) updatedData.firstName = body.firstName;

    // Process image: only allow clean URLs or null; block raw Base64 data strings
    if (body.image !== undefined) {
      if (typeof body.image === "string" && body.image.trim() !== "") {
        const trimmed = body.image.trim();
        if (trimmed.startsWith("data:")) {
          return NextResponse.json({ 
            error: "Wysyłanie surowego Base64 jest zablokowane. Wgraj plik przez system uploadu." 
          }, { status: 400 });
        }
        if (trimmed.includes("/api/user/") && trimmed.endsWith("/avatar")) {
          // Skip placeholder URL to avoid recursion
        } else {
          updatedData.image = trimmed;
        }
      } else if (body.image === null || body.image === "") {
        updatedData.image = null;
      }
    }

    if (canManage) {
      if (body.birthDate !== undefined) {
        if (body.birthDate) {
          const d = new Date(body.birthDate);
          updatedData.birthDate = !isNaN(d.getTime()) ? d.toISOString().slice(0, 10) : null;
        } else {
          updatedData.birthDate = null;
        }
      }
      if (body.contractType !== undefined) updatedData.contractType = body.contractType;
      if (body.probationPeriod !== undefined) updatedData.probationPeriod = body.probationPeriod;
      if (body.role !== undefined) updatedData.role = body.role;
      if (body.rank !== undefined) updatedData.rank = body.rank;
      
      if (body.reputationPoints !== undefined) {
        const parsed = parseInt(body.reputationPoints);
        updatedData.reputationPoints = isNaN(parsed) ? 0 : parsed;
      }
      if (body.dispatcherRating !== undefined) {
        const parsed = parseFloat(body.dispatcherRating);
        updatedData.dispatcherRating = isNaN(parsed) ? 5.0 : parsed;
      }
      if (body.driverStatus !== undefined) updatedData.driverStatus = body.driverStatus;
      if (body.monthlyLimitKm !== undefined) {
        const parsedLimit = parseInt(body.monthlyLimitKm);
        updatedData.monthlyLimitKm = isNaN(parsedLimit) ? 10000 : parsedLimit;
      }
      if (body.initialMileage !== undefined) updatedData.initialMileage = parseInt(body.initialMileage) || 0;
      if (body.initialDeliveries !== undefined) updatedData.initialDeliveries = parseInt(body.initialDeliveries) || 0;
      
      if (body.truckId !== undefined) {
        await db(async (conn) => {
          await conn.query("UPDATE Truck SET assignedDriverId = NULL, status = 'AVAILABLE', updatedAt = NOW() WHERE assignedDriverId = ?", [id]);
          
          if (body.truckId !== null && body.truckId !== "") {
            await conn.query("UPDATE Truck SET assignedDriverId = ?, status = 'IN_USE', updatedAt = NOW() WHERE id = ?", [id, body.truckId]);
            
            if (body.trailerId !== undefined) {
              const truckArr = await conn.query("SELECT attachedTrailerId FROM Truck WHERE id = ?", [body.truckId]);
              if (truckArr.length > 0 && truckArr[0].attachedTrailerId) {
                await conn.query("UPDATE Trailer SET status = 'AVAILABLE', updatedAt = NOW() WHERE id = ?", [truckArr[0].attachedTrailerId]);
              }
              
              await conn.query("UPDATE Truck SET attachedTrailerId = NULL, updatedAt = NOW() WHERE id = ?", [body.truckId]);
              
              if (body.trailerId !== null && body.trailerId !== "") {
                await conn.query("UPDATE Truck SET attachedTrailerId = ?, updatedAt = NOW() WHERE id = ?", [body.trailerId, body.truckId]);
                await conn.query("UPDATE Trailer SET status = 'IN_USE', updatedAt = NOW() WHERE id = ?", [body.trailerId]);
              }
            }
          }
        });
      }
    }

    if (Object.keys(updatedData).length > 0) {
      const setClauses = [];
      const paramsArr = [];
      for (const [key, value] of Object.entries(updatedData)) {
        setClauses.push(`${key} = ?`);
        paramsArr.push(value);
      }
      setClauses.push("updatedAt = NOW()");
      paramsArr.push(id);
      
      await db(async (conn) => {
        await conn.query(`UPDATE User SET ${setClauses.join(", ")} WHERE id = ?`, paramsArr);
      });
    }

    const updatedUser = await dbOne("SELECT * FROM User WHERE id = ?", [id]);

    if (!updatedUser) {
      return NextResponse.json({ error: "Nie znaleziono użytkownika" }, { status: 404 });
    }

    return NextResponse.json({
      success: true,
      user: {
        ...updatedUser,
        image: getSafeAvatarUrl(updatedUser)
      }
    });

  } catch (error) {
    console.error("Błąd aktualizacji profilu:", error);
    return NextResponse.json({ error: "Wystąpił błąd podczas zapisywania profilu." }, { status: 500 });
  }
}

export async function DELETE(req, { params }) {
  try {
    const session = await getServerSession(authOptions);

    if (!session || !session.user || (session.user.role !== "BOARD" && session.user.role !== "OWNER")) {
      return NextResponse.json({ error: "Brak uprawnień do usuwania użytkowników." }, { status: 403 });
    }

    const { id } = await params;

    if (!id || id === session.user.id) {
      return NextResponse.json({ error: "Nie możesz usunąć tego konta." }, { status: 400 });
    }

    await db(async (conn) => {
      await conn.query("START TRANSACTION");
      try {
        await conn.query("UPDATE Truck SET assignedDriverId = NULL, status = 'AVAILABLE', updatedAt = NOW() WHERE assignedDriverId = ?", [id]);

        const userMessages = await conn.query("SELECT id FROM ChatMessage WHERE userId = ?", [id]);
        const messageIds = userMessages.map(m => m.id);
        
        if (messageIds.length > 0) {
          const inClause = messageIds.map(() => '?').join(',');
          await conn.query(`UPDATE ChatMessage SET replyToId = NULL WHERE replyToId IN (${inClause})`, messageIds);
          await conn.query(`DELETE FROM ChatMessageReaction WHERE messageId IN (${inClause})`, messageIds);
        }

        await conn.query("DELETE FROM ChatMessageReaction WHERE userId = ?", [id]);
        await conn.query("DELETE FROM ChatMessage WHERE userId = ?", [id]);
        await conn.query("DELETE FROM Job WHERE userId = ?", [id]);
        await conn.query("DELETE FROM Request WHERE userId = ?", [id]);
        await conn.query("DELETE FROM BankTransaction WHERE userId = ?", [id]);
        await conn.query("DELETE FROM Announcement WHERE authorId = ?", [id]);
        await conn.query("DELETE FROM CasinoLog WHERE userId = ?", [id]);
        await conn.query("DELETE FROM Loan WHERE userId = ?", [id]);
        await conn.query("DELETE FROM FuelLog WHERE userId = ?", [id]);
        
        await conn.query("UPDATE VehicleHistory SET userId = NULL WHERE userId = ?", [id]);
        await conn.query("UPDATE BugReport SET userId = NULL WHERE userId = ?", [id]);

        await conn.query("DELETE FROM User WHERE id = ?", [id]);
        await conn.query("COMMIT");
      } catch (err) {
        await conn.query("ROLLBACK");
        throw err;
      }
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Błąd usuwania kierowcy:", error);
    return NextResponse.json({ error: "Wystąpił błąd serwera podczas usuwania profilu." }, { status: 500 });
  }
}
