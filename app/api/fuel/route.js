import { NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "../auth/[...nextauth]/route";
import { dbOne, dbAll, generateId, db } from "../../../lib/db";

// Pamięć podręczna cen paliw (cache)
let fuelPriceCache = null;
let lastCacheFetchTime = 0;
const CACHE_DURATION = 12 * 60 * 60 * 1000; // 12 godzin

const countryToIso = {
  "polska": "PL", "poland": "PL", "pl": "PL",
  "niemcy": "DE", "germany": "DE", "de": "DE",
  "wielka brytania": "GB", "great britain": "GB", "united kingdom": "GB", "uk": "GB", "gb": "GB", "anglia": "GB",
  "francja": "FR", "france": "FR", "fr": "FR",
  "wlochy": "IT", "włochy": "IT", "italy": "IT", "it": "IT",
  "holandia": "NL", "netherlands": "NL", "nl": "NL",
  "belgia": "BE", "belgium": "BE", "be": "BE",
  "czechy": "CZ", "czech republic": "CZ", "cz": "CZ",
  "slowacja": "SK", "słowacja": "SK", "slovakia": "SK", "sk": "SK",
  "litwa": "LT", "lithuania": "LT", "lt": "LT",
  "szwecja": "SE", "sweden": "SE", "se": "SE",
  "austria": "AT", "at": "AT",
  "szwajcaria": "CH", "switzerland": "CH", "ch": "CH",
  "hiszpania": "ES", "spain": "ES", "es": "ES"
};

const getCountryCode = (countryName) => {
  if (!countryName) return null;
  const normalized = countryName
    .toLowerCase()
    .trim()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "") // Usuwanie diakrytyków
    .replace(/ł/g, "l");
  
  for (const [key, value] of Object.entries(countryToIso)) {
    if (normalized.includes(key) || key.includes(normalized)) {
      return value;
    }
  }
  return null;
};

async function getLiveFuelPrices() {
  const now = Date.now();
  if (fuelPriceCache && (now - lastCacheFetchTime < CACHE_DURATION)) {
    return fuelPriceCache;
  }
  
  try {
    const [pricesRes, ratesRes] = await Promise.all([
      fetch("https://openvan.camp/api/fuel/prices?source=bms-website"),
      fetch("https://openvan.camp/api/currency/rates?source=bms-website")
    ]);
    
    if (!pricesRes.ok || !ratesRes.ok) {
      throw new Error("Failed to fetch fuel or currency data from OpenVan");
    }
    
    const pricesData = await pricesRes.json();
    const ratesData = await ratesRes.json();
    
    if (!pricesData.success || !ratesData.success) {
      throw new Error("Data returned from OpenVan indicates failure");
    }
    
    const plnRate = ratesData.rates.PLN || 4.30;
    const processedPrices = {};
    
    for (const [countryCode, countryInfo] of Object.entries(pricesData.data)) {
      const currency = countryInfo.currency || "EUR";
      const rawPrice = countryInfo.prices.diesel || countryInfo.prices.diesel_regular || countryInfo.prices.gasoline || 0;
      
      let priceInPln = 0;
      if (rawPrice > 0) {
        if (currency === "PLN") {
          priceInPln = rawPrice;
        } else if (currency === "EUR") {
          priceInPln = rawPrice * plnRate;
        } else {
          const localRate = ratesData.rates[currency];
          if (localRate) {
            priceInPln = (rawPrice / localRate) * plnRate;
          } else {
            priceInPln = rawPrice * plnRate;
          }
        }
      }
      
      processedPrices[countryCode] = priceInPln;
    }
    
    fuelPriceCache = processedPrices;
    lastCacheFetchTime = now;
    return fuelPriceCache;
  } catch (err) {
    console.error("Error fetching live fuel prices:", err);
    return fuelPriceCache || null;
  }
}

export async function GET(request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session || !session.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const action = searchParams.get('action');

    if (action === 'estimate') {
      const country = searchParams.get('country');
      const city = searchParams.get('city');

      if (!country) {
        return NextResponse.json({ error: "Country is required" }, { status: 400 });
      }

      const cleanCountry = country.trim();
      const cleanCity = city ? city.trim() : "";

      const cityLogs = await dbAll("SELECT pricePerLiter FROM FuelLog WHERE country = ? AND city = ? ORDER BY createdAt DESC LIMIT 5", [cleanCountry, cleanCity]);

      if (cityLogs.length > 0) {
        const sum = cityLogs.reduce((acc, log) => acc + log.pricePerLiter, 0);
        const avg = sum / cityLogs.length;
        return NextResponse.json({ price: avg.toFixed(2), source: "db_city" });
      }

      const countryLogs = await dbAll("SELECT pricePerLiter FROM FuelLog WHERE country = ? ORDER BY createdAt DESC LIMIT 10", [cleanCountry]);

      if (countryLogs.length > 0) {
        const sum = countryLogs.reduce((acc, log) => acc + log.pricePerLiter, 0);
        const avg = sum / countryLogs.length;
        return NextResponse.json({ price: avg.toFixed(2), source: "db_country" });
      }

      const countryCode = getCountryCode(cleanCountry);
      if (countryCode) {
        const livePrices = await getLiveFuelPrices();
        if (livePrices && livePrices[countryCode]) {
          let price = livePrices[countryCode];
          
          const todayStr = new Date().toISOString().slice(0, 10);
          const seedStr = todayStr + cleanCity.toLowerCase();
          let hash = 0;
          for (let i = 0; i < seedStr.length; i++) {
            hash = seedStr.charCodeAt(i) + ((hash << 5) - hash);
          }
          const fluctuation = ((Math.abs(hash) % 30) - 15) / 100;
          price += fluctuation;
          
          return NextResponse.json({ price: price.toFixed(2), source: "live_api" });
        }
      }

      return NextResponse.json({ price: null, source: "default" });
    }

    const userId = searchParams.get('userId');
    const truckId = searchParams.get('truckId');

    let query = "SELECT * FROM FuelLog";
    let params = [];
    if (userId && truckId) {
      query += " WHERE userId = ? AND truckId = ?";
      params.push(userId, truckId);
    } else if (userId) {
      query += " WHERE userId = ?";
      params.push(userId);
    } else if (truckId) {
      query += " WHERE truckId = ?";
      params.push(truckId);
    }
    query += " ORDER BY createdAt DESC";

    const logs = await dbAll(query, params);
    
    // Fetch users and trucks for relations
    let users = [];
    let trucks = [];
    if (logs.length > 0) {
      const userIds = [...new Set(logs.map(l => l.userId).filter(Boolean))];
      const truckIds = [...new Set(logs.map(l => l.truckId).filter(Boolean))];
      if (userIds.length > 0) {
        users = await dbAll(`SELECT id, name, firstName, email FROM User WHERE id IN (${userIds.map(() => '?').join(',')})`, userIds);
      }
      if (truckIds.length > 0) {
        trucks = await dbAll(`SELECT id, brand, model, plate, fleetNumber FROM Truck WHERE id IN (${truckIds.map(() => '?').join(',')})`, truckIds);
      }
    }

    const result = logs.map(log => ({
      ...log,
      user: users.find(u => u.id === log.userId) || { name: "Kierowca", firstName: "Kierowca", email: "" },
      truck: trucks.find(t => t.id === log.truckId) || { plate: "-", brand: "", model: "" }
    }));

    return NextResponse.json(result);
  } catch (error) {
    console.error("Error fetching fuel logs:", error);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}

export async function POST(request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session || !session.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const { truckId, country, city, liters, pricePerLiter, mileage, cardType } = body;

    if (!truckId || !country || !city || !liters || !pricePerLiter || !mileage || !cardType) {
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
    }

    const totalCost = parseFloat(liters) * parseFloat(pricePerLiter);

    const truck = await dbOne("SELECT id, mileage, plate FROM Truck WHERE id = ?", [truckId]);
    if (!truck) {
      return NextResponse.json({ error: "Truck not found" }, { status: 404 });
    }

    const newMileage = parseInt(mileage);

    const result = await db(async (conn) => {
      await conn.query("START TRANSACTION");
      try {
        const logId = generateId();
        await conn.query(
          "INSERT INTO FuelLog (id, userId, truckId, country, city, liters, pricePerLiter, totalCost, mileage, cardType, createdAt) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW())",
          [logId, session.user.id, truckId, country, city, parseFloat(liters), parseFloat(pricePerLiter), totalCost, newMileage, cardType]
        );

        if (newMileage > truck.mileage) {
          await conn.query("UPDATE Truck SET mileage = ?, location = ?, updatedAt = NOW() WHERE id = ?", [newMileage, city, truckId]);
        } else {
          await conn.query("UPDATE Truck SET location = ?, updatedAt = NOW() WHERE id = ?", [city, truckId]);
        }

        const companyRows = await conn.query("SELECT id, balance FROM Company WHERE id = ?", ["BMS"]);
        if (companyRows && companyRows.length > 0) {
          await conn.query("UPDATE Company SET balance = balance - ?, updatedAt = NOW() WHERE id = ?", [totalCost, "BMS"]);
        }

        const transId = generateId();
        const driverName = session.user.name || session.user.firstName || "Kierowca";
        await conn.query(
          "INSERT INTO CompanyTransaction (id, companyId, type, amount, category, description, date) VALUES (?, ?, 'EXPENSE', ?, 'Paliwo', ?, NOW())",
          [transId, "BMS", totalCost, `Tankowanie: ${truck.plate} | Kierowca: ${driverName} | ${liters}L x ${pricePerLiter} (${country}, ${city})`]
        );

        await conn.query("COMMIT");
        const logs = await conn.query("SELECT * FROM FuelLog WHERE id = ?", [logId]);
        return logs[0];
      } catch (txErr) {
        await conn.query("ROLLBACK");
        throw txErr;
      }
    });

    return NextResponse.json(result, { status: 201 });
  } catch (error) {
    console.error("Error creating fuel log:", error);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
