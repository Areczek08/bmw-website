import { fleetImageManifest } from "./fleetImageManifest.js";

/**
 * Resolves an image URL to its responsive WebP variants.
 * If the image was pre-migrated, returns local Cloudflare Asset URLs with srcSet.
 * If not yet migrated, safely falls back to the original URL.
 */
export function getVehicleImageVariants(imageUrl) {
  if (!imageUrl) return null;

  const entry = fleetImageManifest[imageUrl];
  if (entry) {
    return entry;
  }

  // Fallback for new / external URLs
  return {
    originalUrl: imageUrl,
    hash: null,
    thumbnail: imageUrl,
    medium: imageUrl,
    large: imageUrl,
    srcSet: `${imageUrl} 640w`
  };
}
