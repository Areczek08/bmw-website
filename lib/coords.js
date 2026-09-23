export const CITY_COORDS = {
  "warszawa": [52.2297, 21.0122],
  "warsaw": [52.2297, 21.0122],
  "poznan": [52.4064, 16.9252],
  "poznań": [52.4064, 16.9252],
  "wroclaw": [51.1100, 17.0333],
  "wrocław": [51.1100, 17.0333],
  "krakow": [50.0647, 19.9450],
  "kraków": [50.0647, 19.9450],
  "gdansk": [54.3520, 18.6466],
  "gdańsk": [54.3520, 18.6466],
  "katowice": [50.2649, 19.0238],
  "szczecin": [53.4285, 14.5528],
  "lodz": [51.7592, 19.4560],
  "łódź": [51.7592, 19.4560],
  "lublin": [51.2465, 22.5684],
  "bialystok": [53.1325, 23.1688],
  "białystok": [53.1325, 23.1688],
  "berlin": [52.5200, 13.4050],
  "hamburg": [53.5511, 9.9937],
  "munchen": [48.1351, 11.5820],
  "münchen": [48.1351, 11.5820],
  "frankfurt": [50.1109, 8.6821],
  "dortmund": [51.5136, 7.4653],
  "koln": [50.9375, 6.9603],
  "köln": [50.9375, 6.9603],
  "paris": [48.8566, 2.3522],
  "lyon": [45.7640, 4.8357],
  "amsterdam": [52.3676, 4.9041],
  "rotterdam": [51.9244, 4.4777],
  "praha": [50.0755, 14.4378],
  "prague": [50.0755, 14.4378],
  "brno": [49.1951, 16.6068],
  "vienna": [48.2082, 16.3738],
  "wien": [48.2082, 16.3738],
  "bratislava": [48.1486, 17.1077],
  "budapest": [47.4979, 19.0402],
  "milano": [45.4642, 9.1900],
  "roma": [41.9028, 12.4964],
  "madrid": [40.4168, -3.7038],
  "barcelona": [41.3851, 2.1734],
  "london": [51.5074, -0.1278]
};

const coordsCache = {};

export async function getCoords(city) {
  if (!city) return null;
  const lowerCity = city.toLowerCase().trim();
  if (CITY_COORDS[lowerCity]) {
    return CITY_COORDS[lowerCity];
  }
  if (coordsCache[lowerCity]) {
    return coordsCache[lowerCity];
  }

  // Deterministic fallback coordinates in Central Europe
  let hash = 0;
  for (let i = 0; i < lowerCity.length; i++) {
    hash = lowerCity.charCodeAt(i) + ((hash << 5) - hash);
  }
  const lat = 50.0 + ((Math.abs(hash) % 400) / 100);
  const lon = 10.0 + ((Math.abs(hash >> 3) % 1200) / 100);
  const fallback = [Number(lat.toFixed(4)), Number(lon.toFixed(4))];
  coordsCache[lowerCity] = fallback;
  return fallback;
}
