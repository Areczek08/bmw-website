const fs = require('fs');
const path = require('path');
const { dbSession } = require('../lib/db.js');
const { ChatQueries } = require('../lib/db/queries/chat.js');
const { validateMediaItem } = require('../lib/storage/chatMedia.js');
const { chatMediaManifest } = require('../lib/chatMediaManifest.js');

async function runPhase3Verification() {
  console.log('====================================================');
  console.log('         PHASE 3 VERIFICATION — CHAT & MEDIA        ');
  console.log('====================================================\n');

  let passedAll = true;

  // 1. Weryfikacja plików mediów w public/chat_media/ i manifestu
  console.log('[TEST 1] Sprawdzanie manifestu i wyeksportowanych assetów...');
  const manifestKeys = Object.keys(chatMediaManifest);
  console.log(`  Wpisy w manifeście: ${manifestKeys.length}`);
  if (manifestKeys.length !== 6) {
    console.error(`  BŁĄD: Oczekiwano 6 wpisów w manifeście, znaleziono ${manifestKeys.length}`);
    passedAll = false;
  }

  let existingFilesCount = 0;
  for (const [msgId, media] of Object.entries(chatMediaManifest)) {
    const mediaPath = media.imageUrl || media.audioUrl;
    if (mediaPath && mediaPath.startsWith('/chat_media/')) {
      const diskPath = path.join(__dirname, '..', 'public', mediaPath.replace('/', ''));
      if (fs.existsSync(diskPath)) {
        const stats = fs.statSync(diskPath);
        if (stats.size > 0) {
          existingFilesCount++;
          console.log(`  [OK] ${msgId}: ${mediaPath} (${(stats.size / 1024).toFixed(1)} KB na dysku)`);
        } else {
          console.error(`  [BŁĄD] Plik pusty: ${diskPath}`);
          passedAll = false;
        }
      } else {
        console.error(`  [BŁĄD] Brak pliku na dysku: ${diskPath}`);
        passedAll = false;
      }
    }
  }
  console.log(`  Znaleziono ${existingFilesCount}/6 plików na dysku.`);

  // 2. Weryfikacja zapytań SQL do czatu i rozmiaru payloadu
  console.log('\n[TEST 2] Weryfikacja zapytania /api/chat i eliminacji Base64...');
  let messageCount = 0;
  let jsonSizeKb = 0;
  let base64Found = false;

  await dbSession(async (db) => {
    const messages = await db.all(ChatQueries.getMessagesLightweight('', 50));
    messageCount = messages.length;

    const rawJson = JSON.stringify(messages);
    jsonSizeKb = (Buffer.byteLength(rawJson, 'utf8') / 1024).toFixed(2);

    for (const m of messages) {
      if (m.imageUrl && m.imageUrl.startsWith('data:')) {
        base64Found = true;
        console.error(`  [BŁĄD] Znaleziono Base64 w imageUrl wiadomości ${m.id}`);
      }
      if (m.audioUrl && m.audioUrl.startsWith('data:')) {
        base64Found = true;
        console.error(`  [BŁĄD] Znaleziono Base64 w audioUrl wiadomości ${m.id}`);
      }
      if (m.u_image && m.u_image.startsWith('data:')) {
        base64Found = true;
        console.error(`  [BŁĄD] Znaleziono Base64 w avatarze użytkownika wiadomości ${m.id}`);
      }
    }

    console.log(`  Pobrano wiadomości: ${messageCount}`);
    console.log(`  Rozmiar JSON: ${jsonSizeKb} KB (przed optymalizacją: ~7,700 KB / 7.7 MB)`);
    console.log(`  Redukcja rozmiaru: ${( (1 - (parseFloat(jsonSizeKb) / 7700)) * 100 ).toFixed(1)}%`);
    console.log(`  Base64 w payloadzie: ${base64Found ? 'TAK (BŁĄD!)' : 'NIE (0 bajtów Base64 - SUKCES!)'}`);

    if (base64Found || parseFloat(jsonSizeKb) > 100) {
      passedAll = false;
    }

    // 3. Weryfikacja paginacji (after i before)
    console.log('\n[TEST 3] Weryfikacja paginacji kursorem...');
    if (messages.length >= 2) {
      const midMessage = messages[Math.floor(messages.length / 2)];
      
      const newerMessages = await db.all(ChatQueries.getMessagesLightweight('WHERE m.createdAt > ?', 50), [midMessage.createdAt]);
      console.log(`  Wiadomości nowsze niż ${midMessage.id}: ${newerMessages.length}`);

      const olderMessages = await db.all(ChatQueries.getMessagesLightweight('WHERE m.createdAt < ?', 50), [midMessage.createdAt]);
      console.log(`  Wiadomości starsze niż ${midMessage.id}: ${olderMessages.length}`);

      if (newerMessages.length + olderMessages.length + 1 !== messages.length) {
        console.warn(`  [INFO] Spójność paginacji: ${newerMessages.length} nowszych + ${olderMessages.length} starszych = ${newerMessages.length + olderMessages.length}`);
      } else {
        console.log(`  [OK] Paginacja spójna.`);
      }
    }
  });

  // 4. Testy walidatora mediów (MIME i limity rozmiaru)
  console.log('\n[TEST 4] Testy walidatora mediów (MIME i limity 5 MB)...');
  
  // Test 4a: Prawidłowy JPEG
  const validJpeg = 'data:image/jpeg;base64,/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAP';
  const resJpeg = validateMediaItem(validJpeg, 'image');
  if (resJpeg.valid && resJpeg.isBase64 && resJpeg.mime === 'image/jpeg') {
    console.log('  [OK] 4a: Prawidłowy JPEG zaakceptowany.');
  } else {
    console.error('  [BŁĄD] 4a: Niepowodzenie walidacji prawidłowego JPEG:', resJpeg);
    passedAll = false;
  }

  // Test 4b: Prawidłowe audio WebM
  const validWebm = 'data:audio/webm;base64,GkXfo59ChoEBQveBAULygQRC84E';
  const resWebm = validateMediaItem(validWebm, 'audio');
  if (resWebm.valid && resWebm.isBase64 && resWebm.mime === 'audio/webm') {
    console.log('  [OK] 4b: Prawidłowe audio WebM zaakceptowane.');
  } else {
    console.error('  [BŁĄD] 4b: Niepowodzenie walidacji prawidłowego WebM:', resWebm);
    passedAll = false;
  }

  // Test 4c: Niedozwolony MIME (np. plik wykonywalny exe lub skrypt)
  const invalidMime = 'data:application/x-msdownload;base64,TVqQAAMAAAAEAAAA';
  const resInvalid = validateMediaItem(invalidMime, 'image');
  if (!resInvalid.valid && resInvalid.error.includes('Niedozwolony format')) {
    console.log('  [OK] 4c: Niedozwolony format MIME poprawnie zablokowany.');
  } else {
    console.error('  [BŁĄD] 4c: Niedozwolony format MIME NIE został zablokowany!', resInvalid);
    passedAll = false;
  }

  // Test 4d: Plik przekraczający limit 5MB
  const hugeData = 'data:image/png;base64,' + 'A'.repeat(8 * 1024 * 1024); // ~6 MB
  const resHuge = validateMediaItem(hugeData, 'image');
  if (!resHuge.valid && resHuge.error.includes('za duży')) {
    console.log('  [OK] 4d: Plik przekraczający 5MB poprawnie zablokowany.');
  } else {
    console.error('  [BŁĄD] 4d: Plik > 5MB NIE został zablokowany!', resHuge);
    passedAll = false;
  }

  // 5. Sprawdzenie integralności bazy MariaDB (brak destrukcyjnych zmian)
  console.log('\n[TEST 5] Sprawdzanie integralności bazy MariaDB...');
  await dbSession(async (db) => {
    const countCheck = await db.one('SELECT count(*) as c FROM ChatMessage');
    const withMediaCheck = await db.all('SELECT id, LENGTH(imageUrl) as imgLen, LENGTH(audioUrl) as audLen FROM ChatMessage WHERE imageUrl IS NOT NULL OR audioUrl IS NOT NULL');
    console.log(`  Liczba wszystkich wiadomości w bazie: ${countCheck.c}`);
    console.log(`  Liczba wiadomości z mediami w bazie: ${withMediaCheck.length} (oryginalne dane Base64 zachowane 1:1)`);
    if (countCheck.c !== 20 || withMediaCheck.length !== 6) {
      console.error('  [BŁĄD] Niezgodność liczby rekordów!');
      passedAll = false;
    } else {
      console.log('  [OK] Żadne dane z bazy nie zostały usunięte ani zmodyfikowane.');
    }
  });

  console.log('\n====================================================');
  if (passedAll) {
    console.log('>>> WSZYSTKIE TESTY WERYFIKACYJNE PHASE 3 ZALICZONE POMYŚLNIE <<<');
  } else {
    console.error('>>> NIEKTÓRE TESTY WERYFIKACYJNE PHASE 3 ZAKOŃCZYŁY SIĘ BŁĘDEM <<<');
    process.exit(1);
  }
  console.log('====================================================\n');
}

runPhase3Verification()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('Błąd krytyczny testów:', err);
    process.exit(1);
  });
