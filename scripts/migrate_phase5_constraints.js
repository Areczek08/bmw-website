const { dbSession } = require('../lib/db.js');

async function migratePhase5Constraints() {
  console.log('--- Rozpoczynanie migracji struktur dla PHASE 5 ---');

  await dbSession(async (db) => {
    // 1. Sprawdzanie unikalności MonthlySettlement
    const indexes = await db.all('SHOW INDEX FROM MonthlySettlement');
    const hasUnique = indexes.some(i => i.Key_name === 'uq_monthly_settlement');

    if (!hasUnique) {
      console.log('Dodawanie ograniczenia UNIQUE(companyId, month, year) do MonthlySettlement...');
      await db.run(`
        ALTER TABLE MonthlySettlement
        ADD CONSTRAINT uq_monthly_settlement UNIQUE (companyId, month, year)
      `);
      console.log('  [OK] Dodano indeks uq_monthly_settlement!');
    } else {
      console.log('  [INFO] Indeks uq_monthly_settlement już istnieje.');
    }

    // 2. Utworzenie tabeli dla IdempotencyKey
    console.log('Tworzenie tabeli IdempotencyKey (jeśli nie istnieje)...');
    await db.run(`
      CREATE TABLE IF NOT EXISTS IdempotencyKey (
        id VARCHAR(128) NOT NULL,
        action VARCHAR(64) NOT NULL,
        statusCode INT NOT NULL,
        responseBody TEXT NOT NULL,
        createdAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (id),
        KEY idx_idempotency_created (createdAt)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);
    console.log('  [OK] Tabela IdempotencyKey jest gotowa.');
  });

  console.log('--- Migracja struktur PHASE 5 zakończona pomyślnie ---');
}

migratePhase5Constraints()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('Błąd migracji:', err);
    process.exit(1);
  });
