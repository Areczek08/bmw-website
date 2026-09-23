# ETAP 0: RAPORT AUDYTU PRZED ZMIANAMI (BASELINE REPORT)
**Data audytu:** 21 września 2026 r.
**Projekt:** Bojar Manager System (BMS) na Cloudflare Workers

---

## 1. Wykonane kopie zapasowe (Backup & Snapshots)
- **Git Branch:** `backup-pre-refactor-phase0`
- **Git Tag:** `v-pre-refactor-phase0`
- **Pliki konfiguracyjne:** `backups/phase0/wrangler.jsonc`, `open-next.config.ts`, `next.config.mjs`, `worker.js`, `prisma/schema.prisma`
- **Snapshot schematu bazy MariaDB:** `backups/phase0/schema_snapshot.sql` (pełny zrzut DDL wszystkich 29 tabel, 22.5 KB)
- **Stan wyjściowy kompilacji:** `npm run build` (Next.js) oraz `npx @opennextjs/cloudflare build` (OpenNext) wykonują się z kodem wyjścia 0.

---

## 2. Architektura i Konfiguracja Środowiska Cloudflare
- **Wrangler / Runtime:** `wrangler` v3.114.0, runtime Cloudflare Workers z `nodejs_compat`.
- **OpenNext:** `@opennextjs/cloudflare` v1.20.6.
- **Klient DB:** `mariadb` v3.5.4 (używany bezpośrednio w `lib/db.js`). Brak `mysql2` w `package.json`.
- **Cloudflare Hyperdrive:** Sprawdzono przez `npx wrangler hyperdrive list` – brak skonfigurowanych instancji Hyperdrive w koncie Cloudflare.
- **Cloudflare R2:** Brak powiązań `r2_buckets` w obecnym `wrangler.jsonc`.
- **Durable Objects:** Brak powiązań `durable_objects` w obecnym `wrangler.jsonc`.
- **Zewnętrzna MariaDB:** Host `54.38.50.59:3306`, baza `www13461_bojarsystemweb` (29 tabel).

---

## 3. Zidentyfikowane ciężkie kolumny (LONGTEXT / Base64)

Zbadano schemat bazy i odnaleziono 7 kolumn typu `LONGTEXT`:
1. `User.image` (`longtext`) – przechowuje awatary w formacie surowego Base64 Data URL.
   - **Zmierzony rozmiar:** Dla zaledwie 10 kierowców z awatarami kolumna ta zajmuje **7.5 MB**!
   - Każde wywołanie `SELECT *` lub `SELECT image FROM User` przetłacza te 7.5 MB przez socket do pamięci Workera.
2. `ChatMessage.imageUrl` (`longtext`) – zdjęcia czatu zapisane jako surowy Base64.
3. `ChatMessage.audioUrl` (`longtext`) – nagrania głosowe zapisane jako surowy Base64.
   - **Zmierzony rozmiar:** Dla zaledwie 20 wiadomości w tabeli `ChatMessage` (z czego 6 ma załącznik), pojedyncze zapytanie `SELECT m.*` zwraca **7.7 MB JSON**!
4. `Job.summaryScreenshot` (`longtext`) – zrzuty ekranu podsumowania trasy w Base64.
5. `Job.truckScreenshot` (`longtext`) – zrzuty pojazdu w Base64.
6. `BugReport.imageUrl` (`longtext`) – zrzuty błędów w Base64.
7. `User.badges` (`longtext`) – JSON z odznakami.

---

## 4. Szczegółowa analiza krytycznych endpointów i metryki Baseline

| Endpoint | Zapytania SQL | Używane tabele | Potencjalne N+1 / Pętle | Ciężkie kolumny | Subrequesty HTTP / Sockets TCP | Baseline Response Size | Czas DB (baseline) |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| **`/api/map`** | 3–4 zapytania (każde otwiera nowy socket TCP) | `User`, `Job`, `Truck`, `Trailer` | ❌ Brak N+1 SQL, ale: pobiera **całą historię** tabeli `Job` (231 wierszy) i filtruje w JS. | `User.image` (**7.5 MB** Base64) | 4 połączenia TCP do MariaDB + **50–100 równoległych zapytań HTTP** do `/api/user/[id]/avatar` wyzwalanych przez Leaflet | **~7.5 MB** (z awatarami) | ~224 ms |
| **`/api/user/[id]/avatar`** | 1 zapytanie per awatar | `User` | ⚠️ Wywoływane 50–100x równolegle przez przeglądarkę po wejściu na mapę! | `User.image` (do 2 MB per user) | 1 połączenie TCP per żądanie (50–100 równoległych socketów do MariaDB) | do 2 MB per żądanie | ~30–80 ms per żądanie |
| **`/api/chat`** | 2–3 zapytania | `ChatMessage`, `User`, `ChatMessageReaction` | ❌ Brak N+1 | `ChatMessage.imageUrl`, `audioUrl` | 2–3 połączenia TCP do MariaDB | **7.7 MB** per żądanie (dla 20 wiadomości!) | ~132 ms |
| **`/api/finance`** | 3 zapytania sekwencyjne | `Job`, `User`, `Company` | ❌ Brak N+1 | Brak | 3 połączenia TCP + 1 zewnętrzny `fetch()` do NBP API | ~3.5 KB | ~35 ms + czas NBP |
| **`/api/finance/settle`** | 8–15 zapytań sekwencyjnych | `Job`, `User`, `Company`, `CompanyTransaction`, `MonthlySettlement` | ⚠️ Wykonuje ciąg 8–12 pojedynczych `dbRun` / `dbOne`, otwierając i zamykając TCP 8–12 razy! | Brak | 8–15 połączeń TCP + 1 zewnętrzny `fetch()` do NBP | ~1.5 KB | ~120–250 ms |
| **`/api/public/flota`** | 3 zapytania | `Truck`, `User`, `Trailer` | ❌ Brak N+1 (używa `IN (...)`) | `imageUrl` (zewnętrzne linki ImgBB) | 3 połączenia TCP do MariaDB | ~18 KB | ~25 ms |
| **`/api/drivers`** | 3 zapytania | `User`, `Truck`, `Trailer`, `Job` | ❌ Brak N+1 (agregacja `Job` per miesiąc) | `User.image` | 3 połączenia TCP do MariaDB | ~25 KB | ~85 ms |
| **`/api/webhooks/trucksbook`** | 4–8 zapytań | `User`, `Truck`, `Trailer`, `Job`, `ServiceInvoice`, `VehicleHistory` | ⚠️ Pętla `for (const nameToTry of searchNames) await dbOne(...)` (do 4 zapytań w pętli) | `Job.summaryScreenshot` | 5–9 połączeń TCP + 1 `fetch()` do Discorda | ~200 B | ~90–180 ms |

---

## 5. Miejsca wykonujące Polling i pętle w Frontendzie

1. **`app/dashboard/chat/page.js`**:
   - `setInterval(() => fetchMessages(false), 8000)` – co 8 sekund pobiera `/api/chat?after=...`. Ponieważ `ChatMessage` zawierało pełne kolumny `LONGTEXT`, każde zapytanie zrzucało do pamięci Workera wielomegabajtowe dane.
   - `setInterval(pingHeartbeat, 60000)` – co 60 sekund wysyła heartbeat.
2. **`app/dashboard/DashboardClientLayout.js`**:
   - Dla oczekujących na zatwierdzenie: `setInterval(() => update(), 5000)` – co 5 sekund odpytuje sesję NextAuth.
   - Dla zalogowanych: `setInterval(() => fetch('/api/user/heartbeat', { method: 'PUT' }), 60000)` – co minutę uderza w endpoint heartbeatu.
3. **`MapComponent` (`app/components/MapComponent.js`)**:
   - Nie wykonuje tradycyjnego `setInterval`, ale tworzy natychmiastowe N równoległych zapytań:
     Każdy marker: `<img src="${driver.image}" />` -> co generuje 50–100 zapytań HTTP do `/api/user/[id]/avatar`.

---

## 6. Główne źródła zapytań `SELECT *`
W kodzie zidentyfikowano zapytania `SELECT *` w 34 endpointach, m.in.:
- `/api/chat/route.js`: `SELECT m.*` (pobiera potężne kolumny Base64).
- `/api/admin/approvals`: `SELECT * FROM User`
- `/api/jobs/[id]/approve`: `SELECT * FROM Job WHERE id = ?` (pobiera wielomegabajtowe zrzuty ekranu).
- `/api/finance/leasing`: `SELECT * FROM Leasing`, `SELECT * FROM Truck`, `SELECT * FROM Trailer`
- `/api/user/bank/transfer`: `SELECT * FROM User WHERE id = ?`

---

## 7. Wnioski do kolejnych faz
1. **Hyperdrive:** Ponieważ w koncie Cloudflare nie ma jeszcze utworzonego Hyperdrive, w **Fazie 1** wdrożymy wysoce wydajną warstwę `lib/db/client.js` z obsługą **sesji wielozapytaniowych (`dbSession`)**, eliminując 8–15 handshake'ów TCP na pojedyncze żądanie. Przygotujemy również wsparcie dla Hyperdrive, gdy użytkownik skonfiguruje ID w Wranglerze.
2. **Eliminacja Base64 w `SELECT`:** Usunięcie kolumny `image` z zapytań listowych `/api/map` i `/api/drivers` zmniejszy rozmiar odpowiedzi z **7.5 MB do ~15 KB** (spadek o 99.8%!).
3. **Optymalizacja czatu:** Zapytanie `/api/chat` ma pobierać tylko identyfikatory i metadane załączników zamiast surowych Base64, redukując payload z **7.7 MB do ~20 KB**.
4. **Usunięcie N+1 awatarów na mapie:** Zastąpienie bezpośrednich zapytań do bazy lekkimi znacznikami lub CDN URL.
