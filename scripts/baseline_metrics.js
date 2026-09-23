const mariadb = require('mariadb');

async function measure() {
  const conn = await mariadb.createConnection({
    host: '54.38.50.59',
    port: 3306,
    user: 'www13461_bojarsystemweb',
    password: 'lgeKyRxxxMF6XWKv8ALd',
    database: 'www13461_bojarsystemweb',
    connectTimeout: 5000
  });

  console.log('=== BASELINE SQL METRICS (MARIADB DIRECT) ===');

  // 1. Current /api/map query baseline
  let t0 = performance.now();
  const drivers = await conn.query(`
    SELECT id, name, firstName, discordNick, image
    FROM User
    WHERE role IN ('DRIVER', 'DISPATCHER', 'BOARD', 'OWNER')
      AND driverStatus NOT IN ('WAITING_FOR_APPROVAL', 'INACTIVE')
  `);
  let tMap1 = performance.now() - t0;

  const driverIds = drivers.map(d => d.id);
  const idsStr = driverIds.map(() => '?').join(',');

  t0 = performance.now();
  const jobs = await conn.query(`
    SELECT userId, endCity, date
    FROM Job
    WHERE status = 'APPROVED' AND userId IN (${idsStr})
    ORDER BY date DESC
  `, driverIds);
  let tMap2 = performance.now() - t0;

  t0 = performance.now();
  const trucks = await conn.query(`
    SELECT id, assignedDriverId, brand, model, plate, fuelLevel, mileage, location, attachedTrailerId
    FROM Truck
    WHERE assignedDriverId IN (${idsStr})
  `, driverIds);
  let tMap3 = performance.now() - t0;

  console.log(`[MAP] Query 1 (Drivers): ${tMap1.toFixed(2)}ms, rows: ${drivers.length}`);
  console.log(`[MAP] Query 2 (ALL approved jobs): ${tMap2.toFixed(2)}ms, rows: ${jobs.length} (ENTIRE HISTORY LOADED!)`);
  console.log(`[MAP] Query 3 (Trucks): ${tMap3.toFixed(2)}ms, rows: ${trucks.length}`);

  // Measure size of User.image column for these drivers!
  let totalAvatarBytes = 0;
  let driversWithAvatars = 0;
  for (const d of drivers) {
    if (d.image) {
      totalAvatarBytes += d.image.length;
      driversWithAvatars++;
    }
  }
  console.log(`[MAP] Driver avatar payload in User table: ${driversWithAvatars}/${drivers.length} drivers, total size: ${(totalAvatarBytes / 1024).toFixed(1)} KB`);

  // 2. Current /api/chat query baseline
  t0 = performance.now();
  const messages = await conn.query(`
    SELECT m.*, 
           u.id as 'u_id', u.name as 'u_name', u.firstName as 'u_firstName', 
           u.image as 'u_image', u.role as 'u_role', u.rank as 'u_rank', u.lastOnline as 'u_lastOnline'
    FROM ChatMessage m
    LEFT JOIN User u ON m.userId = u.id
    ORDER BY m.createdAt DESC
    LIMIT 50
  `);
  let tChat = performance.now() - t0;
  let chatBytes = JSON.stringify(messages).length;
  console.log(`[CHAT] Messages Query (SELECT m.*): ${tChat.toFixed(2)}ms, rows: ${messages.length}, JSON size: ${(chatBytes / 1024).toFixed(1)} KB`);

  // Check how many have heavy imageUrl / audioUrl
  let mediaMessages = messages.filter(m => m.imageUrl || m.audioUrl);
  console.log(`[CHAT] Messages with media: ${mediaMessages.length}/${messages.length}`);

  // 3. Current /api/finance query baseline
  t0 = performance.now();
  const company = await conn.query("SELECT * FROM Company WHERE id = 'BMS'");
  const last7DaysJobs = await conn.query(
    "SELECT date, distance FROM Job WHERE status = 'APPROVED' AND date >= DATE_SUB(NOW(), INTERVAL 7 DAY) AND userId IN (SELECT id FROM User WHERE companyId = 'BMS')"
  );
  const prev14DaysJobs = await conn.query(
    "SELECT COALESCE(SUM(distance), 0) as totalDistance FROM Job WHERE status = 'APPROVED' AND date >= DATE_SUB(NOW(), INTERVAL 14 DAY) AND date < DATE_SUB(NOW(), INTERVAL 7 DAY) AND userId IN (SELECT id FROM User WHERE companyId = 'BMS')"
  );
  let tFinance = performance.now() - t0;
  console.log(`[FINANCE] Total query time: ${tFinance.toFixed(2)}ms (3 queries in series)`);

  // 4. Current /api/public/flota query baseline
  t0 = performance.now();
  const rawTrucks = await conn.query(
    "SELECT id, brand, model, plate, fleetNumber, power, mileage, status, fuelLevel, type, imageUrl, assignedDriverId, attachedTrailerId, location, productionYear FROM Truck ORDER BY fleetNumber ASC, plate ASC"
  );
  let tFlota = performance.now() - t0;
  console.log(`[FLOTA] Trucks count: ${rawTrucks.length}, query time: ${tFlota.toFixed(2)}ms`);

  await conn.end();
}

measure().catch(console.error);
