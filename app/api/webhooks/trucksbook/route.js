import { NextResponse } from "next/server";
import { dbOne, dbRun, generateId } from "../../../../lib/db";

const DISCORD_WEBHOOK_URL = "https://discord.com/api/webhooks/1028342826745991238/omJtvvECXjBINcEkR__ZVffaiWZyQnbPNFOPuAsRVr86THGs2XwQw_ZejJOGHuVD0ONy";

export async function POST(request) {
  try {
    const payload = await request.json();
    
    // 1. Zawsze przesyłaj dalej do Discorda (aby nie blokować oryginalnych powiadomień)
    try {
      await fetch(DISCORD_WEBHOOK_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
    } catch (err) {
      console.error("Błąd przekazywania do Discorda:", err);
    }

    // 2. Próba wyciągnięcia danych o trasie (Parser)
    let textToParse = "";
    let driverName = null;

    if (payload.embeds && payload.embeds.length > 0) {
      const embed = payload.embeds[0];
      textToParse = (embed.title || "") + " " + (embed.description || "");
      if (embed.fields) {
        embed.fields.forEach(f => textToParse += ` ${f.name} ${f.value}`);
      }
      
      // W TrucksBook autor embeda to nazwa gracza
      if (embed.author && embed.author.name) {
        driverName = embed.author.name.trim();
      }
    } else if (payload.content) {
      textToParse = payload.content;
    }

    if (!textToParse) {
      return NextResponse.json({ success: true, note: "No text to parse" });
    }

    // Logowanie do konsoli by na Vercelu sprawdzić dokładny format z TrucksBooka
    console.log("TRUCKSBOOK WEBHOOK TEXT:", textToParse);

    // Jeśli driverName nie zostało wyciągnięte z autora, próbujemy regexem
    if (!driverName) {
      const nameMatch = textToParse.match(/\*\*([^*]+)\*\*\s+delivered/i) || textToParse.match(/^([a-zA-Z0-9_.-]+)\s+delivered/i);
      if (nameMatch) driverName = nameMatch[1].trim();
    }

    // 2. Dystans (np. 123 km, 1,234 km) - w polskim formacie np. "[Rzeczywiste] - 474 km" lub "Zaakceptowany dystans 474 km"
    let distance = 0;
    const distanceMatch = textToParse.match(/Zaakceptowany dystans\s*(\d+(?:[,\s]\d+)*)\s*km/i) || 
                          textToParse.match(/Distance:\s*\*\*?(\d+(?:[,\s]\d+)*)\b/i) ||
                          textToParse.match(/-\s*(\d+(?:[,\s]\d+)*)\s*km/i);
    if (distanceMatch) {
      distance = parseInt(distanceMatch[1].replace(/[,\s]/g, ''), 10);
    }

    // 3. Miasta i ładunek (polski / angielski)
    let startCity = "Nieznane";
    let endCity = "Nieznane";
    let cargo = "Nieznany ładunek";

    const cargoMatch = textToParse.match(/Towar:?\s*([^\n]+?)(?=\s+Zaakceptowany|\[|$)/i) || textToParse.match(/delivered\s+\*\*([^*]+)\*\*/i) || textToParse.match(/Towar\s+([^\n]+?)(?:\s+Zaakceptowany|\s+Zysk|$)/i);
    if (cargoMatch) cargo = cargoMatch[1].trim();

    const fromMatch = textToParse.match(/Z\s*(?::[a-z_]+:\s*)?([A-Za-z0-9_\u0100-\uFFFF -]+?)(?=\s*Do|from)/i) || textToParse.match(/from\s+\*\*([^*]+)\*\*/i);
    if (fromMatch) startCity = fromMatch[1].trim();

    const toMatch = textToParse.match(/Do\s*(?::[a-z_]+:\s*)?([A-Za-z0-9_\u0100-\uFFFF -]+?)(?=\s*Detale|Towar|to)/i) || textToParse.match(/to\s+\*\*([^*]+)\*\*/i);
    if (toMatch) endCity = toMatch[1].trim();

    // Jeśli udało się znaleźć jakiegoś kierowcę i sensowny dystans
    if (driverName && distance > 0) {
      const cleanDriverName = driverName.replace(/\[.*?\]|\(.*?\)|BMS\s*\|\s*|BMS\s*-\s*/gi, '').trim();
      const searchNames = [...new Set([driverName, cleanDriverName].filter(Boolean))];

      let user = null;
      for (const nameToTry of searchNames) {
        user = await dbOne(`
          SELECT * FROM User 
          WHERE (trucksBookName IS NOT NULL AND trucksBookName != '' AND (trucksBookName = ? OR LOWER(trucksBookName) = LOWER(?)))
             OR (discordNick IS NOT NULL AND discordNick != '' AND (discordNick = ? OR LOWER(discordNick) = LOWER(?)))
             OR (name IS NOT NULL AND name != '' AND (name = ? OR LOWER(name) = LOWER(?)))
             OR (firstName IS NOT NULL AND firstName != '' AND (firstName = ? OR LOWER(firstName) = LOWER(?)))
          LIMIT 1
        `, [nameToTry, nameToTry, nameToTry, nameToTry, nameToTry, nameToTry, nameToTry, nameToTry]);
        if (user) break;
      }

      if (user) {
        const assignedTruck = await dbOne("SELECT * FROM Truck WHERE assignedDriverId = ?", [user.id]);

        const jobId = generateId();
        await dbRun(
          `INSERT INTO Job 
          (id, userId, startCity, endCity, cargo, distance, status, summaryScreenshot, description, truckId, trailerId, averageFuel, plannedDistance, weight, date, createdAt, updatedAt) 
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW(), NOW(), NOW())`,
          [
            jobId,
            user.id,
            startCity,
            endCity,
            cargo,
            distance,
            "APPROVED",
            "TRUCKSBOOK_AUTO",
            "Trasa automatycznie zaimportowana z TrucksBook.",
            assignedTruck?.id || null,
            assignedTruck?.attachedTrailerId || null,
            0,
            distance,
            0
          ]
        );

        // Aktualizacja kilometrów usera
        await dbRun(
          "UPDATE User SET totalDrivenKm = totalDrivenKm + ?, updatedAt = NOW() WHERE id = ?",
          [distance, user.id]
        );

        // Dodaj przejechane kilometry do przebiegu ciągnika, jeśli przypisany
        if (assignedTruck) {
          const oldMileage = assignedTruck.mileage;
          const newMileage = oldMileage + distance;
          
          let truckUpdateData = { mileage: newMileage };
          
          // 1. ZUŻYCIE OPON (0.10 PLN za 1 km)
          const tireCost = distance * 0.10;
          await dbRun(
            "INSERT INTO ServiceInvoice (id, title, description, amount, status, type, truckId, date) VALUES (?, ?, ?, ?, 'PENDING', 'TIRES', ?, NOW())",
            [
              generateId(),
              `Zużycie opon (Trasa: ${startCity} - ${endCity})`,
              `Dystans: ${distance} km x 0.10 PLN/km. Kierowca: ${user.name}`,
              tireCost,
              assignedTruck.id
            ]
          );

          // 2. SERWIS OKRESOWY (Co 80 000 km)
          const lastService = assignedTruck.lastServiceKm || 0;
          if (newMileage - lastService >= 80000) {
            const nextServiceMark = Math.floor(newMileage / 80000) * 80000;
            truckUpdateData.lastServiceKm = nextServiceMark;
            
            // Losowy koszt z widełek lub zależny od przebiegu
            const serviceCost = newMileage > 200000 ? 15000 : (newMileage > 120000 ? 8000 : 3000);
            
            await dbRun(
              "INSERT INTO ServiceInvoice (id, title, description, amount, status, type, truckId, date) VALUES (?, ?, ?, ?, 'PENDING', 'SERVICE', ?, NOW())",
              [
                generateId(),
                `Serwis Okresowy (${nextServiceMark / 1000}k km)`,
                `Pojazd przekroczył próg interwału serwisowego.`,
                serviceCost,
                assignedTruck.id
              ]
            );
            
            await dbRun(
              "INSERT INTO VehicleHistory (id, truckId, type, description, cost, date, userId) VALUES (?, ?, 'SERVICE', ?, ?, NOW(), ?)",
              [
                generateId(),
                assignedTruck.id,
                `Wykonano wymagany serwis po przekroczeniu ${nextServiceMark / 1000}k km.`,
                serviceCost,
                user.id
              ]
            );
          }

          // 3. AWARIE LOSOWE - WYŁĄCZONE
          // Nie losujemy już żadnych awarii pojazdu w trasie.

          // Aktualizacja ciężarówki ze zliczonymi usterkami i kilometrami oraz lokalizacją
          if (truckUpdateData.lastServiceKm !== undefined) {
            await dbRun(
              "UPDATE Truck SET mileage = ?, location = ?, lastServiceKm = ?, updatedAt = NOW() WHERE id = ?",
              [truckUpdateData.mileage, endCity, truckUpdateData.lastServiceKm, assignedTruck.id]
            );
          } else {
            await dbRun(
              "UPDATE Truck SET mileage = ?, location = ?, updatedAt = NOW() WHERE id = ?",
              [truckUpdateData.mileage, endCity, assignedTruck.id]
            );
          }
          
          // Dodaj kilometry do naczepy
          if (assignedTruck.attachedTrailerId) {
            await dbRun(
              "UPDATE Trailer SET mileage = mileage + ?, updatedAt = NOW() WHERE id = ?",
              [distance, assignedTruck.attachedTrailerId]
            );
          }
        }
        
        console.log(`Zapisano automatyczną trasę z TrucksBook: Kierowca ${driverName}, ${distance} km`);
      } else {
        console.log(`Zignorowano trasę: Nie znaleziono kierowcy o nazwie ${driverName} w bazie BMS.`);
      }
    } else {
       console.log("Nie udało się sparsować odpowiednich danych z powiadomienia (brak nicku lub dystansu).");
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Błąd podczas przetwarzania webhooka TrucksBook:", error);
    // Zwracamy 200, żeby webhook nie próbował w kółko wysyłać tego samego (Trucksbook czasami ponawia błędy)
    return NextResponse.json({ success: false, error: "Internal Server Error" }, { status: 200 });
  }
}
