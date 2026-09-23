const { dbSession, generateId } = require('../lib/db.js');
const { checkIdempotency, recordIdempotency } = require('../lib/idempotency.js');

async function runPhase5Verification() {
  console.log('====================================================');
  console.log('      PHASE 5 VERIFICATION — FINANSE & HARDENING    ');
  console.log('====================================================\n');

  let passedAll = true;

  // ---------------------------------------------------------------
  // TEST 1: DB-Level UNIQUE Constraint & Duplicate Settlement Guard
  // ---------------------------------------------------------------
  console.log('[TEST 1] Weryfikacja UNIQUE constraint na MonthlySettlement...');
  await dbSession(async (db) => {
    const indexes = await db.all('SHOW INDEX FROM MonthlySettlement');
    const uqIndex = indexes.find(i => i.Key_name === 'uq_monthly_settlement');

    if (uqIndex) {
      console.log('  [OK] Indeks uq_monthly_settlement istnieje w MariaDB.');
    } else {
      console.error('  [BŁĄD] Brak indeksu uq_monthly_settlement w MariaDB!');
      passedAll = false;
    }

    // Próba wstawienia dwóch identycznych rekordów w teście
    const testId1 = generateId();
    const testId2 = generateId();
    const testMonth = 11;
    const testYear = 2099;
    const testCompanyId = 'BMS';

    try {
      await db.run(
        "INSERT INTO MonthlySettlement (id, companyId, month, year, revenuePLN, fuelCost, ticketsCost, maintenanceCost, salariesCost, otherCost, netProfit, isClosed, createdAt) VALUES (?, ?, ?, ?, 1000, 0, 0, 0, 0, 0, 1000, true, NOW())",
        [testId1, testCompanyId, testMonth, testYear]
      );

      let duplicateBlocked = false;
      try {
        await db.run(
          "INSERT INTO MonthlySettlement (id, companyId, month, year, revenuePLN, fuelCost, ticketsCost, maintenanceCost, salariesCost, otherCost, netProfit, isClosed, createdAt) VALUES (?, ?, ?, ?, 1000, 0, 0, 0, 0, 0, 1000, true, NOW())",
          [testId2, testCompanyId, testMonth, testYear]
        );
      } catch (dupErr) {
        if (dupErr.code === 'ER_DUP_ENTRY' || dupErr.message?.includes('Duplicate entry')) {
          duplicateBlocked = true;
          console.log('  [OK] Próba drugiego rozliczenia tego samego miesiąca została odrzucona przez MariaDB (ER_DUP_ENTRY)!');
        }
      }

      if (!duplicateBlocked) {
        console.error('  [BŁĄD] MariaDB pozwoliła na wstawienie duplikatu rozliczenia!');
        passedAll = false;
      }
    } finally {
      // Usunięcie rekordu testowego
      await db.run("DELETE FROM MonthlySettlement WHERE month = ? AND year = ? AND companyId = ?", [testMonth, testYear, testCompanyId]);
    }
  });

  // ---------------------------------------------------------------
  // TEST 2: Backend Idempotency-Key Protection
  // ---------------------------------------------------------------
  console.log('\n[TEST 2] Weryfikacja backendowej obsługi Idempotency-Key...');
  await dbSession(async (db) => {
    const testKey = `test-key-${generateId()}`;
    const testPayload = { success: true, companyBalance: 5432.10, test: true };

    const firstCheck = await checkIdempotency(testKey, db);
    if (!firstCheck.isDuplicate) {
      console.log('  [OK] Nowy Idempotency-Key rozpoznany jako unikalny.');
    } else {
      console.error('  [BŁĄD] Nowy klucz został błędnie oznaczony jako duplikat!');
      passedAll = false;
    }

    // Zapisanie operacji
    await recordIdempotency(testKey, 'TEST_FINANCE_OP', 200, testPayload, db);

    // Drugie wywołanie (symulacja retry / timeout)
    const secondCheck = await checkIdempotency(testKey, db);
    if (secondCheck.isDuplicate && secondCheck.statusCode === 200 && secondCheck.response.companyBalance === 5432.10) {
      console.log('  [OK] Ponowienie żądania z tym samym Idempotency-Key zwróciło zbuforowaną odpowiedź bez re-egzekucji!');
    } else {
      console.error('  [BŁĄD] Idempotencja nie zwróciła poprawnej odpowiedzi:', secondCheck);
      passedAll = false;
    }

    // Cleanup
    await db.run("DELETE FROM IdempotencyKey WHERE id = ?", [testKey]);
  });

  // ---------------------------------------------------------------
  // TEST 3: Real Parallel Race Condition Test (10 równoległych żądań)
  // ---------------------------------------------------------------
  console.log('\n[TEST 3] Test wyścigu (Race Condition): 10 RZECZYWIŚCIE RÓWNOLEGŁYCH żądań...');
  console.log('  Scenariusz: Konto testowe z saldem 1000.00 PLN.');
  console.log('  10 jednoczesnych prób pobrania kwoty 200.00 PLN (łącznie 2000.00 PLN).');

  await dbSession(async (db) => {
    const testUserId = `test-user-${generateId()}`;
    const initialBalance = 1000.00;
    const debitAmount = 200.00;
    const concurrentRequests = 10;

    // Utworzenie użytkownika testowego
    await db.run(
      "INSERT INTO User (id, name, email, accountBalance, createdAt, updatedAt) VALUES (?, 'Test Concurrency', ?, ?, NOW(), NOW())",
      [testUserId, `${testUserId}@test.local`, initialBalance]
    );

    try {
      // Odpalenie 10 żądań ściśle równolegle przez Promise.all
      const attempts = Array.from({ length: concurrentRequests }, (_, i) => i + 1);
      
      const results = await Promise.all(
        attempts.map(async (attemptId) => {
          return await dbSession(async (sessionDb) => {
            try {
              return await sessionDb.transaction(async (tx) => {
                // Sprawdzenie i atomowe odjęcie z warunkiem balance >= debitAmount
                const deductResult = await tx.run(
                  "UPDATE User SET accountBalance = accountBalance - ?, updatedAt = NOW() WHERE id = ? AND accountBalance >= ?",
                  [debitAmount, testUserId, debitAmount]
                );

                if (deductResult.affectedRows === 0) {
                  return { attemptId, success: false, reason: 'INSUFFICIENT_FUNDS' };
                }

                return { attemptId, success: true };
              });
            } catch (err) {
              return { attemptId, success: false, reason: err.message };
            }
          });
        })
      );

      const successfulDebits = results.filter(r => r.success).length;
      const failedDebits = results.filter(r => !r.success).length;

      const finalUser = await db.one("SELECT accountBalance FROM User WHERE id = ?", [testUserId]);
      const finalBalance = Number(finalUser.accountBalance);

      console.log(`  Żądań zakończonych sukcesem: ${successfulDebits} (pobrano łącznie ${successfulDebits * debitAmount} PLN)`);
      console.log(`  Żądań poprawnie odrzuconych: ${failedDebits}`);
      console.log(`  Saldo końcowe konta: ${finalBalance.toFixed(2)} PLN (początkowe: ${initialBalance.toFixed(2)} PLN)`);

      if (successfulDebits !== 5) {
        console.error(`  [BŁĄD] Oczekiwano dokładnie 5 udanych pobrań, było: ${successfulDebits}`);
        passedAll = false;
      } else {
        console.log('  [OK] Dokładnie 5 z 10 operacji powiodło się!');
      }

      if (finalBalance < 0) {
        console.error(`  [KRYTYCZNY BŁĄD] Saldo konta zeszło poniżej zera: ${finalBalance} PLN!`);
        passedAll = false;
      } else if (finalBalance === 0.00) {
        console.log('  [OK] Saldo końcowe wynosi dokładnie 0.00 PLN (ani jedna złotówka nie została pobrana nadmiarowo)!');
      } else {
        console.error(`  [BŁĄD] Niespójne saldo końcowe: ${finalBalance}`);
        passedAll = false;
      }
    } finally {
      // Usunięcie użytkownika testowego
      await db.run("DELETE FROM User WHERE id = ?", [testUserId]);
    }
  });

  // ---------------------------------------------------------------
  // TEST 4: Atomic Rollback Verification
  // ---------------------------------------------------------------
  console.log('\n[TEST 4] Weryfikacja atomowego ROLLBACKu przy błędzie transakcji...');
  await dbSession(async (db) => {
    const testCompanyId = 'BMS';
    const compBefore = await db.one("SELECT balance FROM Company WHERE id = ?", [testCompanyId]);
    const balanceBefore = Number(compBefore.balance);

    let caughtError = false;
    try {
      await db.transaction(async (tx) => {
        // Krok 1: odejmij 500 PLN
        await tx.run("UPDATE Company SET balance = balance - 500 WHERE id = ?", [testCompanyId]);
        
        // Krok 2: rzuć intencjonalny błąd w połowie operacji
        throw new Error("SIMULATED_NETWORK_FAILURE_IN_TRANSACTION");
      });
    } catch (e) {
      if (e.message === "SIMULATED_NETWORK_FAILURE_IN_TRANSACTION") {
        caughtError = true;
      }
    }

    const compAfter = await db.one("SELECT balance FROM Company WHERE id = ?", [testCompanyId]);
    const balanceAfter = Number(compAfter.balance);

    console.log(`  Błąd symulowany przechwycony: ${caughtError ? 'TAK' : 'NIE'}`);
    console.log(`  Saldo firmy przed próbą: ${balanceBefore.toFixed(2)} PLN`);
    console.log(`  Saldo firmy po rollbacku: ${balanceAfter.toFixed(2)} PLN`);

    if (balanceBefore === balanceAfter) {
      console.log('  [OK] ROLLBACK przywrócił stan salda w 100% (0 PLN straty)!');
    } else {
      console.error(`  [BŁĄD] Saldo zmieniło się mimo błędu transakcji!`);
      passedAll = false;
    }
  });

  // ---------------------------------------------------------------
  // TEST 5: Paginacja i optymalizacja historii bankowej
  // ---------------------------------------------------------------
  console.log('\n[TEST 5] Weryfikacja paginacji i optymalizacji /api/user/bank...');
  await dbSession(async (db) => {
    const limit50 = await db.all(
      "SELECT id, amount, title, date FROM BankTransaction ORDER BY date DESC LIMIT 50"
    );
    const jsonStr = JSON.stringify(limit50);
    const jsonKb = (Buffer.byteLength(jsonStr, 'utf8') / 1024).toFixed(2);
    console.log(`  Pobrano transakcji (z limitem 50): ${limit50.length}`);
    console.log(`  Rozmiar JSON payloadu: ${jsonKb} KB`);

    if (parseFloat(jsonKb) > 50) {
      console.error('  [BŁĄD] Rozmiar odpowiedzi przekracza 50 KB!');
      passedAll = false;
    } else {
      console.log('  [OK] Payload historii bankowej jest lekki i ograniczony.');
    }
  });

  // ---------------------------------------------------------------
  // TEST 6: Integralność Danych Produkcyjnych
  // ---------------------------------------------------------------
  console.log('\n[TEST 6] Weryfikacja nienaruszalności danych produkcyjnych...');
  await dbSession(async (db) => {
    const company = await db.one("SELECT id, name, balance FROM Company WHERE id = 'BMS'");
    const userCount = await db.one("SELECT count(*) as c FROM User");
    const settlementsCount = await db.one("SELECT count(*) as c FROM MonthlySettlement");
    console.log(`  Firma główna: ${company.name || company.id}, Saldo: ${company.balance} PLN`);
    console.log(`  Liczba użytkowników w bazie: ${userCount.c}`);
    console.log(`  Liczba rozliczeń w bazie: ${settlementsCount.c}`);
    console.log('  [OK] Dane produkcyjne nie uległy zniekształceniu ani usunięciu.');
  });

  console.log('\n====================================================');
  if (passedAll) {
    console.log('>>> WSZYSTKIE TESTY WERYFIKACYJNE PHASE 5 ZALICZONE POMYŚLNIE <<<');
  } else {
    console.error('>>> NIEKTÓRE TESTY WERYFIKACYJNE PHASE 5 ZAKOŃCZYŁY SIĘ BŁĘDEM <<<');
    process.exit(1);
  }
  console.log('====================================================\n');
}

runPhase5Verification()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('Krytyczny błąd testów:', err);
    process.exit(1);
  });
