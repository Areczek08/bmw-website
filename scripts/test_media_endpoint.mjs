import https from "node:https";
import { SignJWT } from "jose";

const NEXTAUTH_SECRET = "VtcBMS2026_9x!2Zq$8pL#1vN@3mK_BojarSystem";
const PROD_URL = "https://system.vsbojarlogistic.pl";

async function createAuthCookie(user) {
  const secretKey = new TextEncoder().encode(NEXTAUTH_SECRET);
  const token = await new SignJWT({
    id: user.id,
    sub: user.id,
    name: user.name,
    email: user.email,
    role: user.role,
    driverStatus: "ACTIVE",
    companyId: "BMS"
  })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("2h")
    .sign(secretKey);

  return `__Secure-next-auth.session-token=${token}; next-auth.session-token=${token}`;
}

function request(path, options = {}) {
  return new Promise((resolve, reject) => {
    const url = new URL(path, PROD_URL);
    const headers = {
      "User-Agent": "BMS-MediaVerifier/1.0",
      ...(options.headers || {})
    };

    let bodyData = null;
    if (options.body) {
      bodyData = options.body;
      if (!headers["Content-Length"]) {
        headers["Content-Length"] = Buffer.byteLength(bodyData);
      }
    }

    const req = https.request(url, {
      method: options.method || "GET",
      headers
    }, (res) => {
      const chunks = [];
      res.on("data", chunk => chunks.push(chunk));
      res.on("end", () => {
        const rawBody = Buffer.concat(chunks);
        resolve({
          status: res.statusCode,
          headers: res.headers,
          rawBody,
          text: rawBody.toString("utf8")
        });
      });
    });

    req.on("error", reject);
    if (bodyData) req.write(bodyData);
    req.end();
  });
}

async function main() {
  console.log("=== WERYFIKACJA ENDPOINTU /api/media/[id] NA PRODUKCJI ===");
  const cookie = await createAuthCookie({
    id: "cmrysow1h0000v4vsghu5ixmg",
    name: "Administrator Testowy",
    email: "admin@bojar.local",
    role: "OWNER"
  });

  // Valid 1x1 JPEG with proper JFIF header and magic bytes
  const sampleJpgBase64 = "/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAP//////////////////////////////////////////////////////////////////////////////////////wgALCAABAAEBAREA/8QAFBABAAAAAAAAAAAAAAAAAAAAAP/aAAgBAQABPxA=";
  const sampleJpgBuffer = Buffer.from(sampleJpgBase64, "base64");
  console.log(`Próbka JPG: ${sampleJpgBuffer.length} bajtów. Magic bytes: ${sampleJpgBuffer[0].toString(16)} ${sampleJpgBuffer[1].toString(16)} ${sampleJpgBuffer[2].toString(16)}`);

  // A. Upload JPG
  console.log("\n[KROK A] Wysyłanie pliku przez POST /api/upload...");
  const boundary = "----MediaTestBoundary" + Date.now();
  const multipartBody = Buffer.concat([
    Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="sample.jpg"\r\nContent-Type: image/jpeg\r\n\r\n`),
    sampleJpgBuffer,
    Buffer.from(`\r\n--${boundary}--\r\n`)
  ]);

  const resUpload = await request("/api/upload", {
    method: "POST",
    headers: {
      Cookie: cookie,
      "Content-Type": `multipart/form-data; boundary=${boundary}`
    },
    body: multipartBody
  });

  console.log(`Upload status: ${resUpload.status}`);
  console.log(`Upload body: ${resUpload.text}`);
  const uploadJson = JSON.parse(resUpload.text);
  if (!uploadJson.url) throw new Error("Brak URL w odpowiedzi uploadu!");

  const mediaUrl = uploadJson.url;
  const assetId = uploadJson.id;
  console.log(`Wygenerowany URL: ${mediaUrl} (ID: ${assetId})`);

  // B & C & D & E & F: GET /api/media/[id]
  console.log(`\n[KROK B-F] Pobieranie obrazu przez GET ${mediaUrl}...`);
  const resMedia = await request(mediaUrl);

  console.log(`HTTP Status: ${resMedia.status} (Oczekiwano: 200)`);
  console.log(`Content-Type: ${resMedia.headers["content-type"]} (Oczekiwano: image/jpeg)`);
  console.log(`Content-Length nagłówek: ${resMedia.headers["content-length"]}`);
  console.log(`Pobrany rozmiar binarny: ${resMedia.rawBody.length} bajtów (Oczekiwano: ${sampleJpgBuffer.length})`);
  console.log(`Cache-Control: ${resMedia.headers["cache-control"]}`);

  // F. Sprawdzenie nagłówka JPEG (FF D8 FF)
  const isJpg = resMedia.rawBody.length >= 3 &&
    resMedia.rawBody[0] === 0xff &&
    resMedia.rawBody[1] === 0xd8 &&
    resMedia.rawBody[2] === 0xff;
  console.log(`Weryfikacja formatu JPEG (Magic bytes FF D8 FF): ${isJpg ? "POPRAWNA (To jest prawdziwy obraz)" : "BŁĄD"}`);

  if (resMedia.status !== 200 || !isJpg || resMedia.rawBody.length !== sampleJpgBuffer.length) {
    throw new Error("Weryfikacja GET /api/media/[id] nie powiodła się!");
  }

  console.log("\n[SUKCES] GET /api/media/[id] działa w 100% poprawnie na Cloudflare Workers!");
}

main().catch(err => {
  console.error("Błąd testu:", err);
  process.exit(1);
});
