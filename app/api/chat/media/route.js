import { NextResponse } from "next/server";
import { dbOne } from "../../../../lib/db";

export async function GET(req) {
  try {
    const { searchParams } = new URL(req.url);
    const messageId = searchParams.get("id");
    const type = searchParams.get("type"); // "image" lub "audio"

    if (!messageId || !type) {
      return new NextResponse("Missing message ID or type", { status: 400 });
    }

    const message = await dbOne(`SELECT imageUrl, audioUrl FROM ChatMessage WHERE id = ?`, [messageId]);

    if (!message) {
      return new NextResponse("Message not found", { status: 404 });
    }

    const rawMedia = type === "image" ? message.imageUrl : message.audioUrl;

    if (!rawMedia) {
      return new NextResponse("Media not found for this message", { status: 404 });
    }

    if (rawMedia.startsWith("http://") || rawMedia.startsWith("https://")) {
      return NextResponse.redirect(rawMedia, {
        status: 307,
        headers: {
          "Cache-Control": "public, max-age=604800, stale-while-revalidate=2592000"
        }
      });
    }

    if (rawMedia.startsWith("data:")) {
      const matches = rawMedia.match(/^data:([^;]+);base64,(.+)$/);
      if (matches && matches.length === 3) {
        const contentType = matches[1];
        const base64Data = matches[2];
        const buffer = Buffer.from(base64Data, "base64");

        return new NextResponse(buffer, {
          status: 200,
          headers: {
            "Content-Type": contentType,
            "Cache-Control": "public, max-age=604800, stale-while-revalidate=2592000"
          }
        });
      }
    }

    try {
      const buffer = Buffer.from(rawMedia, "base64");
      const defaultMime = type === "image" ? "image/png" : "audio/webm";
      return new NextResponse(buffer, {
        status: 200,
        headers: {
          "Content-Type": defaultMime,
          "Cache-Control": "public, max-age=604800, stale-while-revalidate=2592000"
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
