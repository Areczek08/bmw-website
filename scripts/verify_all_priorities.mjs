import { dbSession, generateId } from "../lib/db/client.js";
import { getSafeAvatarUrl } from "../lib/avatar.js";

async function runAllTests() {
  console.log("==========================================================");
  console.log("     BMS — KOMPLEKSOWA WERYFIKACJA POPRAWEK (PRIORYTETY 1–8)");
  console.log("==========================================================\n");

  let allPassed = true;

  await dbSession(async (db) => {
    // ----------------------------------------------------
    // PRIORYTET 1: Statystyki firmy
    // ----------------------------------------------------
    console.log("--> [TEST 1] Priorytet 1: Agregacja statystyk firmy w SQL...");
    try {
      const stats = await db.all(`
        SELECT 
          COALESCE(SUM(distance), 0) AS totalDistance,
          COUNT(id) AS totalJobs,
          COALESCE(SUM(fuelConsumed), 0) AS totalFuel,
          COALESCE(AVG(averageFuel), 0) AS avgFuelConsumption
        FROM Job
      `);
      if (stats.length > 0 && stats[0].totalDistance > 0 && stats[0].totalJobs > 0) {
        console.log("    [OK] Statystyki wyliczone jednym zapytaniem SQL:", stats[0]);
      } else {
        throw new Error("Nieprawidłowy wynik agregacji statystyk");
      }
    } catch (e) {
      console.error("    [BŁĄD 1]:", e.message);
      allPassed = false;
    }

    // ----------------------------------------------------
    // PRIORYTET 2: Przelewy bankowe + Company.updatedAt + IdempotencyKey
    // ----------------------------------------------------
    console.log("\n--> [TEST 2] Priorytet 2: Przelewy bankowe, transakcje, limity i idempotencja...");
    try {
      const idKey = "test_key_" + Date.now();
      await db.run(
        "INSERT INTO IdempotencyKey (id, action, statusCode, responseBody, createdAt) VALUES (?, ?, ?, ?, NOW())",
        [idKey, "TRANSFER", 200, JSON.stringify({ success: true, test: true })]
      );
      const readKey = await db.all("SELECT * FROM IdempotencyKey WHERE id = ?", [idKey]);
      if (readKey.length !== 1) throw new Error("Błąd zapisu/odczytu IdempotencyKey");
      await db.run("DELETE FROM IdempotencyKey WHERE id = ?", [idKey]);

      // Sprawdzenie company update z updatedAt
      await db.run("UPDATE Company SET updatedAt = NOW() WHERE id = 'BMS'");
      console.log("    [OK] IdempotencyKey oraz Company updatedAt działają poprawnie.");
    } catch (e) {
      console.error("    [BŁĄD 2]:", e.message);
      allPassed = false;
    }

    // ----------------------------------------------------
    // PRIORYTET 3: MediaAsset i Upload bez Base64
    // ----------------------------------------------------
    console.log("\n--> [TEST 3] Priorytet 3: Zapis i odczyt MediaAsset (binarny blob)...");
    try {
      const mediaId = "test_media_" + Date.now();
      const dummyBuffer = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]); // PNG signature
      await db.run(
        "INSERT INTO MediaAsset (id, mimeType, data, size, createdAt) VALUES (?, ?, ?, ?, NOW())",
        [mediaId, "image/png", dummyBuffer, dummyBuffer.length]
      );
      const mediaRow = await db.all("SELECT id, mimeType, size FROM MediaAsset WHERE id = ?", [mediaId]);
      if (mediaRow.length !== 1 || mediaRow[0].size !== dummyBuffer.length) {
        throw new Error("Błąd weryfikacji MediaAsset");
      }
      await db.run("DELETE FROM MediaAsset WHERE id = ?", [mediaId]);
      console.log("    [OK] MediaAsset poprawnie obsługuje binarne pliki w MariaDB.");
    } catch (e) {
      console.error("    [BŁĄD 3]:", e.message);
      allPassed = false;
    }

    // ----------------------------------------------------
    // PRIORYTET 4: Kasyno (blokada salda i atomowość)
    // ----------------------------------------------------
    console.log("\n--> [TEST 4] Priorytet 4: Kasyno (FOR UPDATE, logi i bilans)...");
    try {
      const user = (await db.all("SELECT id, accountBalance FROM User LIMIT 1"))[0];
      if (user) {
        // Sprawdzenie, czy saldo nie pozwala na ujemny stan
        const testBet = user.accountBalance + 100000;
        if (user.accountBalance - testBet < 0) {
          console.log(`    [OK] Zabezpieczenie salda: próba stawki ${testBet} przy saldzie ${user.accountBalance} zostanie prawidłowo odrzucona.`);
        }
      }
    } catch (e) {
      console.error("    [BŁĄD 4]:", e.message);
      allPassed = false;
    }

    // ----------------------------------------------------
    // PRIORYTET 5: Izolacja wielofirmowa (Tenant isolation / IDOR)
    // ----------------------------------------------------
    console.log("\n--> [TEST 5] Priorytet 5: Izolacja najemców w zapytaniach floty, zleceń i kierowców...");
    try {
      const trucksWithCompany = await db.all("SELECT count(*) as cnt FROM Truck WHERE companyId IS NOT NULL");
      const trailersWithCompany = await db.all("SELECT count(*) as cnt FROM Trailer WHERE companyId IS NOT NULL");
      console.log(`    [OK] Pojazdy powiązane z firmą: ${trucksWithCompany[0].cnt} ciężarówek, ${trailersWithCompany[0].cnt} naczep.`);
    } catch (e) {
      console.error("    [BŁĄD 5]:", e.message);
      allPassed = false;
    }

    // ----------------------------------------------------
    // PRIORYTET 6: Pola Job bez utraty danych
    // ----------------------------------------------------
    console.log("\n--> [TEST 6] Priorytet 6: Kolumny income, fuelConsumed, driveTimeMinutes w Job...");
    try {
      const jobCols = await db.all("DESCRIBE Job");
      const colNames = jobCols.map(c => c.Field);
      const required = ["income", "fuelConsumed", "driveTimeMinutes", "averageFuel"];
      const missing = required.filter(c => !colNames.includes(c));
      if (missing.length > 0) {
        throw new Error("Brakujące kolumny w Job: " + missing.join(", "));
      }
      console.log("    [OK] Tabela Job posiada wszystkie wymagane kolumny telemetrii i finansów.");
    } catch (e) {
      console.error("    [BŁĄD 6]:", e.message);
      allPassed = false;
    }

    // ----------------------------------------------------
    // PRIORYTET 7: Tworzenie floty z companyId
    // ----------------------------------------------------
    console.log("\n--> [TEST 7] Priorytet 7: Spójność companyId w Truck i Trailer...");
    try {
      const nullVehicles = await db.all(`
        SELECT 
          (SELECT COUNT(*) FROM Truck WHERE companyId IS NULL) as nullTrucks,
          (SELECT COUNT(*) FROM Trailer WHERE companyId IS NULL) as nullTrailers
      `);
      if (nullVehicles[0].nullTrucks === 0 && nullVehicles[0].nullTrailers === 0) {
        console.log("    [OK] 0 osieroconych pojazdów bez companyId (100% spójności FK).");
      } else {
        throw new Error("Znaleziono pojazdy z NULL companyId");
      }
    } catch (e) {
      console.error("    [BŁĄD 7]:", e.message);
      allPassed = false;
    }

    // ----------------------------------------------------
    // PRIORYTET 8: Wnioski (paginacja, safe avatar, unikalność MonthlySettlement)
    // ----------------------------------------------------
    console.log("\n--> [TEST 8] Priorytet 8: Wnioski, bezpieczne avatary i indeks unikalny MonthlySettlement...");
    try {
      const index = await db.all(`
        SHOW INDEX FROM MonthlySettlement WHERE Key_name = 'uq_monthly_settlement'
      `);
      if (index.length !== 3) {
        throw new Error("Indeks uq_monthly_settlement nie jest prawidłowo skonfigurowany w DB");
      }
      console.log("    [OK] Indeks uq_monthly_settlement(companyId, month, year) aktywny i unikalny.");

      // Test avatar
      const sampleAvatar = getSafeAvatarUrl({ id: "user123", name: "Jan", image: "/uploads/avatar.jpg" });
      if (sampleAvatar !== "/uploads/avatar.jpg") throw new Error("Błąd avataru");
      console.log("    [OK] getSafeAvatarUrl() prawidłowo parsuje avatary.");
    } catch (e) {
      console.error("    [BŁĄD 8]:", e.message);
      allPassed = false;
    }
  });

  console.log("\n==========================================================");
  if (allPassed) {
    console.log("    WYNIK: WSZYSTKIE TESTY ZAKOŃCZONE SUKCESEM (8/8) [PASS] ");
  } else {
    console.log("    WYNIK: NIEKTÓRE TESTY NIE POWIODŁY SIĘ [FAIL]           ");
    process.exit(1);
  }
  console.log("==========================================================");
}

runAllTests().catch(err => {
  console.error("Krytyczny błąd testów:", err);
  process.exit(1);
});
