import { NextResponse } from "next/server";
import { dbSession } from "../../../../lib/db";

// In-memory cache for media items to minimize DB reads
const mediaMemoryCache = new Map();
const MAX_CACHE_SIZE = 50;

export async function GET(req, { params }) {
  try {
    const { id } = await params;

    if (!id) {
      return new Response("Missing media ID", { status: 400 });
    }

    // 1. Check in-memory cache
    if (mediaMemoryCache.has(id)) {
      const cached = mediaMemoryCache.get(id);
      return new Response(cached.data, {
        status: 200,
        headers: {
          "Content-Type": cached.mimeType,
          "Content-Length": String(cached.data.byteLength),
          "Cache-Control": "public, max-age=31536000, immutable",
          "X-Content-Type-Options": "nosniff"
        }
      });
    }

    // 2. Fetch from MediaAsset table
    const asset = await dbSession(async (db) => {
      return await db.one("SELECT mimeType, data FROM MediaAsset WHERE id = ?", [id]);
    });

    if (!asset || !asset.data) {
      return new Response("Media not found", { status: 404 });
    }

    let binaryData;
    if (asset.data instanceof Uint8Array) {
      binaryData = asset.data;
    } else if (typeof Buffer !== "undefined" && Buffer.isBuffer(asset.data)) {
      binaryData = new Uint8Array(asset.data.buffer, asset.data.byteOffset, asset.data.byteLength);
    } else if (asset.data instanceof ArrayBuffer) {
      binaryData = new Uint8Array(asset.data);
    } else if (typeof asset.data === "object" && asset.data !== null) {
      binaryData = new Uint8Array(Object.values(asset.data));
    } else {
      binaryData = new Uint8Array(Buffer.from(asset.data));
    }

    const mimeType = asset.mimeType || "image/jpeg";

    // Cache in isolate memory
    if (mediaMemoryCache.size >= MAX_CACHE_SIZE) {
      const firstKey = mediaMemoryCache.keys().next().value;
      mediaMemoryCache.delete(firstKey);
    }
    mediaMemoryCache.set(id, { data: binaryData, mimeType });

    return new Response(binaryData, {
      status: 200,
      headers: {
        "Content-Type": mimeType,
        "Content-Length": String(binaryData.byteLength),
        "Cache-Control": "public, max-age=31536000, immutable",
        "X-Content-Type-Options": "nosniff"
      }
    });

  } catch (error) {
    console.error("Błąd serwowania mediów:", error);
    return new Response("Server error", { status: 500 });
  }
}
