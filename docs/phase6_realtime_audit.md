# AUDYT I PROJEKT ARCHITEKTURY REALTIME (PHASE 6.0)
## Projekt: Bojar Manager System (BMS) / VS Bojar Logistic
## Data: 2026-09-21

---

## 1. WSTĘP I CELE AUDYTU

Celem audytu PHASE 6.0 jest zbadanie obecnych mechanizmów aktualizacji danych w BMS (mapa kierowców, statusy, czat, obecność), identyfikacja wąskich gardeł związanych z pollingiem oraz zaprojektowanie skalowalnej, odpornej na awarie i bezpiecznej architektury opartej o **Cloudflare Workers + Durable Objects + WebSockets**, bez polegania na zewnętrznych brokerach (Socket.IO, Pusher, Ably, Centrifugo, Redis).

Główna zasada architektoniczna:
- **MariaDB pozostaje Single Source of Truth.**
- Durable Object odpowiada wyłącznie za ulotny stan czasu rzeczywistego (połączenia WebSocket, obecność, routing zdarzeń delta, geolokalizacja ephemeral).
- Zero zapisów do MariaDB przy standardowych odczytach GPS kierowców.

---

## 2. AUDYT OBECNEGO STANU (AS-IS)

### 2.1. Mechanizmy aktualizacji danych
W kodzie produkcyjnym BMS nie występuje żaden mechanizm ciągłego przesyłania danych w czasie rzeczywistym (brak WebSockets, brak SSE). System korzysta z requestów HTTP:
1. **Mapa floty (`/dashboard/map`):**
   - Komponent wykonuje pojedyncze zapytanie `GET /api/map` podczas montowania strony (`useEffect(..., [])`).
   - Brak automatycznego odświeżania na froncie. Dane na mapie są statyczne do momentu ręcznego przeładowania strony (F5).
   - Wcześniejsze próby wprowadzenia pollingu skutkowały natychmiastowym Cloudflare Error 1102 (Worker Exceeded Resource Limits) z powodu 50 równoczesnych subrequestów Base64 awatarów.
2. **Czat firmowy (`/dashboard/chat`):**
   - Klient odpytuje serwer w pętli `setInterval` co 8 sekund (`GET /api/chat?after=${lastId}`).
3. **Status obecności (Heartbeat):**
   - Komponent `DashboardClientLayout.js` wykonuje co 60 sekund `PUT /api/user/heartbeat`, wykonując zapytanie `UPDATE User SET lastOnline = NOW() WHERE id = ?`.
4. **Weryfikacja nowych kont (Pending Approval):**
   - Użytkownicy oczekujący na zatwierdzenie odpytują `update()` sesji NextAuth co 5 sekund.

### 2.2. Źródło danych geolokalizacyjnych
- **Baza danych MariaDB:** Tabela `Truck` posiada pole `location VARCHAR(191)` (nazwa miasta), tabela `Job` posiada pola `startCity` i `endCity`. W bazie **NIE MA** współrzędnych geograficznych (`latitude`, `longitude`).
- **Webhook TrucksBook (`POST /api/webhooks/trucksbook`):**
  - Wywoływany przez system TrucksBook po zakończeniu i zaakceptowaniu trasy w Euro Truck Simulator 2 / American Truck Simulator.
  - Webhook aktualizuje `Truck.location = endCity`, `Truck.mileage`, `User.totalDrivenKm` oraz tworzy rekord trasy `Job`.
- **Wyznaczanie współrzędnych (`/api/map/route.js`):**
  - Współrzędne są generowane ad-hoc na podstawie nazwy miasta (`lastCity`) przy użyciu statycznego słownika `CITY_COORDS` (ok. 30 miast w Europie) lub algorytmu haszującego jako fallback dla pozostałych miast.

### 2.3. Koszt pojedynczego wywołania `/api/map`
- **Liczba zapytań SQL:** 4 zapytania (User, Job aggregated latest, Truck, Trailer).
- **Czas wykonania:** ~60–120 ms (w zależności od latencji TCP do MariaDB w OVH).
- **Rozmiar payloadu:** ~7.2 KB (zoptymalizowany w Phase 2, zredukowany z pierwotnych 7.5 MB).

---

## 3. PROJEKT ARCHITEKTURY REALTIME (TO-BE)

```
[ Przeglądarka / Kierowca / Telemetria ]
                   │
                   │ (WSS Handshake: /api/ws)
                   ▼
       [ Cloudflare Worker (worker.js) ]
                   │
                   │ (Routing do Durable Object)
                   ▼
    [ Durable Object: RealtimeHub (bms-global) ]
        ├── WebSocket Hibernation API (zero-CPU idle)
        ├── In-Memory State:
        │     ├── activeSockets (Tagi: role, userId, companyId)
        │     └── latestPositions (Map<driverId, Delta>)
        ├── Rate Limiter & Sanity Checks
        └── Channel Broadcasting ("map", "chat", "notifications")
                   │
                   │ (Tylko zdarzenia biznesowe / okresowy batch flush)
                   ▼
          [ MariaDB (Source of Truth) ]
```

### 3.1. Dlaczego Cloudflare Durable Objects?
1. **WebSocket Hibernation API:**
   - Gdy połączenie WebSocket nie przesyła danych, Cloudflare hibernuje instancję w pamięci.
   - Koszt CPU i pamięci w trakcie bezczynności wynosi **ZERO**.
   - Eliminuje to w 100% ryzyko błędu Cloudflare Error 1102, który występował przy utrzymywaniu aktywnych pętli w Workerze.
2. **Globalny stan i spójność (Singleton `bms-global`):**
   - Jeden globalny Durable Object (`env.REALTIME_HUB.idFromName("bms-global")`) zbiera połączenia od wszystkich dyspozytorów i kierowców.
   - Zapewnia natychmiastowy broadcast bez potrzeby używania zewnętrznych brokerów (Redis PUB/SUB, Centrifugo, Pusher).
3. **Brak zależności od zewnętrznych usług:**
   - Całość działa wewnątrz infrastruktury Cloudflare (brak opóźnień sieciowych, brak dodatkowych kosztów subskrypcyjnych).

---

## 4. PROTOKÓŁ KOMUNIKACJI (BMS REALTIME PROTOCOL - BRP v1)

Wszystkie ramki przesyłane są w formacie JSON z limitem wielkości 512 bajtów.

### 4.1. Serwer -> Klient (Deltas & Broadcasts)

1. **Aktualizacja pozycji kierowcy:**
   ```json
   {
     "type": "driver.location.updated",
     "driverId": "cuid_123",
     "lat": 52.2297,
     "lng": 21.0122,
     "speed": 78,
     "heading": 120,
     "city": "Warszawa",
     "ts": 1779451234
   }
   ```
   *Rozmiar:* ~120 bajtów (zamiast pobierania całego obiektu 190 B lub pełnej bazy floty).

2. **Zmiana statusu kierowcy:**
   ```json
   {
     "type": "driver.status.changed",
     "driverId": "cuid_123",
     "status": "DRIVING", // IDLE, DRIVING, RESTING, OFFLINE
     "ts": 1779451234
   }
   ```

3. **Status obecności:**
   ```json
   {
     "type": "driver.presence",
     "driverId": "cuid_123",
     "isOnline": true,
     "ts": 1779451234
   }
   ```

4. **Nowa wiadomość na czacie (wsparcie przyszłe):**
   ```json
   {
     "type": "chat.message.new",
     "message": {
       "id": "msg_cuid",
       "senderId": "cuid_123",
       "message": "Trasa ukończona.",
       "createdAt": "2026-09-21T18:00:00.000Z"
     }
   }
   ```

5. **Błąd / Odrzucenie ramki:**
   ```json
   {
     "type": "system.error",
     "code": "RATE_LIMITED",
     "message": "Zbyt częste aktualizacje pozycji. Dozwolony odstęp: min. 3s."
   }
   ```

### 4.2. Klient -> Serwer (Upstream Events)

1. **Subskrypcja kanału:**
   ```json
   {
     "action": "subscribe",
     "channel": "map" // "map" | "chat"
   }
   ```

2. **Raportowanie pozycji (przez kierowcę / telemetrię):**
   ```json
   {
     "action": "report_location",
     "lat": 52.2297,
     "lng": 21.0122,
     "speed": 78,
     "heading": 120,
     "city": "Warszawa",
     "ts": 1779451234
   }
   ```
   *Uwaga:* Klient NIE przesyła `driverId`. Identyfikator kierowcy jest bezpiecznie przypisywany przez serwer na podstawie zweryfikowanego tokenu sesji!

3. **Ping (Keepalive):**
   ```json
   { "action": "ping" }
   ```
   *Odpowiedź serwera:* `{ "type": "pong" }`.

---

## 5. MODEL UWIERZYTELNIANIA I AUTORYZACJI (ZERO TRUST)

### 5.1. Weryfikacja Handshake WebSocket
- Przeglądarka wysyła żądanie `GET /api/ws` z nagłówkiem `Upgrade: websocket`.
- Żądanie zawiera ciasteczka sesyjne NextAuth (`next-auth.session-token` lub `__Secure-next-auth.session-token`).
- Worker / Durable Object odczytuje ciasteczko i weryfikuje podpis kryptograficzny tokenu JWT za pomocą natywnego Web Crypto API (`crypto.subtle`) i `NEXTAUTH_SECRET`:
  - **Zero zapytań do MariaDB przy weryfikacji tokenu!**
  - Czas weryfikacji: < 1 ms.
- Zdekodowany payload zawiera: `id`, `role`, `driverStatus`, `companyId`.
- Jeśli token jest nieprawidłowy, wygasł lub użytkownik posiada status `WAITING_FOR_APPROVAL` / `SUSPENDED` / `INACTIVE`:
  - Żądanie zostaje natychmiast odrzucone kodem `401 Unauthorized` lub `403 Forbidden` bez nawiązywania połączenia WebSocket.

### 5.2. Podział ról (RBAC):
1. **DRIVER (Kierowca):**
   - Może subskrybować kanał `map`.
   - Może wysyłać raporty pozycji (`report_location`) **wyłącznie dla siebie** (`session.id`).
   - Próba przesłania raportu dla innego kierowcy jest niemożliwa ze względu na pominięcie `driverId` po stronie klienta.
2. **DISPATCHER (Dyspozytor) & BOARD (Zarząd) & OWNER (Właściciel):**
   - Pełny dostęp do kanału `map` (nasłuch wszystkich kierowców).
   - Uprawnienia do zarządzania statusami kierowców.

---

## 6. FLOOD PROTECTION & BACKPRESSURE

Aby zapobiec przeciążeniu Durable Object lub zablokowaniu przepustowości przez złośliwego lub błędnie skonfigurowanego klienta (np. pętla 1000 requestów/sekundę):

1. **Rate Limiting na poziomie gniazda:**
   - Minimalny odstęp pomiędzy raportami pozycji od danego kierowcy: **3000 ms (3 sekundy)**.
   - Pakiety przychodzące częściej niż co 3 sekundy są natychmiast ignorowane (drop) bez angażowania logiki broadcastu.
2. **Limit rozmiaru pakietu:**
   - Maksymalny dopuszczalny rozmiar ramki: **512 bajtów**.
   - Przekroczenie limitu skutkuje natychmiastowym zamknięciem socketu kodem `1009 Message Too Big`.
3. **Sanity Check współrzędnych i parametrów:**
   - Szerokość geograficzna `lat`: liczba rzeczywista z przedziału `[30.0, 72.0]` (obszar mapy Europy).
   - Długość geograficzna `lng`: liczba rzeczywista z przedziału `[-25.0, 45.0]`.
   - Wartości `NaN`, `Infinity`, `null` lub stringi powodują odrzucenie ramki.
   - Prędkość `speed`: `0 <= speed <= 250` km/h.
4. **Weryfikacja stempla czasowego (Timestamp):**
   - Różnica czasu `|serverTime - clientTs| <= 30 sekund`. Odrzuca pakiety zniekształcone, powtórzone (replay) lub ze znacznym dryfem zegara.
5. **Separacja od MariaDB:**
   - Żaden pakiet aktualizacji pozycji GPS **nie wykonuje zapytania do bazy danych MariaDB**. Pozycje żyją wyłącznie w pamięci operacyjnej Durable Object.

---

## 7. STRATEGIA RECONNECT I HEARTBEAT

1. **Heartbeat:**
   - Klient wysyła aplikacyjny ping `{ "action": "ping" }` co 30 sekund.
   - Durable Object odpowiada `{ "type": "pong" }`.
   - Brak odpowiedzi w ciągu 60 sekund oznacza zerwanie łącza i przejście w tryb ponownego łączenia.
2. **Exponential Backoff z Jitterem:**
   - Przy rozłączeniu gniazda klient podejmuje próby ponownego połączenia według schematu:
     - Próba 1: 1s (+/- 200 ms losowego jittera)
     - Próba 2: 2s (+/- 400 ms)
     - Próba 3: 4s (+/- 800 ms)
     - Próba 4: 8s
     - Maksymalny interwał: 30s.
   - Jitter zapobiega zjawisku *Thundering Herd* (jednoczesne szturmowanie serwera przez setki klientów po restarcie noda).

---

## 8. STRATEGIA FALLBACK (ODPORNOŚĆ NA AWARIE)

Nadrzędna zasada: **System BMS musi działać nawet w przypadku całkowitej awarii WebSockets.**

1. **Faza 1 (Mount):**
   - Przeglądarka ładuje widok `/dashboard/map`.
   - Wykonywane jest początkowe zapytanie `GET /api/map`, aby pobrać bazowe dane kierowców (imiona, ciągniki, naczepy, ostatnie znane pozycje).
2. **Faza 2 (Próba nawiązania WebSocket):**
   - Klient próbuje nawiązać połączenie `wss://system.vsbojarlogistic.pl/api/ws`.
   - Jeśli połączenie powiedzie się:
     - Wskaźnik statusu w UI przyjmuje stan `🟢 LIVE REALTIME`.
     - Wszelki polling HTTP zostaje całkowicie wyłączony.
3. **Faza 3 (Fallback przy braku WebSocket):**
   - Jeśli WebSocket nie połączy się w ciągu 5 sekund lub zostanie trwale rozłączony (np. restrykcyjny firewall korporacyjny blokujący WebSockets):
     - Wskaźnik w UI zmienia się na `🟡 POLLING FALLBACK`.
     - Klient uruchamia łagodne odpytywanie `GET /api/map` co 30–45 sekund (wyłącznie wtedy, gdy karta jest aktywna `document.visibilityState === 'visible'`).
     - Po ponownym nawiązaniu WebSocketu polling HTTP zostaje natychmiast dezaktywowany.

---

## 9. MODEL RUCHU I METRYKI (BEFORE VS AFTER)

Modelowanie ruchu dla scenariuszy: **10, 50, 100 oraz 250 aktywnych użytkowników / kierowców na mapie**:

### Założenia:
- **Wariant Polling:** Odpytywanie `/api/map` co 10 sekund (6 zapytań/min/użytkownik). Każde zapytanie wykonuje 4 zapytania SQL do MariaDB i przesyła ~7.2 KB JSON.
- **Wariant WebSocket + DO:** Połączenie jednorazowe. Przesyłanie aktualizacji tylko w razie zdarzenia (założono średnio 1 zmianę pozycji na 10 sekund na kierowcę = 6 delt/min po ~120 bajtów). Zero zapytań SQL do MariaDB.

### Tabela porównawcza:

| Liczba aktywnych użytkowników | Wariant | HTTP Requesty / min | Całkowity transfer / min | MariaDB SQL Queries / min | Połączenia TCP do MariaDB / min | Ryzyko Error 1102 |
|---|---|---|---|---|---|---|
| **10 użytkowników** | **Polling (co 10s)** | 60 req/min | 432 KB/min | 240 zapytań/min | 60 połączeń/min | Średnie |
| | **WebSocket + DO** | **0 req/min** | ~72 KB/min | **0 zapytań/min** | **0 połączeń/min** | **0% (Brak)** |
| **50 użytkowników** | **Polling (co 10s)** | 300 req/min | 2.16 MB/min | 1,200 zapytań/min | 300 połączeń/min | **Wysokie** (nasycenie poola TCP) |
| | **WebSocket + DO** | **0 req/min** | ~360 KB/min | **0 zapytań/min** | **0 połączeń/min** | **0% (Brak)** |
| **100 użytkowników** | **Polling (co 10s)** | 600 req/min | 4.32 MB/min | 2,400 zapytań/min | 600 połączeń/min | **Krytyczne (Error 1102 pewny)** |
| | **WebSocket + DO** | **0 req/min** | ~720 KB/min | **0 zapytań/min** | **0 połączeń/min** | **0% (Brak)** |
| **250 użytkowników** | **Polling (co 10s)** | 1,500 req/min | 10.8 MB/min | 6,000 zapytań/min | 1,500 połączeń/min | **Paraliż MariaDB / Blokada IP** |
| | **WebSocket + DO** | **0 req/min** | ~1.8 MB/min | **0 zapytań/min** | **0 połączeń/min** | **0% (Brak)** |

---

## 10. LISTA PLIKÓW WYMAGAJĄCYCH ZMIAN W PHASE 6.1

Wdrożenie architektury realtime (w kolejnym kroku, po zatwierdzeniu raportu) obejmie:

1. `wrangler.jsonc` — dodanie powiązania Durable Object (`REALTIME_HUB`) i definicji migracji klasowej.
2. `worker.js` — eksport klasy `RealtimeHub` w punkcie wejściowym Workera oraz obsługa przekierowania ścieżki `/api/ws` do Durable Object.
3. `lib/realtime/RealtimeHub.js` [NOWY PLIK] — implementacja Durable Object z wykorzystaniem WebSocket Hibernation API, uwierzytelnianiem JWT, tagowaniem socketów i flood protection.
4. `lib/realtime/client.js` [NOWY PLIK] — przeglądarkowy klient WebSocket z obsługą automatycznego reconnectu, keepalive ping/pong i subskrypcji zdarzeń.
5. `app/hooks/useRealtimeMap.js` [NOWY PLIK] — hook Reactowy synchronizujący stan kierowców na mapie pomiędzy baseline API a deltowymi zdarzeniami WebSocket z automatycznym przełączaniem w tryb fallback pollingu.
6. `app/dashboard/map/page.js` — wpięcie hooka `useRealtimeMap` oraz dodanie wizualnego indykatora statusu połączenia na żywo.
7. `app/components/MapComponent.js` — zoptymalizowanie aktualizacji współrzędnych markerów Leaflet, aby uniknąć ponownego renderowania całej mapy przy każdej zmianie pozycji.
