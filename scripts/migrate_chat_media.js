const fs = require('fs');
const path = require('path');
const { dbSession } = require('../lib/db.js');

async function migrateChatMedia() {
  console.log('--- Rozpoczynanie migracji mediów czatu (PHASE 3) ---');
  
  const targetDir = path.join(__dirname, '..', 'public', 'chat_media');
  if (!fs.existsSync(targetDir)) {
    fs.mkdirSync(targetDir, { recursive: true });
    console.log(`Utworzono katalog: ${targetDir}`);
  }

  const manifest = {};
  let imageCount = 0;
  let audioCount = 0;

  await dbSession(async (db) => {
    const messages = await db.all(`
      SELECT id, imageUrl, audioUrl 
      FROM ChatMessage 
      WHERE (imageUrl IS NOT NULL AND imageUrl != '') 
         OR (audioUrl IS NOT NULL AND audioUrl != '')
    `);

    console.log(`Znaleziono wiadomości z mediami: ${messages.length}`);

    for (const msg of messages) {
      manifest[msg.id] = {};

      // Obsługa obrazu
      if (msg.imageUrl) {
        if (msg.imageUrl.startsWith('http://') || msg.imageUrl.startsWith('https://')) {
          manifest[msg.id].imageUrl = msg.imageUrl;
        } else if (msg.imageUrl.startsWith('data:')) {
          const match = msg.imageUrl.match(/^data:([^;]+);base64,(.+)$/);
          if (match) {
            const mimeType = match[1];
            const base64Data = match[2];
            const extMap = {
              'image/jpeg': 'jpg',
              'image/jpg': 'jpg',
              'image/png': 'png',
              'image/gif': 'gif',
              'image/webp': 'webp',
              'image/svg+xml': 'svg'
            };
            const ext = extMap[mimeType] || 'png';
            const filename = `${msg.id}_img.${ext}`;
            const filePath = path.join(targetDir, filename);

            const buffer = Buffer.from(base64Data, 'base64');
            fs.writeFileSync(filePath, buffer);
            const publicUrl = `/chat_media/${filename}`;
            manifest[msg.id].imageUrl = publicUrl;
            imageCount++;
            console.log(`  [ZAPISANO OBRAZ] ${msg.id} -> ${publicUrl} (${(buffer.length / 1024).toFixed(1)} KB)`);
          }
        }
      }

      // Obsługa audio
      if (msg.audioUrl) {
        if (msg.audioUrl.startsWith('http://') || msg.audioUrl.startsWith('https://')) {
          manifest[msg.id].audioUrl = msg.audioUrl;
        } else if (msg.audioUrl.startsWith('data:')) {
          const match = msg.audioUrl.match(/^data:([^;]+);base64,(.+)$/);
          if (match) {
            const mimeType = match[1];
            const base64Data = match[2];
            const extMap = {
              'audio/webm': 'webm',
              'audio/ogg': 'ogg',
              'audio/mp4': 'mp4',
              'audio/mpeg': 'mp3',
              'audio/wav': 'wav'
            };
            const ext = extMap[mimeType] || 'webm';
            const filename = `${msg.id}_aud.${ext}`;
            const filePath = path.join(targetDir, filename);

            const buffer = Buffer.from(base64Data, 'base64');
            fs.writeFileSync(filePath, buffer);
            const publicUrl = `/chat_media/${filename}`;
            manifest[msg.id].audioUrl = publicUrl;
            audioCount++;
            console.log(`  [ZAPISANO AUDIO] ${msg.id} -> ${publicUrl} (${(buffer.length / 1024).toFixed(1)} KB)`);
          }
        }
      }
    }
  });

  const manifestPath = path.join(__dirname, '..', 'lib', 'chatMediaManifest.js');
  const manifestContent = `/**
 * Pre-extracted chat media manifest.
 * OpenNext bundles files in public/ into Cloudflare edge assets.
 */
export const chatMediaManifest = ${JSON.stringify(manifest, null, 2)};
`;

  fs.writeFileSync(manifestPath, manifestContent, 'utf-8');
  console.log(`Zapisano manifest mediów czatu w: ${manifestPath}`);
  console.log(`Podsumowanie: ${imageCount} obrazów, ${audioCount} nagrań audio wyeksportowanych do public/chat_media/`);
  console.log('--- Migracja zakończona sukcesem (Baza MariaDB nienaruszona) ---');
}

migrateChatMedia()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('Błąd migracji mediów:', err);
    process.exit(1);
  });
