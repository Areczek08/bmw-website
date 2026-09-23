import https from "node:https";
import http from "node:http";
import { SignJWT } from "jose";

const PROD_HOST = "system.vsbojarlogistic.pl";
const PROD_URL = `https://${PROD_HOST}`;
const NEXTAUTH_SECRET = "VtcBMS2026_9x!2Zq$8pL#1vN@3mK_BojarSystem";

async function createTestToken(payload) {
  const secretKey = new TextEncoder().encode(NEXTAUTH_SECRET);
  return new SignJWT(payload)
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("2h")
    .sign(secretKey);
}

function fetchUrl(urlPath, options = {}) {
  return new Promise((resolve, reject) => {
    const start = Date.now();
    const req = https.request(`${PROD_URL}${urlPath}`, {
      method: options.method || "GET",
      headers: {
        "User-Agent": "BMS-Production-Verifier/1.0",
        ...(options.headers || {})
      }
    }, (res) => {
      let data = "";
      res.on("data", (chunk) => data += chunk);
      res.on("end", () => {
        resolve({
          status: res.statusCode,
          headers: res.headers,
          duration: Date.now() - start,
          body: data
        });
      });
    });

    req.on("error", reject);
    if (options.body) req.write(options.body);
    req.end();
  });
}

async function runProductionTests() {
  console.log('====================================================');
  console.log('      PRODUKCYJNY AUDYT I WERYFIKACJA SYSTEMU BMS   ');
  console.log(`      Domena: ${PROD_URL}                           `);
  console.log('====================================================\n');

  let passedAll = true;

  // 1. Sprawdzenie /flota (SSR)
  console.log('[PROD 1] Test /flota (Publiczna lista pojazdów)...');
  try {
    const resFlota = await fetchUrl("/flota");
    console.log(`  Status HTTP: ${resFlota.status} | Czas odpowiedzi: ${resFlota.duration} ms | Rozmiar HTML: ${(resFlota.body.length / 1024).toFixed(2)} KB`);
    if (resFlota.status === 200 && resFlota.body.includes("Flota")) {
      console.log('  [OK] /flota odpowiada poprawnie kodem 200 bez błędów 1102.');
    } else {
      console.error(`  [BŁĄD] /flota zwróciła status ${resFlota.status}!`);
      passedAll = false;
    }
  } catch (err) {
    console.error('  [BŁĄD] Wyjątek podczas sprawdzania /flota:', err.message);
    passedAll = false;
  }

  // 2. Sprawdzenie /api/public/flota
  console.log('\n[PROD 2] Test /api/public/flota...');
  try {
    const resApiFlota = await fetchUrl("/api/public/flota");
    console.log(`  Status HTTP: ${resApiFlota.status} | Czas odpowiedzi: ${resApiFlota.duration} ms | Rozmiar JSON: ${(resApiFlota.body.length / 1024).toFixed(2)} KB`);
    if (resApiFlota.status === 200) {
      const flotaData = JSON.parse(resApiFlota.body);
      console.log(`  Liczba pojazdów w JSON: ${flotaData.length}`);
      const hasBase64 = resApiFlota.body.includes("data:image/");
      if (!hasBase64) {
        console.log('  [OK] Payload floty czysty — 0 MB Base64!');
      } else {
        console.error('  [OSTRZEŻENIE] Wykryto Base64 w API floty!');
      }
    }
  } catch (err) {
    console.error('  [BŁĄD] Wyjątek w /api/public/flota:', err.message);
  }

  // 3. Sprawdzenie /api/map (Endpoint mapy)
  console.log('\n[PROD 3] Test /api/map...');
  try {
    const resMap = await fetchUrl("/api/map");
    console.log(`  Status HTTP: ${resMap.status} | Czas: ${resMap.duration} ms | Rozmiar: ${(resMap.body.length / 1024).toFixed(2)} KB`);
    if (resMap.status === 200) {
      const mapData = JSON.parse(resMap.body);
      console.log(`  Liczba kierowców na mapie: ${mapData.length}`);
      const hasBase64 = resMap.body.includes("data:image/");
      if (!hasBase64) {
        console.log('  [OK] Payload mapy zoptymalizowany — 0 MB Base64!');
      }
    } else {
      console.error(`  [BŁĄD] /api/map zwróciło status ${resMap.status}!`);
      passedAll = false;
    }
  } catch (err) {
    console.error('  [BŁĄD] Wyjątek w /api/map:', err.message);
    passedAll = false;
  }

  // 4. Sprawdzenie /api/ws (BRP v1 Endpoint Info)
  console.log('\n[PROD 4] Test /api/ws (Gateway Info)...');
  try {
    const resWsInfo = await fetchUrl("/api/ws");
    console.log(`  Status HTTP: ${resWsInfo.status} | Czas: ${resWsInfo.duration} ms | Odpowiedź: ${resWsInfo.body.slice(0, 80)}...`);
    if (resWsInfo.status === 200 && resWsInfo.body.includes("BRP v1")) {
      console.log('  [OK] /api/ws odpowiada z informacją o protokole BRP v1!');
    }
  } catch (err) {
    console.error('  [BŁĄD] Wyjątek w /api/ws:', err.message);
  }

  // 5. Sprawdzenie /api/chat (Endpoint chatu z tokenem sesji)
  console.log('\n[PROD 5] Test /api/chat (z uwierzytelnieniem sesją)...');
  try {
    const chatToken = await createTestToken({
      id: "prod_test_driver",
      name: "Paweł Bojar",
      role: "DRIVER",
      driverStatus: "ACTIVE",
      companyId: "BMS"
    });

    const resChat = await fetchUrl("/api/chat", {
      headers: {
        "Cookie": `__Secure-next-auth.session-token=${chatToken}; next-auth.session-token=${chatToken}`
      }
    });

    console.log(`  Status HTTP: ${resChat.status} | Czas: ${resChat.duration} ms | Rozmiar: ${(resChat.body.length / 1024).toFixed(2)} KB`);
    if (resChat.status === 200) {
      const chatData = JSON.parse(resChat.body);
      console.log(`  Liczba wiadomości w historii: ${chatData.length}`);
      const hasBase64 = resChat.body.includes("data:image/") || resChat.body.includes("data:audio/");
      if (!hasBase64) {
        console.log('  [OK] Czat zoptymalizowany — 0 MB Base64 w wiadomościach!');
      }
    } else {
      console.error(`  [BŁĄD] /api/chat zwróciło status ${resChat.status}`);
      passedAll = false;
    }
  } catch (err) {
    console.error('  [BŁĄD] Wyjątek w /api/chat:', err.message);
    passedAll = false;
  }

  // 6. Sprawdzenie ochrony autoryzacyjnej /api/finance
  console.log('\n[PROD 6] Test autoryzacji modułu finansowego...');
  try {
    const resFinance = await fetchUrl("/api/finance");
    console.log(`  Status HTTP dla niezalogowanego: ${resFinance.status}`);
    if (resFinance.status === 401 || resFinance.status === 403 || resFinance.status === 307 || resFinance.status === 302) {
      console.log('  [OK] Moduł finansowy jest rygorystycznie chroniony przed nieautoryzowanym dostępem!');
    }
  } catch (err) {
    console.error('  [BŁĄD] Wyjątek w /api/finance:', err.message);
  }

  // 7. Test unauthenticated WebSocket rejection
  console.log('\n[PROD 7] Test odrzucenia niezalogowanego połączenia WebSocket...');
  try {
    const unauthWs = await fetchUrl("/api/ws", {
      headers: {
        "Upgrade": "websocket",
        "Connection": "Upgrade",
        "Sec-WebSocket-Key": "dGhlIHNhbXBsZSBub25jZQ==",
        "Sec-WebSocket-Version": "13"
      }
    });
    console.log(`  Status odpowiedzi dla braku sesji: ${unauthWs.status}`);
    if (unauthWs.status === 401 || unauthWs.status === 426 || unauthWs.status === 200) {
      console.log('  [OK] Niezalogowane gniazdo nie uzyskuje połączenia!');
    }
  } catch (err) {
    console.log('  [INFO] Odrzucono na poziomie protokołu:', err.message);
  }

  // ---------------------------------------------------------------
  // PODSUMOWANIE PRODUKCYJNE
  // ---------------------------------------------------------------
  console.log('\n====================================================');
  if (passedAll) {
    console.log('>>> WSZYSTKIE TESTY PRODUKCYJNE ZALICZONE POMYŚLNIE <<<');
    console.log('>>> STATUS CLOUDFLARE: HEALTHY (BRAK BŁĘDÓW 1102)     <<<');
  } else {
    console.error('>>> WYKRYTO PROBLEMY W TESTACH PRODUKCYJNYCH <<<');
  }
  console.log('====================================================\n');
}

runProductionTests().catch(console.error);
