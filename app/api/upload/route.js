import { NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "../auth/[...nextauth]/route";
import { dbSession, generateId } from "../../../lib/db";
import { validateFleetImageUpload } from "../../../lib/storage/fleetStorage";

export async function POST(req) {
  try {
    const session = await getServerSession(authOptions);
    if (!session || !session.user) {
      return NextResponse.json({ error: "Brak autoryzacji do wgrywania plików." }, { status: 401 });
    }

    const formData = await req.formData();
    const file = formData.get("file");

    if (!file || typeof file === "string") {
      return NextResponse.json({ error: "Brak pliku." }, { status: 400 });
    }

    const bytes = await file.arrayBuffer();
    const buffer = Buffer.from(bytes);

    // 1. Strict MIME and 5MB size validation using magic bytes
    const validation = validateFleetImageUpload(buffer);
    if (!validation.valid) {
      return NextResponse.json({ error: validation.error }, { status: 400 });
    }

    // 2. Storage in MediaAsset table (safe for Cloudflare Workers & MariaDB)
    const assetId = generateId();

    await dbSession(async (db) => {
      await db.run(
        "INSERT INTO MediaAsset (id, mimeType, data, size, createdAt) VALUES (?, ?, ?, ?, NOW())",
        [assetId, validation.mime, buffer, buffer.length]
      );
    });

    const mediaUrl = `/api/media/${assetId}`;

    return NextResponse.json({ 
      success: true, 
      url: mediaUrl,
      id: assetId 
    });

  } catch (error) {
    console.error("Błąd podczas wgrywania pliku:", error);
    return NextResponse.json({ error: "Wystąpił błąd podczas zapisywania pliku." }, { status: 500 });
  }
}
