/**
 * Fleet Media Storage & Upload Abstraction (PHASE 4)
 * Prepares BMS for Cloudflare R2 while preserving Cloudflare Assets CDN
 * for existing static vehicle photos.
 */

const MAX_FLEET_IMAGE_SIZE = 5 * 1024 * 1024; // 5 MB

const ALLOWED_IMAGE_MIMES = new Set([
  "image/jpeg",
  "image/jpg",
  "image/png",
  "image/webp"
]);

/**
 * Validates actual buffer magic bytes to prevent MIME spoofing
 */
export function detectImageMimeFromBuffer(buffer) {
  if (!buffer || buffer.length < 12) return null;

  // JPEG: FF D8 FF
  if (buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) {
    return "image/jpeg";
  }

  // PNG: 89 50 4E 47 0D 0A 1A 0A
  if (
    buffer[0] === 0x89 &&
    buffer[1] === 0x50 &&
    buffer[2] === 0x4e &&
    buffer[3] === 0x47
  ) {
    return "image/png";
  }

  // WebP: RIFF .... WEBP
  if (
    buffer[0] === 0x52 &&
    buffer[1] === 0x49 &&
    buffer[2] === 0x46 &&
    buffer[3] === 0x46 &&
    buffer[8] === 0x57 &&
    buffer[9] === 0x45 &&
    buffer[10] === 0x42 &&
    buffer[11] === 0x50
  ) {
    return "image/webp";
  }

  // GIF: GIF87a or GIF89a
  if (buffer[0] === 0x47 && buffer[1] === 0x49 && buffer[2] === 0x46) {
    return "image/gif";
  }

  return null;
}

/**
 * Validates an uploaded image file or buffer
 */
export function validateFleetImageUpload(buffer, declaredMime = null) {
  if (!buffer || buffer.length === 0) {
    return { valid: false, error: "Brak danych pliku." };
  }

  if (buffer.length > MAX_FLEET_IMAGE_SIZE) {
    return { 
      valid: false, 
      error: `Plik jest za duży (${(buffer.length / (1024 * 1024)).toFixed(1)} MB). Maksymalny rozmiar to 5 MB.` 
    };
  }

  const detectedMime = detectImageMimeFromBuffer(buffer);
  if (!detectedMime || !ALLOWED_IMAGE_MIMES.has(detectedMime)) {
    return { 
      valid: false, 
      error: `Niedozwolony lub uszkodzony format pliku. Wykryto: ${detectedMime || "nieznany"}. Dozwolone: JPEG, PNG, WebP.` 
    };
  }

  return {
    valid: true,
    mime: detectedMime,
    sizeBytes: buffer.length
  };
}

/**
 * Storage interface for vehicle photos
 * Supports Cloudflare R2 bucket binding when configured, with ImgBB fallback.
 */
export async function uploadVehicleImage({ buffer, vehicleId, r2Bucket = null }) {
  const validation = validateFleetImageUpload(buffer);
  if (!validation.valid) {
    throw new Error(validation.error);
  }

  const ext = validation.mime === "image/jpeg" ? "jpg" : validation.mime === "image/png" ? "png" : "webp";

  // 1. If Cloudflare R2 bucket binding is active (env.FLEET_BUCKET)
  if (r2Bucket && typeof r2Bucket.put === "function") {
    const r2Key = `fleet/vehicles/${vehicleId || Date.now()}/original.${ext}`;
    await r2Bucket.put(r2Key, buffer, {
      httpMetadata: {
        contentType: validation.mime,
        cacheControl: "public, max-age=31536000, immutable"
      }
    });

    const publicR2Domain = process.env.NEXT_PUBLIC_R2_DOMAIN || "https://r2.vsbojarlogistic.pl";
    return {
      success: true,
      storage: "r2",
      url: `${publicR2Domain}/${r2Key}`,
      key: r2Key
    };
  }

  // 2. ImgBB fallback if API key is present
  const imgbbKey = process.env.IMGBB_API_KEY;
  if (imgbbKey) {
    try {
      const base64Image = buffer.toString("base64");
      const formData = new FormData();
      formData.append("image", base64Image);

      const res = await fetch(`https://api.imgbb.com/1/upload?key=${imgbbKey}`, {
        method: "POST",
        body: formData
      });

      if (res.ok) {
        const data = await res.json();
        if (data && data.success && data.data?.url) {
          return {
            success: true,
            storage: "imgbb",
            url: data.data.url
          };
        }
      }
    } catch (e) {
      console.warn("[FleetStorage] ImgBB fallback failed:", e.message);
    }
  }

  throw new Error("Brak dostępnego magazynu mediów (R2 ani ImgBB nie są skonfigurowane).");
}
