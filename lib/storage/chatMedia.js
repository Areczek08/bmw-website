/**
 * Chat media storage & validation utility
 * Prepares BMS for full R2/CDN integration in Phase 4 while maintaining
 * strict size limits, MIME validation, and lightweight payload handling.
 */

const MAX_MEDIA_SIZE_BYTES = 5 * 1024 * 1024; // 5 MB
const MAX_BASE64_LENGTH = Math.ceil(MAX_MEDIA_SIZE_BYTES * 1.37); // Base64 encoding overhead ~33-37%

const ALLOWED_IMAGE_MIMES = new Set([
  "image/jpeg",
  "image/jpg",
  "image/png",
  "image/gif",
  "image/webp"
]);

const ALLOWED_AUDIO_MIMES = new Set([
  "audio/webm",
  "audio/ogg",
  "audio/mp4",
  "audio/mpeg",
  "audio/wav",
  "audio/x-m4a"
]);

/**
 * Validates a base64 or URL media string
 */
export function validateMediaItem(mediaString, type = "image") {
  if (!mediaString) return { valid: true };

  // If it's already an external URL
  if (mediaString.startsWith("http://") || mediaString.startsWith("https://") || mediaString.startsWith("/")) {
    return { valid: true, isUrl: true, url: mediaString };
  }

  // Base64 Data URI
  if (mediaString.startsWith("data:")) {
    const match = mediaString.match(/^data:([^;]+);base64,(.+)$/);
    if (!match) {
      return { valid: false, error: "Nieprawidłowy format danych multimedialnych." };
    }

    const mime = match[1].toLowerCase();
    const base64Data = match[2];

    const allowedMimes = type === "image" ? ALLOWED_IMAGE_MIMES : ALLOWED_AUDIO_MIMES;
    if (!allowedMimes.has(mime)) {
      return { 
        valid: false, 
        error: `Niedozwolony format ${type === "image" ? "obrazu" : "audio"}: ${mime}. Dozwolone: ${Array.from(allowedMimes).join(", ")}` 
      };
    }

    // Estimate byte size from Base64
    const approxBytes = Math.floor((base64Data.length * 3) / 4);
    if (approxBytes > MAX_MEDIA_SIZE_BYTES) {
      return { 
        valid: false, 
        error: `Plik ${type === "image" ? "obrazu" : "audio"} jest za duży (${(approxBytes / (1024 * 1024)).toFixed(1)} MB). Maksymalny rozmiar to 5 MB.` 
      };
    }

    return { 
      valid: true, 
      isBase64: true, 
      mime, 
      sizeBytes: approxBytes,
      data: base64Data 
    };
  }

  // Raw base64 string without data prefix
  if (mediaString.length > MAX_BASE64_LENGTH) {
    return { valid: false, error: "Plik przekracza dozwolony limit 5 MB." };
  }

  return { valid: true, isRawBase64: true };
}

/**
 * Uploads image to ImgBB if key is available, or returns payload
 */
export async function optimizeIncomingMedia({ imageUrl, audioUrl }) {
  let processedImageUrl = imageUrl;
  let processedAudioUrl = audioUrl;

  // Validate image
  if (imageUrl) {
    const imgValidation = validateMediaItem(imageUrl, "image");
    if (!imgValidation.valid) {
      throw new Error(imgValidation.error);
    }

    // Attempt ImgBB upload if it's base64 and IMGBB_API_KEY is present
    const imgbbKey = process.env.IMGBB_API_KEY;
    if (imgbbKey && imgValidation.isBase64) {
      try {
        const formData = new FormData();
        formData.append("image", imgValidation.data);
        
        const res = await fetch(`https://api.imgbb.com/1/upload?key=${imgbbKey}`, {
          method: "POST",
          body: formData,
        });

        if (res.ok) {
          const data = await res.json();
          if (data && data.success && data.data?.url) {
            processedImageUrl = data.data.url;
          }
        }
      } catch (err) {
        console.warn("[MediaStorage] ImgBB upload fallback to direct storage:", err.message);
      }
    }
  }

  // Validate audio
  if (audioUrl) {
    const audValidation = validateMediaItem(audioUrl, "audio");
    if (!audValidation.valid) {
      throw new Error(audValidation.error);
    }
  }

  return {
    imageUrl: processedImageUrl,
    audioUrl: processedAudioUrl
  };
}
