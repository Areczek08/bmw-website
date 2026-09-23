import { avatarManifest } from "./avatarManifest.js";

/**
 * Zwraca bezpieczny, lekki adres URL awatara dla obiektu użytkownika.
 * - Jeśli użytkownik nie ma awatara, zwraca `null` (brak zbędnych requestów HTTP do backendu).
 * - Jeśli awatar został wyeksportowany do CDN assets (`/avatars/...`), zwraca bezpośredni URL CDN.
 * - Jeśli awatar jest zewnętrznym URL (http:// lub https://), zwraca ten adres.
 * - W przypadku nieprzemigrowanego Base64 zwraca endpoint cache'owany `/api/user/${user.id}/avatar`.
 */
export function getSafeAvatarUrl(user) {
  if (!user || !user.id) return null;

  // 1. Sprawdź czy awatar istnieje w statycznych assetach CDN
  if (avatarManifest && avatarManifest[user.id]) {
    return avatarManifest[user.id];
  }

  const img = user.image || user.avatarUrl;
  
  // 2. Jeśli brak awatara, zwróć null (frontend renderuje natywny SVG bez zapytania sieciowego)
  if (!img) return null;

  // 3. Bezpośrednie adresy CDN / zewnętrzne URL / ścieżki assetów
  if (img.startsWith("http://") || img.startsWith("https://") || img.startsWith("/avatars/")) {
    return img;
  }

  if (img.startsWith("/")) {
    return img;
  }

  // 4. Kompatybilność wsteczna dla Base64 (fallback)
  return `/api/user/${user.id}/avatar`;
}

/**
 * Przekształca obiekt użytkownika w odpowiedzi API, zastępując pola Base64 lekkimi adresami URL.
 */
export function sanitizeUserForResponse(user) {
  if (!user) return user;
  const safeUrl = getSafeAvatarUrl(user);
  return {
    ...user,
    avatarUrl: safeUrl,
    image: safeUrl
  };
}
