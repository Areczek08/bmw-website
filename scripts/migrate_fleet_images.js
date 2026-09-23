const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const sharp = require('sharp');
const { dbSession } = require('../lib/db.js');

async function downloadBuffer(url) {
  if (url.startsWith('http://') || url.startsWith('https://')) {
    const res = await fetch(url);
    if (!res.ok) {
      throw new Error(`HTTP error ${res.status}: ${res.statusText}`);
    }
    const arrayBuf = await res.arrayBuffer();
    return Buffer.from(arrayBuf);
  } else if (url.startsWith('/')) {
    const localPath = path.join(__dirname, '..', 'public', url.replace(/^\//, ''));
    if (fs.existsSync(localPath)) {
      return fs.readFileSync(localPath);
    }
    throw new Error(`Local file not found: ${localPath}`);
  }
  throw new Error(`Unsupported URL protocol: ${url}`);
}

async function migrateFleetImages() {
  console.log('====================================================');
  console.log('       ROZPOCZYNANIE MIGRACJI ZDJĘĆ FLOTY (PHASE 4) ');
  console.log('====================================================\n');

  const baseFleetDir = path.join(__dirname, '..', 'public', 'fleet', 'vehicles');
  if (!fs.existsSync(baseFleetDir)) {
    fs.mkdirSync(baseFleetDir, { recursive: true });
  }

  let uniqueUrls = [];
  await dbSession(async (db) => {
    const trucks = await db.all('SELECT imageUrl FROM Truck WHERE imageUrl IS NOT NULL AND imageUrl != ""');
    const trailers = await db.all('SELECT imageUrl FROM Trailer WHERE imageUrl IS NOT NULL AND imageUrl != ""');
    const allUrls = [...trucks, ...trailers].map(x => x.imageUrl).filter(Boolean);
    uniqueUrls = Array.from(new Set(allUrls));
  });

  console.log(`Znaleziono ${uniqueUrls.length} unikalnych grafik floty do optymalizacji.`);

  const manifest = {};
  let totalOriginalBytes = 0;
  let totalWebpBytes = 0;
  let processedCount = 0;
  let skippedCount = 0;
  let errorCount = 0;

  for (let i = 0; i < uniqueUrls.length; i++) {
    const url = uniqueUrls[i];
    const hash = crypto.createHash('md5').update(url).digest('hex').slice(0, 12);
    const targetDir = path.join(baseFleetDir, hash);
    const thumbPath = path.join(targetDir, 'thumbnail.webp');
    const medPath = path.join(targetDir, 'medium.webp');
    const largePath = path.join(targetDir, 'large.webp');

    const manifestEntry = {
      originalUrl: url,
      hash,
      thumbnail: `/fleet/vehicles/${hash}/thumbnail.webp`,
      medium: `/fleet/vehicles/${hash}/medium.webp`,
      large: `/fleet/vehicles/${hash}/large.webp`,
      srcSet: `/fleet/vehicles/${hash}/thumbnail.webp 320w, /fleet/vehicles/${hash}/medium.webp 640w, /fleet/vehicles/${hash}/large.webp 1280w`
    };

    // Resumable check
    if (fs.existsSync(thumbPath) && fs.existsSync(medPath) && fs.existsSync(largePath)) {
      const sThumb = fs.statSync(thumbPath).size;
      const sMed = fs.statSync(medPath).size;
      const sLarge = fs.statSync(largePath).size;
      totalWebpBytes += (sThumb + sMed + sLarge);
      manifest[url] = manifestEntry;
      skippedCount++;
      console.log(`[${i + 1}/${uniqueUrls.length}] Pominięto (już zmigrowane): ${hash}`);
      continue;
    }

    try {
      console.log(`[${i + 1}/${uniqueUrls.length}] Pobieranie: ${url}`);
      const rawBuffer = await downloadBuffer(url);
      totalOriginalBytes += rawBuffer.length;

      if (!fs.existsSync(targetDir)) {
        fs.mkdirSync(targetDir, { recursive: true });
      }

      // Generowanie wariantów WebP przy użyciu Sharp
      const imageInstance = sharp(rawBuffer);

      // 1. Thumbnail (320px)
      await imageInstance
        .clone()
        .resize({ width: 320, withoutEnlargement: true })
        .webp({ quality: 80, effort: 4 })
        .toFile(thumbPath);

      // 2. Medium (640px)
      await imageInstance
        .clone()
        .resize({ width: 640, withoutEnlargement: true })
        .webp({ quality: 82, effort: 4 })
        .toFile(medPath);

      // 3. Large (1280px)
      await imageInstance
        .clone()
        .resize({ width: 1280, withoutEnlargement: true })
        .webp({ quality: 85, effort: 4 })
        .toFile(largePath);

      const sThumb = fs.statSync(thumbPath).size;
      const sMed = fs.statSync(medPath).size;
      const sLarge = fs.statSync(largePath).size;
      const combinedWebp = sThumb + sMed + sLarge;
      totalWebpBytes += combinedWebp;

      manifest[url] = manifestEntry;
      processedCount++;

      console.log(`  -> Zapisano ${hash}: oryginał ${(rawBuffer.length / 1024).toFixed(1)} KB -> WebP: 320px(${(sThumb / 1024).toFixed(1)}KB), 640px(${(sMed / 1024).toFixed(1)}KB), 1280px(${(sLarge / 1024).toFixed(1)}KB)`);
    } catch (err) {
      console.error(`  [BŁĄD] Nie udało się przetworzyć ${url}:`, err.message);
      errorCount++;
      // Fallback: zachowaj wpis wskazujący na oryginał
      manifest[url] = {
        originalUrl: url,
        thumbnail: url,
        medium: url,
        large: url,
        srcSet: `${url} 640w`
      };
    }
  }

  // Zapis manifestu
  const manifestPath = path.join(__dirname, '..', 'lib', 'fleetImageManifest.js');
  const fileContent = `/**
 * Pre-generated Fleet Responsive Images Manifest
 * Generated during PHASE 4 optimization.
 * Static WebP assets are served directly from Cloudflare edge CDN.
 */
export const fleetImageManifest = ${JSON.stringify(manifest, null, 2)};
`;

  fs.writeFileSync(manifestPath, fileContent, 'utf8');
  console.log(`\nZapisano manifest floty w: ${manifestPath}`);
  console.log('----------------------------------------------------');
  console.log(`Podsumowanie:`);
  console.log(`  Przetworzono nowo: ${processedCount}`);
  console.log(`  Pominięto (istniejące): ${skippedCount}`);
  console.log(`  Błędy: ${errorCount}`);
  if (totalOriginalBytes > 0) {
    console.log(`  Oryginalna waga pobranych: ${(totalOriginalBytes / (1024 * 1024)).toFixed(2)} MB`);
    console.log(`  Waga wszystkich 3 wariantów WebP łącznie: ${(totalWebpBytes / (1024 * 1024)).toFixed(2)} MB`);
    console.log(`  Średnia waga wariantu Medium (karta desktop): ${(totalWebpBytes / (uniqueUrls.length * 3 * 1024)).toFixed(1)} KB`);
  }
  console.log('====================================================\n');
}

migrateFleetImages()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('Krytyczny błąd skryptu migracji floty:', err);
    process.exit(1);
  });
