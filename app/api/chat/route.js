import { NextResponse } from "next/server";
import { dbAll, dbOne, dbRun, generateId } from "../../../lib/db";
import { getServerSession } from "next-auth/next";
import { authOptions } from "../auth/[...nextauth]/route";

function transformMessage(msg) {
  if (!msg) return msg;

  const authorId = msg.userId || msg.user?.id;
  const userImage = msg.user?.image;
  
  let avatarUrl = userImage;
  if (authorId && (!userImage || userImage.startsWith("data:") || userImage.length > 256)) {
    avatarUrl = `/api/user/${authorId}/avatar`;
  }

  let imageUrl = msg.imageUrl;
  if (imageUrl && (imageUrl.startsWith("data:") || imageUrl.length > 256)) {
    imageUrl = `/api/chat/media?id=${msg.id}&type=image`;
  }

  let audioUrl = msg.audioUrl;
  if (audioUrl && (audioUrl.startsWith("data:") || audioUrl.length > 256)) {
    audioUrl = `/api/chat/media?id=${msg.id}&type=audio`;
  }

  return {
    ...msg,
    imageUrl,
    audioUrl,
    user: msg.user ? {
      ...msg.user,
      id: authorId,
      image: avatarUrl
    } : msg.user
  };
}

export async function GET(req) {
  try {
    const session = await getServerSession(authOptions);
    if (!session || !session.user) {
      return NextResponse.json({ error: "Brak dostępu." }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const afterId = searchParams.get("after");

    let whereClause = "";
    const params = [];

    if (afterId) {
      const referenceMsg = await dbOne("SELECT createdAt FROM ChatMessage WHERE id = ?", [afterId]);
      if (referenceMsg) {
        whereClause = "WHERE m.createdAt > ?";
        params.push(referenceMsg.createdAt);
      }
    }

    const limit = afterId ? 100 : 50;

    const messages = await dbAll(`
      SELECT m.*, 
             u.id as 'u_id', u.name as 'u_name', u.firstName as 'u_firstName', 
             u.image as 'u_image', u.role as 'u_role', u.rank as 'u_rank', u.lastOnline as 'u_lastOnline'
      FROM ChatMessage m
      LEFT JOIN User u ON m.userId = u.id
      ${whereClause}
      ORDER BY m.createdAt DESC
      LIMIT ${limit}
    `, params);

    const msgIds = messages.map(m => m.id);
    let reactions = [];
    let replies = [];

    if (msgIds.length > 0) {
      const msgIdsStr = msgIds.map(() => '?').join(',');
      reactions = await dbAll(`SELECT * FROM ChatMessageReaction WHERE messageId IN (${msgIdsStr})`, msgIds);
      
      const replyIds = messages.filter(m => m.replyToId).map(m => m.replyToId);
      if (replyIds.length > 0) {
        const replyIdsStr = replyIds.map(() => '?').join(',');
        replies = await dbAll(`
          SELECT r.*, u.id as 'ru_id', u.name as 'ru_name', u.firstName as 'ru_firstName'
          FROM ChatMessage r
          LEFT JOIN User u ON r.userId = u.id
          WHERE r.id IN (${replyIdsStr})
        `, replyIds);
      }
    }

    const formattedMessages = messages.map(m => {
      const u = m.u_id ? {
        id: m.u_id, name: m.u_name, firstName: m.u_firstName, 
        image: m.u_image, role: m.u_role, rank: m.u_rank, lastOnline: m.u_lastOnline
      } : null;
      
      const mReactions = reactions.filter(r => r.messageId === m.id);
      
      let replyTo = null;
      if (m.replyToId) {
        const r = replies.find(rep => rep.id === m.replyToId);
        if (r) {
          replyTo = {
            ...r,
            user: r.ru_id ? { id: r.ru_id, name: r.ru_name, firstName: r.ru_firstName } : null
          };
        }
      }
      
      return {
        id: m.id,
        content: m.content,
        imageUrl: m.imageUrl,
        audioUrl: m.audioUrl,
        replyToId: m.replyToId,
        userId: m.userId,
        createdAt: m.createdAt,
        user: u,
        reactions: mReactions,
        replyTo: replyTo
      };
    });

    const orderedMessages = formattedMessages.reverse();
    const transformedMessages = orderedMessages.map(transformMessage);

    return NextResponse.json(transformedMessages);
  } catch (error) {
    console.error("Błąd czatu:", error);
    return NextResponse.json({ error: "Błąd serwera." }, { status: 500 });
  }
}

export async function POST(req) {
  try {
    const session = await getServerSession(authOptions);
    if (!session || !session.user) {
      return NextResponse.json({ error: "Brak dostępu." }, { status: 401 });
    }

    const { content, imageUrl, audioUrl, replyToId } = await req.json();
    if ((!content || content.trim() === "") && !imageUrl && !audioUrl) {
      return NextResponse.json({ error: "Pusta wiadomość." }, { status: 400 });
    }

    const id = generateId();
    await dbRun(`
      INSERT INTO ChatMessage (id, content, imageUrl, audioUrl, replyToId, userId, createdAt)
      VALUES (?, ?, ?, ?, ?, ?, NOW())
    `, [
      id,
      content ? content.trim() : "",
      imageUrl || null,
      audioUrl || null,
      replyToId || null,
      session.user.id
    ]);

    // Fetch the newly created message with relations
    const m = await dbOne(`
      SELECT m.*, 
             u.id as 'u_id', u.name as 'u_name', u.firstName as 'u_firstName', 
             u.image as 'u_image', u.role as 'u_role', u.rank as 'u_rank', u.lastOnline as 'u_lastOnline'
      FROM ChatMessage m
      LEFT JOIN User u ON m.userId = u.id
      WHERE m.id = ?
    `, [id]);

    let replyTo = null;
    if (m.replyToId) {
      const r = await dbOne(`
        SELECT r.*, u.id as 'ru_id', u.name as 'ru_name', u.firstName as 'ru_firstName'
        FROM ChatMessage r
        LEFT JOIN User u ON r.userId = u.id
        WHERE r.id = ?
      `, [m.replyToId]);
      
      if (r) {
        replyTo = {
          ...r,
          user: r.ru_id ? { id: r.ru_id, name: r.ru_name, firstName: r.ru_firstName } : null
        };
      }
    }

    const msg = {
      id: m.id,
      content: m.content,
      imageUrl: m.imageUrl,
      audioUrl: m.audioUrl,
      replyToId: m.replyToId,
      userId: m.userId,
      createdAt: m.createdAt,
      user: m.u_id ? {
        id: m.u_id, name: m.u_name, firstName: m.u_firstName, 
        image: m.u_image, role: m.u_role, rank: m.u_rank, lastOnline: m.u_lastOnline
      } : null,
      reactions: [],
      replyTo: replyTo
    };

    return NextResponse.json(transformMessage(msg));
  } catch (error) {
    console.error("Błąd wysyłania wiadomości:", error);
    return NextResponse.json({ error: "Błąd serwera." }, { status: 500 });
  }
}
