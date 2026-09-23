const fs = require('fs');
const path = require('path');
const { dbAll } = require('../lib/db.js');

async function migrateAvatars() {
  console.log('=== AVATAR MIGRATION TO STATIC ASSETS / STORAGE ===');
  
  const targetDir = path.join(__dirname, '..', 'public', 'avatars');
  if (!fs.existsSync(targetDir)) {
    fs.mkdirSync(targetDir, { recursive: true });
  }

  const users = await dbAll(`
    SELECT id, name, image 
    FROM User 
    WHERE image IS NOT NULL AND image != '' AND image NOT LIKE 'http%'
  `);

  console.log(`Found ${users.length} users with non-URL avatars.`);

  const migrated = [];
  for (const user of users) {
    const raw = (user.image || '').trim();
    let buffer = null;
    let ext = 'png';

    if (raw.startsWith('data:')) {
      const match = raw.match(/^data:image\/([a-zA-Z0-9+]+);base64,(.+)$/);
      if (match) {
        ext = match[1] === 'jpeg' ? 'jpg' : match[1];
        buffer = Buffer.from(match[2], 'base64');
      }
    } else if (raw.length > 100) {
      try {
        buffer = Buffer.from(raw, 'base64');
      } catch (e) {}
    }

    if (buffer) {
      const filename = `${user.id}.${ext}`;
      const filePath = path.join(targetDir, filename);
      fs.writeFileSync(filePath, buffer);
      
      const publicUrl = `/avatars/${filename}`;
      migrated.push({ id: user.id, name: user.name, bytes: buffer.length, url: publicUrl });
      console.log(`  ✓ Exported ${user.name} (${user.id}): ${(buffer.length / 1024).toFixed(1)} KB -> ${publicUrl}`);
    }
  }

  console.log(`\nSuccessfully exported ${migrated.length} avatars to public/avatars/!`);
  console.log('Cloudflare Workers will serve these via ASSETS binding directly from the global CDN.');
  
  // Write a mapping file for quick lookup without DB queries
  const mapFile = path.join(targetDir, 'manifest.json');
  const manifest = {};
  for (const m of migrated) {
    manifest[m.id] = m.url;
  }
  fs.writeFileSync(mapFile, JSON.stringify(manifest, null, 2));
  console.log('Manifest written to public/avatars/manifest.json');
}

migrateAvatars().catch(console.error);
