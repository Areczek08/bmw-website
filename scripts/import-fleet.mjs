import fs from 'fs';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function importFleet() {
  const sqlFile = 'C:\\Users\\defin\\Downloads\\flota.sql';
  const content = fs.readFileSync(sqlFile, 'utf8');

  const valuesStart = content.indexOf('VALUES');
  if (valuesStart === -1) return;

  let data = content.substring(valuesStart + 6).trim();
  if (data.endsWith(';')) data = data.slice(0, -1);

  let currentPos = 0;
  let truckCount = 0;
  let trailerCount = 0;
  let errorCount = 0;

  while (currentPos < data.length) {
    if (data[currentPos] === '(') {
      let endPos = -1;
      let inString = false;
      let escaped = false;
      
      for (let j = currentPos + 1; j < data.length; j++) {
        const char = data[j];
        if (char === "'" && !escaped) inString = !inString;
        if (char === "\\" && !escaped) escaped = true; else escaped = false;
        
        if (!inString && char === ')') {
          endPos = j;
          break;
        }
      }

      if (endPos !== -1) {
        const rowContent = data.substring(currentPos + 1, endPos);
        const result = await parseAndInsert(rowContent);
        if (result === 'TRUCK') truckCount++;
        else if (result === 'TRAILER') trailerCount++;
        else if (result === 'ERROR') errorCount++;
        
        currentPos = endPos + 1;
        while (currentPos < data.length && data[currentPos] !== '(') currentPos++;
      } else {
        break;
      }
    } else {
      currentPos++;
    }
  }

  console.log(`\nImport zakończony!`);
  console.log(`Ciągniki/Busy: ${truckCount}`);
  console.log(`Naczepy: ${trailerCount}`);
  console.log(`Błędy: ${errorCount}`);
  
  await prisma.$disconnect();
}

async function parseAndInsert(row) {
  const fields = [];
  let currentField = "";
  let inString = false;
  let escaped = false;

  for (let i = 0; i < row.length; i++) {
    const char = row[i];
    if (char === "'" && !escaped) inString = !inString;
    if (char === "\\" && !escaped) escaped = true; else escaped = false;

    if (char === ',' && !inString) {
      fields.push(currentField.trim());
      currentField = "";
    } else {
      currentField += char;
    }
  }
  fields.push(currentField.trim());

  if (fields.length < 11) return 'SKIP';

  const clean = (s) => s.replace(/^'|'$/g, "").trim();

  const typ = clean(fields[1]);
  const marka = clean(fields[2]);
  const model = clean(fields[3]);
  const nazwa = clean(fields[4]); // fleetNumber
  const moc = parseInt(fields[5]) || 0;
  const przebieg = parseInt(fields[6]) || 0;
  const produkcja = parseInt(fields[7]) || 2020;
  const dostepnosc = fields[8] === '1';
  const prog = parseInt(fields[9]) || 50000;
  const rejestracja = clean(fields[10]); // plate
  const tuning = fields[fields.length - 1] === '1';

  if (!rejestracja || rejestracja === 'REJESTRACJA' || rejestracja === 'NULL') return 'SKIP';

  const status = dostepnosc ? "AVAILABLE" : "MAINTENANCE";

  try {
    if (typ === 'NACZEPA') {
      await prisma.trailer.upsert({
        where: { plate: rejestracja },
        update: {
          brand: marka,
          model: model,
          productionYear: produkcja,
          status: status,
          type: nazwa
        },
        create: {
          brand: marka,
          model: model,
          productionYear: produkcja,
          status: status,
          type: nazwa,
          plate: rejestracja
        }
      });
      return 'TRAILER';
    } else {
      // Sprawdzamy czy fleetNumber już istnieje
      const existing = await prisma.truck.findFirst({
        where: { 
          OR: [
            { plate: rejestracja },
            { fleetNumber: nazwa }
          ]
        }
      });

      if (existing) {
        // Jeśli istnieje, to robimy update po ID
        await prisma.truck.update({
          where: { id: existing.id },
          data: {
            fleetNumber: nazwa,
            plate: rejestracja,
            brand: marka,
            model: model,
            mileage: przebieg,
            serviceLimitKm: prog,
            power: moc,
            productionYear: produkcja,
            tuningAllowed: tuning,
            type: typ === 'BUS' ? 'Bus' : 'Ciągnik',
            status: status
          }
        });
      } else {
        await prisma.truck.create({
          data: {
            fleetNumber: nazwa,
            plate: rejestracja,
            brand: marka,
            model: model,
            mileage: przebieg,
            serviceLimitKm: prog,
            power: moc,
            productionYear: produkcja,
            tuningAllowed: tuning,
            type: typ === 'BUS' ? 'Bus' : 'Ciągnik',
            status: status
          }
        });
      }
      return 'TRUCK';
    }
  } catch (err) {
    console.error(`Błąd przy ${rejestracja} (${nazwa}):`, err.message);
    return 'ERROR';
  }
}

importFleet().catch(console.error);
