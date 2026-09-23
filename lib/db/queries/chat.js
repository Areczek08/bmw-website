/**
 * Chat module SQL queries
 */

export const ChatQueries = {
  getMessagesLightweight: (whereClause, limit) => `
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
    ${whereClause}
    ORDER BY m.createdAt DESC
    LIMIT ${limit}
  `,

  getReactionsForMessages: (placeholders) => `
    SELECT id, messageId, userId, emoji
    FROM ChatMessageReaction
    WHERE messageId IN (${placeholders})
  `
};
