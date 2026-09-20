import { NextResponse } from "next/server";
import { dbOne } from "../../../../../lib/db";

export async function GET(req, { params }) {
  try {
    const { id } = await params;

    if (!id) {
      return new NextResponse("Missing user ID", { status: 400 });
    }

    const user = await dbOne("SELECT image FROM User WHERE id = ?", [id]);

    const defaultSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100" viewBox="0 0 100 100"><circle cx="50" cy="50" r="50" fill="#27272a"/><path d="M50 45 a 15 15 0 1 0 0 -30 a 15 15 0 1 0 0 30 M25 80 c 0 -20 50 -20 50 0" fill="none" stroke="#71717a" stroke-width="5"/></svg>`;

    if (!user || !user.image) {
      return new NextResponse(defaultSvg, {
        status: 200,
        headers: {
          "Content-Type": "image/svg+xml",
          "Cache-Control": "public, max-age=86400, stale-while-revalidate=604800"
        }
      });
    }

    const imageStr = user.image.trim();

    // Prevent self-referencing redirect loops!
    if (imageStr.includes(`/api/user/${id}/avatar`) || imageStr.includes("/api/user/") && imageStr.endsWith("/avatar")) {
      return new NextResponse(defaultSvg, {
        status: 200,
        headers: {
          "Content-Type": "image/svg+xml",
          "Cache-Control": "public, max-age=86400, stale-while-revalidate=604800"
        }
      });
    }

    if (imageStr.startsWith("http://") || imageStr.startsWith("https://")) {
      return NextResponse.redirect(imageStr, {
        status: 307,
        headers: {
          "Cache-Control": "public, max-age=86400, stale-while-revalidate=604800"
        }
      });
    }

    if (imageStr.startsWith("/")) {
      const baseUrl = req.url ? new URL(req.url).origin : "https://system.vsbojarlogistic.pl";
      return NextResponse.redirect(new URL(imageStr, baseUrl), {
        status: 307,
        headers: {
          "Cache-Control": "public, max-age=86400, stale-while-revalidate=604800"
        }
      });
    }

    if (imageStr.startsWith("data:")) {
      const matches = imageStr.match(/^data:([^;]+);base64,(.+)$/);
      if (matches && matches.length === 3) {
        const contentType = matches[1];
        const base64Data = matches[2];
        const buffer = Buffer.from(base64Data, "base64");

        return new NextResponse(buffer, {
          status: 200,
          headers: {
            "Content-Type": contentType,
            "Cache-Control": "public, max-age=86400, stale-while-revalidate=604800"
          }
        });
      }
    }

    try {
      const buffer = Buffer.from(imageStr, "base64");
      return new NextResponse(buffer, {
        status: 200,
        headers: {
          "Content-Type": "image/png",
          "Cache-Control": "public, max-age=86400, stale-while-revalidate=604800"
        }
      });
    } catch {
      return new NextResponse(defaultSvg, {
        status: 200,
        headers: {
          "Content-Type": "image/svg+xml",
          "Cache-Control": "public, max-age=86400, stale-while-revalidate=604800"
        }
      });
    }
  } catch (error) {
    console.error("Błąd serwowania awatara:", error);
    return new NextResponse("Internal Server Error", { status: 500 });
  }
}
