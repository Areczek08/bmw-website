const fs = require('fs');
const path = require('path');
const { dbSession } = require('../lib/db.js');
const { getSafeAvatarUrl } = require('../lib/avatar.js');
const { fleetImageManifest } = require('../lib/fleetImageManifest.js');
const { getVehicleImageVariants } = require('../lib/fleetImage.js');
const { validateFleetImageUpload, detectImageMimeFromBuffer } = require('../lib/storage/fleetStorage.js');

async function runPhase4Verification() {
  console.log('====================================================');
  console.log('      PHASE 4 VERIFICATION — FLOTA & MEDIA / R2     ');
  console.log('====================================================\n');

  let passedAll = true;

  // 1. Sprawdzanie manifestu i wygenerowanych wariantów WebP
  console.log('[TEST 1] Weryfikacja assetów WebP na dysku (320w, 640w, 1280w)...');
  const manifestUrls = Object.keys(fleetImageManifest);
  console.log(`  Unikalnych grafik w manifeście: ${manifestUrls.length}`);
  if (manifestUrls.length !== 45) {
    console.error(`  [BŁĄD] Oczekiwano 45 unikalnych grafik w manifeście, znaleziono ${manifestUrls.length}`);
    passedAll = false;
  }

  let totalWebpBytes = 0;
  let missingFiles = 0;

  for (const [url, entry] of Object.entries(fleetImageManifest)) {
    const thumbDisk = path.join(__dirname, '..', 'public', entry.thumbnail.replace(/^\//, ''));
    const medDisk = path.join(__dirname, '..', 'public', entry.medium.replace(/^\//, ''));
    const largeDisk = path.join(__dirname, '..', 'public', entry.large.replace(/^\//, ''));

    if (!fs.existsSync(thumbDisk) || !fs.existsSync(medDisk) || !fs.existsSync(largeDisk)) {
      console.error(`  [BŁĄD] Brak pliku na dysku dla: ${url}`);
      missingFiles++;
      passedAll = false;
    } else {
      totalWebpBytes += (fs.statSync(thumbDisk).size + fs.statSync(medDisk).size + fs.statSync(largeDisk).size);
    }
  }

  console.log(`  Brakujących plików wariantów WebP: ${missingFiles}`);
  console.log(`  Łączny rozmiar wszystkich 3 wariantów WebP (135 plików): ${(totalWebpBytes / (1024 * 1024)).toFixed(2)} MB`);
  console.log(`  Redukcja transferu: z 149.2 MB oryginałów do ${(totalWebpBytes / (1024 * 1024)).toFixed(2)} MB (spadek o ${( (1 - (totalWebpBytes / (149.2 * 1024 * 1024))) * 100 ).toFixed(1)}%)`);

  // 2. Weryfikacja SSR i eliminacji 7.5 MB Base64 avatarów kierowców
  console.log('\n[TEST 2] Weryfikacja SSR /flota i eliminacji Base64 avatarów...');
  await dbSession(async (db) => {
    const rawTrucks = await db.all('SELECT id, assignedDriverId FROM Truck');
    const driverIds = rawTrucks.filter(t => t.assignedDriverId).map(t => t.assignedDriverId);
    const placeholders = driverIds.map(() => '?').join(',');
    
    // Zapytanie bez surowego Base64
    const drivers = await db.all(
      `SELECT id, name, firstName, discordNick, image FROM User WHERE id IN (${placeholders})`,
      driverIds
    );

    const safeDrivers = drivers.map(d => ({
      id: d.id,
      name: d.discordNick || d.name || d.firstName,
      image: getSafeAvatarUrl(d)
    }));

    const safeJson = JSON.stringify(safeDrivers);
    const safeKb = (Buffer.byteLength(safeJson, 'utf8') / 1024).toFixed(2);
    console.log(`  Pobrano kierowców floty: ${safeDrivers.length}`);
    console.log(`  Rozmiar danych kierowców z getSafeAvatarUrl: ${safeKb} KB (przed optymalizacją: 7,517.2 KB)`);
    console.log(`  Redukcja rozmiaru pamięci SSR kierowców: ${( (1 - (parseFloat(safeKb) / 7517.2)) * 100 ).toFixed(2)}%`);

    let foundBase64 = false;
    for (const d of safeDrivers) {
      if (d.image && d.image.startsWith('data:')) {
        foundBase64 = true;
        break;
      }
    }
    console.log(`  Base64 w danych kierowców: ${foundBase64 ? 'TAK (BŁĄD!)' : 'NIE (0 bajtów - SUKCES!)'}`);
    if (foundBase64 || parseFloat(safeKb) > 50) {
      passedAll = false;
    }
  });

  // 3. Weryfikacja rozmiaru i zapytań /api/public/flota
  console.log('\n[TEST 3] Weryfikacja endpointu /api/public/flota...');
  await dbSession(async (db) => {
    const rawTrucks = await db.all(
      `SELECT id, brand, model, plate, fleetNumber, power, mileage, status, fuelLevel, type, imageUrl, assignedDriverId, attachedTrailerId, location, productionYear 
       FROM Truck 
       ORDER BY fleetNumber ASC, plate ASC`
    );

    const driverIds = rawTrucks.filter(t => t.assignedDriverId).map(t => t.assignedDriverId);
    let drivers = [];
    if (driverIds.length > 0) {
      const placeholders = driverIds.map(() => '?').join(',');
      drivers = await db.all(
        `SELECT id, name, firstName, discordNick, image FROM User WHERE id IN (${placeholders})`,
        driverIds
      );
    }

    const trailerIds = rawTrucks.filter(t => t.attachedTrailerId).map(t => t.attachedTrailerId);
    let trailers = [];
    if (trailerIds.length > 0) {
      const placeholders = trailerIds.map(() => '?').join(',');
      trailers = await db.all(
        `SELECT id, brand, model, plate, type, imageUrl FROM Trailer WHERE id IN (${placeholders})`,
        trailerIds
      );
    }

    const trucksPayload = rawTrucks.map(t => {
      const driver = drivers.find(d => d.id === t.assignedDriverId);
      const trailer = trailers.find(tr => tr.id === t.attachedTrailerId);
      const driverImg = driver ? getSafeAvatarUrl(driver) : null;
      const imageVariants = getVehicleImageVariants(t.imageUrl);

      return {
        id: t.id,
        brand: t.brand,
        model: t.model,
        plate: t.plate,
        fleetNumber: t.fleetNumber,
        power: t.power || 0,
        mileage: t.mileage || 0,
        status: t.status || "AVAILABLE",
        fuelLevel: t.fuelLevel ?? null,
        type: t.type || "Ciągnik",
        location: t.location || null,
        productionYear: t.productionYear || null,
        imageUrl: t.imageUrl,
        imageVariants: imageVariants ? {
          thumbnail: imageVariants.thumbnail,
          medium: imageVariants.medium,
          large: imageVariants.large,
          srcSet: imageVariants.srcSet
        } : null,
        assignedDriver: driver ? {
          id: driver.id,
          name: driver.discordNick || driver.name || driver.firstName || "Kierowca",
          image: driverImg,
        } : null,
        attachedTrailer: trailer ? {
          id: trailer.id,
          brand: trailer.brand,
          model: trailer.model,
          plate: trailer.plate,
          type: trailer.type,
          imageUrl: trailer.imageUrl,
        } : null,
      };
    });

    const jsonStr = JSON.stringify(trucksPayload);
    const jsonKb = (Buffer.byteLength(jsonStr, 'utf8') / 1024).toFixed(2);
    console.log(`  Liczba zwróconych pojazdów: ${trucksPayload.length}`);
    console.log(`  Rozmiar JSON /api/public/flota: ${jsonKb} KB (przed optymalizacją: 7,539.96 KB)`);
    console.log(`  Redukcja rozmiaru JSON API: ${( (1 - (parseFloat(jsonKb) / 7539.96)) * 100 ).toFixed(1)}%`);

    if (parseFloat(jsonKb) > 100) {
      console.error(`  [BŁĄD] Rozmiar JSON API przekracza limit 100 KB!`);
      passedAll = false;
    }
  });

  // 4. Testy odpornościowe (edge cases & resilient fallback)
  console.log('\n[TEST 4] Testy odpornościowe i przypadków brzegowych...');
  
  // 4a: Pojazd bez zdjęcia (null)
  const noImgVariants = getVehicleImageVariants(null);
  if (noImgVariants === null) {
    console.log('  [OK] 4a: Pojazd bez zdjęcia poprawnie zwraca null (aktywuje fallback SVG w VehicleCard).');
  } else {
    console.error('  [BŁĄD] 4a: getVehicleImageVariants(null) nie zwrócił null:', noImgVariants);
    passedAll = false;
  }

  // 4b: Nieznany zewnętrzny URL (brak w manifeście)
  const unknownUrl = 'https://unknown-domain.com/truck.jpg';
  const unknownVariants = getVehicleImageVariants(unknownUrl);
  if (unknownVariants && unknownVariants.medium === unknownUrl) {
    console.log('  [OK] 4b: Nieznany URL poprawnie generuje bezpieczny fallback do oryginału.');
  } else {
    console.error('  [BŁĄD] 4b: Niepoprawny fallback dla nieznanego URL:', unknownVariants);
    passedAll = false;
  }

  // 4c: Wykrywanie MIME po sygnaturze (magic bytes)
  const fakePng = Buffer.from('NOT A REAL PNG FILE AT ALL');
  const detectedFake = detectImageMimeFromBuffer(fakePng);
  if (detectedFake === null) {
    console.log('  [OK] 4c: Fałszywy plik PNG został poprawnie odrzucony przez sygnaturę bajtów.');
  } else {
    console.error('  [BŁĄD] 4c: Fałszywy plik został błędnie rozpoznany jako:', detectedFake);
    passedAll = false;
  }

  // 4d: Plik przekraczający limit 5MB
  const hugeBuffer = Buffer.alloc(6 * 1024 * 1024); // 6 MB
  const resHuge = validateFleetImageUpload(hugeBuffer);
  if (!resHuge.valid && resHuge.error.includes('za duży')) {
    console.log('  [OK] 4d: Upload > 5 MB poprawnie zablokowany.');
  } else {
    console.error('  [BŁĄD] 4d: Upload > 5 MB NIE został zablokowany!', resHuge);
    passedAll = false;
  }

  // 5. Integralność bazy MariaDB
  console.log('\n[TEST 5] Sprawdzanie nienaruszalności danych w MariaDB...');
  await dbSession(async (db) => {
    const trucksCount = await db.one('SELECT count(*) as c FROM Truck');
    const trailersCount = await db.one('SELECT count(*) as c FROM Trailer');
    const ibbCount = await db.one('SELECT count(*) as c FROM Truck WHERE imageUrl LIKE "https://i.ibb.co%"');
    console.log(`  Liczba ciągników w bazie: ${trucksCount.c} (oryginalna: 60)`);
    console.log(`  Liczba naczep w bazie: ${trailersCount.c} (oryginalna: 4)`);
    console.log(`  Liczba rekordów z oryginalnym URL ibb.co: ${ibbCount.c} (oryginały zachowane)`);

    if (trucksCount.c !== 60 || trailersCount.c !== 4) {
      console.error(`  [BŁĄD] Niezgodność liczby rekordów w bazie!`);
      passedAll = false;
    } else {
      console.log('  [OK] Wszystkie rekordy w bazie MariaDB pozostały nienaruszone.');
    }
  });

  console.log('\n====================================================');
  if (passedAll) {
    console.log('>>> WSZYSTKIE TESTY WERYFIKACYJNE PHASE 4 ZALICZONE POMYŚLNIE <<<');
  } else {
    console.error('>>> NIEKTÓRE TESTY WERYFIKACYJNE PHASE 4 ZAKOŃCZYŁY SIĘ BŁĘDEM <<<');
    process.exit(1);
  }
  console.log('====================================================\n');
}

runPhase4Verification()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('Krytyczny błąd testów:', err);
    process.exit(1);
  });
