import { SignJWT } from "jose";
import { RealtimeHub } from "../lib/realtime/RealtimeHub.js";
import { getDbStats } from "../lib/db.js";

// Mock WebSocket class for Node.js test environment
class MockWebSocket {
  constructor() {
    this.readyState = 1; // OPEN
    this.sentMessages = [];
    this.closeCode = null;
    this.closeReason = null;
    this._attachment = null;
  }

  send(data) {
    this.sentMessages.push(data);
  }

  close(code, reason) {
    this.readyState = 3; // CLOSED
    this.closeCode = code;
    this.closeReason = reason;
  }

  serializeAttachment(data) {
    this._attachment = data;
  }

  deserializeAttachment() {
    return this._attachment;
  }
}

if (typeof globalThis.WebSocketPair === "undefined") {
  globalThis.WebSocketPair = class MockWebSocketPair {
    constructor() {
      this[0] = new MockWebSocket();
      this[1] = new MockWebSocket();
    }
  };
}

// Mock ExecutionContext for Durable Object
class MockExecutionContext {
  constructor() {
    this.acceptedSockets = [];
  }

  acceptWebSocket(ws, tags) {
    ws._tags = tags;
    this.acceptedSockets.push(ws);
  }

  getWebSockets(tag = null) {
    if (!tag) return this.acceptedSockets.filter(s => s.readyState === 1);
    return this.acceptedSockets.filter(s => s.readyState === 1 && s._tags && s._tags.includes(tag));
  }
}

async function createSignedToken(payload, secret = "VtcBMS2026_9x!2Zq$8pL#1vN@3mK_BojarSystem") {
  const secretKey = new TextEncoder().encode(secret);
  return new SignJWT(payload)
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("2h")
    .sign(secretKey);
}

async function runPhase6Verification() {
  console.log('====================================================');
  console.log('   PHASE 6 VERIFICATION — REALTIME & WEBSOCKET DO   ');
  console.log('====================================================\n');

  let passedAll = true;
  const mockEnv = {
    NEXTAUTH_SECRET: "VtcBMS2026_9x!2Zq$8pL#1vN@3mK_BojarSystem"
  };

  // ---------------------------------------------------------------
  // TEST 1: Authentication & Unauthenticated Rejection
  // ---------------------------------------------------------------
  console.log('[TEST 1] Weryfikacja uwierzytelniania WebSocket...');
  const ctx1 = new MockExecutionContext();
  const hub1 = new RealtimeHub(ctx1, mockEnv);

  // A. Unauthenticated request (no token)
  const reqUnauth = new Request("http://localhost/api/ws", {
    headers: { "Upgrade": "websocket" }
  });
  const resUnauth = await hub1.fetch(reqUnauth);
  if (resUnauth.status === 401) {
    console.log('  [OK] Niezalogowane żądanie odrzucone kodem 401 Unauthorized.');
  } else {
    console.error(`  [BŁĄD] Oczekiwano statusu 401, otrzymano: ${resUnauth.status}`);
    passedAll = false;
  }

  // B. Pending account (WAITING_FOR_APPROVAL)
  const pendingToken = await createSignedToken({
    id: "user_pending_1",
    role: "DRIVER",
    driverStatus: "WAITING_FOR_APPROVAL",
    companyId: "BMS"
  });
  const reqPending = new Request("http://localhost/api/ws", {
    headers: {
      "Upgrade": "websocket",
      "Cookie": `next-auth.session-token=${pendingToken}`
    }
  });
  const resPending = await hub1.fetch(reqPending);
  if (resPending.status === 403) {
    console.log('  [OK] Konto oczekujące (WAITING_FOR_APPROVAL) odrzucone kodem 403 Forbidden.');
  } else {
    console.error(`  [BŁĄD] Oczekiwano statusu 403 dla konta pending, otrzymano: ${resPending.status}`);
    passedAll = false;
  }

  // C. Valid driver token
  const validDriverToken = await createSignedToken({
    id: "driver_pawel_1",
    name: "Paweł Bojar",
    role: "DRIVER",
    driverStatus: "ACTIVE",
    companyId: "BMS"
  });
  const reqValid = new Request("http://localhost/api/ws", {
    headers: {
      "Upgrade": "websocket",
      "Cookie": `next-auth.session-token=${validDriverToken}`
    }
  });
  const resValid = await hub1.fetch(reqValid);
  if (resValid.status === 101) {
    console.log('  [OK] Prawidłowy kierowca pomyślnie zautoryzowany kodem 101 Switching Protocols!');
  } else {
    console.error(`  [BŁĄD] Oczekiwano statusu 101, otrzymano: ${resValid.status}`);
    passedAll = false;
  }

  // ---------------------------------------------------------------
  // TEST 2: Security & Identity Spoofing Protection (Zero Trust)
  // ---------------------------------------------------------------
  console.log('\n[TEST 2] Test zabezpieczenia tożsamości (Kierowca A vs Kierowca B)...');
  const wsDriverA = new MockWebSocket();
  wsDriverA.serializeAttachment({
    userId: "driver_A_legit",
    role: "DRIVER",
    companyId: "BMS"
  });
  ctx1.acceptWebSocket(wsDriverA, ["user:driver_A_legit", "role:DRIVER", "map"]);

  // Kierowca A próbuje podrobić pozycję i wysyła payload z driverId: "driver_B_victim"
  const maliciousPayload = {
    action: "report_location",
    driverId: "driver_B_victim", // Próba podszycia się
    lat: 52.2297,
    lng: 21.0122,
    speed: 80,
    heading: 90,
    city: "Warszawa",
    ts: Math.floor(Date.now() / 1000)
  };

  // Podglądacz na kanale map
  const wsDispatcher = new MockWebSocket();
  wsDispatcher.serializeAttachment({ userId: "dispatcher_1", role: "DISPATCHER", companyId: "BMS" });
  ctx1.acceptWebSocket(wsDispatcher, ["role:DISPATCHER", "map"]);

  await hub1.webSocketMessage(wsDriverA, JSON.stringify(maliciousPayload));

  // Sprawdzamy co odebrał dyspozytor
  const lastBroadcast = wsDispatcher.sentMessages[wsDispatcher.sentMessages.length - 1];
  const parsedBroadcast = lastBroadcast ? JSON.parse(lastBroadcast) : null;

  if (parsedBroadcast && parsedBroadcast.driverId === "driver_A_legit") {
    console.log('  [OK] Serwer wymusił tożsamość "driver_A_legit" z sesji!');
    console.log('  [OK] Próba podszycia się pod "driver_B_victim" została całkowicie udaremniona!');
  } else {
    console.error('  [BŁĄD] Serwer pozwolił na podrobienie driverId:', parsedBroadcast);
    passedAll = false;
  }

  // ---------------------------------------------------------------
  // TEST 3: Flood Protection & Rate Limiting (100 pakietów w krótkim czasie)
  // ---------------------------------------------------------------
  console.log('\n[TEST 3] Test Flood Protection / Rate Limiting: 100 szybkich aktualizacji...');
  const wsFloodDriver = new MockWebSocket();
  wsFloodDriver.serializeAttachment({ userId: "driver_fast_clicker", role: "DRIVER", companyId: "BMS" });
  ctx1.acceptWebSocket(wsFloodDriver, ["user:driver_fast_clicker", "role:DRIVER", "map"]);

  const initialBroadcastCount = wsDispatcher.sentMessages.length;

  for (let i = 0; i < 100; i++) {
    const floodPacket = {
      action: "report_location",
      lat: 52.2300 + (i * 0.0001),
      lng: 21.0100 + (i * 0.0001),
      speed: 85,
      heading: 90,
      city: "Warszawa",
      ts: Math.floor(Date.now() / 1000)
    };
    await hub1.webSocketMessage(wsFloodDriver, JSON.stringify(floodPacket));
  }

  const broadcastsAfterFlood = wsDispatcher.sentMessages.length - initialBroadcastCount;
  console.log(`  Wysłano pakietów: 100 | Zaakceptowano i rozgłoszono: ${broadcastsAfterFlood}`);

  if (broadcastsAfterFlood === 1) {
    console.log('  [OK] Dokładnie 1 pakiet przeszedł, a 99 nadmiarowych zostało natychmiast upuszczonych (rate limit 3s)!');
  } else {
    console.error(`  [BŁĄD] Rate limiter przepuścił ${broadcastsAfterFlood} pakietów zamiast 1!`);
    passedAll = false;
  }

  // ---------------------------------------------------------------
  // TEST 4: Frame Size Limit (>512 B)
  // ---------------------------------------------------------------
  console.log('\n[TEST 4] Test limitu wielkości ramki WebSocket (> 512 bajtów)...');
  const wsLargeFrame = new MockWebSocket();
  wsLargeFrame.serializeAttachment({ userId: "driver_heavy", role: "DRIVER", companyId: "BMS" });
  ctx1.acceptWebSocket(wsLargeFrame, ["user:driver_heavy", "role:DRIVER", "map"]);

  const oversizedPayload = JSON.stringify({
    action: "report_location",
    lat: 52.2297,
    lng: 21.0122,
    junkData: "A".repeat(600) // 600+ bajtów
  });

  await hub1.webSocketMessage(wsLargeFrame, oversizedPayload);

  if (wsLargeFrame.closeCode === 1009) {
    console.log(`  [OK] Socket został natychmiast zamknięty kodem 1009 (Message Too Big): "${wsLargeFrame.closeReason}"!`);
  } else {
    console.error(`  [BŁĄD] Oczekiwano zamknięcia socketu kodem 1009, otrzymano: ${wsLargeFrame.closeCode}`);
    passedAll = false;
  }

  // ---------------------------------------------------------------
  // TEST 5: Coordinate Sanity Check (Odrzucanie nieprawidłowych danych)
  // ---------------------------------------------------------------
  console.log('\n[TEST 5] Test Sanity Check dla współrzędnych geograficznych...');
  const wsSanityDriver = new MockWebSocket();
  wsSanityDriver.serializeAttachment({ userId: "driver_sanity", role: "DRIVER", companyId: "BMS" });
  ctx1.acceptWebSocket(wsSanityDriver, ["user:driver_sanity", "role:DRIVER", "map"]);

  const countBefore = wsDispatcher.sentMessages.length;

  // Próba wysłania nieprawidłowego latitude (lat: 9999)
  await hub1.webSocketMessage(wsSanityDriver, JSON.stringify({
    action: "report_location",
    lat: 9999.0, // NIEREALNE
    lng: 21.0122,
    speed: 50,
    ts: Math.floor(Date.now() / 1000)
  }));

  // Próba wysłania NaN
  await hub1.webSocketMessage(wsSanityDriver, JSON.stringify({
    action: "report_location",
    lat: "NaN",
    lng: 21.0122,
    speed: 50,
    ts: Math.floor(Date.now() / 1000)
  }));

  const countAfter = wsDispatcher.sentMessages.length;
  if (countBefore === countAfter) {
    console.log('  [OK] Wszystkie nieprawidłowe współrzędne (lat=9999, lat=NaN) zostały odrzucone bez rozgłaszania!');
  } else {
    console.error('  [BŁĄD] Serwer rozgłosił nieprawidłowe współrzędne!');
    passedAll = false;
  }

  // ---------------------------------------------------------------
  // TEST 6: Heartbeat Keepalive (Ping / Pong)
  // ---------------------------------------------------------------
  console.log('\n[TEST 6] Test Heartbeat (Ping -> Pong)...');
  const wsPingClient = new MockWebSocket();
  wsPingClient.serializeAttachment({ userId: "user_ping", role: "DRIVER", companyId: "BMS" });
  ctx1.acceptWebSocket(wsPingClient, ["user:user_ping", "role:DRIVER", "map"]);

  await hub1.webSocketMessage(wsPingClient, JSON.stringify({ action: "ping" }));
  const lastPingReply = wsPingClient.sentMessages[wsPingClient.sentMessages.length - 1];
  const parsedPingReply = lastPingReply ? JSON.parse(lastPingReply) : null;

  if (parsedPingReply && parsedPingReply.type === "pong" && parsedPingReply.ts) {
    console.log(`  [OK] Serwer natychmiast odpowiedział ramką pong z timestampem: ${parsedPingReply.ts}!`);
  } else {
    console.error('  [BŁĄD] Brak poprawnej odpowiedzi pong:', lastPingReply);
    passedAll = false;
  }

  // ---------------------------------------------------------------
  // TEST 7: Zero SQL Queries to MariaDB for WebSocket Frames
  // ---------------------------------------------------------------
  console.log('\n[TEST 7] Potwierdzenie ZERO zapytań SQL do MariaDB przy obsłudze WebSocket...');
  const dbStatsBefore = getDbStats();

  const wsCleanDriver = new MockWebSocket();
  wsCleanDriver.serializeAttachment({ userId: "driver_clean_db", role: "DRIVER", companyId: "BMS" });
  ctx1.acceptWebSocket(wsCleanDriver, ["user:driver_clean_db", "role:DRIVER", "map"]);

  // Wyślij poprawny meldunek pozycji
  await hub1.webSocketMessage(wsCleanDriver, JSON.stringify({
    action: "report_location",
    lat: 54.3520,
    lng: 18.6466,
    speed: 70,
    heading: 180,
    city: "Gdańsk",
    ts: Math.floor(Date.now() / 1000)
  }));

  const dbStatsAfter = getDbStats();
  const queriesDiff = dbStatsAfter.queriesExecuted - dbStatsBefore.queriesExecuted;
  const connsDiff = dbStatsAfter.connectionsOpened - dbStatsBefore.connectionsOpened;

  console.log(`  Liczba zapytań SQL przed: ${dbStatsBefore.queriesExecuted} | Po: ${dbStatsAfter.queriesExecuted} (Delta: ${queriesDiff})`);
  console.log(`  Liczba połączeń TCP przed: ${dbStatsBefore.connectionsOpened} | Po: ${dbStatsAfter.connectionsOpened} (Delta: ${connsDiff})`);

  if (queriesDiff === 0 && connsDiff === 0) {
    console.log('  [OK] Dokładnie 0 zapytań SQL i 0 nowych połączeń TCP do MariaDB podczas obsługi pozycji GPS!');
  } else {
    console.error('  [BŁĄD] Obsługa pozycji wykonała zapytania do bazy danych!');
    passedAll = false;
  }

  // ---------------------------------------------------------------
  // PODSUMOWANIE
  // ---------------------------------------------------------------
  console.log('\n====================================================');
  if (passedAll) {
    console.log('>>> WSZYSTKIE TESTY WERYFIKACYJNE PHASE 6 ZALICZONE POMYŚLNIE <<<');
  } else {
    console.error('>>> WYKRYTO BŁĘDY W WERYFIKACJI PHASE 6 <<<');
    process.exit(1);
  }
  console.log('====================================================\n');
}

runPhase6Verification().catch(err => {
  console.error("FATAL ERROR:", err);
  process.exit(1);
});
