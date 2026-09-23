const { dbSession } = require('../lib/db.js');

async function test() {
  const t0 = performance.now();
  const result = await dbSession(async (db) => {
    const messages = await db.all(`
      SELECT m.id, m.content, m.userId, m.replyToId, m.createdAt,
             IF(m.imageUrl IS NOT NULL AND m.imageUrl != '',
                IF(m.imageUrl LIKE 'http%', m.imageUrl, CONCAT('/api/chat/media?id=', m.id, '&type=image')),
                NULL) AS imageUrl,
             IF(m.audioUrl IS NOT NULL AND m.audioUrl != '',
                IF(m.audioUrl LIKE 'http%', m.audioUrl, CONCAT('/api/chat/media?id=', m.id, '&type=audio')),
                NULL) AS audioUrl,
             u.id as 'u_id', u.name as 'u_name', u.firstName as 'u_firstName', 
             IF(u.image LIKE 'http%' OR u.image LIKE '/%', u.image, CONCAT('/api/user/', u.id, '/avatar')) as 'u_image', 
             u.role as 'u_role', u.rank as 'u_rank', u.lastOnline as 'u_lastOnline'
      FROM ChatMessage m
      LEFT JOIN User u ON m.userId = u.id
      ORDER BY m.createdAt DESC
      LIMIT 50
    `);

    const msgIds = messages.map(m => m.id);
    let reactions = [];
    if (msgIds.length > 0) {
      const msgIdsStr = msgIds.map(() => '?').join(',');
      reactions = await db.all(`SELECT id, messageId, userId, emoji FROM ChatMessageReaction WHERE messageId IN (${msgIdsStr})`, msgIds);
    }

    const jsonSize = JSON.stringify(messages).length;
    return { count: messages.length, reactionsCount: reactions.length, jsonSizeKb: (jsonSize / 1024).toFixed(1), sample: messages[0] };
  });

  const duration = performance.now() - t0;
  console.log(`Optimized chat query completed in ${duration.toFixed(2)}ms:`);
  console.log(result);
}

test().catch(console.error);
