import { dbSession, generateId } from "../lib/db/client.js";

async function runTests() {
  console.log("=== TEST STATYSTYK DYSPOSYTORNI ===");

  await dbSession(async (db) => {
    // 1. Sprawdzenie stanu bazy
    const initialStats = await db.one(`
      SELECT 
        COUNT(j.id) AS totalJobsCount,
        COALESCE(SUM(CASE WHEN j.status = 'APPROVED' THEN j.distance ELSE 0 END), 0) AS totalApprovedDistance
      FROM Job j
      LEFT JOIN User u ON j.userId = u.id
      WHERE (u.companyId = 'BMS' OR u.companyId IS NULL)
    `);
    const countBefore = Number(initialStats.totalJobsCount);
    const distBefore = Number(initialStats.totalApprovedDistance);
    console.log(`[STAN POCZĄTKOWY] Trasy BMS: ${countBefore}, Dystans: ${distBefore} km`);

    // 2. Symulacja API z limitem 150
    const jobs150 = await db.all(`
      SELECT j.id, j.distance
      FROM Job j
      LEFT JOIN User u ON j.userId = u.id
      WHERE (u.companyId = 'BMS' OR u.companyId IS NULL)
      ORDER BY j.createdAt DESC
      LIMIT 150
    `);
    console.log(`[API RESPONSE] jobs.length: ${jobs150.length} (Oczekiwano: <= 150)`);
    if (jobs150.length > 150) throw new Error("jobs.length przekracza 150!");

    // 3. Sprawdzenie izolacji innej firmy (OTHER_CORP)
    const otherStats = await db.one(`
      SELECT 
        COUNT(j.id) AS totalJobsCount,
        COALESCE(SUM(CASE WHEN j.status = 'APPROVED' THEN j.distance ELSE 0 END), 0) AS totalApprovedDistance
      FROM Job j
      LEFT JOIN User u ON j.userId = u.id
      WHERE (u.companyId = 'OTHER_CORP' OR u.companyId IS NULL)
    `);
    console.log(`[IZOLACJA MULTI-TENANT] Trasy OTHER_CORP: ${otherStats.totalJobsCount}, Dystans: ${otherStats.totalApprovedDistance}`);
    if (Number(otherStats.totalJobsCount) !== 0) throw new Error("Wyciek danych innej firmy!");

    // 4. Test dodania nowej trasy
    const testDriver = await db.one("SELECT id FROM User WHERE companyId = 'BMS' LIMIT 1");
    if (!testDriver) throw new Error("Brak kierowcy BMS");

    const testJobId = generateId();
    const testDistance = 555;
    console.log(`\n[TEST TRASY] Wstawianie nowej trasy: ID=${testJobId}, Dystans=${testDistance} km`);

    await db.run(`
      INSERT INTO Job (id, userId, startCity, endCity, cargo, distance, status, summaryScreenshot, description, date, createdAt, updatedAt)
      VALUES (?, ?, 'Warszawa', 'Berlin', 'Test Cargo', ?, 'APPROVED', 'TEST', 'Test Trasy', NOW(), NOW(), NOW())
    `, [testJobId, testDriver.id, testDistance]);

    // Sprawdzenie statystyk po dodaniu
    const afterStats = await db.one(`
      SELECT 
        COUNT(j.id) AS totalJobsCount,
        COALESCE(SUM(CASE WHEN j.status = 'APPROVED' THEN j.distance ELSE 0 END), 0) AS totalApprovedDistance
      FROM Job j
      LEFT JOIN User u ON j.userId = u.id
      WHERE (u.companyId = 'BMS' OR u.companyId IS NULL)
    `);
    const countAfter = Number(afterStats.totalJobsCount);
    const distAfter = Number(afterStats.totalApprovedDistance);
    console.log(`[STAN PO DODANIU] Trasy BMS: ${countAfter} (Oczekiwano: ${countBefore + 1})`);
    console.log(`[STAN PO DODANIU] Dystans BMS: ${distAfter} km (Oczekiwano: ${distBefore + testDistance})`);

    const jobsAfter = await db.all(`
      SELECT j.id
      FROM Job j
      LEFT JOIN User u ON j.userId = u.id
      WHERE (u.companyId = 'BMS' OR u.companyId IS NULL)
      ORDER BY j.createdAt DESC
      LIMIT 150
    `);
    console.log(`[API RESPONSE PO DODANIU] jobs.length: ${jobsAfter.length} (Oczekiwano: <= 150)`);

    if (countAfter !== countBefore + 1) throw new Error("Licznik tras nie wzrósł o 1!");
    if (distAfter !== distBefore + testDistance) throw new Error("Dystans nie wzrósł o dystans nowej trasy!");
    if (jobsAfter.length > 150) throw new Error("jobs.length przekracza 150!");

    // 5. Bezpieczne usunięcie testowej trasy (brak naruszenia danych produkcyjnych)
    await db.run("DELETE FROM Job WHERE id = ?", [testJobId]);
    console.log("[CLEANUP] Pomyślnie usunięto trasę testową.");

    const finalStats = await db.one(`
      SELECT 
        COUNT(j.id) AS totalJobsCount,
        COALESCE(SUM(CASE WHEN j.status = 'APPROVED' THEN j.distance ELSE 0 END), 0) AS totalApprovedDistance
      FROM Job j
      LEFT JOIN User u ON j.userId = u.id
      WHERE (u.companyId = 'BMS' OR u.companyId IS NULL)
    `);
    console.log(`[STAN KOŃCOWY PO CLEANUP] Trasy: ${finalStats.totalJobsCount}, Dystans: ${finalStats.totalApprovedDistance} km`);
  });

  console.log("\n>>> WSZYSTKIE TESTY AGREGACJI ZAKOŃCZONE SUKCESEM <<<");
}

runTests().catch(err => {
  console.error("Błąd testu:", err);
  process.exit(1);
});
