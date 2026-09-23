import https from "node:https";
import { SignJWT } from "jose";
import { dbSession, generateId } from "../lib/db/client.js";

const PROD_HOST = "system.vsbojarlogistic.pl";
const PROD_URL = `https://${PROD_HOST}`;
const NEXTAUTH_SECRET = "VtcBMS2026_9x!2Zq$8pL#1vN@3mK_BojarSystem";

async function createAuthCookie(user) {
  const secretKey = new TextEncoder().encode(NEXTAUTH_SECRET);
  const token = await new SignJWT({
    id: user.id,
    sub: user.id,
    name: user.name,
    email: user.email,
    role: user.role,
    driverStatus: user.driverStatus || "ACTIVE",
    companyId: user.companyId || "BMS",
    firstName: user.firstName || user.name,
    discordNick: user.discordNick || ""
  })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("2h")
    .sign(secretKey);

  return `__Secure-next-auth.session-token=${token}; next-auth.session-token=${token}`;
}

function request(path, options = {}) {
  return new Promise((resolve, reject) => {
    const url = new URL(path, PROD_URL);
    const headers = {
      "User-Agent": "BMS-SmokeTest/1.0",
      ...(options.headers || {})
    };

    let bodyData = null;
    if (options.json) {
      bodyData = JSON.stringify(options.json);
      headers["Content-Type"] = "application/json";
      headers["Content-Length"] = Buffer.byteLength(bodyData);
    } else if (options.body) {
      bodyData = options.body;
      if (!headers["Content-Length"]) {
        headers["Content-Length"] = Buffer.byteLength(bodyData);
      }
    }

    const req = https.request(url, {
      method: options.method || "GET",
      headers
    }, (res) => {
      const chunks = [];
      res.on("data", chunk => chunks.push(chunk));
      res.on("end", () => {
        const rawBody = Buffer.concat(chunks);
        const textBody = rawBody.toString("utf8");
        let json = null;
        try {
          json = JSON.parse(textBody);
        } catch (_) {}
        resolve({
          status: res.statusCode,
          headers: res.headers,
          body: textBody,
          rawBody,
          json
        });
      });
    });

    req.on("error", reject);
    if (bodyData) req.write(bodyData);
    req.end();
  });
}

const results = [];
function record(module, testName, passed, httpStatus, notes = "") {
  results.push({
    module,
    test: testName,
    passed,
    status: httpStatus,
    notes
  });
  const symbol = passed ? "✓" : "✗";
  console.log(`[${symbol}] [${module}] ${testName} -> HTTP ${httpStatus} | ${notes}`);
}

async function runSmokeTests() {
  console.log("=================================================================");
  console.log("             BMS FINAL PRODUCTION SMOKE TEST                     ");
  console.log(`             Host: ${PROD_URL}                                  `);
  console.log("=================================================================\n");

  const testUserAId = "smoke_usr_a_" + Date.now();
  const testUserBId = "smoke_usr_b_" + Date.now();
  let testTruckId = null;
  let testTrailerId = null;
  let testRequestId = null;
  let testJobId = null;
  let uploadedMediaId = null;

  try {
    // KROK 0: Przygotowanie testowych kont w MariaDB
    console.log("--- Przygotowanie danych testowych w MariaDB ---");
    await dbSession(async (db) => {
      await db.run(
        "INSERT INTO User (id, name, email, role, companyId, accountBalance, driverStatus, createdAt, updatedAt) VALUES (?, ?, ?, 'DRIVER', 'BMS', 500, 'ACTIVE', NOW(), NOW())",
        [testUserAId, "Smoke Driver A", `smoke_a_${Date.now()}@test.local`]
      );
      await db.run(
        "INSERT INTO User (id, name, email, role, companyId, accountBalance, driverStatus, createdAt, updatedAt) VALUES (?, ?, ?, 'DRIVER', 'BMS', 100, 'ACTIVE', NOW(), NOW())",
        [testUserBId, "Smoke Driver B", `smoke_b_${Date.now()}@test.local`]
      );
    });
    console.log("Utworzono konta testowe:", testUserAId, testUserBId);

    const cookieA = await createAuthCookie({ id: testUserAId, name: "Smoke Driver A", role: "DRIVER", companyId: "BMS" });
    const cookieOwner = await createAuthCookie({ id: "cmrysow1h0000v4vsghu5ixmg", name: "Administrator Testowy", role: "OWNER", companyId: "BMS" });
    const cookieBoard = await createAuthCookie({ id: "cmprhh54y0000jp04i6aaaygm", name: "necia77", role: "BOARD", companyId: "BMS" });
    const cookieDispatcher = await createAuthCookie({ id: testUserBId, name: "Dispatcher Test", role: "DISPATCHER", companyId: "BMS" });
    const cookieCompanyB = await createAuthCookie({ id: "foreign_usr", name: "Foreign Board", role: "BOARD", companyId: "OTHER_CORP" });

    // ==================================================
    // 1. PROFIL
    // ==================================================
    console.log("\n--- TEST 1: PROFIL ---");
    // 1.1 Otwarcie profilu
    const resGetProfile = await request(`/api/drivers/${testUserAId}`, { headers: { Cookie: cookieA } });
    record("PROFIL", "Otwarcie profilu", resGetProfile.status === 200, resGetProfile.status, `driver name: ${resGetProfile.json?.driver?.name}`);

    // 1.2 Edycja danych - zapis bez zdjęcia
    const resSaveNoPhoto = await request(`/api/drivers/${testUserAId}`, {
      method: "PUT",
      headers: { Cookie: cookieA },
      json: { name: "Smoke Driver A (Edited)", notes: "Test note" }
    });
    record("PROFIL", "Zapis bez zdjęcia", resSaveNoPhoto.status === 200, resSaveNoPhoto.status, "Zaktualizowano imię i notatkę");

    // 1.3 Upload zdjęcia przez /api/upload
    const dummyPng = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==", "base64");
    const boundary = "----SmokeBoundary" + Date.now();
    const multipartBody = Buffer.concat([
      Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="avatar.png"\r\nContent-Type: image/png\r\n\r\n`),
      dummyPng,
      Buffer.from(`\r\n--${boundary}--\r\n`)
    ]);

    const resUpload = await request("/api/upload", {
      method: "POST",
      headers: {
        Cookie: cookieA,
        "Content-Type": `multipart/form-data; boundary=${boundary}`
      },
      body: multipartBody
    });
    uploadedMediaId = resUpload.json?.url ? resUpload.json.url.split("/").pop() : null;
    record("PROFIL", "Upload zdjęcia", resUpload.status === 200 && resUpload.json?.url?.startsWith("/api/media/"), resUpload.status, `Zwrócono URL: ${resUpload.json?.url}`);

    // 1.4 Zapis profilu ze zdjęciem
    const photoUrl = resUpload.json?.url;
    const resSaveWithPhoto = await request(`/api/drivers/${testUserAId}`, {
      method: "PUT",
      headers: { Cookie: cookieA },
      json: { image: photoUrl }
    });
    record("PROFIL", "Zapis profilu ze zdjęciem", resSaveWithPhoto.status === 200, resSaveWithPhoto.status, "Zapisano URL zdjęcia");

    // 1.5 Odświeżenie strony i ponowne wejście
    const resReload = await request(`/api/drivers/${testUserAId}`, { headers: { Cookie: cookieA } });
    const imageMatches = resReload.json?.driver?.image === photoUrl;
    record("PROFIL", "Odświeżenie i weryfikacja zdjęcia", imageMatches, resReload.status, `Zapisany image w profilu: ${resReload.json?.driver?.image}`);

    // 1.6 Pobranie obrazu
    if (uploadedMediaId) {
      const resFetchMedia = await request(`/api/media/${uploadedMediaId}`);
      record("PROFIL", "Pobranie obrazu z /api/media", resFetchMedia.status === 200 && resFetchMedia.headers["content-type"]?.includes("image"), resFetchMedia.status, `Cache-Control: ${resFetchMedia.headers["cache-control"]}`);
    }

    // 1.7 Zmiana zdjęcia na nowe
    const resChangePhoto = await request(`/api/drivers/${testUserAId}`, {
      method: "PUT",
      headers: { Cookie: cookieA },
      json: { image: "https://example.com/avatar2.jpg" }
    });
    record("PROFIL", "Zmiana zdjęcia", resChangePhoto.status === 200, resChangePhoto.status, "Zaktualizowano na nowy URL");

    // 1.8 Usunięcie zdjęcia
    const resDeletePhoto = await request(`/api/drivers/${testUserAId}`, {
      method: "PUT",
      headers: { Cookie: cookieA },
      json: { image: null }
    });
    const resCheckNull = await request(`/api/drivers/${testUserAId}`, { headers: { Cookie: cookieA } });
    record("PROFIL", "Usunięcie zdjęcia", resCheckNull.json?.driver?.image === null, resDeletePhoto.status, `image po usunięciu: ${resCheckNull.json?.driver?.image}`);

    // ==================================================
    // 2. PRZELEWY P2P
    // ==================================================
    console.log("\n--- TEST 2: PRZELEWY P2P ---");
    const testIdempotencyKey = "smoke_idemp_" + Date.now();

    // 2.1 Wykonanie przelewu 50 PLN z A do B
    const resTransfer = await request("/api/user/bank/transfer", {
      method: "POST",
      headers: {
        Cookie: cookieA,
        "x-idempotency-key": testIdempotencyKey
      },
      json: {
        receiverId: testUserBId,
        amount: 50,
        title: "Test Smoke P2P"
      }
    });
    record("PRZELEWY", "Wykonanie przelewu P2P (50 PLN)", resTransfer.status === 200, resTransfer.status, `Odpowiedź: ${JSON.stringify(resTransfer.json)}`);

    // 2.2 Weryfikacja salda nadawcy i odbiorcy w DB
    let senderBal = null;
    let receiverBal = null;
    await dbSession(async (db) => {
      const uA = (await db.all("SELECT accountBalance FROM User WHERE id = ?", [testUserAId]))[0];
      const uB = (await db.all("SELECT accountBalance FROM User WHERE id = ?", [testUserBId]))[0];
      senderBal = uA?.accountBalance;
      receiverBal = uB?.accountBalance;
    });
    // 50 PLN transferu + 1 PLN prowizji = 51 PLN odliczone od nadawcy
    record("PRZELEWY", "Weryfikacja salda nadawcy (500 -> 449 z prowizją 1 PLN)", senderBal === 449, 200, `Saldo nadawcy: ${senderBal}`);
    record("PRZELEWY", "Weryfikacja salda odbiorcy (100 -> 150)", receiverBal === 150, 200, `Saldo odbiorcy: ${receiverBal}`);

    // 2.3 Historia BankTransaction
    let hasBankTx = false;
    await dbSession(async (db) => {
      const txs = await db.all("SELECT * FROM BankTransaction WHERE userId = ? ORDER BY date DESC LIMIT 1", [testUserAId]);
      hasBankTx = txs.length > 0 && txs[0].amount === -51;
    });
    record("PRZELEWY", "Historia BankTransaction", hasBankTx, 200, "Wpis debetowy w BankTransaction zarejestrowany");

    // 2.4 Ponowienie tego samego requestu z tym samym Idempotency Key
    const resIdempRetry = await request("/api/user/bank/transfer", {
      method: "POST",
      headers: {
        Cookie: cookieA,
        "x-idempotency-key": testIdempotencyKey
      },
      json: {
        receiverId: testUserBId,
        amount: 50,
        title: "Test Smoke P2P Retry"
      }
    });
    let senderBalAfterRetry = null;
    await dbSession(async (db) => {
      const uA = (await db.all("SELECT accountBalance FROM User WHERE id = ?", [testUserAId]))[0];
      senderBalAfterRetry = uA?.accountBalance;
    });
    record("PRZELEWY", "Idempotencja (środki pobrane tylko raz)", resIdempRetry.status === 200 && senderBalAfterRetry === 449, resIdempRetry.status, `Saldo po retry: ${senderBalAfterRetry} (nie pobrano podwójnie)`);

    // 2.5 Brak wystarczających środków
    const resOverdraft = await request("/api/user/bank/transfer", {
      method: "POST",
      headers: { Cookie: cookieA },
      json: { receiverId: testUserBId, amount: 99999, title: "Overdraft test" }
    });
    record("PRZELEWY", "Brak wystarczających środków", resOverdraft.status === 400, resOverdraft.status, `Odrzucono: ${resOverdraft.json?.error}`);

    // 2.6 Przekroczenie limitu dziennego (10 000 PLN)
    const resDailyLimit = await request("/api/user/bank/transfer", {
      method: "POST",
      headers: { Cookie: cookieA },
      json: { receiverId: testUserBId, amount: 15000, title: "Limit test" }
    });
    record("PRZELEWY", "Przekroczenie limitu dziennego (10k)", resDailyLimit.status === 400, resDailyLimit.status, `Odrzucono: ${resDailyLimit.json?.error}`);

    // 2.7 Błędny odbiorca
    const resInvalidRecipient = await request("/api/user/bank/transfer", {
      method: "POST",
      headers: { Cookie: cookieA },
      json: { receiverId: "non_existing_user_id", amount: 10, title: "Invalid recipient test" }
    });
    record("PRZELEWY", "Błędny odbiorca", resInvalidRecipient.status === 404, resInvalidRecipient.status, `Odrzucono: ${resInvalidRecipient.json?.error}`);

    // ==================================================
    // 3. WYPŁATY FIRMOWE (/api/finance/transfer)
    // ==================================================
    console.log("\n--- TEST 3: WYPŁATY FIRMOWE ---");
    let compBalanceBefore = 0;
    await dbSession(async (db) => {
      const c = (await db.all("SELECT balance FROM Company WHERE id = 'BMS'"))[0];
      compBalanceBefore = c?.balance || 0;
    });

    const resFinanceTransfer = await request("/api/finance/transfer", {
      method: "POST",
      headers: { Cookie: cookieOwner },
      json: {
        userId: testUserBId,
        amount: 25,
        title: "Premia testowa Smoke"
      }
    });
    record("WYPŁATY", "Wypłata firmowa /api/finance/transfer", resFinanceTransfer.status === 200, resFinanceTransfer.status, `Wynik: ${JSON.stringify(resFinanceTransfer.json)}`);

    let compBalanceAfter = 0;
    let driverBalAfterPayout = 0;
    await dbSession(async (db) => {
      const c = (await db.all("SELECT balance FROM Company WHERE id = 'BMS'"))[0];
      const u = (await db.all("SELECT accountBalance FROM User WHERE id = ?", [testUserBId]))[0];
      compBalanceAfter = c?.balance || 0;
      driverBalAfterPayout = u?.accountBalance || 0;
    });
    record("WYPŁATY", "Weryfikacja salda firmy i kierowcy", compBalanceBefore - compBalanceAfter === 25 && driverBalAfterPayout === 175, 200, `Firma: -25, Kierowca: 150 -> 175`);

    // ==================================================
    // 4. KASYNO
    // ==================================================
    console.log("\n--- TEST 4: KASYNO ---");
    // 4.1 Gra z poprawnym saldem
    const resCasinoValid = await request("/api/casino/play", {
      method: "POST",
      headers: { Cookie: cookieA },
      json: { game: "ROULETTE", betAmount: 10, betType: "RED" }
    });
    record("KASYNO", "Gra z poprawnym saldem (10 PLN)", resCasinoValid.status === 200, resCasinoValid.status, `Rezultat: ${resCasinoValid.json?.isWin ? "Wygrana" : "Przegrana"}, nowe saldo: ${resCasinoValid.json?.newBalance}`);

    // 4.2 Gra powyżej salda
    const resCasinoOver = await request("/api/casino/play", {
      method: "POST",
      headers: { Cookie: cookieA },
      json: { game: "ROULETTE", betAmount: 999999, betType: "RED" }
    });
    record("KASYNO", "Gra powyżej salda (blokada)", resCasinoOver.status === 400, resCasinoOver.status, `Odrzucono: ${resCasinoOver.json?.error}`);

    // 4.3 Kilka równoległych requestów kasyna
    const parallelPromises = Array.from({ length: 5 }, () =>
      request("/api/casino/play", {
        method: "POST",
        headers: { Cookie: cookieA },
        json: { game: "ROULETTE", betAmount: 20, betType: "RED" }
      })
    );
    const parallelResponses = await Promise.all(parallelPromises);
    const allCasinoStatuses = parallelResponses.map(r => r.status);
    let finalCasinoBal = null;
    await dbSession(async (db) => {
      const u = (await db.all("SELECT accountBalance FROM User WHERE id = ?", [testUserAId]))[0];
      finalCasinoBal = u?.accountBalance;
    });
    record("KASYNO", "Równoległe zakłady (atomowość transakcji)", parallelResponses.every(r => r.status === 200) && finalCasinoBal >= 0, 200, `Statusy: ${allCasinoStatuses.join(",")}, saldo końcowe: ${finalCasinoBal} (>= 0)`);

    // 4.4 Sprawdzenie CasinoLog
    let hasCasinoLog = false;
    await dbSession(async (db) => {
      const logs = await db.all("SELECT * FROM CasinoLog WHERE userId = ? LIMIT 1", [testUserAId]);
      hasCasinoLog = logs.length > 0;
    });
    record("KASYNO", "Sprawdzenie wpisów CasinoLog", hasCasinoLog, 200, "Wpisy w CasinoLog utworzone prawidłowo");

    // ==================================================
    // 5. PROFIL / UPLOAD (Audyt nagłówków i Base64)
    // ==================================================
    console.log("\n--- TEST 5: AUDYT UPLOAD / BASE64 ---");
    // Próba wysłania Base64 do profilu - powinno zostać zignorowane i nie zepsuć profilu
    const resBase64Put = await request(`/api/drivers/${testUserAId}`, {
      method: "PUT",
      headers: { Cookie: cookieA },
      json: { image: "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==" }
    });
    let profileAfterBase64 = null;
    await dbSession(async (db) => {
      const u = (await db.all("SELECT image FROM User WHERE id = ?", [testUserAId]))[0];
      profileAfterBase64 = u?.image;
    });
    const base64Blocked = !profileAfterBase64 || !profileAfterBase64.startsWith("data:image");
    record("UPLOAD", "Blokada zapisu surowego Base64 do User.image", base64Blocked, resBase64Put.status, `Wartość w bazie: ${profileAfterBase64 || "null"}`);

    // ==================================================
    // 6. FLOTA
    // ==================================================
    console.log("\n--- TEST 6: FLOTA ---");
    const testTruckPlate = "SMK-" + Math.floor(Math.random() * 9000 + 1000);
    const testTrailerPlate = "TRL-" + Math.floor(Math.random() * 9000 + 1000);
    const randomFleetNum = "F" + Math.floor(Math.random() * 8999 + 1000);

    // 6.1 Tworzenie Truck
    const resCreateTruck = await request("/api/fleet/create", {
      method: "POST",
      headers: { Cookie: cookieOwner },
      json: {
        category: "Ciągnik",
        brand: "Scania",
        model: "S500 Test",
        plate: testTruckPlate,
        fleetNumber: randomFleetNum
      }
    });
    testTruckId = resCreateTruck.json?.vehicle?.id;
    record("FLOTA", "Utworzenie testowego Truck", resCreateTruck.status === 200 && !!testTruckId, resCreateTruck.status, `Truck ID: ${testTruckId}, companyId: ${resCreateTruck.json?.vehicle?.companyId}`);

    // 6.2 Tworzenie Trailer
    const resCreateTrailer = await request("/api/fleet/create", {
      method: "POST",
      headers: { Cookie: cookieOwner },
      json: {
        category: "Naczepa",
        brand: "Krone",
        model: "Mega Liner",
        plate: testTrailerPlate
      }
    });
    testTrailerId = resCreateTrailer.json?.vehicle?.id;
    record("FLOTA", "Utworzenie testowej Trailer", resCreateTrailer.status === 200 && !!testTrailerId, resCreateTrailer.status, `Trailer ID: ${testTrailerId}, companyId: ${resCreateTrailer.json?.vehicle?.companyId}`);

    // 6.3 Sprawdzenie companyId w bazie
    let truckDbCompany = null;
    let trailerDbCompany = null;
    await dbSession(async (db) => {
      const trk = (await db.all("SELECT companyId FROM Truck WHERE id = ?", [testTruckId]))[0];
      const trl = (await db.all("SELECT companyId FROM Trailer WHERE id = ?", [testTrailerId]))[0];
      truckDbCompany = trk?.companyId;
      trailerDbCompany = trl?.companyId;
    });
    record("FLOTA", "Weryfikacja companyId w MariaDB", truckDbCompany === "BMS" && trailerDbCompany === "BMS", 200, `Truck: ${truckDbCompany}, Trailer: ${trailerDbCompany}`);

    // 6.4 Sprawdzenie widoczności dla właściwej firmy
    const resFleetBMS = await request("/api/fleet", { headers: { Cookie: cookieBoard } });
    const truckVisible = resFleetBMS.json?.trucks?.some(t => t.id === testTruckId);
    record("FLOTA", "Widoczność dla właściwej firmy (BMS)", truckVisible, resFleetBMS.status, "Pojazd obecny na liście firmy BMS");

    // 6.5 Sprawdzenie braku widoczności dla innej firmy
    const resFleetOther = await request("/api/fleet", { headers: { Cookie: cookieCompanyB } });
    const truckHiddenForOther = !resFleetOther.json?.trucks?.some(t => t.id === testTruckId);
    record("FLOTA", "Brak widoczności dla obcej firmy (Izolacja)", truckHiddenForOther, resFleetOther.status, "Pojazd ukryty przed inną firmą");

    // 6.6 Edycja pojazdu
    const resEditTruck = await request(`/api/fleet/${testTruckId}/edit`, {
      method: "PUT",
      headers: { Cookie: cookieBoard },
      json: {
        category: "Ciągnik",
        brand: "Scania",
        model: "S500 Test",
        plate: testTruckPlate,
        fleetNumber: randomFleetNum,
        type: "Ciągnik",
        status: "AVAILABLE",
        ownershipStatus: "Własność",
        location: "Warszawa Centralna"
      }
    });
    record("FLOTA", "Edycja pojazdu", resEditTruck.status === 200, resEditTruck.status, "Zaktualizowano lokalizację");

    // 6.7 Przypisanie naczepy i kierowcy
    const resSetFleet = await request("/api/fleet/set", {
      method: "PUT",
      headers: { Cookie: cookieBoard },
      json: {
        truckId: testTruckId,
        trailerId: testTrailerId,
        driverId: testUserAId
      }
    });
    record("FLOTA", "Przypisanie zestawu (kierowca + naczepa)", resSetFleet.status === 200, resSetFleet.status, "Pojazd przypisany do kierowcy i naczepy");

    // ==================================================
    // 7. ZLECENIA (JOB DATA INTEGRITY)
    // ==================================================
    console.log("\n--- TEST 7: ZLECENIA ---");
    testJobId = "smoke_job_" + Date.now();
    const testIncome = 4500.50;
    const testFuel = 280.75;
    const testDriveTime = 420; // 7h

    // Tworzenie zlecenia z telemetrią i finansami
    await dbSession(async (db) => {
      await db.run(`
        INSERT INTO Job (id, userId, startCity, endCity, cargo, distance, status, summaryScreenshot, truckScreenshot, income, fuelConsumed, driveTimeMinutes, averageFuel, createdAt, updatedAt)
        VALUES (?, ?, 'Berlin', 'Warszawa', 'Elektronika', 580, 'APPROVED', '', '', ?, ?, ?, 32.5, NOW(), NOW())
      `, [testJobId, testUserAId, testIncome, testFuel, testDriveTime]);
    });

    // Pobranie zlecenia przez API /api/user/jobs
    const resUserJobs = await request("/api/user/jobs", { headers: { Cookie: cookieA } });
    const fetchedJob = resUserJobs.json?.jobs?.find(j => j.id === testJobId);
    const telemetryMatches = fetchedJob &&
      Math.abs(fetchedJob.income - testIncome) < 0.01 &&
      Math.abs(fetchedJob.fuelConsumed - testFuel) < 0.01 &&
      fetchedJob.driveTimeMinutes === testDriveTime;

    record("ZLECENIA", "Zapis i odczyt income, fuelConsumed, driveTimeMinutes", telemetryMatches, resUserJobs.status, `income: ${fetchedJob?.income}, fuel: ${fetchedJob?.fuelConsumed}, time: ${fetchedJob?.driveTimeMinutes}`);

    // ==================================================
    // 8. WNIOSKI
    // ==================================================
    console.log("\n--- TEST 8: WNIOSKI ---");
    // 8.1 Utworzenie wniosku
    const resCreateReq = await request("/api/requests/create", {
      method: "POST",
      headers: { Cookie: cookieA },
      json: {
        type: "SERVICE",
        title: "Wniosek testowy Smoke",
        content: "Testowy opis wniosku serwisowego"
      }
    });
    testRequestId = resCreateReq.json?.request?.id;
    record("WNIOSKI", "Utworzenie wniosku", resCreateReq.status === 200 && !!testRequestId, resCreateReq.status, `Request ID: ${testRequestId}`);

    // 8.2 Lista wniosków z paginacją
    const resListReq = await request("/api/requests?limit=10&page=1", { headers: { Cookie: cookieBoard } });
    const reqFoundInList = resListReq.json?.requests?.some(r => r.id === testRequestId);
    record("WNIOSKI", "Lista i paginacja wniosków", resListReq.status === 200 && reqFoundInList && resListReq.json?.limit === 10, resListReq.status, `Pobrano ${resListReq.json?.requests?.length} wniosków, limit: ${resListReq.json?.limit}`);

    // 8.3 Blokada dostępu dla innej firmy (IDOR)
    const resReqCrossAction = await request(`/api/requests/${testRequestId}/action`, {
      method: "POST",
      headers: { Cookie: cookieCompanyB },
      json: { action: "APPROVE", comment: "Hacked" }
    });
    record("WNIOSKI", "Brak dostępu do wniosku obcej firmy (403)", resReqCrossAction.status === 403, resReqCrossAction.status, `Odmowa: ${resReqCrossAction.json?.error}`);

    // 8.4 Akceptacja przez Zarząd własnej firmy
    const resApproveReq = await request(`/api/requests/${testRequestId}/action`, {
      method: "POST",
      headers: { Cookie: cookieBoard },
      json: { action: "APPROVE", comment: "Zatwierdzono w teście smoke" }
    });
    record("WNIOSKI", "Akceptacja wniosku przez Zarząd", resApproveReq.status === 200, resApproveReq.status, "Wniosek pomyślnie zatwierdzony");

    // ==================================================
    // 9. STATYSTYKI FIRMY
    // ==================================================
    console.log("\n--- TEST 9: STATYSTYKI FIRMY ---");
    // 9.1 Niezalogowany -> 401
    const resStatAnon = await request("/api/statistics/company");
    record("STATYSTYKI", "Niezalogowany dostęp (401)", resStatAnon.status === 401, resStatAnon.status, "Odmowa braku sesji");

    // 9.2 DRIVER -> 403
    const resStatDriver = await request("/api/statistics/company", { headers: { Cookie: cookieA } });
    record("STATYSTYKI", "Dostęp DRIVER (403)", resStatDriver.status === 403, resStatDriver.status, "Zablokowano kierowcę");

    // 9.3 DISPATCHER -> 403
    const resStatDispatcher = await request("/api/statistics/company", { headers: { Cookie: cookieDispatcher } });
    record("STATYSTYKI", "Dostęp DISPATCHER (403)", resStatDispatcher.status === 403, resStatDispatcher.status, "Zablokowano dyspozytora");

    // 9.4 BOARD -> 200
    const resStatBoard = await request("/api/statistics/company", { headers: { Cookie: cookieBoard } });
    record("STATYSTYKI", "Dostęp BOARD (200)", resStatBoard.status === 200 && resStatBoard.json?.totalDistance > 0, resStatBoard.status, `Dystans firmy: ${resStatBoard.json?.totalDistance} km`);

    // 9.5 OWNER -> 200
    const resStatOwner = await request("/api/statistics/company", { headers: { Cookie: cookieOwner } });
    record("STATYSTYKI", "Dostęp OWNER (200)", resStatOwner.status === 200 && resStatOwner.json?.totalJobs > 0, resStatOwner.status, `Liczba zleceń: ${resStatOwner.json?.totalJobs}`);

    // ==================================================
    // 10. MAPA / CHAT / REALTIME
    // ==================================================
    console.log("\n--- TEST 10: MAPA / CHAT / REALTIME ---");
    // 10.1 Mapa
    const resMap = await request("/api/map");
    const mapHasDrivers = Array.isArray(resMap.json) && resMap.json.length > 0;
    const mapNoBase64 = !resMap.body.includes("data:image/");
    record("MAPA", "Pobranie mapy i pozycji kierowców", resMap.status === 200 && mapHasDrivers && mapNoBase64, resMap.status, `Kierowców na mapie: ${resMap.json?.length}, czysty payload bez Base64`);

    // 10.2 BRP v1 Gateway Info
    const resWsGateway = await request("/api/ws");
    record("REALTIME", "Brama WebSocket RealtimeHub (BRP v1)", resWsGateway.status === 200 && resWsGateway.json?.protocol === "BRP v1", resWsGateway.status, `Status: ${resWsGateway.json?.status}, Protokół: ${resWsGateway.json?.protocol}`);

    // 10.3 Chat pobranie historii
    const resChatHistory = await request("/api/chat", { headers: { Cookie: cookieA } });
    const chatHasItems = Array.isArray(resChatHistory.json);
    record("CHAT", "Pobranie historii wiadomości", resChatHistory.status === 200 && chatHasItems, resChatHistory.status, `Wiadomości w historii: ${resChatHistory.json?.length}`);

    // 10.4 Chat wysłanie wiadomości
    const testMsgContent = "Wiadomość smoke test " + Date.now();
    const resChatSend = await request("/api/chat", {
      method: "POST",
      headers: { Cookie: cookieA },
      json: { content: testMsgContent }
    });
    record("CHAT", "Wysłanie wiadomości na czacie", resChatSend.status === 200, resChatSend.status, "Wiadomość pomyślnie wysłana");

    // 10.5 Usunięcie testowej wiadomości z bazy
    await dbSession(async (db) => {
      await db.run("DELETE FROM ChatMessage WHERE content = ?", [testMsgContent]);
    });

  } catch (error) {
    console.error("Błąd krytyczny podczas smoke testu:", error);
    record("GLOBAL", "Krytyczny błąd testu", false, 500, error.message);
  } finally {
    // KROK KOŃCOWY: Bezpieczne sprzątanie danych testowych
    console.log("\n--- Czyszczenie utworzonych danych testowych w MariaDB ---");
    await dbSession(async (db) => {
      await db.run("DELETE FROM BankTransaction WHERE userId IN (?, ?)", [testUserAId, testUserBId]);
      await db.run("DELETE FROM CasinoLog WHERE userId = ?", [testUserAId]);
      if (testTruckId) await db.run("DELETE FROM Truck WHERE id = ?", [testTruckId]);
      if (testTrailerId) await db.run("DELETE FROM Trailer WHERE id = ?", [testTrailerId]);
      if (testRequestId) await db.run("DELETE FROM Request WHERE id = ?", [testRequestId]);
      if (testJobId) await db.run("DELETE FROM Job WHERE id = ?", [testJobId]);
      if (uploadedMediaId) await db.run("DELETE FROM MediaAsset WHERE id = ?", [uploadedMediaId]);
      if (testUserAId) await db.run("DELETE FROM User WHERE id = ?", [testUserAId]);
      if (testUserBId) await db.run("DELETE FROM User WHERE id = ?", [testUserBId]);
    });
    console.log("Czyszczenie zakończone.");
  }

  console.log("\n=================================================================");
  console.log("             PODSUMOWANIE WYNIKÓW SMOKE TESTU                    ");
  console.log("=================================================================");
  const allPassed = results.every(r => r.passed);
  console.log(`Liczba testów: ${results.length}`);
  console.log(`Zaliczone: ${results.filter(r => r.passed).length}`);
  console.log(`Niezaliczone: ${results.filter(r => !r.passed).length}`);
  console.log(`STATUS KOŃCOWY: ${allPassed ? "PASS" : "FAIL"}`);
  console.log("=================================================================");
}

runSmokeTests().catch(console.error);
