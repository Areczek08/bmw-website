import { NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "../../auth/[...nextauth]/route";
import { dbOne } from "../../../../lib/db";
import { chatMediaManifest } from "../../../../lib/chatMediaManifest";

// In-memory isolate cache to prevent re-querying MariaDB for frequently viewed chat media
const mediaMemoryCache = new Map();
const MAX_CACHE_ITEMS = 20;

function addToCache(key, value) {
  if (mediaMemoryCache.size >= MAX_CACHE_ITEMS) {
    const firstKey = mediaMemoryCache.keys().next().value;
    mediaMemoryCache.delete(firstKey);
  }
  mediaMemoryCache.set(key, value);
}

export async function GET(req) {
  try {
    // 1. Enforce authentication for chat media
    const session = await getServerSession(authOptions);
    if (!session || !session.user) {
      return new NextResponse("Unauthorized", { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const messageId = searchParams.get("id");
    const type = searchParams.get("type"); // "image" lub "audio"

    if (!messageId || !type) {
      return new NextResponse("Missing message ID or type", { status: 400 });
    }

    const cacheKey = `${messageId}_${type}`;

    // 2. Check Static Asset Manifest first (pre-migrated assets in public/chat_media/)
    const manifestEntry = chatMediaManifest[messageId];
    if (manifestEntry) {
      const manifestUrl = type === "image" ? manifestEntry.imageUrl : manifestEntry.audioUrl;
      if (manifestUrl) {
        return NextResponse.redirect(new URL(manifestUrl, req.url), {
          status: 307,
          headers: {
            "Cache-Control": "private, max-age=86400, stale-while-revalidate=604800"
          }
        });
      }
    }

    // 3. Check isolate memory cache
    const cached = mediaMemoryCache.get(cacheKey);
    if (cached) {
      return new NextResponse(cached.buffer, {
        status: 200,
        headers: {
          "Content-Type": cached.contentType,
          "Cache-Control": "private, max-age=86400, stale-while-revalidate=604800",
          "X-Content-Type-Options": "nosniff"
        }
      });
    }

    // 4. Query DB for media record
    const message = await dbOne(`SELECT imageUrl, audioUrl FROM ChatMessage WHERE id = ?`, [messageId]);

    if (!message) {
      return new NextResponse("Message not found", { status: 404 });
    }

    const rawMedia = type === "image" ? message.imageUrl : message.audioUrl;

    if (!rawMedia) {
      return new NextResponse("Media not found for this message", { status: 404 });
    }

    // External URL redirect (e.g. ImgBB / R2 / CDN)
    if (rawMedia.startsWith("http://") || rawMedia.startsWith("https://")) {
      return NextResponse.redirect(rawMedia, {
        status: 307,
        headers: {
          "Cache-Control": "private, max-age=86400, stale-while-revalidate=604800"
        }
      });
    }

    // Base64 data URI
    if (rawMedia.startsWith("data:")) {
      const matches = rawMedia.match(/^data:([^;]+);base64,(.+)$/);
      if (matches && matches.length === 3) {
        const contentType = matches[1];
        const base64Data = matches[2];
        const buffer = Buffer.from(base64Data, "base64");

        addToCache(cacheKey, { buffer, contentType });

        return new NextResponse(buffer, {
          status: 200,
          headers: {
            "Content-Type": contentType,
            "Cache-Control": "private, max-age=86400, stale-while-revalidate=604800",
            "X-Content-Type-Options": "nosniff"
          }
        });
      }
    }

    // Raw Base64 string fallback
    try {
      const buffer = Buffer.from(rawMedia, "base64");
      const defaultMime = type === "image" ? "image/png" : "audio/webm";

      addToCache(cacheKey, { buffer, contentType: defaultMime });

      return new NextResponse(buffer, {
        status: 200,
        headers: {
          "Content-Type": defaultMime,
          "Cache-Control": "private, max-age=86400, stale-while-revalidate=604800",
          "X-Content-Type-Options": "nosniff"
        }
      });
    } catch {
      return new NextResponse("Invalid media format", { status: 400 });
    }
  } catch (error) {
    console.error("Błąd pobierania mediów czatu:", error);
    return new NextResponse("Internal Server Error", { status: 500 });
  }
}
