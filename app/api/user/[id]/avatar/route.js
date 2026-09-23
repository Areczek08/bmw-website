import { NextResponse } from "next/server";
import { dbSession } from "../../../../../lib/db";
import { avatarManifest } from "../../../../../lib/avatarManifest";

// In-memory cache per isolate to avoid hitting MariaDB repeatedly
const memoryAvatarCache = new Map();

const defaultSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100" viewBox="0 0 100 100"><circle cx="50" cy="50" r="50" fill="#27272a"/><path d="M50 45 a 15 15 0 1 0 0 -30 a 15 15 0 1 0 0 30 M25 80 c 0 -20 50 -20 50 0" fill="none" stroke="#71717a" stroke-width="5"/></svg>`;

export async function GET(req, { params }) {
  try {
    const { id } = await params;

    if (!id) {
      return new NextResponse("Missing user ID", { status: 400 });
    }

    // 1. Direct CDN / static asset redirect if migrated
    if (avatarManifest && avatarManifest[id]) {
      const baseUrl = req.url ? new URL(req.url).origin : "https://system.vsbojarlogistic.pl";
      return NextResponse.redirect(new URL(avatarManifest[id], baseUrl), {
        status: 301,
        headers: {
          "Cache-Control": "public, max-age=31536000, immutable"
        }
      });
    }

    // 2. Check isolate memory cache
    if (memoryAvatarCache.has(id)) {
      const cached = memoryAvatarCache.get(id);
      return new NextResponse(cached.buffer, {
        status: 200,
        headers: {
          "Content-Type": cached.contentType,
          "Cache-Control": "public, max-age=604800, s-maxage=2592000, stale-while-revalidate=2592000"
        }
      });
    }

    // 3. Fallback: Query DB on single session
    const user = await dbSession(async (db) => {
      return await db.one("SELECT image FROM User WHERE id = ?", [id]);
    });

    if (!user || !user.image) {
      return new NextResponse(defaultSvg, {
        status: 200,
        headers: {
          "Content-Type": "image/svg+xml",
          "Cache-Control": "public, max-age=604800, s-maxage=2592000"
        }
      });
    }

    const imageStr = user.image.trim();

    if (imageStr.includes(`/api/user/${id}/avatar`)) {
      return new NextResponse(defaultSvg, {
        status: 200,
        headers: {
          "Content-Type": "image/svg+xml",
          "Cache-Control": "public, max-age=604800, s-maxage=2592000"
        }
      });
    }

    if (imageStr.startsWith("http://") || imageStr.startsWith("https://")) {
      return NextResponse.redirect(imageStr, {
        status: 307,
        headers: {
          "Cache-Control": "public, max-age=604800, s-maxage=2592000"
        }
      });
    }

    if (imageStr.startsWith("/")) {
      const baseUrl = req.url ? new URL(req.url).origin : "https://system.vsbojarlogistic.pl";
      return NextResponse.redirect(new URL(imageStr, baseUrl), {
        status: 307,
        headers: {
          "Cache-Control": "public, max-age=604800, s-maxage=2592000"
        }
      });
    }

    if (imageStr.startsWith("data:")) {
      const matches = imageStr.match(/^data:([^;]+);base64,(.+)$/);
      if (matches && matches.length === 3) {
        const contentType = matches[1];
        const base64Data = matches[2];
        const buffer = Buffer.from(base64Data, "base64");

        // Cache in memory
        if (memoryAvatarCache.size < 100) {
          memoryAvatarCache.set(id, { buffer, contentType });
        }

        return new NextResponse(buffer, {
          status: 200,
          headers: {
            "Content-Type": contentType,
            "Cache-Control": "public, max-age=604800, s-maxage=2592000, stale-while-revalidate=2592000"
          }
        });
      }
    }

    return new NextResponse(defaultSvg, {
      status: 200,
      headers: {
        "Content-Type": "image/svg+xml",
        "Cache-Control": "public, max-age=604800, s-maxage=2592000"
      }
    });
  } catch (error) {
    console.error("Błąd serwowania awatara:", error);
    return new NextResponse(defaultSvg, {
      status: 200,
      headers: {
        "Content-Type": "image/svg+xml",
        "Cache-Control": "public, max-age=3600"
      }
    });
  }
}
